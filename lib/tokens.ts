/** 화면 표시용 대략 토큰. 한글이 많은 본문은 글자 2개당 약 1토큰으로 본다. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 2);
}
