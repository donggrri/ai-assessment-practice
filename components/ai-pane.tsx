"use client";

import { CopyGuard } from "./copy-guard";
import { useExam } from "./exam-context";
import { MarkdownBody } from "./markdown-body";

export function AiPane() {
  const exam = useExam();
  const files = exam.attachedFileIds
    .map((id) => exam.problem.files.find((file) => file.id === id))
    .filter((file): file is NonNullable<typeof file> => Boolean(file));
  const limit = exam.measurement.limit ?? exam.config.contextCharLimit;
  const ratio = limit > 0 ? Math.min(100, (exam.measurement.charCount / limit) * 100) : 100;
  const placeholder = exam.locked
    ? "채점이 끝나 질문을 보낼 수 없습니다."
    : exam.remaining === 0
      ? "AI 질문 횟수를 모두 사용했습니다."
      : "질문을 입력하세요. Enter로 보내고, Shift+Enter로 줄바꿈합니다.";
  const blocked = exam.locked || exam.remaining === 0 || exam.sending || exam.measurement.over || exam.chatDraft.trim() === "";

  return (
    <aside className={`pane pane-ai ${exam.mobilePane === "ai" ? "active" : ""}`} data-tour="ai-panel">
      <div className="ai-head">
        <h2>AI 어시스트</h2>
        <p>
          {exam.config.mockMode
            ? "모의 응답 모드입니다. 헤더의 AI 설정에서 API 키를 저장하면 선택한 모델에 질문합니다. "
            : `${exam.config.model}에 질문합니다. `}
          첨부한 파일과 고른 문제, 공통 지문, 이번 질문만 전달됩니다.
        </p>
      </div>
      <div className="thread" data-testid="chat-thread" aria-live="polite">
        {exam.messages.length === 0 ? (
          <p className="empty-chat">
            아직 대화가 없습니다. 문제를 고르고 필요한 파일만 첨부한 뒤 질문하세요. 문제를 고르지 않으면 공통 지문만 전달됩니다.
            이전 대화는 다음 질문에 다시 실리지 않으며, 기록은 지울 수 없습니다.
          </p>
        ) : (
          exam.messages.map((message) => (
            <div key={message.id} className={`bubble ${message.role}`}>
              {message.role === "assistant" ? (
                <CopyGuard enabled={exam.config.copyProtection} className="chat-copy">
                  <MarkdownBody content={message.content} variant="chat" />
                </CopyGuard>
              ) : (
                message.content
              )}
              {message.meta ? (
                <div className="meta">
                  {message.meta.questionNumber ? `문제 ${message.meta.questionNumber}` : "문제 미선택"}
                  {" · "}
                  파일 {message.meta.fileNames.length}개 · {message.meta.charCount.toLocaleString("ko-KR")}자
                  {message.meta.mock ? " · 모의 응답" : ""}
                </div>
              ) : null}
            </div>
          ))
        )}
        {exam.sending ? <div className="bubble assistant">응답을 기다리는 중</div> : null}
      </div>
      <form
        className="composer"
        data-tour="chat-input"
        onSubmit={(event) => {
          event.preventDefault();
          exam.sendChat();
        }}
      >
        <div data-tour="question-select">
          <label htmlFor="chat-question">문제</label>
          <select
            id="chat-question"
            value={exam.chatQuestionId ?? ""}
            disabled={exam.locked}
            onChange={(event) => exam.setChatQuestionId(event.target.value || null)}
          >
            <option value="">선택 안 함 (공통 지문만 전달)</option>
            {exam.problem.questions.map((question) => (
              <option key={question.id} value={question.id}>
                {question.number}. {question.prompt.slice(0, 48)}
              </option>
            ))}
          </select>
        </div>
        <label style={{ marginTop: 8 }}>첨부 파일</label>
        {files.length === 0 ? (
          <p className="note">첨부된 파일 없음. 문제·자료의 파일에서 「AI 질문에 추가」를 누르세요.</p>
        ) : (
          <div className="chips">
            {files.map((file) => (
              <span key={file.id} className="chip" data-testid={`chip-${file.id}`}>
                {file.name}
                <button type="button" className="chip-x" aria-label={`${file.name} 첨부 해제`} onClick={() => exam.detachFile(file.id)} disabled={exam.locked}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <label htmlFor="chat-draft">질문</label>
        <textarea
          id="chat-draft"
          data-testid="chat-input"
          value={exam.chatDraft}
          placeholder={placeholder}
          disabled={exam.locked || exam.remaining === 0 || exam.sending}
          onChange={(event) => exam.setChatDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (!blocked) exam.sendChat();
            }
          }}
        />
        <p
          className={`counter ${exam.measurement.over ? "over" : exam.measurement.near ? "near" : ""}`}
          data-testid="context-counter"
          aria-live="polite"
        >
          컨텍스트 {exam.measurement.charCount.toLocaleString("ko-KR")} / {limit.toLocaleString("ko-KR")}자
        </p>
        {exam.measurement.over ? (
          <p className="warn" role="alert" data-testid="context-warning">
            컨텍스트 한도를 초과했습니다. 첨부 파일을 빼거나 질문을 줄인 뒤 다시 보내세요.
          </p>
        ) : exam.measurement.near ? (
          <p className="near-note">한도에 가까워졌습니다. 파일을 더 붙이면 전송이 막힐 수 있습니다.</p>
        ) : null}
        <div className={`bar ${exam.measurement.over ? "over" : exam.measurement.near ? "near" : ""}`}>
          <span style={{ width: `${ratio}%` }} />
        </div>
        <ul className="parts">
          {exam.measurement.parts.map((part) => (
            <li key={part.key}>
              {part.label} {part.charCount.toLocaleString("ko-KR")}자
            </li>
          ))}
        </ul>
        {exam.remaining === 0 && !exam.locked ? (
          <p className="warn" role="status">
            AI 질문 횟수를 모두 사용했습니다.
          </p>
        ) : null}
        {exam.chatError ? (
          <p className="warn" role="alert">
            {exam.chatError}
          </p>
        ) : null}
        <div className="send-row">
          <span className="note">남은 질문 {exam.remaining}회</span>
          <button type="submit" className="btn tide" data-testid="send-button" disabled={blocked}>
            {exam.sending ? "보내는 중" : "보내기"}
          </button>
        </div>
      </form>
    </aside>
  );
}
