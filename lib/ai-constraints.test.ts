import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ASK_COOLDOWN_MS,
  blocksMaterialPaste,
  clearAiGuard,
  emptyAiGuard,
  isSimilarAsk,
  loadAiGuard,
  loadStrictConstraints,
  saveAiGuard,
  saveStrictConstraints,
} from "./ai-constraints";

function memory() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

describe("strict ai constraints", () => {
  it("실전 제약은 저장값이 없으면 켜져 있다", () => {
    const storage = memory();
    assert.equal(loadStrictConstraints(storage), true);
    saveStrictConstraints(storage, false);
    assert.equal(loadStrictConstraints(storage), false);
    saveStrictConstraints(storage, true);
    assert.equal(loadStrictConstraints(storage), true);
  });

  it("직전 질문과 같거나 거의 같으면 경고 대상이다", () => {
    assert.equal(isSimilarAsk("  나트륨 상한 알려줘  ", "나트륨 상한 알려줘"), true);
    assert.equal(isSimilarAsk("나트륨 상한을 알려줘", "나트륨 상한 알려줘"), true);
    assert.equal(isSimilarAsk("수출국이 둘이면 어떻게 봐?", "어린이 카페인 기준이 뭐야?"), false);
    assert.equal(isSimilarAsk("짧은글", "짧은글자"), false);
  });

  it("지문과 같은 긴 붙여넣기만 막는다", () => {
    const passage = "노을푸드 가공식품을 한국과 EU로 내보내기 전 검수한다.";
    assert.equal(blocksMaterialPaste("노을푸드 가공식품을 한국과 EU로", [passage]), true);
    assert.equal(blocksMaterialPaste("  노을푸드   가공식품을 한국과 EU로  ", [passage]), true);
    assert.equal(blocksMaterialPaste("상한이 뭐야", [passage]), false);
    assert.equal(blocksMaterialPaste("직접 타이핑한 질문입니다", [passage]), false);
  });

  it("대기 시각과 직전 질문을 세트별로 저장하고 실전 재시작 때 지운다", () => {
    const storage = memory();
    const until = 1_700_000_000_000 + ASK_COOLDOWN_MS;
    saveAiGuard(storage, "live", { v: 1, lastMessage: "같은 질문", cooldownUntil: until });
    assert.deepEqual(loadAiGuard(storage, "live"), { v: 1, lastMessage: "같은 질문", cooldownUntil: until });
    assert.deepEqual(loadAiGuard(storage, "bright-life-review"), emptyAiGuard());
    clearAiGuard(storage, "live");
    assert.deepEqual(loadAiGuard(storage, "live"), emptyAiGuard());
  });
});
