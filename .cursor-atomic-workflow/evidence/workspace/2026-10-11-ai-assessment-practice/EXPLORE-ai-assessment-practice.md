# EXPLORE: AI 활용평가 연습 사이트

상태: Phase 0
슬러그: ai-assessment-practice
기준: main (스캐폴드만 있는 빈 저장소에서 시작)

## 한 줄 요약

저장소는 Next.js 16 스캐폴드뿐이었고 시험 로직은 없었다. 세션의 Task 서브에이전트 목록에 explorer가 없어 부모가 탐색 문서를 작성했다.

## 분석 대상 파일 및 디렉터리

1. `uploads/practice-site-spec_3524.md` — 3분할 시험 UI, 채점, 첨부, 컨텍스트·횟수 제한, 모의 AI, 샘플 문제 세트
2. `package.json`, `next.config.ts`, `app/` — create-next-app(Next 16.4, React 19, Tailwind 4) 직후 상태
3. `.cursor/agents/*.md` — 설치 후 기본 모델 유지 (`explorer` = `claude-haiku-5-5-high` 등)
4. 세션 `available_subagent_types` — `generalPurpose`, `explore`, `computerUse`, `videoReview`, `cursor-guide`, `ci-investigator`, `best-of-n-runner`. `explorer`, `planner`, `plan-reviewer`, `tasker`, `worker`, `cursor-atomic-reviewer`, `tester`, `bugbot` 없음
5. 세션 `available_subagent_models` — `claude-haiku-5-5-high` 없음. `@cursor/sdk` 미설치

## 핵심 코드 및 인터페이스

구현 전이라 제품 인터페이스는 없었다. 계획에서 시험 규칙을 아래 세 모듈로 모으기로 했다.

- `gradeProblemSet(set, answers)`
- `measureContext(input, limit)` / `contextCharCount`
- `decideChat(...)` — 컨텍스트 한도와 질문 횟수

## 아키텍처 및 흐름

브라우저가 문제 세트(정답 제외)와 설정만 받고, 채점·모델 호출은 Route Handler가 한다. 자료 파일 본문은 뷰어용으로 클라이언트에 있으나, 모델에는 서버가 문제 세트에서 다시 고른 첨부 파일만 넣는다.

## 제약 사항 및 리스크

- 워크플로 기본 모델은 바꾸지 않았다. 역할 서브에이전트 타입이 세션에 없고 explorer/tester 모델 슬러그도 없다. SDK 파이프라인은 패키지 부재와 비용 확인 전에 시작하지 않았다.
- 사용자는 이미 스캐폴드가 있는 상태에서 계획 문서를 쓰고 리뷰·마무리까지 진행하라고 했다.
- Next 16 route `params`는 Promise다. `cacheComponents`가 켜져 있어 설정·문제 API는 `force-dynamic`이 필요하다.

## PLAN을 위한 권장 사항

1. 채점, 글자 수, 요청 횟수를 순수 함수로 두고 테스트한다.
2. 문제 세트는 `data/problem-sets/*.json` 자동 적재. 정답은 채점 응답에만 포함한다.
3. 키가 없으면 모의 응답으로 UI 전체를 연다.
