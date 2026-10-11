import { headers } from "next/headers";
import { loadProblemSets } from "@/lib/problem-sets";
import { toSummary } from "@/lib/public-problem";

export async function GET() {
  await headers();
  const sets = loadProblemSets().map(toSummary);
  return Response.json({ sets });
}
