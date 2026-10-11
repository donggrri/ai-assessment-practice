import { ExamApp } from "@/components/exam-app";
import { readBuildConfig } from "@/lib/config";
import { loadProblemSets } from "@/lib/problem-sets";

export default function Home() {
  const sets = loadProblemSets();
  const buildConfig = readBuildConfig();
  return <ExamApp sets={sets} buildConfig={buildConfig} />;
}
