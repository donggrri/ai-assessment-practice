import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildModelMessages, chatSystemPrompt, historyFromChat, threadUsage } from "./chat-thread";

describe("chat thread", () => {
  it("시스템 메시지와 화면용 말풍선은 빼고, user는 modelContent를 보낸다", () => {
    const history = historyFromChat([
      { role: "system", content: "새 응시" },
      { role: "user", content: "첫번째 질문", modelContent: "FILE_A_BODY\nFILE_B_BODY\n첫번째 질문" },
      { role: "assistant", content: "합계는 3입니다." },
    ]);
    assert.deepEqual(history, [
      { role: "user", content: "FILE_A_BODY\nFILE_B_BODY\n첫번째 질문" },
      { role: "assistant", content: "합계는 3입니다." },
    ]);
  });

  it("buildModelMessages는 system, 이전 턴, 이번 user 순이다", () => {
    const messages = buildModelMessages(
      [
        { role: "user", content: "FILE_A_BODY" },
        { role: "assistant", content: "표" },
      ],
      "FILE_C_BODY",
    );
    assert.equal(messages[0].content, chatSystemPrompt);
    assert.equal(chatSystemPrompt.includes("이전 대화 없음"), false);
    assert.equal(chatSystemPrompt.includes("만 근거"), false);
    assert.deepEqual(messages.slice(1), [
      { role: "user", content: "FILE_A_BODY" },
      { role: "assistant", content: "표" },
      { role: "user", content: "FILE_C_BODY" },
    ]);
  });

  it("누적 글자 수는 이어 붙인 길이이고 토큰은 그 절반을 올린다", () => {
    const usage = threadUsage(["abcd", "ef"]);
    assert.equal(usage.chars, 6);
    assert.equal(usage.tokens, 3);
  });
});
