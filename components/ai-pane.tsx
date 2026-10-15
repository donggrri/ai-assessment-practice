"use client";

import { useState, useSyncExternalStore } from "react";
import { CHAT_HINT, CHAT_MEMORY_TURNS, enterSends } from "@/lib/chat-thread";
import { loadMemo, saveMemo } from "@/lib/memo-pad";
import { useExam } from "./exam-context";
import { MarkdownBody } from "./markdown-body";

export function AiPane() {
  const exam = useExam();
  const [pasteWarning, setPasteWarning] = useState(false);
  const [memoOpen, setMemoOpen] = useState(false);
  const memo = useSyncExternalStore(
    subscribeMemo,
    () => loadMemo(localStorage, exam.chatGroupId),
    () => "",
  );
  const cooling = exam.strictConstraints && exam.cooldownLeftMs > 0;
  const cooldownSeconds = Math.ceil(exam.cooldownLeftMs / 1000);
  const limitBlocked = exam.requestLimitEnabled && exam.remaining === 0;
  const files = exam.attachedFileIds
    .map((id) => exam.problem.files.find((file) => file.id === id))
    .filter((file): file is NonNullable<typeof file> => Boolean(file));
  const limit = exam.measurement.limit ?? exam.config.contextCharLimit;
  const ratio = limit > 0 ? Math.min(100, (exam.measurement.charCount / limit) * 100) : 100;
  const placeholder = exam.locked
    ? "채점이 끝나 질문을 보낼 수 없습니다."
    : limitBlocked
      ? "AI 질문 횟수를 모두 사용했습니다."
      : CHAT_HINT;
  const blocked =
    exam.locked || cooling || limitBlocked || exam.sending || exam.measurement.over || exam.chatDraft.trim() === "";

  function updateMemo(text: string) {
    saveMemo(localStorage, exam.chatGroupId, text);
    window.dispatchEvent(new Event("aipractice-memo"));
  }

  return (
    <aside className={`pane pane-ai ${exam.mobilePane === "ai" ? "active" : ""}`} data-tour="ai-panel">
      <div className="ai-body">
        <div className="ai-head">
          <div className="ai-head-row">
            <h2>AI 어시스트</h2>
            <div className="ai-head-actions">
              <button type="button" className="btn small ai-close" data-testid="ai-close" aria-label="AI 어시스트 닫기" onClick={() => exam.closeAi()}>
                닫기
              </button>
              {limitBlocked ? (
                <span className="exhausted" data-testid="requests-exhausted">
                  횟수 소진
                </span>
              ) : null}
              <button
                type="button"
                className="btn small"
                data-testid="clear-chat"
                disabled={exam.sending || exam.messages.length === 0}
                onClick={() => exam.clearChat()}
              >
                대화 초기화
              </button>
            </div>
          </div>
          <p>
            {exam.config.mockMode
              ? "모의 응답 모드입니다. 헤더의 AI 설정에서 API 키를 저장하면 선택한 모델에 질문합니다. "
              : `${exam.config.model}에 질문합니다. `}
            공통 지문은 항상 전달되고, 문제를 고르면 그 문제 지문도 전달됩니다. 첨부 파일은 이번 질문에만 전달되며, 최근 {CHAT_MEMORY_TURNS}턴의 질문과 답변만 기억합니다. 같은 문제 그룹의 하위 문제는 대화를 공유합니다.
          </p>
        </div>
        <div className="thread" data-testid="chat-thread" aria-live="polite">
          {exam.messages.length === 0 ? (
            <p className="empty-chat">
              아직 대화가 없습니다. 지시문만 입력해 질문하세요. 공통 지문은 항상 포함되고, 문제 번호를 고르면 그 문제 지문도 포함됩니다. 첨부 본문은 이번 질문에만 전달되고 다음 기록에는 남지 않습니다.
            </p>
          ) : (
            exam.messages.map((message) => (
              <div key={message.id} className={`bubble ${message.role}`}>
                {message.role === "assistant" ? (
                  <div className="chat-copy">
                    <MarkdownBody content={message.content} variant="chat" />
                  </div>
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
            if (!blocked) exam.sendChat();
          }}
        >
          <div data-tour="question-select">
            <label htmlFor="chat-question">문제</label>
            <select
              id="chat-question"
              value={exam.chatQuestionId ?? ""}
              disabled={exam.locked}
              onChange={(event) => {
                const next = event.target.value || null;
                exam.setChatQuestionId(next);
              }}
            >
              <option value="">선택 안 함 (공통 지문만 전달)</option>
              {exam.problem.questions.map((question) => (
                <option key={question.id} value={question.id}>
                  {question.number}. {question.prompt.slice(0, 48)}
                </option>
              ))}
            </select>
          </div>
          <label htmlFor="chat-file" style={{ marginTop: 8 }}>
            첨부 파일
          </label>
          <select
            id="chat-file"
            aria-label="첨부 파일"
            data-tour="file-attach"
            value=""
            disabled={exam.locked}
            onChange={(event) => {
              const fileId = event.target.value;
              if (fileId) exam.attachFile(fileId);
            }}
          >
            <option value="">파일 선택</option>
            {exam.problem.files.map((file) => (
              <option key={file.id} value={file.id} disabled={exam.attachedFileIds.includes(file.id)}>
                {file.name}
              </option>
            ))}
          </select>
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
            disabled={exam.locked || limitBlocked}
            onChange={(event) => {
              setPasteWarning(false);
              exam.setChatDraft(event.target.value);
            }}
            onPaste={(event) => {
              if (!exam.strictConstraints) return;
              const text = event.clipboardData.getData("text");
              if (!exam.blocksMaterialPaste(text)) {
                setPasteWarning(false);
                return;
              }
              event.preventDefault();
              setPasteWarning(true);
            }}
            onKeyDown={(event) => {
              if (!enterSends(event.key, event.shiftKey, event.nativeEvent.isComposing, event.nativeEvent.keyCode)) return;
              event.preventDefault();
              if (!blocked) exam.sendChat();
            }}
          />
          <p className="chat-hint" data-testid="chat-hint">
            {CHAT_HINT}
          </p>
          <p
            className={`counter ${exam.measurement.over ? "over" : exam.measurement.near ? "near" : ""}`}
            data-testid="context-counter"
            aria-live="polite"
          >
            컨텍스트 {exam.measurement.charCount.toLocaleString("ko-KR")} / {limit.toLocaleString("ko-KR")}자
          </p>
          <p className="counter" data-testid="memory-turns">
            기억 중인 대화 {exam.memoryTurns}/{CHAT_MEMORY_TURNS}턴
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
          {limitBlocked && !exam.locked ? (
            <p className="warn" role="status">
              AI 질문 횟수를 모두 사용했습니다.
            </p>
          ) : null}
          {cooling ? (
            <p className="warn" role="status" data-testid="ask-cooldown">
              다음 질문까지 {cooldownSeconds}초
            </p>
          ) : null}
          {exam.similarWarning ? (
            <p className="warn" role="status" data-testid="similar-warning">
              {exam.similarWarning}
            </p>
          ) : null}
          {pasteWarning ? (
            <p className="warn" role="status" data-testid="paste-warning">
              지문이나 자료 텍스트는 붙여넣을 수 없습니다. 질문은 직접 입력하세요.
            </p>
          ) : null}
          {exam.chatError ? (
            <p className="warn" role="alert">
              {exam.chatError}
            </p>
          ) : null}
          <div className="send-row">
            <button type="submit" className="btn tide" data-testid="send-button" disabled={blocked}>
              {exam.sending ? "보내는 중" : "보내기"}
            </button>
          </div>
        </form>
      </div>
      {memoOpen ? (
        <section className="memo-pad" data-testid="memo-pad" aria-label="메모장">
          <div className="memo-head">
            <p className="memo-label">메모장</p>
            <button type="button" className="memo-close" data-testid="memo-close" aria-label="메모장 닫기" onClick={() => setMemoOpen(false)}>
              ×
            </button>
          </div>
          <textarea
            data-testid="memo-input"
            value={memo}
            placeholder="AI 답변을 붙여넣어 문제 그룹별로 남겨 두세요."
            onChange={(event) => updateMemo(event.target.value)}
          />
        </section>
      ) : null}
      <div className="ai-tool-rail">
        <button
          type="button"
          className={memoOpen ? "active" : ""}
          data-testid="memo-toggle"
          aria-pressed={memoOpen}
          aria-label="메모장"
          title="메모장"
          onClick={() => setMemoOpen((open) => !open)}
        >
          <MemoIcon />
        </button>
      </div>
    </aside>
  );
}

function subscribeMemo(onStoreChange: () => void) {
  window.addEventListener("aipractice-memo", onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener("aipractice-memo", onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function MemoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm8 1.5V9h4.5L14 4.5zM8 12h8v1.5H8V12zm0 3.5h8V17H8v-1.5z"
      />
    </svg>
  );
}
