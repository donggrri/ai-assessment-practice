import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideChat } from "./chat-policy";
import type { ProblemSet } from "./types";

const set: ProblemSet = {
  id: "demo",
  title: "데모",
  passage: "공통지문",
  files: [
    { id: "keep", name: "keep.md", content: "KEEP_FILE_BODY" },
    { id: "drop", name: "drop.md", content: "DROP_FILE_SECRET" },
  ],
  questions: [
    {
      id: "q1",
      number: 1,
      type: "short",
      prompt: "문제 UNIQUE_Q1",
      answer: "x",
      explanation: "해설",
    },
  ],
};

describe("decideChat", () => {
  it("첨부한 파일과 고른 문제만 넣고 횟수를 1 소모한다", () => {
    const decision = decideChat({
      problemSet: set,
      questionId: "q1",
      fileIds: ["keep", "missing"],
      message: "비교해 줘",
      requestsUsed: 3,
      contextCharLimit: 20_000,
      aiRequestLimit: 10,
    });
    assert.equal(decision.ok, true);
    if (!decision.ok) return;
    assert.equal(decision.context.includes("KEEP_FILE_BODY"), true);
    assert.equal(decision.context.includes("DROP_FILE_SECRET"), false);
    assert.equal(decision.context.includes("UNIQUE_Q1"), true);
    assert.equal(decision.omittedFileNames.join(","), "drop.md");
    assert.equal(decision.nextUsed, 4);
    assert.equal(decision.remaining, 6);
  });

  it("문제를 고르지 않으면 문제 본문을 보내지 않는다", () => {
    const decision = decideChat({
      problemSet: set,
      questionId: null,
      fileIds: [],
      message: "지문만",
      requestsUsed: 0,
      contextCharLimit: 20_000,
      aiRequestLimit: 10,
    });
    assert.equal(decision.ok, true);
    if (!decision.ok) return;
    assert.equal(decision.context.includes("UNIQUE_Q1"), false);
    assert.equal(decision.questionNumber, null);
  });

  it("글자 수가 한도를 넘으면 전송을 막고 횟수를 줄이지 않는다", () => {
    const decision = decideChat({
      problemSet: set,
      questionId: null,
      fileIds: ["keep"],
      message: "가".repeat(50),
      requestsUsed: 1,
      contextCharLimit: 30,
      aiRequestLimit: 10,
    });
    assert.equal(decision.ok, false);
    if (decision.ok) return;
    assert.equal(decision.error, "context_limit");
    assert.equal(decision.status, 400);
    assert.ok((decision.charCount ?? 0) > 30);
  });

  it("남은 횟수가 0이면 입력에 해당하는 요청을 거절한다", () => {
    const decision = decideChat({
      problemSet: set,
      questionId: null,
      fileIds: [],
      message: "한 번 더",
      requestsUsed: 10,
      contextCharLimit: 20_000,
      aiRequestLimit: 10,
    });
    assert.equal(decision.ok, false);
    if (decision.ok) return;
    assert.equal(decision.status, 429);
    assert.equal(decision.error, "request_limit");
    assert.equal(decision.remaining, 0);
    assert.match(decision.message, /모두 사용/);
  });

  it("횟수 제한을 끄면 한도를 넘어도 질문을 막지 않는다", () => {
    const decision = decideChat({
      problemSet: set,
      questionId: null,
      fileIds: [],
      message: "한 번 더",
      requestsUsed: 10,
      contextCharLimit: 20_000,
      aiRequestLimit: 10,
      enforceRequestLimit: false,
    });
    assert.equal(decision.ok, true);
    if (!decision.ok) return;
    assert.equal(decision.nextUsed, 11);
  });
});
