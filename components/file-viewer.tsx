"use client";

import { publicAssetPath } from "@/lib/next-base-path";
import type { ExamFile } from "@/lib/types";
import { MarkdownBody } from "./markdown-body";

export function FileViewer({ file }: { file: ExamFile }) {
  const src = file.media ? publicAssetPath(file.media) : null;
  if (file.kind === "png" && src) {
    return (
      <div className="viewer-media">
        {/* public 경로에 basePath를 직접 붙이므로 next/image는 쓰지 않는다. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="viewer-image" src={src} alt={file.name} />
        <details className="viewer-fallback">
          <summary>대체 텍스트</summary>
          <MarkdownBody content={file.content} />
        </details>
      </div>
    );
  }
  if (file.kind === "pdf" && src) {
    return (
      <div className="viewer-media">
        <iframe className="viewer-pdf" src={src} title={file.name} />
        <details className="viewer-fallback">
          <summary>추출 텍스트</summary>
          <MarkdownBody content={file.content} />
        </details>
      </div>
    );
  }
  return <MarkdownBody content={file.content} />;
}
