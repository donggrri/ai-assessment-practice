"use client";

import type { ProblemSetSummary } from "@/lib/types";
import type { ProgressView } from "@/lib/set-progress";

type SetCatalogProps = {
  summaries: ProblemSetSummary[];
  progress: Record<string, ProgressView>;
  notice: string | null;
  onOpen: (id: string) => void;
};

export function SetCatalog({ summaries, progress, notice, onOpen }: SetCatalogProps) {
  return (
    <div className="shell">
      <header className="header">
        <div className="brand">
          <span className="mark">모</span>
          <div>
            <p className="eyebrow">비공식 연습</p>
            <h1>AI 활용평가 연습</h1>
          </div>
        </div>
      </header>
      <main className="catalog">
        <div className="catalog-intro">
          <h2>문제 목록</h2>
          <p>세트를 고르면 시험 화면으로 들어갑니다. 풀이 여부와 최고 점수는 이 브라우저에만 남습니다.</p>
        </div>
        {notice ? (
          <p className="catalog-notice" role="status">
            {notice}
          </p>
        ) : null}
        <ul className="catalog-grid" data-testid="set-catalog">
          {summaries.map((item) => {
            const view = progress[item.id];
            const status = view?.label ?? "미풀이";
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className="set-card"
                  data-testid={`set-card-${item.id}`}
                  onClick={() => onOpen(item.id)}
                >
                  <span className="set-card-kind">{item.kind}</span>
                  <strong className="set-card-title">{item.title}</strong>
                  <span className="set-card-meta">
                    문제 {item.questionCount}개 · 자료 {item.fileCount}개
                  </span>
                  <span className={`set-card-score${view?.solved ? " solved" : view?.started ? " started" : ""}`}>
                    {status}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}
