import { decideChat } from "./chat-policy";
import { composeModelContent, type ChatContentPart } from "./file-attachment";
import { gradeProblemSet } from "./grading";
import { completeChat, isImageUnsupportedError, ModelRequestError } from "./llm";
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
function networkDetail(error: unknown): string {
  return error instanceof Error && error.message ? ` (${error.name}: ${error.message.slice(0, 200)})` : "";
}
const EMPTY_MODEL_MESSAGE = "모델 응답이 비어 있습니다.";

function userFacingModelError(error: unknown): string {
  if (error instanceof ModelRequestError) return error.message;
  if (error instanceof Error && error.message === EMPTY_MODEL_MESSAGE) return error.message;
  return MODEL_FAIL_MESSAGE + networkDetail(error);
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
      });

      if (!decision.ok) {
        return {
          ok: false,
          error: decision.error,
          message: decision.message,
        };
      }

      const mock = isMockMode(settings);

      try {
        const reply = mock
          ? buildMockReply({
              passageChars: decision.passageChars,
              questionNumber: decision.questionNumber,
              questionChars: decision.questionPrompt?.length ?? 0,
              files: decision.files,
              omittedFileNames: decision.omittedFileNames,
              message: decision.message,
              totalChars: decision.charCount,
            })
          : await (async () => {
              const composed = await composeModelContent({
                context: decision.context,
                files: decision.files,
                model: settings.model,
                loadMedia,
              });
              try {
                return await completeChat({
                  baseUrl: settings.baseUrl,
                  apiKey: settings.apiKey,
                  model: settings.model,
                  content: composed,
                  fetchImpl,
                });
              } catch (error) {
                if (contentHasImage(composed) && isImageUnsupportedError(error)) {
                  return completeChat({
                    baseUrl: settings.baseUrl,
                    apiKey: settings.apiKey,
                    model: settings.model,
                    content: decision.context,
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
