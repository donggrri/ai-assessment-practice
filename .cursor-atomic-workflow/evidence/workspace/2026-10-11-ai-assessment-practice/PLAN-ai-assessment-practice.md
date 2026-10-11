# PLAN: AI 활용평가 연습 사이트

상태: Phase 1
슬러그: ai-assessment-practice
워크트리: (없음)
브랜치: main
기준: 스캐폴드 커밋 2c9ae63 이후 작업 트리

## 한 줄 목표

건강기능식품 입점 심사 샘플로, 제한된 AI 조교와 함께 푸는 3분할 연습 시험을 로컬에서 한 명령으로 연다.

## 계획 정제

- route: bounded
- skills: grilling, domain-modeling, codebase-design, wayfinder, cursor-atomic-workflow
- decision rounds: 0 (스펙이 화면·샘플 정답·한도 기본값을 이미 확정. 백그라운드 세션이라 추가 인터뷰를 열지 않음)
- settled decisions:
  - Next.js + TypeScript. 문제 세트는 `data/problem-sets/*.json`
  - 시험 규칙은 `gradeProblemSet`, `measureContext`, `decideChat` 세 모듈
  - 정답·해설은 채점 API 이후에만 전달
  - 키 없으면 모의 응답. 한도 기본값 20000자, 10회
  - 샘플 1~4번은 스펙 그대로, 5번은 객관식 UI를 실제로 쓰기 위한 추가 문항
  - 대화는 화면에서 삭제하지 않음. 새 응시는 답안과 횟수만 리셋
  - 워크플로 기본 모델은 변경하지 않음
- remaining fog: 없음
- defaults-adopted: 주관식은 공백·전각 쉼표·대소문자 무시, 코드 순서는 유지. 한도 글자 수는 구역 제목을 빼낸 본문 합. 질문 횟수는 클라이언트가 보낸 사용 횟수를 서버가 검사 (계정 없음)

## 하지 않을 것

- 프로그래머스 문제·로고·자산 복제
- 로그인, 데이터베이스
- 대화 기록 삭제 버튼
- 첨부하지 않은 파일을 모델 컨텍스트에 포함
- 워크플로 에이전트 모델 덮어쓰기 (`--set-model` 사용 안 함)
- `@cursor/sdk` 유료 파이프라인 (미설치, 역할 서브에이전트 없음, 비용 확인 전)

## 막힌 질문

없음.

## 의존 순서

1. 채점·컨텍스트·요청 횟수 모듈과 테스트
2. 샘플 JSON과 정답 키 검증
3. 설정·문제 세트·채점·채팅 Route Handler
4. 3분할 시험 UI, 투어, 채점 결과
5. 한국어 README와 환경 변수 예시

## 설계

- 외부 시임: `gradeProblemSet`, `measureContext`, `decideChat`. UI와 라우트는 이 함수만 호출한다.
- `loadProblemSets`는 JSON을 읽고 형식을 검사한다. `toPublicProblemSet`이 `answer`와 `explanation`을 뺀다.
- 채팅 라우트는 클라이언트가 보낸 파일 본문을 믿지 않고 id로 서버 자료를 다시 고른다.
- 글자 수가 한도를 넘거나 남은 횟수가 0이면 모델을 호출하지 않고 횟수도 올리지 않는다.
- 브라우저 상태는 `localStorage` 키 `aipractice:v1:<세트 id>`.

## 검증

- 자동: `npm test` (채점, 컨텍스트 합산, 요청 횟수, 샘플 정답)
- mutation: Stryker 설정이 없으므로 설치하지 않는다
- 수동: 개발 서버에서 본 화면, 한도 초과 경고, 채점 결과

## 문서

- `README.md` 실행, 환경 변수, 문제 세트 추가
- `CONTEXT.md` 용어
- `.env.example`

## 오케스트레이션

기본 워커: worker (Cursor Task, model `composer-2.5`)
이 세션: `available_subagent_types`에 `worker`가 없다. 사용자는 진행 중인 구현을 계획 문서에 남기고 리뷰·마무리까지 이어가라고 했다. 그래서 구현은 부모가 맡는다. 모델 슬러그는 바꾸지 않았다.

허용 워커: worker, reviewer, self, cli-delegate, agy, opencode, codex, claude

## 러너

`run-pipeline.mjs`는 호출하지 않았다. task-card에 필요한 `tasker`, `planner`, `plan-reviewer`, `worker`, `cursor-atomic-reviewer`가 세션에 없고, SDK 어댑터는 `@cursor/sdk`가 없으며 비용 확인 전이다.
