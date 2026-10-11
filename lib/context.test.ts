import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assembleContext, contextCharCount, measureContext } from "./context";

const passage = "공통 지문 본문";
const question = { number: 2, prompt: "문제 본문 UNIQUE_QUESTION" };
const attached = { name: "첨부.md", content: "첨부 본문 ATTACHED_ONLY" };
const message = "사용자 질문";

describe("contextCharCount", () => {
  it("지문, 선택 문제, 첨부 파일, 질문 글자만 더한다", () => {
    const count = contextCharCount({
      passage,
      question,
      files: [attached],
      message,
    });
    const questionText = `2. ${question.prompt}`;
    assert.equal(count, passage.length + questionText.length + attached.content.length + message.length);
  });

  it("문제를 고르지 않으면 문제 본문을 세지 않고 프롬프트에도 넣지 않는다", () => {
    const input = { passage, question: null, files: [attached], message };
    assert.equal(contextCharCount(input), passage.length + attached.content.length + message.length);
    const text = assembleContext(input);
    assert.equal(text.includes("UNIQUE_QUESTION"), false);
    assert.equal(text.includes(passage), true);
    assert.equal(text.includes("ATTACHED_ONLY"), true);
  });

  it("넘긴 파일만 포함하고 한도 초과를 표시한다", () => {
    const measured = measureContext(
      { passage, question, files: [attached], message: "가".repeat(10) },
      20,
    );
    assert.equal(measured.text.includes("SECRET_UNATTACHED"), false);
    assert.equal(measured.over, true);
    assert.equal(
      measured.parts.reduce((sum, part) => sum + part.charCount, 0),
      measured.charCount,
    );
  });

  it("한도와 같으면 초과가 아니다", () => {
    const input = { passage: "12345", question: null, files: [], message: "" };
    const measured = measureContext(input, contextCharCount(input));
    assert.equal(measured.over, false);
  });
});
