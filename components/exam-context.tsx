"use client";

import { createContext, useContext } from "react";
import type { ContextMeasurement } from "@/lib/context";
import type {
  ChatMessage,
  ExamClientConfig,
  GradeReport,
  ProblemSetSummary,
  PublicProblemSet,
} from "@/lib/types";

export type MobilePane = "materials" | "work" | "ai";

export type ExamApi = {
  config: ExamClientConfig;
  problem: PublicProblemSet;
  summaries: ProblemSetSummary[];
  activeQuestionId: string;
  saved: Record<string, string>;
  drafts: Record<string, string>;
  viewerFileId: string | null;
  attachedFileIds: string[];
  chatQuestionId: string | null;
  messages: ChatMessage[];
  chatGroupId: string;
  memoryTurns: number;
  threadChars: number;
  threadTokens: number;
  requestsUsed: number;
  report: GradeReport | null;
  sending: boolean;
  chatError: string | null;
  chatDraft: string;
  mobilePane: MobilePane;
  tourRevealAttach: boolean;
  saveFlash: boolean;
  measurement: ContextMeasurement;
  remaining: number;
  locked: boolean;
  reviewIds: string[];
  materialTitle: string;
  setMobilePane: (pane: MobilePane) => void;
  selectQuestion: (id: string) => void;
  toggleReview: (id: string) => void;
  resetActive: () => void;
  requestGrade: () => void;
  showResult: () => void;
  setDraft: (id: string, value: string) => void;
  saveActive: () => void;
  openFile: (id: string) => void;
  attachFile: (id: string) => void;
  detachFile: (id: string) => void;
  setChatQuestionId: (id: string | null) => void;
  setChatDraft: (value: string) => void;
  sendChat: () => void;
  clearChat: () => void;
  strictConstraints: boolean;
  setStrictConstraints: (enabled: boolean) => void;
  requestLimitEnabled: boolean;
  setRequestLimitEnabled: (enabled: boolean) => void;
  cooldownLeftMs: number;
  similarWarning: string | null;
  blocksMaterialPaste: (text: string) => boolean;
  switchSet: (id: string) => void;
};

const ExamContext = createContext<ExamApi | null>(null);

export function ExamProvider({ value, children }: { value: ExamApi; children: React.ReactNode }) {
  return <ExamContext.Provider value={value}>{children}</ExamContext.Provider>;
}

export function useExam(): ExamApi {
  const value = useContext(ExamContext);
  if (!value) throw new Error("시험 화면 밖에서 useExam을 호출했습니다.");
  return value;
}
