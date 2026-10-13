"use client";

import { useState } from "react";
import { questionFormLabel } from "@/lib/live-exam";
import { FileViewer } from "./file-viewer";
import { useExam } from "./exam-context";

const ZOOM_MIN = 50;
const ZOOM_MAX = 200;

export function QuestionRail() {
  const exam = useExam();
  const score = exam.report ? `${exam.report.score}/100` : "-/100";
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
  const [zoom, setZoom] = useState(100);
  const active = exam.problem.questions.find((question) => question.id === exam.activeQuestionId) ?? exam.problem.questions[0];
  const file = exam.problem.files.find((item) => item.id === exam.viewerFileId) ?? exam.problem.files[0] ?? null;
  const form = active ? questionFormLabel(active) : "주관식";

  function scrollToPassage() {
    document.getElementById("exam-passage")?.scrollIntoView({ block: "start" });
  }

  function scrollToQuestion(id: string) {
    exam.selectQuestion(id);
    document.getElementById(`desktop-q-${id}`)?.scrollIntoView({ block: "start" });
  }

  return (
    <div className="desktop-center desktop-exam">
      <section className="desktop-viewer" data-tour="file-list">
        <div className="desktop-viewer-bar">
          <div className="file-picks">
            {exam.problem.files.map((item) => (
              <button
                key={item.id}
                type="button"
                className={file?.id === item.id ? "active" : ""}
                onClick={() => exam.openFile(item.id)}
              >
                {item.name}
              </button>
            ))}
          </div>
          <div className="zoom-controls" aria-label="미리보기 배율">
            <button type="button" onClick={() => setZoom((value) => Math.max(ZOOM_MIN, value - 10))} aria-label="축소">
              −
            </button>
            <span>{zoom}%</span>
            <button type="button" onClick={() => setZoom((value) => Math.min(ZOOM_MAX, value + 10))} aria-label="확대">
              +
            </button>
          </div>
        </div>
        <p className="viewer-kicker">
          {active ? `${active.number}. ${form}` : "자료"} · {exam.materialTitle}
        </p>
        <div id="exam-passage" className="desktop-passage">
          {exam.problem.passage}
        </div>
        <div className="desktop-preview">
          <div className="desktop-zoom" style={{ zoom: `${zoom}%` }}>
            {file ? <FileViewer file={file} /> : <p className="empty-chat">자료 파일이 없습니다.</p>}
          </div>
        </div>
      </section>
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
          이전 문제
        </button>
        <button type="button" onClick={() => move(1)} disabled={index >= questions.length - 1}>
          다음 문제
        </button>
      </div>
      <div className="footer-end">
        <button type="button" onClick={exam.resetActive}>
          초기화
        </button>
        {exam.report ? (
          <button type="button" className="btn finish" onClick={() => exam.showResult()}>
            채점 결과
          </button>
        ) : (
          <button type="button" className="btn finish" data-testid="desktop-grade" onClick={exam.requestGrade}>
            채점 후 종료하기
          </button>
        )}
      </div>
    </footer>
  );
}
