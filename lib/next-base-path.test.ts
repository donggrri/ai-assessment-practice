import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveNextBasePath } from "./next-base-path";

describe("resolveNextBasePath", () => {
  it("미설정(undefined)이면 기본 basePath와 assetPrefix를 반환한다", () => {
    assert.deepEqual(resolveNextBasePath(undefined), {
      basePath: "/ai-assessment-practice",
      assetPrefix: "/ai-assessment-practice",
    });
  });

  it('빈 문자열("")이면 basePath·assetPrefix 키 없는 객체를 반환한다', () => {
    const result = resolveNextBasePath("");
    assert.deepEqual(result, {});
    assert.equal("basePath" in result, false);
    assert.equal("assetPrefix" in result, false);
  });

  it('"/docs"이면 basePath와 assetPrefix 모두 "/docs"이다', () => {
    assert.deepEqual(resolveNextBasePath("/docs"), {
      basePath: "/docs",
      assetPrefix: "/docs",
    });
  });

  it('"/"만 주면 키 없는 객체를 반환한다(루트 경로는 설정으로 쓰지 않음)', () => {
    const result = resolveNextBasePath("/");
    assert.deepEqual(result, {});
    assert.equal("basePath" in result, false);
    assert.equal("assetPrefix" in result, false);
  });
});
