export type QuestionType = "short" | "multiple";

export type Choice = {
  id: string;
  text: string;
};

export type ExamFile = {
  id: string;
  name: string;
  content: string;
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
