"use client";

import type { ProblemSetSummary } from "@/lib/types";
import type { ProgressView } from "@/lib/set-progress";

type SetCatalogProps = {
  summaries: ProblemSetSummary[];
  progress: Record<string, ProgressView>;
  notice: string | null;
  onOpen: (id: string) => void;
  onLive: () => void;
};

export function SetCatalog({ summaries, progress, notice, onOpen, onLive }: SetCatalogProps) {
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
          <div className="catalog-intro-row">
            <div>
              <h2>문제 목록</h2>
              <p>세트를 고르면 시험 화면으로 들어갑니다. 풀이 여부와 최고 점수는 이 브라우저에만 남습니다.</p>
            </div>
            <button type="button" className="btn tide" data-testid="live-mode" onClick={onLive}>
              실전 모드
            </button>
          </div>
          <p className="catalog-live-note">
            실전 모드는 여러 세트에서 최대 16문항을 모아 90분 동안 풀고, 시간이 끝나면 자동으로 채점합니다. 자료는 지금 보고 있는 문항의 세트에서 가져옵니다.
          </p>
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
                  <span className="set-card-tags">
                    <span className="set-card-kind">{item.kind}</span>
                    {item.difficulty ? (
                      <span
                        className={`set-card-difficulty${item.difficulty === "어려움" ? " hard" : ""}`}
                        data-testid={`difficulty-${item.id}`}
                      >
                        {item.difficulty}
                      </span>
                    ) : null}
                  </span>
                  <strong className="set-card-title">{item.title}</strong>
                  <span className="set-card-meta">
                    문제 {item.questionCount}개 · 자료 {item.fileCount}개
                    {item.timeLimitMin ? ` · ${item.timeLimitMin}분` : ""}
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
