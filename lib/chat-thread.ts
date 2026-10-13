import type { ChatContentPart } from "./file-attachment";
import { estimateTokens } from "./tokens";

export const chatSystemPrompt = [
  "너는 문서와 표를 읽는 연습 시험의 조교다.",
  "이번 대화에서 지금까지 주고받은 메시지(이전 턴의 첨부 파일과 네가 만든 표 포함)를 근거로 답한다. 대화 어디에도 없는 자료는 추측하지 않고 확인 불가로 적는다.",
  "계산이나 대조가 필요하면 조건별로 표를 만들고 과정을 단계로 보여 준다.",
  "답은 한국어로 쓴다.",
].join("\n");

export type ModelTurn = {
  role: "user" | "assistant";
  content: string | ChatContentPart[];
};

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

export function historyFromChat(
  messages: readonly { role: string; content: string; modelContent?: string }[],
): { role: "user" | "assistant"; content: string }[] {
  const turns: { role: "user" | "assistant"; content: string }[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      turns.push({ role: "user", content: message.modelContent ?? message.content });
    } else if (message.role === "assistant") {
      turns.push({ role: "assistant", content: message.content });
    }
  }
  return turns;
}

/** 시스템 프롬프트, 이전 턴, 이번 턴 본문을 이어 붙인 누적량. 전송 한도와는 별개다. */
export function threadUsage(parts: readonly string[]): { chars: number; tokens: number } {
  let chars = 0;
  for (const part of parts) chars += part.length;
  return { chars, tokens: estimateTokens(parts.join("")) };
}
