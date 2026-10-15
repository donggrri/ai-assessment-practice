"""단비헬스케어 개인정보 마스킹 점검 (보통)."""

from __future__ import annotations

import random
import re
from collections import Counter
from dataclasses import dataclass, field

from .common import block, bundle, explain, join_codes, make_names, memo_block, pdf_file

SET_ID = "danbi-privacy-masking"
ISSUER = "단비헬스케어"
START, END = "2026-10-01", "2026-10-31"
ITEMS = ["RRN", "TEL", "EML", "CARD"]
DOMAINS = ["mail.example", "danbi.example", "web.example", "post.example"]

SYSTEMS = [
    ("SYS-CRM", "고객관리", "운영", "-", "-"),
    ("SYS-PAY", "결제정산", "운영", "-", "-"),
    ("SYS-DWH", "분석저장소", "분석", "2026-10-05", "2026-10-20"),
    ("SYS-BI", "리포트", "분석", "2026-10-10", "2026-10-24"),
    ("SYS-EXT", "제휴전송", "외부전송", "2026-10-01", "2026-10-31"),
    ("SYS-QA", "품질시험", "시험", "2026-10-03", "2026-10-12"),
]
FILES = [("E1", "2026-10-01", "2026-10-07"), ("E2", "2026-10-08", "2026-10-14"), ("E3", "2026-10-15", "2026-10-21"), ("E4", "2026-10-22", "2026-10-28"), ("E5", "2026-10-29", "2026-11-03")]


@dataclass
class Record:
    rid: str
    cid: str
    name: str
    system: str
    date: str
    item: str
    value: str
    submitted: str


@dataclass
class Export:
    code: str
    first: str
    last: str
    rows: list[Record] = field(default_factory=list)
    printed: int = 0


def masked_ok(item: str, value: str) -> bool:
    if item == "RRN":
        return re.fullmatch(r"\d{6}-\*{7}", value) is not None
    if item == "TEL":
        return re.fullmatch(r"\d{2,3}-\*{3,4}-\d{4}", value) is not None
    if item == "CARD":
        return re.fullmatch(r"\d{4}-\*{4}-\*{4}-\d{4}", value) is not None
    local, _, domain = value.partition("@")
    if not domain:
        return False
    if len(local) <= 2:
        return re.fullmatch(r"\*+", local) is not None
    return re.fullmatch(r"[a-z0-9]{2}\*+", local) is not None


def approved(system: tuple, date: str) -> bool:
    _code, _name, kind, first, last = system
    if kind == "외부전송" or first == "-":
        return False
    return first <= date <= last


def digits(rng: random.Random, count: int) -> str:
    return "".join(str(rng.randrange(10)) for _ in range(count))


def make_value(rng: random.Random, item: str, good: bool) -> str:
    if item == "RRN":
        head = f"{rng.randrange(70, 100)}{rng.randrange(1, 13):02d}{rng.randrange(1, 29):02d}"
        if good:
            return f"{head}-*******"
        return rng.choice([f"{head}-{rng.randrange(1, 5)}{digits(rng, 6)}", f"{head}-{rng.randrange(1, 5)}******", f"{head}-******"])
    if item == "TEL":
        prefix = rng.choice(["010", "010", "010", "02", "031"])
        tail = digits(rng, 4)
        stars = "***" if prefix == "031" else "****"
        if good:
            return f"{prefix}-{stars}-{tail}"
        middle = digits(rng, len(stars))
        return rng.choice([f"{prefix}-{middle}-{tail}", f"{prefix}-{middle[:2]}{stars[2:]}-{tail}", f"{prefix}-{stars}-{tail[:2]}**", f"{prefix}-{stars}-****"])
    if item == "CARD":
        first, last = digits(rng, 4), digits(rng, 4)
        if good:
            return f"{first}-****-****-{last}"
        return rng.choice([f"{first}-{digits(rng, 4)}-{digits(rng, 4)}-{last}", f"{first}-{digits(rng, 2)}**-****-{last}", f"{first}-****-****-{last[:2]}**", f"{first}-****-{digits(rng, 4)}-{last}"])
    length = rng.choice([2, 3, 5, 6, 7, 8, 9])
    letters = "abcdefghjkmnpqrstuvwxyz0123456789"
    local = "".join(rng.choice(letters) for _ in range(length))
    domain = rng.choice(DOMAINS)
    if good:
        masked = "*" * length if length <= 2 else local[:2] + "*" * (length - 2)
        return f"{masked}@{domain}"
    options = [f"{local}@{domain}"]
    if length >= 4:
        options.append(f"{local[:3]}{'*' * (length - 3)}@{domain}")
        options.append(f"{local[:1]}{'*' * (length - 1)}@{domain}")
        options.append(f"{local[:2]}{'*' * (length - 3)}{local[-1]}@{domain}")
    else:
        options.append(f"{local[:1]}{'*' * (length - 1)}@{domain}")
    return rng.choice(options)


def violating(record: Record, systems: dict[str, tuple]) -> bool:
    if record.cid.startswith("TEST-"):
        return False
    if not (START <= record.date <= END):
        return False
    if approved(systems[record.system], record.date):
        return False
    return not masked_ok(record.item, record.value)


def evaluate(exports: list[Export]) -> list[tuple[str, Record]]:
    systems = {item[0]: item for item in SYSTEMS}
    out: list[tuple[str, Record]] = []
    for export in exports:
        latest: dict[str, Record] = {}
        for row in export.rows:
            current = latest.get(row.rid)
            if current is None or row.submitted > current.submitted:
                latest[row.rid] = row
        out.extend((export.code, row) for row in latest.values() if violating(row, systems))
    return out


def answers_of(found: list[tuple[str, Record]]) -> dict[str, str]:
    q1 = str(sum(1 for code, _row in found if code in {"E2", "E4"}))
    by_system = Counter(row.system for _code, row in found)
    q2 = join_codes(code for code, count in by_system.items() if count >= 5)
    e5 = Counter(row.system for code, row in found if code == "E5")
    q3 = e5.most_common(1)[0][0]
    items = Counter(row.item for _code, row in found)
    q4 = items.most_common(1)[0][0]
    return {"q1": q1, "q2": q2, "q3": q3, "q4": q4, "_e5": str(e5.most_common(2)), "_items": str(items.most_common(4))}


def build_exports(rng: random.Random) -> list[Export]:
    names = make_names(48, 5511, 2)
    customers = [(f"C{200100 + index * 7}", names[index]) for index in range(48)]
    exports = [Export(code, first, last) for code, first, last in FILES]
    systems = {item[0]: item for item in SYSTEMS}

    def stamp(date: str, late: int = 1) -> str:
        month, day = int(date[5:7]), int(date[8:10]) + late
        if day > 30:
            month, day = month + 1, day - 30
        return f"2026-{month:02d}-{day:02d} {rng.randrange(8, 18):02d}:{rng.randrange(0, 60):02d}"

    def date_in(export: Export) -> str:
        first, last = int(export.first[8:10]), int(export.last[8:10])
        if export.code == "E5":
            return rng.choice(["2026-10-29", "2026-10-30", "2026-10-31", "2026-10-31"])
        return f"2026-10-{rng.randrange(first, last + 1):02d}"

    for export in exports:
        serial = 0

        def add(date: str, system: str, item: str, good: bool, cid: tuple[str, str] | None = None, value: str | None = None, late: int = 1) -> Record:
            nonlocal serial
            serial += 1
            customer = cid or rng.choice(customers)
            row = Record(f"REC-{export.code}-{serial:03d}", customer[0], customer[1], system, date, item, value or make_value(rng, item, good), stamp(date, late))
            export.rows.append(row)
            return row

        prod = ["SYS-CRM", "SYS-PAY"]
        for _ in range(34):
            add(date_in(export), rng.choice(prod + ["SYS-DWH", "SYS-BI", "SYS-QA"]), rng.choice(ITEMS), True)
        weights = [("SYS-CRM", 3), ("SYS-PAY", 2), ("SYS-DWH", 2), ("SYS-BI", 1)]
        pool = [name for name, count in weights for _ in range(count)]
        for _ in range(6):
            item = rng.choices(ITEMS, weights=[2, 2, 3, 2])[0]
            add(date_in(export), rng.choice(pool), item, False)
        # 승인 시스템. 면제 경계 날짜.
        for code in ("SYS-DWH", "SYS-BI", "SYS-QA"):
            _c, _n, _k, first, last = systems[code]
            for date in (first, last, f"2026-10-{int(last[8:10]) + 1:02d}", f"2026-10-{int(first[8:10]) - 1:02d}"):
                if export.first <= date <= export.last:
                    add(date, code, rng.choice(ITEMS), False)
        add(date_in(export), "SYS-EXT", rng.choice(ITEMS), False)
        for _ in range(2):
            date = date_in(export)
            add(date, rng.choice(prod), rng.choice(ITEMS), False, cid=(f"TEST-{rng.randrange(100, 999)}", "시험계정"))
        if export.code == "E1":
            add("2026-09-30", "SYS-CRM", "RRN", False)
            add("2026-09-30", "SYS-PAY", "EML", False)
        if export.code == "E2":
            add("2026-09-30", "SYS-DWH", "CARD", False)
        if export.code == "E4":
            add("2026-11-01", "SYS-EXT", "TEL", False)
        if export.code == "E5":
            add("2026-11-01", "SYS-CRM", "TEL", False)
            add("2026-11-02", "SYS-PAY", "CARD", False)
            add("2026-11-03", "SYS-CRM", "EML", False)

    for export in exports:
        pool = [row for row in export.rows if row.system in {"SYS-CRM", "SYS-PAY"} and START <= row.date <= END and not row.cid.startswith("TEST-")]
        rng.shuffle(pool)
        for row in pool[:3]:
            older = Record(row.rid, row.cid, row.name, row.system, row.date, row.item, make_value(rng, row.item, not masked_ok(row.item, row.value)), "")
            older.submitted = f"{row.submitted[:11]}07:05"
            row.submitted = f"{row.submitted[:11]}15:50"
            export.rows.append(older)
        export.rows.sort(key=lambda item: (item.date, item.rid, rng.random()))
        export.printed = len(export.rows) + 9

    return exports


def build() -> dict:
    for seed in range(8800, 8900):
        rng = random.Random(seed)
        exports = build_exports(rng)
        found = evaluate(exports)
        e5 = Counter(row.system for code, row in found if code == "E5").most_common(2)
        items = Counter(row.item for _code, row in found).most_common(2)
        if len(e5) >= 2 and e5[0][1] > e5[1][1] and len(items) >= 2 and items[0][1] > items[1][1] and len(answers_of(found)["q2"].split(",")) >= 3:
            break
    else:
        raise SystemExit("개인정보 정답을 정할 시드를 찾지 못했다")
    answers = answers_of(found)

    policy = "\n".join(
        [
            "단비헬스케어 개인정보 마스킹 점검 규정.",
            f"기간 {START} {END}",
            "제1조 기간. 추출일이 2026-10-01보다 전이거나 2026-10-31보다 뒤인 레코드는 점검하지 않는다.",
            "제2조 중복. 같은 레코드ID가 여러 번 제출되면 제출시각이 가장 늦은 행만 남긴다. 파일에서 몇 번째 줄인지는 상관없다.",
            "제3조 마스킹 형식. 마스킹한 자리는 *로 바꾸고 자릿수는 그대로 둔다. 항목 RRN은 주민등록번호이며 앞 6자리와 하이픈을 두고 뒤 7자리를 모두 *로 한다. 항목 TEL은 전화번호이며 첫 묶음과 마지막 4자리를 두고 가운데를 모두 *로 한다. 항목 CARD는 카드번호이며 첫 4자리, 마지막 4자리, 하이픈을 두고 가운데 8자리를 모두 *로 한다(예: 1234-****-****-5678). 항목 EML은 이메일이며 @ 앞 아이디가 3자 이상이면 앞 2자만 두고 나머지를 모두 *로 하고, 2자 이하이면 모두 *로 한다. @ 뒤 도메인은 그대로 둔다.",
            "제4조 위반. 제3조 형식과 한 글자라도 다르면 위반이다. 위반은 레코드 1건당 1회로 센다.",
            "제5조 승인 시스템. 시스템 마스터에 승인기간이 있는 시스템은 추출일이 승인시작일과 승인만료일 사이이면 마스킹 여부나 형식과 상관없이 위반이 아니다. 시작일과 만료일 당일도 승인기간이다. 승인기간이 -이면 승인이 없다. 단 구분이 외부전송인 시스템은 승인기간이 있어도 면제하지 않는다.",
            "제6조 시험 계정. 고객ID가 TEST- 로 시작하는 레코드는 점검에서 뺀다.",
            "제7조 소계. 파일 머리의 표기건수와 표 아래 소계 건수는 사용하지 않는다. 이름이 같아도 고객ID가 다르면 다른 고객이다.",
        ]
    )
    system_rows = [f"{code}|{name}|{kind}|{first}|{last}" for code, name, kind, first, last in SYSTEMS]
    master = "단비헬스케어 시스템 마스터. 시스템코드 순이다.\n\n" + block("SYSTEMS", "시스템코드|시스템명|구분|승인시작일|승인만료일", system_rows)
    files = [
        pdf_file(SET_ID, "policy", "01_마스킹_점검_규정.pdf", "마스킹 점검 규정", policy, ISSUER, "개인정보 마스킹", "01_policy.pdf"),
        pdf_file(SET_ID, "systems", "02_시스템_마스터.pdf", "시스템 마스터", master, ISSUER, "시스템 마스터", "02_systems.pdf"),
    ]
    for export in exports:
        rows = [f"{r.rid}|{r.cid}|{r.name}|{r.system}|{r.date}|{r.item}|{r.value}|{r.submitted}" for r in export.rows]
        body = "\n".join(
            [
                f"단비헬스케어 개인정보 추출 레코드. 파일 {export.code}. 추출일 범위 {export.first} {export.last}.",
                f"표기건수 {export.printed}",
                block("RECORDS", "레코드ID|고객ID|이름|시스템|추출일|항목|값|제출시각", rows),
                memo_block(
                    [
                        "이 문단은 현장 메모이며 표의 행이 아니다. 표기건수와 소계는 다시 더하지 않는다.",
                        f"{export.code} 추출 메모. 값 칸은 추출된 문자열 그대로이며 *는 마스킹 자리다.",
                        "메모에 적힌 숫자는 예시이며 점검에 쓰지 않는다. 예: 지난 달 위반 31건.",
                    ]
                ),
            ]
        )
        files.append(
            pdf_file(SET_ID, f"export-{export.code.lower()}", f"03_추출_레코드/{export.code}_{export.first[5:].replace('-', '')}.pdf", f"{export.code} 추출 레코드", body, ISSUER, "추출 레코드", f"exports/{export.code}.pdf")
        )

    mistakes = [
        "파일을 한꺼번에 붙여 글자 한도에 걸린다.",
        "승인만료일 당일이나 승인시작일 당일을 승인 밖으로 본다. 외부전송 시스템도 승인이 있으면 면제한다고 착각한다.",
        "같은 레코드ID를 다시 제출한 행을 모두 센다. 제출시각이 가장 늦은 행만 남긴다.",
        "기간 밖 추출일(9월 30일, 11월)을 센다.",
        "마스킹 자릿수나 노출 자리가 다른 값을 정상으로 본다. TEST- 계정을 센다.",
    ]
    strategy = "규정에서 기간, 중복, 항목별 마스킹 형식, 승인 시스템, 시험 계정 규칙을 먼저 적는다. 큰 추출 파일은 하나씩 나눠 같은 기준으로 판정한 뒤 합친다."
    questions = [
        {
            "prompt": "E2 파일과 E4 파일에서 위반인 레코드는 모두 몇 건인가. 숫자만 쓰세요.",
            "answer": answers["q1"],
            "explanation": explain(strategy, mistakes, "01 규정, 02 시스템 마스터, E2, E4 (두 추출 파일만 붙이면 한도 안에서 풀린다)", "각 파일에서 중복을 정리한 뒤 제3조 형식과 비교한다. 승인 시스템과 시험 계정을 반영한 남은 행만 센다."),
        },
        {
            "prompt": "10월 점검 기간에 위반 레코드가 5건 이상인 시스템 코드를 코드 사전순(오름차순)으로 쓰세요. 쉼표로 구분하고 공백은 넣지 않습니다.",
            "answer": answers["q2"],
            "explanation": explain(strategy, mistakes, "01 규정, 02 시스템 마스터, E1~E5 전부", "파일마다 시스템별 위반 건수를 세어 합친 뒤 5건 이상인 시스템만 고른다. 승인기간 안의 행은 위반이 아니다."),
        },
        {
            "prompt": "E5 파일만 기준으로, 위반 레코드가 가장 많은 시스템 코드는 무엇인가. 시스템 코드만 쓰세요.",
            "answer": answers["q3"],
            "explanation": explain(strategy, mistakes, "01 규정, 02 시스템 마스터, E5", "추출일이 11월인 행은 점검하지 않는다. 시스템별 위반 건수를 세어 가장 큰 것을 고른다."),
        },
        {
            "prompt": "10월 점검 기간의 위반 레코드 중 건수가 가장 많은 항목 코드는 무엇인가(RRN, TEL, EML, CARD 중 하나). 항목 코드만 쓰세요.",
            "answer": answers["q4"],
            "explanation": explain(strategy, mistakes, "01 규정, 02 시스템 마스터, E1~E5 전부", "파일마다 항목별 위반 건수를 세어 합친 뒤 가장 큰 항목을 고른다."),
        },
    ]
    passage = (
        "단비헬스케어가 2026년 10월에 추출한 고객 개인정보 레코드의 마스킹 상태를 점검한다. 규정, 시스템 마스터, 추출 레코드 5개 파일이 나뉘어 있다. "
        "문제마다 필요한 파일이 다르며, 전부 한 번에 붙이면 글자 한도를 넘는다. 표기건수와 소계는 쓰지 않는다."
    )
    payload = bundle(SET_ID, "단비헬스케어 개인정보 마스킹 점검", "개인정보 점검", "보통", passage, files, questions)
    payload["_ref"] = {"answers": {key: value for key, value in answers.items() if not key.startswith("_")}}
    return payload
