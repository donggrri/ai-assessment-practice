import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { chatSystemPrompt } from "./chat-thread";
import { completeChat } from "./llm";

const originalFetch = globalThis.fetch;

type CompleteChatInput = Parameters<typeof completeChat>[0] & {
  signal?: AbortSignal;
};

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("completeChat", () => {
  it("history를 messages 앞에 두고, 시스템 프롬프트는 지금까지의 대화를 근거로 한다", async () => {
    let body: { messages: { role: string; content: string }[] } | undefined;
    globalThis.fetch = async (_url, init) => {
      body = JSON.parse(String(init?.body)) as { messages: { role: string; content: string }[] };
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "이어서" } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const result = await completeChat({
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test",
      model: "gpt-test",
      history: [
        { role: "user", content: "FILE_A_BODY 첫번째" },
        { role: "assistant", content: "표 결과" },
      ],
      content: "FILE_C_BODY 합쳐",
    });

    assert.equal(result, "이어서");
    assert.ok(body);
    assert.equal(body.messages.length, 4);
    assert.equal(body.messages[0].role, "system");
    assert.equal(body.messages[0].content, chatSystemPrompt);
    assert.match(
      body.messages[0].content,
      /이번 대화에서 지금까지 주고받은 메시지\(이전 턴의 첨부 파일과 네가 만든 표 포함\)를 근거로 답한다\. 대화 어디에도 없는 자료는 추측하지 않고 확인 불가로 적는다\./,
    );
    assert.equal(body.messages[0].content.includes("사용자 메시지에 들어 있는"), false);
    assert.equal(body.messages[0].content.includes("첨부되지 않은 자료는 없다고"), false);
    assert.equal(body.messages[0].content.includes("이전 대화 없음"), false);
    assert.deepEqual(body.messages[1], { role: "user", content: "FILE_A_BODY 첫번째" });
    assert.deepEqual(body.messages[2], { role: "assistant", content: "표 결과" });
    assert.deepEqual(body.messages[3], { role: "user", content: "FILE_C_BODY 합쳐" });
  });

  it('성공: fetch가 200과 choices[0].message.content "안녕하세요"를 주면 "안녕하세요"를 반환한다', async () => {
    const baseUrl = "https://api.example.com/v1";
    const apiKey = "sk-test-key";
    const model = "gpt-test";

    globalThis.fetch = async (url, init) => {
      assert.equal(url, `${baseUrl}/chat/completions`);
      assert.equal(init?.method, "POST");
      const headers = init?.headers as Record<string, string>;
      assert.equal(headers.Authorization, `Bearer ${apiKey}`);
      assert.equal(headers["Content-Type"], "application/json");
      assert.equal(headers["HTTP-Referer"], undefined);
      assert.equal(headers["X-Title"], undefined);

      const body = JSON.parse(String(init?.body)) as {
        model: string;
        temperature: number;
        messages: unknown[];
      };
      assert.equal(body.model, model);
      assert.equal(body.temperature, 0.2);
      assert.ok(Array.isArray(body.messages));

      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "안녕하세요" } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const result = await completeChat({
      baseUrl,
      apiKey,
      model,
      content: "질문",
    });
    assert.equal(result, "안녕하세요");
  });

  it("비 2xx: fetch가 500과 본문을 주면 상태 코드가 메시지에 포함되어 throw한다", async () => {
    globalThis.fetch = async () =>
      new Response("internal error", { status: 500 });

    await assert.rejects(
      () =>
        completeChat({
          baseUrl: "https://api.example.com/v1",
          apiKey: "sk-test",
          model: "gpt-test",
          content: "질문",
        }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /500/);
        return true;
      },
    );
  });

  it('빈 본문: choices[0].message.content가 ""이면 메시지에 "비어"가 포함되어 throw한다', async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "" } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    await assert.rejects(
      () =>
        completeChat({
          baseUrl: "https://api.example.com/v1",
          apiKey: "sk-test",
          model: "gpt-test",
          content: "질문",
        }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /비어/);
        return true;
      },
    );
  });

  it("빈 본문: choices[0].message.content가 없으면 메시지에 \"비어\"가 포함되어 throw한다", async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: {} }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    await assert.rejects(
      () =>
        completeChat({
          baseUrl: "https://api.example.com/v1",
          apiKey: "sk-test",
          model: "gpt-test",
          content: "질문",
        }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /비어/);
        return true;
      },
    );
  });

  it("주입한 signal이 abort면 즉시 거절한다", async () => {
    const controller = new AbortController();
    controller.abort();
    const signal = controller.signal;

    let capturedSignal: AbortSignal | undefined;
    globalThis.fetch = async (_url, init) => {
      capturedSignal = init?.signal as AbortSignal | undefined;
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "안녕하세요" } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const input: CompleteChatInput = {
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test",
      model: "gpt-test",
      content: "질문",
      signal,
    };

    const bounded = Promise.race([
      completeChat(input),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error("completeChat이 500ms 안에 끝나지 않았다")),
          500,
        );
      }),
    ]);

    await assert.rejects(() => bounded, (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.equal(
        err.name,
        "AbortError",
        "abort된 signal이면 AbortError로 즉시 거절되어야 한다",
      );
      return true;
    });

    assert.strictEqual(
      capturedSignal,
      signal,
      "fetch에 전달된 signal은 호출자가 넘긴 signal과 같아야 한다",
    );
  });

  it("OpenRouter 주소는 헤더를 붙이고 끝의 /chat/completions와 공백을 정리한다", async () => {
    const apiKey = "  sk-or-testkey  ";
    let seenUrl = "";
    let seenHeaders: Record<string, string> = {};
    globalThis.fetch = async (url, init) => {
      seenUrl = String(url);
      seenHeaders = init?.headers as Record<string, string>;
      return new Response(JSON.stringify({ choices: [{ message: { content: "답" } }] }), { status: 200 });
    };

    const result = await completeChat({
      baseUrl: " https://openrouter.ai/api/v1/chat/completions/ ",
      apiKey,
      model: " thinkingmachines/inkling:free ",
      content: "질문",
    });
    assert.equal(result, "답");
    assert.equal(seenUrl, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(seenHeaders.Authorization, "Bearer sk-or-testkey");
    assert.equal(seenHeaders["HTTP-Referer"].length > 0, true);
    assert.equal(seenHeaders["X-Title"], "AI Assessment Practice");
  });

  it("OpenRouter error.message와 상태 코드를 보여주고 키는 빼 둔다", async () => {
    const apiKey = "sk-or-secretvalue";
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          error: { message: `거부됨 ${apiKey}`, code: 401 },
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );

    await assert.rejects(
      () =>
        completeChat({
          baseUrl: "https://openrouter.ai/api/v1",
          apiKey,
          model: "thinkingmachines/inkling:free",
          content: "질문",
        }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /401/);
        assert.match(err.message, /거부됨/);
        assert.equal(err.message.includes(apiKey), false);
        return true;
      },
    );
  });
});
