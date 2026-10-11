export type ContextFile = {
  name: string;
  content: string;
};

export type ContextQuestion = {
  number: number;
  prompt: string;
  choices?: { id: string; text: string }[];
};

export type ContextInput = {
  passage: string;
  question: ContextQuestion | null;
  files: ContextFile[];
  message: string;
};

export type ContextPart = {
  key: string;
  label: string;
  charCount: number;
};

export type ContextMeasurement = {
  text: string;
  charCount: number;
  parts: ContextPart[];
  limit: number | null;
  over: boolean;
  near: boolean;
};

export function formatQuestion(question: ContextQuestion): string {
  const lines = [`${question.number}. ${question.prompt}`];
  if (question.choices?.length) {
    for (const choice of question.choices) {
      lines.push(`${choice.id.toUpperCase()}. ${choice.text}`);
    }
  }
  return lines.join("\n");
}

/** 한도 계산에 넣는 본문만 센다. 구역 제목은 포함하지 않는다. */
export function contextCharCount(input: ContextInput): number {
  let count = input.passage.length + input.message.length;
  if (input.question) count += formatQuestion(input.question).length;
  for (const file of input.files) count += file.content.length;
  return count;
}

export function assembleContext(input: ContextInput): string {
  const blocks = [`# 공통 지문\n${input.passage}`];
  if (input.question) {
    blocks.push(`# 선택한 문제\n${formatQuestion(input.question)}`);
  }
  for (const file of input.files) {
    blocks.push(`# 첨부 파일: ${file.name}\n${file.content}`);
  }
  blocks.push(`# 질문\n${input.message}`);
  return blocks.join("\n\n");
}

export function measureContext(input: ContextInput, limit: number | null = null): ContextMeasurement {
  const parts: ContextPart[] = [
    { key: "passage", label: "공통 지문", charCount: input.passage.length },
  ];
  if (input.question) {
    parts.push({
      key: "question",
      label: `문제 ${input.question.number}`,
      charCount: formatQuestion(input.question).length,
    });
  } else {
    parts.push({ key: "question", label: "선택한 문제", charCount: 0 });
  }
  for (const file of input.files) {
    parts.push({ key: `file:${file.name}`, label: file.name, charCount: file.content.length });
  }
  parts.push({ key: "message", label: "질문", charCount: input.message.length });
  const charCount = parts.reduce((sum, part) => sum + part.charCount, 0);
  const over = limit != null && charCount > limit;
  const near = limit != null && limit > 0 && !over && charCount >= limit * 0.9;
  return {
    text: assembleContext(input),
    charCount,
    parts,
    limit,
    over,
    near,
  };
}
