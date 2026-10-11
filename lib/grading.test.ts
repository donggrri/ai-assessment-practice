import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { gradeProblemSet, isCorrectAnswer, normalizeAnswer } from "./grading";
import type { ProblemSet } from "./types";

const set: ProblemSet = {
  id: "sample",
  title: "샘플",
  passage: "지문",
  files: [],
  questions: [
    {
      id: "q1",
      number: 1,
      type: "short",
      prompt: "코드를 쓰세요.",
      answer: "IMN-02",
      explanation: "해설",
    },
    {
      id: "q2",
      number: 2,
      type: "short",
      prompt: "코드를 오름차순으로.",
      answer: "BNE-03,ENG-02,IMN-01",
      explanation: "해설",
    },
    {
      id: "q3",
      number: 3,
      type: "multiple",
      prompt: "기준은?",
      choices: [
        { id: "a", text: "한국만 0mg" },
        { id: "b", text: "한국·EU 모두 0mg" },
      ],
      answer: "b",
      explanation: "해설",
    },
  ],
};

describe("normalizeAnswer", () => {
  it("공백과 전각 쉼표, 대소문자를 무시한다", () => {
    assert.equal(normalizeAnswer(" BNE-03, ENG-02 "), "bne-03,eng-02");
    assert.equal(normalizeAnswer("BNE-03，ENG-02"), "bne-03,eng-02");
    assert.equal(normalizeAnswer(" imn-02 "), "imn-02");
  });
});

describe("gradeProblemSet", () => {
  it("공백을 무시한 주관식과 객관식을 맞힌다", () => {
    const report = gradeProblemSet(set, {
      q1: " imn-02 ",
      q2: "BNE-03, ENG-02, IMN-01",
      q3: "b",
    });
    assert.equal(report.correctCount, 3);
    assert.equal(report.total, 3);
    assert.equal(report.score, 100);
    assert.equal(report.items[2].correctAnswerLabel, "B. 한국·EU 모두 0mg");
  });

  it("빈 답, 순서 불일치, 다른 보기는 오답이다", () => {
    const report = gradeProblemSet(set, {
      q1: "   ",
      q2: "ENG-02,BNE-03,IMN-01",
      q3: "a",
    });
    assert.equal(report.correctCount, 0);
    assert.equal(report.items[0].userAnswerLabel, "미응답");
    assert.equal(report.items[0].correct, false);
    assert.equal(isCorrectAnswer(set.questions[1], "ENG-02,BNE-03,IMN-01"), false);
  });

  it("숫자 뒤에 단위를 붙이면 오답이다", () => {
    const numeric: ProblemSet = {
      ...set,
      questions: [
        {
          id: "q4",
          number: 4,
          type: "short",
          prompt: "몇 개인가요?",
          answer: "3",
          explanation: "해설",
        },
      ],
    };
    assert.equal(gradeProblemSet(numeric, { q4: "3" }).correctCount, 1);
    assert.equal(gradeProblemSet(numeric, { q4: "3개" }).correctCount, 0);
  });
});
