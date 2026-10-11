const DEFAULT_BASE = "/ai-assessment-practice";

export function resolveNextBasePath(
  raw: string | undefined,
): { basePath?: string; assetPrefix?: string } {
  if (raw === undefined) {
    return { basePath: DEFAULT_BASE, assetPrefix: DEFAULT_BASE };
  }
  if (raw === "" || raw === "/") {
    return {};
  }
  return { basePath: raw, assetPrefix: raw };
}

/** 브라우저에서 public 파일을 열 때 쓰는 접두사. next.config 의 basePath 와 같은 규칙이다. */
export function publicAssetPrefix(raw: string | undefined = process.env.NEXT_PUBLIC_BASE_PATH): string {
  if (raw === undefined) return DEFAULT_BASE;
  if (raw === "" || raw === "/") return "";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

export function publicAssetPath(
  media: string,
  raw: string | undefined = process.env.NEXT_PUBLIC_BASE_PATH,
): string {
  const clean = media.replace(/^\/+/, "");
  const prefix = publicAssetPrefix(raw);
  return `${prefix}/${clean}`;
}
