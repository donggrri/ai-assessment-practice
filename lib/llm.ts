import { buildModelMessages, type ModelTurn } from "./chat-thread";
import type { ChatContentPart } from "./file-attachment";
import { normalizeBaseUrl } from "./llm-settings";

export type { ModelTurn };

export class ModelRequestError extends Error {
  readonly status: number;

  constructor(status: number, detail: string) {
    const suffix = detail === "" ? "" : `: ${detail}`;
    super(`모델 요청 실패 (${status})${suffix}`);
    this.name = "ModelRequestError";
    this.status = status;
  }
}

const IMAGE_UNSUPPORTED = /image|vision|multimodal|image_url|unsupported content|expected a string/i;

export function isImageUnsupportedError(error: unknown): boolean {
  return error instanceof ModelRequestError && IMAGE_UNSUPPORTED.test(error.message);
}

function isOpenRouter(baseUrl: string): boolean {
  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase();
    return hostname === "openrouter.ai" || hostname.endsWith(".openrouter.ai");
  } catch {
    return baseUrl.toLowerCase().includes("openrouter.ai");
  }
}

function openRouterReferer(): string {
  if (typeof location !== "undefined" && location.origin && location.origin !== "null") {
    return `${location.origin}${location.pathname || "/"}`;
  }
  return "https://donggrri.github.io/ai-assessment-practice/";
}

function requestHeaders(baseUrl: string, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (isOpenRouter(baseUrl)) {
    headers["HTTP-Referer"] = openRouterReferer();
    headers["X-Title"] = "AI Assessment Practice";
  }
  return headers;
}

function redactSecrets(text: string, apiKey: string): string {
  let redacted = text;
  const key = apiKey.trim();
  if (key !== "") redacted = redacted.split(key).join("[key]");
  return redacted.replace(/\b(?:sk|or)-[A-Za-z0-9_-]{6,}\b/g, "[key]");
}

function readErrorMessage(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const error = (value as { error?: unknown }).error;
  if (typeof error === "string" && error.trim() !== "") return error.trim();
  if (typeof error === "object" && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim() !== "") return message.trim();
  }
  return null;
}

function errorDetail(body: string, apiKey: string): string {
  let message = "";
  try {
    message = readErrorMessage(JSON.parse(body)) ?? "";
  } catch {
    message = body.trim();
  }
  return redactSecrets(message, apiKey).replace(/\s+/g, " ").trim().slice(0, 400);
}

export const MODEL_TIMEOUT_MS = 300_000;
const RETRY_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504, 520, 522, 524, 529]);

/** 추론형 모델(gpt-5·o 시리즈)은 temperature 를 거부하거나 무시한다. */
export function acceptsTemperature(model: string): boolean {
  const name = model.trim().toLowerCase().split("/").pop() ?? "";
  return !/^(gpt-5|o\d)/.test(name);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("The operation was aborted.", "AbortError"));
    });
  });
}

type CompletionBody = {
  error?: unknown;
  choices?: { finish_reason?: string | null; message?: { content?: unknown; refusal?: unknown } }[];
};

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "object" && part && typeof (part as { text?: unknown }).text === "string" ? (part as { text: string }).text : ""))
      .join("");
  }
  return "";
}

export async function completeChat(input: {
  baseUrl: string;
  apiKey: string;
  model: string;
  content: string | ChatContentPart[];
  history?: readonly ModelTurn[];
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  retryDelaysMs?: readonly number[];
}): Promise<string> {
  const fetchFn = input.fetchImpl ?? fetch;
  const signal = input.signal ?? AbortSignal.timeout(input.timeoutMs ?? MODEL_TIMEOUT_MS);
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const apiKey = input.apiKey.trim();
  const model = input.model.trim();
  const body: Record<string, unknown> = {
    model,
    messages: buildModelMessages(input.history ?? [], input.content),
  };
  if (acceptsTemperature(model)) body.temperature = 0.2;
  const retryDelays = input.retryDelaysMs ?? [2_000, 5_000];

  for (let attempt = 0; ; attempt += 1) {
    let response: Response;
    try {
      const pending = fetchFn(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: requestHeaders(baseUrl, apiKey),
        body: JSON.stringify(body),
        signal,
      });
      if (signal.aborted) {
        pending.catch(() => undefined);
        throw new DOMException("The operation was aborted.", "AbortError");
      }
      response = await pending;
    } catch (error) {
      const aborted = error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError");
      if (!aborted && !signal.aborted && attempt < retryDelays.length) {
        await sleep(retryDelays[attempt], signal);
        continue;
      }
      throw error;
    }
    if (!response.ok) {
      let text = "";
      try {
        text = await response.text();
      } catch {
        text = "";
      }
      if (RETRY_STATUSES.has(response.status) && attempt < retryDelays.length) {
        await sleep(retryDelays[attempt], signal);
        continue;
      }
      throw new ModelRequestError(response.status, errorDetail(text, apiKey));
    }
    const raw = await response.text();
    let data: CompletionBody;
    try {
      data = JSON.parse(raw) as CompletionBody;
    } catch {
      throw new ModelRequestError(response.status, `응답을 해석하지 못했습니다: ${redactSecrets(raw, apiKey).slice(0, 200)}`);
    }
    // OpenRouter 는 200 응답 본문에 error 를 담아 보내기도 한다.
    const bodyError = readErrorMessage(data);
    if (bodyError) {
      const code = (data.error as { code?: unknown } | undefined)?.code;
      const status = typeof code === "number" ? code : 502;
      if (RETRY_STATUSES.has(status) && attempt < retryDelays.length) {
        await sleep(retryDelays[attempt], signal);
        continue;
      }
      throw new ModelRequestError(status, redactSecrets(bodyError, apiKey).slice(0, 400));
    }
    const choice = data.choices?.[0];
    const text = contentText(choice?.message?.content).trim();
    if (text === "") {
      const refusal = typeof choice?.message?.refusal === "string" ? choice.message.refusal : "";
      if (refusal) throw new ModelRequestError(200, `모델이 답변을 거절했습니다: ${refusal.slice(0, 200)}`);
      if (choice?.finish_reason === "length") {
        throw new ModelRequestError(200, "출력 길이 한도에 걸려 빈 응답이 왔습니다. 질문을 나눠 다시 보내세요.");
      }
      throw new Error("모델 응답이 비어 있습니다.");
    }
    if (choice?.finish_reason === "length") {
      return `${text}\n\n_(출력 길이 한도에 걸려 답변이 잘렸습니다. "이어서"라고 요청하세요.)_`;
    }
    return text;
  }
}
