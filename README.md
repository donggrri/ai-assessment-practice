# AI 활용평가 연습

문서와 표를 읽고, 횟수와 분량이 제한된 AI 조교와 함께 답을 적는 연습 시험입니다. 프로그래머스 시험 화면의 구성을 참고했을 뿐, 실제 문제나 자산은 쓰지 않습니다.

## 실행

```bash
npm install
npm run dev
```

브라우저에서 [http://127.0.0.1:43123](http://127.0.0.1:43123) 을 엽니다.

```bash
npm test
npm run lint
```

## 환경 변수

`.env.example`을 `.env.local`로 복사해 바꿉니다. 값을 바꾸면 개발 서버를 다시 시작합니다.

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `OPENAI_API_KEY` | 비어 있음 | 비어 있으면 모의 응답. 첨부 파일 이름, 글자 수, 받은 컨텍스트 요약만 돌려줍니다. |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | OpenAI 호환 API 주소 |
| `OPENAI_MODEL` | `gpt-4o-mini` | 모델 이름 |
| `CONTEXT_CHAR_LIMIT` | `20000` | 질문 + 공통 지문 + 선택한 문제 + 첨부 파일 본문의 글자 수 한도. 넘으면 전송이 막힙니다. |
| `AI_REQUEST_LIMIT` | `10` | 응시당 AI 질문 횟수. 0이면 입력이 잠기고 「AI 질문 횟수를 모두 사용했습니다」가 나옵니다. |
| `COPY_PROTECTION` | `true` | `false`면 지문·문제·파일 뷰어 복사를 허용합니다. |

키는 브라우저로 내려가지 않습니다. AI에게는 공통 지문, 선택한 문제, 첨부한 파일 본문, 이번 질문만 갑니다. 첨부하지 않은 파일은 포함되지 않고, 이전 대화도 다시 보내지 않습니다.

답안과 대화는 이 브라우저의 로컬 저장소에 남습니다. 화면에는 대화를 지우는 버튼이 없습니다. 새 응시는 답안과 질문 횟수만 다시 채웁니다.

## 문제 세트 추가

`data/problem-sets/`에 JSON 파일을 넣으면 서버가 그 폴더의 `*.json`을 모두 읽습니다. 인덱스 수정은 필요 없습니다.

```json
{
  "id": "my-set",
  "title": "세트 제목",
  "passage": "공통 지문",
  "files": [{ "id": "rules", "name": "01_규칙.md", "content": "# 규칙\n..." }],
  "questions": [
    {
      "id": "q1",
      "number": 1,
      "type": "short",
      "prompt": "답을 적으세요.",
      "answer": "정답",
      "explanation": "해설"
    },
    {
      "id": "q2",
      "number": 2,
      "type": "multiple",
      "prompt": "고르세요.",
      "choices": [
        { "id": "a", "text": "첫번째" },
        { "id": "b", "text": "두번째" }
      ],
      "answer": "b",
      "explanation": "해설"
    }
  ]
}
```

`type`은 `short` 또는 `multiple`입니다. 객관식 `answer`는 보기 `id`와 같아야 합니다. 주관식은 공백을 없애고 대소문자를 무시한 뒤 비교합니다. 순서는 바꾸지 않습니다.

들어 있는 샘플은 `건강기능식품 입점 심사`입니다. 1~4번은 주관식이고, 5번은 객관식 연습입니다. 정답과 해설은 채점 후에만 화면에 나옵니다.

## 폰에서 배포

이 저장소는 Origin Git에 있습니다. Vercel은 Origin 저장소를 Git 연동으로 받지 않으므로, 클론한 디렉터리에서 Vercel CLI로 올리는 방법이 가장 짧습니다. [Vercel Hobby](https://vercel.com/docs/plans/hobby)는 개인 프로젝트에 무료입니다.

```bash
npm install
npx vercel login
npx vercel link
npx vercel env add OPENAI_API_KEY production
npx vercel deploy --prod
```

`OPENAI_API_KEY` 이름은 `NEXT_PUBLIC_`으로 시작하지 않습니다. 그 값은 서버의 `lib/config.ts`와 채팅 Route Handler만 읽고, 브라우저로 내려가는 설정(`/api/config`)에는 키가 없습니다. 프리뷰에도 같은 키를 쓰려면 `npx vercel env add OPENAI_API_KEY preview`를 한 번 더 실행합니다.

키를 넣지 않고 배포하면 로컬과 같이 모의 응답으로 동작합니다. `OPENAI_BASE_URL`, `OPENAI_MODEL`, `CONTEXT_CHAR_LIMIT`, `AI_REQUEST_LIMIT`, `COPY_PROTECTION`도 같은 명령으로 바꿀 수 있고, 비우면 README 표의 기본값을 씁니다.

Origin에 푸시한 뒤 사이트에 반영하려면 클론을 최신으로 맞춘 다음 `npx vercel deploy --prod`를 다시 실행합니다. `.vercel/`과 `.env.local`은 커밋하지 않습니다.

## 화면

넓은 화면은 왼쪽 문제 목록·공통 지문·파일, 가운데 문제와 답안·파일 뷰어, 오른쪽 AI 어시스트로 나뉩니다. 1024px보다 좁으면 같은 내용이 하단 탭(문제·자료, 답안, AI 어시스트)으로 바뀝니다. 상단의 둘러보기가 문제 목록, 문제 설명, 파일 목록, AI 어시스트, 대화창, 문제 선택, 파일 첨부 순으로 안내합니다.
