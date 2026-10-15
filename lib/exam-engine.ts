import { decideChat } from "./chat-policy";
import { buildModelMessages, type ModelTurn } from "./chat-thread";
import { composeModelContent, type ChatContentPart } from "./file-attachment";
import { gradeProblemSet } from "./grading";
import { completeChat, isImageUnsupportedError, MODEL_TIMEOUT_MS, ModelRequestError } from "./llm";
import { isMockMode, normalizeLlmSettings, type LlmSettings } from "./llm-settings";
import { buildMockReply } from "./mock-ai";
import { toPublicProblemSet, toSummary } from "./public-problem";
import type { GradeReport, ProblemSet, PublicProblemSet, ProblemSetSummary } from "./types";

export type ExamEngineConfig = {
  contextCharLimit: number;
  aiRequestLimit: number;
  copyProtection: boolean;
};

type SendInput = {
  problemSetId: string;
  questionId: string;
  fileIds: string[];
  message: string;
  requestsUsed: number;
  history?: readonly ModelTurn[];
  enforceRequestLimit?: boolean;
};

type SendSuccess = {
  ok: true;
  reply: string;
  mock: boolean;
  charCount: number;
  requestsUsed: number;
  remaining: number;
  questionNumber: number | null;
  fileNames: string[];
  userContent: string;
  messages: ReturnType<typeof buildModelMessages>;
};

type SendFailure = {
  ok: false;
  error: string;
  message: string;
};

type GradeNotFound = {
  error: "not_found";
  message: string;
};

const MODEL_FAIL_MESSAGE = "모델 호출에 실패했습니다. 잠시 후 다시 시도하세요.";
const EMPTY_MODEL_MESSAGE = "모델 응답이 비어 있습니다.";

function userFacingModelError(error: unknown): string {
  if (error instanceof ModelRequestError) return error.message;
  if (error instanceof Error && error.message === EMPTY_MODEL_MESSAGE) return error.message;
  if (error instanceof Error && error.name === "AbortError") {
    return "요청이 취소되었습니다. 질문 횟수는 차감되지 않았습니다.";
  }
  if (error instanceof Error && error.name === "TimeoutError") {
    return `모델 응답 시간 초과(${Math.round(MODEL_TIMEOUT_MS / 1000)}초). 질문 횟수는 차감되지 않았습니다. 질문을 나누거나 다시 시도하세요.`;
  }
  if (error instanceof TypeError) {
    return `네트워크 오류로 모델에 연결하지 못했습니다(${error.message}). 질문 횟수는 차감되지 않았습니다.`;
  }
  if (error instanceof Error && error.message) return `${MODEL_FAIL_MESSAGE} (${error.message.slice(0, 200)})`;
  return MODEL_FAIL_MESSAGE;
}

function contentHasImage(content: string | ChatContentPart[]): boolean {
  return Array.isArray(content) && content.some((part) => part.type === "image_url");
}

const DEFAULT_SETTINGS_ON_READ_ERROR: LlmSettings = {
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
};

function readSettingsSafe(readSettings: () => LlmSettings): LlmSettings {
  try {
    return readSettings();
  } catch {
    return { ...DEFAULT_SETTINGS_ON_READ_ERROR };
  }
}

function findSet(sets: ProblemSet[], id: string): ProblemSet | undefined {
  return sets.find((set) => set.id === id);
}

export function createExamEngine(options: {
  sets: ProblemSet[];
  config: ExamEngineConfig;
  readSettings: () => LlmSettings;
  fetchImpl?: typeof fetch;
  loadMedia?: (media: string) => Promise<string | null>;
}) {
  const { sets, config, readSettings, fetchImpl, loadMedia } = options;

  return {
    async send(input: SendInput): Promise<SendSuccess | SendFailure> {
      const settings = normalizeLlmSettings(readSettingsSafe(readSettings));
      const problemSet = findSet(sets, input.problemSetId);

      const decision = decideChat({
        problemSet,
        questionId: input.questionId,
        fileIds: input.fileIds,
        message: input.message,
        requestsUsed: input.requestsUsed,
        contextCharLimit: config.contextCharLimit,
        aiRequestLimit: config.aiRequestLimit,
        enforceRequestLimit: input.enforceRequestLimit,
      });

      if (!decision.ok) {
        return {
          ok: false,
          error: decision.error,
          message: decision.message,
        };
      }

      const mock = isMockMode(settings);
      const history = input.history ?? [];

      try {
        let sentMessages = buildModelMessages(history, decision.context);
        const reply = mock
          ? buildMockReply({
              passageChars: decision.passageChars,
              questionNumber: decision.questionNumber,
              questionChars: decision.questionPrompt?.length ?? 0,
              files: decision.files,
              omittedFileNames: decision.omittedFileNames,
              message: decision.message,
              totalChars: decision.charCount,
              priorTurns: history.filter((turn) => turn.role === "user").length,
            })
          : await (async () => {
              const composed = await composeModelContent({
                context: decision.context,
                files: decision.files,
                model: settings.model,
                loadMedia,
              });
              sentMessages = buildModelMessages(history, composed);
              try {
                return await completeChat({
                  baseUrl: settings.baseUrl,
                  apiKey: settings.apiKey,
                  model: settings.model,
                  content: composed,
                  history,
                  fetchImpl,
                });
              } catch (error) {
                if (contentHasImage(composed) && isImageUnsupportedError(error)) {
                  sentMessages = buildModelMessages(history, decision.context);
                  return completeChat({
                    baseUrl: settings.baseUrl,
                    apiKey: settings.apiKey,
                    model: settings.model,
                    content: decision.context,
                    history,
                    fetchImpl,
                  });
                }
                throw error;
              }
            })();

        return {
          ok: true,
          reply,
          mock,
          charCount: decision.charCount,
          requestsUsed: decision.nextUsed,
          remaining: decision.remaining,
          questionNumber: decision.questionNumber,
          fileNames: decision.files.map((file) => file.name),
          userContent: decision.context,
          messages: sentMessages,
        };
      } catch (error) {
        return {
          ok: false,
          error: "model_error",
          message: userFacingModelError(error),
        };
      }
    },

    grade(
      problemSetId: string,
      answers: Record<string, string | undefined>,
    ): GradeReport | GradeNotFound {
      const problemSet = findSet(sets, problemSetId);
      if (!problemSet) {
        return {
          error: "not_found",
          message: "문제 세트를 찾을 수 없습니다.",
        };
      }
      return gradeProblemSet(problemSet, answers);
    },

    getPublic(problemSetId: string): PublicProblemSet {
      const problemSet = findSet(sets, problemSetId);
      if (!problemSet) {
        throw new Error(`Problem set not found: ${problemSetId}`);
      }
      return toPublicProblemSet(problemSet);
    },

    list(): ProblemSetSummary[] {
      return sets.map(toSummary);
    },
  };
}
