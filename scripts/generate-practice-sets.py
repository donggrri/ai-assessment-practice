#!/usr/bin/env python3
"""연습 문제 세트 2개의 PDF·PNG·JSON을 만들고, 조건별로 정답을 검산한다."""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

from fontTools.ttLib import TTCollection
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
FONT_TTF = Path("/tmp/wqy-microhei.ttf")
PUBLIC = ROOT / "public" / "exam-media"
DATA = ROOT / "data" / "problem-sets"

DEPTS = {"개발", "디자인", "영업", "인사"}
DRINKS = {"아메리카노", "녹차", "보리차", "콜라"}


def ensure_font() -> None:
    if FONT_TTF.exists():
        return
    ttc = TTCollection("/usr/share/fonts/truetype/wqy/wqy-microhei.ttc")
    ttc.fonts[0].save(str(FONT_TTF))


def pdf_from_lines(path: Path, title: str, lines: list[str]) -> None:
    from official_pdf import render_official_pdf

    render_official_pdf(path, title, "\n".join(lines), path.name)


def pad_notes(title: str, paragraphs: int, marker: str) -> str:
    body = [
        f"{title} {index}항. 이 문단은 조사 배경과 운영 메모이며, 표의 응답 행이나 제품 행이 아니다. "
        "집계할 때 이 문단의 숫자나 부서 이름을 응답으로 세지 않는다. "
        "한도 때문에 필요한 파일만 고르는 연습용으로 분량을 늘린 해설이다."
        for index in range(1, paragraphs + 1)
    ]
    return marker + "\n" + "\n".join(body)


def sort_join(codes: list[str]) -> str:
    unique = sorted(set(codes))
    if len(unique) != len(codes):
        raise SystemExit(f"중복 코드: {codes}")
    if not unique:
        raise SystemExit("빈 정답")
    return ",".join(unique)


# --- 설문 ---

def survey_rows() -> list[dict[str, str]]:
    """제출 시각은 모두 다르게 둔다. 같은 사번은 가장 늦은 시각 1건만 유효 후보."""
    raw = [
        # 유효 기본
        ("E001", "개발", "아메리카노", "5", "2026-03-12T09:01"),
        ("E002", "개발", "녹차", "4", "2026-03-12T09:02"),
        ("E003", "개발", "보리차", "3", "2026-03-12T09:03"),
        ("E004", "개발", "콜라", "5", "2026-03-12T09:04"),
        ("E005", "디자인", "아메리카노", "5", "2026-03-12T09:05"),
        ("E006", "디자인", "녹차", "2", "2026-03-12T09:06"),
        ("E009", "영업", "녹차", "4", "2026-03-12T09:09"),
        ("E010", "영업", "보리차", "5", "2026-03-12T09:10"),
        ("E011", "영업", "콜라", "4", "2026-03-12T09:11"),
        ("E012", "영업", "아메리카노", "3", "2026-03-12T09:12"),
        ("E013", "인사", "녹차", "5", "2026-03-12T09:13"),
        ("E014", "인사", "콜라", "1", "2026-03-12T09:14"),
        ("E015", "개발", "아메리카노", "5", "2026-03-12T09:15"),
        ("E016", "개발", "아메리카노", "4", "2026-03-12T09:16"),
        ("E017", "개발", "녹차", "1", "2026-03-12T09:17"),
        ("E018", "디자인", "보리차", "5", "2026-03-12T09:18"),
        ("E019", "디자인", "콜라", "4", "2026-03-12T09:19"),
        ("E020", "영업", "녹차", "5", "2026-03-12T09:20"),
        ("E022", "영업", "보리차", "4", "2026-03-12T09:22"),
        ("E023", "영업", "콜라", "5", "2026-03-12T09:23"),
        ("E024", "인사", "아메리카노", "2", "2026-03-12T09:24"),
        ("E025", "인사", "보리차", "4", "2026-03-12T09:25"),
        ("E026", "개발", "콜라", "1", "2026-03-12T09:26"),
        ("E027", "개발", "보리차", "5", "2026-03-12T09:27"),
        ("E028", "디자인", "아메리카노", "1", "2026-03-12T09:28"),
        ("E029", "디자인", "녹차", "5", "2026-03-12T09:29"),
        ("E030", "영업", "아메리카노", "4", "2026-03-12T09:30"),
        ("E031", "인사", "녹차", "3", "2026-03-12T09:31"),
        ("E032", "개발", "아메리카노", "5", "2026-03-12T09:32"),
        ("E033", "개발", "녹차", "5", "2026-03-12T09:33"),
        ("E034", "영업", "보리차", "1", "2026-03-12T09:34"),
        ("E035", "영업", "녹차", "4", "2026-03-12T09:35"),
        ("E036", "인사", "콜라", "5", "2026-03-12T09:36"),
        ("E037", "디자인", "콜라", "3", "2026-03-12T09:37"),
        ("E038", "개발", "아메리카노", "1", "2026-03-12T09:38"),
        ("E039", "인사", "아메리카노", "5", "2026-03-12T09:39"),
        ("E040", "디자인", "보리차", "4", "2026-03-12T09:40"),
        # 경계값 유효 (1점, 5점)
        ("E041", "개발", "아메리카노", "1", "2026-03-12T09:41"),
        ("E042", "영업", "녹차", "1", "2026-03-12T09:42"),
        ("E043", "인사", "보리차", "5", "2026-03-12T09:43"),
        # 무효: 점수 범위 밖. 0과 6은 경계 바로 밖
        ("E044", "개발", "아메리카노", "0", "2026-03-12T09:44"),
        ("E045", "개발", "아메리카노", "6", "2026-03-12T09:45"),
        ("E046", "영업", "녹차", "7", "2026-03-12T09:46"),
        ("E047", "디자인", "콜라", "", "2026-03-12T09:47"),
        # 무효: 부서·음료
        ("E048", "미상", "아메리카노", "5", "2026-03-12T09:48"),
        ("E049", "총무", "녹차", "4", "2026-03-12T09:49"),
        ("E050", "개발", "주스", "5", "2026-03-12T09:50"),
        ("E051", "영업", "", "4", "2026-03-12T09:51"),
        ("E052", "", "콜라", "5", "2026-03-12T09:52"),
        # 중복: 이른 제출은 버리고 늦은 제출만
        ("E007", "영업", "콜라", "2", "2026-03-12T09:07"),
        ("E007", "개발", "아메리카노", "5", "2026-03-12T11:07"),
        ("E008", "개발", "아메리카노", "5", "2026-03-12T09:08"),
        ("E008", "개발", "녹차", "3", "2026-03-12T11:08"),
        ("E021", "인사", "콜라", "5", "2026-03-12T09:21"),
        ("E021", "영업", "보리차", "4", "2026-03-12T11:21"),
        ("E053", "영업", "녹차", "5", "2026-03-12T09:53"),
        ("E053", "영업", "콜라", "4", "2026-03-12T11:53"),
        # 중복이면서 늦은 쪽이 무효면 그 사번은 탈락
        ("E054", "개발", "아메리카노", "5", "2026-03-12T09:54"),
        ("E054", "개발", "아메리카노", "8", "2026-03-12T11:54"),
        # 추가 유효로 건수·합계를 안정적으로
        ("E055", "개발", "보리차", "2", "2026-03-12T10:01"),
        ("E056", "디자인", "녹차", "4", "2026-03-12T10:02"),
        ("E057", "영업", "아메리카노", "5", "2026-03-12T10:03"),
        ("E058", "인사", "콜라", "2", "2026-03-12T10:04"),
        ("E059", "개발", "콜라", "3", "2026-03-12T10:05"),
        ("E060", "디자인", "아메리카노", "2", "2026-03-12T10:06"),
        ("E061", "영업", "보리차", "5", "2026-03-12T10:07"),
        ("E062", "인사", "녹차", "1", "2026-03-12T10:08"),
        ("E063", "개발", "녹차", "2", "2026-03-12T10:09"),
        ("E064", "영업", "녹차", "4", "2026-03-12T10:10"),
    ]
    rows = []
    for index, (emp, dept, drink, score, submitted) in enumerate(raw, start=1):
        rows.append(
            {
                "id": f"R{index:03d}",
                "employee": emp,
                "department": dept,
                "drink": drink,
                "score": score,
                "submitted": submitted,
            }
        )
    if not 50 <= len(rows) <= 80:
        raise SystemExit(f"응답 수 {len(rows)}")
    times = [row["submitted"] for row in rows]
    if len(times) != len(set(times)):
        raise SystemExit("제출 시각 중복")
    return rows


def is_valid_survey(row: dict[str, str]) -> bool:
    if row["department"] not in DEPTS:
        return False
    if row["drink"] not in DRINKS:
        return False
    if row["score"] not in {"1", "2", "3", "4", "5"}:
        return False
    return True


def latest_by_employee(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    chosen: dict[str, dict[str, str]] = {}
    for row in rows:
        current = chosen.get(row["employee"])
        if current is None or row["submitted"] > current["submitted"]:
            chosen[row["employee"]] = row
    return list(chosen.values())


def valid_survey(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    return [row for row in latest_by_employee(rows) if is_valid_survey(row)]


def survey_answers(rows: list[dict[str, str]]) -> dict[str, str]:
    valid = valid_survey(rows)
    q2 = sort_join(
        [
            row["employee"]
            for row in valid
            if row["department"] == "개발" and row["drink"] == "아메리카노" and row["score"] == "5"
        ]
    )
    q3 = sort_join(
        [
            row["employee"]
            for row in valid
            if row["department"] == "영업" and row["drink"] != "콜라" and int(row["score"]) >= 4
        ]
    )
    by_dept: dict[str, int] = {dept: 0 for dept in DEPTS}
    total = 0
    for row in valid:
        score = int(row["score"])
        by_dept[row["department"]] += score
        total += score
    if sum(by_dept.values()) != total:
        raise SystemExit("부서 합계 불일치")
    return {
        "q1": str(len(valid)),
        "q2": q2,
        "q3": q3,
        "q4": str(total),
    }


def csv_block(rows: list[dict[str, str]]) -> str:
    lines = ["id,employee,department,drink,score,submitted"]
    for row in rows:
        lines.append(
            ",".join(
                [
                    row["id"],
                    row["employee"],
                    row["department"],
                    row["drink"],
                    row["score"],
                    row["submitted"],
                ]
            )
        )
    return "\n".join(lines)


def draw_chart(path: Path, rows: list[dict[str, str]]) -> str:
    counts = Counter(row["drink"] if row["drink"] else "(빈 음료)" for row in rows)
    order = ["아메리카노", "녹차", "보리차", "콜라", "주스", "(빈 음료)"]
    labels = [name for name in order if counts[name]]
    font = ImageFont.truetype(str(FONT_TTF), 22)
    small = ImageFont.truetype(str(FONT_TTF), 16)
    width, height = 920, 560
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    draw.text((24, 16), "음료별 제출 건수 (필터 전 원본)", fill="#12344d", font=font)
    draw.text((24, 48), "중복·무효를 빼기 전의 전체 제출입니다.", fill="#52667a", font=small)
    max_count = max(counts[name] for name in labels)
    left, top, bar_w, gap = 180, 100, 70, 36
    for index, name in enumerate(labels):
        value = counts[name]
        bar_h = int(320 * value / max_count)
        x = left + index * (bar_w + gap)
        y = 460 - bar_h
        draw.rectangle((x, y, x + bar_w, 460), fill="#2f6f8f")
        draw.text((x, 468), name, fill="#12344d", font=small)
        draw.text((x + 18, y - 28), str(value), fill="#12344d", font=font)
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG")
    parts = [f"{name} {counts[name]}건" for name in labels]
    return (
        "필터 전 원본 제출의 음료별 건수 막대그래프. 중복과 무효가 포함되어 있다. "
        + ", ".join(parts)
        + ". 이 숫자는 유효 응답 집계가 아니다."
    )


def build_survey() -> None:
    rows = survey_rows()
    answers = survey_answers(rows)
    table = csv_block(rows)
    guide = "\n".join(
        [
            "한빛소프트 사내 음료 선호도 설문 집계 안내.",
            "응답 원본은 02_응답원본.pdf 이고, 03_음료차트.png 는 필터 전 원본을 그린 것이다.",
            "",
            "===RULES===",
            "1. 같은 사번이 여러 번이면 submitted 가 가장 늦은 행만 남긴다. 시각은 모두 다르다.",
            "2. 그 다음 무효를 뺀다. 부서는 개발, 디자인, 영업, 인사 만 유효하다. 빈칸·미상·총무는 무효.",
            "3. 음료는 아메리카노, 녹차, 보리차, 콜라 만 유효하다. 주스와 빈칸은 무효.",
            "4. 점수는 정수 1, 2, 3, 4, 5 만 유효하다. 1과 5는 포함한다. 0, 6, 7, 8과 빈칸은 무효.",
            "5. 늦은 제출이 무효면 그 사번은 유효 응답이 없다. 이른 유효 제출로 되살리지 않는다.",
            "6. 차트는 위 필터를 적용하기 전의 건수이다.",
            "===END RULES===",
            "",
            pad_notes("운영 메모", 8, "===NOTES==="),
            "===END NOTES===",
        ]
    )
    responses = "\n".join(
        [
            "응답 원본. 아래 CSV 가 전부이며, 차트와 숫자가 다르면 이 표를 따른다.",
            "",
            "===RESPONSES===",
            table,
            "===END RESPONSES===",
            "",
            pad_notes("행 옆 여백 메모", 6, "===MARGIN==="),
            "===END MARGIN===",
        ]
    )
    chart_alt = "\n".join(
        [
            draw_chart(PUBLIC / "beverage-survey" / "03_drink-chart.png", rows),
            "",
            pad_notes("차트 각주", 140, "===CHARTNOTES==="),
            "===END CHARTNOTES===",
        ]
    )
    pdf_from_lines(PUBLIC / "beverage-survey" / "01_guide.pdf", "설문 집계 안내", guide.split("\n"))
    pdf_from_lines(PUBLIC / "beverage-survey" / "02_responses.pdf", "설문 응답 원본", responses.split("\n"))
    payload = {
        "id": "beverage-survey",
        "title": "사내 음료 선호도 설문",
        "passage": "한빛소프트 사내 음료 설문이다. 집계 규칙, 응답 원본 표, 필터 전 차트가 파일로 나뉘어 있다. 필요한 파일만 골라 첨부한다. 출력은 문제에서 지정한 형식만 쓴다.",
        "files": [
            {
                "id": "guide",
                "name": "01_집계안내.pdf",
                "kind": "pdf",
                "media": "exam-media/beverage-survey/01_guide.pdf",
                "content": guide,
            },
            {
                "id": "responses",
                "name": "02_응답원본.pdf",
                "kind": "pdf",
                "media": "exam-media/beverage-survey/02_responses.pdf",
                "content": responses,
            },
            {
                "id": "chart",
                "name": "03_음료차트.png",
                "kind": "png",
                "media": "exam-media/beverage-survey/03_drink-chart.png",
                "content": chart_alt,
            },
        ],
        "questions": [
            {
                "id": "q1",
                "number": 1,
                "type": "short",
                "prompt": "중복(같은 사번은 가장 늦은 제출만)과 무효 응답을 뺀 유효 응답은 몇 건인가요? 숫자만 쓰세요.",
                "answer": answers["q1"],
                "explanation": "\n".join(
                    [
                        "조건은 순서대로 적용한다.",
                        "① 같은 사번은 submitted 가 가장 늦은 행만 남긴다.",
                        "② 부서는 개발·디자인·영업·인사, 음료는 아메리카노·녹차·보리차·콜라, 점수는 1 이상 5 이하 정수만 남긴다. 1과 5는 유효하고 0과 6은 무효다.",
                        "③ 늦은 행이 무효면 이른 행으로 되살리지 않는다.",
                        f"이 조건을 모두 통과한 행은 {answers['q1']}건이다.",
                        "흔한 실수",
                        "- 차트 건수를 더한다. 차트는 필터 전 원본이다.",
                        "- 중복의 이른 제출까지 센다.",
                        "- 1점과 5점을 경계 밖으로 뺀다.",
                        "- 늦은 제출이 무효인 사번을 이른 유효 제출로 살린다.",
                    ]
                ),
            },
            {
                "id": "q2",
                "number": 2,
                "type": "short",
                "prompt": "유효 응답 중 부서가 개발이고 음료가 아메리카노이며 점수가 5점인 사번을 오름차순으로 쓰세요. 쉼표로 구분하고 공백은 넣지 않습니다.",
                "answer": answers["q2"],
                "explanation": "\n".join(
                    [
                        "유효 응답만 본다. 조건은 ① 부서 개발 ② 음료 아메리카노 ③ 점수 5 이다. 5점은 상한에 포함된다.",
                        "사번은 오름차순, 쉼표, 공백 없음.",
                        "흔한 실수",
                        "- 같은 사번의 이른 제출이 개발·아메리카노·5점이어도, 늦은 제출이 다르면 빼야 한다.",
                        "- 점수 6점이나 0점은 무효라 포함하지 않는다.",
                        "- 디자인 부서의 아메리카노 5점은 포함하지 않는다.",
                        "- 개발·아메리카노라도 4점이나 1점은 포함하지 않는다.",
                    ]
                ),
            },
            {
                "id": "q3",
                "number": 3,
                "type": "short",
                "prompt": "유효 응답 중 부서가 영업이고 점수가 4 이상이며 음료가 콜라가 아닌 사번을 오름차순으로 쓰세요. 4점과 5점을 포함하고, 쉼표로 구분하며 공백은 넣지 않습니다.",
                "answer": answers["q3"],
                "explanation": "\n".join(
                    [
                        "유효 응답만 본다. 조건은 ① 부서 영업 ② 점수 4 또는 5 ③ 음료가 콜라가 아님이다.",
                        "사번은 오름차순, 쉼표, 공백 없음.",
                        "흔한 실수",
                        "- 영업이면서 콜라인 4·5점을 넣는다.",
                        "- 점수 3점 이하를 넣는다.",
                        "- 중복에서 이른 제출은 영업·고득점이어도 늦은 제출이 조건에 안 맞으면 빼야 한다.",
                        "- 늦은 제출이 조건에 맞으면 이른 제출의 부서와 달라도 포함한다.",
                    ]
                ),
            },
            {
                "id": "q4",
                "number": 4,
                "type": "short",
                "prompt": "유효 응답의 점수 합계를 쓰세요. 부서별 점수 합을 모두 더해도 같아야 합니다. 숫자만 쓰세요.",
                "answer": answers["q4"],
                "explanation": "\n".join(
                    [
                        "유효 응답의 점수만 더한다. 개발·디자인·영업·인사 점수 합은 각각 구한 뒤 더해도 전체 합과 같다.",
                        "무효 행과 중복으로 버린 이른 제출은 합에 넣지 않는다.",
                        f"검산 결과는 {answers['q4']} 이다.",
                        "흔한 실수",
                        "- 원본 전부 또는 차트에 보이는 건수를 점수로 착각한다.",
                        "- 부서 합을 구한 뒤 한 부서를 빼먹는다.",
                        "- 1점을 0점으로 본다.",
                    ]
                ),
            },
        ],
    }
    lengths = [len(item["content"]) for item in payload["files"]]
    total = sum(lengths)
    if total <= 20000:
        raise SystemExit(f"설문 자료 글자 수 부족: {total}")
    if any(length >= 19000 for length in lengths):
        raise SystemExit(f"설문 파일 하나가 너무 김: {lengths}")
    guide_and_responses = lengths[0] + lengths[1]
    if guide_and_responses > 18000:
        raise SystemExit(f"안내와 원본을 함께 첨부할 수 없음: {guide_and_responses}")
    (DATA / "beverage-survey.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"survey files={len(rows)} chars={total}")


# --- 화장품·식품 규정 ---

PRODUCTS = [
    {"code": "BEV-01", "audience": "성인음료", "items": [("카페인", 300)], "claim": "각성에 도움을 줄 수 있음", "markets": ["KR", "EU"], "inspector": "문지호", "result": "Pass"},
    {"code": "BEV-02", "audience": "성인음료", "items": [("카페인", 350)], "claim": "피로 완화에 도움", "markets": ["KR"], "inspector": "한소율", "result": "Pass"},
    {"code": "BEV-03", "audience": "어린이음료", "items": [("카페인", 20)], "claim": "집중 케어", "markets": ["KR"], "inspector": "배도윤", "result": "Pass"},
    {"code": "BEV-04", "audience": "성인음료", "items": [("카페인", 450)], "claim": "감기를 예방합니다", "markets": ["KR", "EU"], "inspector": "배도윤", "result": "Fail"},
    {"code": "BEV-05", "audience": "어린이음료", "items": [("카페인", 0)], "claim": "수분 보충에 도움", "markets": ["KR", "EU"], "inspector": "문지호", "result": "Pass"},
    {"code": "COS-01", "audience": "성인화장품", "items": [("레티놀", 0.30)], "claim": "피부 결에 도움을 줄 수 있음", "markets": ["KR", "EU"], "inspector": "한소율", "result": "Pass"},
    {"code": "COS-02", "audience": "성인화장품", "items": [("나이아신아마이드", 4.5)], "claim": "미백에 도움", "markets": ["KR"], "inspector": "한소율", "result": "Pass"},
    {"code": "COS-03", "audience": "어린이화장품", "items": [("레티놀", 0.05)], "claim": "순한 보습 케어", "markets": ["KR"], "inspector": "문지호", "result": "Pass"},
    {"code": "COS-04", "audience": "성인화장품", "items": [("하이드로퀴논", 0.1)], "claim": "잡티 케어", "markets": ["KR", "EU"], "inspector": "한소율", "result": "Pass"},
    {"code": "COS-05", "audience": "성인화장품", "items": [("나이아신아마이드", 5.0)], "claim": "기미를 치료합니다", "markets": ["EU"], "inspector": "배도윤", "result": "Pass"},
    {"code": "COS-06", "audience": "성인화장품", "items": [("레티놀", 0.40)], "claim": "주름에 도움", "markets": ["EU"], "inspector": "문지호", "result": "Fail"},
    {"code": "COS-07", "audience": "성인화장품", "items": [("나이아신아마이드", 4.0)], "claim": "산뜻한 사용감", "markets": ["KR", "EU"], "inspector": "한소율", "result": "Pass"},
    {"code": "COS-08", "audience": "성인화장품", "items": [("레티놀", 0.20), ("나이아신아마이드", 4.8)], "claim": "피부 장벽에 도움", "markets": ["KR", "EU"], "inspector": "문지호", "result": "Pass"},
    {"code": "COS-09", "audience": "성인화장품", "items": [("나이아신아마이드", 4.2)], "claim": "잡티를 예방합니다", "markets": ["KR"], "inspector": "한소율", "result": "Pass"},
    {"code": "COS-10", "audience": "어린이화장품", "items": [("나이아신아마이드", 1.0)], "claim": "순한 보습에 도움", "markets": ["KR"], "inspector": "문지호", "result": "Pass"},
]


def limit_fail(product: dict, market: str) -> bool:
    audience = product["audience"]
    child = audience.startswith("어린이")
    amounts = {name: value for name, value in product["items"]}
    if "하이드로퀴논" in amounts:
        return True
    if child and amounts.get("레티놀", 0) != 0:
        return True
    if child and amounts.get("카페인", 0) != 0:
        return True
    if "레티놀" in amounts and not child and amounts["레티놀"] > 0.30:
        return True
    if "나이아신아마이드" in amounts:
        cap = 5.0 if market == "KR" else 4.0
        if amounts["나이아신아마이드"] > cap:
            return True
    if "카페인" in amounts and not child:
        cap = 400 if market == "KR" else 300
        if amounts["카페인"] > cap:
            return True
    return False


def claim_bad(claim: str) -> bool:
    return any(word in claim for word in ("치료", "예방", "완치"))


def export_fail(product: dict) -> bool:
    return any(limit_fail(product, market) for market in product["markets"])


def regulation_answers() -> dict[str, str]:
    hansol_bad = [
        product["code"]
        for product in PRODUCTS
        if product["inspector"] == "한소율"
        and product["result"] == "Pass"
        and (export_fail(product) or claim_bad(product["claim"]))
    ]
    passed_but_limit = [
        product["code"]
        for product in PRODUCTS
        if product["result"] == "Pass" and export_fail(product)
    ]
    kr_only = [
        product["code"]
        for product in PRODUCTS
        if not limit_fail(product, "KR") and limit_fail(product, "EU")
    ]
    clean = [
        product
        for product in PRODUCTS
        if product["result"] == "Pass" and not export_fail(product) and not claim_bad(product["claim"])
    ]
    answers = {
        "q1": sort_join(hansol_bad),
        "q2": sort_join(passed_but_limit),
        "q3": sort_join(kr_only),
        "q4": str(len(clean)),
    }
    if len(clean) != len({item["code"] for item in clean}):
        raise SystemExit("clean duplicate")
    return answers


def product_line(product: dict) -> str:
    items = ",".join(f"{name}:{value}" for name, value in product["items"])
    markets = ",".join(product["markets"])
    return "|".join(
        [
            product["code"],
            product["audience"],
            items,
            product["claim"],
            markets,
        ]
    )


def draw_label(path: Path, products: list[dict]) -> str:
    font = ImageFont.truetype(str(FONT_TTF), 22)
    small = ImageFont.truetype(str(FONT_TTF), 18)
    image = Image.new("RGB", (840, 220 + 150 * len(products)), "#fffdf8")
    draw = ImageDraw.Draw(image)
    draw.rectangle((16, 16, 824, image.height - 16), outline="#12344d", width=3)
    draw.text((32, 28), "온빛라이프 제품 라벨", fill="#12344d", font=font)
    y = 78
    lines = []
    for product in products:
        items = ", ".join(f"{name} {value}" for name, value in product["items"])
        markets = ",".join(product["markets"])
        block = [
            product["code"],
            product["audience"],
            items,
            product["claim"],
            f"수출국 {markets}",
        ]
        for line in block:
            draw.text((40, y), line, fill="#1c2430", font=small)
            y += 24
        y += 18
        lines.append(product_line(product))
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG")
    return "라벨에 보이는 제품. 검수 결과와 검수자는 이 이미지에 없다.\n" + "\n".join(lines)


def build_regulation() -> None:
    answers = regulation_answers()
    rules = "\n".join(
        [
            "온빛라이프 식품·화장품 입점 규정. 상한과 같은 값은 통과한다.",
            "수출국이 여러 개면 적힌 나라의 기준을 모두 통과해야 한다. 수출국에 없는 나라 기준은 적용하지 않는다.",
            "어린이 제품의 레티놀과 카페인은 0만 허용한다. 한국·EU 공통이다.",
            "표현에서 치료, 예방, 완치는 금지한다. 도움, 케어, 산뜻은 허용한다.",
            "",
            "===LIMITS===",
            "레티놀|%|KR:0.30|EU:0.30|어린이:0",
            "나이아신아마이드|%|KR:5.0|EU:4.0|어린이:해당없음",
            "카페인|mg|KR:400|EU:300|어린이:0",
            "하이드로퀴논|%|KR:금지|EU:금지|함량무관",
            "===END LIMITS===",
            "",
            pad_notes("조문 해설", 6, "===CLAUSES==="),
            "===END CLAUSES===",
        ]
    )
    groups = [PRODUCTS[0:4], PRODUCTS[4:8], PRODUCTS[8:12], PRODUCTS[12:]]
    label_files = []
    for index, group in enumerate(groups, start=1):
        media = f"exam-media/bright-life-review/label-{index}.png"
        alt = draw_label(PUBLIC / "bright-life-review" / f"label-{index}.png", group)
        alt = "===LABELS===\n" + alt + "\n===END LABELS===\n" + pad_notes(f"라벨 {index} 인쇄 메모", 2, "===PRINT===") + "\n===END PRINT==="
        label_files.append(
            {
                "id": f"label{index}",
                "name": f"0{index + 2}_라벨{index}.png",
                "kind": "png",
                "media": media,
                "content": alt,
            }
        )
    inspections = ["code|inspector|result"]
    for product in PRODUCTS:
        inspections.append(f"{product['code']}|{product['inspector']}|{product['result']}")
    audit = "\n".join(
        [
            "검수 기록. 라벨에는 검수자와 결과가 없다.",
            "",
            "===AUDIT===",
            "\n".join(inspections),
            "===END AUDIT===",
            "",
            pad_notes("검수 메모", 4, "===AUDITNOTES==="),
            "===END AUDITNOTES===",
        ]
    )
    appendix = "\n".join(
        [
            "해설 부록. 제품 코드, 함량, 검수 결과가 없다. 집계에 사용하지 않는다.",
            "",
            pad_notes("부록 해설", 145, "===APPENDIX==="),
            "===END APPENDIX===",
        ]
    )
    pdf_from_lines(PUBLIC / "bright-life-review" / "01_rules.pdf", "성분·표현 규정", rules.split("\n"))
    pdf_from_lines(PUBLIC / "bright-life-review" / "02_audit.pdf", "검수 기록", audit.split("\n"))
    pdf_from_lines(PUBLIC / "bright-life-review" / "07_appendix.pdf", "해설 부록", appendix.split("\n"))
    payload = {
        "id": "bright-life-review",
        "title": "온빛라이프 식품·화장품 검수",
        "passage": "온빛라이프 입점 검수이다. 규정, 제품 라벨, 검수 기록이 분리되어 있다. 수출국과 어린이 예외를 놓치지 말고, 필요한 파일만 첨부한다.",
        "files": [
            {
                "id": "rules",
                "name": "01_규정.pdf",
                "kind": "pdf",
                "media": "exam-media/bright-life-review/01_rules.pdf",
                "content": rules,
            },
            {
                "id": "audit",
                "name": "02_검수기록.pdf",
                "kind": "pdf",
                "media": "exam-media/bright-life-review/02_audit.pdf",
                "content": audit,
            },
            *label_files,
            {
                "id": "appendix",
                "name": "07_해설부록.pdf",
                "kind": "pdf",
                "media": "exam-media/bright-life-review/07_appendix.pdf",
                "content": appendix,
            },
        ],
        "questions": [
            {
                "id": "q1",
                "number": 1,
                "type": "short",
                "prompt": "한소율이 Pass 처리한 제품 중, 성분 또는 표현 규정을 위반한 제품 코드를 오름차순으로 쓰세요. 쉼표로 구분하고 공백은 넣지 않습니다.",
                "answer": answers["q1"],
                "explanation": "\n".join(
                    [
                        "조건은 ① 검수자 한소율 ② 결과 Pass ③ 수출국 기준 성분 위반 또는 표현 위반이다.",
                        "수출국에 없는 나라의 상한은 적용하지 않는다. 어린이 레티놀·카페인은 0만 허용한다. 치료·예방·완치는 금지다.",
                        "흔한 실수",
                        "- 다른 검수자의 Pass 위반을 넣는다.",
                        "- 이미 Fail 인 제품을 넣는다.",
                        "- 수출국이 한국뿐인데 EU 상한 초과를 위반으로 센다.",
                        "- 상한과 같은 값을 초과로 본다.",
                    ]
                ),
            },
            {
                "id": "q2",
                "number": 2,
                "type": "short",
                "prompt": "수출국 기준 성분을 위반했는데도 Pass 된 제품 코드를 오름차순으로 쓰세요. 표현만 위반한 경우는 제외합니다. 쉼표로 구분하고 공백은 넣지 않습니다.",
                "answer": answers["q2"],
                "explanation": "\n".join(
                    [
                        "조건은 ① 적힌 수출국 중 하나라도 성분 위반 ② 결과 Pass 이다. 표현 위반만 있고 성분은 통과면 제외한다.",
                        "금지 원료는 함량과 상관없이 위반이다. 어린이 레티놀·카페인 0이 아니면 위반이다.",
                        "흔한 실수",
                        "- Fail 로 이미 걸러진 성분 위반을 포함한다.",
                        "- 수출국이 아닌 EU 기준으로만 넘은 한국 전용 제품을 넣는다.",
                        "- 표현 위반만 있는 Pass 를 성분 위반으로 넣는다.",
                    ]
                ),
            },
            {
                "id": "q3",
                "number": 3,
                "type": "short",
                "prompt": "한국 성분 기준은 통과하고 EU 성분 기준은 통과하지 못하는 제품 코드를 오름차순으로 쓰세요. 수출국, 검수 결과, 표현은 보지 않습니다. 쉼표로 구분하고 공백은 넣지 않습니다.",
                "answer": answers["q3"],
                "explanation": "\n".join(
                    [
                        "수출국과 검수 결과, 표현은 무시한다. 조건은 ① 한국 성분 통과 ② EU 성분 불통이다.",
                        "들어 있는 성분을 모두 본다. 어린이 예외는 양쪽 모두에 적용한다. 상한과 같은 값은 통과다.",
                        "흔한 실수",
                        "- 수출국이 EU 인 제품만 고른다.",
                        "- 한국도 넘는 제품(금지 원료, 어린이 카페인·레티놀, 한국 상한 초과)을 넣는다.",
                        "- 양쪽 모두 통과인 제품을 넣는다.",
                    ]
                ),
            },
            {
                "id": "q4",
                "number": 4,
                "type": "short",
                "prompt": "수출국 기준 성분과 표현 규정을 모두 지켰고 결과도 Pass 인 제품은 몇 개인가요? 숫자만 쓰세요.",
                "answer": answers["q4"],
                "explanation": "\n".join(
                    [
                        "조건은 ① 적힌 수출국마다 성분 통과 ② 표현에 치료·예방·완치 없음 ③ 결과 Pass 이다.",
                        "셋이 겹치는 제품만 센다. 기록상 Pass 여도 성분이나 표현이 어긋나면 빠진다.",
                        f"검산 결과는 {answers['q4']}개이다.",
                        "흔한 실수",
                        "- Pass 를 전부 센다.",
                        "- 수출국이 한국뿐인 제품을 EU 상한으로 탈락시킨다.",
                        "- 어린이 예외를 성인 상한으로 통과시킨다.",
                        "- 표현만 보고 금지 원료를 놓친다.",
                    ]
                ),
            },
        ],
    }
    lengths = [len(item["content"]) for item in payload["files"]]
    total = sum(lengths)
    needed = sum(lengths[:-1])
    if total <= 20000:
        raise SystemExit(f"규정 자료 글자 수 부족: {total}")
    if any(length >= 19000 for length in lengths):
        raise SystemExit(f"규정 파일 하나가 너무 김: {lengths}")
    if needed > 18000:
        raise SystemExit(f"규정·라벨·검수 기록을 함께 첨부할 수 없음: {needed}")
    (DATA / "bright-life-review.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"regulation chars={total}")


def main() -> None:
    ensure_font()
    build_survey()
    build_regulation()


if __name__ == "__main__":
    main()
