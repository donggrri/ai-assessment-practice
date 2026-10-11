import { headers } from "next/headers";
import { toClientConfig } from "@/lib/config";

export async function GET() {
  await headers();
  return Response.json(toClientConfig());
}
