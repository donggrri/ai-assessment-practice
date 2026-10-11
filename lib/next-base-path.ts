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
