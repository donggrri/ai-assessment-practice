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
  const [menuOpen, setMenuOpen] = useState(false);
  const [pop, setPop] = useState<"question" | "file" | null>(null);
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
  const selectedQuestion = exam.problem.questions.find((question) => question.id === exam.chatQuestionId) ?? null;
  const attachChars = exam.measurement.parts
    .filter((part) => part.key.startsWith("file:"))
    .reduce((sum, part) => sum + part.charCount, 0);
  const sendReason = exam.locked
    ? "채점이 끝났습니다"
    : limitBlocked
      ? "질문 횟수 소진"
      : exam.measurement.over
        ? "컨텍스트 한도 초과"
        : cooling
          ? `다음 질문까지 ${Math.ceil(exam.cooldownLeftMs / 1000)}초`
          : exam.sending
            ? "응답 대기 중"
            : null;
  const limit = exam.measurement.limit ?? exam.config.contextCharLimit;
  const ratio = limit > 0 ? Math.min(100, (exam.measurement.charCount / limit) * 100) : 100;
  const placeholder = exam.locked
    ? "채점이 끝나 질문을 보낼 수 없습니다."
    : limitBlocked
      ? "AI 질문 횟수를 모두 사용했습니다."
      : "무엇을 도와드릴까요?";
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
            <span className={`ai-left-badge${limitBlocked ? " empty" : ""}`} data-testid="ai-left-badge">
              <i aria-hidden="true" />
              {exam.requestLimitEnabled ? `${exam.remaining}회 남음` : "횟수 제한 없음"}
            </span>
            <div className="ai-head-actions">
              <button
                type="button"
                className="ai-icon-btn"
                data-testid="ai-menu"
                aria-label="AI 도구"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
              >
                ⋯
              </button>
              <button type="button" className="ai-icon-btn" data-testid="ai-close" aria-label="AI 어시스트 닫기" onClick={() => exam.closeAi()}>
                →
              </button>
            </div>
            {menuOpen ? (
              <div className="ai-menu-pop" role="menu" data-testid="ai-menu-pop">
                <p className="ai-menu-model">
                  {exam.config.mockMode ? "모의 응답 모드 (AI 설정에서 API 키 입력)" : `모델: ${exam.config.model}`}
                </p>
                <p className="counter" data-testid="memory-turns">
                  기억 중인 대화 {exam.memoryTurns}/{CHAT_MEMORY_TURNS}턴
                </p>
                <p
                  className={`counter ${exam.measurement.over ? "over" : exam.measurement.near ? "near" : ""}`}
                  data-testid="context-counter"
                >
                  첨부 파일 {attachChars.toLocaleString("ko-KR")}자 (전체 한도 {limit.toLocaleString("ko-KR")}자)
                </p>
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
                <p className="chat-hint" data-testid="chat-hint">
                  {CHAT_HINT}
                </p>
                <p className="ai-menu-note">
                  첨부 파일은 이번 질문에만 전달되고, 최근 {CHAT_MEMORY_TURNS}턴의 질문과 답변만 기억합니다. 같은 문제 그룹은 대화를 공유합니다.
                </p>
                <button
                  type="button"
                  className="btn small"
                  data-testid="clear-chat"
                  disabled={exam.sending || exam.messages.length === 0}
                  onClick={() => {
                    exam.clearChat();
                    setMenuOpen(false);
                  }}
                >
                  대화 초기화
                </button>
              </div>
            ) : null}
          </div>
          <p className="ai-sub">
            {exam.problem.questions.length > 0
              ? `1-${exam.problem.questions.length}번 문제에 대해 질문해보세요.`
              : "질문해보세요."}
          </p>
        </div>
        <div className="thread" data-testid="chat-thread" aria-live="polite">
          {exam.messages.length === 0 ? (
            <p className="empty-chat">
              아직 대화가 없습니다. 공통 지문은 항상 포함되고, 고른 문제의 지문도 함께 전달됩니다. 첨부는 이번 질문에만 전달됩니다.
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
          {limitBlocked && !exam.locked ? (
            <p className="warn" role="status">
              AI 질문 횟수를 모두 사용했습니다.
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
          <div className="dropup-row">
            <div className="dropup" data-tour="question-select">
              <button
                type="button"
                className="dropup-btn"
                data-testid="question-dropup"
                aria-expanded={pop === "question"}
                disabled={exam.locked}
                onClick={() => setPop((cur) => (cur === "question" ? null : "question"))}
              >
                {selectedQuestion ? (
                  <>
                    문제 <b>{selectedQuestion.number}</b>
                  </>
                ) : (
                  "문제 선택 안 함"
                )}{" "}
                <span aria-hidden="true">⌃</span>
              </button>
              {pop === "question" ? (
                <ul className="dropup-pop" role="listbox" aria-label="문제 선택">
                  <li>
                    <button type="button" onClick={() => { exam.setChatQuestionId(null); setPop(null); }}>
                      선택 안 함 (공통 지문만)
                    </button>
                  </li>
                  {exam.problem.questions.map((question) => (
                    <li key={question.id}>
                      <button
                        type="button"
                        aria-selected={question.id === exam.chatQuestionId}
                        className={question.id === exam.chatQuestionId ? "on" : ""}
                        onClick={() => { exam.setChatQuestionId(question.id); setPop(null); }}
                      >
                        {question.number}. {question.prompt.slice(0, 40)}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div className="dropup" data-tour="file-attach">
              <button
                type="button"
                className="dropup-btn"
                data-testid="file-dropup"
                aria-expanded={pop === "file"}
                disabled={exam.locked}
                onClick={() => setPop((cur) => (cur === "file" ? null : "file"))}
              >
                첨부 파일{files.length > 0 ? <b> {files.length}</b> : null} <span aria-hidden="true">⌃</span>
              </button>
              {pop === "file" ? (
                <ul className="dropup-pop files" aria-label="첨부 파일 선택">
                  {exam.problem.files.map((file) => {
                    const on = exam.attachedFileIds.includes(file.id);
                    return (
                      <li key={file.id}>
                        <label>
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => (on ? exam.detachFile(file.id) : exam.attachFile(file.id))}
                          />
                          {file.name}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
            <span className="attach-size" data-testid="attach-size">
              첨부 {attachChars.toLocaleString("ko-KR")}자
            </span>
            {sendReason ? (
              <span className="cooldown-tag" role="status" data-testid="ask-cooldown">
                {sendReason}
              </span>
            ) : null}
          </div>
          {files.length > 0 ? (
            <div className="chips small">
              {files.map((file) => (
                <span key={file.id} className="chip" data-testid={`chip-${file.id}`}>
                  {file.name.split("/").pop()}
                  <button type="button" className="chip-x" aria-label={`${file.name} 첨부 해제`} onClick={() => exam.detachFile(file.id)} disabled={exam.locked}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <div className="ask-box">
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
            <button type="submit" className="ask-send" data-testid="send-button" aria-label={exam.sending ? "보내는 중" : "보내기"} disabled={blocked}>
              {exam.sending ? "…" : "↑"}
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
