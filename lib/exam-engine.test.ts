// 이 테스트는 lib/problem-sets.ts를 import하지 않는다

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createExamEngine } from "./exam-engine";
import type { GradeReport, ProblemSet } from "./types";

type LlmSettings = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

const sampleSet: ProblemSet = {
  id: "sample",
  title: "샘플",
  passage: "공통지문",
  files: [
    { id: "f1", name: "규칙.md", content: "규칙본문" },
    { id: "f2", name: "표.md", content: "표본문" },
  ],
  questions: [
    {
      id: "q1",
      number: 1,
      type: "short",
      prompt: "답을 적으세요",
      answer: "정답",
      explanation: "해설",
    },
    {
      id: "q2",
      number: 2,
      type: "multiple",
      prompt: "고르세요",
      choices: [
        { id: "a", text: "보기A" },
        { id: "b", text: "보기B" },
      ],
      answer: "b",
      explanation: "해설2",
    },
  ],
};

const defaultConfig = {
  contextCharLimit: 20000,
  aiRequestLimit: 10,
  copyProtection: true,
};

const defaultSettings: LlmSettings = {
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
};

function baseSendInput(requestsUsed = 0) {
  return {
    problemSetId: "sample",
    questionId: "q1",
    fileIds: [] as string[],
    message: "질문합니다",
    requestsUsed,
  };
}

describe("createExamEngine", () => {
  it("엔진을 만든 뒤 저장소에 키를 넣으면 다음 send가 fetchImpl을 호출한다", async () => {
    let settings: LlmSettings = { ...defaultSettings, apiKey: "" };
    let fetchCalls = 0;
    const fetchImpl: typeof fetch = async () => {
      fetchCalls += 1;
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "모델답" } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const engine = createExamEngine({
      sets: [sampleSet],
      config: defaultConfig,
      readSettings: () => settings,
      fetchImpl,
    });

    const mockResult = await engine.send(baseSendInput(0));
    assert.equal(fetchCalls, 0);
    assert.equal(mockResult.ok, true);
    if (!mockResult.ok) return;
    assert.equal(mockResult.mock, true);

    settings = {
      apiKey: "sk-test",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
    };

    const liveResult = await engine.send(baseSendInput(0));
    assert.equal(fetchCalls, 1);
    assert.equal(liveResult.ok, true);
    if (!liveResult.ok) return;
    assert.equal(liveResult.mock, false);
    assert.equal(liveResult.reply, "모델답");
  });

  it("readSettings가 throw하면 모의 응답(ok:true, mock:true)이고 ok:false가 아니다", async () => {
    const engine = createExamEngine({
      sets: [sampleSet],
      config: defaultConfig,
      readSettings: () => {
        throw new Error("storage read failed");
      },
    });

    const result = await engine.send(baseSendInput(0));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.mock, true);
  });

  it("send 입력은 { problemSetId, questionId, fileIds, message, requestsUsed }. 없는 세트는 ok:false, error \"not_found\"", async () => {
    const engine = createExamEngine({
      sets: [sampleSet],
      config: defaultConfig,
      readSettings: () => defaultSettings,
    });

    const result = await engine.send({
      problemSetId: "missing-set",
      questionId: "q1",
      fileIds: [],
      message: "질문",
      requestsUsed: 0,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error, "not_found");
  });

  it("message가 공백이면 ok:false, error \"empty_message\", requestsUsed 필드 없음", async () => {
    const engine = createExamEngine({
      sets: [sampleSet],
      config: defaultConfig,
      readSettings: () => defaultSettings,
    });

    const result = await engine.send({
      ...baseSendInput(0),
      message: "   \t\n",
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error, "empty_message");
    assert.equal("requestsUsed" in result, false);
  });

  it("requestsUsed가 한도(10) 이상이면 ok:false, error \"request_limit\", requestsUsed 필드 없음", async () => {
    const engine = createExamEngine({
      sets: [sampleSet],
      config: defaultConfig,
      readSettings: () => defaultSettings,
    });

    const result = await engine.send(baseSendInput(10));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error, "request_limit");
    assert.equal("requestsUsed" in result, false);
  });

  it("fetch가 거절·비 2xx·빈 본문이면 ok:false이고 requestsUsed가 없으며, request_limit만 error가 request_limit이다", async () => {
    const keyedSettings: LlmSettings = {
      apiKey: "sk-test",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
    };
    const modelFailMessage = "모델 호출에 실패했습니다. 잠시 후 다시 시도하세요.";

    const rejectEngine = createExamEngine({
      sets: [sampleSet],
      config: defaultConfig,
      readSettings: () => keyedSettings,
      fetchImpl: async () => {
        throw new Error("network down");
      },
    });
    const rejected = await rejectEngine.send(baseSendInput(0));
    assert.equal(rejected.ok, false);
    if (rejected.ok) return;
    assert.equal(rejected.error, "model_error");
    assert.equal(rejected.message, modelFailMessage);
    assert.equal("requestsUsed" in rejected, false);

    const statusEngine = createExamEngine({
      sets: [sampleSet],
      config: defaultConfig,
      readSettings: () => keyedSettings,
      fetchImpl: async () => new Response("internal", { status: 500 }),
    });
    const serverError = await statusEngine.send(baseSendInput(0));
    assert.equal(serverError.ok, false);
    if (serverError.ok) return;
    assert.equal(serverError.error, "model_error");
    assert.match(serverError.message, /500/);
    assert.match(serverError.message, /internal/);
    assert.equal(serverError.message.includes("sk-test"), false);
    assert.equal("requestsUsed" in serverError, false);

    const emptyBodyEngine = createExamEngine({
      sets: [sampleSet],
      config: defaultConfig,
      readSettings: () => keyedSettings,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "" } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    });
    const emptyContent = await emptyBodyEngine.send(baseSendInput(0));
    assert.equal(emptyContent.ok, false);
    if (emptyContent.ok) return;
    assert.equal(emptyContent.error, "model_error");
    assert.match(emptyContent.message, /비어/);
    assert.equal("requestsUsed" in emptyContent, false);

    const limitEngine = createExamEngine({
      sets: [sampleSet],
      config: defaultConfig,
      readSettings: () => defaultSettings,
    });
    const limited = await limitEngine.send(baseSendInput(10));
    assert.equal(limited.ok, false);
    if (limited.ok) return;
    assert.equal(limited.error, "request_limit");
    assert.notEqual(limited.error, "model_error");
  });

  it('grade("없는id", {})는 throw하지 않고 { error: "not_found", message: "문제 세트를 찾을 수 없습니다." }', () => {
    const engine = createExamEngine({
      sets: [sampleSet],
      config: defaultConfig,
      readSettings: () => defaultSettings,
    });

    const result = engine.grade("없는id", {});
    assert.deepEqual(result, {
      error: "not_found",
      message: "문제 세트를 찾을 수 없습니다.",
    });
  });

  it('grade("sample", { q1: "정답", q2: "b" })는 correctCount 2, total 2', () => {
    const engine = createExamEngine({
      sets: [sampleSet],
      config: defaultConfig,
      readSettings: () => defaultSettings,
    });

    const report = engine.grade("sample", { q1: "정답", q2: "b" }) as GradeReport;
    assert.equal(report.correctCount, 2);
    assert.equal(report.total, 2);
  });

  it('getPublic("sample")의 questions에 answer, explanation 필드가 없다. list()는 [{id:"sample", title:"샘플", questionCount:2, fileCount:2}]', () => {
    const engine = createExamEngine({
      sets: [sampleSet],
      config: defaultConfig,
      readSettings: () => defaultSettings,
    });

    const publicSet = engine.getPublic("sample");
    assert.equal(publicSet.passage.length, 4);
    for (const question of publicSet.questions) {
      assert.equal("answer" in question, false);
      assert.equal("explanation" in question, false);
    }

    assert.deepEqual(engine.list(), [
      { id: "sample", title: "샘플", kind: "주관식·객관식", questionCount: 2, fileCount: 2 },
    ]);
  });

  it("비전 모델에는 PNG 이미지를 붙이고 PDF 추출 텍스트를 유지한다", async () => {
    const visualSet: ProblemSet = {
      ...sampleSet,
      id: "visual",
      files: [
        { id: "doc", name: "규정.pdf", kind: "pdf", media: "exam-media/rules.pdf", content: "PDF_EXTRACT" },
        { id: "pic", name: "라벨.png", kind: "png", media: "exam-media/label.png", content: "ALT_TEXT" },
      ],
    };
    let userContent: unknown;
    const engine = createExamEngine({
      sets: [visualSet],
      config: defaultConfig,
      readSettings: () => ({
        apiKey: "sk-test",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
      }),
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as {
          messages: { role: string; content: unknown }[];
        };
        userContent = body.messages.find((message) => message.role === "user")?.content;
        return new Response(JSON.stringify({ choices: [{ message: { content: "모델답" } }] }), {
          status: 200,
        });
      },
      loadMedia: async () => "data:image/png;base64,AAAA",
    });
    const result = await engine.send({
      problemSetId: "visual",
      questionId: "q1",
      fileIds: ["doc", "pic"],
      message: "읽어줘",
      requestsUsed: 0,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(result.charCount >= "ALT_TEXT".length + "PDF_EXTRACT".length);
    assert.ok(Array.isArray(userContent));
    const parts = userContent as { type: string; text?: string; image_url?: { url: string } }[];
    const text = parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n");
    assert.match(text, /PDF_EXTRACT/);
    assert.equal(text.includes("ALT_TEXT"), false);
    assert.ok(parts.some((part) => part.type === "image_url" && part.image_url?.url.startsWith("data:image/png")));
  });

  it("이미지를 거부하면 대체 텍스트로 한 번 더 보내고, OpenRouter 오류 문구를 그대로 보여 준다", async () => {
    const visualSet: ProblemSet = {
      ...sampleSet,
      id: "visual",
      files: [
        { id: "doc", name: "규정.pdf", kind: "pdf", media: "exam-media/rules.pdf", content: "PDF_EXTRACT" },
        { id: "pic", name: "라벨.png", kind: "png", media: "exam-media/label.png", content: "ALT_TEXT" },
      ],
    };
    const apiKey = "sk-or-secretvalue";
    const bodies: unknown[] = [];
    let calls = 0;
    const engine = createExamEngine({
      sets: [visualSet],
      config: defaultConfig,
      readSettings: () => ({
        apiKey: `  ${apiKey}  `,
        baseUrl: " https://openrouter.ai/api/v1/chat/completions/ ",
        model: " gpt-4o-mini ",
      }),
      fetchImpl: async (url, init) => {
        calls += 1;
        assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
        const headers = init?.headers as Record<string, string>;
        assert.equal(headers.Authorization, `Bearer ${apiKey}`);
        assert.equal(headers["X-Title"], "AI Assessment Practice");
        const body = JSON.parse(String(init?.body)) as {
          model: string;
          messages: { role: string; content: unknown }[];
        };
        assert.equal(body.model, "gpt-4o-mini");
        bodies.push(body.messages.find((message) => message.role === "user")?.content);
        if (calls === 1) {
          return new Response(
            JSON.stringify({ error: { message: `No endpoints found that support image input ${apiKey}`, code: 404 } }),
            { status: 404 },
          );
        }
        return new Response(JSON.stringify({ choices: [{ message: { content: "텍스트답" } }] }), {
          status: 200,
        });
      },
      loadMedia: async () => "data:image/png;base64,AAAA",
    });
    const result = await engine.send({
      problemSetId: "visual",
      questionId: "q1",
      fileIds: ["doc", "pic"],
      message: "읽어줘",
      requestsUsed: 0,
    });
    assert.equal(calls, 2);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.reply, "텍스트답");
    assert.equal(JSON.stringify(bodies[0]).includes("ALT_TEXT"), false);
    assert.match(String(bodies[1]), /ALT_TEXT/);
    assert.equal(JSON.stringify(bodies).includes(apiKey), false);

    const failEngine = createExamEngine({
      sets: [sampleSet],
      config: defaultConfig,
      readSettings: () => ({
        apiKey,
        baseUrl: "https://openrouter.ai/api/v1",
        model: "thinkingmachines/inkling:free",
      }),
      fetchImpl: async () =>
        new Response(JSON.stringify({ error: { message: `키 오류 ${apiKey}` } }), { status: 401 }),
    });
    const failed = await failEngine.send(baseSendInput(0));
    assert.equal(failed.ok, false);
    if (failed.ok) return;
    assert.match(failed.message, /401/);
    assert.match(failed.message, /키 오류/);
    assert.equal(failed.message.includes(apiKey), false);
  });

  it("두 번째 요청 payload에 첫 user(첨부 본문)와 assistant가 들어간다. 모의와 fetch 모두", async () => {
    const filesSet: ProblemSet = {
      ...sampleSet,
      id: "files",
      passage: "지문",
      files: [
        { id: "a", name: "A.md", content: "FILE_A_BODY" },
        { id: "b", name: "B.md", content: "FILE_B_BODY" },
        { id: "c", name: "C.md", content: "FILE_C_BODY" },
      ],
    };
    const turn = (fileIds: string[], message: string, requestsUsed: number, history?: { role: "user" | "assistant"; content: string }[]) => ({
      problemSetId: "files",
      questionId: "q1",
      fileIds,
      message,
      requestsUsed,
      history,
    });

    const mockEngine = createExamEngine({
      sets: [filesSet],
      config: defaultConfig,
      readSettings: () => defaultSettings,
    });
    const first = await mockEngine.send(turn(["a", "b"], "첫번째", 0, []));
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.mock, true);
    assert.match(first.userContent, /FILE_A_BODY/);
    assert.match(first.userContent, /FILE_B_BODY/);
    assert.match(first.reply, /이전 대화 0턴/);
    assert.equal(first.messages[0].role, "system");
    assert.match(String(first.messages[0].content), /이번 대화에서 지금까지 주고받은 메시지/);
    assert.equal(String(first.messages[0].content).includes("이전 대화 없음"), false);

    const second = await mockEngine.send(
      turn(["c"], "합쳐", 1, [
        { role: "user", content: first.userContent },
        { role: "assistant", content: first.reply },
      ]),
    );
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.messages.length, 4);
    assert.equal(second.messages[1].role, "user");
    assert.match(String(second.messages[1].content), /FILE_A_BODY/);
    assert.match(String(second.messages[1].content), /FILE_B_BODY/);
    assert.equal(second.messages[2].role, "assistant");
    assert.equal(second.messages[2].content, first.reply);
    assert.match(String(second.messages[3].content), /FILE_C_BODY/);
    assert.match(second.reply, /이전 대화 2턴/);
    const mockBlob = second.messages.map((message) => String(message.content)).join("\n");
    assert.match(mockBlob, /FILE_A_BODY/);
    assert.match(mockBlob, /FILE_B_BODY/);
    assert.match(mockBlob, /FILE_C_BODY/);

    const payloads: { messages: { role: string; content: string }[] }[] = [];
    const liveEngine = createExamEngine({
      sets: [filesSet],
      config: { ...defaultConfig, contextCharLimit: 400 },
      readSettings: () => ({
        apiKey: "sk-test",
        baseUrl: "https://api.example.com/v1",
        model: "gpt-4",
      }),
      fetchImpl: async (_url, init) => {
        payloads.push(JSON.parse(String(init?.body)) as { messages: { role: string; content: string }[] });
        return new Response(
          JSON.stringify({ choices: [{ message: { content: `답${payloads.length}` } }] }),
          { status: 200 },
        );
      },
    });
    const liveFirst = await liveEngine.send(turn(["a", "b"], "첫번째", 0));
    assert.equal(liveFirst.ok, true);
    if (!liveFirst.ok) return;
    assert.match(liveFirst.userContent, /FILE_A_BODY/);
    const liveSecond = await liveEngine.send(
      turn(["c"], "합쳐", 1, [
        { role: "user", content: liveFirst.userContent },
        { role: "assistant", content: liveFirst.reply },
      ]),
    );
    assert.equal(liveSecond.ok, true);
    if (!liveSecond.ok) return;
    assert.equal(payloads.length, 2);
    const sent = payloads[1].messages;
    assert.equal(sent.length, 4);
    assert.match(sent[0].content, /이번 대화에서 지금까지 주고받은 메시지\(이전 턴의 첨부 파일과 네가 만든 표 포함\)/);
    assert.equal(sent[0].content.includes("첨부되지 않은 자료는 없다고"), false);
    assert.equal(sent[1].role, "user");
    assert.match(sent[1].content, /FILE_A_BODY/);
    assert.match(sent[1].content, /FILE_B_BODY/);
    assert.deepEqual(sent[2], { role: "assistant", content: "답1" });
    assert.match(sent[3].content, /FILE_C_BODY/);
    assert.equal(liveSecond.messages[2].content, "답1");

    const hugeHistory = "H".repeat(5000);
    const overHistory = await liveEngine.send(
      turn(["c"], "이번만", 2, [
        { role: "user", content: hugeHistory },
        { role: "assistant", content: "이전답" },
      ]),
    );
    assert.equal(overHistory.ok, true);
    if (!overHistory.ok) return;
    assert.match(String(overHistory.messages[1].content), /H{5000}/);
    assert.match(String(overHistory.messages[3].content), /FILE_C_BODY/);
  });

  it("이미지를 거부해 다시 보낼 때도 이전 대화를 유지한다", async () => {
    const visualSet: ProblemSet = {
      ...sampleSet,
      id: "visual-history",
      files: [
        { id: "doc", name: "규정.pdf", kind: "pdf", media: "exam-media/rules.pdf", content: "PDF_EXTRACT" },
        { id: "pic", name: "라벨.png", kind: "png", media: "exam-media/label.png", content: "ALT_TEXT" },
      ],
    };
    const bodies: { role: string; content: unknown }[][] = [];
    let calls = 0;
    const engine = createExamEngine({
      sets: [visualSet],
      config: defaultConfig,
      readSettings: () => ({
        apiKey: "sk-test",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
      }),
      fetchImpl: async (_url, init) => {
        calls += 1;
        const body = JSON.parse(String(init?.body)) as { messages: { role: string; content: unknown }[] };
        bodies.push(body.messages);
        if (calls === 1) {
          return new Response(JSON.stringify({ error: { message: "image input unsupported", code: 400 } }), {
            status: 400,
          });
        }
        return new Response(JSON.stringify({ choices: [{ message: { content: "텍스트답" } }] }), { status: 200 });
      },
      loadMedia: async () => "data:image/png;base64,AAAA",
    });
    const result = await engine.send({
      problemSetId: "visual-history",
      questionId: "q1",
      fileIds: ["doc", "pic"],
      message: "읽어줘",
      requestsUsed: 0,
      history: [
        { role: "user", content: "PREV_FILE_BODY" },
        { role: "assistant", content: "이전표" },
      ],
    });
    assert.equal(calls, 2);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.match(result.userContent, /ALT_TEXT/);
    assert.match(result.userContent, /PDF_EXTRACT/);
    for (const messages of bodies) {
      assert.deepEqual(messages[1], { role: "user", content: "PREV_FILE_BODY" });
      assert.deepEqual(messages[2], { role: "assistant", content: "이전표" });
    }
    assert.equal(Array.isArray(bodies[0][3].content), true);
    assert.match(String(bodies[1][3].content), /ALT_TEXT/);
    assert.match(String(bodies[1][3].content), /PDF_EXTRACT/);
    assert.equal(result.messages[1].content, "PREV_FILE_BODY");
    assert.match(String(result.messages[3].content), /ALT_TEXT/);
  });

  it("성공한 모의 send는 requestsUsed가 1이다(consume). 컨텍스트 한도 초과면 error \"context_limit\"이고 requestsUsed 없음", async () => {
    const engine = createExamEngine({
      sets: [sampleSet],
      config: defaultConfig,
      readSettings: () => defaultSettings,
    });

    const mockOk = await engine.send(baseSendInput(0));
    assert.equal(mockOk.ok, true);
    if (!mockOk.ok) return;
    assert.equal(mockOk.requestsUsed, 1);

    const tightEngine = createExamEngine({
      sets: [sampleSet],
      config: { ...defaultConfig, contextCharLimit: 5 },
      readSettings: () => defaultSettings,
    });
    const overLimit = await tightEngine.send({
      ...baseSendInput(0),
      message: "여섯글자넘김",
    });
    assert.equal(overLimit.ok, false);
    if (overLimit.ok) return;
    assert.equal(overLimit.error, "context_limit");
    assert.equal("requestsUsed" in overLimit, false);
  });
});
