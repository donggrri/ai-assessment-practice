import type { ProblemSet, ProblemSetSummary, PublicProblemSet, PublicQuestion } from "./types";

export function toPublicQuestion(question: ProblemSet["questions"][number]): PublicQuestion {
  return {
    id: question.id,
    number: question.number,
    type: question.type,
    prompt: question.prompt,
    ...(question.choices ? { choices: question.choices } : {}),
  };
}

export function toPublicProblemSet(set: ProblemSet): PublicProblemSet {
  return {
    id: set.id,
    title: set.title,
    passage: set.passage,
    files: set.files.map((file) => ({ ...file })),
    questions: set.questions.map(toPublicQuestion),
  };
}

export function toSummary(set: ProblemSet): ProblemSetSummary {
  return {
    id: set.id,
    title: set.title,
    questionCount: set.questions.length,
    fileCount: set.files.length,
  };
}
