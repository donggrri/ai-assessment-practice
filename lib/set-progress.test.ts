import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { describe, it } from "node:test";
import { loadProblemSets, parseProblemSet, resetProblemSetCache } from "./problem-sets";
import { toSummary } from "./public-problem";
import { bestScoreKey, loadBestScore, recordBestScore } from "./best-score";
import {
  attemptStarted,
  describeProgress,
  pickBestScore,
  setKindLabel,
} from "./set-progress";

describe("setKindLabel", () => {
  it("category 가 있으면 그 문자열을 유형으로 쓴다", () => {
    assert.equal(setKindLabel(" 설문 분석 ", ["short"]), "설문 분석");
  });

  it("category 가 없으면 문항 형식으로 유형을 정한다", () => {
    assert.equal(setKindLabel(undefined, ["short", "short"]), "주관식");
    assert.equal(setKindLabel("  ", ["multiple"]), "객관식");
    assert.equal(setKindLabel(undefined, ["short", "multiple"]), "주관식·객관식");
  });
});

describe("점수와 풀이 여부", () => {
  it("최고 점수는 더 높은 쪽을 고르고, 새 응시로 리포트가 없어도 남는다", () => {
    const kept = pickBestScore(
      { score: 75, correctCount: 3, total: 4 },
      { score: 50, correctCount: 2, total: 4 },
    );
    assert.equal(kept?.score, 75);
    assert.equal(pickBestScore(kept, null)?.score, 75);
    assert.equal(describeProgress(kept, false).label, "최고 75점");
    assert.equal(describeProgress(null, true).label, "풀이 중");
    assert.equal(describeProgress(null, false).label, "미풀이");
    assert.equal(describeProgress({ score: 0, correctCount: 0, total: 4 }, false).label, "최고 0점");
  });

  it("빈 답만 있으면 미풀이고, 입력이나 대화가 있으면 풀이 중이다", () => {
    assert.equal(attemptStarted({ saved: { q1: "  " }, drafts: {}, messageCount: 0, hasReport: false }), false);
    assert.equal(attemptStarted({ saved: {}, drafts: { q1: "작성" }, messageCount: 0, hasReport: false }), true);
  });

  it("localStorage 최고 점수는 더 낮은 채점으로 덮이지 않는다", () => {
    const saved = new Map<string, string>();
    const storage = {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => {
        saved.set(key, value);
      },
    };
    recordBestScore("sample", { score: 80, correctCount: 4, total: 5 }, storage);
    recordBestScore("sample", { score: 40, correctCount: 2, total: 5 }, storage);
    assert.equal(loadBestScore("sample", storage)?.score, 80);
    assert.equal(saved.size, 1);
    assert.match(bestScoreKey("sample"), /sample/);
  });
});

describe("문제 모음집 목록", () => {
  it("data/problem-sets 의 JSON 이 전부 카드 요약으로 올라온다", () => {
    resetProblemSetCache();
    const files = readdirSync("data/problem-sets").filter((name) => name.endsWith(".json"));
    const summaries = loadProblemSets().map(toSummary);
    assert.equal(summaries.length, files.length);
    const byId = new Map(summaries.map((item) => [item.id, item]));
    assert.equal(byId.get("beverage-survey")?.kind, "설문 분석");
    assert.equal(byId.get("bright-life-review")?.kind, "규정 검수");
    assert.equal(byId.get("health-supplement-review")?.kind, "입점 심사");
    assert.equal(byId.get("beverage-survey")?.title, "사내 음료 선호도 설문");
    assert.equal(byId.get("bright-life-review")?.title, "온빛라이프 식품·화장품 검수");
    assert.equal(byId.get("health-supplement-review")?.title, "건강기능식품 입점 심사");
    for (const id of ["seorim-gpu-audit", "dalbit-warehouse-audit", "byeol-training-audit", "pureun-inspect-audit"]) {
      assert.equal(byId.get(id)?.difficulty, "어려움");
      assert.equal(byId.get(id)?.timeLimitMin, 25);
      assert.equal(byId.get(id)?.questionCount, 4);
    }
    for (const item of summaries) {
      assert.ok(item.questionCount > 0);
      assert.ok(item.fileCount > 0);
    }
  });

  it("category 가 없는 새 파일도 파싱되고 유형은 문항 형식이다", () => {
    const set = parseProblemSet(
      {
        id: "new-set",
        title: "새 세트",
        passage: "지문",
        files: [{ id: "a", name: "a.md", content: "본문" }],
        questions: [{ id: "q1", number: 1, type: "multiple", prompt: "묻기", choices: [{ id: "a", text: "가" }, { id: "b", text: "나" }], answer: "a", explanation: "해설" }],
      },
      "new-set.json",
    );
    assert.equal(set.category, undefined);
    assert.equal(toSummary(set).kind, "객관식");
  });
});
