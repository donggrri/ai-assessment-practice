import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { gradeProblemSet } from "./grading";
import { loadProblemSets, parseProblemSet } from "./problem-sets";
import { toPublicProblemSet } from "./public-problem";
import type { ProblemSet } from "./types";

type Market = "KR" | "EU";
type Ingredient = { name: "비타민 D" | "아연" | "카페인" | "요힘빈"; amount: number };
type Product = {
  code: string;
  audience: "성인" | "어린이";
  ingredients: Ingredient[];
  claim: string;
  markets: Market[];
  inspector: string;
  result: "Pass" | "Fail";
};

const LIMITS = {
  "비타민 D": { KR: 100, EU: 50 },
  아연: { KR: 35, EU: 25 },
  카페인: { KR: 400, EU: 400 },
} as const;

const products: Product[] = [
  { code: "NVT-01", audience: "성인", ingredients: [{ name: "비타민 D", amount: 80 }], claim: "뼈 건강에 도움을 줄 수 있음", markets: ["KR", "EU"], inspector: "박지수", result: "Pass" },
  { code: "NVT-02", audience: "성인", ingredients: [{ name: "아연", amount: 30 }], claim: "면역력 유지에 도움", markets: ["KR"], inspector: "박지수", result: "Pass" },
  { code: "NVT-03", audience: "어린이", ingredients: [{ name: "비타민 D", amount: 20 }, { name: "카페인", amount: 30 }], claim: "집중력에 도움", markets: ["KR"], inspector: "이현우", result: "Pass" },
  { code: "ENG-01", audience: "성인", ingredients: [{ name: "카페인", amount: 350 }], claim: "피로 회복에 도움", markets: ["KR", "EU"], inspector: "이현우", result: "Pass" },
  { code: "ENG-02", audience: "성인", ingredients: [{ name: "카페인", amount: 200 }, { name: "요힘빈", amount: 2 }], claim: "활력 증진", markets: ["KR"], inspector: "박지수", result: "Pass" },
  { code: "ENG-03", audience: "성인", ingredients: [{ name: "카페인", amount: 450 }], claim: "감기를 예방합니다", markets: ["EU"], inspector: "최유나", result: "Fail" },
  { code: "IMN-01", audience: "성인", ingredients: [{ name: "아연", amount: 28 }], claim: "면역력 유지에 도움", markets: ["EU"], inspector: "최유나", result: "Pass" },
  { code: "IMN-02", audience: "성인", ingredients: [{ name: "아연", amount: 20 }], claim: "독감을 예방합니다", markets: ["KR", "EU"], inspector: "박지수", result: "Pass" },
  { code: "IMN-03", audience: "성인", ingredients: [{ name: "비타민 D", amount: 120 }], claim: "뼈 건강에 도움", markets: ["KR"], inspector: "이현우", result: "Fail" },
  { code: "BNE-01", audience: "성인", ingredients: [{ name: "비타민 D", amount: 60 }, { name: "아연", amount: 22 }], claim: "골다공증을 치료합니다", markets: ["KR"], inspector: "이현우", result: "Pass" },
  { code: "BNE-02", audience: "성인", ingredients: [{ name: "비타민 D", amount: 40 }], claim: "뼈 건강에 도움", markets: ["KR", "EU"], inspector: "최유나", result: "Pass" },
  { code: "BNE-03", audience: "성인", ingredients: [{ name: "아연", amount: 40 }], claim: "면역력 유지에 도움", markets: ["KR"], inspector: "최유나", result: "Pass" },
];

function violates(product: Product, market: Market): boolean {
  for (const item of product.ingredients) {
    if (item.name === "요힘빈") return true;
    if (item.name === "카페인" && product.audience === "어린이") {
      if (item.amount > 0) return true;
      continue;
    }
    const limit = LIMITS[item.name][market];
    if (item.amount > limit) return true;
  }
  return false;
}

function badClaim(claim: string): boolean {
  return /치료|예방|완치/.test(claim);
}

function codes(list: Product[]): string {
  return list.map((item) => item.code).sort().join(",");
}

describe("건강기능식품 입점 심사 정답", () => {
  const raw = JSON.parse(
    readFileSync(path.join(process.cwd(), "data/problem-sets/health-supplement.json"), "utf8"),
  ) as ProblemSet;
  const set = parseProblemSet(raw, "health-supplement.json");

  it("검수 기록 표가 규칙 판정에 쓴 상품과 같다", () => {
    const audit = set.files.find((file) => file.name === "03_검수기록.md");
    assert.ok(audit);
    for (const product of products) {
      assert.equal(audit.content.includes(`| ${product.code} |`), true);
      assert.equal(audit.content.includes(product.claim), true);
      assert.equal(audit.content.includes(`| ${product.inspector} | ${product.result} |`), true);
    }
  });

  it("독립 규칙으로 계산한 답이 문제 세트의 정답과 같다", () => {
    const q1 = products
      .filter((item) => item.inspector === "박지수" && item.result === "Pass" && badClaim(item.claim))
      .map((item) => item.code)
      .join(",");
    const q2 = codes(products.filter((item) => item.result === "Pass" && item.markets.some((market) => violates(item, market))));
    const q3 = codes(products.filter((item) => !violates(item, "KR") && violates(item, "EU")));
    const q4 = products.filter(
      (item) => item.result === "Pass" && !badClaim(item.claim) && item.markets.every((market) => !violates(item, market)),
    );
    assert.equal(q1, "IMN-02");
    assert.equal(q2, "BNE-03,ENG-02,IMN-01,NVT-01,NVT-03");
    assert.equal(q3, "BNE-01,IMN-01,NVT-01,NVT-02");
    assert.equal(q4.length, 3);
    assert.deepEqual(q4.map((item) => item.code).sort(), ["BNE-02", "ENG-01", "NVT-02"]);

    const byNumber = Object.fromEntries(set.questions.map((question) => [question.number, question.answer]));
    assert.equal(byNumber[1], q1);
    assert.equal(byNumber[2], q2);
    assert.equal(byNumber[3], q3);
    assert.equal(byNumber[4], String(q4.length));
    assert.equal(byNumber[5], "b");
  });

  it("정답지로 채점하면 만점이고, 공개 문제에는 정답이 없다", () => {
    const answers = Object.fromEntries(set.questions.map((question) => [question.id, question.answer]));
    const report = gradeProblemSet(set, answers);
    assert.equal(report.correctCount, 5);
    const pub = toPublicProblemSet(set);
    const blob = JSON.stringify(pub.questions);
    assert.equal(blob.includes("explanation"), false);
    assert.equal(blob.includes('"answer"'), false);
    assert.equal(loadProblemSets().some((item) => item.id === set.id), true);
  });
});
