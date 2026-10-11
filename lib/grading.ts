import type { GradeItem, GradeReport, ProblemSet, Question } from "./types";

/** 공백(전각 포함)을 없애고, 전각 쉼표는 반각으로, 대소문자는 구분하지 않는다. */
export function normalizeAnswer(value: string): string {
  return value.replace(/[\s\u3000]+/g, "").replace(/，/g, ",").toLowerCase();
}

export function isCorrectAnswer(question: Question, userAnswer: string | undefined): boolean {
  const raw = userAnswer ?? "";
  if (raw.trim() === "") return false;
  return normalizeAnswer(raw) === normalizeAnswer(question.answer);
}

function displayLabel(question: Question, raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "미응답";
  if (question.type === "multiple") {
    const choice = question.choices?.find(
      (item) => item.id.toLowerCase() === trimmed.toLowerCase(),
    );
    return choice ? `${choice.id.toUpperCase()}. ${choice.text}` : trimmed;
  }
  return trimmed;
}

export function gradeProblemSet(
  set: ProblemSet,
  answers: Record<string, string | undefined>,
): GradeReport {
  const items: GradeItem[] = set.questions.map((question) => {
    const userAnswer = answers[question.id] ?? "";
    const correct = isCorrectAnswer(question, userAnswer);
    return {
      questionId: question.id,
      number: question.number,
      type: question.type,
      prompt: question.prompt,
      choices: question.choices,
      userAnswer,
      userAnswerLabel: displayLabel(question, userAnswer),
      correctAnswer: question.answer,
      correctAnswerLabel: displayLabel(question, question.answer),
      correct,
      explanation: question.explanation,
    };
  });
  const correctCount = items.filter((item) => item.correct).length;
  const total = items.length;
  const score = total === 0 ? 0 : Math.round((correctCount / total) * 100);
  return {
    problemSetId: set.id,
    title: set.title,
    correctCount,
    total,
    score,
    items,
  };
}
