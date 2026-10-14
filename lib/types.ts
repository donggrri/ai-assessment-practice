export type QuestionType = "short" | "multiple";

export type Choice = {
  id: string;
  text: string;
};

export type ExamFileKind = "text" | "pdf" | "png";

export type ExamFile = {
  id: string;
  name: string;
  content: string;
  kind?: ExamFileKind;
  media?: string;
};

export type Question = {
  id: string;
  number: number;
  type: QuestionType;
  prompt: string;
  choices?: Choice[];
  answer: string;
  explanation: string;
};

export type Difficulty = "쉬움" | "보통" | "어려움";

export type ProblemSet = {
  id: string;
  title: string;
  /** 카드에 보이는 유형. 없으면 문항 형식으로 정한다. */
  category?: string;
  /** 카탈로그 난이도 배지. */
  difficulty?: Difficulty;
  /** 이 세트만 풀 때의 제한 시간(분). 실전 모드 90분과는 별개다. */
  timeLimitMin?: number;
  passage: string;
  files: ExamFile[];
  questions: Question[];
};

export type PublicQuestion = Omit<Question, "answer" | "explanation">;

export type PublicProblemSet = Omit<ProblemSet, "questions"> & {
  questions: PublicQuestion[];
};

export type ProblemSetSummary = {
  id: string;
  title: string;
  kind: string;
  questionCount: number;
  fileCount: number;
  difficulty?: Difficulty;
  timeLimitMin?: number;
};

export type GradeItem = {
  questionId: string;
  number: number;
  type: QuestionType;
  prompt: string;
  choices?: Choice[];
  userAnswer: string;
  userAnswerLabel: string;
  correctAnswer: string;
  correctAnswerLabel: string;
  correct: boolean;
  explanation: string;
};

export type GradeReport = {
  problemSetId: string;
  title: string;
  correctCount: number;
  total: number;
  score: number;
  items: GradeItem[];
};

export type ChatRole = "user" | "assistant" | "system";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  /** 예전 저장본에 첨부 본문이 있어도 다음 요청에는 실리지 않는다. */
  modelContent?: string;
  createdAt: string;
  meta?: {
    questionNumber: number | null;
    fileNames: string[];
    charCount: number;
    mock?: boolean;
  };
};

export type BuildConfig = {
  contextCharLimit: number;
  aiRequestLimit: number;
  copyProtection: boolean;
};

export type ExamClientConfig = BuildConfig & {
  mockMode: boolean;
  model: string;
};
