const SYSTEM = [
  "너는 문서와 표를 읽는 연습 시험의 조교다.",
  "사용자 메시지에 들어 있는 공통 지문, 선택한 문제, 첨부 파일, 질문만 근거로 답한다.",
  "첨부되지 않은 자료는 없다고 보고, 추측하지 않는다. 근거가 없으면 확인 불가로 적는다.",
  "계산이나 대조가 필요하면 조건별로 표를 만들고 과정을 단계로 보여 준다.",
  "답은 한국어로 쓴다.",
].join("\n");

export async function completeChat(input: {
  baseUrl: string;
  apiKey: string;
  model: string;
  content: string;
}): Promise<string> {
  const response = await fetch(`${input.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: input.content },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`모델 요청 실패 (${response.status}): ${detail.slice(0, 280)}`);
  }
  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== "string" || text.trim() === "") {
    throw new Error("모델 응답이 비어 있습니다.");
  }
  return text.trim();
}
