import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildModelMessages,
  CHAT_HINT,
  CHAT_MEMORY_TURNS,
  chatSystemPrompt,
  enterSends,
  groupThreadId,
  historyFromChat,
  rememberedTurnCount,
  threadUsage,
  trimChatMessages,
} from "./chat-thread";

describe("chat thread", () => {
  it("기록에는 질문 텍스트와 답변만 있고 첨부 본문은 없다", () => {
    const history = historyFromChat([
      { role: "system", content: "새 응시" },
      { role: "user", content: "첫번째 질문", modelContent: "FILE_A_BODY\nFILE_B_BODY\n첫번째 질문" },
      { role: "assistant", content: "합계는 3입니다." },
    ]);
    assert.deepEqual(history, [
      { role: "user", content: "첫번째 질문" },
      { role: "assistant", content: "합계는 3입니다." },
    ]);
    assert.equal(JSON.stringify(history).includes("FILE_A_BODY"), false);
  });

  it("시스템 프롬프트는 이전 질문·답변과 이번 첨부만 근거로 한다", () => {
    const messages = buildModelMessages(
      [
        { role: "user", content: "첫번째 질문" },
        { role: "assistant", content: "표" },
      ],
      "이번 첨부",
    );
    assert.equal(messages[0].content, chatSystemPrompt);
    assert.match(chatSystemPrompt, /이전 대화\(질문·답변\)와 이번 첨부를 근거로/);
    assert.match(chatSystemPrompt, /이전 첨부 파일 본문은 볼 수 없으니/);
    assert.equal(chatSystemPrompt.includes("이전 턴의 첨부 파일"), false);
    assert.equal(chatSystemPrompt.includes("이전 대화 없음"), false);
    assert.deepEqual(messages.slice(1), [
      { role: "user", content: "첫번째 질문" },
      { role: "assistant", content: "표" },
      { role: "user", content: "이번 첨부" },
    ]);
  });

  it("11턴째부터 가장 오래된 질문과 답변을 뺀다", () => {
    const stored: { role: string; content: string; modelContent?: string }[] = [];
    for (let number = 1; number <= CHAT_MEMORY_TURNS + 1; number += 1) {
      stored.push(
        { role: "user", content: `질문${number}`, modelContent: `FILE_${number}` },
        { role: "assistant", content: `답${number}` },
      );
    }
    const kept = trimChatMessages(stored);
    const history = historyFromChat(kept);
    assert.equal(rememberedTurnCount(kept), 10);
    assert.equal(history.filter((turn) => turn.role === "user").length, 10);
    assert.equal(history[0].content, "질문2");
    assert.equal(history.at(-2)?.content, "질문11");
    assert.equal(history.at(-1)?.content, "답11");
    assert.equal(JSON.stringify(history).includes("FILE_"), false);
    assert.equal(JSON.stringify(kept).includes("modelContent"), false);
  });

  it("같은 문제 그룹의 하위 문제는 대화를 공유하고 다른 그룹은 나뉜다", () => {
    assert.equal(groupThreadId("set", "seorim-gpu-audit", "q1"), groupThreadId("set", "seorim-gpu-audit", "q2"));
    assert.equal(groupThreadId("live", "live", "seorim-gpu-audit:q1"), "seorim-gpu-audit");
    assert.equal(
      groupThreadId("live", "live", "seorim-gpu-audit:q2"),
      groupThreadId("live", "live", "seorim-gpu-audit:q1"),
    );
    assert.notEqual(groupThreadId("live", "live", "dalbit-warehouse-audit:q1"), "seorim-gpu-audit");

    const shared = trimChatMessages([
      { role: "user", content: "1번 질문", modelContent: "TEAM_FILE" },
      { role: "assistant", content: "1번 답" },
      { role: "user", content: "2번 질문" },
      { role: "assistant", content: "2번 답" },
    ]);
    assert.deepEqual(
      historyFromChat(shared).map((turn) => turn.content),
      ["1번 질문", "1번 답", "2번 질문", "2번 답"],
    );
  });

  it("Enter는 전송하고 Shift+Enter와 조합 중 Enter는 줄바꿈이다", () => {
    assert.equal(enterSends("Enter", false, false), true);
    assert.equal(enterSends("Enter", true, false), false);
    assert.equal(enterSends("Enter", false, true), false);
    assert.equal(enterSends("a", false, false), false);
    assert.equal(CHAT_HINT.includes("Shift+Enter"), true);
  });

  it("누적 글자 수는 이어 붙인 길이이고 토큰은 그 절반을 올린다", () => {
    const usage = threadUsage(["abcd", "ef"]);
    assert.equal(usage.chars, 6);
    assert.equal(usage.tokens, 3);
  });
});
