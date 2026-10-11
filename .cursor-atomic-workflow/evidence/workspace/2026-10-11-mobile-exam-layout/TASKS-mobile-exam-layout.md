# TASKS: 스마트폰 시험 화면

PLAN: PLAN-mobile-exam-layout.md
상태: Phase 2

## 진행

- [x] T1 하단 탭과 좁은 화면 레이아웃
  - id: T1
  - files: `components/exam-app.tsx`, `app/globals.css`, `app/layout.tsx`, `components/materials-pane.tsx`, `components/workspace-pane.tsx`, `components/ai-pane.tsx`, `components/result-screen.tsx`, `components/tour-overlay.tsx`
  - depends: (없음)
  - parallel: no
  - worker: self
  - done: `npm test`

- [x] T2 모바일 길게 누르기 복사 차단
  - id: T2
  - files: `components/copy-guard.tsx`, `app/globals.css`
  - depends: T1
  - parallel: no
  - worker: self
  - done: `npm test`

- [x] T3 배포 문서
  - id: T3
  - files: `README.md`, `.gitignore`
  - depends: T1
  - parallel: no
  - worker: self
  - done: `npm run lint`

- [x] T4 390px 화면 확인
  - id: T4
  - files: (화면)
  - depends: T1, T2
  - parallel: no
  - worker: self
  - done: 390px에서 문제·자료, 답안, AI 어시스트, 채점 결과 캡처
