import type { ExamClientConfig } from "./types.ts";

function readInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return fallback;
  return Math.floor(value);
}

export function getExamConfig() {
  const apiKey = process.env.OPENAI_API_KEY?.trim() ?? "";
  const copyRaw = (process.env.COPY_PROTECTION ?? "true").trim().toLowerCase();
  return {
    contextCharLimit: readInt("CONTEXT_CHAR_LIMIT", 20_000),
    aiRequestLimit: readInt("AI_REQUEST_LIMIT", 10),
    copyProtection: copyRaw !== "false" && copyRaw !== "0" && copyRaw !== "off",
    mockMode: apiKey.length === 0,
    model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
    baseUrl: (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, ""),
    apiKey,
  };
}

export function toClientConfig(config = getExamConfig()): ExamClientConfig {
  return {
    contextCharLimit: config.contextCharLimit,
    aiRequestLimit: config.aiRequestLimit,
    copyProtection: config.copyProtection,
    mockMode: config.mockMode,
    model: config.model,
  };
}
