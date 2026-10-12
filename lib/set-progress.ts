import type { QuestionType } from "./types";

export type ScoreSnapshot = {
  score: number;
  correctCount: number;
  total: number;
};

export type ProgressView = {
  solved: boolean;
  started: boolean;
  bestScore: number | null;
  label: string;
};

export function setKindLabel(category: string | undefined, types: readonly QuestionType[]): string {
  const named = category?.trim();
  if (named) return named;
  const kinds = new Set(types);
  if (kinds.size === 1 && kinds.has("multiple")) return "객관식";
  if (kinds.size === 1 && kinds.has("short")) return "주관식";
  if (kinds.has("short") && kinds.has("multiple")) return "주관식·객관식";
  return "주관식";
}

export function pickBestScore(stored: ScoreSnapshot | null, report: ScoreSnapshot | null): ScoreSnapshot | null {
  if (!stored) return report;
  if (!report) return stored;
  return report.score > stored.score ? report : stored;
}

export function describeProgress(best: ScoreSnapshot | null, started: boolean): ProgressView {
  if (best) {
    return {
      solved: true,
      started: true,
      bestScore: best.score,
      label: `최고 ${best.score}점`,
    };
  }
  if (started) {
    return { solved: false, started: true, bestScore: null, label: "풀이 중" };
  }
  return { solved: false, started: false, bestScore: null, label: "미풀이" };
}

export function attemptStarted(input: {
  saved?: Record<string, string>;
  drafts?: Record<string, string>;
  messageCount: number;
  hasReport: boolean;
}): boolean {
  if (input.hasReport || input.messageCount > 0) return true;
  const filled = (record?: Record<string, string>) =>
    Object.values(record ?? {}).some((value) => value.trim() !== "");
  return filled(input.saved) || filled(input.drafts);
}
