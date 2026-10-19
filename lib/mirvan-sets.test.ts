import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { loadProblemSets, resetProblemSetCache } from "./problem-sets";
import { toPublicProblemSet } from "./public-problem";
import type { ProblemSet } from "./types";

type Flags = Record<string, boolean>;
type Row = string[];

const SET_IDS = ["mirvan-wafer-yield", "mirvan-alarm-pm"] as const;
type SetId = (typeof SET_IDS)[number];

const YIELD_START = "2026-09-08";
const YIELD_END = "2026-09-21";
const YIELD_Q1_TO = "2026-09-14";
const DEFECT_GROUP: Record<string, string> = { OPN: "OP", OSD: "OP", OVL: "OP", SCR: "SC", CHP: "SC", MET: "MT", MIS: "MT" };
const YIELD_FLOOR_MET = 91.5;

const ALARM_START = "2026-10-01";
const ALARM_END = "2026-10-31";
const MERGE_GAP = 3;
const DOWN_LIMIT = 560;
const RECUR_MIN_H = 24;
const RECUR_MAX_H = 72;
const RECUR_COUNT = 3;

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
  assert.ok(from >= 0, name);
  const to = content.indexOf(`===END ${name}===`, from);
  assert.ok(to > from, name);
  return content
    .slice(from + start.length, to)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .slice(1)
    .map((line) => line.split("|"));
}

function maybeTableOf(content: string, name: string): Row[] {
  const start = `===${name}===`;
  const from = content.indexOf(start);
  if (from < 0) return [];
  const to = content.indexOf(`===END ${name}===`, from);
  if (to <= from) return [];
  return content
    .slice(from + start.length, to)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .slice(1)
    .map((line) => line.split("|"));
}

function joinCodes(values: Iterable<string>): string {
  return [...new Set(values)].sort().join(",");
}

function parseTs(ts: string): number {
  return Date.parse(ts.replace(" ", "T"));
}

function minutesBetween(a: string, b: string): number {
  return Math.max(0, Math.floor((parseTs(b) - parseTs(a)) / 60_000));
}

type YieldRow = {
  lot: string;
  wafer: string;
  equip: string;
  step: string;
  ts: string;
  good: number;
  bad: number;
  unit: string;
  validity: string;
  defect: string;
  submitted: string;
};

type Equip = { id: string; group: string; state: string; effective: string };

function equipState(equip: Equip, day: string): string {
  if (equip.effective <= YIELD_START) return equip.state;
  if (equip.effective > YIELD_END) return "RUN";
  if (day < equip.effective) return "RUN";
  return equip.state;
}

function dieCount(row: YieldRow): [number, number] {
  const scale = row.unit === "K" ? 1000 : 1;
  return [row.good * scale, row.bad * scale];
}

function processYield(set: ProblemSet, flags?: Flags): YieldRow[] {
  const equipment = new Map<string, Equip>();
  for (const [id, , group, state, effective] of tableOf(fileOf(set, "master"), "EQUIP")) {
    equipment.set(id, { id, group, state, effective });
  }
  const kept: YieldRow[] = [];
  for (const file of filesWith(set, "mes-")) {
    let rows: YieldRow[] = tableOf(file.content, "MEAS").map((cells) => ({
      lot: cells[0],
      wafer: cells[1],
      equip: cells[2],
      step: cells[3],
      ts: cells[4],
      good: Number(cells[5]),
      bad: Number(cells[6]),
      unit: cells[7],
      validity: cells[8],
      defect: cells[9],
      submitted: cells[10],
    }));
    if (on(flags, "dedupe")) {
      const best = new Map<string, YieldRow>();
      for (const row of rows) {
        const key = `${row.lot}|${row.wafer}|${row.step}`;
        const current = best.get(key);
        if (!current || row.submitted > current.submitted) best.set(key, row);
      }
      rows = [...best.values()];
    }
    const fixes = maybeTableOf(file.content, "FIXES");
    for (const row of rows) {
      let good = row.good;
      let bad = row.bad;
      let skip = false;
      if (on(flags, "fixes") && fixes.length) {
        for (const [action, lot, wafer, step, ts, field, , newValue] of fixes) {
          if (lot !== row.lot || wafer !== row.wafer || step !== row.step || ts !== row.ts) continue;
          if (action === "취소") {
            skip = true;
            break;
          }
          if (field === "good") good = Number(newValue);
          if (field === "bad") bad = Number(newValue);
        }
      }
      if (skip) continue;
      const unit = on(flags, "unit") ? row.unit : "EA";
      const item: YieldRow = { ...row, good, bad, unit };
      const day = item.ts.slice(0, 10);
      if (on(flags, "period") !== false && (day < YIELD_START || day > YIELD_END)) continue;
      const equip = equipment.get(item.equip);
      if (!equip) continue;
      if (on(flags, "status") && equipState(equip, day) !== "RUN") continue;
      if (on(flags, "rnd") && (item.lot.startsWith("RND-") || item.lot.startsWith("ENG-"))) continue;
      if (item.validity !== "유효") continue;
      kept.push(item);
    }
  }
  return kept;
}

function yieldPct(good: number, bad: number): number {
  const total = good + bad;
  if (total <= 0) return 0;
  return Math.round((good * 10000) / total) / 100;
}

function scoreYield(set: ProblemSet, flags?: Flags): Record<string, string> {
  const rows = processYield(set, flags);
  const equipment = new Map<string, Equip>();
  for (const [id, , group, state, effective] of tableOf(fileOf(set, "master"), "EQUIP")) {
    equipment.set(id, { id, group, state, effective });
  }
  const lotTotals = new Map<string, [number, number]>();
  for (const row of rows) {
    const [g, b] = dieCount(row);
    const slot = lotTotals.get(row.lot) ?? [0, 0];
    lotTotals.set(row.lot, [slot[0] + g, slot[1] + b]);
  }
  const q1Lots = new Set<string>();
  for (const row of rows) {
    const day = row.ts.slice(0, 10);
    if (day < YIELD_START || day > YIELD_Q1_TO) continue;
    if (equipment.get(row.equip)?.group !== "DRY") continue;
    q1Lots.add(row.lot);
  }
  const wetLots = new Set(rows.filter((row) => equipment.get(row.equip)?.group === "WET").map((row) => row.lot));
  const wetValues = [...wetLots].map((lot) => {
    const pair = lotTotals.get(lot) ?? [0, 0];
    return yieldPct(pair[0], pair[1]);
  });
  const q2 = wetValues.length ? (wetValues.reduce((a, b) => a + b, 0) / wetValues.length).toFixed(2) : "0.00";
  const opBad = new Map<string, number>();
  for (const row of rows) {
    if (!DEFECT_GROUP[row.defect] || DEFECT_GROUP[row.defect] !== "OP") continue;
    const [, b] = dieCount(row);
    opBad.set(row.equip, (opBad.get(row.equip) ?? 0) + b);
  }
  const top = Math.max(...opBad.values(), 0);
  const q3 = joinCodes([...opBad].filter(([, n]) => n === top).map(([id]) => id));
  const q4 = joinCodes(
    [...lotTotals]
      .filter(([lot, [g, b]]) => {
        const sample = rows.find((row) => row.lot === lot);
        if (!sample) return false;
        return equipment.get(sample.equip)?.group === "MET" && yieldPct(g, b) < YIELD_FLOOR_MET;
      })
      .map(([lot]) => lot),
  );
  return { q1: String(q1Lots.size), q2, q3, q4 };
}

type Alarm = { lid: string; equip: string; code: string; level: string; start: string; end: string };

function applyAdjust(rows: Alarm[], content: string, apply: boolean): Alarm[] {
  if (!apply) return rows.map((row) => ({ ...row }));
  const out = rows.map((row) => ({ ...row }));
  const byId = new Map(out.map((row) => [row.lid, row]));
  for (const [action, lid, field, , newValue, deadline, requested] of tableOf(content, "ADJ")) {
    if (requested > deadline) continue;
    const row = byId.get(lid);
    if (!row) continue;
    if (action === "취소") {
      const index = out.findIndex((item) => item.lid === lid);
      if (index >= 0) out.splice(index, 1);
      byId.delete(lid);
      continue;
    }
    if (field === "level") row.level = newValue;
    if (field === "end") row.end = newValue;
  }
  return out;
}

function inPm(equip: string, start: string, end: string, pm: Row[]): boolean {
  const s = parseTs(start);
  const e = parseTs(end === "-" ? start : end);
  for (const [pe, ps, peEnd] of pm) {
    if (pe !== equip) continue;
    if (s >= parseTs(ps) && e <= parseTs(peEnd)) return true;
  }
  return false;
}

function mergeAlarms(rows: Alarm[], merge: boolean): Alarm[] {
  if (!merge) return [...rows];
  const sorted = [...rows].sort((a, b) => (a.equip < b.equip ? -1 : a.equip > b.equip ? 1 : a.code < b.code ? -1 : a.code > b.code ? 1 : a.start < b.start ? -1 : 1));
  const merged: Alarm[] = [];
  for (const row of sorted) {
    const prev = merged[merged.length - 1];
    if (prev && prev.equip === row.equip && prev.code === row.code) {
      const gap = minutesBetween(prev.end, row.start);
      if (gap >= 0 && gap <= MERGE_GAP) {
        prev.end = parseTs(prev.end) > parseTs(row.end) ? prev.end : row.end;
        if (prev.level !== "CRI" && row.level === "CRI") prev.level = "CRI";
        continue;
      }
    }
    merged.push({ ...row });
  }
  return merged;
}

function durationMin(row: Alarm): number {
  if (row.level === "MIN") return 0;
  if (!row.end || row.end === "-") return 15;
  const mins = minutesBetween(row.start, row.end);
  return mins > 0 ? mins : 15;
}

function prepareAlarms(set: ProblemSet, flags?: Flags): Alarm[] {
  let rows: Alarm[] = [];
  for (const file of filesWith(set, "log-")) {
    rows.push(
      ...tableOf(file.content, "ALARMS").map((cells) => ({
        lid: cells[0],
        equip: cells[1],
        code: cells[2],
        level: cells[3],
        start: cells[4],
        end: cells[5],
      })),
    );
  }
  rows = applyAdjust(rows, fileOf(set, "adjust"), on(flags, "adj"));
  const pm = tableOf(fileOf(set, "pm"), "PM");
  const kept: Alarm[] = [];
  for (const row of rows) {
    const day = row.start.slice(0, 10);
    if (on(flags, "period") && (day < ALARM_START || day > ALARM_END)) continue;
    if (on(flags, "pm_skip") && inPm(row.equip, row.start, row.end, pm)) continue;
    kept.push(row);
  }
  return mergeAlarms(kept, on(flags, "merge"));
}

function scoreAlarm(set: ProblemSet, flags?: Flags): Record<string, string> {
  const events = prepareAlarms(set, flags);
  const criByEquip = new Map<string, number>();
  for (const row of events) {
    if (row.level !== "CRI") continue;
    criByEquip.set(row.equip, (criByEquip.get(row.equip) ?? 0) + 1);
  }
  const q1 = joinCodes([...criByEquip].filter(([, n]) => n >= 5).map(([id]) => id));
  const q2 = String(events.reduce((sum, row) => sum + durationMin(row), 0));
  const down = new Map<string, number>();
  for (const row of events) {
    if (row.level === "MIN") continue;
    down.set(row.equip, (down.get(row.equip) ?? 0) + durationMin(row));
  }
  const q3 = joinCodes([...down].filter(([, n]) => n > DOWN_LIMIT).map(([id]) => id));
  const cri = events.filter((row) => row.level === "CRI").sort((a, b) => (a.equip < b.equip ? -1 : a.equip > b.equip ? 1 : a.code < b.code ? -1 : a.code > b.code ? 1 : a.start < b.start ? -1 : 1));
  const groups = new Map<string, Alarm[]>();
  for (const row of cri) {
    const key = `${row.equip}|${row.code}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  const codes = new Set<string>();
  for (const [key, items] of groups) {
    if (items.length < RECUR_COUNT) continue;
    let gaps = 0;
    for (let index = 1; index < items.length; index += 1) {
      const gapH = minutesBetween(items[index - 1].end, items[index].start) / 60;
      if (gapH >= RECUR_MIN_H && gapH <= RECUR_MAX_H) gaps += 1;
    }
    if (gaps >= RECUR_COUNT - 1) codes.add(key.split("|")[1]);
  }
  return { q1, q2, q3, q4: joinCodes(codes) };
}

const SCORERS: Record<SetId, (set: ProblemSet, flags?: Flags) => Record<string, string>> = {
  "mirvan-wafer-yield": scoreYield,
  "mirvan-alarm-pm": scoreAlarm,
};

const TRAPS: Record<SetId, string[]> = {
  "mirvan-wafer-yield": ["dedupe", "fixes", "status", "rnd", "period"],
  "mirvan-alarm-pm": ["merge", "pm_skip", "adj", "period"],
};

function stored(set: ProblemSet): Record<string, string> {
  return Object.fromEntries(set.questions.map((question) => [question.id, question.answer]));
}

function load(): Map<string, ProblemSet> {
  resetProblemSetCache();
  return new Map(loadProblemSets().map((set) => [set.id, set]));
}

describe("미르반도체 AI Native 세트 2개", () => {
  it("어려움·25분·4문항이며 카탈로그에 노출된다", () => {
    const sets = load();
    for (const id of SET_IDS) {
      const set = sets.get(id);
      assert.ok(set, id);
      assert.equal(set.difficulty, "어려움");
      assert.equal(set.timeLimitMin, 25);
      assert.equal(set.questions.length, 4);
    }
  });

  it("첨부 PDF·PNG가 있고 측정·알람 행 수가 요구를 만족한다", () => {
    const sets = load();
    const yieldSet = sets.get("mirvan-wafer-yield");
    assert.ok(yieldSet);
    let measRows = 0;
    for (const file of yieldSet.files) {
      assert.ok(file.media, file.id);
      const bytes = readFileSync(path.join(process.cwd(), "public", file.media));
      if (file.kind === "png") assert.deepEqual([...bytes.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
      else assert.equal(bytes.subarray(0, 4).toString(), "%PDF");
      if (file.id.startsWith("mes-")) measRows += tableOf(file.content, "MEAS").length;
    }
    assert.ok(measRows >= 300 && measRows <= 600, String(measRows));
    assert.ok(yieldSet.files.some((f) => f.kind === "png"));

    const alarmSet = sets.get("mirvan-alarm-pm");
    assert.ok(alarmSet);
    let alarmRows = 0;
    for (const file of alarmSet.files) {
      if (file.id.startsWith("log-")) alarmRows += tableOf(file.content, "ALARMS").length;
    }
    assert.ok(alarmRows >= 500, String(alarmRows));
  });

  it("정답을 원천에서 재계산하면 JSON과 같다", () => {
    const sets = load();
    for (const id of SET_IDS) {
      const set = sets.get(id);
      assert.ok(set);
      assert.deepEqual(SCORERS[id](set), stored(set), id);
    }
  });

  it("함정 규칙을 빼면 정답이 달라진다", () => {
    const sets = load();
    for (const id of SET_IDS) {
      const set = sets.get(id);
      assert.ok(set);
      const answers = stored(set);
      for (const trap of TRAPS[id]) {
        assert.notDeepEqual(SCORERS[id](set, { [trap]: false }), answers, `${id} ${trap}`);
      }
    }
  });

  it("공개 세트에 정답·해설이 없고 해설에 모범 프롬프트가 있다", () => {
    const sets = load();
    for (const id of SET_IDS) {
      const set = sets.get(id);
      assert.ok(set);
      const publicText = JSON.stringify(toPublicProblemSet(set));
      assert.equal(publicText.includes('"answer"'), false);
      assert.equal(publicText.includes('"explanation"'), false);
      for (const question of set.questions) {
        assert.equal(question.answer.includes(" "), false);
        assert.match(question.explanation, /모범 프롬프트/);
        assert.match(question.explanation, /흔한 실수/);
      }
    }
  });
});
