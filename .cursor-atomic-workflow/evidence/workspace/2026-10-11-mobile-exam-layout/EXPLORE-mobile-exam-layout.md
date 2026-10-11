# EXPLORE: 좁은 화면 시험 UI

상태: Phase 0
슬러그: mobile-exam-layout
기준: df7fc37

## 한 줄 요약

1024px 미만은 이미 탭으로 패널을 숨기지만, 탭이 상단이고 터치 높이가 44px 미만이며 파일 뷰어·경고·채점 화면이 360~430px에서 잘릴 수 있다. 데스크톱 그리드는 `@media (min-width: 1024px)`에만 있다.

## 분석 대상 파일 및 디렉터리

1. `app/globals.css` — 3단 그리드, `.mobile-tabs`, 720px 이하 제목 숨김, 복사 방지 `user-select`
2. `components/exam-app.tsx` — `mobilePane` 상태, 탭 라벨(자료/풀이/AI), 문제 선택·파일 열기·첨부 시 탭 전환
3. `components/materials-pane.tsx` — 문제 목록, 지문 `CopyGuard`, 파일 행과 `.attach-btn`
4. `components/workspace-pane.tsx` — 답안 입력, 파일 뷰어
5. `components/ai-pane.tsx` — 칩 해제 버튼, 컨텍스트 경고 `data-testid="context-warning"`
6. `components/result-screen.tsx` — 점수와 문항 카드
7. `components/copy-guard.tsx` — copy/cut/contextmenu. 길게 누르기 `selectstart`·`touch-callout` 없음
8. `components/tour-overlay.tsx` — 카드 좌표가 하단 탭과 겹칠 수 있음
9. `README.md` — 로컬 실행만 있고 배포 절차 없음
10. `lib/config.ts` — `OPENAI_API_KEY`는 서버 설정에만 있고 `toClientConfig`는 키를 빼서 반환

## 핵심 코드 및 인터페이스

```typescript
type MobilePane = "materials" | "work" | "ai";
```

`selectQuestion`과 `openFile`은 `work`로, `attachFile`은 `ai`로 `mobilePane`을 바꾼다. 1024px 이상에서는 세 패널을 동시에 `display: flex` 한다.

## 아키텍처 및 흐름

`.shell`이 세로 flex이고 `.panes`가 남은 높이를 쓴다. 좁은 화면은 `.pane`을 숨기고 `.pane.active`만 보여 준다. 답·대화는 기존 localStorage 키를 유지한다. 배포 시 키는 `app/api/chat` 서버 경로에서만 모델 호출에 쓰인다.

## 제약 사항 및 리스크

- 이 세션의 `available_subagent_types`에 `explorer`, `planner`, `plan-reviewer`, `tasker`, `worker`, `cursor-atomic-reviewer`, `tester`가 없다. `explorer`/`tester` 기본 모델 `claude-haiku-5-5-high`도 없다. 해당 타입으로 Task를 호출하지 않았고, 다른 타입으로 바꾸지 않았다. 기본 모델 배정은 수정하지 않았다.
- 데스크톱 그리드 값(300px / 1fr / 380px)과 1024px 분기점은 유지한다.
- 복사 금지는 답안 입력과 채팅 입력 밖이다.
- Vercel은 Origin Git 원격 연동이 없다. CLI 배포가 가장 짧다.

## PLAN을 위한 권장 사항

1. 탭을 패널 아래로 옮기고 라벨을 문제·자료 / 답안 / AI 어시스트로 둔다. 1024px 미만에서만 터치 최소 44px.
2. 파일 뷰어·첨부·칩 해제·컨텍스트 경고·채점 카드는 좁은 화면에서 스크롤되고 줄바꿈되게 한다.
3. `CopyGuard`에 `selectstart` 차단, `-webkit-touch-callout: none`, 가드 안 선택 범위 제거를 넣는다.
4. README에 Vercel Hobby CLI와 서버 전용 `OPENAI_API_KEY`를 적는다.
5. 390px 폭으로 세 탭과 채점 결과를 캡처한다.
