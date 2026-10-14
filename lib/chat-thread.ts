import type { ChatContentPart } from "./file-attachment";
import { parseLiveQuestionKey } from "./live-exam";
import { estimateTokens } from "./tokens";

export const CHAT_MEMORY_TURNS = 10;

export const chatSystemPrompt = [
  "너는 문서와 표를 읽는 연습 시험의 조교다.",
  "이전 대화(질문·답변)와 이번 첨부를 근거로 답한다. 이전 첨부 파일 본문은 볼 수 없으니, 필요하면 다시 첨부를 요청한다. 대화와 이번 첨부 어디에도 없는 자료는 추측하지 않고 확인 불가로 적는다.",
  "계산이나 대조가 필요하면 조건별로 표를 만들고 과정을 단계로 보여 준다.",
  "답은 한국어로 쓴다.",
].join("\n");

export const CHAT_HINT = "지문 입력 없이 지시문만 입력 후 Enter (줄바꿈 Shift+Enter)";

export type ModelTurn = {
  role: "user" | "assistant";
  content: string | ChatContentPart[];
};

type ThreadMessage = {
  role: string;
  content: string;
  modelContent?: string;
};

export function enterSends(key: string, shiftKey: boolean, composing: boolean): boolean {
  return key === "Enter" && !shiftKey && !composing;
}

/** 실전 모드에서는 출처 세트, 단독 풀이에서는 그 세트가 대화 그룹이다. */
export function groupThreadId(mode: "set" | "live", setId: string, questionKey: string | null): string {
  if (mode === "live") return parseLiveQuestionKey(questionKey ?? "")?.setId ?? "";
  return setId;
}

export function buildModelMessages(
  history: readonly ModelTurn[],
  content: string | ChatContentPart[],
): { role: "system" | "user" | "assistant"; content: string | ChatContentPart[] }[] {
  return [
    { role: "system", content: chatSystemPrompt },
    ...history.map((turn) => ({ role: turn.role, content: turn.content })),
    { role: "user", content },
  ];
}

function withoutStoredAttachment<T extends ThreadMessage>(message: T): T {
  if (message.modelContent == null) return message;
  const next = { ...message };
  delete next.modelContent;
  return next;
}

/** 질문 하나와 그 답변을 한 턴으로 보고, 최근 limit턴만 남긴다. */
export function trimChatMessages<T extends ThreadMessage>(messages: readonly T[], limit = CHAT_MEMORY_TURNS): T[] {
  const cleaned = messages.map((message) => withoutStoredAttachment(message));
  const userIndexes: number[] = [];
  cleaned.forEach((message, index) => {
    if (message.role === "user") userIndexes.push(index);
  });
  if (userIndexes.length <= limit) return cleaned;
  return cleaned.slice(userIndexes[userIndexes.length - limit]);
}

export function historyFromChat(messages: readonly ThreadMessage[]): { role: "user" | "assistant"; content: string }[] {
  const turns: { role: "user" | "assistant"; content: string }[] = [];
  for (const message of trimChatMessages(messages)) {
    if (message.role === "user") turns.push({ role: "user", content: message.content });
    else if (message.role === "assistant") turns.push({ role: "assistant", content: message.content });
  }
  return turns;
}

export function rememberedTurnCount(messages: readonly ThreadMessage[], limit = CHAT_MEMORY_TURNS): number {
  return Math.min(
    limit,
    trimChatMessages(messages, limit).filter((message) => message.role === "user").length,
  );
}

/** 시스템 프롬프트, 기억 중인 질문·답변, 이번 턴 본문을 이어 붙인 양. 전송 한도와는 별개다. */
export function threadUsage(parts: readonly string[]): { chars: number; tokens: number } {
  let chars = 0;
  for (const part of parts) chars += part.length;
  return { chars, tokens: estimateTokens(parts.join("")) };
}
