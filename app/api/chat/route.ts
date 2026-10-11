import { decideChat } from "@/lib/chat-policy";
import { getExamConfig } from "@/lib/config";
import { completeChat } from "@/lib/llm";
import { buildMockReply } from "@/lib/mock-ai";
import { getProblemSet } from "@/lib/problem-sets";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "bad_request", message: "요청 형식이 올바르지 않습니다." },
      { status: 400 },
    );
  }
  if (
    !isRecord(body) ||
    typeof body.problemSetId !== "string" ||
    typeof body.message !== "string" ||
    typeof body.requestsUsed !== "number" ||
    !Array.isArray(body.fileIds) ||
    !body.fileIds.every((item) => typeof item === "string")
  ) {
    return Response.json(
      { error: "bad_request", message: "요청 형식이 올바르지 않습니다." },
      { status: 400 },
    );
  }
  const questionId = body.questionId == null ? null : body.questionId;
  if (questionId !== null && typeof questionId !== "string") {
    return Response.json(
      { error: "bad_request", message: "요청 형식이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const config = getExamConfig();
  const decision = decideChat({
    problemSet: getProblemSet(body.problemSetId),
    questionId,
    fileIds: body.fileIds,
    message: body.message,
    requestsUsed: body.requestsUsed,
    contextCharLimit: config.contextCharLimit,
    aiRequestLimit: config.aiRequestLimit,
  });
  if (!decision.ok) {
    return Response.json(
      {
        error: decision.error,
        message: decision.message,
        charCount: decision.charCount,
        limit: decision.limit,
        remaining: decision.remaining,
      },
      { status: decision.status },
    );
  }

  try {
    const reply = config.mockMode
      ? buildMockReply({
          passageChars: decision.passageChars,
          questionNumber: decision.questionNumber,
          questionChars: decision.questionPrompt?.length ?? 0,
          files: decision.files,
          omittedFileNames: decision.omittedFileNames,
          message: decision.message,
          totalChars: decision.charCount,
        })
      : await completeChat({
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          model: config.model,
          content: decision.context,
        });
    return Response.json({
      reply,
      mock: config.mockMode,
      charCount: decision.charCount,
      requestsUsed: decision.nextUsed,
      remaining: decision.remaining,
      questionNumber: decision.questionNumber,
      fileNames: decision.files.map((file) => file.name),
    });
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: "model_error", message: "모델 호출에 실패했습니다. 잠시 후 다시 시도하세요." },
      { status: 502 },
    );
  }
}
