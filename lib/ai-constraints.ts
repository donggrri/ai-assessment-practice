export const ASK_COOLDOWN_MS = 30_000;
export const STRICT_KEY = "aipractice:strict-ai:v1";

export type AiGuardState = {
  v: 1;
  lastMessage: string;
  cooldownUntil: number;
};

type GuardStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function emptyAiGuard(): AiGuardState {
  return { v: 1, lastMessage: "", cooldownUntil: 0 };
}

export function guardStorageKey(setId: string): string {
  return `aipractice:ai-guard:v1:${setId}`;
}

export function loadStrictConstraints(storage: Pick<Storage, "getItem">): boolean {
  const raw = storage.getItem(STRICT_KEY);
  if (raw == null || raw === "") return true;
  return raw !== "0" && raw !== "false";
}

export function saveStrictConstraints(storage: Pick<Storage, "setItem">, enabled: boolean): void {
  storage.setItem(STRICT_KEY, enabled ? "1" : "0");
}

export function loadAiGuard(storage: Pick<Storage, "getItem">, setId: string): AiGuardState {
  const raw = storage.getItem(guardStorageKey(setId));
  if (!raw) return emptyAiGuard();
  try {
    const parsed = JSON.parse(raw) as Partial<AiGuardState>;
    if (parsed.v !== 1) return emptyAiGuard();
    return {
      v: 1,
      lastMessage: typeof parsed.lastMessage === "string" ? parsed.lastMessage : "",
      cooldownUntil: typeof parsed.cooldownUntil === "number" && Number.isFinite(parsed.cooldownUntil) ? parsed.cooldownUntil : 0,
    };
  } catch {
    return emptyAiGuard();
  }
}

export function saveAiGuard(storage: Pick<Storage, "setItem">, setId: string, state: AiGuardState): void {
  storage.setItem(guardStorageKey(setId), JSON.stringify(state));
}

export function clearAiGuard(storage: GuardStorage, setId: string): void {
  storage.removeItem(guardStorageKey(setId));
}

export function normalizeAsk(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "");
}

function levenshtein(left: string, right: string): number {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const prev = Array.from({ length: cols }, (_, index) => index);
  const next = new Array<number>(cols);
  for (let i = 1; i < rows; i += 1) {
    next[0] = i;
    for (let j = 1; j < cols; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      next[j] = Math.min(next[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j < cols; j += 1) prev[j] = next[j];
  }
  return prev[cols - 1];
}

export function isSimilarAsk(current: string, previous: string): boolean {
  const left = normalizeAsk(current);
  const right = normalizeAsk(previous);
  if (!left || !right) return false;
  if (left === right) return true;
  const min = Math.min(left.length, right.length);
  const max = Math.max(left.length, right.length);
  if (min >= 8 && min / max >= 0.8 && (left.includes(right) || right.includes(left))) return true;
  if (min < 8) return false;
  return levenshtein(left, right) / max <= 0.15;
}

export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function blocksMaterialPaste(pasted: string, materials: string[]): boolean {
  const needle = collapseWhitespace(pasted);
  if (needle.length < 12) return false;
  const haystack = collapseWhitespace(materials.filter(Boolean).join("\n"));
  return haystack.includes(needle);
}
