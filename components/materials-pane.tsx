"use client";

import { estimateTokens } from "@/lib/tokens";
import { CopyGuard } from "./copy-guard";
import { useExam } from "./exam-context";
import { MarkdownBody } from "./markdown-body";

function statusOf(saved: string, draft: string | undefined): { label: string; className: string } {
  const savedValue = saved.trim();
  const draftValue = (draft ?? saved).trim();
  if (!savedValue && !draftValue) return { label: "미응답", className: "status" };
  if (savedValue && draftValue === savedValue) return { label: "저장됨", className: "status saved" };
  if (savedValue) return { label: "수정됨", className: "status draft" };
  return { label: "작성 중", className: "status draft" };
}

export function MaterialsPane() {
  const exam = useExam();
  return (
    <aside className={`pane pane-left ${exam.mobilePane === "materials" ? "active" : ""}`}>
      <section className="section questions" data-tour="question-list">
        <h2 className="section-label">문제</h2>
        <div className="scroll">
          {exam.problem.questions.map((question) => {
            const status = statusOf(exam.saved[question.id] ?? "", exam.drafts[question.id]);
            return (
              <button
                key={question.id}
                type="button"
                className={`q-item ${question.id === exam.activeQuestionId ? "active" : ""}`}
                onClick={() => exam.selectQuestion(question.id)}
              >
                <span className="q-num">{question.number}</span>
                <span className="q-copy">
                  <span className={status.className}>{status.label}</span>
                  <p>{question.prompt}</p>
                </span>
              </button>
            );
          })}
        </div>
      </section>
      <section className="section grow">
        <h2 className="section-label">공통 지문</h2>
        <CopyGuard enabled={exam.config.copyProtection} className="scroll passage">
          <MarkdownBody content={exam.problem.passage} />
        </CopyGuard>
      </section>
      <section className={`section files ${exam.tourRevealAttach ? "tour-reveal" : ""}`} data-tour="file-list">
        <h2 className="section-label">첨부 파일</h2>
        <p className="hint">파일에 마우스를 올리면 AI 질문에 추가할 수 있습니다.</p>
        <div className="scroll">
          {exam.problem.files.map((file, index) => {
            const attached = exam.attachedFileIds.includes(file.id);
            return (
              <div
                key={file.id}
                className={`file-row ${exam.viewerFileId === file.id ? "active" : ""}`}
                data-tour={index === 0 ? "file-attach" : undefined}
                data-testid={`file-${file.id}`}
              >
                <button type="button" className="file-open" onClick={() => exam.openFile(file.id)}>
                  <span className="file-name">{file.name}</span>
                  <span className="file-meta">
                    {file.content.length.toLocaleString("ko-KR")}자 · 약 {estimateTokens(file.content).toLocaleString("ko-KR")}토큰
                  </span>
                </button>
                <button
                  type="button"
                  className="btn small attach-btn"
                  data-testid={`attach-${file.id}`}
                  disabled={attached || exam.locked}
                  onClick={() => exam.attachFile(file.id)}
                >
                  {attached ? "추가됨" : "AI 질문에 추가"}
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </aside>
  );
}
