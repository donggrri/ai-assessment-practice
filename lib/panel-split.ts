import { AI_PANEL_MIN, CENTER_PANEL_MIN, clampAiPanelWidth } from "./ai-panel-width";

export const RAIL_WIDTH = 76;
export const PROBLEM_RATIO_KEY = "aipractice:problem-panel-ratio:v1";
export const PASSAGE_RATIO_KEY = "aipractice:passage-split:v1";
export const PROBLEM_RATIO_DEFAULT = 0.68;
export const PASSAGE_RATIO_DEFAULT = 0.62;
export const PROBLEM_PANEL_MIN = CENTER_PANEL_MIN;
export const PASSAGE_MIN = 180;
export const ANSWER_MIN = 200;
export const SPLITTER_SIZE = 10;

type RatioStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export function clampRatio(
  ratio: number,
  available: number,
  minPrimary: number,
  minSecondary: number,
  fallback: number,
): number {
  if (!Number.isFinite(available) || available <= 0) return fallback;
  const minRatio = Math.min(1, minPrimary / available);
  const maxRatio = Math.max(0, (available - minSecondary) / available);
  if (maxRatio < minRatio) return Math.min(1, Math.max(0, maxRatio));
  const value = Number.isFinite(ratio) ? ratio : fallback;
  return Math.min(maxRatio, Math.max(minRatio, value));
}

export function splitByRatio(
  available: number,
  ratio: number,
  minPrimary: number,
  minSecondary: number,
  fallback: number,
): { primary: number; secondary: number; ratio: number } {
  const safeAvailable = Number.isFinite(available) ? Math.max(0, Math.round(available)) : 0;
  const clamped = clampRatio(ratio, safeAvailable, minPrimary, minSecondary, fallback);
  if (safeAvailable === 0) return { primary: 0, secondary: 0, ratio: clamped };
  let primary = Math.round(clamped * safeAvailable);
  if (safeAvailable >= minPrimary + minSecondary) {
    primary = Math.min(safeAvailable - minSecondary, Math.max(minPrimary, primary));
  } else {
    primary = Math.min(safeAvailable, Math.max(0, primary));
  }
  return {
    primary,
    secondary: safeAvailable - primary,
    ratio: primary / safeAvailable,
  };
}

export function readPanelRatio(storage: RatioStorage | null, key: string): number | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (raw == null || raw.trim() === "") return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > 1) return null;
    return value;
  } catch {
    return null;
  }
}

export function writePanelRatio(storage: RatioStorage | null, key: string, ratio: number): void {
  if (!storage || !Number.isFinite(ratio)) return;
  try {
    storage.setItem(key, Math.min(1, Math.max(0, ratio)).toFixed(4));
  } catch {
    // 저장에 실패해도 현재 화면 비율은 유지한다.
  }
}

/** 예전 픽셀 폭이 있으면 문제 패널 비율로 바꾼다. */
export function problemRatioFromAiPixels(aiPixels: number, available: number, viewport: number): number {
  const ai = clampAiPanelWidth(aiPixels, viewport);
  if (!Number.isFinite(available) || available <= 0) return PROBLEM_RATIO_DEFAULT;
  return clampRatio((available - ai) / available, available, PROBLEM_PANEL_MIN, AI_PANEL_MIN, PROBLEM_RATIO_DEFAULT);
}
