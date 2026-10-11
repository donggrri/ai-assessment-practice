"use client";

import { CopyGuard } from "./copy-guard";
import { useExam } from "./exam-context";
import { MarkdownBody } from "./markdown-body";

export function WorkspacePane() {
  const exam = useExam();
  const question = exam.problem.questions.find((item) => item.id === exam.activeQuestionId);
  const file = exam.problem.files.find((item) => item.id === exam.viewerFileId) ?? null;
  const graded = exam.report?.items.find((item) => item.questionId === question?.id);
  if (!question) return null;
  const value = exam.drafts[question.id] ?? exam.saved[question.id] ?? "";

  return (
    <main className={`pane pane-main ${exam.mobilePane === "work" ? "active" : ""}`}>
      {exam.locked ? (
        <p className="banner">채점이 끝났습니다. 답안은 수정할 수 없습니다. 대화 기록은 그대로 남아 있습니다.</p>
      ) : null}
      <div className="work">
        <article className="question-card" data-tour="question-body">
          <p className="score-kicker">
            {question.type === "multiple" ? "객관식" : "주관식"} · {question.number}번
          </p>
          <CopyGuard enabled={exam.config.copyProtection}>
            <h2>
              {question.number}. {question.prompt}
            </h2>
          </CopyGuard>
          {question.type === "multiple" ? (
            <div>
              {question.choices?.map((choice) => (
                <label key={choice.id} className={`choice ${value === choice.id ? "selected" : ""}`}>
                  <input
                    type="radio"
                    name={question.id}
                    value={choice.id}
                    checked={value === choice.id}
                    disabled={exam.locked}
                    onChange={() => exam.setDraft(question.id, choice.id)}
                  />
                  <span>
                    {choice.id.toUpperCase()}. {choice.text}
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <div className="answer-row">
              <input
                type="text"
                aria-label={`${question.number}번 답안`}
                value={value}
                disabled={exam.locked}
                placeholder="답을 입력하세요"
                onChange={(event) => exam.setDraft(question.id, event.target.value)}
              />
            </div>
          )}
          <div className="answer-row">
            <button type="button" className="btn tide" onClick={exam.saveActive} disabled={exam.locked}>
              {exam.saveFlash ? "저장됨" : "답안 저장"}
            </button>
            <p className="note">채점 시 공백은 무시하고, 대소문자는 구분하지 않습니다.</p>
          </div>
          {graded ? (
            <div className={`explain ${graded.correct ? "ok" : "bad"}`}>
              <strong>{graded.correct ? "정답" : "오답"}</strong>
              {" · "}내 답 {graded.userAnswerLabel} / 정답 {graded.correctAnswerLabel}
              {"\n\n"}
              {graded.explanation}
            </div>
          ) : null}
        </article>
        <section className="viewer" data-testid="file-viewer">
          <div className="viewer-bar">
            <strong>{file ? file.name : "파일 뷰어"}</strong>
            <span className="lock-note">
              {exam.config.copyProtection ? "이 영역은 복사할 수 없습니다" : "복사 방지가 꺼져 있습니다"}
            </span>
          </div>
          <CopyGuard enabled={exam.config.copyProtection} className="viewer-body">
            {file ? (
              <MarkdownBody content={file.content} />
            ) : (
              <p className="empty-chat">파일 목록에서 파일을 선택하면 내용이 여기에 열립니다.</p>
            )}
          </CopyGuard>
        </section>
      </div>
    </main>
  );
}
