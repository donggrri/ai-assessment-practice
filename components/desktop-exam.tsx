"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { questionFormLabel } from "@/lib/live-exam";
import {
  ANSWER_MIN,
  PASSAGE_MIN,
  PASSAGE_RATIO_DEFAULT,
  PASSAGE_RATIO_KEY,
  SPLITTER_SIZE,
  readPanelRatio,
  splitByRatio,
  writePanelRatio,
} from "@/lib/panel-split";
import { CopyGuard } from "./copy-guard";
import { FileBrowser } from "./file-browser";
import { useExam } from "./exam-context";

export function QuestionRail() {
  const exam = useExam();
  const shown = exam.report ?? exam.timeReport;
  const score =
    exam.timeReport && exam.report
      ? `${exam.timeReport.score}→${exam.report.score}`
      : shown
        ? `${shown.score}/100`
        : "-/100";
  return (
    <nav className="q-rail desktop-exam" aria-label="문항 번호" data-tour="question-list">
      <p className="q-score" data-testid="rail-score">
        {score}
      </p>
      {exam.problem.questions.map((question) => {
        const answer = (exam.drafts[question.id] ?? exam.saved[question.id] ?? "").trim();
        const graded = exam.report?.items.find((item) => item.questionId === question.id);
        const flagged = exam.reviewIds.includes(question.id);
        const tone = graded ? (graded.correct ? "ok" : "bad") : answer ? "done" : "";
        return (
          <button
            key={question.id}
            type="button"
            className={`q-num-btn ${tone}${question.id === exam.activeQuestionId ? " active" : ""}${flagged ? " flagged" : ""}`}
            aria-current={question.id === exam.activeQuestionId ? "true" : undefined}
            onClick={() => exam.selectQuestion(question.id)}
          >
            {question.number}
          </button>
        );
      })}
    </nav>
  );
}

export function DesktopCenter() {
  const exam = useExam();
  const centerRef = useRef<HTMLDivElement>(null);
  const ratioRef = useRef(PASSAGE_RATIO_DEFAULT);
  const draggingRef = useRef(false);
  const [ratio, setRatio] = useState(PASSAGE_RATIO_DEFAULT);
  const [centerHeight, setCenterHeight] = useState(0);
  const [dragging, setDragging] = useState(false);
  const questions = exam.problem.questions;
  const activeIndex = Math.max(0, questions.findIndex((question) => question.id === exam.activeQuestionId));
  const active = questions[activeIndex] ?? questions[0];
  const form = active ? questionFormLabel(active) : "주관식";
  const scoreLabel = exam.report ? String(exam.report.score) : "-";

  function moveQuestion(step: number) {
    const next = questions[activeIndex + step];
    if (!next) return;
    exam.selectQuestion(next.id);
    document.getElementById(`desktop-q-${next.id}`)?.scrollIntoView({ block: "start" });
  }
  const split = splitByRatio(
    Math.max(0, centerHeight - SPLITTER_SIZE),
    ratio,
    PASSAGE_MIN,
    ANSWER_MIN,
    PASSAGE_RATIO_DEFAULT,
  );

  useEffect(() => {
    const node = centerRef.current;
    if (!node) return;
    const stored = readPanelRatio(window.localStorage, PASSAGE_RATIO_KEY);
    const measure = () => {
      setCenterHeight(node.clientHeight);
    };
    const hydrate = () => {
      if (stored != null) {
        ratioRef.current = stored;
        setRatio(stored);
      }
      measure();
    };
    hydrate();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => {
      observer.disconnect();
      document.body.classList.remove("passage-split-dragging");
    };
  }, []);

  function remember(next: number) {
    ratioRef.current = next;
    setRatio(next);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    draggingRef.current = true;
    setDragging(true);
    document.body.classList.add("passage-split-dragging");
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current || !centerRef.current) return;
    const rect = centerRef.current.getBoundingClientRect();
    const flexible = Math.max(1, rect.height - SPLITTER_SIZE);
    remember((event.clientY - rect.top) / flexible);
  }

  function finishDrag() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    document.body.classList.remove("passage-split-dragging");
    writePanelRatio(window.localStorage, PASSAGE_RATIO_KEY, ratioRef.current);
  }

  function onDoubleClick() {
    remember(PASSAGE_RATIO_DEFAULT);
    writePanelRatio(window.localStorage, PASSAGE_RATIO_KEY, PASSAGE_RATIO_DEFAULT);
  }

  function scrollToPassage() {
    document.getElementById("exam-passage")?.scrollIntoView({ block: "start" });
  }

  function scrollToQuestion(id: string) {
    const index = questions.findIndex((question) => question.id === id);
    if (index >= 0) moveQuestion(index - activeIndex);
  }

  return (
    <div ref={centerRef} className={`desktop-center desktop-exam${dragging ? " splitting" : ""}`}>
      <div className="q-stepper" data-testid="question-stepper">
        <button type="button" aria-label="이전 문제" onClick={() => moveQuestion(-1)} disabled={!active || activeIndex <= 0}>
          ‹
        </button>
        <p>
          {active ? `${active.number}. ${form}` : "문제"} <span>( {scoreLabel} / 100 )</span>
        </p>
        <button
          type="button"
          aria-label="다음 문제"
          onClick={() => moveQuestion(1)}
          disabled={!active || activeIndex >= questions.length - 1}
        >
          ›
        </button>
        <button
          type="button"
          className="btn small ai-open-btn"
          data-testid="ai-open"
          aria-pressed={exam.aiOpen}
          onClick={() => exam.openAi()}
        >
          AI 어시스트
        </button>
      </div>
      <section
        className="desktop-viewer"
        data-tour="file-list"
        style={centerHeight > 0 ? { height: split.primary, flex: "none" } : undefined}
      >
        <CopyGuard enabled={exam.config.copyProtection} className="desktop-passage">
          <div id="exam-passage">{exam.problem.passage}</div>
        </CopyGuard>
        <FileBrowser
          files={exam.problem.files}
          activeId={exam.viewerFileId}
          onOpen={(id) => exam.openFile(id)}
          attachedIds={exam.attachedFileIds}
          onAttach={
            exam.locked
              ? undefined
              : (id) => {
                  exam.attachFile(id);
                  if (!exam.aiOpen) exam.openAi();
                }
          }
          copyProtection={exam.config.copyProtection}
        />
      </section>
      <div
        className="passage-resizer"
        role="separator"
        aria-orientation="horizontal"
        aria-label="지문과 답안 사이 높이 조절"
        aria-valuemin={PASSAGE_MIN}
        aria-valuemax={Math.max(PASSAGE_MIN, Math.max(0, centerHeight - SPLITTER_SIZE) - ANSWER_MIN)}
        aria-valuenow={split.primary}
        data-testid="passage-resizer"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onDoubleClick={onDoubleClick}
      />
      <section className="desktop-questions" aria-label="문항">
        {exam.problem.questions.map((question) => {
          const value = exam.drafts[question.id] ?? exam.saved[question.id] ?? "";
          const graded = exam.report?.items.find((item) => item.questionId === question.id);
          const flagged = exam.reviewIds.includes(question.id);
          const multiple = questionFormLabel(question) === "객관식";
          return (
            <article
              key={question.id}
              id={`desktop-q-${question.id}`}
              className={`d-card${question.id === exam.activeQuestionId ? " active" : ""}`}
              data-tour={question.number === 1 ? "question-body" : undefined}
            >
              <div className="d-card-tools">
                <span className="d-kind">
                  {question.number}. {questionFormLabel(question)}
                </span>
                <button
                  type="button"
                  className={`flag-btn${flagged ? " on" : ""}`}
                  onClick={() => exam.toggleReview(question.id)}
                >
                  다시 풀 문제
                </button>
                <button type="button" className="link-btn" onClick={scrollToPassage}>
                  지문으로 이동
                </button>
                {graded ? <span className={`grade-badge ${graded.correct ? "ok" : "bad"}`}>{graded.correct ? "정답" : "오답"}</span> : null}
              </div>
              <h2 onClick={() => scrollToQuestion(question.id)}>
                {question.number}. {question.prompt}
              </h2>
              {multiple ? (
                <div className="d-choices">
                  {question.choices?.map((choice, index) => (
                    <label key={choice.id} className={`d-choice${value === choice.id ? " selected" : ""}`}>
                      <input
                        type="radio"
                        name={`desktop-${question.id}`}
                        value={choice.id}
                        checked={value === choice.id}
                        disabled={exam.locked}
                        onChange={() => {
                          exam.selectQuestion(question.id);
                          exam.setDraft(question.id, choice.id);
                        }}
                      />
                      <span className="d-choice-num">{index + 1}</span>
                      <span>{choice.text}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <input
                  className="d-answer"
                  type="text"
                  aria-label={`${question.number}번 답안`}
                  value={value}
                  disabled={exam.locked}
                  placeholder="이곳에 답을 입력하세요."
                  onFocus={() => exam.selectQuestion(question.id)}
                  onChange={(event) => exam.setDraft(question.id, event.target.value)}
                />
              )}
              {graded ? <p className="d-explain">{graded.explanation}</p> : null}
            </article>
          );
        })}
      </section>
    </div>
  );
}

export function ExamFooter() {
  const exam = useExam();
  const questions = exam.problem.questions;
  const index = Math.max(0, questions.findIndex((question) => question.id === exam.activeQuestionId));
  const submitted = questions.filter((question) => (exam.drafts[question.id] ?? exam.saved[question.id] ?? "").trim() !== "").length;

  function move(step: number) {
    const next = questions[index + step];
    if (!next) return;
    exam.selectQuestion(next.id);
    document.getElementById(`desktop-q-${next.id}`)?.scrollIntoView({ block: "start" });
  }

  return (
    <footer className="exam-footer desktop-exam">
      <p className="footer-count">
        객/주관식 {questions.length}제 중 {submitted}문제 제출
      </p>
      <div className="footer-nav">
        <button type="button" onClick={() => move(-1)} disabled={index <= 0}>
          ‹ 이전 문제
        </button>
        <button type="button" onClick={() => move(1)} disabled={index >= questions.length - 1}>
          다음 문제 ›
        </button>
      </div>
      <div className="footer-end">
        <button type="button" onClick={exam.resetActive}>
          초기화
        </button>
        {exam.timeReport ? (
          <span className="time-score-pill" data-testid="time-score-pill">
            시간 내 {exam.timeReport.score}점{exam.report ? ` · 최종 ${exam.report.score}점` : ""}
          </span>
        ) : null}
        {exam.report || exam.timeReport ? (
          <button type="button" className="btn finish" onClick={() => exam.showResult()}>
            채점 결과
          </button>
        ) : null}
        {exam.report && !exam.timeReport ? null : (
          <button type="button" className="btn finish" data-testid="desktop-grade" onClick={exam.requestGrade}>
            {exam.timeReport ? "다시 제출 (최종 점수)" : "채점 후 종료하기"}
          </button>
        )}
      </div>
    </footer>
  );
}
