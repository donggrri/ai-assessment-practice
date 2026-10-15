"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { chatSystemPrompt, groupThreadId, newAttemptMessages, historyFromChat, rememberedTurnCount, threadUsage, trimChatMessages } from "@/lib/chat-thread";
import { measureContext } from "@/lib/context";
import { createExamEngine } from "@/lib/exam-engine";
import {
  clearLlmSettings,
  isMockMode,
  loadLlmSettings,
  normalizeLlmSettings,
  saveLlmSettings,
} from "@/lib/llm-settings";
import { loadBestScore, recordBestScore } from "@/lib/best-score";
import {
  buildLivePaper,
  formatElapsed,
  formatTimer,
  gradeLivePaper,
  liveQuestions,
  loadLiveSession,
  parseLiveQuestionKey,
  remainingLiveMs,
  saveLiveSession,
  type LiveRef,
  type LiveSession,
} from "@/lib/live-exam";
import {
  ASK_COOLDOWN_MS,
  blocksMaterialPaste as materialPasteBlocked,
  clearAiGuard,
  emptyAiGuard,
  isSimilarAsk,
  loadAiGuard,
  loadStrictConstraints,
  saveAiGuard,
  saveStrictConstraints,
  type AiGuardState,
} from "@/lib/ai-constraints";
import { remainingRequests } from "@/lib/requests";
import { loadRequestLimitEnabled, saveRequestLimitEnabled } from "@/lib/request-limit";
import { toPublicProblemSet, toSummary } from "@/lib/public-problem";
import { attemptStarted, describeProgress, pickBestScore, type ProgressView } from "@/lib/set-progress";
import type {
  BuildConfig,
  ChatMessage,
  ExamClientConfig,
  GradeReport,
  ProblemSet,
  ProblemSetSummary,
  PublicProblemSet,
} from "@/lib/types";
import { AiPane } from "./ai-pane";
import { DesktopCenter, ExamFooter, QuestionRail } from "./desktop-exam";
import { ExamProvider, type MobilePane } from "./exam-context";
import { ExamPanes } from "./exam-panes";
import { MaterialsPane } from "./materials-pane";
import { ResultScreen } from "./result-screen";
import { SetCatalog } from "./set-catalog";
import { loadExam, saveExam } from "./storage";
import { TOUR_STEPS, TourOverlay } from "./tour-overlay";
import { WorkspacePane } from "./workspace-pane";

const DEFAULT_MODEL = "gpt-4o-mini";

const SETTINGS_STORAGE_ERROR =
  "이 브라우저에 설정을 저장하지 못했습니다. 질문에는 모의 응답이 사용됩니다.";

type ExamAppProps = {
  sets?: ProblemSet[];
  buildConfig?: BuildConfig;
};

type SettingsDraft = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

function writeLocation(mutate: (params: URLSearchParams) => void) {
  const url = new URL(window.location.href);
  mutate(url.searchParams);
  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next === current) return;
  window.history.pushState(null, "", next);
}

function writeSetQuery(id: string | null) {
  writeLocation((params) => {
    params.delete("live");
    if (id) params.set("set", id);
    else params.delete("set");
  });
}

function writeLiveQuery() {
  writeLocation((params) => {
    params.delete("set");
    params.set("live", "1");
  });
}

type AppRoute =
  | { kind: "catalog"; missing: boolean }
  | { kind: "set"; id: string }
  | { kind: "live" };

function routeFromLocation(ids: string[]): AppRoute {
  const params = new URLSearchParams(window.location.search);
  if (params.get("live") === "1") return { kind: "live" };
  const wanted = params.get("set");
  if (!wanted) return { kind: "catalog", missing: false };
  if (ids.includes(wanted)) return { kind: "set", id: wanted };
  return { kind: "catalog", missing: true };
}

function isInsecureRemoteHttp(baseUrl: string): boolean {
  const trimmed = baseUrl.trim();
  if (!trimmed.toLowerCase().startsWith("http://")) return false;
  try {
    const host = new URL(trimmed).hostname;
    return host !== "localhost" && host !== "127.0.0.1";
  } catch {
    return false;
  }
}

export function ExamApp({ sets: serverSets, buildConfig }: ExamAppProps) {
  const [config, setConfig] = useState<ExamClientConfig | null>(null);
  const [summaries, setSummaries] = useState<ProblemSetSummary[]>([]);
  const [problem, setProblem] = useState<PublicProblemSet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setId, setSetId] = useState<string | null>(null);
  const [screen, setScreen] = useState<"boot" | "catalog" | "exam">("boot");
  const [catalogNotice, setCatalogNotice] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [activeQuestionId, setActiveQuestionId] = useState("");
  const [viewerFileId, setViewerFileId] = useState<string | null>(null);
  const [attachedFileIds, setAttachedFileIds] = useState<string[]>([]);
  const [chatQuestionId, setChatQuestionId] = useState<string | null>(null);
  const [threads, setThreads] = useState<Record<string, ChatMessage[]>>({});
  const [requestsUsed, setRequestsUsed] = useState(0);
  const [report, setReport] = useState<GradeReport | null>(null);
  const [reviewIds, setReviewIds] = useState<string[]>([]);
  const [view, setView] = useState<"exam" | "result">("exam");
  const [livePaper, setLivePaper] = useState<LiveRef[]>([]);
  const [liveStartedAt, setLiveStartedAt] = useState<number | null>(null);
  const [liveLeft, setLiveLeft] = useState(0);
  const [setStartedAt, setSetStartedAt] = useState<number | null>(null);
  const [setLeft, setSetLeft] = useState(0);
  /** 단독 세트 제한 시간을 넘긴 시간. 막지 않고 표시만 한다. */
  const [setOverMs, setSetOverMs] = useState(0);
  const [timeReport, setTimeReport] = useState<GradeReport | null>(null);
  const [sourceTitle, setSourceTitle] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [strictConstraints, setStrictConstraintsState] = useState(true);
  const [requestLimitEnabled, setRequestLimitEnabledState] = useState(false);
  const [guard, setGuard] = useState<AiGuardState>(emptyAiGuard);
  const [cooldownNow, setCooldownNow] = useState(0);
  const [mobilePane, setMobilePane] = useState<MobilePane>("work");
  const [aiOpen, setAiOpen] = useState(true);
  const [tourIndex, setTourIndex] = useState<number | null>(null);
  const [gradeOpen, setGradeOpen] = useState(false);
  const [grading, setGrading] = useState(false);
  const [gradeError, setGradeError] = useState<string | null>(null);
  const [saveFlash, setSaveFlash] = useState(false);
  const [newAttemptOpen, setNewAttemptOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsStorageError, setSettingsStorageError] = useState<string | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft>({
    apiKey: "",
    baseUrl: "https://api.openai.com/v1",
    model: DEFAULT_MODEL,
  });
  const flashTimer = useRef<number | null>(null);
  const sourceSetIdRef = useRef<string | null>(null);
  const gradingRef = useRef(false);
  const confirmGradeRef = useRef<(auto?: boolean) => void>(() => {});

  const engine = useMemo(() => {
    if (!serverSets || !buildConfig) return null;
    return createExamEngine({
      sets: serverSets,
      config: buildConfig,
      readSettings: () => loadLlmSettings(),
      fetchImpl: globalThis.fetch,
    });
  }, [serverSets, buildConfig]);

  const applyLlmToConfig = useCallback(
    (settings: ReturnType<typeof loadLlmSettings>) => {
      setConfig((prev) =>
        prev
          ? {
              ...prev,
              mockMode: isMockMode(settings),
              model: settings.model,
            }
          : prev,
      );
    },
    [],
  );

  const loadSet = useCallback(
    async (id: string) => {
      if (!serverSets) return;
      setLoading(true);
      setError(null);
      setHydrated(false);
      try {
        const full = serverSets.find((set) => set.id === id);
        if (!full) throw new Error("load");
        const data = toPublicProblemSet(full);
        const stored = loadExam(id);
        if (stored?.report) {
          recordBestScore(id, {
            score: stored.report.score,
            correctCount: stored.report.correctCount,
            total: stored.report.total,
          }, localStorage);
        }
        const questionIds = new Set(data.questions.map((question) => question.id));
        const fileIds = new Set(data.files.map((file) => file.id));
        setProblem(data);
        setSetId(id);
        setSaved(stored?.saved ?? {});
        setDrafts(stored?.drafts ?? {});
        setViewerFileId(stored?.viewerFileId && fileIds.has(stored.viewerFileId) ? stored.viewerFileId : null);
        // 첨부는 그 질문에만 쓰이므로 다시 열 때 복원하지 않는다.
        setAttachedFileIds([]);
        const activeId =
          stored?.activeQuestionId && questionIds.has(stored.activeQuestionId)
            ? stored.activeQuestionId
            : data.questions[0].id;
        setActiveQuestionId(activeId);
        setChatQuestionId(
          stored?.chatQuestionId && questionIds.has(stored.chatQuestionId) ? stored.chatQuestionId : activeId,
        );
        setThreads({ [id]: trimChatMessages(Array.isArray(stored?.messages) ? stored.messages : []) });
        setRequestsUsed(typeof stored?.requestsUsed === "number" ? stored.requestsUsed : 0);
        setReport(stored?.report ?? null);
        setTimeReport(stored?.timeReport ?? null);
        setReviewIds(Array.isArray(stored?.reviewIds) ? stored.reviewIds : []);
        setView(stored?.view === "result" ? "result" : "exam");
        setLivePaper([]);
        setLiveStartedAt(null);
        const limitMin = data.timeLimitMin ?? 0;
        if (limitMin > 0 && !stored?.report) {
          const started = typeof stored?.startedAt === "number" ? stored.startedAt : Date.now();
          setSetStartedAt(started);
          setSetLeft(remainingLiveMs(started, Date.now(), limitMin * 60_000));
          setSetOverMs(Math.max(0, Date.now() - started - limitMin * 60_000));
        } else {
          setSetStartedAt(null);
          setSetLeft(0);
          setSetOverMs(0);
        }
        sourceSetIdRef.current = null;
        setSourceTitle(full.title);
        setChatDraft("");
        setChatError(null);
        setGuard(loadAiGuard(localStorage, id));
        setCooldownNow(Date.now());
        setHydrated(true);
        setLoading(false);
      } catch {
        setError("문제 세트를 불러오지 못했습니다.");
        setLoading(false);
      }
    },
    [serverSets],
  );

  const enterLive = useCallback(
    (resume: boolean) => {
      if (!serverSets) return;
      writeLiveQuery();
      setScreen("exam");
      setCatalogNotice(null);
      setLoading(true);
      setError(null);
      setHydrated(false);
      if (!resume) clearAiGuard(localStorage, "live");
      const stored: LiveSession | null = resume ? loadLiveSession(localStorage) : null;
      const paper = stored?.paper.length ? stored.paper : buildLivePaper(serverSets);
      const questions = liveQuestions(serverSets, paper);
      if (questions.length === 0) {
        setCatalogNotice("실전 모드로 모을 문제가 없습니다.");
        setScreen("catalog");
        setLoading(false);
        return;
      }
      const active =
        stored?.activeQuestionId && questions.some((question) => question.id === stored.activeQuestionId)
          ? stored.activeQuestionId
          : questions[0].id;
      const ref = parseLiveQuestionKey(active);
      const source = serverSets.find((set) => set.id === ref?.setId) ?? serverSets[0];
      const pub = toPublicProblemSet(source);
      const fileIds = new Set(pub.files.map((file) => file.id));
      const questionIds = new Set(questions.map((question) => question.id));
      sourceSetIdRef.current = source.id;
      setSourceTitle(source.title);
      setProblem({ ...pub, title: "실전 모드", questions });
      setSetId("live");
      setSetStartedAt(null);
      setSetLeft(0);
      setLivePaper(paper);
      const startedAt = stored?.startedAt ?? Date.now();
      setLiveStartedAt(startedAt);
      setLiveLeft(remainingLiveMs(startedAt, Date.now()));
      setSaved(stored?.saved ?? {});
      setDrafts(stored?.drafts ?? {});
      setActiveQuestionId(active);
      setViewerFileId(
        stored?.viewerFileId && fileIds.has(stored.viewerFileId) ? stored.viewerFileId : (pub.files[0]?.id ?? null),
      );
      setAttachedFileIds([]);
      setChatQuestionId(stored?.chatQuestionId && questionIds.has(stored.chatQuestionId) ? stored.chatQuestionId : active);
      const storedThreads = stored?.threads;
      if (storedThreads && Object.keys(storedThreads).length > 0) {
        const nextThreads: Record<string, ChatMessage[]> = {};
        for (const [key, list] of Object.entries(storedThreads)) {
          nextThreads[key] = trimChatMessages(Array.isArray(list) ? list : []);
        }
        setThreads(nextThreads);
      } else if (stored && stored.messages.length > 0) {
        const legacyGroup = groupThreadId("live", "live", stored.chatQuestionId ?? active);
        setThreads(legacyGroup ? { [legacyGroup]: trimChatMessages(stored.messages) } : {});
      } else {
        setThreads({});
      }
      setRequestsUsed(typeof stored?.requestsUsed === "number" ? stored.requestsUsed : 0);
      setReport(stored?.report ?? null);
      setReviewIds(Array.isArray(stored?.reviewIds) ? stored.reviewIds : []);
      setView(stored?.view === "result" ? "result" : "exam");
      setChatDraft("");
      setChatError(null);
      setGuard(resume ? loadAiGuard(localStorage, "live") : emptyAiGuard());
      setCooldownNow(Date.now());
      setHydrated(true);
      setLoading(false);
    },
    [serverSets],
  );

  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!serverSets || !buildConfig) {
        if (!cancel) {
          setError("문제 세트를 불러오지 못했습니다.");
          setLoading(false);
        }
        return;
      }

      const settings = loadLlmSettings();
      setStrictConstraintsState(loadStrictConstraints(localStorage));
      setRequestLimitEnabledState(loadRequestLimitEnabled(localStorage));
      const bootSummaries = serverSets.map(toSummary);

      if (cancel) return;
      setConfig({
        ...buildConfig,
        mockMode: isMockMode(settings),
        model: settings.model,
      });
      setSummaries(bootSummaries);
      const route = routeFromLocation(bootSummaries.map((item) => item.id));
      if (route.kind === "catalog") {
        setCatalogNotice(route.missing ? "요청한 문제 세트를 찾지 못했습니다." : null);
        setScreen("catalog");
        setLoading(false);
        return;
      }
      setCatalogNotice(null);
      setScreen("exam");
      if (route.kind === "live") {
        enterLive(true);
        return;
      }
      await loadSet(route.id);
    })();
    return () => {
      cancel = true;
    };
  }, [loadSet, enterLive, serverSets, buildConfig]);

  useEffect(() => {
    if (summaries.length === 0) return;
    const onPop = () => {
      const route = routeFromLocation(summaries.map((item) => item.id));
      if (route.kind === "catalog") {
        setCatalogNotice(route.missing ? "요청한 문제 세트를 찾지 못했습니다." : null);
        setScreen("catalog");
        setLoading(false);
        return;
      }
      setCatalogNotice(null);
      setScreen("exam");
      if (route.kind === "live") {
        enterLive(true);
        return;
      }
      void loadSet(route.id);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [summaries, loadSet, enterLive]);

  const progressById = useMemo(() => {
    if (screen !== "catalog") return {};
    const next: Record<string, ProgressView> = {};
    for (const summary of summaries) {
      const stored = loadExam(summary.id);
      const report = stored?.report
        ? {
            score: stored.report.score,
            correctCount: stored.report.correctCount,
            total: stored.report.total,
          }
        : null;
      next[summary.id] = describeProgress(
        pickBestScore(loadBestScore(summary.id, localStorage), report),
        attemptStarted({
          saved: stored?.saved,
          drafts: stored?.drafts,
          messageCount: stored?.messages.length ?? 0,
          hasReport: Boolean(stored?.report),
        }),
      );
    }
    return next;
  }, [screen, summaries]);

  const chatGroupId = groupThreadId(
    setId === "live" ? "live" : "set",
    setId ?? "",
    setId === "live" ? (chatQuestionId ?? activeQuestionId) : activeQuestionId,
  );
  const messages = threads[chatGroupId] ?? [];

  function writeGroup(groupId: string, next: ChatMessage[] | ((current: ChatMessage[]) => ChatMessage[])) {
    if (!groupId) return;
    setThreads((prev) => {
      const current = prev[groupId] ?? [];
      const value = typeof next === "function" ? next(current) : next;
      return { ...prev, [groupId]: trimChatMessages(value) };
    });
  }

  useEffect(() => {
    if (!hydrated || !setId) return;
    if (setId === "live") {
      if (liveStartedAt == null) return;
      saveLiveSession(
        {
          v: 1,
          paper: livePaper,
          startedAt: liveStartedAt,
          saved,
          drafts,
          activeQuestionId,
          viewerFileId,
          attachedFileIds,
          chatQuestionId,
          messages: threads[chatGroupId] ?? [],
          threads,
          requestsUsed,
          report,
          view,
          reviewIds,
        },
        localStorage,
      );
      return;
    }
    saveExam(setId, {
      v: 1,
      saved,
      drafts,
      activeQuestionId,
      viewerFileId,
      attachedFileIds,
      chatQuestionId,
      messages: threads[setId] ?? [],
      requestsUsed,
      report,
      view,
      reviewIds,
      ...(setStartedAt != null ? { startedAt: setStartedAt } : {}),
      timeReport,
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
    chatGroupId,
    threads,
    requestsUsed,
    report,
    view,
    reviewIds,
    livePaper,
    liveStartedAt,
    setStartedAt,
    timeReport,
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
  // 단독 세트에서 시간이 끝나 자동 채점된 뒤에는 잠그지 않고 계속 고쳐 다시 제출할 수 있다.
  const locked = report != null && timeReport == null;

  function openSettings() {
    setSettingsDraft(loadLlmSettings());
    setSettingsStorageError(null);
    setSettingsOpen(true);
  }

  function persistSettings() {
    const next = normalizeLlmSettings(settingsDraft);
    const saved: { ok: true } | { ok: false } = saveLlmSettings(next);
    if (saved.ok === false) {
      setSettingsStorageError(SETTINGS_STORAGE_ERROR);
      return;
    }
    setSettingsStorageError(null);
    applyLlmToConfig(next);
    setSettingsDraft(next);
    setSettingsOpen(false);
  }

  function removeSettings() {
    const cleared: { ok: true } | { ok: false } = clearLlmSettings();
    if (cleared.ok === false) {
      setSettingsStorageError(SETTINGS_STORAGE_ERROR);
      return;
    }
    setSettingsStorageError(null);
    const defaults = loadLlmSettings();
    setSettingsDraft(defaults);
    applyLlmToConfig(defaults);
  }

  function selectQuestion(id: string) {
    setActiveQuestionId(id);
    setChatQuestionId(id);
    setMobilePane("work");
    if (setId !== "live" || !serverSets) return;
    const ref = parseLiveQuestionKey(id);
    if (!ref || ref.setId === sourceSetIdRef.current) return;
    const source = serverSets.find((set) => set.id === ref.setId);
    if (!source) return;
    const pub = toPublicProblemSet(source);
    sourceSetIdRef.current = source.id;
    setSourceTitle(source.title);
    setProblem((prev) => (prev ? { ...prev, id: source.id, passage: pub.passage, files: pub.files, title: "실전 모드" } : prev));
    setViewerFileId(pub.files[0]?.id ?? null);
    setAttachedFileIds([]);
  }

  function chooseChatQuestion(id: string | null) {
    setChatQuestionId(id);
    if (setId === "live" && id) selectQuestion(id);
  }

  function toggleReview(id: string) {
    setReviewIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  function resetActive() {
    setDrafts((prev) => ({ ...prev, [activeQuestionId]: "" }));
    setSaved((prev) => ({ ...prev, [activeQuestionId]: "" }));
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

  function rememberGuard(next: AiGuardState) {
    if (!setId) return;
    setGuard(next);
    setCooldownNow(Date.now());
    saveAiGuard(localStorage, setId, next);
  }

  function setStrictConstraints(enabled: boolean) {
    setStrictConstraintsState(enabled);
    saveStrictConstraints(localStorage, enabled);
  }

  function setRequestLimitEnabled(enabled: boolean) {
    setRequestLimitEnabledState(enabled);
    saveRequestLimitEnabled(localStorage, enabled);
  }

  function clearChat() {
    if (sending) return;
    writeGroup(chatGroupId, []);
    setChatError(null);
    // 대화를 비우면 AI 질문 횟수도 처음부터 센다. 저장값은 아래 저장 effect가 덮어쓴다.
    setRequestsUsed(0);
  }

  async function sendChat() {
    if (!problem || !config || !engine || !setId || locked || sending) return;
    if (chatDraft.trim() === "" || measurement.over) return;
    if (requestLimitEnabled && remaining === 0) return;
    if (strictConstraints && guard.cooldownUntil > Date.now()) return;
    const sent = chatDraft;
    const cooling = strictConstraints;
    const until = cooling ? Date.now() + ASK_COOLDOWN_MS : 0;
    if (cooling) rememberGuard({ v: 1, lastMessage: guard.lastMessage, cooldownUntil: until });
    setSending(true);
    setChatError(null);
    try {
      const liveRef = setId === "live" ? parseLiveQuestionKey(chatQuestionId ?? "") : null;
      const targetSetId = liveRef?.setId ?? problem.id;
      const targetQuestionId = liveRef ? liveRef.questionId : (chatQuestionId ?? "");
      const allowed = new Set((serverSets?.find((set) => set.id === targetSetId)?.files ?? problem.files).map((file) => file.id));
      const data = await engine.send({
        problemSetId: targetSetId,
        questionId: targetQuestionId,
        fileIds: attachedFileIds.filter((fileId) => allowed.has(fileId)),
        message: chatDraft,
        requestsUsed,
        history: historyFromChat(messages),
        enforceRequestLimit: requestLimitEnabled,
      });
      if (!data.ok) {
        if (cooling) rememberGuard({ v: 1, lastMessage: guard.lastMessage, cooldownUntil: 0 });
        if (data.error === "request_limit") setRequestsUsed(config.aiRequestLimit);
        setChatError(data.message);
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
      writeGroup(chatGroupId, (prev) => [...prev, userMessage, assistant]);
      setRequestsUsed(data.requestsUsed);
      // 보내는 동안 새로 입력한 글은 지우지 않는다.
      setChatDraft((current) => (current === sent ? "" : current));
      // 첨부는 이번 턴에만 쓰인다. 다음 질문에 필요하면 다시 첨부한다.
      setAttachedFileIds([]);
      if (cooling) rememberGuard({ v: 1, lastMessage: sent, cooldownUntil: until });
    } catch {
      if (cooling) rememberGuard({ v: 1, lastMessage: guard.lastMessage, cooldownUntil: 0 });
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
    if (!problem || gradingRef.current) return;
    if (setId !== "live" && !engine) return;
    gradingRef.current = true;
    const answers = mergedAnswers();
    setSaved(answers);
    setDrafts(answers);
    setGrading(true);
    setGradeError(null);
    const stayOnExam = window.matchMedia("(min-width: 1024px)").matches;
    try {
      if (setId === "live") {
        if (!serverSets) {
          setGradeError("채점에 실패했습니다. 다시 시도하세요.");
          return;
        }
        const data = gradeLivePaper(serverSets, livePaper, answers);
        setReport(data);
        setView(stayOnExam ? "exam" : "result");
        setGradeOpen(false);
        return;
      }
      const data = engine!.grade(problem.id, answers);
      if ("error" in data) {
        setGradeError(data.message);
        return;
      }
      recordBestScore(problem.id, {
        score: data.score,
        correctCount: data.correctCount,
        total: data.total,
      }, localStorage);
      setReport(data);
      setView(stayOnExam ? "exam" : "result");
      setGradeOpen(false);
    } catch {
      setGradeError("채점에 실패했습니다. 다시 시도하세요.");
    } finally {
      gradingRef.current = false;
      setGrading(false);
    }
  }

  function startNewAttempt() {
    if (!problem) return;
    setSaved({});
    setDrafts({});
    setReport(null);
    setTimeReport(null);
    setReviewIds([]);
    setView("exam");
    setRequestsUsed(0);
    if (setId === "live") {
      const startedAt = Date.now();
      setLiveStartedAt(startedAt);
      setLiveLeft(remainingLiveMs(startedAt, startedAt));
      clearAiGuard(localStorage, "live");
      setGuard(emptyAiGuard());
      setCooldownNow(Date.now());
    } else if ((problem.timeLimitMin ?? 0) > 0) {
      const minutes = problem.timeLimitMin ?? 0;
      const startedAt = Date.now();
      setSetStartedAt(startedAt);
      setSetLeft(remainingLiveMs(startedAt, startedAt, minutes * 60_000));
      setSetOverMs(0);
    }
    if (setId && setId !== "live") {
      clearAiGuard(localStorage, setId);
      setGuard(emptyAiGuard());
      setCooldownNow(Date.now());
    }
    setActiveQuestionId(problem.questions[0].id);
    setChatQuestionId(problem.questions[0].id);
    setAttachedFileIds([]);
    if (setId === "live") {
      setThreads({});
    } else if (setId) {
      // 새 응시는 이 세트의 저장된 대화 기록도 지운다.
      writeGroup(setId, newAttemptMessages(crypto.randomUUID(), new Date().toISOString()));
    }
    setNewAttemptOpen(false);
  }

  useEffect(() => {
    confirmGradeRef.current = () => {
      void confirmGrade();
    };
  });

  useEffect(() => {
    if (!strictConstraints || guard.cooldownUntil <= Date.now()) return;
    const timer = window.setInterval(() => {
      setCooldownNow(Date.now());
    }, 250);
    return () => window.clearInterval(timer);
  }, [strictConstraints, guard.cooldownUntil]);

  const setLimitMs = (problem?.timeLimitMin ?? 0) * 60_000;
  // 25분 등 세트 제한 시간이 끝나면 그 순간 답으로 한 번만 자동 채점한다. 화면은 잠그지 않는다.
  const autoGradeRef = useRef<() => void>(() => undefined);
  useLayoutEffect(() => {
    autoGradeRef.current = () => {
      if (!hydrated || setId === "live" || !problem || !engine) return;
      if (timeReport != null || report != null) return;
      const data = engine.grade(problem.id, mergedAnswers());
      if ("error" in data) return;
      recordBestScore(problem.id, { score: data.score, correctCount: data.correctCount, total: data.total }, localStorage);
      setTimeReport(data);
    };
  });
  useEffect(() => {
    if (screen !== "exam") return;
    if (report && (setId === "live" || timeReport == null)) return;
    if (setId === "live") {
      if (liveStartedAt == null) return;
      const timer = window.setInterval(() => {
        const left = remainingLiveMs(liveStartedAt, Date.now());
        setLiveLeft(left);
        if (left === 0) confirmGradeRef.current();
      }, 250);
      return () => window.clearInterval(timer);
    }
    if (setStartedAt == null || setLimitMs <= 0) return;
    const timer = window.setInterval(() => {
      // 연습용: 시간이 끝나도 자동 채점하거나 막지 않고, 넘긴 시간만 센다.
      const now = Date.now();
      setSetLeft(remainingLiveMs(setStartedAt, now, setLimitMs));
      setSetOverMs(Math.max(0, now - setStartedAt - setLimitMs));
      if (now - setStartedAt >= setLimitMs && timeReport == null && report == null) autoGradeRef.current();
    }, 250);
    return () => window.clearInterval(timer);
  }, [screen, setId, liveStartedAt, setStartedAt, setLimitMs, report, timeReport]);

  function startTour() {
    setView("exam");
    setTourIndex(0);
    setMobilePane(TOUR_STEPS[0].pane);
  }

  const unanswered = problem
    ? problem.questions.filter((question) => !(mergedAnswers()[question.id] ?? "").trim()).map((question) => question.number)
    : [];

  function showCatalog() {
    writeSetQuery(null);
    setCatalogNotice(null);
    setScreen("catalog");
  }

  function openSet(id: string) {
    writeSetQuery(id);
    setCatalogNotice(null);
    setScreen("exam");
    void loadSet(id);
  }

  if (screen === "boot" || !config) {
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

  if (screen === "catalog") {
    return (
      <SetCatalog
        summaries={summaries}
        progress={progressById}
        notice={catalogNotice}
        onOpen={openSet}
        onLive={() => enterLive(false)}
      />
    );
  }

  if (loading || !hydrated || !problem) {
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

  const cooldownLeftMs =
    strictConstraints && cooldownNow > 0 ? Math.max(0, guard.cooldownUntil - cooldownNow) : 0;
  const similarWarning =
    strictConstraints && isSimilarAsk(chatDraft, guard.lastMessage)
      ? "직전 질문과 거의 같습니다. 질문을 바꿔 보세요."
      : null;

  const historyTurns = historyFromChat(messages);
  const thread = threadUsage([
    chatSystemPrompt,
    ...historyTurns.map((turn) => turn.content),
    measurement.text,
  ]);

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
    chatGroupId,
    memoryTurns: rememberedTurnCount(messages),
    threadChars: thread.chars,
    threadTokens: thread.tokens,
    requestsUsed,
    report,
    timeReport,
    sending,
    chatError,
    chatDraft,
    mobilePane,
    tourRevealAttach: tourIndex != null && TOUR_STEPS[tourIndex]?.id === "file-attach",
    saveFlash,
    measurement,
    remaining,
    locked,
    reviewIds,
    materialTitle: setId === "live" ? sourceTitle : problem.title,
    setMobilePane,
    selectQuestion,
    toggleReview,
    resetActive,
    requestGrade: () => {
      setGradeError(null);
      setGradeOpen(true);
    },
    showResult: () => setView("result"),
    setDraft,
    saveActive,
    openFile,
    attachFile,
    aiOpen,
    openAi: () => {
      setAiOpen(true);
      setMobilePane("ai");
      window.setTimeout(() => document.getElementById("chat-draft")?.focus(), 0);
    },
    closeAi: () => setAiOpen(false),
    detachFile: (id: string) => setAttachedFileIds((prev) => prev.filter((item) => item !== id)),
    setChatQuestionId: chooseChatQuestion,
    setChatDraft,
    sendChat,
    clearChat,
    strictConstraints,
    setStrictConstraints,
    requestLimitEnabled,
    setRequestLimitEnabled,
    cooldownLeftMs,
    similarWarning,
    blocksMaterialPaste: (text: string) =>
      materialPasteBlocked(text, [
        problem.passage,
        ...problem.files.map((file) => file.content),
        ...problem.questions.map((question) => `${question.prompt} ${(question.choices ?? []).map((choice) => choice.text).join(" ")}`),
      ]),
    switchSet: (id: string) => {
      if (id !== setId) openSet(id);
    },
  };

  const settingsInsecure = isInsecureRemoteHttp(settingsDraft.baseUrl);
  const clockLabel =
    report != null && (setId === "live" || timeReport == null)
      ? null
      : setId === "live"
        ? formatTimer(liveLeft)
        : setStartedAt != null && setLimitMs > 0
          ? setLeft === 0
            ? `시간 초과 +${formatElapsed(setOverMs)}`
            : formatTimer(setLeft)
          : null;
  const clockOver = (report == null || timeReport != null) && setId !== "live" && setStartedAt != null && setLimitMs > 0 && setLeft === 0;
  const clockTestId = setId === "live" ? "live-timer" : "set-timer";

  return (
    <ExamProvider value={api}>
      <div className={`shell exam-shell${view === "exam" ? " desk-exam" : ""}`}>
        <header className="header">
          <div className="brand">
            <span className="mark">모</span>
            <div>
              <p className="eyebrow">비공식 연습</p>
              <h1>AI 활용평가 연습</h1>
            </div>
            <p className="exam-title">{problem.title}</p>
          </div>
          <div className="header-actions">
            <button type="button" className="btn ghost" data-testid="catalog-back" onClick={showCatalog}>
              문제 목록
            </button>
            {config.mockMode ? <span className="pill mock">모의 응답</span> : <span className="pill">{config.model}</span>}
            <RequestLimitToggle enabled={requestLimitEnabled} onChange={setRequestLimitEnabled} />
            {requestLimitEnabled ? (
              <span className={`pill ${remaining === 0 ? "warn" : ""}`} data-testid="remaining-requests">
                남은 AI 질문 {remaining}회
              </span>
            ) : null}
            {clockLabel ? (
              <span className={`pill live-timer${clockOver ? " overtime" : ""}`} data-testid={`${clockTestId}-mobile`}>
                {clockLabel}
              </span>
            ) : null}
            <button type="button" className="btn ghost" onClick={openSettings}>
              AI 설정
            </button>
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
        {view === "result" && (report ?? timeReport) ? (
          <ResultScreen report={(report ?? timeReport)!} timeReport={report ? timeReport : null} onReview={() => setView("exam")} onNewAttempt={() => setNewAttemptOpen(true)} />
        ) : (
          <>
            <div className="crumb-bar desktop-exam">
              <p className="crumb" data-testid="exam-crumb">
                <span>AI 활용평가 연습</span>
                <span aria-hidden="true"> &gt; </span>
                <span>AI 활용평가</span>
                <span aria-hidden="true"> &gt; </span>
                <span className="crumb-title">{problem.title}</span>
              </p>
              <div className="crumb-actions">
                {clockLabel ? (
                  <span className={`live-timer${clockOver ? " overtime" : ""}`} data-testid={clockTestId}>
                    {clockLabel}
                  </span>
                ) : null}
                <RequestLimitToggle enabled={requestLimitEnabled} onChange={setRequestLimitEnabled} />
                {requestLimitEnabled ? (
                  <span className={`pill ${remaining === 0 ? "warn" : ""}`} data-testid="remaining-requests">
                    남은 AI 질문 {remaining}회
                  </span>
                ) : null}
                <button type="button" className="btn ghost small" onClick={showCatalog}>
                  문제 목록
                </button>
                <button type="button" className="btn ghost small" onClick={openSettings}>
                  AI 설정
                </button>
                <button type="button" className="btn ghost small" onClick={startTour}>
                  둘러보기
                </button>
              </div>
            </div>
            <ExamPanes aiOpen={aiOpen}>
              <div className="slot-left">
                <QuestionRail />
                <MaterialsPane />
              </div>
              <div className="slot-center">
                <DesktopCenter />
                <WorkspacePane />
              </div>
              <AiPane />
            </ExamPanes>
            <ExamFooter />
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
      {settingsOpen ? (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <h2 id="settings-title">AI 설정</h2>
            <p>
              이 브라우저에만 저장되며 저장소나 빌드에 포함되지 않습니다. 질문할 때 입력한 주소로 직접 전송됩니다.
            </p>
            <label className="strict-toggle" htmlFor="strict-off">
              <input
                id="strict-off"
                data-testid="strict-off"
                type="checkbox"
                checked={!strictConstraints}
                onChange={(event) => setStrictConstraints(!event.target.checked)}
              />
              실전 제약 끄기
            </label>
            <p className="note">
              기본으로 질문 후 30초 대기, 직전과 비슷한 질문 경고, 지문·자료 붙여넣기 차단이 켜져 있습니다. 체크하면 이번 연습에서만 그 제약을 끕니다.
            </p>
            <div className="composer" style={{ marginTop: 12 }}>
              <label htmlFor="llm-api-key">API 키</label>
              <input
                id="llm-api-key"
                type="password"
                autoComplete="off"
                value={settingsDraft.apiKey}
                onChange={(event) => setSettingsDraft((prev) => ({ ...prev, apiKey: event.target.value }))}
              />
              <label htmlFor="llm-base-url" style={{ marginTop: 8 }}>주소</label>
              <input
                id="llm-base-url"
                type="text"
                autoComplete="off"
                value={settingsDraft.baseUrl}
                onChange={(event) => setSettingsDraft((prev) => ({ ...prev, baseUrl: event.target.value }))}
              />
              {settingsInsecure ? (
                <p className="warn" role="alert">
                  http 주소는 로컬이 아니면 API 키가 노출될 수 있습니다. 가능하면 https를 사용하세요.
                </p>
              ) : null}
              <label htmlFor="llm-model" style={{ marginTop: 8 }}>모델</label>
              <input
                id="llm-model"
                type="text"
                autoComplete="off"
                value={settingsDraft.model}
                onChange={(event) => setSettingsDraft((prev) => ({ ...prev, model: event.target.value }))}
              />
            </div>
            {settingsStorageError ? (
              <p className="warn" role="alert">
                {settingsStorageError}
              </p>
            ) : null}
            <div className="modal-actions">
              <button type="button" className="btn" onClick={removeSettings}>
                삭제
              </button>
              <button type="button" className="btn" onClick={() => setSettingsOpen(false)}>
                취소
              </button>
              <button type="button" className="btn primary" onClick={persistSettings}>
                저장
              </button>
            </div>
          </div>
        </div>
      ) : null}
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

function RequestLimitToggle({ enabled, onChange }: { enabled: boolean; onChange: (enabled: boolean) => void }) {
  return (
    <label className="limit-toggle">
      <input
        type="checkbox"
        data-testid="request-limit"
        checked={enabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      횟수 제한
    </label>
  );
}
