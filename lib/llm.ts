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

export async function completeChat(input: {
  baseUrl: string;
  apiKey: string;
  model: string;
  content: string | ChatContentPart[];
  history?: readonly ModelTurn[];
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const fetchFn = input.fetchImpl ?? fetch;
  const signal = input.signal ?? AbortSignal.timeout(45_000);
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const apiKey = input.apiKey.trim();
  const responsePromise = fetchFn(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: requestHeaders(baseUrl, apiKey),
    body: JSON.stringify({
      model: input.model.trim(),
      temperature: 0.2,
      messages: buildModelMessages(input.history ?? [], input.content),
    }),
    signal,
  });
  if (input.signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }
  const response = await responsePromise;
  if (!response.ok) {
    let body = "";
    try {
      body = await response.text();
    } catch {
      body = "";
    }
    throw new ModelRequestError(response.status, errorDetail(body, apiKey));
  }
  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== "string" || text.trim() === "") {
    throw new Error("모델 응답이 비어 있습니다.");
  }
  return text.trim();
}
