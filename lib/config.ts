import type { BuildConfig } from "./types.ts";

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return fallback;
  return Math.floor(value);
}

function parseContextCharLimit(): number {
  return parsePositiveInt(process.env.CONTEXT_CHAR_LIMIT, 20_000);
}

function parseAiRequestLimit(): number {
  return parsePositiveInt(process.env.AI_REQUEST_LIMIT, 10);
}

function parseCopyProtection(): boolean {
  const copyRaw = (process.env.COPY_PROTECTION ?? "true").trim().toLowerCase();
  return copyRaw !== "false" && copyRaw !== "0" && copyRaw !== "off";
}

export function readBuildConfig(): BuildConfig {
  return {
    contextCharLimit: parseContextCharLimit(),
    aiRequestLimit: parseAiRequestLimit(),
    copyProtection: parseCopyProtection(),
  };
}
