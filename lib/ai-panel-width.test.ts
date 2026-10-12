import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AI_PANEL_DEFAULT,
  AI_PANEL_MIN,
  AI_PANEL_WIDTH_KEY,
  CENTER_PANEL_MIN,
  LEFT_PANEL_WIDTH,
  clampAiPanelWidth,
  maxAiPanelWidth,
  readAiPanelWidth,
  writeAiPanelWidth,
} from "./ai-panel-width";

function memory() {
  const store = new Map<string, string>();
  return {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

describe("clampAiPanelWidth", () => {
  it("최소 폭보다 좁히지 않는다", () => {
    assert.equal(clampAiPanelWidth(100, 1600), AI_PANEL_MIN);
  });

  it("가운데 패널 최소 폭을 남기고 최대를 막는다", () => {
    const viewport = 1400;
    const max = maxAiPanelWidth(viewport);
    assert.equal(max, viewport - LEFT_PANEL_WIDTH - CENTER_PANEL_MIN);
    assert.equal(clampAiPanelWidth(900, viewport), max);
    assert.ok(viewport - LEFT_PANEL_WIDTH - max >= CENTER_PANEL_MIN);
  });

  it("숫자가 아니면 기본 폭으로 되돌린다", () => {
    assert.equal(clampAiPanelWidth(Number.NaN, 1600), AI_PANEL_DEFAULT);
  });

  it("창이 좁으면 기본 폭도 가운데가 남도록 줄인다", () => {
    const viewport = 1024;
    const width = clampAiPanelWidth(AI_PANEL_DEFAULT, viewport);
    assert.ok(width < AI_PANEL_DEFAULT);
    assert.ok(viewport - LEFT_PANEL_WIDTH - width >= CENTER_PANEL_MIN);
  });
});

describe("ai panel width storage", () => {
  it("저장한 폭을 다시 읽는다", () => {
    const storage = memory();
    writeAiPanelWidth(storage, 452.2);
    assert.equal(storage.getItem(AI_PANEL_WIDTH_KEY), "452");
    assert.equal(readAiPanelWidth(storage), 452);
  });

  it("잘못된 값은 없는 것으로 본다", () => {
    const storage = memory();
    storage.setItem(AI_PANEL_WIDTH_KEY, "wide");
    assert.equal(readAiPanelWidth(storage), null);
    assert.equal(readAiPanelWidth(null), null);
  });
});
