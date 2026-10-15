import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { loadProblemSets, resetProblemSetCache } from "./problem-sets";
import { toPublicProblemSet } from "./public-problem";
import type { ProblemSet } from "./types";

type Flags = Record<string, boolean>;
type Scorer = (set: ProblemSet, flags?: Flags) => Record<string, string>;
type Row = string[];

const SET_IDS = [
  "hanul-etch-log-audit",
  "cheongsol-budget-audit",
  "daon-overtime-pay",
  "mirae-supplier-penalty",
  "danbi-privacy-masking",
  "nuri-multilingual-inquiry",
] as const;
type SetId = (typeof SET_IDS)[number];

const HARD: SetId[] = ["hanul-etch-log-audit", "cheongsol-budget-audit", "daon-overtime-pay", "mirae-supplier-penalty"];

function on(flags: Flags | undefined, key: string): boolean {
  return flags?.[key] !== false;
}

function fileOf(set: ProblemSet, id: string): string {
  const file = set.files.find((item) => item.id === id);
  assert.ok(file, id);
  return file.content;
}

function filesWith(set: ProblemSet, prefix: string): { id: string; content: string }[] {
  const found = set.files.filter((item) => item.id.startsWith(prefix));
  assert.ok(found.length > 0, prefix);
  return found;
}

function tableOf(content: string, name: string): Row[] {
  const start = `===${name}===`;
  const from = content.indexOf(start);
  assert.ok(from >= 0, start);
  const to = content.indexOf(`===END ${name}===`, from);
  assert.ok(to > from, name);
  const lines = content
    .slice(from + start.length, to)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  return lines.slice(1).map((line) => line.split("|"));
}

function periodOf(policy: string): [string, string] {
  const match = policy.match(/기간 (\d{4}-\d{2}-\d{2}) (\d{4}-\d{2}-\d{2})/);
  assert.ok(match);
  return [match[1], match[2]];
}

function latestBy<T>(rows: T[], keyOf: (row: T) => string, timeOf: (row: T) => string): T[] {
  const best = new Map<string, T>();
  for (const row of rows) {
    const key = keyOf(row);
    const current = best.get(key);
    if (!current || timeOf(row) > timeOf(current)) best.set(key, row);
  }
  return [...best.values()];
}

function joinCodes(values: Iterable<string>): string {
  return [...new Set(values)].sort().join(",");
}

function dayNumber(date: string): number {
  return Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) / 86_400_000;
}

type Rate = { rate: number; unit: number };

function ratesOf(content: string): Map<string, Rate> {
  const map = new Map<string, Rate>();
  for (const [month, currency, rate, unit] of tableOf(content, "FX")) {
    map.set(`${month}|${currency}`, { rate: Number(rate), unit: Number(unit) });
  }
  return map;
}

function toKrw(foreign: number, currency: string, date: string, rates: Map<string, Rate>, convert: boolean): number {
  if (currency === "KRW" || !convert) return foreign;
  const fx = rates.get(`${date.slice(0, 7)}|${currency}`);
  assert.ok(fx, `${date} ${currency}`);
  return Math.floor((foreign * fx.rate) / fx.unit);
}

function scoreEtch(set: ProblemSet, flags?: Flags): Record<string, string> {
  const policy = fileOf(set, "policy");
  const [from, to] = periodOf(policy);
  const limits = new Map<string, { lo: number; hi: number; loss: number }>();
  for (const [group, sensor, lo, hi, , loss] of tableOf(policy, "THRESHOLDS")) {
    limits.set(`${group}|${sensor}`, { lo: Number(lo), hi: Number(hi), loss: Number(loss) });
  }
  const chambers = new Map<string, { group: string; status: string; effective: string }>();
  for (const [id, , , group, status, effective] of tableOf(fileOf(set, "master"), "CHAMBERS")) {
    chambers.set(id, { group, status, effective });
  }
  const perBay = new Map<string, { chamber: string; loss: number }[]>();
  for (const file of filesWith(set, "bay-")) {
    let rows = tableOf(file.content, "READINGS").filter((row) => row[2].slice(0, 10) >= from && row[2].slice(0, 10) <= to);
    if (on(flags, "dedupe")) rows = latestBy(rows, (row) => `${row[0]}|${row[2]}|${row[3]}`, (row) => row[7]);
    const values = rows.map((row) => ({ row, value: Number(row[4]) }));
    if (on(flags, "fixes")) {
      for (const [action, chamber, at, sensor, original, next] of tableOf(file.content, "FIXES")) {
        const index = values.findIndex((item) => item.row[0] === chamber && item.row[2] === at && item.row[3] === sensor && Number(item.row[4]) === Number(original));
        if (index < 0) continue;
        if (action === "취소") values.splice(index, 1);
        else values[index].value = Number(next);
      }
    }
    const hits: { chamber: string; loss: number }[] = [];
    for (const { row, value } of values) {
      const [chamberId, , at, sensor, , unit, lot] = row;
      const chamber = chambers.get(chamberId);
      assert.ok(chamber, chamberId);
      const date = at.slice(0, 10);
      const state = date >= chamber.effective ? chamber.status : "가동";
      if (on(flags, "status") && state !== "가동") continue;
      if (on(flags, "exempt") && lot.startsWith("ENG-")) continue;
      let base = value;
      if (on(flags, "units")) {
        if (unit === "Torr" || unit === "kW") base = value * 1000;
        else if (unit === "K") base = value - 273;
      }
      base = Math.round(base * 1e6) / 1e6;
      const limit = limits.get(`${chamber.group}|${sensor}`);
      assert.ok(limit);
      let abnormal = base < limit.lo || base > limit.hi;
      if (on(flags, "exempt") && chamber.group === "CLN" && sensor === "PRS" && base < limit.lo) abnormal = false;
      if (abnormal) hits.push({ chamber: chamberId, loss: limit.loss });
    }
    perBay.set(file.id, hits);
  }
  const all = [...perBay.values()].flat();
  const sumLoss = (hits: { loss: number }[]) => hits.reduce((sum, hit) => sum + hit.loss, 0);
  return {
    q1: joinCodes([...(perBay.get("bay-b03") ?? []), ...(perBay.get("bay-b06") ?? [])].map((hit) => hit.chamber)),
    q2: String(all.length),
    q3: String(sumLoss(perBay.get("bay-b01") ?? [])),
    q4: String(sumLoss(all)),
  };
}

function scoreBudget(set: ProblemSet, flags?: Flags): Record<string, string> {
  const policy = fileOf(set, "policy");
  const [from, to] = periodOf(policy);
  const limits = new Map(tableOf(policy, "EXPENSE").map((row) => [row[0], Number(row[2])]));
  const projects = new Map(
    tableOf(fileOf(set, "projects"), "PROJECTS").map((row) => [
      row[0],
      { budget: Number(row[3]), status: row[4], effective: row[5], entertain: row[6] },
    ]),
  );
  const rates = ratesOf(fileOf(set, "fx"));
  const totals = new Map<string, number>();
  const violationIds = new Map<string, string[]>();
  let violationSum = 0;
  for (const file of filesWith(set, "proj-")) {
    const code = file.id.slice(5).toUpperCase();
    const project = projects.get(code);
    assert.ok(project, code);
    let rows = tableOf(file.content, "VOUCHERS");
    if (on(flags, "dedupe")) rows = latestBy(rows, (row) => row[0], (row) => row[8]);
    const base = new Map<string, { date: string; cat: string; cur: string; amount: number; evid: string }>();
    for (const row of rows) {
      if (row[1] !== "정상") continue;
      if (on(flags, "period") && (row[3] < from || row[3] > to)) continue;
      base.set(row[0], { date: row[3], cat: row[4], cur: row[5], amount: Number(row[6]), evid: row[7] });
    }
    if (on(flags, "adjust")) {
      const adjustments = rows.filter((row) => row[1] !== "정상").sort((a, b) => (a[8] < b[8] ? -1 : 1));
      for (const row of adjustments) {
        const target = base.get(row[2]);
        if (!target) continue;
        if (row[1] === "취소") base.delete(row[2]);
        else target.amount = Number(row[6]);
      }
    }
    let total = 0;
    const evidence: string[] = [];
    for (const [id, item] of base) {
      const krw = toKrw(item.amount, item.cur, item.date, rates, on(flags, "fx"));
      total += krw;
      const limit = limits.get(item.cat);
      assert.ok(limit !== undefined, item.cat);
      const stopped = on(flags, "status") && item.date >= project.effective && project.status === "중단";
      const noEntertain = item.cat === "ENT" && project.entertain !== "Y";
      const over = krw > limit;
      const missing = item.evid === "없음" && krw >= 50000;
      if (stopped || noEntertain || over || missing) {
        violationSum += krw;
        if (missing) evidence.push(id);
      }
    }
    totals.set(code, total);
    violationIds.set(code, evidence);
  }
  const over = [...projects].filter(([code, project]) => (totals.get(code) ?? 0) > project.budget).map(([code]) => code);
  return {
    q1: joinCodes([...(violationIds.get("P03") ?? []), ...(violationIds.get("P07") ?? [])]),
    q2: String(totals.get("P10")),
    q3: joinCodes(over),
    q4: String(violationSum),
  };
}

function clock(text: string): number {
  const next = text.startsWith("익일");
  const body = next ? text.slice(2) : text;
  return (next ? 1440 : 0) + Number(body.slice(0, 2)) * 60 + Number(body.slice(3, 5));
}

function overlap(a: number, b: number, c: number, d: number): number {
  return Math.max(0, Math.min(b, d) - Math.max(a, c));
}

function scoreOvertime(set: ProblemSet, flags?: Flags): Record<string, string> {
  const policy = fileOf(set, "policy");
  const [from, to] = periodOf(policy);
  const staff = new Map(
    tableOf(fileOf(set, "roster"), "ROSTER").map((row) => [
      row[0],
      { mode: row[3], wage: Number(row[4]), next: row[5] === "-" ? 0 : Number(row[5]), nextFrom: row[6], status: row[7], effective: row[8] },
    ]),
  );
  const holidays = new Set(tableOf(fileOf(set, "calendar"), "CALENDAR").map((row) => row[0]));
  const amends = tableOf(fileOf(set, "amend"), "AMENDS");
  type Day = { id: string; date: string; start: number; end: number; rest: number; out: string };
  let days: Day[] = [];
  for (const file of filesWith(set, "week-")) {
    let rows = tableOf(file.content, "LOGS").filter((row) => row[2] >= from && row[2] <= to);
    if (on(flags, "dedupe")) rows = latestBy(rows, (row) => `${row[0]}|${row[2]}`, (row) => row[6]);
    days.push(...rows.map((row) => ({ id: row[0], date: row[2], start: clock(row[3]), end: clock(row[4]), rest: Number(row[5]), out: row[4] })));
  }
  if (on(flags, "amend")) {
    for (const [action, id, date, original, next] of amends) {
      const index = days.findIndex((day) => day.id === id && day.date === date && day.out === original);
      if (index < 0) continue;
      if (action === "취소") days.splice(index, 1);
      else days[index] = { ...days[index], end: clock(next), out: next };
    }
  }
  days = days.filter((day) => {
    const person = staff.get(day.id);
    assert.ok(person, day.id);
    const state = day.date >= person.effective ? person.status : "재직";
    return !on(flags, "status") || state === "재직";
  });
  const work = (day: Day) => day.end - day.start - day.rest;
  const weekSum = new Map<string, number>();
  let night = 0;
  let holidayW39 = 0;
  const units = new Map<string, number>();
  for (const day of days) {
    const person = staff.get(day.id);
    assert.ok(person);
    const minutes = work(day);
    if (day.date >= "2026-09-14" && day.date <= "2026-09-20" && person.mode !== "재량") {
      weekSum.set(day.id, (weekSum.get(day.id) ?? 0) + minutes);
    }
    const nightMinutes = overlap(day.start, day.end, 1320, 1800) + overlap(day.start, day.end, 0, 360);
    night += nightMinutes;
    const holiday = holidays.has(day.date);
    if (holiday && day.date >= "2026-09-21" && day.date <= "2026-09-27") holidayW39 += minutes;
    let doubled = nightMinutes;
    if (holiday) {
      doubled += Math.min(minutes, 480) * 3 + Math.max(0, minutes - 480) * 4;
    } else if (person.mode !== "재량") {
      doubled += Math.floor(Math.max(0, minutes - 480) / 15) * 15 * 3;
    }
    const wage = on(flags, "newwage") && person.next > 0 && day.date >= person.nextFrom ? person.next : person.wage;
    units.set(day.id, (units.get(day.id) ?? 0) + doubled * wage);
  }
  const pay = [...units.values()].reduce((sum, value) => sum + Math.floor(value / 120), 0);
  return {
    q1: joinCodes([...weekSum].filter(([, minutes]) => minutes > 3120).map(([id]) => id)),
    q2: String(night),
    q3: String(holidayW39),
    q4: String(pay),
  };
}

function scoreSupplier(set: ProblemSet, flags?: Flags): Record<string, string> {
  const policy = fileOf(set, "policy");
  const [from, to] = periodOf(policy);
  const grades = new Map(tableOf(policy, "GRADES").map((row) => [row[0], Number(row[1])]));
  const suppliers = new Map(
    tableOf(fileOf(set, "suppliers"), "SUPPLIERS").map((row) => [
      row[0],
      { currency: row[2], grade: row[3], change: row[4], changeFrom: row[5] },
    ]),
  );
  const rates = ratesOf(fileOf(set, "fx"));
  const capped = new Map<string, string[]>();
  const defect = new Map<string, number>();
  let lateCount = 0;
  let total = 0;
  for (const file of filesWith(set, "sup-")) {
    const code = file.id.slice(4).toUpperCase();
    const supplier = suppliers.get(code);
    assert.ok(supplier, code);
    let rows = tableOf(file.content, "ORDERS").filter((row) => row[1] >= from && row[1] <= to);
    if (on(flags, "dedupe")) rows = latestBy(rows, (row) => row[0], (row) => row[10]);
    const orders = rows.map((row) => ({ ...{ id: row[0], date: row[1], price: Number(row[3]), qty: Number(row[4]), due: row[5], recv: row[6], received: Number(row[7]), defects: Number(row[8]), reason: row[9] } }));
    if (on(flags, "fixes")) {
      for (const [action, id, item, value] of tableOf(file.content, "FIXES")) {
        const index = orders.findIndex((order) => order.id === id);
        if (index < 0) continue;
        if (action === "취소") orders.splice(index, 1);
        else if (item === "입고일") orders[index].recv = value;
        else orders[index].defects = Number(value);
      }
    }
    const hits: string[] = [];
    let defectTotal = 0;
    for (const order of orders) {
      const amount = toKrw(order.price * order.qty, supplier.currency, order.date, rates, true);
      const useChange = on(flags, "grade") && supplier.change !== "-" && order.date >= supplier.changeFrom;
      const rate = grades.get(useChange ? supplier.change : supplier.grade);
      assert.ok(rate !== undefined);
      const days = Math.max(0, dayNumber(order.recv) - dayNumber(order.due));
      let late = Math.floor((amount * rate * days) / 10000);
      const cap = Math.floor(amount / 10);
      if (late > cap && order.reason !== "FM") hits.push(order.id);
      if (on(flags, "cap")) late = Math.min(late, cap);
      if (on(flags, "fm") && order.reason === "FM") late = 0;
      if (late > 0) lateCount += 1;
      let multiple = 0;
      if (order.defects * 100 > order.received * 5) multiple = 2;
      else if (order.defects * 100 > order.received * 2) multiple = 1;
      const penalty = toKrw(order.defects * order.price * multiple, supplier.currency, order.date, rates, true);
      defectTotal += penalty;
      total += late + penalty;
    }
    capped.set(code, hits);
    defect.set(code, defectTotal);
  }
  return {
    q1: joinCodes([...(capped.get("S03") ?? []), ...(capped.get("S06") ?? [])]),
    q2: String(lateCount),
    q3: String(defect.get("S08")),
    q4: String(total),
  };
}

const MASKS: Record<string, (value: string) => boolean> = {
  RRN: (value) => /^\d{6}-\*{7}$/.test(value),
  TEL: (value) => /^\d+-\*+-\d{4}$/.test(value),
  CARD: (value) => /^\d{4}-\*{4}-\*{4}-\d{4}$/.test(value),
  EML: (value) => {
    const local = value.split("@")[0];
    return local.length >= 3 ? new RegExp(`^[^*]{2}\\*{${local.length - 2}}$`).test(local) : /^\*+$/.test(local);
  },
};

function maxKey(counts: Map<string, number>): string {
  const top = Math.max(...counts.values());
  return joinCodes([...counts].filter(([, n]) => n === top).map(([key]) => key));
}

function scorePrivacy(set: ProblemSet, flags?: Flags): Record<string, string> {
  const [from, to] = periodOf(fileOf(set, "policy"));
  const systems = new Map(
    tableOf(fileOf(set, "systems"), "SYSTEMS").map((row) => [row[0], { kind: row[2], start: row[3], end: row[4] }]),
  );
  const perFile = new Map<string, { system: string; item: string }[]>();
  for (const file of filesWith(set, "export-")) {
    let rows = tableOf(file.content, "RECORDS");
    if (on(flags, "dedupe")) rows = latestBy(rows, (row) => row[0], (row) => row[7]);
    const hits: { system: string; item: string }[] = [];
    for (const [, customer, , system, date, item, value] of rows) {
      if (on(flags, "period") && (date < from || date > to)) continue;
      if (on(flags, "test") && customer.startsWith("TEST-")) continue;
      const master = systems.get(system);
      assert.ok(master, system);
      const approved = master.start !== "-" && master.kind !== "외부전송" && date >= master.start && date <= master.end;
      if (on(flags, "approval") && approved) continue;
      const check = MASKS[item];
      assert.ok(check, item);
      if (!check(value)) hits.push({ system, item });
    }
    perFile.set(file.id, hits);
  }
  const count = (items: { system: string; item: string }[], key: "system" | "item") => {
    const counts = new Map<string, number>();
    for (const hit of items) counts.set(hit[key], (counts.get(hit[key]) ?? 0) + 1);
    return counts;
  };
  const all = [...perFile.values()].flat();
  return {
    q1: String((perFile.get("export-e2") ?? []).length + (perFile.get("export-e4") ?? []).length),
    q2: joinCodes([...count(all, "system")].filter(([, n]) => n >= 5).map(([code]) => code)),
    q3: maxKey(count(perFile.get("export-e5") ?? [], "system")),
    q4: maxKey(count(all, "item")),
  };
}

function scoreInquiry(set: ProblemSet, flags?: Flags): Record<string, string> {
  const guide = fileOf(set, "guide");
  const [from, to] = periodOf(guide);
  const keywordRows = tableOf(guide, "KEYWORDS");
  const languages = ["KO", "EN", "JA", "ZH"];
  const categories = keywordRows
    .map((row) => ({ code: row[0], priority: Number(row[1]), words: Object.fromEntries(languages.map((lang, index) => [lang, row[3 + index].split(";")])) }))
    .sort((a, b) => (on(flags, "priority") ? a.priority - b.priority : b.priority - a.priority));
  const customers = new Map(
    tableOf(fileOf(set, "customers"), "CUSTOMERS").map((row) => [row[0], { grade: row[3], effective: row[4] }]),
  );
  const rowsOf = new Map<string, { id: string; customer: string; category: string; vip: boolean }[]>();
  for (const file of filesWith(set, "inq-")) {
    let rows = tableOf(file.content, "INQUIRIES");
    if (on(flags, "dedupe")) rows = latestBy(rows, (row) => row[0], (row) => row[5]);
    const out: { id: string; customer: string; category: string; vip: boolean }[] = [];
    for (const [id, customer, , language, text, received] of rows) {
      const date = received.slice(0, 10);
      if (on(flags, "period") && (date < from || date > to)) continue;
      if (on(flags, "test") && customer.startsWith("TEST-")) continue;
      const haystack = language === "EN" ? text.toLowerCase() : text;
      const hit = categories.find((category) => category.words[language].some((word) => haystack.includes(language === "EN" ? word.toLowerCase() : word)));
      const master = customers.get(customer);
      assert.ok(master || customer.startsWith("TEST-"), customer);
      const grade = !master ? "일반" : on(flags, "grade") ? (date >= master.effective ? master.grade : "일반") : master.grade;
      out.push({ id, customer, category: hit?.code ?? "GEN", vip: grade === "VIP" });
    }
    rowsOf.set(file.id, out);
  }
  const all = [...rowsOf.values()].flat();
  const pick = (ids: string[]) => ids.flatMap((id) => rowsOf.get(id) ?? []);
  return {
    q1: joinCodes(pick(["inq-ko", "inq-ja"]).filter((row) => row.category === "SAF").map((row) => row.id)),
    q2: String(all.filter((row) => row.category === "DLV").length),
    q3: String(all.filter((row) => row.category === "SAF" || ((row.category === "PAY" || row.category === "REF") && row.vip)).length),
    q4: joinCodes((rowsOf.get("inq-en") ?? []).filter((row) => row.category === "PAY").map((row) => row.customer)),
  };
}

const SCORERS: Record<SetId, Scorer> = {
  "hanul-etch-log-audit": scoreEtch,
  "cheongsol-budget-audit": scoreBudget,
  "daon-overtime-pay": scoreOvertime,
  "mirae-supplier-penalty": scoreSupplier,
  "danbi-privacy-masking": scorePrivacy,
  "nuri-multilingual-inquiry": scoreInquiry,
};

const TRAPS: Record<SetId, string[]> = {
  "hanul-etch-log-audit": ["dedupe", "fixes", "status", "units", "exempt"],
  "cheongsol-budget-audit": ["dedupe", "adjust", "fx", "status", "period"],
  "daon-overtime-pay": ["dedupe", "amend", "status", "newwage"],
  "mirae-supplier-penalty": ["dedupe", "fixes", "grade", "cap", "fm"],
  "danbi-privacy-masking": ["dedupe", "approval", "test", "period"],
  "nuri-multilingual-inquiry": ["dedupe", "priority", "grade", "test", "period"],
};

function stored(set: ProblemSet): Record<string, string> {
  return Object.fromEntries(set.questions.map((question) => [question.id, question.answer]));
}

function load(): Map<string, ProblemSet> {
  resetProblemSetCache();
  return new Map(loadProblemSets().map((set) => [set.id, set]));
}

describe("새 연습 세트 6개", () => {
  it("난이도는 어려움 4개와 보통 2개이고 25분 타이머와 문항 4개를 쓴다", () => {
    const sets = load();
    for (const id of SET_IDS) {
      const set = sets.get(id);
      assert.ok(set, id);
      assert.equal(set.timeLimitMin, 25);
      assert.equal(set.questions.length, 4);
      assert.equal(set.difficulty, HARD.includes(id) ? "어려움" : "보통");
    }
    assert.equal(SET_IDS.filter((id) => sets.get(id)?.difficulty === "보통").length, 2);
  });

  it("규정 문서, 기준 마스터, 여러 개의 원천 파일과 실제 PDF가 있고 전체를 붙이면 글자 한도를 넘는다", () => {
    const sets = load();
    for (const id of SET_IDS) {
      const set = sets.get(id);
      assert.ok(set);
      assert.ok(set.files.length >= 6 && set.files.length <= 14, `${id} ${set.files.length}`);
      assert.ok(set.files.some((file) => /규정|조건|가이드/.test(file.name)), id);
      assert.ok(set.files.some((file) => /마스터/.test(file.name)), id);
      const total = set.files.reduce((sum, file) => sum + file.content.length, 0);
      assert.ok(total > 20000, `${id} ${total}`);
      for (const file of set.files) {
        assert.ok(file.media, `${id} ${file.id}`);
        const bytes = readFileSync(path.join(process.cwd(), "public", file.media));
        if (file.kind === "png") assert.deepEqual([...bytes.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
        else assert.equal(bytes.subarray(0, 4).toString(), "%PDF");
      }
    }
    const supplier = sets.get("mirae-supplier-penalty");
    assert.ok(supplier?.files.some((file) => file.kind === "png"));
  });

  it("문제마다 일부 파일만 붙여도 풀리는 한도 안의 조합이 있다", () => {
    const sets = load();
    for (const id of SET_IDS) {
      const set = sets.get(id);
      assert.ok(set);
      const sizes = set.files.map((file) => file.content.length).sort((a, b) => a - b);
      const smallest = sizes.slice(0, 4).reduce((sum, size) => sum + size, 0);
      assert.ok(smallest < 20000, `${id} ${smallest}`);
    }
  });

  it("정답을 원천 텍스트에서 다시 계산하면 JSON 정답과 같다", () => {
    const sets = load();
    for (const id of SET_IDS) {
      const set = sets.get(id);
      assert.ok(set);
      assert.deepEqual(SCORERS[id](set), stored(set), id);
    }
  });

  it("함정 규칙을 하나라도 빼먹으면 정답이 달라진다", () => {
    const sets = load();
    for (const id of SET_IDS) {
      const set = sets.get(id);
      assert.ok(set);
      const answers = stored(set);
      assert.ok(TRAPS[id].length >= 2 && TRAPS[id].length <= 5);
      for (const trap of TRAPS[id]) {
        assert.notDeepEqual(SCORERS[id](set, { [trap]: false }), answers, `${id} ${trap}`);
      }
    }
  });

  it("정답은 공백이 없고 공개용 세트에는 정답과 해설이 없으며 지문과 문항 본문에도 정답이 적혀 있지 않다", () => {
    const sets = load();
    for (const id of SET_IDS) {
      const set = sets.get(id);
      assert.ok(set);
      const publicText = JSON.stringify(toPublicProblemSet(set));
      assert.equal(publicText.includes('"answer"'), false);
      assert.equal(publicText.includes('"explanation"'), false);
      for (const question of set.questions) {
        assert.equal(question.type, "short");
        assert.equal(question.answer.includes(" "), false);
        assert.ok(question.explanation.includes("흔한 실수"));
        assert.ok(question.explanation.includes("필요한 파일"));
        if (question.answer.length > 4) {
          assert.equal(set.passage.includes(question.answer), false, `${id} ${question.id}`);
          assert.equal(question.prompt.includes(question.answer), false, `${id} ${question.id}`);
        }
      }
    }
  });
});
