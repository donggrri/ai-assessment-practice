import { estimateTokens } from "./tokens";

export function buildMockReply(input: {
  passageChars: number;
  questionNumber: number | null;
  questionChars: number;
  files: { name: string; content: string }[];
  omittedFileNames: string[];
  message: string;
  totalChars: number;
}): string {
  const fileTokens = input.files.reduce((sum, file) => sum + estimateTokens(file.content), 0);
  const lines = [
    "모의 응답입니다. API 키가 없어 모델을 호출하지 않았습니다. 설정 화면에서 API 키를 입력하면 실제 모델을 호출합니다.",
    "",
    "받은 컨텍스트",
    `- 공통 지문 ${input.passageChars.toLocaleString("ko-KR")}자`,
    input.questionNumber == null
      ? "- 선택한 문제 없음. 공통 지문만 전달했습니다."
      : `- 선택한 문제 ${input.questionNumber}번 (${input.questionChars.toLocaleString("ko-KR")}자)`,
    input.files.length === 0
      ? "- 첨부 파일 없음"
      : `- 첨부 파일 ${input.files.length}개, 약 ${fileTokens.toLocaleString("ko-KR")}토큰`,
    ...input.files.map(
      (file) =>
        `  · ${file.name} (${file.content.length.toLocaleString("ko-KR")}자, 약 ${estimateTokens(file.content).toLocaleString("ko-KR")}토큰)`,
    ),
    input.omittedFileNames.length
      ? `- 첨부하지 않아 빠뜨린 파일: ${input.omittedFileNames.join(", ")}`
      : "- 빠뜨린 파일 없음",
    `- 질문 ${input.message.length.toLocaleString("ko-KR")}자`,
    `- 합계 ${input.totalChars.toLocaleString("ko-KR")}자`,
    "",
    "질문 앞부분",
    input.message.trim().slice(0, 500),
    "",
    "첨부하지 않은 파일 내용은 이 응답에 포함되지 않았습니다. 실제 모델을 쓰려면 설정 화면에서 API 키를 입력하세요.",
  ];
  return lines.join("\n");
}
