"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { measureContext } from "@/lib/context";
import { remainingRequests } from "@/lib/requests";
import type { ChatMessage, ExamClientConfig, GradeReport, ProblemSetSummary, PublicProblemSet } from "@/lib/types";
import { AiPane } from "./ai-pane";
import { ExamProvider, type MobilePane } from "./exam-context";
import { MaterialsPane } from "./materials-pane";
import { ResultScreen } from "./result-screen";
import { loadExam, saveExam } from "./storage";
import { TOUR_STEPS, TourOverlay } from "./tour-overlay";
import { WorkspacePane } from "./workspace-pane";

export function ExamApp() {
  const [config, setConfig] = useState<ExamClientConfig | null>(null);
  const [summaries, setSummaries] = useState<ProblemSetSummary[]>([]);
  const [problem, setProblem] = useState<PublicProblemSet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setId, setSetId] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [activeQuestionId, setActiveQuestionId] = useState("");
  const [viewerFileId, setViewerFileId] = useState<string | null>(null);
  const [attachedFileIds, setAttachedFileIds] = useState<string[]>([]);
  const [chatQuestionId, setChatQuestionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [requestsUsed, setRequestsUsed] = useState(0);
  const [report, setReport] = useState<GradeReport | null>(null);
  const [view, setView] = useState<"exam" | "result">("exam");
  const [hydrated, setHydrated] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [mobilePane, setMobilePane] = useState<MobilePane>("work");
  const [tourIndex, setTourIndex] = useState<number | null>(null);
  const [gradeOpen, setGradeOpen] = useState(false);
  const [grading, setGrading] = useState(false);
  const [gradeError, setGradeError] = useState<string | null>(null);
  const [saveFlash, setSaveFlash] = useState(false);
  const [newAttemptOpen, setNewAttemptOpen] = useState(false);
  const flashTimer = useRef<number | null>(null);

  const loadSet = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    setHydrated(false);
    try {
      const response = await fetch(`/api/problem-sets/${encodeURIComponent(id)}`);
      if (!response.ok) throw new Error("load");
      const data = (await response.json()) as PublicProblemSet;
      const stored = loadExam(id);
      const questionIds = new Set(data.questions.map((question) => question.id));
      const fileIds = new Set(data.files.map((file) => file.id));
      setProblem(data);
      setSetId(id);
      setSaved(stored?.saved ?? {});
      setDrafts(stored?.drafts ?? {});
      setActiveQuestionId(
        stored?.activeQuestionId && questionIds.has(stored.activeQuestionId)
          ? stored.activeQuestionId
          : data.questions[0].id,
      );
      setViewerFileId(stored?.viewerFileId && fileIds.has(stored.viewerFileId) ? stored.viewerFileId : null);
      setAttachedFileIds((stored?.attachedFileIds ?? []).filter((fileId) => fileIds.has(fileId)));
      setChatQuestionId(
        stored?.chatQuestionId && questionIds.has(stored.chatQuestionId) ? stored.chatQuestionId : null,
      );
      setMessages(Array.isArray(stored?.messages) ? stored.messages : []);
      setRequestsUsed(typeof stored?.requestsUsed === "number" ? stored.requestsUsed : 0);
      setReport(stored?.report ?? null);
      setView(stored?.view === "result" ? "result" : "exam");
      setChatDraft("");
      setChatError(null);
      setHydrated(true);
      setLoading(false);
    } catch {
      setError("문제 세트를 불러오지 못했습니다.");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const [configResponse, listResponse] = await Promise.all([
          fetch("/api/config"),
          fetch("/api/problem-sets"),
        ]);
        if (!configResponse.ok || !listResponse.ok) throw new Error("boot");
        const nextConfig = (await configResponse.json()) as ExamClientConfig;
        const list = (await listResponse.json()) as { sets: ProblemSetSummary[] };
        if (cancel) return;
        setConfig(nextConfig);
        setSummaries(list.sets ?? []);
        const wanted = new URLSearchParams(window.location.search).get("set");
        const id = (list.sets ?? []).find((item) => item.id === wanted)?.id ?? list.sets?.[0]?.id;
        if (!id) throw new Error("empty");
        await loadSet(id);
      } catch {
        if (!cancel) {
          setError("문제 세트를 불러오지 못했습니다.");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, [loadSet]);

  useEffect(() => {
    if (!hydrated || !setId) return;
    saveExam(setId, {
      v: 1,
      saved,
      drafts,
      activeQuestionId,
      viewerFileId,
      attachedFileIds,
      chatQuestionId,
      messages,
      requestsUsed,
      report,
      view,
    });
  }, [
    hydrated,
    setId,
    saved,
    drafts,
    activeQuestionId,
    viewerFileId,
    attachedFileIds,
    chatQuestionId,
    messages,
    requestsUsed,
    report,
    view,
  ]);

  const measurement = useMemo(() => {
    const chatQuestion = chatQuestionId
      ? (problem?.questions.find((question) => question.id === chatQuestionId) ?? null)
      : null;
    const files = attachedFileIds
      .map((id) => problem?.files.find((file) => file.id === id))
      .filter((file): file is NonNullable<typeof file> => Boolean(file))
      .map((file) => ({ name: file.name, content: file.content }));
    return measureContext(
      {
        passage: problem?.passage ?? "",
        question: chatQuestion
          ? { number: chatQuestion.number, prompt: chatQuestion.prompt, choices: chatQuestion.choices }
          : null,
        files,
        message: chatDraft,
      },
      config?.contextCharLimit ?? null,
    );
  }, [problem, chatQuestionId, attachedFileIds, chatDraft, config]);

  const remaining = config ? remainingRequests(requestsUsed, config.aiRequestLimit) : 0;
  const locked = report != null;

  function selectQuestion(id: string) {
    setActiveQuestionId(id);
    setMobilePane("work");
  }

  function setDraft(id: string, value: string) {
    setDrafts((prev) => ({ ...prev, [id]: value }));
  }

  function saveActive() {
    const value = drafts[activeQuestionId] ?? saved[activeQuestionId] ?? "";
    setSaved((prev) => ({ ...prev, [activeQuestionId]: value }));
    setDrafts((prev) => ({ ...prev, [activeQuestionId]: value }));
    setSaveFlash(true);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setSaveFlash(false), 1200);
  }

  function attachFile(id: string) {
    setAttachedFileIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setMobilePane("ai");
  }

  function openFile(id: string) {
    setViewerFileId(id);
    setMobilePane("work");
  }

  async function sendChat() {
    if (!problem || !config || locked || sending) return;
    if (chatDraft.trim() === "" || measurement.over || remaining === 0) return;
    setSending(true);
    setChatError(null);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problemSetId: problem.id,
          questionId: chatQuestionId,
          fileIds: attachedFileIds,
          message: chatDraft,
          requestsUsed,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        message?: string;
        reply?: string;
        mock?: boolean;
        charCount?: number;
        requestsUsed?: number;
        questionNumber?: number | null;
        fileNames?: string[];
      };
      if (!response.ok) {
        if (data.error === "request_limit") setRequestsUsed(config.aiRequestLimit);
        setChatError(data.message ?? "전송하지 못했습니다.");
        return;
      }
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: chatDraft,
        createdAt: new Date().toISOString(),
        meta: {
          questionNumber: data.questionNumber ?? null,
          fileNames: data.fileNames ?? [],
          charCount: data.charCount ?? measurement.charCount,
        },
      };
      const assistant: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.reply ?? "",
        createdAt: new Date().toISOString(),
        meta: {
          questionNumber: data.questionNumber ?? null,
          fileNames: data.fileNames ?? [],
          charCount: data.charCount ?? measurement.charCount,
          mock: data.mock,
        },
      };
      setMessages((prev) => [...prev, userMessage, assistant]);
      if (typeof data.requestsUsed === "number") setRequestsUsed(data.requestsUsed);
      setChatDraft("");
    } catch {
      setChatError("네트워크 오류로 보내지 못했습니다. 횟수는 차감되지 않았습니다.");
    } finally {
      setSending(false);
    }
  }

  function mergedAnswers(): Record<string, string> {
    const answers = { ...saved };
    if (!problem) return answers;
    for (const question of problem.questions) {
      if (drafts[question.id] !== undefined) answers[question.id] = drafts[question.id];
    }
    return answers;
  }

  async function confirmGrade() {
    if (!problem || grading) return;
    const answers = mergedAnswers();
    setSaved(answers);
    setDrafts(answers);
    setGrading(true);
    setGradeError(null);
    try {
      const response = await fetch("/api/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problemSetId: problem.id, answers }),
      });
      const data = (await response.json()) as GradeReport & { message?: string };
      if (!response.ok) {
        setGradeError(data.message ?? "채점에 실패했습니다.");
        return;
      }
      setReport(data);
      setView("result");
      setGradeOpen(false);
    } catch {
      setGradeError("채점에 실패했습니다. 다시 시도하세요.");
    } finally {
      setGrading(false);
    }
  }

  function startNewAttempt() {
    if (!problem) return;
    setSaved({});
    setDrafts({});
    setReport(null);
    setView("exam");
    setRequestsUsed(0);
    setActiveQuestionId(problem.questions[0].id);
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "system",
        content: "새 응시를 시작했습니다. 이전 대화는 삭제하지 않았고, AI 질문 횟수만 다시 채워졌습니다.",
        createdAt: new Date().toISOString(),
      },
    ]);
    setNewAttemptOpen(false);
  }

  function startTour() {
    setView("exam");
    setTourIndex(0);
    setMobilePane(TOUR_STEPS[0].pane);
  }

  const unanswered = problem
    ? problem.questions.filter((question) => !(mergedAnswers()[question.id] ?? "").trim()).map((question) => question.number)
    : [];

  if (loading || !hydrated || !config || !problem) {
    return (
      <div className="center-screen">
        <div className="empty-card">
          <h1>AI 활용평가 연습</h1>
          {error ? (
            <>
              <p>{error}</p>
              <button type="button" className="btn tide" onClick={() => window.location.reload()}>
                다시 시도
              </button>
            </>
          ) : (
            <p>문제 세트를 불러오는 중입니다.</p>
          )}
        </div>
      </div>
    );
  }

  const api = {
    config,
    problem,
    summaries,
    activeQuestionId,
    saved,
    drafts,
    viewerFileId,
    attachedFileIds,
    chatQuestionId,
    messages,
    requestsUsed,
    report,
    sending,
    chatError,
    chatDraft,
    mobilePane,
    tourRevealAttach: tourIndex != null && TOUR_STEPS[tourIndex]?.id === "file-attach",
    saveFlash,
    measurement,
    remaining,
    locked,
    setMobilePane,
    selectQuestion,
    setDraft,
    saveActive,
    openFile,
    attachFile,
    detachFile: (id: string) => setAttachedFileIds((prev) => prev.filter((item) => item !== id)),
    setChatQuestionId,
    setChatDraft,
    sendChat,
    switchSet: (id: string) => {
      if (id !== setId) void loadSet(id);
    },
  };

  return (
    <ExamProvider value={api}>
      <div className="shell">
        <header className="header">
          <div className="brand">
            <span className="mark">모</span>
            <div>
              <p className="eyebrow">비공식 연습</p>
              <h1>AI 활용평가 연습</h1>
            </div>
            {summaries.length > 1 ? (
              <select aria-label="문제 세트" value={problem.id} onChange={(event) => void loadSet(event.target.value)}>
                {summaries.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            ) : (
              <p className="set-name">{problem.title}</p>
            )}
          </div>
          <div className="header-actions">
            {config.mockMode ? <span className="pill mock">모의 응답</span> : <span className="pill">{config.model}</span>}
            <span className={`pill ${remaining === 0 ? "warn" : ""}`} data-testid="remaining-requests">
              남은 AI 질문 {remaining}회
            </span>
            <button type="button" className="btn ghost" onClick={startTour}>
              둘러보기
            </button>
            {report && view === "exam" ? (
              <button type="button" className="btn primary" onClick={() => setView("result")}>
                채점 결과
              </button>
            ) : null}
            {!report ? (
              <button
                type="button"
                className="btn primary"
                data-testid="grade-button"
                onClick={() => {
                  setGradeError(null);
                  setGradeOpen(true);
                }}
              >
                채점 후 종료
              </button>
            ) : null}
          </div>
        </header>
        {view === "result" && report ? (
          <ResultScreen report={report} onReview={() => setView("exam")} onNewAttempt={() => setNewAttemptOpen(true)} />
        ) : (
          <>
            <div className="panes">
              <MaterialsPane />
              <WorkspacePane />
              <AiPane />
            </div>
            <nav className="mobile-tabs" aria-label="화면 전환">
              {(
                [
                  ["materials", "문제·자료"],
                  ["work", "답안"],
                  ["ai", "AI 어시스트"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={mobilePane === id ? "active" : ""}
                  aria-current={mobilePane === id ? "page" : undefined}
                  data-testid={`tab-${id}`}
                  onClick={() => setMobilePane(id)}
                >
                  {label}
                </button>
              ))}
            </nav>
          </>
        )}
      </div>
      {gradeOpen ? (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="grade-title">
            <h2 id="grade-title">채점 후 종료</h2>
            <p>채점하면 이번 응시의 답안을 수정할 수 없습니다. 저장하지 않은 입력도 함께 채점합니다.</p>
            {unanswered.length ? (
              <p>미응답: {unanswered.join(", ")}번. 비워 두면 오답입니다.</p>
            ) : (
              <p>모든 문제에 답이 있습니다.</p>
            )}
            {gradeError ? <p className="warn">{gradeError}</p> : null}
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setGradeOpen(false)} disabled={grading}>
                계속 풀기
              </button>
              <button type="button" className="btn primary" data-testid="confirm-grade" onClick={() => void confirmGrade()} disabled={grading}>
                {grading ? "채점 중" : "채점하기"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {newAttemptOpen ? (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="retry-title">
            <h2 id="retry-title">새 응시</h2>
            <p>답안과 AI 질문 횟수를 다시 채웁니다. 대화 기록은 삭제하지 않습니다.</p>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setNewAttemptOpen(false)}>
                취소
              </button>
              <button type="button" className="btn primary" onClick={startNewAttempt}>
                시작
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <TourOverlay
        index={tourIndex}
        onClose={() => setTourIndex(null)}
        onPrev={() => {
          setTourIndex((current) => {
            const next = Math.max(0, (current ?? 0) - 1);
            setMobilePane(TOUR_STEPS[next].pane);
            return next;
          });
        }}
        onNext={() => {
          setTourIndex((current) => {
            const next = Math.min(TOUR_STEPS.length - 1, (current ?? 0) + 1);
            setMobilePane(TOUR_STEPS[next].pane);
            return next;
          });
        }}
      />
    </ExamProvider>
  );
}
