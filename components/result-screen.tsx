"use client";

import type { GradeReport } from "@/lib/types";

export function ResultScreen({
  report,
  onReview,
  onNewAttempt,
}: {
  report: GradeReport;
  onReview: () => void;
  onNewAttempt: () => void;
}) {
  return (
    <div className="result" data-testid="result-screen">
      <section className="score-hero">
        <div>
          <p className="score-kicker">{report.title}</p>
          <p className="score-num" data-testid="result-score">
            {report.score}점
          </p>
          <p>
            {report.correctCount} / {report.total} 맞음
          </p>
        </div>
        <div className="result-actions">
          <button type="button" className="btn" onClick={onReview}>
            문제 화면으로
          </button>
          <button type="button" className="btn primary" onClick={onNewAttempt}>
            새 응시
          </button>
        </div>
      </section>
      <div className="result-list">
        {report.items.map((item) => (
          <article key={item.questionId} className="result-card" data-testid={`result-q${item.number}`}>
            <span className={`tag ${item.correct ? "ok" : "bad"}`}>{item.correct ? "정답" : "오답"}</span>
            <h3>
              {item.number}. {item.prompt}
            </h3>
            <div className="pair">
              <span>내 답</span>
              <strong>{item.userAnswerLabel}</strong>
            </div>
            <div className="pair">
              <span>정답</span>
              <strong>{item.correctAnswerLabel}</strong>
            </div>
            <div className="explain">{item.explanation}</div>
          </article>
        ))}
      </div>
    </div>
  );
}
