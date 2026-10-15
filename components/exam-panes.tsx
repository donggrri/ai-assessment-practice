"use client";

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { AI_PANEL_MIN, readAiPanelWidth } from "@/lib/ai-panel-width";
import {
  PROBLEM_PANEL_MIN,
  PROBLEM_RATIO_DEFAULT,
  PROBLEM_RATIO_KEY,
  RAIL_WIDTH,
  problemRatioFromAiPixels,
  readPanelRatio,
  splitByRatio,
  writePanelRatio,
} from "@/lib/panel-split";

export function ExamPanes({ children, aiOpen = true }: { children: ReactNode; aiOpen?: boolean }) {
  const panesRef = useRef<HTMLDivElement>(null);
  const ratioRef = useRef(PROBLEM_RATIO_DEFAULT);
  const draggingRef = useRef(false);
  const [ratio, setRatio] = useState(PROBLEM_RATIO_DEFAULT);
  const [panesWidth, setPanesWidth] = useState(1280);
  const [desktop, setDesktop] = useState(false);
  const [dragging, setDragging] = useState(false);
  const available = Math.max(0, panesWidth - RAIL_WIDTH);
  const split = splitByRatio(available, ratio, PROBLEM_PANEL_MIN, AI_PANEL_MIN, PROBLEM_RATIO_DEFAULT);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const storedRatio = readPanelRatio(window.localStorage, PROBLEM_RATIO_KEY);
    const storedAi = readAiPanelWidth(window.localStorage);
    const measure = () => panesRef.current?.clientWidth ?? window.innerWidth;
    const applyViewport = () => {
      setDesktop(media.matches);
      setPanesWidth(measure());
    };
    const hydrate = () => {
      const width = measure();
      const flexible = Math.max(0, width - RAIL_WIDTH);
      const next =
        storedRatio ??
        (storedAi == null ? PROBLEM_RATIO_DEFAULT : problemRatioFromAiPixels(storedAi, flexible, window.innerWidth));
      ratioRef.current = next;
      setRatio(next);
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
    ratioRef.current = next;
    setRatio(next);
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
    const rect = panesRef.current.getBoundingClientRect();
    const flexible = Math.max(1, rect.width - RAIL_WIDTH);
    const problem = event.clientX - rect.left - RAIL_WIDTH;
    remember(problem / flexible);
  }

  function finishDrag() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    document.body.classList.remove("ai-panel-dragging");
    writePanelRatio(window.localStorage, PROBLEM_RATIO_KEY, ratioRef.current);
  }

  function onDoubleClick() {
    remember(PROBLEM_RATIO_DEFAULT);
    writePanelRatio(window.localStorage, PROBLEM_RATIO_KEY, PROBLEM_RATIO_DEFAULT);
  }

  return (
    <div
      ref={panesRef}
      className={`panes${dragging ? " dragging" : ""}${aiOpen ? "" : " ai-closed"}`}
      style={
        desktop
          ? { gridTemplateColumns: aiOpen ? `${RAIL_WIDTH}px ${split.primary}px ${split.secondary}px` : `${RAIL_WIDTH}px minmax(0, 1fr)` }
          : undefined
      }
    >
      {children}
      <div
        className="ai-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="문제 패널과 AI 패널 사이 폭 조절"
        aria-valuemin={PROBLEM_PANEL_MIN}
        aria-valuemax={Math.max(PROBLEM_PANEL_MIN, available - AI_PANEL_MIN)}
        aria-valuenow={split.primary}
        data-testid="ai-resizer"
        style={desktop ? { left: `calc(100% - ${split.secondary}px)` } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onDoubleClick={onDoubleClick}
      />
    </div>
  );
}
