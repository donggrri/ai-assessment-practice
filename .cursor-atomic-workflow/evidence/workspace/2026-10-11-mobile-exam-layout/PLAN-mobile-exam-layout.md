# PLAN: 스마트폰 시험 화면

상태: Phase 1
슬러그: mobile-exam-layout
워크트리: (없음)
브랜치: main
기준: df7fc37

## 한 줄 목표

360~430px에서는 하단 탭으로 문제·자료, 답안, AI 어시스트를 전환하고, 터치 44px·파일 뷰어·첨부 해제·컨텍스트 경고·채점 화면·길게 누르기 복사를 맞춘 뒤 데스크톱 3단은 유지한다.

## 계획 정제

- route: bounded
- skills: grilling, domain-modeling, codebase-design, wayfinder
- decision rounds: 추가 결정 없음
- settled decisions: 사용자는 하단 탭 이름, 44px, 복사 길게 누르기 차단, 데스크톱 유지, 390px 스크린샷, Origin 기준 무료 배포를 README에 적을 것을 지정했다. 분기점은 기존 1024px를 유지한다. 배포는 실행하지 않고 Vercel Hobby CLI를 문서화한다. `OPENAI_API_KEY`는 `NEXT_PUBLIC_` 없이 서버만 읽는다.
- remaining fog: 없음

## 하지 않을 것

- 1024px 이상 그리드(300px / 1fr / 380px)와 패널 동시 표시를 바꾸지 않는다.
- 채점·컨텍스트·질문 횟수 규칙을 바꾸지 않는다.
- 답안 입력과 채팅 입력에 복사 방지를 씌우지 않는다.
- 실제로 Vercel 프로젝트를 만들거나 키를 넣지 않는다.
- 워크플로 기본 모델 배정을 바꾸지 않는다.

## 막힌 질문

없음.

## 의존 순서

1. 레이아웃·탭·터치·복사 방지
2. README 배포 절
3. `npm test`, `npm run lint`, 390px 화면 확인

## 설계

- `exam-app.tsx`: 탭을 `.panes` 아래로 옮기고 라벨을 문제·자료 / 답안 / AI 어시스트로 둔다.
- `globals.css`: 1023px 이하에서만 터치 최소 높이, 줄바꿈, AI 패널·자료 패널 스크롤, 뷰어 `min-height`. 1024px 미디어 쿼리는 그대로 둔다.
- `copy-guard.tsx`: `selectstart`·`contextmenu` 차단과 가드 안 `selectionchange` 시 선택 해제. CSS에 `-webkit-touch-callout: none`.
- `layout.tsx`: `viewportFit: cover`로 안전 영역.
- `README.md`: Origin 클론 뒤 `npx vercel login`, `link`, `env add OPENAI_API_KEY`, `deploy --prod`.

## 검증

- 자동: `npm test` (기존 채점·컨텍스트·횟수). 화면 변경이라 새 단위 테스트는 없다.
- mutation: stryker 설정 없음. CSS·이벤트 가드라 건너뜀.
- 수동: 390×844에서 문제·자료, 답안(파일 뷰어), AI 어시스트, 채점 결과.

## 문서

`README.md` 배포 절과 화면 설명.

## 오케스트레이션

기본 워커: worker (Cursor Task). 이 세션에는 `worker` `subagent_type`이 없어 호출하지 않았다. 다른 타입으로 대체하지 않고 이 세션이 구현한다. 모델 배정 파일은 수정하지 않았다.
허용 워커: worker, reviewer, self, cli-delegate, agy, opencode, codex, claude
