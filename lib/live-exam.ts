import { gradeProblemSet } from "./grading";
import type { ChatMessage, GradeReport, ProblemSet, PublicQuestion, QuestionType } from "./types";

export const LIVE_LIMIT = 16;
export const LIVE_DURATION_MS = 90 * 60 * 1000;
export const LIVE_STORAGE_KEY = "aipractice:live:v1";

export type LiveRef = {
  setId: string;
  questionId: string;
};

export function questionFormLabel(question: { type: QuestionType; choices?: { id: string }[] }): "객관식" | "주관식" {
  if (question.type === "multiple" && (question.choices?.length ?? 0) >= 2) return "객관식";
  return "주관식";
}

export function liveQuestionKey(ref: LiveRef): string {
  return `${ref.setId}:${ref.questionId}`;
}

export function parseLiveQuestionKey(key: string): LiveRef | null {
  const index = key.indexOf(":");
  if (index <= 0 || index === key.length - 1) return null;
  return { setId: key.slice(0, index), questionId: key.slice(index + 1) };
}

/** 세트를 번갈아 골라 최대 limit문항을 모은다. 순서는 세트 순서를 유지한다. */
export function buildLivePaper(sets: { id: string; questions: { id: string }[] }[], limit = LIVE_LIMIT): LiveRef[] {
  const queues = sets
    .filter((set) => set.questions.length > 0)
    .map((set) => set.questions.map((question) => ({ setId: set.id, questionId: question.id })));
  const paper: LiveRef[] = [];
  while (paper.length < limit && queues.some((queue) => queue.length > 0)) {
    for (const queue of queues) {
      if (paper.length >= limit) break;
      const next = queue.shift();
      if (next) paper.push(next);
    }
  }
  return paper;
}

export function formatTimer(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** 경과 시간(올라가는 시계)은 내림으로 센다. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function remainingLiveMs(startedAt: number, now: number, duration = LIVE_DURATION_MS): number {
  if (!Number.isFinite(startedAt) || !Number.isFinite(now)) return 0;
  return Math.max(0, startedAt + duration - now);
}

export function liveQuestions(sets: ProblemSet[], paper: LiveRef[]): PublicQuestion[] {
  return paper.flatMap((ref, index) => {
    const set = sets.find((item) => item.id === ref.setId);
    const question = set?.questions.find((item) => item.id === ref.questionId);
    if (!set || !question) return [];
    return [
      {
        id: liveQuestionKey(ref),
        number: index + 1,
        type: question.type,
        prompt: question.prompt,
        ...(question.choices ? { choices: question.choices } : {}),
      },
    ];
  });
}

export type LiveSession = {
  v: 1;
  paper: LiveRef[];
  startedAt: number;
  saved: Record<string, string>;
  drafts: Record<string, string>;
  activeQuestionId: string;
  viewerFileId: string | null;
  attachedFileIds: string[];
  chatQuestionId: string | null;
  messages: ChatMessage[];
  /** 실전 모드에서 문제 세트별 대화. 없으면 messages를 현재 문항 세트의 기록으로 본다. */
  threads?: Record<string, ChatMessage[]>;
  requestsUsed: number;
  report: GradeReport | null;
  view: "exam" | "result";
  reviewIds: string[];
};

type LiveStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

function isLiveRef(value: unknown): value is LiveRef {
  if (!value || typeof value !== "object") return false;
  const item = value as LiveRef;
  return typeof item.setId === "string" && item.setId.length > 0 && typeof item.questionId === "string" && item.questionId.length > 0;
}

export function loadLiveSession(storage: LiveStorage): LiveSession | null {
  try {
    const raw = storage.getItem(LIVE_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as LiveSession;
    if (!data || data.v !== 1 || !Array.isArray(data.messages) || !Number.isFinite(data.startedAt)) return null;
    const paper = Array.isArray(data.paper) ? data.paper.filter(isLiveRef) : [];
    if (paper.length === 0) return null;
    return { ...data, paper, reviewIds: Array.isArray(data.reviewIds) ? data.reviewIds : [] };
  } catch {
    return null;
  }
}

export function saveLiveSession(data: LiveSession, storage: LiveStorage): void {
  storage.setItem(LIVE_STORAGE_KEY, JSON.stringify(data));
}

export function gradeLivePaper(
  sets: ProblemSet[],
  paper: LiveRef[],
  answers: Record<string, string | undefined>,
): GradeReport {
  const items = paper.flatMap((ref, index) => {
    const set = sets.find((item) => item.id === ref.setId);
    const question = set?.questions.find((item) => item.id === ref.questionId);
    if (!set || !question) return [];
    const graded = gradeProblemSet(
      { ...set, questions: [question] },
      { [question.id]: answers[liveQuestionKey(ref)] ?? "" },
    );
    const item = graded.items[0];
    if (!item) return [];
    return [{ ...item, questionId: liveQuestionKey(ref), number: index + 1 }];
  });
  const correctCount = items.filter((item) => item.correct).length;
  const total = items.length;
  return {
    problemSetId: "live",
    title: "실전 모드",
    correctCount,
    total,
    score: total === 0 ? 0 : Math.round((correctCount / total) * 100),
    items,
  };
}
