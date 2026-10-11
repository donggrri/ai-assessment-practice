"use client";

import type { ReactNode } from "react";

export function CopyGuard({
  enabled,
  className,
  children,
}: {
  enabled: boolean;
  className?: string;
  children: ReactNode;
}) {
  if (!enabled) return <div className={className}>{children}</div>;
  return (
    <div
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
  );
}
