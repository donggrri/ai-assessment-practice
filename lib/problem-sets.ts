import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Choice, ProblemSet, Question, QuestionType } from "./types";

let cache: ProblemSet[] | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function needString(source: Record<string, unknown>, key: string, file: string): string {
  const value = source[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${file}: ${key} 문자열이 필요합니다.`);
  }
  return value;
}

function parseChoices(value: unknown, file: string, questionId: string): Choice[] | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value) || value.length < 2) {
    throw new Error(`${file}: ${questionId} 보기는 2개 이상이어야 합니다.`);
  }
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`${file}: ${questionId} 보기 ${index + 1} 형식 오류`);
    return {
      id: needString(item, "id", file),
      text: needString(item, "text", file),
    };
  });
}

export function parseProblemSet(value: unknown, file: string): ProblemSet {
  if (!isRecord(value)) throw new Error(`${file}: 문제 세트 객체가 아닙니다.`);
  const filesRaw = value.files;
  const questionsRaw = value.questions;
  if (!Array.isArray(filesRaw) || filesRaw.length === 0) {
    throw new Error(`${file}: files 배열이 필요합니다.`);
  }
  if (!Array.isArray(questionsRaw) || questionsRaw.length === 0) {
    throw new Error(`${file}: questions 배열이 필요합니다.`);
  }

  const files = filesRaw.map((item, index) => {
    if (!isRecord(item)) throw new Error(`${file}: files[${index}] 형식 오류`);
    return {
      id: needString(item, "id", file),
      name: needString(item, "name", file),
      content: needString(item, "content", file),
    };
  });
  const fileIds = new Set<string>();
  for (const fileItem of files) {
    if (fileIds.has(fileItem.id)) throw new Error(`${file}: 파일 id 중복 ${fileItem.id}`);
    fileIds.add(fileItem.id);
  }

  const questions: Question[] = questionsRaw.map((item, index) => {
    if (!isRecord(item)) throw new Error(`${file}: questions[${index}] 형식 오류`);
    const type = item.type;
    if (type !== "short" && type !== "multiple") {
      throw new Error(`${file}: questions[${index}].type 은 short 또는 multiple`);
    }
    const id = needString(item, "id", file);
    const number = item.number;
    if (typeof number !== "number" || !Number.isInteger(number) || number < 1) {
      throw new Error(`${file}: ${id} number 가 올바르지 않습니다.`);
    }
    const choices = parseChoices(item.choices, file, id);
    const answer = needString(item, "answer", file);
    if (type === "multiple") {
      if (!choices?.some((choice) => choice.id === answer)) {
        throw new Error(`${file}: ${id} 정답이 보기 id와 맞지 않습니다.`);
      }
    }
    const question: Question = {
      id,
      number,
      type: type as QuestionType,
      prompt: needString(item, "prompt", file),
      answer,
      explanation: needString(item, "explanation", file),
    };
    if (choices) question.choices = choices;
    return question;
  });
  const questionIds = new Set<string>();
  for (const question of questions) {
    if (questionIds.has(question.id)) throw new Error(`${file}: 문제 id 중복 ${question.id}`);
    questionIds.add(question.id);
  }

  return {
    id: needString(value, "id", file),
    title: needString(value, "title", file),
    passage: needString(value, "passage", file),
    files,
    questions,
  };
}

export function loadProblemSets(): ProblemSet[] {
  if (cache) return cache;
  const dir = path.join(process.cwd(), "data", "problem-sets");
  const names = readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort();
  if (names.length === 0) throw new Error(`${dir} 에 문제 세트 JSON이 없습니다.`);
  cache = names.map((name) => {
    const full = path.join(dir, name);
    return parseProblemSet(JSON.parse(readFileSync(full, "utf8")), name);
  });
  return cache;
}

export function getProblemSet(id: string): ProblemSet | undefined {
  return loadProblemSets().find((set) => set.id === id);
}

export function resetProblemSetCache(): void {
  cache = null;
}
