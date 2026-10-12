import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { loadProblemSets, parseProblemSet, resetProblemSetCache } from "./problem-sets";
import { toPublicProblemSet } from "./public-problem";
import type { ProblemSet } from "./types";

const DEPTS = new Set(["개발", "디자인", "영업", "인사"]);
const DRINKS = new Set(["아메리카노", "녹차", "보리차", "콜라"]);
const SCORES = new Set(["1", "2", "3", "4", "5"]);

type SurveyRow = {
  employee: string;
  department: string;
  drink: string;
  score: string;
  submitted: string;
};

type Market = "KR" | "EU";
type LimitCap = number | "ban";
type ChildCap = number | "na" | "any";
type Limit = { name: string; kr: LimitCap; eu: LimitCap; child: ChildCap };
type Product = {
  code: string;
  audience: string;
  items: { name: string; amount: number }[];
  claim: string;
  markets: Market[];
  inspector: string;
  result: "Pass" | "Fail";
};

function section(content: string, start: string, end: string): string {
  const from = content.indexOf(start);
  const to = content.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `${start} 구간`);
  return content.slice(from + start.length, to).trim();
}

function joinCodes(codes: string[]): string {
  const sorted = [...codes].sort();
  assert.equal(new Set(sorted).size, sorted.length);
  assert.ok(sorted.length > 0);
  return sorted.join(",");
}

function surveyRows(content: string): SurveyRow[] {
  const lines = section(content, "===RESPONSES===", "===END RESPONSES===")
    .split("\n")
    .filter((line) => line.trim() !== "");
  assert.equal(lines[0], "id,employee,department,drink,score,submitted");
  return lines.slice(1).map((line) => {
    const [id, employee, department, drink, score, submitted] = line.split(",");
    assert.match(id, /^R\d{3}$/);
    assert.ok(submitted);
    return { employee, department, drink, score, submitted };
  });
}

function latestRows(rows: SurveyRow[]): SurveyRow[] {
  const chosen = new Map<string, SurveyRow>();
  for (const row of rows) {
    const current = chosen.get(row.employee);
    if (!current || row.submitted > current.submitted) chosen.set(row.employee, row);
  }
  return [...chosen.values()];
}

function validSurvey(rows: SurveyRow[]): SurveyRow[] {
  return latestRows(rows).filter(
    (row) => DEPTS.has(row.department) && DRINKS.has(row.drink) && SCORES.has(row.score),
  );
}

function surveyKey(rows: SurveyRow[]) {
  const valid = validSurvey(rows);
  const q2 = joinCodes(
    valid
      .filter((row) => row.department === "개발" && row.drink === "아메리카노" && row.score === "5")
      .map((row) => row.employee),
  );
  const q3 = joinCodes(
    valid
      .filter((row) => row.department === "영업" && row.drink !== "콜라" && Number(row.score) >= 4)
      .map((row) => row.employee),
  );
  const byDept = new Map<string, number>();
  let total = 0;
  for (const row of valid) {
    const score = Number(row.score);
    byDept.set(row.department, (byDept.get(row.department) ?? 0) + score);
    total += score;
  }
  assert.equal([...byDept.values()].reduce((sum, value) => sum + value, 0), total);
  return { q1: String(valid.length), q2, q3, q4: String(total), validCount: valid.length, rawCount: rows.length };
}

function parseCap(part: string): LimitCap {
  const value = part.split(":")[1];
  if (value === "금지") return "ban";
  const amount = Number(value);
  assert.ok(Number.isFinite(amount));
  return amount;
}

function parseLimits(content: string): Limit[] {
  return section(content, "===LIMITS===", "===END LIMITS===")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const [name, , kr, eu, extra] = line.split("|");
      let child: ChildCap;
      if (extra === "함량무관") child = "any";
      else if (extra.endsWith(":해당없음")) child = "na";
      else child = Number(extra.split(":")[1]);
      return { name, kr: parseCap(kr), eu: parseCap(eu), child };
    });
}

function parseProducts(files: ProblemSet["files"]): Product[] {
  const products = new Map<string, Product>();
  for (const file of files) {
    if (!file.content.includes("===LABELS===")) continue;
    const body = section(file.content, "===LABELS===", "===END LABELS===");
    for (const line of body.split("\n")) {
      if (!/^[A-Z]+-\d+\|/.test(line)) continue;
      const [code, audience, items, claim, markets] = line.split("|");
      products.set(code, {
        code,
        audience,
        items: items.split(",").map((item) => {
          const [name, raw] = item.split(":");
          return { name, amount: Number(raw) };
        }),
        claim,
        markets: markets.split(",") as Market[],
        inspector: "",
        result: "Fail",
      });
    }
  }
  const auditFile = files.find((file) => file.content.includes("===AUDIT==="));
  assert.ok(auditFile);
  const audit = section(auditFile.content, "===AUDIT===", "===END AUDIT===").split("\n").slice(1);
  for (const line of audit) {
    const [code, inspector, result] = line.split("|");
    const product = products.get(code);
    assert.ok(product);
    assert.ok(result === "Pass" || result === "Fail");
    product.inspector = inspector;
    product.result = result;
  }
  assert.equal(products.size, audit.length);
  return [...products.values()];
}

function limitFail(product: Product, market: Market, limits: Limit[], equalFails = false): boolean {
  const child = product.audience.startsWith("어린이");
  const over = (amount: number, cap: number) => (equalFails ? amount >= cap : amount > cap);
  for (const item of product.items) {
    const limit = limits.find((entry) => entry.name === item.name);
    assert.ok(limit, item.name);
    const childCap = limit.child;
    if (limit.kr === "ban" || limit.eu === "ban" || childCap === "any") return true;
    if (child && typeof childCap === "number" && item.amount !== childCap) return true;
    const cap = market === "KR" ? limit.kr : limit.eu;
    if (typeof cap !== "number") return true;
    if (!(child && typeof childCap === "number") && over(item.amount, cap)) return true;
  }
  return false;
}

function claimBad(claim: string): boolean {
  return ["치료", "예방", "완치"].some((word) => claim.includes(word));
}

function exportFail(product: Product, limits: Limit[], equalFails = false): boolean {
  return product.markets.some((market) => limitFail(product, market, limits, equalFails));
}

function regulationKey(products: Product[], limits: Limit[]) {
  const q1 = joinCodes(
    products
      .filter(
        (product) =>
          product.inspector === "한소율" &&
          product.result === "Pass" &&
          (exportFail(product, limits) || claimBad(product.claim)),
      )
      .map((product) => product.code),
  );
  const q2 = joinCodes(
    products
      .filter((product) => product.result === "Pass" && exportFail(product, limits))
      .map((product) => product.code),
  );
  const q3 = joinCodes(
    products
      .filter((product) => !limitFail(product, "KR", limits) && limitFail(product, "EU", limits))
      .map((product) => product.code),
  );
  const clean = products.filter(
    (product) => product.result === "Pass" && !exportFail(product, limits) && !claimBad(product.claim),
  );
  return { q1, q2, q3, q4: String(clean.length) };
}

type BulkRow = Product & { inspector: string; result: "Pass" | "Fail" };

function parseBulkRows(files: ProblemSet["files"]): { rows: BulkRow[]; finalRows: BulkRow[] } {
  const order = ["audit-a", "audit-b", "audit-c"];
  const raw: BulkRow[] = [];
  const final = new Map<string, BulkRow>();
  for (const id of order) {
    const file = files.find((item) => item.id === id);
    assert.ok(file);
    const lines = section(file.content, "===ROWS===", "===END ROWS===")
      .split("\n")
      .filter((line) => line.trim() !== "");
    assert.equal(lines[0], "code|markets|inspector|result|audience|ingredients|claim");
    for (const line of lines.slice(1)) {
      const [code, markets, inspector, result, audience, ingredients, claim] = line.split("|");
      assert.match(code, /^NF-\d{3}$/);
      assert.ok(result === "Pass" || result === "Fail");
      assert.ok(audience === "성인" || audience === "어린이");
      const row: BulkRow = {
        code,
        audience,
        items: ingredients.split(",").map((part) => {
          const [name, raw] = part.split(":");
          const amount = Number(raw);
          assert.ok(Number.isFinite(amount));
          return { name, amount };
        }),
        claim,
        markets: markets.split(",") as Market[],
        inspector,
        result,
      };
      raw.push(row);
      final.set(code, row);
    }
  }
  return { rows: raw, finalRows: [...final.values()] };
}

function bulkKey(rows: BulkRow[], limits: Limit[]) {
  const q1 = joinCodes(
    rows
      .filter(
        (row) =>
          row.inspector === "노가을" &&
          row.result === "Pass" &&
          (exportFail(row, limits) || claimBad(row.claim)),
      )
      .map((row) => row.code),
  );
  const q2 = joinCodes(
    rows.filter((row) => row.result === "Pass" && exportFail(row, limits)).map((row) => row.code),
  );
  const q3 = joinCodes(
    rows
      .filter((row) => !limitFail(row, "KR", limits) && limitFail(row, "EU", limits))
      .map((row) => row.code),
  );
  const clean = rows.filter(
    (row) => row.result === "Pass" && !exportFail(row, limits) && !claimBad(row.claim),
  );
  return { q1, q2, q3, q4: String(clean.length), q5: String(new Set(rows.map((row) => row.code)).size) };
}

function answersOf(set: ProblemSet): Record<string, string> {
  return Object.fromEntries(set.questions.map((question) => [question.id, question.answer]));
}

function readMagic(media: string, expected: string) {
  const full = path.join(process.cwd(), "public", media);
  const bytes = readFileSync(full).subarray(0, expected.length);
  assert.equal(bytes.toString("latin1"), expected);
}

describe("연습 문제 세트", () => {
  it("설문 응답을 조건대로 다시 계산하면 저장된 답과 같고 자료 합이 한도를 넘는다", () => {
    resetProblemSetCache();
    const set = loadProblemSets().find((item) => item.id === "beverage-survey");
    assert.ok(set);
    assert.equal(set.title, "사내 음료 선호도 설문");
    assert.equal(set.questions.length, 4);
    const rows = surveyRows(set.files.find((file) => file.id === "responses")!.content);
    assert.ok(rows.length >= 50 && rows.length <= 80);
    assert.equal(new Set(rows.map((row) => row.submitted)).size, rows.length);
    const key = surveyKey(rows);
    assert.notEqual(key.validCount, key.rawCount);
    assert.notEqual(key.validCount, latestRows(rows).length);
    const withoutEdges = validSurvey(rows).filter((row) => row.score !== "1" && row.score !== "5");
    assert.notEqual(withoutEdges.length, key.validCount);
    assert.deepEqual(answersOf(set), { q1: key.q1, q2: key.q2, q3: key.q3, q4: key.q4 });
    const total = set.files.reduce((sum, file) => sum + file.content.length, 0);
    assert.ok(total > 20000);
    const needed = set.files
      .filter((file) => file.id !== "chart")
      .reduce((sum, file) => sum + file.content.length, 0);
    assert.ok(needed < 20000);
    assert.match(set.files.find((file) => file.id === "chart")!.content, /필터 전/);
    for (const file of set.files) {
      assert.ok(file.kind === "pdf" || file.kind === "png");
      assert.ok(file.media);
      readMagic(file.media, file.kind === "pdf" ? "%PDF" : "\u0089PNG");
    }
    const prompts = set.questions.map((question) => question.prompt).join("\n");
    assert.match(prompts, /오름차순/);
    assert.match(prompts, /쉼표/);
    assert.match(set.questions[3].prompt, /합계/);
    for (const question of set.questions) assert.ok(question.explanation.includes("흔한 실수"));
  });

  it("규정 문서를 조건대로 다시 계산하면 저장된 답과 같고 부록을 더하면 한도를 넘는다", () => {
    resetProblemSetCache();
    const set = loadProblemSets().find((item) => item.id === "bright-life-review");
    assert.ok(set);
    assert.equal(set.title, "온빛라이프 식품·화장품 검수");
    assert.equal(set.questions.length, 4);
    const rules = set.files.find((file) => file.id === "rules")!.content;
    assert.match(rules, /상한과 같은 값은 통과/);
    assert.match(rules, /수출국에 없는 나라/);
    assert.match(rules, /어린이/);
    const limits = parseLimits(rules);
    const products = parseProducts(set.files);
    const key = regulationKey(products, limits);
    const equalIsFail = joinCodes(
      products
        .filter((product) => !limitFail(product, "KR", limits, true) && limitFail(product, "EU", limits, true))
        .map((product) => product.code),
    );
    assert.notEqual(equalIsFail, key.q3);
    const allMarkets = products.filter((product) =>
      (["KR", "EU"] as Market[]).some((market) => limitFail(product, market, limits)),
    );
    const listedOnly = products.filter((product) => exportFail(product, limits));
    assert.notEqual(allMarkets.length, listedOnly.length);
    assert.deepEqual(answersOf(set), key);
    const total = set.files.reduce((sum, file) => sum + file.content.length, 0);
    const needed = set.files
      .filter((file) => file.id !== "appendix")
      .reduce((sum, file) => sum + file.content.length, 0);
    assert.ok(total > 20000);
    assert.ok(needed < 20000);
    assert.ok(set.files.some((file) => file.kind === "png"));
    for (const file of set.files) {
      assert.ok(file.media);
      readMagic(file.media, file.kind === "pdf" ? "%PDF" : "\u0089PNG");
    }
    const prompts = set.questions.map((question) => question.prompt).join("\n");
    assert.match(prompts, /한소율/);
    assert.match(prompts, /Pass/);
    assert.match(prompts, /EU/);
    for (const question of set.questions) assert.ok(question.explanation.includes("흔한 실수"));
    const pub = toPublicProblemSet(set);
    assert.equal(pub.files[0].kind, "pdf");
    assert.equal("answer" in pub.questions[0], false);
  });

  it("대용량 검수는 파일을 나눠 합산해야 하고 저장된 답과 다시 계산한 답이 같다", () => {
    resetProblemSetCache();
    const set = loadProblemSets().find((item) => item.id === "noeul-food-review");
    assert.ok(set);
    assert.equal(set.title, "노을푸드 수출 검수");
    assert.equal(set.category, "규정 검수(대용량)");
    assert.equal(set.questions.length, 5);
    const rules = set.files.find((file) => file.id === "rules")!;
    assert.match(rules.content, /제3조/);
    assert.match(rules.content, /제11조/);
    assert.match(rules.content, /상한과 같으면 통과/);
    const limits = parseLimits(rules.content);
    const { rows, finalRows } = parseBulkRows(set.files);
    assert.ok(rows.length >= 80 && rows.length <= 120);
    assert.ok(finalRows.length >= 80 && finalRows.length <= 120);
    assert.ok(rows.length > finalRows.length);
    const key = bulkKey(finalRows, limits);
    const firstWins = new Map<string, BulkRow>();
    for (const row of rows) {
      if (!firstWins.has(row.code)) firstWins.set(row.code, row);
    }
    const early = bulkKey([...firstWins.values()], limits);
    assert.notEqual(early.q1, key.q1);
    assert.notEqual(early.q2, key.q2);
    const onCap = finalRows.some(
      (row) => row.items.some((item) => item.name === "나트륨" && item.amount === 600) && !limitFail(row, "KR", limits),
    );
    assert.equal(onCap, true);
    const listedOnly = finalRows.filter((row) => exportFail(row, limits));
    const anyMarket = finalRows.filter((row) => (["KR", "EU"] as Market[]).some((market) => limitFail(row, market, limits)));
    assert.notEqual(anyMarket.length, listedOnly.length);
    assert.deepEqual(answersOf(set), key);
    const total = set.files.reduce((sum, file) => sum + file.content.length, 0);
    assert.ok(total > 20000);
    const audits = set.files.filter((file) => file.id.startsWith("audit-"));
    assert.equal(audits.length, 3);
    for (const file of set.files) {
      if (file.id === "rules") continue;
      assert.ok(rules.content.length + file.content.length < 20000, file.id);
    }
    assert.ok(rules.content.length + audits[0].content.length + audits[1].content.length > 20000);
    const labels = set.files.filter((file) => file.kind === "png");
    assert.ok(labels.length >= 2 && labels.length <= 3);
    assert.match(labels.map((file) => file.content).join("\n"), /치료|예방|완치/);
    for (const file of set.files) {
      assert.ok(file.media);
      readMagic(file.media, file.kind === "pdf" ? "%PDF" : "\u0089PNG");
    }
    for (const question of set.questions) {
      assert.match(question.explanation, /파일별로|하나씩/);
      assert.match(question.explanation, /합산/);
      assert.match(question.explanation, /흔한 실수/);
    }
    assert.match(set.questions.map((question) => question.prompt).join("\n"), /노가을/);
    assert.match(set.questions[3].prompt, /몇 개/);
    assert.match(set.questions[4].prompt, /몇 개/);
  });

  it("pdf 와 png 가 아니면 media 경로를 거절한다", () => {
    assert.throws(
      () =>
        parseProblemSet(
          {
            id: "x",
            title: "제목",
            passage: "지문",
            files: [{ id: "a", name: "a.pdf", kind: "pdf", content: "본문" }],
            questions: [
              { id: "q1", number: 1, type: "short", prompt: "묻기", answer: "1", explanation: "해설" },
            ],
          },
          "bad.json",
        ),
      /media/,
    );
    assert.throws(
      () =>
        parseProblemSet(
          {
            id: "x",
            title: "제목",
            passage: "지문",
            files: [{ id: "a", name: "a.png", kind: "png", media: "../secret.png", content: "본문" }],
            questions: [
              { id: "q1", number: 1, type: "short", prompt: "묻기", answer: "1", explanation: "해설" },
            ],
          },
          "bad.json",
        ),
      /상대 경로/,
    );
  });
});
