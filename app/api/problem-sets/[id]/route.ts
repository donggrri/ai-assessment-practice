import { headers } from "next/headers";
import { getProblemSet } from "@/lib/problem-sets";
import { toPublicProblemSet } from "@/lib/public-problem";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  await headers();
  const { id } = await ctx.params;
  const set = getProblemSet(id);
  if (!set) {
    return Response.json(
      { error: "not_found", message: "문제 세트를 찾을 수 없습니다." },
      { status: 404 },
    );
  }
  return Response.json(toPublicProblemSet(set));
}
