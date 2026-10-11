import { publicAssetPath } from "./next-base-path";
import type { ExamFile } from "./types";

export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

const VISION_PATTERNS = [
  /gpt-4o/,
  /gpt-4\.1/,
  /gpt-4-turbo/,
  /gpt-5/,
  /(?:^|[^a-z0-9])o1(?:[^a-z0-9]|$)/,
  /(?:^|[^a-z0-9])o3(?:[^a-z0-9]|$)/,
  /(?:^|[^a-z0-9])o4(?:[^a-z0-9]|$)/,
  /vision/,
  /gemini/,
  /claude/,
  /pixtral/,
  /llava/,
  /qwen[\w.-]*vl/,
];

/** 원본 gpt-4 와 gpt-3.5 는 이미지가 없고, gpt-4o / gpt-4.1 / gpt-4-turbo 는 있다. */
export function isVisionModel(model: string): boolean {
  const name = model.trim().toLowerCase();
  if (!name) return false;
  if (/(?:^|[^a-z0-9])gpt-3\.5/.test(name)) return false;
  if (/gpt-4(?:[^a-z0-9.]|$)/.test(name) && !/gpt-4o|gpt-4\.1|gpt-4-turbo|vision/.test(name)) {
    return false;
  }
  return VISION_PATTERNS.some((pattern) => pattern.test(name));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

/** PNG 를 data URL 로 읽는다. 실패하면 null 이라 호출 측이 대체 텍스트를 쓴다. */
export async function loadPublicImage(media: string): Promise<string | null> {
  if (typeof fetch !== "function") return null;
  try {
    const response = await fetch(publicAssetPath(media));
    if (!response.ok) return null;
    const blob = await response.blob();
    const mime = blob.type || "image/png";
    if (!mime.startsWith("image/")) return null;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.length === 0) return null;
    return `data:${mime};base64,${bytesToBase64(bytes)}`;
  } catch {
    return null;
  }
}

/**
 * PDF 는 추출 텍스트를 그대로 둔다.
 * PNG 는 비전 모델이고 이미지를 읽었을 때만 대체 텍스트를 빼고 이미지를 붙인다.
 * 글자 수 한도는 여기서 바꾸지 않는다. 한도는 content 길이로 이미 계산돼 있다.
 */
export async function composeModelContent(input: {
  context: string;
  files: ExamFile[];
  model: string;
  loadMedia?: (media: string) => Promise<string | null>;
}): Promise<string | ChatContentPart[]> {
  if (!isVisionModel(input.model)) return input.context;
  const loadMedia = input.loadMedia ?? loadPublicImage;
  let text = input.context;
  const images: { name: string; url: string }[] = [];
  for (const file of input.files) {
    if (file.kind !== "png" || !file.media) continue;
    let url: string | null = null;
    try {
      url = await loadMedia(file.media);
    } catch {
      url = null;
    }
    if (!url || !url.startsWith("data:image/")) continue;
    const needle = `# 첨부 파일: ${file.name}\n${file.content}`;
    if (!text.includes(needle)) continue;
    text = text.replace(needle, `# 첨부 파일: ${file.name}\n[이미지로 첨부됨]`);
    images.push({ name: file.name, url });
  }
  if (images.length === 0) return text;
  const parts: ChatContentPart[] = [{ type: "text", text }];
  for (const image of images) {
    parts.push({ type: "text", text: `[이미지: ${image.name}]` });
    parts.push({ type: "image_url", image_url: { url: image.url } });
  }
  return parts;
}
