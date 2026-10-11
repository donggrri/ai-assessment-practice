import { assembleContext, contextCharCount, formatQuestion } from "./context";
import { consumeRequest } from "./requests";
import type { ExamFile, ProblemSet } from "./types";

export type ChatDecision =
  | {
      ok: true;
      context: string;
      charCount: number;
      nextUsed: number;
      remaining: number;
      questionNumber: number | null;
      questionPrompt: string | null;
      files: ExamFile[];
      omittedFileNames: string[];
      passageChars: number;
      message: string;
    }
  | {
      ok: false;
      status: 400 | 404 | 429;
      error: "not_found" | "empty_message" | "bad_request" | "context_limit" | "request_limit";
      message: string;
      charCount?: number;
      limit?: number;
      remaining?: number;
    };

export function decideChat(input: {
  problemSet: ProblemSet | undefined;
  questionId: string | null;
  fileIds: string[];
  message: string;
  requestsUsed: number;
  contextCharLimit: number;
  aiRequestLimit: number;
}): ChatDecision {
  if (!input.problemSet) {
    return {
      ok: false,
      status: 404,
      error: "not_found",
      message: "문제 세트를 찾을 수 없습니다.",
    };
  }
  if (!Number.isFinite(input.requestsUsed) || input.requestsUsed < 0) {
    return {
      ok: false,
      status: 400,
      error: "bad_request",
      message: "요청 형식이 올바르지 않습니다.",
    };
  }
  const message = input.message ?? "";
  if (message.trim() === "") {
    return {
      ok: false,
      status: 400,
      error: "empty_message",
      message: "질문을 입력하세요.",
    };
  }

  const question =
    input.questionId == null
      ? null
      : (input.problemSet.questions.find((item) => item.id === input.questionId) ?? null);
  const wanted = new Set(input.fileIds);
  const files = input.problemSet.files.filter((file) => wanted.has(file.id));
  const attachedIds = new Set(files.map((file) => file.id));
  const omittedFileNames = input.problemSet.files
    .filter((file) => !attachedIds.has(file.id))
    .map((file) => file.name);

  const contextInput = {
    passage: input.problemSet.passage,
    question: question
      ? { number: question.number, prompt: question.prompt, choices: question.choices }
      : null,
    files: files.map((file) => ({ name: file.name, content: file.content })),
    message,
  };
  const charCount = contextCharCount(contextInput);
  if (charCount > input.contextCharLimit) {
    return {
      ok: false,
      status: 400,
      error: "context_limit",
      message: "컨텍스트 한도를 초과했습니다. 첨부 파일을 빼거나 질문을 줄인 뒤 다시 보내세요.",
      charCount,
      limit: input.contextCharLimit,
    };
  }

  const ticket = consumeRequest(input.requestsUsed, input.aiRequestLimit);
  if (!ticket.ok) {
    return {
      ok: false,
      status: 429,
      error: "request_limit",
      message: "AI 질문 횟수를 모두 사용했습니다.",
      remaining: 0,
      charCount,
      limit: input.contextCharLimit,
    };
  }

  return {
    ok: true,
    context: assembleContext(contextInput),
    charCount,
    nextUsed: ticket.used,
    remaining: ticket.remaining,
    questionNumber: question ? question.number : null,
    questionPrompt: question ? formatQuestion(question) : null,
    files,
    omittedFileNames,
    passageChars: input.problemSet.passage.length,
    message,
  };
}
