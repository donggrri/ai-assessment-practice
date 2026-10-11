import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { publicAssetPath, publicAssetPrefix, resolveNextBasePath } from "./next-base-path";

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

describe("publicAssetPath", () => {
  it("미설정이면 기본 하위 경로를 붙인다", () => {
    assert.equal(publicAssetPrefix(undefined), "/ai-assessment-practice");
    assert.equal(
      publicAssetPath("exam-media/beverage-survey/01_guide.pdf", publicAssetPrefix(undefined)),
      "/ai-assessment-practice/exam-media/beverage-survey/01_guide.pdf",
    );
  });

  it("빈 문자열이면 루트 상대 경로만 반환한다", () => {
    assert.equal(publicAssetPath("exam-media/a.png", ""), "/exam-media/a.png");
  });

  it("접두사 끝 슬래시는 한 번만 둔다", () => {
    assert.equal(publicAssetPath("/exam-media/a.png", "/docs/"), "/docs/exam-media/a.png");
  });
});
