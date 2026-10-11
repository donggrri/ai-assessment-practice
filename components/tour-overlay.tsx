"use client";

import { useEffect, useState } from "react";
import type { MobilePane } from "./exam-context";

export const TOUR_STEPS: { id: string; pane: MobilePane; title: string; body: string }[] = [
  {
    id: "question-list",
    pane: "materials",
    title: "문제 목록",
    body: "번호로 문제를 옮깁니다. 저장한 문제는 저장됨, 아직이면 미응답입니다. 이 열 아래에는 공통 지문이 있습니다.",
  },
  {
    id: "question-body",
    pane: "work",
    title: "문제 설명",
    body: "답안 화면에서 문제를 읽고 답을 입력한 뒤 답안 저장을 누릅니다. 객관식은 하나를 고르고, 주관식은 형식에 맞춰 적습니다.",
  },
  {
    id: "file-list",
    pane: "materials",
    title: "파일 목록",
    body: "파일명과 분량(글자 수, 대략적인 토큰)이 보입니다. 이름을 누르면 답안 화면의 뷰어에서 내용을 읽습니다.",
  },
  {
    id: "ai-panel",
    pane: "ai",
    title: "AI 어시스트",
    body: "시험마다 질문 횟수가 정해져 있고, 남은 횟수는 위쪽에 표시됩니다. 좁은 화면에서는 하단의 AI 어시스트 탭으로 엽니다.",
  },
  {
    id: "chat-input",
    pane: "ai",
    title: "대화창",
    body: "여기에 질문을 적습니다. 대화 기록은 문제 세트별로 남으며 지울 수 없습니다. 각 질문은 따로 전달됩니다.",
  },
  {
    id: "question-select",
    pane: "ai",
    title: "문제 선택",
    body: "드롭다운에서 문제를 고르면 그 문제 본문이 함께 전달됩니다. 고르지 않으면 공통 지문만 전달됩니다.",
  },
  {
    id: "file-attach",
    pane: "materials",
    title: "파일 첨부",
    body: "「AI 질문에 추가」를 누르면 이번 질문에 붙습니다. 첨부된 파일은 입력창 위 칩으로 보이고, X를 누르면 빠집니다. 첨부하지 않은 파일은 AI에게 전달되지 않습니다.",
  },
];

export function TourOverlay({
  index,
  onClose,
  onPrev,
  onNext,
}: {
  index: number | null;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const step = index == null ? null : TOUR_STEPS[index];
  const [box, setBox] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  useEffect(() => {
    if (!step) return;
    const update = () => {
      const element = document.querySelector(`[data-tour="${step.id}"]`);
      if (!(element instanceof HTMLElement)) {
        setBox(null);
        return;
      }
      element.scrollIntoView({ block: "nearest", inline: "nearest" });
      const rect = element.getBoundingClientRect();
      setBox({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    };
    update();
    const timer = window.setTimeout(update, 60);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [step]);

  if (!step || index == null) return null;

  const last = index === TOUR_STEPS.length - 1;
  const tabReserve = window.innerWidth < 1024 ? 72 : 0;
  const cardTop = box ? Math.min(window.innerHeight - 220 - tabReserve, box.top + box.height + 12) : 80;
  const cardLeft = box ? Math.max(12, Math.min(box.left, window.innerWidth - Math.min(380, window.innerWidth - 24) - 12)) : 12;

  return (
    <>
      <div className="tour-backdrop" />
      {box ? (
        <div
          className="tour-hole"
          style={{ top: box.top - 4, left: box.left - 4, width: box.width + 8, height: box.height + 8 }}
        />
      ) : null}
      <div className="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title" style={{ top: Math.max(12, cardTop), left: cardLeft }}>
        <p className="score-kicker">
          둘러보기 {index + 1} / {TOUR_STEPS.length}
        </p>
        <h2 id="tour-title">{step.title}</h2>
        <p>{step.body}</p>
        <div className="tour-actions">
          <button type="button" className="btn" onClick={onClose}>
            건너뛰기
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn" onClick={onPrev} disabled={index === 0}>
              이전
            </button>
            <button type="button" className="btn primary" onClick={last ? onClose : onNext}>
              {last ? "완료" : "다음"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
