import type { ChatMessage, GradeReport } from "@/lib/types";

export type ExamPersist = {
  v: 1;
  saved: Record<string, string>;
  drafts: Record<string, string>;
  activeQuestionId: string;
  viewerFileId: string | null;
  attachedFileIds: string[];
  chatQuestionId: string | null;
  messages: ChatMessage[];
  requestsUsed: number;
  report: GradeReport | null;
  view: "exam" | "result";
  reviewIds?: string[];
  /** 제한 시간이 있는 세트를 연 시각. 없으면 타이머가 없는 세트다. */
  startedAt?: number;
  /** 제한 시간이 끝난 순간 자동 채점한 결과. 한 번만 만든다. */
  timeReport?: GradeReport | null;
};

export function storageKey(setId: string): string {
  return `aipractice:v1:${setId}`;
}

export function loadExam(setId: string): ExamPersist | null {
  try {
    const raw = localStorage.getItem(storageKey(setId));
    if (!raw) return null;
    const data = JSON.parse(raw) as ExamPersist;
    if (!data || data.v !== 1 || !Array.isArray(data.messages)) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveExam(setId: string, data: ExamPersist): void {
  localStorage.setItem(storageKey(setId), JSON.stringify(data));
}
