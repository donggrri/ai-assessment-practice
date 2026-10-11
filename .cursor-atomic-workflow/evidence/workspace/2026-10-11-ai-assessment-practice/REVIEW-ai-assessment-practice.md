# REVIEW: AI 활용평가 연습 사이트

TASKS: TASKS-ai-assessment-practice.md
상태: Phase 4

프로세스: `cursor-atomic-reviewer`(`claude-sonnet-5-5-high`)와 `tester`(`claude-haiku-5-5-high`)는 세션 `available_subagent_types`에 없고, tester 모델 슬러그도 `available_subagent_models`에 없다. 다른 타입으로 바꾸지 않았다. 아래는 PLAN·TASKS와 코드, `npm test`, `tsc` 결과를 대조한 기록이다.

## 원칙 (Fresh Context 독립 검증)

작업 대화에 기대지 않고 PLAN, TASKS, 테스트 로그, 화면 확인을 대조했다.

## 명령

- `npm test` → 통과 (17 tests, 0 fail). 증거: `runs/workspace/ai-assessment-practice/npm-test.done.json`
- mutation → 건너뜀. Stryker 설정이 없고 PLAN이 설치하지 말라고 했다.
- `npx tsc --noEmit` → 통과. 증거: `runs/workspace/ai-assessment-practice/tsc.done.json`
- `npx eslint app components lib` → 통과

## TASKS 대조 (Spec 검증)

- T1: 충족. 공백·전각 쉼표·대소문자 무시, 순서 불일치와 빈 답은 오답, 객관식 라벨.
- T2: 충족. 미선택 문제는 글자 수와 전달 본문에서 빠지고, 한도와 같으면 통과.
- T3: 충족. 남은 횟수 0이면 429, 한도 초과면 400이며 횟수를 올리지 않음. 첨부하지 않은 파일 본문은 컨텍스트에 없음.
- T4: 충족. 독립 규칙이 스펙 정답 IMN-02 / BNE-03,ENG-02,IMN-01,NVT-01,NVT-03 / BNE-01,IMN-01,NVT-01,NVT-02 / 3 과 같다. 공개 문제 JSON에 answer·explanation 키가 없다.
- T5: 충족. 개발 서버에서 3분할 화면, 한도 초과 경고(보내기 비활성), 80점 채점 결과, 모바일 자료·풀이·AI 탭, 둘러보기 1/7을 확인했다.
- T6: 충족. README에 실행, 환경 변수, 문제 세트 추가, 한도 설정이 있다.

## 결함

없음.

## Bugbot 트리아지

해당 없음. 파이프라인 러너를 돌리지 않았고 세션에 `bugbot` 타입이 없다.

## 문서

갱신함. `README.md`, `CONTEXT.md`, `.env.example`.

## 다음

`/cursor-atomic-wrapup` 가능.
