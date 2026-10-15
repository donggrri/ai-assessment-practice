"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function CopyGuard({
  enabled,
  className,
  children,
}: {
  enabled: boolean;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) return;
    const node = ref.current;
    if (!node) return;
    const stop = (event: Event) => {
      event.preventDefault();
    };
    const clearSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
      const anchor = selection.anchorNode;
      const focus = selection.focusNode;
      if ((anchor && node.contains(anchor)) || (focus && node.contains(focus))) selection.removeAllRanges();
    };
    // Ctrl+A 등으로 페이지 전체를 선택한 뒤 복사해도 보호 영역이 걸쳐 있으면 막는다.
    const blockCopy = (event: ClipboardEvent) => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
      if (selection.getRangeAt(0).intersectsNode(node)) event.preventDefault();
    };
    document.addEventListener("copy", blockCopy, true);
    document.addEventListener("cut", blockCopy, true);
    node.addEventListener("selectstart", stop);
    node.addEventListener("contextmenu", stop);
    node.addEventListener("dragstart", stop);
    document.addEventListener("selectionchange", clearSelection);
    return () => {
      node.removeEventListener("selectstart", stop);
      node.removeEventListener("contextmenu", stop);
      node.removeEventListener("dragstart", stop);
      document.removeEventListener("selectionchange", clearSelection);
      document.removeEventListener("copy", blockCopy, true);
      document.removeEventListener("cut", blockCopy, true);
    };
  }, [enabled]);

  if (!enabled) return <div className={className}>{children}</div>;
  return (
    <>
      <style>{".copy-guard,.copy-guard *{-webkit-touch-callout:none}"}</style>
      <div
        ref={ref}
        className={`copy-guard ${className ?? ""}`}
        onCopy={(event) => event.preventDefault()}
        onCut={(event) => event.preventDefault()}
        onPaste={(event) => event.preventDefault()}
        onContextMenu={(event) => event.preventDefault()}
        onDragStart={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && ["a", "c", "x"].includes(event.key.toLowerCase())) {
            event.preventDefault();
          }
        }}
      >
      {children}
    </div>
    </>
  );
}
