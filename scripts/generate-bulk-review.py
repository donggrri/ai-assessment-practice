#!/usr/bin/env python3
"""노을푸드 대용량 검수 세트의 PDF·PNG·JSON을 만들고, 조건별로 정답을 검산한다.

기존 온빛라이프 세트와 다른 회사·성분·조문이다. 검수 행은 A/B/C 파일로 나뉘고,
같은 코드는 파일 순서상 마지막 행만 유효하다.
"""

from __future__ import annotations

import json
from pathlib import Path

from fontTools.ttLib import TTCollection
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
FONT_TTF = Path("/tmp/wqy-microhei.ttf")
PUBLIC = ROOT / "public" / "exam-media" / "noeul-food-review"
DATA = ROOT / "data" / "problem-sets"
LIMIT = 20000

LIMITS = [
    {"name": "나트륨", "kr": 600, "eu": 500, "child": 300},
    {"name": "당류", "kr": 15, "eu": 12, "child": None},
    {"name": "카페인", "kr": 80, "eu": 50, "child": 0},
    {"name": "타르색소", "kr": "ban", "eu": "ban", "child": "any"},
    {"name": "합성감미료", "kr": 40, "eu": 25, "child": None},
]

INSPECTORS = ("노가을", "백시온", "도하람")


def ensure_font() -> None:
    if FONT_TTF.exists():
        return
    ttc = TTCollection("/usr/share/fonts/truetype/wqy/wqy-microhei.ttc")
    ttc.fonts[0].save(str(FONT_TTF))


def pdf_from_lines(path: Path, title: str, lines: list[str]) -> None:
    from official_pdf import render_official_pdf

    render_official_pdf(path, title, "\n".join(lines), path.name)


def pad_notes(title: str, paragraphs: int) -> str:
    return "\n".join(
        f"{title} {index}항. 이 문단은 운영 메모이며 제품 행이 아니다. "
        "NF-000 같은 문자열이나 상한 숫자를 제품 코드로 세지 않는다. "
        "검수 파일은 하나씩 판정한 뒤 합산하는 연습용으로 분량을 늘린 문단이다."
        for index in range(1, paragraphs + 1)
    )


def grow(head: str, marker: str, end: str, target: int) -> str:
    text = head
    count = 0
    while len(text) < target:
        count += 1
        if count > 500:
            raise SystemExit(f"{marker} 분량을 맞추지 못했습니다. {len(text)}")
        text = f"{head}\n{marker}\n{pad_notes(marker.strip('='), count)}\n{end}"
    if len(text) >= 19000:
        raise SystemExit(f"{marker} 파일이 너무 깁니다. {len(text)}")
    return text


def product(
    code: str,
    markets: list[str],
    inspector: str,
    result: str,
    audience: str,
    items: list[tuple[str, int]],
    claim: str,
) -> dict:
    return {
        "code": code,
        "markets": markets,
        "inspector": inspector,
        "result": result,
        "audience": audience,
        "items": items,
        "claim": claim,
    }


def limit_fail(item: dict, market: str) -> bool:
    child = item["audience"].startswith("어린이")
    for name, amount in item["items"]:
        limit = next(entry for entry in LIMITS if entry["name"] == name)
        if limit["kr"] == "ban" or limit["eu"] == "ban" or limit["child"] == "any":
            return True
        if child and isinstance(limit["child"], int) and amount != limit["child"]:
            return True
        cap = limit["kr"] if market == "KR" else limit["eu"]
        if not isinstance(cap, int):
            return True
        if not (child and isinstance(limit["child"], int)) and amount > cap:
            return True
    return False


def claim_bad(claim: str) -> bool:
    return any(word in claim for word in ("치료", "예방", "완치"))


def export_fail(item: dict) -> bool:
    return any(limit_fail(item, market) for market in item["markets"])


def collapse(entries: list[tuple[int, dict]], last: bool) -> list[dict]:
    chosen: dict[str, dict] = {}
    for _file_index, item in entries:
        if last or item["code"] not in chosen:
            chosen[item["code"]] = item
    return list(chosen.values())


def sort_join(codes: list[str]) -> str:
    unique = sorted(set(codes))
    if len(unique) != len(codes):
        raise SystemExit(f"정답 코드가 겹칩니다: {codes}")
    if not unique:
        raise SystemExit("빈 코드 정답")
    return ",".join(unique)


def answers_for(items: list[dict]) -> dict[str, str]:
    q1 = [
        item["code"]
        for item in items
        if item["inspector"] == "노가을"
        and item["result"] == "Pass"
        and (export_fail(item) or claim_bad(item["claim"]))
    ]
    q2 = [
        item["code"]
        for item in items
        if item["result"] == "Pass" and export_fail(item)
    ]
    q3 = [
        item["code"]
        for item in items
        if not limit_fail(item, "KR") and limit_fail(item, "EU")
    ]
    clean = [
        item
        for item in items
        if item["result"] == "Pass" and not export_fail(item) and not claim_bad(item["claim"])
    ]
    return {
        "q1": sort_join(q1),
        "q2": sort_join(q2),
        "q3": sort_join(q3),
        "q4": str(len(clean)),
        "q5": str(len({item["code"] for item in items})),
    }


def row_line(item: dict) -> str:
    amounts = ",".join(f"{name}:{amount}" for name, amount in item["items"])
    markets = ",".join(item["markets"])
    return "|".join(
        [
            item["code"],
            markets,
            item["inspector"],
            item["result"],
            item["audience"],
            amounts,
            item["claim"],
        ]
    )


def draw_label(path: Path, items: list[dict]) -> str:
    font = ImageFont.truetype(str(FONT_TTF), 22)
    small = ImageFont.truetype(str(FONT_TTF), 18)
    image = Image.new("RGB", (880, 200 + 160 * len(items)), "#fffdf8")
    draw = ImageDraw.Draw(image)
    draw.rectangle((16, 16, 864, image.height - 16), outline="#12344d", width=3)
    draw.text((32, 28), "노을푸드 제품 라벨", fill="#12344d", font=font)
    y = 78
    lines = ["라벨에 보이는 문구. 검수자와 결과는 이 이미지에 없다."]
    for item in items:
        amounts = ", ".join(f"{name} {amount}" for name, amount in item["items"])
        block = [
            item["code"],
            item["audience"],
            amounts,
            item["claim"],
            "수출국 " + ",".join(item["markets"]),
        ]
        for line in block:
            draw.text((40, y), line, fill="#1c2430", font=small)
            y += 26
        y += 16
        lines.append(
            f"{item['code']} / {item['audience']} / {amounts} / {item['claim']} / {','.join(item['markets'])}"
        )
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG")
    return "\n".join(lines)


def build_entries() -> list[tuple[int, dict]]:
    """파일 인덱스 0=A, 1=B, 2=C. 같은 코드의 나중 항목이 유효하다."""
    entries: list[tuple[int, dict]] = [
        (0, product("NF-001", ["KR", "EU"], "노가을", "Pass", "성인", [("나트륨", 500), ("당류", 10)], "고소한 간식에 도움")),
        (0, product("NF-002", ["KR"], "노가을", "Pass", "성인", [("나트륨", 550)], "바삭한 맛")),
        (1, product("NF-003", ["KR", "EU"], "노가을", "Pass", "성인", [("나트륨", 600)], "고소한 풍미")),
        (1, product("NF-004", ["EU"], "노가을", "Pass", "성인", [("당류", 15)], "달콤한 간식")),
        (2, product("NF-005", ["KR", "EU"], "노가을", "Pass", "어린이", [("카페인", 0), ("나트륨", 300)], "어린이 간식에 도움")),
        (0, product("NF-006", ["KR"], "노가을", "Pass", "어린이", [("카페인", 10)], "집중 간식에 도움")),
        (1, product("NF-007", ["KR", "EU"], "노가을", "Pass", "성인", [("타르색소", 1)], "색이 고운 과자")),
        (2, product("NF-008", ["KR"], "노가을", "Pass", "성인", [("합성감미료", 40)], "산뜻한 단맛")),
        (0, product("NF-009", ["KR", "EU"], "백시온", "Pass", "성인", [("합성감미료", 25)], "가벼운 단맛")),
        (1, product("NF-010", ["KR"], "노가을", "Pass", "성인", [("나트륨", 400)], "환절기 감기를 예방합니다")),
        (2, product("NF-011", ["KR", "EU"], "도하람", "Fail", "성인", [("나트륨", 700)], "짠맛이 강한 스낵")),
        (0, product("NF-012", ["KR", "EU"], "백시온", "Pass", "성인", [("카페인", 80)], "각성에 도움")),
        (1, product("NF-013", ["KR"], "백시온", "Pass", "성인", [("카페인", 90)], "피로 간식에 도움")),
        (2, product("NF-014", ["EU"], "도하람", "Pass", "성인", [("당류", 12)], "달콤함")),
        (0, product("NF-015", ["KR", "EU"], "도하람", "Pass", "어린이", [("나트륨", 300), ("당류", 12)], "어린이 간식에 도움")),
        (1, product("NF-016", ["EU"], "도하람", "Pass", "어린이", [("나트륨", 301)], "순한 맛")),
        (2, product("NF-017", ["KR", "EU"], "노가을", "Pass", "성인", [("나트륨", 500)], "위 질환을 치료합니다")),
        (0, product("NF-018", ["KR", "EU"], "백시온", "Pass", "성인", [("당류", 8)], "이 간식으로 완치됩니다")),
        (1, product("NF-019", ["KR"], "노가을", "Pass", "성인", [("합성감미료", 41)], "단맛에 도움")),
        (2, product("NF-020", ["KR", "EU"], "도하람", "Fail", "성인", [("나트륨", 500)], "고소한 간식에 도움")),
        (0, product("NF-021", ["KR", "EU"], "노가을", "Pass", "성인", [("나트륨", 700)], "고소한 간식에 도움")),
        (2, product("NF-021", ["KR", "EU"], "노가을", "Pass", "성인", [("나트륨", 400)], "고소한 간식에 도움")),
        (0, product("NF-022", ["KR", "EU"], "백시온", "Pass", "성인", [("나트륨", 400)], "고소한 간식에 도움")),
        (1, product("NF-022", ["KR"], "노가을", "Pass", "성인", [("카페인", 90)], "각성에 도움")),
        (1, product("NF-023", ["KR"], "노가을", "Pass", "성인", [("나트륨", 400)], "환절기 감기를 예방합니다")),
        (2, product("NF-023", ["KR", "EU"], "도하람", "Fail", "성인", [("나트륨", 400)], "고소한 간식에 도움")),
        (0, product("NF-024", ["KR", "EU"], "노가을", "Pass", "성인", [("타르색소", 1)], "색이 고운 과자")),
        (0, product("NF-024", ["KR"], "노가을", "Pass", "성인", [("나트륨", 400)], "고소한 간식에 도움")),
        (0, product("NF-025", ["KR", "EU"], "도하람", "Pass", "성인", [("당류", 14)], "달콤한 간식")),
        (2, product("NF-025", ["KR"], "도하람", "Pass", "성인", [("당류", 14)], "달콤한 간식")),
    ]
    for offset, number in enumerate(range(26, 106)):
        entries.append(
            (
                offset % 3,
                product(
                    f"NF-{number:03d}",
                    ["KR", "EU"],
                    INSPECTORS[offset % 3],
                    "Pass",
                    "성인",
                    [("나트륨", 400 + (offset % 5) * 10), ("당류", 6 + (offset % 4))],
                    "고소한 간식에 도움",
                ),
            )
        )
    return entries


def strategy() -> str:
    return (
        "질문 전략: 규정에서 상한, 표현 금지, 중복 처리만 먼저 요약한다. "
        "검수 파일은 한 번에 하나씩 붙여 같은 표(코드, 수출국 판정, 표현, 결과, 검수자)로 적고, "
        "A·B·C 순으로 같은 코드는 마지막 행만 남긴 뒤 합산하고 검산한다."
    )


def build() -> None:
    entries = build_entries()
    final_items = collapse(entries, last=True)
    first_items = collapse(entries, last=False)
    answers = answers_for(final_items)
    first_answers = answers_for(first_items)
    if answers["q1"] == first_answers["q1"] or answers["q2"] == first_answers["q2"]:
        raise SystemExit("중복 코드를 버려도 정답이 달라지지 않습니다.")
    raw_count = len(entries)
    unique_count = len({item["code"] for _index, item in entries})
    if not (80 <= raw_count <= 120 and 80 <= unique_count <= 120):
        raise SystemExit(f"제품 수 범위 밖: rows={raw_count} unique={unique_count}")
    if raw_count == unique_count:
        raise SystemExit("중복 코드가 없습니다.")
    if answers["q5"] != str(unique_count):
        raise SystemExit("유효 제품 수 불일치")

    rules_head = "\n".join(
        [
            "노을푸드 가공식품 수출 검수 규정.",
            "제3조 상한. 성분 함량이 상한과 같으면 통과하고, 상한보다 크면 위반이다.",
            "제5조 수출국. 행에 적힌 수출국만 적용한다. 수출국이 둘이면 두 나라 기준을 모두 통과해야 한다. 행에 없는 나라의 상한은 수출 판정에 쓰지 않는다.",
            "제7조 어린이. 대상이 어린이이고 성분 표의 어린이 칸이 숫자이면 그 값과 같아야 한다. 크거나 작으면 위반이다. 어린이 칸이 해당없음이면 성인 상한을 쓴다. 이 예외는 한국과 EU에 같이 적용한다.",
            "제9조 표현. 라벨 문구에 치료, 예방, 완치가 있으면 위반이다. 도움, 고소, 바삭, 간식은 허용한다.",
            "제11조 중복. 같은 제품 코드가 여러 번 나오면 검수 파일 A, B, C 순서로 뒤 파일의 행만 유효하다. 같은 파일에서는 아래쪽 행만 유효하다. 앞선 행은 폐기한다.",
            "제13조 금지 원료. 타르색소는 함량이 얼마든 표시되면 위반이다.",
            "",
            "===LIMITS===",
            "나트륨|mg|KR:600|EU:500|어린이:300",
            "당류|g|KR:15|EU:12|어린이:해당없음",
            "카페인|mg|KR:80|EU:50|어린이:0",
            "타르색소|mg|KR:금지|EU:금지|함량무관",
            "합성감미료|mg|KR:40|EU:25|어린이:해당없음",
            "===END LIMITS===",
        ]
    )
    rules = grow(rules_head, "===CLAUSES===", "===END CLAUSES===", 4600)

    files = [
        {
            "id": "rules",
            "name": "01_규정.pdf",
            "kind": "pdf",
            "media": "exam-media/noeul-food-review/01_rules.pdf",
            "content": rules,
        }
    ]
    for index, letter in enumerate("ABC"):
        rows = [row_line(item) for file_index, item in entries if file_index == index]
        head = "\n".join(
            [
                f"노을푸드 검수 기록 {letter}. 헤더 다음 행만 제품이다.",
                "열 순서는 제품코드, 수출국, 검수자, 결과, 대상, 성분·함량, 라벨 문구이다.",
                "",
                "===ROWS===",
                "code|markets|inspector|result|audience|ingredients|claim",
                "\n".join(rows),
                "===END ROWS===",
            ]
        )
        content = grow(head, "===NOTES===", "===END NOTES===", 8200)
        files.append(
            {
                "id": f"audit-{letter.lower()}",
                "name": f"03_검수기록_{letter}.pdf",
                "kind": "pdf",
                "media": f"exam-media/noeul-food-review/03_audit_{letter}.pdf",
                "content": content,
            }
        )

    by_code = {item["code"]: item for item in final_items}
    label_groups = [
        ["NF-010", "NF-001", "NF-017"],
        ["NF-018", "NF-005"],
        ["NF-008", "NF-014"],
    ]
    for index, codes in enumerate(label_groups, start=1):
        shown = [by_code[code] for code in codes]
        media = f"exam-media/noeul-food-review/label-{index}.png"
        alt = draw_label(PUBLIC / f"label-{index}.png", shown)
        files.append(
            {
                "id": f"label{index}",
                "name": f"0{index + 3}_라벨{index}.png",
                "kind": "png",
                "media": media,
                "content": f"===LABELS===\n{alt}\n===END LABELS===",
            }
        )

    lengths = {item["name"]: len(item["content"]) for item in files}
    total = sum(lengths.values())
    rules_len = lengths["01_규정.pdf"]
    audits = [lengths[f"03_검수기록_{letter}.pdf"] for letter in "ABC"]
    if total <= LIMIT:
        raise SystemExit(f"전체 글자 수가 한도 이하: {total}")
    for name, length in lengths.items():
        if name == "01_규정.pdf":
            continue
        if rules_len + length >= LIMIT:
            raise SystemExit(f"규정+{name} 이 한도 이상: {rules_len + length}")
        if length >= 19000:
            raise SystemExit(f"{name} 이 너무 김: {length}")
    if rules_len + audits[0] + audits[1] <= LIMIT:
        raise SystemExit(f"규정과 검수 파일 두 개가 아직 한도 안: {rules_len + audits[0] + audits[1]}")

    pdf_from_lines(PUBLIC / "01_rules.pdf", "노을푸드 수출 검수 규정", rules.split("\n"))
    for letter in "ABC":
        content = next(item["content"] for item in files if item["id"] == f"audit-{letter.lower()}")
        pdf_from_lines(PUBLIC / f"03_audit_{letter}.pdf", f"검수 기록 {letter}", content.split("\n"))

    mistake = "\n".join(
        [
            strategy(),
            "흔한 실수",
            "- 세 검수 파일을 한 번에 붙여 한도에 걸린다.",
            "- 같은 코드를 파일마다 따로 센다. 뒤 파일 또는 같은 파일의 아래 행만 남긴다.",
            "- 상한과 같은 함량을 위반으로 본다.",
            "- 수출국에 없는 나라의 상한을 수출 판정에 쓴다.",
            "- 어린이 칸의 지정값과 다른 함량을 성인 상한으로 통과시킨다.",
            "- 표현만 어긋난 Pass 를 성분 위반으로 넣거나, 이미 Fail 인 행을 포함한다.",
        ]
    )
    payload = {
        "id": "noeul-food-review",
        "title": "노을푸드 수출 검수",
        "category": "규정 검수(대용량)",
        "passage": "노을푸드 가공식품을 한국과 EU로 내보내기 전 검수한다. 규정과 검수 기록이 파일로 나뉘어 있다. 기록을 한 번에 모두 붙이면 글자 한도를 넘으므로, 규정 다음 검수 파일을 하나씩 판정하고 합친다.",
        "files": files,
        "questions": [
            {
                "id": "q1",
                "number": 1,
                "type": "short",
                "prompt": "노가을이 Pass로 남긴 최종 기록 가운데, 수출국 기준 성분 또는 표현이 어긋난 제품 코드를 오름차순으로 쓰세요. 쉼표로 구분하고 공백은 넣지 않습니다. 같은 코드는 검수 파일 A, B, C 순서로 마지막 기록만 봅니다.",
                "answer": answers["q1"],
                "explanation": "\n".join(
                    [
                        mistake,
                        "조건은 ① 최종 기록의 검수자가 노가을 ② 결과 Pass ③ 적힌 수출국 기준 성분 위반 또는 표현 위반이다.",
                    ]
                ),
            },
            {
                "id": "q2",
                "number": 2,
                "type": "short",
                "prompt": "최종 기록이 Pass인데 적힌 수출국 기준으로 성분이 어긋난 제품 코드를 오름차순으로 쓰세요. 표현만 어긋난 제품은 빼세요. 쉼표로 구분하고 공백은 넣지 않습니다.",
                "answer": answers["q2"],
                "explanation": "\n".join(
                    [
                        mistake,
                        "조건은 ① 최종 결과 Pass ② 적힌 수출국 중 하나라도 성분 위반이다. 표현 위반만 있으면 제외한다.",
                        "타르색소는 함량과 상관없이 위반이다. 어린이 칸이 숫자이면 그 값만 허용한다.",
                    ]
                ),
            },
            {
                "id": "q3",
                "number": 3,
                "type": "short",
                "prompt": "한국 성분 기준은 통과하고 EU 성분 기준은 통과하지 못하는 제품 코드를 오름차순으로 쓰세요. 수출국, 검수 결과, 표현, 검수자는 보지 않습니다. 최종 기록만 사용합니다. 쉼표로 구분하고 공백은 넣지 않습니다.",
                "answer": answers["q3"],
                "explanation": "\n".join(
                    [
                        mistake,
                        "수출국과 결과, 표현은 무시한다. 조건은 ① 한국 성분 통과 ② EU 성분 불통이다.",
                        "상한과 같은 값은 통과다. 어린이 예외는 양쪽 시장에 같이 적용한다.",
                    ]
                ),
            },
            {
                "id": "q4",
                "number": 4,
                "type": "short",
                "prompt": "세 검수 파일을 합쳐 같은 코드는 마지막 기록만 남겼을 때, 적힌 수출국의 성분과 표현을 모두 지키고 결과도 Pass인 제품은 몇 개인가요? 숫자만 쓰세요.",
                "answer": answers["q4"],
                "explanation": "\n".join(
                    [
                        mistake,
                        "파일별 판정표를 합친 뒤 같은 코드는 마지막 행만 남긴다.",
                        "조건은 ① 적힌 수출국마다 성분 통과 ② 치료·예방·완치 없음 ③ 결과 Pass 이다.",
                        f"검산 결과는 {answers['q4']}개이다. 행을 중복까지 더하면 이 수와 다르다.",
                    ]
                ),
            },
            {
                "id": "q5",
                "number": 5,
                "type": "short",
                "prompt": "세 검수 파일의 제품 행을 모두 합친 뒤, 같은 코드는 마지막 기록만 남기면 유효 제품은 몇 개인가요? 숫자만 쓰세요.",
                "answer": answers["q5"],
                "explanation": "\n".join(
                    [
                        mistake,
                        "A, B, C의 제품 행 수를 각각 센 다음 더하고, 앞에서 폐기된 중복 코드 수만큼 빼면 된다.",
                        f"검산 결과는 {answers['q5']}개이다. 폐기 전 행 수와 같지 않다.",
                    ]
                ),
            },
        ],
    }
    (DATA / "noeul-food-review.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"rows={raw_count} unique={unique_count}")
    print("chars " + " ".join(f"{name}={length}" for name, length in lengths.items()))
    print(f"total={total}")
    print("answers " + " ".join(f"{key}={value}" for key, value in answers.items()))


if __name__ == "__main__":
    ensure_font()
    build()
