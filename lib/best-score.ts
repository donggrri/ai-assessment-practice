import { pickBestScore, type ScoreSnapshot } from "./set-progress";

type ScoreReader = Pick<Storage, "getItem">;
type ScoreStorage = Pick<Storage, "getItem" | "setItem">;

export function bestScoreKey(setId: string): string {
  return `aipractice:best:v1:${setId}`;
}

export function loadBestScore(setId: string, storage: ScoreReader): ScoreSnapshot | null {
  try {
    const raw = storage.getItem(bestScoreKey(setId));
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<ScoreSnapshot> & { v?: number };
    if (!data || data.v !== 1 || typeof data.score !== "number" || !Number.isFinite(data.score)) return null;
    return {
      score: data.score,
      correctCount: typeof data.correctCount === "number" ? data.correctCount : 0,
      total: typeof data.total === "number" ? data.total : 0,
    };
  } catch {
    return null;
  }
}

export function recordBestScore(setId: string, next: ScoreSnapshot, storage: ScoreStorage): ScoreSnapshot {
  const current = loadBestScore(setId, storage);
  const winner = pickBestScore(current, next) ?? next;
  if (!current || winner !== current) {
    storage.setItem(
      bestScoreKey(setId),
      JSON.stringify({ v: 1, score: winner.score, correctCount: winner.correctCount, total: winner.total }),
    );
  }
  return winner;
}
