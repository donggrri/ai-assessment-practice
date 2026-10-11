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
      if (anchor && node.contains(anchor)) selection.removeAllRanges();
    };
    node.addEventListener("selectstart", stop);
    node.addEventListener("contextmenu", stop);
    node.addEventListener("dragstart", stop);
    document.addEventListener("selectionchange", clearSelection);
    return () => {
      node.removeEventListener("selectstart", stop);
      node.removeEventListener("contextmenu", stop);
      node.removeEventListener("dragstart", stop);
      document.removeEventListener("selectionchange", clearSelection);
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
