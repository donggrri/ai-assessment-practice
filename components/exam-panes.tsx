"use client";

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import {
  AI_PANEL_DEFAULT,
  AI_PANEL_MIN,
  clampAiPanelWidth,
  maxAiPanelWidth,
  readAiPanelWidth,
  writeAiPanelWidth,
} from "@/lib/ai-panel-width";

export function ExamPanes({ children }: { children: ReactNode }) {
  const panesRef = useRef<HTMLDivElement>(null);
  const preferredRef = useRef(AI_PANEL_DEFAULT);
  const draggingRef = useRef(false);
  const [preferred, setPreferred] = useState(AI_PANEL_DEFAULT);
  const [viewport, setViewport] = useState(1280);
  const [desktop, setDesktop] = useState(false);
  const [dragging, setDragging] = useState(false);
  const width = clampAiPanelWidth(preferred, viewport);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const stored = readAiPanelWidth(window.localStorage);
    const applyViewport = () => {
      setDesktop(media.matches);
      setViewport(window.innerWidth);
    };
    const hydrate = () => {
      if (stored != null) {
        preferredRef.current = stored;
        setPreferred(stored);
      }
      applyViewport();
    };
    hydrate();
    media.addEventListener("change", applyViewport);
    window.addEventListener("resize", applyViewport);
    return () => {
      media.removeEventListener("change", applyViewport);
      window.removeEventListener("resize", applyViewport);
      document.body.classList.remove("ai-panel-dragging");
    };
  }, []);

  function remember(next: number) {
    preferredRef.current = next;
    setPreferred(next);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!desktop) return;
    draggingRef.current = true;
    setDragging(true);
    document.body.classList.add("ai-panel-dragging");
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current || !panesRef.current) return;
    const right = panesRef.current.getBoundingClientRect().right;
    remember(clampAiPanelWidth(right - event.clientX, window.innerWidth));
  }

  function finishDrag() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    document.body.classList.remove("ai-panel-dragging");
    writeAiPanelWidth(window.localStorage, preferredRef.current);
  }

  function onDoubleClick() {
    remember(AI_PANEL_DEFAULT);
    writeAiPanelWidth(window.localStorage, AI_PANEL_DEFAULT);
  }

  return (
    <div
      ref={panesRef}
      className={`panes${dragging ? " dragging" : ""}`}
      style={desktop ? { gridTemplateColumns: `300px minmax(0, 1fr) ${width}px` } : undefined}
    >
      {children}
      <div
        className="ai-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="AI 패널 폭 조절"
        aria-valuemin={Math.min(AI_PANEL_MIN, maxAiPanelWidth(viewport))}
        aria-valuemax={maxAiPanelWidth(viewport)}
        aria-valuenow={width}
        data-testid="ai-resizer"
        style={desktop ? { left: `calc(100% - ${width}px)` } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onDoubleClick={onDoubleClick}
      />
    </div>
  );
}
