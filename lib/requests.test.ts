import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canSendRequest, consumeRequest, remainingRequests } from "./requests";

describe("request limit", () => {
  it("남은 횟수를 보여주고 0이면 보낼 수 없다", () => {
    assert.equal(remainingRequests(0, 10), 10);
    assert.equal(remainingRequests(7, 10), 3);
    assert.equal(canSendRequest(9, 10), true);
    assert.equal(canSendRequest(10, 10), false);
    assert.equal(remainingRequests(10, 10), 0);
    assert.equal(remainingRequests(12, 10), 0);
  });

  it("성공하면 1 줄고, 한도에 닿으면 거절한다", () => {
    const next = consumeRequest(9, 10);
    assert.equal(next.ok, true);
    if (next.ok) {
      assert.equal(next.used, 10);
      assert.equal(next.remaining, 0);
    }
    const blocked = consumeRequest(10, 10);
    assert.equal(blocked.ok, false);
    assert.equal(blocked.remaining, 0);
  });
});
