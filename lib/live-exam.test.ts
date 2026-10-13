import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LIVE_DURATION_MS,
  LIVE_LIMIT,
  LIVE_STORAGE_KEY,
  buildLivePaper,
  formatTimer,
  gradeLivePaper,
  liveQuestionKey,
  loadLiveSession,
  parseLiveQuestionKey,
  questionFormLabel,
  remainingLiveMs,
  saveLiveSession,
  type LiveSession,
} from "./live-exam";
import type { ProblemSet } from "./types";

function setOf(id: string, count: number, type: "short" | "multiple" = "short"): ProblemSet {
  return {
    id,
    title: id,
    passage: `${id} 지문`,
    files: [{ id: "f", name: "a.md", content: "본문" }],
    questions: Array.from({ length: count }, (_, index) => ({
      id: `q${index + 1}`,
      number: index + 1,
      type,
      prompt: `${id} 문제 ${index + 1}`,
      ...(type === "multiple"
        ? {
            choices: [
              { id: "a", text: "가" },
              { id: "b", text: "나" },
            ],
          }
        : {}),
      answer: type === "multiple" ? "b" : "답",
      explanation: "해설",
    })),
  };
}

describe("questionFormLabel", () => {
  it("보기가 있는 multiple 만 객관식이고 나머지는 주관식이다", () => {
    assert.equal(questionFormLabel({ type: "multiple", choices: [{ id: "a" }, { id: "b" }] }), "객관식");
    assert.equal(questionFormLabel({ type: "short" }), "주관식");
    assert.equal(questionFormLabel({ type: "multiple", choices: [] }), "주관식");
  });
});

describe("buildLivePaper", () => {
  it("여러 세트를 번갈아 최대 16문항까지 모은다", () => {
    const paper = buildLivePaper([setOf("a", 10), setOf("b", 10), setOf("c", 10)]);
    assert.equal(paper.length, LIVE_LIMIT);
    assert.equal(new Set(paper.map((item) => item.setId)).size, 3);
    assert.deepEqual(
      paper.slice(0, 3).map((item) => item.setId),
      ["a", "b", "c"],
    );
    assert.equal(paper.filter((item) => item.setId === "a").length, 6);
  });

  it("문항이 16개 이하면 모두 포함한다", () => {
    const paper = buildLivePaper([setOf("a", 2), setOf("b", 1)]);
    assert.equal(paper.length, 3);
    assert.equal(liveQuestionKey(paper[0]), "a:q1");
    assert.deepEqual(parseLiveQuestionKey("a:q1"), { setId: "a", questionId: "q1" });
  });
});

describe("실전 타이머", () => {
  it("90분에서 줄고 끝나면 0이다", () => {
    const started = 1_000_000;
    assert.equal(remainingLiveMs(started, started), LIVE_DURATION_MS);
    assert.equal(formatTimer(LIVE_DURATION_MS), "90:00");
    assert.equal(formatTimer(65_000), "01:05");
    assert.equal(remainingLiveMs(started, started + LIVE_DURATION_MS + 5), 0);
    assert.equal(formatTimer(0), "00:00");
  });
});

describe("loadLiveSession", () => {
  it("저장한 세션을 읽고 깨진 값은 버린다", () => {
    const mem = new Map<string, string>();
    const storage = {
      getItem: (key: string) => mem.get(key) ?? null,
      setItem: (key: string, value: string) => {
        mem.set(key, value);
      },
    };
    const session: LiveSession = {
      v: 1,
      paper: [{ setId: "a", questionId: "q1" }],
      startedAt: 50,
      saved: {},
      drafts: { "a:q1": "답" },
      activeQuestionId: "a:q1",
      viewerFileId: null,
      attachedFileIds: [],
      chatQuestionId: null,
      messages: [],
      requestsUsed: 0,
      report: null,
      view: "exam",
      reviewIds: ["a:q1"],
    };
    saveLiveSession(session, storage);
    assert.equal(mem.has(LIVE_STORAGE_KEY), true);
    assert.equal(loadLiveSession(storage)?.drafts["a:q1"], "답");
    mem.set(LIVE_STORAGE_KEY, "{");
    assert.equal(loadLiveSession(storage), null);
  });
});

describe("gradeLivePaper", () => {
  it("세트별 정답으로 채점하고 문항 번호는 모은 순서로 다시 매긴다", () => {
    const sets = [setOf("a", 1, "multiple"), setOf("b", 1)];
    const paper = buildLivePaper(sets);
    const report = gradeLivePaper(sets, paper, { "a:q1": "b", "b:q1": "오답" });
    assert.equal(report.total, 2);
    assert.equal(report.correctCount, 1);
    assert.equal(report.score, 50);
    assert.equal(report.items[0]?.number, 1);
    assert.equal(report.items[0]?.correct, true);
    assert.equal(report.items[1]?.correct, false);
    assert.equal(report.items[1]?.questionId, "b:q1");
  });
});
