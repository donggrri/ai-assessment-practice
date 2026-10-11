# TASKS: AI 활용평가 연습 사이트

PLAN: PLAN-ai-assessment-practice.md
상태: Phase 2

워커 노트: `worker` 서브에이전트 타입이 세션에 없어 항목 `worker`는 self로 적었다. 기본 모델 배정은 바꾸지 않았다.

## 진행

- [x] T1 채점 시임
  - id: T1
  - files: `lib/grading.ts`, `lib/grading.test.ts`
  - depends: (없음)
  - parallel: yes
  - worker: self
  - done: `npm test -- lib/grading.test.ts` 통과. 공백 무시, 순서 불일치, 객관식, 빈 답

- [x] T2 컨텍스트 글자 수
  - id: T2
  - files: `lib/context.ts`, `lib/context.test.ts`
  - depends: (없음)
  - parallel: yes
  - worker: self
  - done: `npm test -- lib/context.test.ts` 통과. 미선택 문제는 본문 제외, 한도 초과와 동률

- [x] T3 요청 횟수와 채팅 정책
  - id: T3
  - files: `lib/requests.ts`, `lib/chat-policy.ts`, `lib/requests.test.ts`, `lib/chat-policy.test.ts`
  - depends: T2
  - parallel: no
  - worker: self
  - done: `npm test -- lib/requests.test.ts lib/chat-policy.test.ts` 통과. 0회 거절, 한도 초과 시 횟수 유지, 미첨부 파일 제외

- [x] T4 샘플 문제 세트
  - id: T4
  - files: `data/problem-sets/health-supplement.json`, `lib/problem-sets.ts`, `lib/health-answer-key.test.ts`
  - depends: T1
  - parallel: no
  - worker: self
  - done: `npm test -- lib/health-answer-key.test.ts` 통과. 스펙 정답과 독립 규칙이 일치

- [x] T5 API와 시험 화면
  - id: T5
  - files: `app/api/**`, `components/**`, `app/page.tsx`, `app/globals.css`
  - depends: T3, T4
  - parallel: no
  - worker: self
  - done: `npx tsc --noEmit` 통과, 개발 서버에서 본 화면·한도 경고·채점 결과 확인

- [x] T6 문서
  - id: T6
  - files: `README.md`, `.env.example`, `CONTEXT.md`
  - depends: T5
  - parallel: no
  - worker: self
  - done: README에 실행, 환경 변수, 문제 세트 추가, 한도 설정이 있다
