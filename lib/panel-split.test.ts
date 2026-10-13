import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AI_PANEL_MIN } from "./ai-panel-width";
import {
  ANSWER_MIN,
  PASSAGE_MIN,
  PASSAGE_RATIO_DEFAULT,
  PASSAGE_RATIO_KEY,
  PROBLEM_PANEL_MIN,
  PROBLEM_RATIO_DEFAULT,
  PROBLEM_RATIO_KEY,
  clampRatio,
  problemRatioFromAiPixels,
  readPanelRatio,
  splitByRatio,
  writePanelRatio,
} from "./panel-split";

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

describe("splitByRatio", () => {
  it("문제 패널은 최소 폭보다 좁아지지 않고 AI 패널 최소 폭을 남긴다", () => {
    const narrow = splitByRatio(1200, 0.1, PROBLEM_PANEL_MIN, AI_PANEL_MIN, PROBLEM_RATIO_DEFAULT);
    assert.equal(narrow.primary, PROBLEM_PANEL_MIN);
    assert.ok(narrow.secondary >= AI_PANEL_MIN);

    const wide = splitByRatio(1200, 0.95, PROBLEM_PANEL_MIN, AI_PANEL_MIN, PROBLEM_RATIO_DEFAULT);
    assert.equal(wide.secondary, AI_PANEL_MIN);
    assert.ok(wide.primary >= PROBLEM_PANEL_MIN);
    assert.equal(wide.primary + wide.secondary, 1200);
  });

  it("숫자가 아니면 기본 비율로 나눈다", () => {
    const split = splitByRatio(1000, Number.NaN, PROBLEM_PANEL_MIN, AI_PANEL_MIN, PROBLEM_RATIO_DEFAULT);
    assert.equal(split.primary, Math.round(PROBLEM_RATIO_DEFAULT * 1000));
  });

  it("공간이 부족하면 보조 영역 최소 폭을 먼저 남긴다", () => {
    const split = splitByRatio(500, 0.9, PROBLEM_PANEL_MIN, AI_PANEL_MIN, PROBLEM_RATIO_DEFAULT);
    assert.equal(split.secondary, AI_PANEL_MIN);
    assert.equal(split.primary, 500 - AI_PANEL_MIN);
  });

  it("지문 높이는 답안 최소 높이를 남긴다", () => {
    const split = splitByRatio(700, 0.9, PASSAGE_MIN, ANSWER_MIN, PASSAGE_RATIO_DEFAULT);
    assert.equal(split.secondary, ANSWER_MIN);
    assert.ok(split.primary >= PASSAGE_MIN);
    assert.equal(clampRatio(2, 700, PASSAGE_MIN, ANSWER_MIN, PASSAGE_RATIO_DEFAULT) <= 1, true);
  });
});

describe("panel ratio storage", () => {
  it("비율을 저장하고 다시 읽는다", () => {
    const storage = memory();
    writePanelRatio(storage, PROBLEM_RATIO_KEY, 0.68438);
    assert.equal(storage.getItem(PROBLEM_RATIO_KEY), "0.6844");
    assert.equal(readPanelRatio(storage, PROBLEM_RATIO_KEY), 0.6844);
  });

  it("범위를 벗어난 값은 없는 것으로 본다", () => {
    const storage = memory();
    storage.setItem(PASSAGE_RATIO_KEY, "1.2");
    assert.equal(readPanelRatio(storage, PASSAGE_RATIO_KEY), null);
    storage.setItem(PASSAGE_RATIO_KEY, "tall");
    assert.equal(readPanelRatio(storage, PASSAGE_RATIO_KEY), null);
    assert.equal(readPanelRatio(null, PASSAGE_RATIO_KEY), null);
  });

  it("예전 AI 픽셀 폭을 문제 패널 비율로 바꾼다", () => {
    const available = 1204;
    const ratio = problemRatioFromAiPixels(380, available, 1280);
    assert.ok(ratio > 0.6 && ratio < 0.75);
    assert.equal(problemRatioFromAiPixels(380, 0, 1280), PROBLEM_RATIO_DEFAULT);
  });
});
