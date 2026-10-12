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

export type ProblemSet = {
  id: string;
  title: string;
  /** 카드에 보이는 유형. 없으면 문항 형식으로 정한다. */
  category?: string;
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
