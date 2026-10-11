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
