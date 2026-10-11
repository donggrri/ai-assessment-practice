import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assembleContext } from "./context";
import { composeModelContent, isVisionModel } from "./file-attachment";
import type { ExamFile } from "./types";

const pdf: ExamFile = {
  id: "rules",
  name: "01_규정.pdf",
  kind: "pdf",
  media: "exam-media/rules.pdf",
  content: "PDF_EXTRACT",
};

const png: ExamFile = {
  id: "label",
  name: "03_라벨.png",
  kind: "png",
  media: "exam-media/label.png",
  content: "ALT_TEXT",
};

function context(): string {
  return assembleContext({
    passage: "지문",
    question: null,
    files: [pdf, png],
    message: "질문",
  });
}

describe("isVisionModel", () => {
  it("gpt-4o-mini 는 비전 모델이다", () => {
    assert.equal(isVisionModel("gpt-4o-mini"), true);
  });

  it("gpt-4 와 gpt-3.5 는 비전 모델이 아니다", () => {
    assert.equal(isVisionModel("gpt-4"), false);
    assert.equal(isVisionModel("gpt-4-0613"), false);
    assert.equal(isVisionModel("gpt-3.5-turbo"), false);
  });

  it("gpt-4-turbo, gemini, claude 는 비전 모델이다", () => {
    assert.equal(isVisionModel("gpt-4-turbo"), true);
    assert.equal(isVisionModel("gemini-2.5-flash"), true);
    assert.equal(isVisionModel("claude-sonnet"), true);
  });
});

describe("composeModelContent", () => {
  it("PDF 는 추출 텍스트를 보내고 PNG 는 비전 모델에 이미지로 보낸다", async () => {
    const content = await composeModelContent({
      context: context(),
      files: [pdf, png],
      model: "gpt-4o-mini",
      loadMedia: async () => "data:image/png;base64,AAAA",
    });
    assert.ok(Array.isArray(content));
    const text = content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n");
    assert.match(text, /PDF_EXTRACT/);
    assert.equal(text.includes("ALT_TEXT"), false);
    assert.ok(
      content.some(
        (part) => part.type === "image_url" && part.image_url.url === "data:image/png;base64,AAAA",
      ),
    );
  });

  it("비전이 아닌 모델에는 PNG 대체 텍스트만 문자열로 보낸다", async () => {
    const content = await composeModelContent({
      context: context(),
      files: [pdf, png],
      model: "gpt-3.5-turbo",
      loadMedia: async () => "data:image/png;base64,AAAA",
    });
    assert.equal(typeof content, "string");
    assert.match(content as string, /ALT_TEXT/);
    assert.match(content as string, /PDF_EXTRACT/);
  });

  it("이미지를 읽지 못하면 PNG 대체 텍스트를 남긴다", async () => {
    const content = await composeModelContent({
      context: context(),
      files: [pdf, png],
      model: "gpt-4o-mini",
      loadMedia: async () => null,
    });
    assert.equal(typeof content, "string");
    assert.match(content as string, /ALT_TEXT/);
  });
});
