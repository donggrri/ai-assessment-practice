const STORAGE_KEY = "aipractice:llm:v1";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";

export type LlmSettings = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

export type LlmSettingsStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type LlmSettingsResult = { ok: true } | { ok: false };

function defaultSettings(): LlmSettings {
  return {
    apiKey: "",
    baseUrl: DEFAULT_BASE_URL,
    model: DEFAULT_MODEL,
  };
}

function resolveStorage(storage?: LlmSettingsStorage): LlmSettingsStorage | null {
  if (storage !== undefined) {
    return storage;
  }
  if (typeof window !== "undefined") {
    return window.localStorage;
  }
  return null;
}

export function loadLlmSettings(storage?: LlmSettingsStorage): LlmSettings {
  const resolved = resolveStorage(storage);
  if (!resolved) {
    return defaultSettings();
  }

  try {
    const raw = resolved.getItem(STORAGE_KEY);
    if (raw === null || raw === "") {
      return defaultSettings();
    }
    const parsed = JSON.parse(raw) as Partial<LlmSettings>;
    return {
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
      baseUrl:
        typeof parsed.baseUrl === "string" && parsed.baseUrl !== ""
          ? parsed.baseUrl
          : DEFAULT_BASE_URL,
      model:
        typeof parsed.model === "string" && parsed.model !== ""
          ? parsed.model
          : DEFAULT_MODEL,
    };
  } catch {
    return defaultSettings();
  }
}

export function saveLlmSettings(
  settings: LlmSettings,
  storage?: LlmSettingsStorage,
): LlmSettingsResult {
  const resolved = resolveStorage(storage);
  if (!resolved) {
    return { ok: false };
  }

  try {
    resolved.setItem(STORAGE_KEY, JSON.stringify(settings));
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export function clearLlmSettings(storage?: LlmSettingsStorage): LlmSettingsResult {
  const resolved = resolveStorage(storage);
  if (!resolved) {
    return { ok: false };
  }

  try {
    resolved.removeItem(STORAGE_KEY);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export function normalizeBaseUrl(baseUrl: string): string {
  let trimmed = baseUrl.trim();
  if (trimmed === "") {
    return DEFAULT_BASE_URL;
  }
  trimmed = trimmed.replace(/\/+$/, "");
  while (/\/chat\/completions$/i.test(trimmed)) {
    trimmed = trimmed.replace(/\/chat\/completions$/i, "").replace(/\/+$/, "");
  }
  return trimmed === "" ? DEFAULT_BASE_URL : trimmed;
}

export function normalizeLlmSettings(settings: LlmSettings): LlmSettings {
  const model = settings.model.trim();
  return {
    apiKey: settings.apiKey.trim(),
    baseUrl: normalizeBaseUrl(settings.baseUrl),
    model: model === "" ? DEFAULT_MODEL : model,
  };
}

export function isMockMode(settings: LlmSettings): boolean {
  return settings.apiKey.trim() === "";
}
