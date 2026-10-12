export const AI_PANEL_DEFAULT = 380;
export const AI_PANEL_MIN = 280;
export const LEFT_PANEL_WIDTH = 300;
export const CENTER_PANEL_MIN = 360;
export const AI_PANEL_WIDTH_KEY = "aipractice:ai-panel-width:v1";

type WidthStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export function maxAiPanelWidth(viewportWidth: number): number {
  return Math.max(AI_PANEL_MIN, viewportWidth - LEFT_PANEL_WIDTH - CENTER_PANEL_MIN);
}

export function clampAiPanelWidth(width: number, viewportWidth: number): number {
  const max = maxAiPanelWidth(viewportWidth);
  const min = Math.min(AI_PANEL_MIN, max);
  if (!Number.isFinite(width)) return Math.min(AI_PANEL_DEFAULT, max);
  return Math.min(max, Math.max(min, Math.round(width)));
}

export function readAiPanelWidth(storage: WidthStorage | null): number | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(AI_PANEL_WIDTH_KEY);
    if (raw == null || raw.trim() === "") return null;
    const value = Number(raw);
    if (!Number.isFinite(value)) return null;
    return value;
  } catch {
    return null;
  }
}

export function writeAiPanelWidth(storage: WidthStorage | null, width: number): void {
  if (!storage) return;
  try {
    storage.setItem(AI_PANEL_WIDTH_KEY, String(Math.round(width)));
  } catch {
    // 저장 공간이 가득 차도 화면 폭은 유지한다.
  }
}
