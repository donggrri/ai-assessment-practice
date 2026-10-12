"use client";

import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function ChatTable({ children }: { children?: ReactNode }) {
  return (
    <div className="table-scroll">
      <table>{children}</table>
    </div>
  );
}

export function MarkdownBody({ content, variant = "exam" }: { content: string; variant?: "exam" | "chat" }) {
  const chat = variant === "chat";
  return (
    <div className={chat ? "chat-md" : "exam-md"}>
      <ReactMarkdown
        skipHtml
        remarkPlugins={[remarkGfm]}
        components={chat ? { table: ChatTable } : undefined}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
