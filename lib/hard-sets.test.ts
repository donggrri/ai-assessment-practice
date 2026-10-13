import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { buildLivePaper, formatTimer } from "./live-exam";
import { loadProblemSets, resetProblemSetCache } from "./problem-sets";
import type { ProblemSet } from "./types";

type Person = {
  id: string;
  name: string;
  group: string;
  role: string;
  status: string;
  effective: string;
};

type Fact = {
  id: string;
  name: string;
  group: string;
  date: string;
  kind: string;
  amount: number;
  memo: string;
};

type Fix = {
  action: string;
  id: string;
  date: string;
  kind: string;
  amount: number;
  next: number;
};

type Plan = { base: number; price: number; rollover: number; allowed: Set<string> };

type ScoreOpts = {
  home?: boolean;
  dedupe?: boolean;
  fixes?: boolean;
  listed?: boolean;
  ignoreRollover?: boolean;
};

const HARD_IDS = [
  "seorim-gpu-audit",
  "dalbit-warehouse-audit",
  "byeol-training-audit",
  "pureun-inspect-audit",
] as const;

function section(content: string, start: string, end: string): string {
  const from = content.indexOf(start);
  const to = content.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, start);
  return content.slice(from + start.length, to).trim();
}

function maybeSection(content: string, start: string, end: string): string | null {
  const from = content.indexOf(start);
  if (from < 0) return null;
  const to = content.indexOf(end, from + start.length);
  assert.ok(to > from, end);
  return content.slice(from + start.length, to).trim();
}

function pipeTable(block: string): string[][] {
  return block
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => line.split("|"));
}

function headerIndex(header: string[], name: string): number {
  const index = header.indexOf(name);
  assert.ok(index >= 0, name);
  return index;
}

function peopleFrom(content: string): Map<string, Person> {
  const rows = pipeTable(section(content, "===ROSTER===", "===END ROSTER==="));
  const header = rows[0];
  const idAt = 0;
  const nameAt = 1;
  const groupAt = headerIndex(header, header.includes("팀") ? "팀" : header.includes("창고") ? "창고" : header.includes("부서") ? "부서" : "사업장");
  const roleAt = header.includes("직책") ? headerIndex(header, "직책") : -1;
  const statusAt = headerIndex(header, "상태");
  const effectiveAt = headerIndex(header, "발효일");
  const people = new Map<string, Person>();
  for (const cells of rows.slice(1)) {
    const person: Person = {
      id: cells[idAt],
      name: cells[nameAt],
      group: cells[groupAt],
      role: roleAt >= 0 ? cells[roleAt] : "",
      status: cells[statusAt],
      effective: cells[effectiveAt],
    };
    assert.ok(!people.has(person.id), person.id);
    people.set(person.id, person);
  }
  return people;
}

function factsFrom(block: string): Fact[] {
  const rows = pipeTable(block);
  return rows.slice(1).map((cells) => ({
    id: cells[0],
    name: cells[1],
    group: cells[2],
    date: cells[3],
    kind: cells[4],
    amount: Number(cells[5]),
    memo: cells[6],
  }));
}

function fixesFrom(content: string): Fix[] {
  const block = maybeSection(content, "===FIXES===", "===END FIXES===");
  if (!block) return [];
  const rows = pipeTable(block);
  return rows.slice(1).map((cells) => ({
    action: cells[0],
    id: cells[1],
    date: cells[2],
    kind: cells[3],
    amount: Number(cells[4]),
    next: Number(cells[5]),
  }));
}

function field(content: string, label: string): string {
  const line = content.split("\n").find((item) => item.startsWith(`${label} `));
  assert.ok(line, label);
  return line.slice(label.length + 1).trim();
}

function codeOf(content: string, label: string): string {
  const match = content.match(new RegExp(`${label} ([A-Z]\\d+)`));
  assert.ok(match, label);
  return match[1];
}

function periodOf(policy: string): { start: string; end: string; days: number; fallback: string; unit: number } {
  const match = policy.match(/기간 (\d{4}-\d{2}-\d{2}) (\d{4}-\d{2}-\d{2})/);
  const days = policy.match(/일수 (\d+)/);
  const fallback = policy.match(/발효일 이전은 (\S+?)(?:으로|로) 본다/);
  const unit = policy.match(/단가 (\d+)/);
  assert.ok(match && days && fallback);
  return {
    start: match[1],
    end: match[2],
    days: Number(days[1]),
    fallback: fallback[1],
    unit: unit ? Number(unit[1]) : 0,
  };
}

function statusOn(person: Person, day: string, start: string, end: string, fallback: string, listed: boolean): string {
  if (listed) return person.status;
  if (person.effective <= start) return person.status;
  if (person.effective > end) return fallback;
  if (day < person.effective) return fallback;
  return person.status;
}

function prepare(
  facts: Fact[],
  fixes: Fix[],
  people: Map<string, Person>,
  code: string,
  start: string,
  end: string,
  opts: ScoreOpts,
): Array<[Fact, Person]> {
  const last = new Map<string, number>();
  facts.forEach((fact, index) => {
    last.set(`${fact.id}|${fact.date}|${fact.kind}|${fact.amount}`, index);
  });
  const deduped = opts.dedupe === false ? facts : facts.filter((fact, index) => last.get(`${fact.id}|${fact.date}|${fact.kind}|${fact.amount}`) === index);
  const kept: Fact[] = [];
  for (const fact of deduped) {
    let amount = fact.amount;
    let skip = false;
    if (opts.fixes !== false) {
      for (const fix of fixes) {
        if (fix.id === fact.id && fix.date === fact.date && fix.kind === fact.kind && fix.amount === amount) {
          if (fix.action === "취소") {
            skip = true;
            break;
          }
          if (fix.action === "정정") {
            amount = fix.next;
            break;
          }
        }
      }
    }
    if (!skip) kept.push({ ...fact, amount });
  }
  const ready: Array<[Fact, Person]> = [];
  for (const fact of kept) {
    if (fact.date < start || fact.date > end) continue;
    const person = people.get(fact.id);
    if (!person || (opts.home !== false && person.group !== code)) continue;
    ready.push([fact, person]);
  }
  return ready;
}

function joinCodes(codes: string[]): string {
  return [...new Set(codes)].sort().join(",");
}

function plansFrom(policy: string): Map<string, Plan> {
  const rows = pipeTable(section(policy, "===PLANS===", "===END PLANS==="));
  assert.deepEqual(rows[0], ["코드", "이름", "월기본", "초과단가", "이월한도", "허용기능"]);
  const plans = new Map<string, Plan>();
  for (const cells of rows.slice(1)) {
    plans.set(cells[0], {
      base: Number(cells[2]),
      price: Number(cells[3]),
      rollover: Number(cells[4]),
      allowed: new Set(cells[5] === "-" ? [] : cells[5].split(",").filter((item) => item !== "")),
    });
  }
  return plans;
}

function scoreGpu(set: ProblemSet, opts: ScoreOpts = {}): Record<string, string> {
  const policy = set.files[0].content;
  const { start, end, days, fallback } = periodOf(policy);
  assert.equal(fallback, "재직");
  const plans = plansFrom(policy);
  const people = peopleFrom(set.files[1].content);
  const over: string[] = [];
  const forbidden: string[] = [];
  let resign = 0;
  let fee = 0;
  for (const file of set.files.slice(2)) {
    const code = codeOf(file.content, "팀코드");
    const planCode = field(file.content, "월초플랜");
    const carry = Number(field(file.content, "이월"));
    const changeBlock = maybeSection(file.content, "===PLANCHANGE===", "===END PLANCHANGE===");
    const change = changeBlock ? pipeTable(changeBlock)[1] : null;
    const ready = prepare(factsFrom(section(file.content, "===USAGE===", "===END USAGE===")), fixesFrom(file.content), people, code, start, end, opts);
    let bill = 0;
    for (const [fact, person] of ready) {
      const state = statusOn(person, fact.date, start, end, fallback, opts.listed === true);
      if (state === "퇴사") resign += 1;
      if (state !== "재직") continue;
      bill += fact.amount;
      const active = change && fact.date >= change[0] ? plans.get(change[2]) : plans.get(planCode);
      assert.ok(active);
      if (!active.allowed.has(fact.kind)) forbidden.push(person.id);
    }
    const startPlan = plans.get(planCode);
    assert.ok(startPlan);
    const carried = opts.ignoreRollover ? carry : Math.min(carry, startPlan.rollover);
    let allow = startPlan.base + carried;
    let price = startPlan.price;
    if (change) {
      const next = plans.get(change[2]);
      assert.ok(next);
      const before = Number(change[0].slice(8, 10)) - 1;
      const after = days - before;
      allow = Math.floor((startPlan.base * before) / days) + Math.floor((next.base * after) / days) + carried;
      price = next.price;
    }
    if (bill > allow) {
      over.push(code);
      fee += (bill - allow) * price;
    }
  }
  return { q1: joinCodes(over), q2: joinCodes(forbidden), q3: String(resign), q4: String(fee) };
}

function scoreWarehouse(set: ProblemSet, opts: ScoreOpts = {}): Record<string, string> {
  const { start, end, fallback } = periodOf(set.files[0].content);
  assert.equal(fallback, "판매중");
  const people = peopleFrom(set.files[1].content);
  const shortSites: string[] = [];
  const stopped: string[] = [];
  let recall = 0;
  let shortage = 0;
  for (const file of set.files.slice(2)) {
    const code = codeOf(file.content, "창고코드");
    const opening = Number(field(file.content, "기초"));
    const ready = prepare(factsFrom(section(file.content, "===SLIPS===", "===END SLIPS===")), fixesFrom(file.content), people, code, start, end, opts);
    let inbound = 0;
    let outbound = 0;
    for (const [fact, person] of ready) {
      const state = statusOn(person, fact.date, start, end, fallback, opts.listed === true);
      if (state === "판매중") {
        if (fact.kind === "입고") inbound += fact.amount;
        else if (fact.kind === "출고") outbound += fact.amount;
      } else if (state === "단종" && fact.kind === "출고") stopped.push(person.id);
      else if (state === "회수" && fact.kind === "출고") recall += 1;
    }
    const ending = opening + inbound - outbound;
    if (ending < 0) {
      shortSites.push(code);
      shortage += -ending;
    }
  }
  return { q1: joinCodes(shortSites), q2: joinCodes(stopped), q3: String(recall), q4: String(shortage) };
}

const HR_NEED: Record<string, { minutes: number; states: Set<string> }> = {
  ETH: { minutes: 40, states: new Set(["수습"]) },
  SEC: { minutes: 60, states: new Set(["재직", "수습"]) },
  SAF: { minutes: 30, states: new Set(["수습"]) },
};

function scoreHr(set: ProblemSet, opts: ScoreOpts = {}): Record<string, string> {
  const { start, end, fallback } = periodOf(set.files[0].content);
  assert.equal(fallback, "재직");
  const people = peopleFrom(set.files[1].content);
  const minutes = new Map<string, number>();
  let resign = 0;
  for (const file of set.files.slice(2)) {
    const code = codeOf(file.content, "부서코드");
    for (const [fact, person] of prepare(factsFrom(section(file.content, "===COURSES===", "===END COURSES===")), fixesFrom(file.content), people, code, start, end, opts)) {
      const state = statusOn(person, fact.date, start, end, fallback, opts.listed === true);
      if (state === "퇴사") resign += 1;
      if (state !== "재직" && state !== "수습") continue;
      const key = `${person.id}|${fact.kind}`;
      minutes.set(key, (minutes.get(key) ?? 0) + fact.amount);
    }
  }
  const incomplete: string[] = [];
  const forbidden: string[] = [];
  let shortfall = 0;
  for (const person of people.values()) {
    const endState = statusOn(person, end, start, end, fallback, opts.listed === true);
    if ((minutes.get(`${person.id}|LDR`) ?? 0) > 0 && person.role !== "팀장") forbidden.push(person.id);
    if (endState !== "재직" && endState !== "수습") continue;
    let gap = 0;
    for (const [code, rule] of Object.entries(HR_NEED)) {
      if (rule.states.has(endState)) gap += Math.max(0, rule.minutes - (minutes.get(`${person.id}|${code}`) ?? 0));
    }
    if (person.role === "팀장") gap += Math.max(0, 20 - (minutes.get(`${person.id}|LDR`) ?? 0));
    if (gap > 0) {
      incomplete.push(person.id);
      shortfall += gap;
    }
  }
  return { q1: joinCodes(incomplete), q2: joinCodes(forbidden), q3: String(resign), q4: String(shortfall) };
}

function scoreEquip(set: ProblemSet, opts: ScoreOpts = {}): Record<string, string> {
  const policy = periodOf(set.files[0].content);
  assert.equal(policy.fallback, "가동");
  assert.equal(policy.unit, 8000);
  const people = peopleFrom(set.files[1].content);
  const badSites: string[] = [];
  const onlyBad: string[] = [];
  const perAsset = new Map<string, [number, number]>();
  let retired = 0;
  let defects = 0;
  for (const file of set.files.slice(2)) {
    const code = codeOf(file.content, "사업장코드");
    let bad = 0;
    let good = 0;
    for (const [fact, person] of prepare(factsFrom(section(file.content, "===CHECKS===", "===END CHECKS===")), fixesFrom(file.content), people, code, policy.start, policy.end, opts)) {
      const state = statusOn(person, fact.date, policy.start, policy.end, policy.fallback, opts.listed === true);
      if (state === "폐기") retired += 1;
      if (state !== "가동") continue;
      if (fact.kind === "불량") {
        bad += fact.amount;
        defects += fact.amount;
        const slot = perAsset.get(person.id) ?? [0, 0];
        slot[0] += fact.amount;
        perAsset.set(person.id, slot);
      } else if (fact.kind === "양호") {
        good += 1;
        const slot = perAsset.get(person.id) ?? [0, 0];
        slot[1] += 1;
        perAsset.set(person.id, slot);
      }
    }
    if (bad > good) badSites.push(code);
  }
  for (const [id, [bad, good]] of perAsset) {
    if (bad > 0 && good === 0) onlyBad.push(id);
  }
  return { q1: joinCodes(badSites), q2: joinCodes(onlyBad), q3: String(retired), q4: String(defects * policy.unit) };
}

const SCORERS: Record<(typeof HARD_IDS)[number], (set: ProblemSet, opts?: ScoreOpts) => Record<string, string>> = {
  "seorim-gpu-audit": scoreGpu,
  "dalbit-warehouse-audit": scoreWarehouse,
  "byeol-training-audit": scoreHr,
  "pureun-inspect-audit": scoreEquip,
};

function storedAnswers(set: ProblemSet): Record<string, string> {
  return Object.fromEntries(set.questions.map((question) => [question.id, question.answer]));
}

function assertShape(set: ProblemSet): void {
  assert.equal(set.difficulty, "어려움");
  assert.equal(set.timeLimitMin, 25);
  assert.equal(set.questions.length, 4);
  assert.equal(set.files.length, 14);
  assert.ok(set.files.some((file) => file.name.includes("/")));
  const total = set.files.reduce((sum, file) => sum + file.content.length, 0);
  const core = set.files[0].content.length + set.files[1].content.length;
  const groups = set.files.slice(2).map((file) => file.content.length).sort((a, b) => a - b);
  assert.ok(total > 35000, String(total));
  assert.ok(core + groups[0] + groups[1] < 20000);
  assert.ok(core + groups[0] + groups[1] + groups[2] + groups[3] > 20000);
  const people = peopleFrom(set.files[1].content);
  assert.equal(people.size, 160);
  const nameCount = new Map<string, number>();
  for (const person of people.values()) nameCount.set(person.name, (nameCount.get(person.name) ?? 0) + 1);
  assert.equal([...nameCount.values()].filter((count) => count === 2).length, 4);
  const policy = set.files[0].content;
  assert.match(policy, /기간 \d{4}-\d{2}-\d{2} \d{4}-\d{2}-\d{2}/);
  assert.match(policy, /일수 \d+/);
  assert.match(policy, /예외가 명시되지 않은 한/);
  assert.match(policy, /표기합계/);
  let printedSum = 0;
  for (const file of set.files) {
    assert.equal(file.kind, "pdf");
    assert.ok(file.media);
    const bytes = readFileSync(path.join(process.cwd(), "public", file.media));
    assert.equal(bytes.subarray(0, 4).toString(), "%PDF");
    if (file === set.files[0] || file === set.files[1]) continue;
    const tableName = file.content.includes("===USAGE===")
      ? "USAGE"
      : file.content.includes("===SLIPS===")
        ? "SLIPS"
        : file.content.includes("===COURSES===")
          ? "COURSES"
          : "CHECKS";
    const facts = factsFrom(section(file.content, `===${tableName}===`, `===END ${tableName}===`));
    const raw = facts.reduce((sum, fact) => sum + fact.amount, 0);
    const printed = Number(field(file.content, "표기합계"));
    assert.equal(printed, raw + 500);
    printedSum += printed;
    assert.ok(facts.some((fact) => fact.memo === "오배정"));
    assert.ok(facts.filter((fact, index) => facts.findIndex((other) => other.id === fact.id && other.date === fact.date && other.kind === fact.kind && other.amount === fact.amount) !== index).length > 0);
  }
  const answers = storedAnswers(set);
  assert.notEqual(String(printedSum), answers.q4);
  for (const question of set.questions) {
    assert.equal(question.type, "short");
    assert.equal(question.answer.includes(" "), false);
    assert.match(question.explanation, /나눠/);
    assert.match(question.explanation, /흔한 실수/);
  }
}

describe("어려움 문제 세트", () => {
  it("네 세트의 정답을 자료에서 다시 계산하면 JSON 정답과 같다", () => {
    resetProblemSetCache();
    for (const id of HARD_IDS) {
      const set = loadProblemSets().find((item) => item.id === id);
      assert.ok(set);
      assertShape(set);
      assert.deepEqual(SCORERS[id](set), storedAnswers(set));
    }
  });

  it("오배정, 중복, 발효일, 표기 규칙을 빼먹으면 정답이 달라진다", () => {
    resetProblemSetCache();
    const loaded = new Map(loadProblemSets().map((set) => [set.id, set]));
    for (const id of HARD_IDS) {
      const set = loaded.get(id);
      assert.ok(set);
      const score = SCORERS[id];
      const answers = storedAnswers(set);
      assert.notEqual(score(set, { home: false }).q4, answers.q4);
      assert.notDeepEqual(score(set, { dedupe: false }), answers);
      assert.notDeepEqual(score(set, { listed: true }), answers);
      assert.notDeepEqual(score(set, { fixes: false }), answers);
    }
    const gpu = loaded.get("seorim-gpu-audit");
    assert.ok(gpu);
    assert.notEqual(scoreGpu(gpu, { ignoreRollover: true }).q4, storedAnswers(gpu).q4);
  });

  it("실전 모드 16문항에 네 세트가 들어가고, 단독 타이머는 25분이다", () => {
    resetProblemSetCache();
    const paper = buildLivePaper(loadProblemSets());
    assert.equal(paper.length, 16);
    for (const id of HARD_IDS) assert.ok(paper.some((item) => item.setId === id));
    assert.equal(formatTimer(25 * 60 * 1000), "25:00");
  });
});
