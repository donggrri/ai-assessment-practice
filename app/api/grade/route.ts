import { gradeProblemSet } from "@/lib/grading";
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
  if (!isRecord(body) || typeof body.problemSetId !== "string" || !isRecord(body.answers)) {
    return Response.json(
      { error: "bad_request", message: "요청 형식이 올바르지 않습니다." },
      { status: 400 },
    );
  }
  const answers: Record<string, string> = {};
  for (const [key, value] of Object.entries(body.answers)) {
    if (typeof value !== "string") {
      return Response.json(
        { error: "bad_request", message: "답안은 문자열이어야 합니다." },
        { status: 400 },
      );
    }
    answers[key] = value;
  }
  const set = getProblemSet(body.problemSetId);
  if (!set) {
    return Response.json(
      { error: "not_found", message: "문제 세트를 찾을 수 없습니다." },
      { status: 404 },
    );
  }
  return Response.json(gradeProblemSet(set, answers));
}
