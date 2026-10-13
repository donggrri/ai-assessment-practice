#!/usr/bin/env python3
"""어려움 문제 세트 4개의 JSON과 PDF를 만든다. 다른 세트 JSON은 건드리지 않는다."""

from __future__ import annotations

import json
import random
import sys
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from official_pdf import render_official_pdf

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "problem-sets"
PUBLIC = ROOT / "public"

SURNAMES = list("김이박최정강조윤장임한오서신권황안송전홍고문양손배백허유남심노하곽성차주우구민진")
GIVEN = [
    "하준", "서연", "도윤", "지우", "시우", "하은", "서준", "지호", "예준", "수아",
    "민준", "지민", "현우", "지아", "건우", "서현", "유준", "아린", "준서", "하린",
    "은우", "채원", "시윤", "윤서", "지후", "다은", "연우", "서우", "하율", "지율",
]


@dataclass
class Person:
    id: str
    name: str
    group: str
    role: str
    status: str
    effective: str


@dataclass
class Row:
    id: str
    name: str
    group: str
    date: str
    kind: str
    amount: int
    memo: str = "정기"


@dataclass
class Fix:
    action: str
    id: str
    date: str
    kind: str
    amount: int
    new: int


@dataclass
class Bucket:
    code: str
    title: str
    rows: list[Row] = field(default_factory=list)
    fixes: list[Fix] = field(default_factory=list)
    plan: str = ""
    carry: int = 0
    change: tuple[str, str] | None = None
    opening: int = 0
    printed: int = 0


def names_for(count: int, seed: int) -> list[str]:
    rng = random.Random(seed)
    pool = [s + g for s in SURNAMES for g in GIVEN]
    rng.shuffle(pool)
    picked = pool[:count]
    # 동명이인 4쌍. 뒤쪽 사람의 이름을 앞쪽과 같게 한다.
    for index in range(4):
        picked[count - 1 - index] = picked[index]
    return picked


def status_on(person: Person, day: str, start: str, end: str, default: str) -> str:
    if person.effective <= start:
        return person.status
    if person.effective > end:
        return default
    if day < person.effective:
        return default
    return person.status


def prepare(bucket: Bucket, people: dict[str, Person], start: str, end: str, *, home: bool = True) -> list[tuple[Row, Person]]:
    last: dict[tuple[str, str, str, int], int] = {}
    for index, row in enumerate(bucket.rows):
        last[(row.id, row.date, row.kind, row.amount)] = index
    rows = [row for index, row in enumerate(bucket.rows) if last[(row.id, row.date, row.kind, row.amount)] == index]
    kept: list[Row] = []
    for row in rows:
        amount = row.amount
        skip = False
        for fix in bucket.fixes:
            if fix.id == row.id and fix.date == row.date and fix.kind == row.kind and fix.amount == amount:
                if fix.action == "취소":
                    skip = True
                    break
                if fix.action == "정정":
                    amount = fix.new
                    break
        if skip:
            continue
        kept.append(Row(row.id, row.name, row.group, row.date, row.kind, amount, row.memo))
    ready: list[tuple[Row, Person]] = []
    for row in kept:
        if not (start <= row.date <= end):
            continue
        person = people.get(row.id)
        if person is None or (home and person.group != bucket.code):
            continue
        ready.append((row, person))
    return ready


def join_codes(codes: list[str]) -> str:
    return ",".join(sorted(set(codes)))


def memo_block(title: str, count: int) -> str:
    lines = [
        "이 문단은 현장 메모이며 표의 행이 아니다. 표기합계와 소계 건수는 다시 더하지 않는다.",
        f"{title} 메모는 예시 문장만 담는다. 사번이나 품목 코드로 세지 않는다.",
    ]
    extra = "점검 순서는 정책 파일을 먼저 읽고, 명부를 정리한 뒤 이 파일을 한 권씩 더한다."
    while len(lines) < count:
        lines.append(f"{len(lines)}. {extra}")
    return "===MEMO===\n" + "\n".join(lines[:count]) + "\n===END MEMO==="


def table(header: str, rows: list[str]) -> str:
    return header + "\n" + "\n".join(rows)


def explain(what: str) -> str:
    return (
        "질문 전략: 정책에서 기간, 상태 발효일, 중복, 정정, 소계를 먼저 적는다. "
        "명부나 대장은 한 번에 붙이기 어려우면 상태만 표로 정리하고, 묶음 파일은 하나씩 나눠 같은 표로 만든 뒤 합산한다.\n"
        "흔한 실수\n"
        "- 파일을 한 번에 붙여 글자 한도에 걸린다.\n"
        "- 표기합계나 소계 건수를 그대로 쓴다.\n"
        "- 같은 행을 두 번 센다. 같은 키의 아래쪽 행만 남긴다.\n"
        "- 다른 묶음에 섞인 행을 그 파일 소속으로 넣는다.\n"
        "- 발효일 전을 이미 바뀐 상태로 본다.\n"
        "- 이름이 같으면 같은 사람으로 합친다.\n"
        f"{what}"
    )


GPU_PLANS = {
    "A": {"name": "씨앗", "base": 300, "price": 90, "rollover": 0, "allowed": {"infer"}},
    "B": {"name": "새싹", "base": 700, "price": 80, "rollover": 0, "allowed": {"infer", "serve"}},
    "C": {"name": "가지", "base": 1200, "price": 70, "rollover": 150, "allowed": {"infer", "serve", "train"}},
    "D": {"name": "숲", "base": 2000, "price": 60, "rollover": 300, "allowed": {"infer", "serve", "train", "tune"}},
    "E": {"name": "실험", "base": 2400, "price": 55, "rollover": 0, "allowed": {"infer", "train", "tune", "lab"}},
    "F": {"name": "영상", "base": 1600, "price": 65, "rollover": 0, "allowed": {"infer", "render"}},
    "G": {"name": "임원", "base": 400, "price": 50, "rollover": 0, "allowed": {"infer"}},
    "H": {"name": "휴면", "base": 0, "price": 100, "rollover": 0, "allowed": set()},
}


def gpu_allowance(bucket: Bucket, days: int = 31) -> int:
    start = GPU_PLANS[bucket.plan]
    carry = min(bucket.carry, start["rollover"])
    if not bucket.change:
        return start["base"] + carry
    new = GPU_PLANS[bucket.change[1]]
    before = int(bucket.change[0][8:10]) - 1
    after = days - before
    return start["base"] * before // days + new["base"] * after // days + carry


def gpu_price(bucket: Bucket) -> int:
    code = bucket.change[1] if bucket.change else bucket.plan
    return GPU_PLANS[code]["price"]


def gpu_plan_on(bucket: Bucket, day: str) -> dict:
    if bucket.change and day >= bucket.change[0]:
        return GPU_PLANS[bucket.change[1]]
    return GPU_PLANS[bucket.plan]


def score_gpu(people: dict[str, Person], buckets: list[Bucket], *, home: bool = True) -> dict[str, str]:
    start, end = "2026-03-01", "2026-03-31"
    over: list[str] = []
    forbidden: list[str] = []
    resign = 0
    fee = 0
    for bucket in buckets:
        ready = prepare(bucket, people, start, end, home=home)
        bill = 0
        for row, person in ready:
            state = status_on(person, row.date, start, end, "재직")
            if state == "퇴사":
                resign += 1
            if state != "재직":
                continue
            bill += row.amount
            if row.kind not in gpu_plan_on(bucket, row.date)["allowed"]:
                forbidden.append(person.id)
        allow = gpu_allowance(bucket)
        if bill > allow:
            over.append(bucket.code)
            fee += (bill - allow) * gpu_price(bucket)
    return {"q1": join_codes(over), "q2": join_codes(forbidden), "q3": str(resign), "q4": str(fee)}


def score_warehouse(people: dict[str, Person], buckets: list[Bucket], *, home: bool = True) -> dict[str, str]:
    start, end = "2026-04-01", "2026-04-30"
    short_sites: list[str] = []
    stopped: list[str] = []
    recall = 0
    shortage = 0
    for bucket in buckets:
        ready = prepare(bucket, people, start, end, home=home)
        inbound = outbound = 0
        for row, person in ready:
            state = status_on(person, row.date, start, end, "판매중")
            if state == "판매중":
                if row.kind == "입고":
                    inbound += row.amount
                elif row.kind == "출고":
                    outbound += row.amount
            elif state == "단종" and row.kind == "출고":
                stopped.append(person.id)
            elif state == "회수" and row.kind == "출고":
                recall += 1
        ending = bucket.opening + inbound - outbound
        if ending < 0:
            short_sites.append(bucket.code)
            shortage += -ending
    return {"q1": join_codes(short_sites), "q2": join_codes(stopped), "q3": str(recall), "q4": str(shortage)}


HR_NEED = {
    "ETH": {"minutes": 40, "states": {"수습"}},
    "SEC": {"minutes": 60, "states": {"재직", "수습"}},
    "SAF": {"minutes": 30, "states": {"수습"}},
}


def score_hr(people: dict[str, Person], buckets: list[Bucket], *, home: bool = True) -> dict[str, str]:
    start, end = "2026-05-01", "2026-05-31"
    minutes: dict[tuple[str, str], int] = {}
    resign = 0
    for bucket in buckets:
        for row, person in prepare(bucket, people, start, end, home=home):
            state = status_on(person, row.date, start, end, "재직")
            if state == "퇴사":
                resign += 1
            if state not in {"재직", "수습"}:
                continue
            key = (person.id, row.kind)
            minutes[key] = minutes.get(key, 0) + row.amount
    incomplete: list[str] = []
    forbidden: list[str] = []
    shortfall = 0
    for person in people.values():
        end_state = status_on(person, end, start, end, "재직")
        if minutes.get((person.id, "LDR"), 0) > 0 and person.role != "팀장":
            forbidden.append(person.id)
        if end_state not in {"재직", "수습"}:
            continue
        gap = 0
        for code, rule in HR_NEED.items():
            if end_state in rule["states"]:
                gap += max(0, rule["minutes"] - minutes.get((person.id, code), 0))
        if person.role == "팀장":
            gap += max(0, 20 - minutes.get((person.id, "LDR"), 0))
        if gap > 0:
            incomplete.append(person.id)
            shortfall += gap
    return {"q1": join_codes(incomplete), "q2": join_codes(forbidden), "q3": str(resign), "q4": str(shortfall)}


def score_equip(people: dict[str, Person], buckets: list[Bucket], *, home: bool = True) -> dict[str, str]:
    start, end = "2026-06-01", "2026-06-30"
    bad_sites: list[str] = []
    only_bad: list[str] = []
    retired = 0
    defects = 0
    per_asset: dict[str, list[int]] = {}
    for bucket in buckets:
        bad = good = 0
        for row, person in prepare(bucket, people, start, end, home=home):
            state = status_on(person, row.date, start, end, "가동")
            if state == "폐기":
                retired += 1
            if state != "가동":
                continue
            if row.kind == "불량":
                bad += row.amount
                defects += row.amount
                slot = per_asset.setdefault(person.id, [0, 0])
                slot[0] += row.amount
            elif row.kind == "양호":
                good += 1
                slot = per_asset.setdefault(person.id, [0, 0])
                slot[1] += 1
        if bad > good:
            bad_sites.append(bucket.code)
    for asset_id, (bad, good) in per_asset.items():
        if bad > 0 and good == 0:
            only_bad.append(asset_id)
    return {"q1": join_codes(bad_sites), "q2": join_codes(only_bad), "q3": str(retired), "q4": str(defects * 8000)}


def make_people(prefix: str, groups: list[tuple[str, str]], default: str, mid_status: str, early_status: str, seed: int, start: str) -> list[Person]:
    year_month = start[:8]
    names = names_for(160, seed)
    people: list[Person] = []
    cursor = 0
    for group_index, (code, _title) in enumerate(groups):
        count = 14 if group_index < 4 else 13
        for offset in range(count):
            role = "팀장" if offset == 0 else "사원"
            status = default
            effective = "2026-01-01"
            if offset == 9:
                status = mid_status
                effective = f"{year_month}15"
            elif offset == 10:
                status = early_status
                effective = "2026-01-15"
            elif offset == 11:
                status = mid_status
                effective = "2026-12-01"
            people.append(
                Person(
                    id=f"{prefix}{cursor + 1:04d}",
                    name=names[cursor],
                    group=code,
                    role=role,
                    status=status,
                    effective=effective,
                )
            )
            cursor += 1
    if cursor != 160:
        raise SystemExit(f"인원 {cursor}")
    return people


def add_base_rows(bucket: Bucket, members: list[Person], dates: list[str], kinds: list[str], amount: int) -> None:
    for index, person in enumerate(members):
        if person.status != members[0].status and person.effective <= dates[0]:
            continue
        kind = kinds[index % len(kinds)]
        day = dates[index % len(dates)]
        bucket.rows.append(Row(person.id, person.name, bucket.code, day, kind, amount, "정기"))


def raw_printed(bucket: Bucket) -> int:
    return sum(row.amount for row in bucket.rows) + 500


def build_gpu() -> dict:
    groups = [
        ("T01", "플랫폼", "C", 180, None),
        ("T02", "추천", "D", 0, None),
        ("T03", "비전", "C", 80, ("2026-03-11", "D")),
        ("T04", "음성", "F", 90, None),
        ("T05", "검색", "B", 0, None),
        ("T06", "인프라", "A", 40, None),
        ("T07", "보안", "E", 500, None),
        ("T08", "데이터", "F", 0, ("2026-03-21", "C")),
        ("T09", "광고", "G", 0, None),
        ("T10", "정산", "D", 400, None),
        ("T11", "모바일", "B", 0, None),
        ("T12", "연구", "E", 0, None),
    ]
    people = make_people("S", [(code, title) for code, title, *_rest in groups], "재직", "퇴사", "휴직", 11, "2026-03-01")
    # 군복무 한 명
    soldiers = [person for person in people if person.group == "T07" and person.status == "재직" and person.role == "사원"]
    soldiers[0].status = "군복무"
    soldiers[0].effective = "2026-02-01"
    by_group: dict[str, list[Person]] = {}
    for person in people:
        by_group.setdefault(person.group, []).append(person)
    buckets: list[Bucket] = []
    dates = ["2026-03-03", "2026-03-08", "2026-03-14", "2026-03-18", "2026-03-22", "2026-03-28"]
    for code, title, plan, carry, change in groups:
        bucket = Bucket(code=code, title=title, plan=plan, carry=carry, change=change)
        members = [person for person in by_group[code] if person.effective == "2026-01-01" and person.status == "재직"]
        add_base_rows(bucket, members[:6], dates, ["infer"], 20)
        # 금지 기능
        host = members[0]
        forbidden = "tune" if plan in {"A", "B", "C", "F", "G"} else "render"
        bucket.rows.append(Row(host.id, host.name, code, "2026-03-18", forbidden, 30, "실험"))
        # 중복
        first = bucket.rows[0]
        bucket.rows.append(Row(first.id, first.name, first.group, first.date, first.kind, first.amount, first.memo))
        # 기간 밖
        bucket.rows.append(Row(host.id, host.name, code, "2026-02-20", "infer", 900, "제외"))
        # 퇴사 전후
        leaver = next(person for person in by_group[code] if person.effective == "2026-03-15")
        bucket.rows.append(Row(leaver.id, leaver.name, code, "2026-03-14", "infer", 15, "마지막"))
        bucket.rows.append(Row(leaver.id, leaver.name, code, "2026-03-16", "infer", 80, "퇴직후"))
        # 정정, 취소
        target = bucket.rows[1]
        bucket.fixes.append(Fix("정정", target.id, target.date, target.kind, target.amount, 5))
        cancel = bucket.rows[2]
        bucket.fixes.append(Fix("취소", cancel.id, cancel.date, cancel.kind, cancel.amount, 0))
        buckets.append(bucket)
    # 다른 팀 인원
    for index, bucket in enumerate(buckets):
        other = buckets[(index + 1) % len(buckets)]
        person = by_group[other.code][0]
        bucket.rows.append(Row(person.id, person.name, bucket.code, "2026-03-22", "infer", 2500, "오배정"))
    people_map = {person.id: person for person in people}
    # T03은 일할과 월말 플랜이 갈리도록 청구를 1900 근처로, T04는 이월을 무시해야 초과가 되게 맞춘다.
    def bump(code: str, amount: int, kind: str) -> None:
        bucket = next(item for item in buckets if item.code == code)
        person = next(person for person in by_group[code] if person.status == "재직" and person.effective == "2026-01-01" and person.role == "사원")
        bucket.rows.append(Row(person.id, person.name, code, "2026-03-28", kind, amount + len(bucket.rows), "추가"))

    for _ in range(12):
        scored = score_gpu(people_map, buckets)
        over = set(scored["q1"].split(","))
        if {"T03", "T04", "T06"} <= over and len(over) <= 8:
            break
        if "T04" not in over:
            bump("T04", 400, "render")
        elif "T03" not in over:
            bump("T03", 400, "train")
        elif "T06" not in over:
            bump("T06", 200, "infer")
        elif len(over) < 3:
            pending = next(code for code, *_rest in groups if code not in over)
            bump(pending, 800, "infer")
    else:
        raise SystemExit(f"GPU 조정 실패 {score_gpu(people_map, buckets)}")
    for bucket in buckets:
        bucket.printed = raw_printed(bucket)
    answers = score_gpu(people_map, buckets)
    if score_gpu(people_map, buckets, home=False)["q4"] == answers["q4"]:
        raise SystemExit("GPU 오배정을 넣으면 요금이 달라져야 한다")
    t04 = next(bucket for bucket in buckets if bucket.code == "T04")
    if min(t04.carry, GPU_PLANS[t04.plan]["rollover"]) != 0:
        raise SystemExit("T04 이월은 막혀 있어야 한다")
    return pack_gpu(people, buckets, answers)


def pack_gpu(people: list[Person], buckets: list[Bucket], answers: dict[str, str]) -> dict:
    plan_rows = [
        f"{code}|{plan['name']}|{plan['base']}|{plan['price']}|{plan['rollover']}|{','.join(sorted(plan['allowed'])) or '-'}"
        for code, plan in GPU_PLANS.items()
    ]
    policy = "\n".join(
        [
            "서림클라우드 GPU 크레딧 감사 규정.",
            "기간 2026-03-01 2026-03-31",
            "일수 31",
            "제1조 기간. 사용일이 2026-03-01보다 전이거나 2026-03-31보다 뒤면 그 행은 버린다.",
            "제2조 요금제. 요금제 표의 월기본은 기본 크레딧이고 초과단가는 기본을 넘긴 1크레딧당 원이다. 이월한도는 팀 파일의 이월 중 허용량에 더할 수 있는 상한이다. 허용기능이 - 이면 허용된 기능이 없다. 표에 없는 기능은 예외가 명시되지 않은 한 금지다.",
            "제3조 이월. 팀 파일의 이월과 월초 플랜의 이월한도 중 작은 값을 더한다. 이월한도가 0이면 팀 파일에 이월이 적혀 있어도 더하지 않는다. 월중 변경이 있으면 이월은 월초 플랜에만 적용한다.",
            "제4조 중도 변경. 변경일부터 새 플랜이다. 변경일 전날은 월초 플랜이다. 허용량은 월초 플랜 월기본에 변경일 전 일수를 곱해 31로 나눈 몫, 더하기 새 플랜 월기본에 남은 일수를 곱해 31로 나눈 몫, 더하기 제3조의 이월이다. 소수점 이하는 버린다. 초과단가는 월말 플랜의 단가이고, 변경이 없으면 그 플랜의 단가다.",
            "제5조 재직. 발효일이 2026-03-01 이전이거나 같으면 3월 전체가 그 상태다. 발효일이 2026-03-31보다 뒤면 3월 전체는 재직이다. 발효일이 3월 안이면 발효일 전날은 재직이고 발효일부터 적힌 상태다. 예외가 명시되지 않은 한 발효일 이전은 재직으로 본다. 직책과 입사일은 판정에 쓰지 않는다.",
            "제6조 청구. 사번의 명부 소속 팀 파일에 있는 행만 본다. 다른 팀 파일에 섞인 행은 어느 팀에도 넣지 않는다. 명부에 없는 사번은 버린다. 사용일 상태가 재직인 행만 청구 크레딧이다. 휴직, 군복무, 퇴사 행은 청구에서 뺀다.",
            "제7조 중복. 같은 파일에서 사번, 사용일, 기능, 크레딧이 모두 같은 행이 여러 번이면 아래쪽 행만 남긴다. 하나라도 다르면 모두 남긴다.",
            "제8조 정정. 정정 기록은 사용 표 아래를 따른다. 취소는 사번, 사용일, 기능, 크레딧이 같은 남은 행을 지운다. 정정은 그 행의 크레딧을 새 값으로 바꾼다. 맞는 행이 없으면 무시한다.",
            "제9조 금지. 청구 행의 기능이 그 사용일의 플랜 허용기능에 없으면 금지 기능이다. 청구에서 뺀 행은 금지 판정에서도 뺀다.",
            "제10조 소계. 표기합계와 표 아래 소계 건수는 사용하지 않는다.",
            "제11조 초과. 청구 크레딧이 허용량보다 크면 초과다. 같으면 초과가 아니다. 초과 요금은 초과 크레딧에 월말 플랜의 초과단가를 곱한다. 이름이 같아도 사번이 다르면 다른 사람이다.",
            "",
            "===PLANS===",
            table("코드|이름|월기본|초과단가|이월한도|허용기능", plan_rows),
            "===END PLANS===",
        ]
    )
    roster_rows = [f"{person.id}|{person.name}|{person.group}|{person.role}|2025-03-01|{person.status}|{person.effective}" for person in sorted(people, key=lambda item: item.name)]
    roster = "서림클라우드 전사 임직원 명부. 이름 순이며 팀으로 묶여 있지 않다.\n\n===ROSTER===\n" + table("사번|성명|팀|직책|입사일|상태|발효일", roster_rows) + "\n===END ROSTER===\n" + memo_block("명부", 4)
    files = [file_pdf("policy", "01_요금제_및_정책.pdf", "요금제 및 정책", policy, "서림클라우드", "GPU 크레딧 감사", "exam-media/seorim-gpu-audit/01_policy.pdf")]
    files.append(file_pdf("roster", "03_전사_임직원_명부.pdf", "전사 임직원 명부", roster, "서림클라우드", "임직원 명부", "exam-media/seorim-gpu-audit/03_roster.pdf"))
    for bucket in buckets:
        lines = [
            f"서림클라우드 팀 사용 현황. 팀코드 {bucket.code}. 팀명 {bucket.title}.",
            f"월초플랜 {bucket.plan}",
            f"이월 {bucket.carry}",
            f"표기합계 {bucket.printed}",
        ]
        if bucket.change:
            lines.append("===PLANCHANGE===\n변경일|이전|이후\n" + f"{bucket.change[0]}|{bucket.plan}|{bucket.change[1]}\n===END PLANCHANGE===")
        usage = [f"{row.id}|{row.name}|{bucket.code}|{row.date}|{row.kind}|{row.amount}|{row.memo}" for row in bucket.rows]
        lines.append("===USAGE===\n" + table("사번|성명|부서|사용일|기능|크레딧|메모", usage) + "\n===END USAGE===")
        fixes = [f"{fix.action}|{fix.id}|{fix.date}|{fix.kind}|{fix.amount}|{fix.new}" for fix in bucket.fixes]
        if fixes:
            lines.append("===FIXES===\n" + table("처리|사번|사용일|기능|크레딧|새값", fixes) + "\n===END FIXES===")
        lines.append(memo_block(bucket.title, 64))
        files.append(
            file_pdf(
                f"team-{bucket.code.lower()}",
                f"02_팀별_사용현황/{bucket.code}_{bucket.title}.pdf",
                f"{bucket.title} 사용 현황",
                "\n".join(lines),
                "서림클라우드",
                "팀 사용 현황",
                f"exam-media/seorim-gpu-audit/teams/{bucket.code}.pdf",
            )
        )
    questions = [
        ("q1", 1, "청구 크레딧이 허용량보다 큰 팀 코드를 오름차순으로 쓰세요. 쉼표로 구분하고 공백은 넣지 않습니다.", answers["q1"], "초과 팀만 고른다. 허용량과 같으면 빼며, 월말 플랜의 단가로 요금을 매기기 전에 팀 코드만 모은다."),
        ("q2", 2, "금지 기능을 한 번이라도 청구 행에서 쓴 사번을 오름차순으로 쓰세요. 쉼표로 구분하고 공백은 넣지 않습니다. 이름이 같아도 사번이 다르면 따로 둡니다.", answers["q2"], "사용일에 적용된 플랜의 허용기능에 없는 기능만 금지다."),
        ("q3", 3, "사용일 상태가 퇴사인 사용 행은 몇 건인가. 숫자만 쓰세요.", answers["q3"], "건수는 크레딧 합이 아니라 남은 행 수다. 발효일 전 행은 퇴사로 세지 않는다."),
        ("q4", 4, "모든 팀의 초과 요금을 더한 금액은 얼마인가. 원 단위 숫자만 쓰세요.", answers["q4"], "팀마다 초과 크레딧에 월말 플랜의 초과단가를 곱한 뒤 더한다."),
    ]
    return bundle(
        "seorim-gpu-audit",
        "서림클라우드 GPU 크레딧 감사",
        "크레딧 정산",
        "서림클라우드의 2026년 3월 GPU 크레딧을 감사한다. 요금제, 명부, 팀별 사용 파일이 나뉘어 있고 한 번에 붙이면 글자 한도를 넘는다. 표기합계는 쓰지 않는다.",
        files,
        questions,
    )


def build_warehouse() -> dict:
    titles = ["서울", "인천", "수원", "대전", "세종", "청주", "광주", "대구", "부산", "울산", "창원", "제주"]
    groups = [(f"W{index:02d}", title) for index, title in enumerate(titles, start=1)]
    people = make_people("P", groups, "판매중", "단종", "회수", 22, "2026-04-01")
    by_group: dict[str, list[Person]] = {}
    for person in people:
        by_group.setdefault(person.group, []).append(person)
    buckets = [Bucket(code=code, title=title, opening=80 + index * 5) for index, (code, title) in enumerate(groups)]
    dates = ["2026-04-02", "2026-04-07", "2026-04-14", "2026-04-18", "2026-04-24", "2026-04-28"]
    for bucket in buckets:
        members = [person for person in by_group[bucket.code] if person.status == "판매중" and person.effective == "2026-01-01"]
        for index, person in enumerate(members[:6]):
            bucket.rows.append(Row(person.id, person.name, bucket.code, dates[index % len(dates)], "입고", 25, "정기"))
            bucket.rows.append(Row(person.id, person.name, bucket.code, dates[(index + 1) % len(dates)], "출고", 10, "정기"))
        host = members[0]
        first = bucket.rows[0]
        bucket.rows.append(Row(first.id, first.name, first.group, first.date, first.kind, first.amount, first.memo))
        bucket.rows.append(Row(host.id, host.name, bucket.code, "2026-03-20", "출고", 700, "제외"))
        stopper = next(person for person in by_group[bucket.code] if person.effective == "2026-04-15")
        bucket.rows.append(Row(stopper.id, stopper.name, bucket.code, "2026-04-14", "출고", 12, "단종전"))
        bucket.rows.append(Row(stopper.id, stopper.name, bucket.code, "2026-04-16", "출고", 40, "단종후"))
        recalled = next(person for person in by_group[bucket.code] if person.status == "회수")
        bucket.rows.append(Row(recalled.id, recalled.name, bucket.code, "2026-04-18", "출고", 7, "회수"))
        target = bucket.rows[1]
        bucket.fixes.append(Fix("정정", target.id, target.date, target.kind, target.amount, 4))
        cancel = next(row for row in bucket.rows if row.kind == "출고" and row.memo == "정기")
        bucket.fixes.append(Fix("취소", cancel.id, cancel.date, cancel.kind, cancel.amount, 0))
    for index, bucket in enumerate(buckets):
        other = buckets[(index + 1) % len(buckets)]
        person = by_group[other.code][0]
        bucket.rows.append(Row(person.id, person.name, bucket.code, "2026-04-24", "출고", 3000, "오배정"))
    people_map = {person.id: person for person in people}

    def bump(code: str, amount: int) -> None:
        bucket = next(item for item in buckets if item.code == code)
        person = next(person for person in by_group[code] if person.status == "판매중" and person.effective == "2026-01-01")
        bucket.rows.append(Row(person.id, person.name, code, "2026-04-28", "출고", amount + len(bucket.rows), "추가"))

    for _ in range(16):
        scored = score_warehouse(people_map, buckets)
        short = set(scored["q1"].split(","))
        if len(short) >= 3 and len(short) <= 7:
            break
        pending = next((bucket.code for bucket in buckets if bucket.code not in short), None)
        if pending is None:
            break
        bump(pending, 200)
    else:
        raise SystemExit(f"창고 조정 실패 {score_warehouse(people_map, buckets)}")
    for bucket in buckets:
        bucket.printed = raw_printed(bucket)
    answers = score_warehouse(people_map, buckets)
    if int(answers["q3"]) < 2 or int(answers["q4"]) <= 0:
        raise SystemExit(f"창고 답 부족 {answers}")
    if score_warehouse(people_map, buckets, home=False)["q4"] == answers["q4"]:
        raise SystemExit("창고 오배정을 넣으면 부족 수량이 달라져야 한다")
    return pack_warehouse(people, buckets, answers)


def pack_warehouse(people: list[Person], buckets: list[Bucket], answers: dict[str, str]) -> dict:
    policy = "\n".join(
        [
            "달빛물류 다창고 입출고 규정.",
            "기간 2026-04-01 2026-04-30",
            "일수 30",
            "제1조 기간. 일자가 2026-04-01보다 전이거나 2026-04-30보다 뒤면 그 행은 버린다.",
            "제2조 상태. 품목 대장의 상태가 판매중일 때만 입고와 출고가 재고에 반영된다. 단종인 날의 출고는 재고에서 빼지 않고 단종 후 출고로만 센다. 회수인 날의 출고도 재고에서 빼지 않고 건수만 센다. 발효일이 2026-04-01 이전이거나 같으면 4월 전체가 그 상태다. 발효일이 2026-04-30보다 뒤면 4월 전체는 판매중이다. 발효일이 4월 안이면 발효일 전날은 판매중이고 발효일부터 적힌 상태다. 예외가 명시되지 않은 한 발효일 이전은 판매중으로 본다.",
            "제3조 소속. 품목의 대장 창고와 전표 파일의 창고코드가 같을 때만 본다. 다른 창고 파일에 섞인 행은 어느 창고에도 넣지 않는다.",
            "제4조 중복. 같은 파일에서 품목, 일자, 구분, 수량이 모두 같은 행이 여러 번이면 아래쪽 행만 남긴다.",
            "제5조 정정. 취소는 그 행을 지우고, 정정은 수량을 새 값으로 바꾼다. 표 아래 기록을 따른다.",
            "제6조 기말. 기말 수량은 기초 더하기 판매중 입고 빼기 판매중 출고다. 기초는 파일 머리의 기초 값만 쓴다. 표기합계와 소계 건수는 사용하지 않는다. 기말이 0보다 작으면 부족 창고다. 같으면 부족이 아니다. 품명이 같아도 품목 코드가 다르면 다른 품목이다.",
            "",
        ]
    )
    roster_rows = [f"{person.id}|{person.name}|{person.group}|{person.status}|{person.effective}" for person in sorted(people, key=lambda item: item.name)]
    roster = "달빛물류 품목 대장. 품명 순이며 창고로 묶여 있지 않다.\n\n===ROSTER===\n" + table("품목|품명|창고|상태|발효일", roster_rows) + "\n===END ROSTER===\n" + memo_block("품목", 4)
    files = [file_pdf("policy", "01_입출고_규정.pdf", "입출고 규정", policy, "달빛물류", "다창고 입출고", "exam-media/dalbit-warehouse-audit/01_policy.pdf")]
    files.append(file_pdf("roster", "03_품목_마스터.pdf", "품목 대장", roster, "달빛물류", "품목 대장", "exam-media/dalbit-warehouse-audit/03_items.pdf"))
    for bucket in buckets:
        slips = [f"{row.id}|{row.name}|{bucket.code}|{row.date}|{row.kind}|{row.amount}|{row.memo}" for row in bucket.rows]
        fixes = [f"{fix.action}|{fix.id}|{fix.date}|{fix.kind}|{fix.amount}|{fix.new}" for fix in bucket.fixes]
        body = "\n".join(
            [
                f"달빛물류 창고 전표. 창고코드 {bucket.code}. 창고명 {bucket.title}.",
                f"기초 {bucket.opening}",
                f"표기합계 {bucket.printed}",
                "===SLIPS===\n" + table("품목|품명|창고|일자|구분|수량|메모", slips) + "\n===END SLIPS===",
                "===FIXES===\n" + table("처리|품목|일자|구분|수량|새값", fixes) + "\n===END FIXES===",
                memo_block(bucket.title, 64),
            ]
        )
        files.append(
            file_pdf(
                f"wh-{bucket.code.lower()}",
                f"02_창고별_전표/{bucket.code}_{bucket.title}.pdf",
                f"{bucket.title} 전표",
                body,
                "달빛물류",
                "창고 전표",
                f"exam-media/dalbit-warehouse-audit/warehouses/{bucket.code}.pdf",
            )
        )
    questions = [
        ("q1", 1, "기말 수량이 0보다 작은 창고 코드를 오름차순으로 쓰세요. 쉼표로 구분하고 공백은 넣지 않습니다.", answers["q1"], "기초와 판매중 입출고만 더한다."),
        ("q2", 2, "단종 상태인 날에 출고가 남은 품목 코드를 오름차순으로 쓰세요. 쉼표로 구분하고 공백은 넣지 않습니다.", answers["q2"], "판매중으로 재고에 반영된 출고는 빼지 않는다. 품명이 같아도 코드가 다르면 따로 둔다."),
        ("q3", 3, "회수 상태인 날의 출고 행은 몇 건인가. 숫자만 쓰세요.", answers["q3"], "재고에는 반영하지 않고 건수만 센다."),
        ("q4", 4, "부족 창고의 부족 수량을 모두 더한 값은 얼마인가. 숫자만 쓰세요. 기말이 -5이면 부족 수량은 5다.", answers["q4"], "음수 기말의 절대값을 창고마다 더한 값이다."),
    ]
    return bundle(
        "dalbit-warehouse-audit",
        "달빛물류 다창고 입출고 대사",
        "재고 대사",
        "달빛물류의 2026년 4월 창고 입출고를 대사한다. 규정, 품목 대장, 창고 전표가 나뉘어 있고 한 번에 붙이면 글자 한도를 넘는다. 표기합계는 쓰지 않는다.",
        files,
        questions,
    )


def build_hr() -> dict:
    titles = ["영업", "마케팅", "개발", "디자인", "인사", "재무", "물류", "고객", "법무", "전략", "품질", "교육"]
    groups = [(f"D{index:02d}", title) for index, title in enumerate(titles, start=1)]
    people = make_people("H", groups, "재직", "퇴사", "휴직", 33, "2026-05-01")
    # 부서마다 수습 한 명
    by_group: dict[str, list[Person]] = {}
    for person in people:
        by_group.setdefault(person.group, []).append(person)
    for members in by_group.values():
        trainee = next(person for person in members if person.role == "사원" and person.status == "재직" and person.effective == "2026-01-01")
        trainee.status = "수습"
        trainee.effective = "2026-01-01"
    buckets = [Bucket(code=code, title=title) for code, title in groups]
    courses = ["SEC", "ETH", "SAF"]
    for bucket in buckets:
        members = by_group[bucket.code]
        actives = [person for person in members if person.effective == "2026-01-01" and person.status in {"재직", "수습"}]
        for index, person in enumerate(actives[:7]):
            need = 60 if person.status == "재직" else 40
            if person.role == "팀장":
                bucket.rows.append(Row(person.id, person.name, bucket.code, "2026-05-04", "SEC", 60, "이수"))
                bucket.rows.append(Row(person.id, person.name, bucket.code, "2026-05-06", "LDR", 20, "리더"))
            elif person.status == "수습":
                bucket.rows.append(Row(person.id, person.name, bucket.code, "2026-05-04", "ETH", 40, "이수"))
                bucket.rows.append(Row(person.id, person.name, bucket.code, "2026-05-05", "SEC", 20 if index % 2 == 0 else 60, "이수"))
                if index % 2 == 1:
                    bucket.rows.append(Row(person.id, person.name, bucket.code, "2026-05-07", "SAF", 30, "이수"))
            else:
                bucket.rows.append(Row(person.id, person.name, bucket.code, "2026-05-08", "SEC", need if index % 3 else 15, "이수"))
            if index == 3:
                bucket.rows.append(Row(person.id, person.name, bucket.code, "2026-05-11", "LDR", 20, "비팀장"))
        short = next(row for row in bucket.rows if row.kind == "SEC" and row.amount == 15)
        bucket.rows.append(Row(short.id, short.name, short.group, short.date, short.kind, short.amount, short.memo))
        leaver = next(person for person in members if person.effective == "2026-05-15")
        bucket.rows.append(Row(leaver.id, leaver.name, bucket.code, "2026-05-14", "SEC", 30, "퇴사전"))
        bucket.rows.append(Row(leaver.id, leaver.name, bucket.code, "2026-05-16", "SEC", 30, "퇴사후"))
        bucket.rows.append(Row(actives[0].id, actives[0].name, bucket.code, "2026-04-20", "SEC", 500, "제외"))
        target = bucket.rows[1]
        bucket.fixes.append(Fix("정정", target.id, target.date, target.kind, target.amount, max(1, target.amount - 5)))
    for index, bucket in enumerate(buckets):
        other = buckets[(index + 1) % len(buckets)]
        person = next(person for person in by_group[other.code] if person.effective == "2026-12-01")
        bucket.rows.append(Row(person.id, person.name, bucket.code, "2026-05-21", "SEC", 80, "오배정"))
    for bucket in buckets:
        bucket.printed = raw_printed(bucket)
    people_map = {person.id: person for person in people}
    answers = score_hr(people_map, buckets)
    if answers["q1"].count(",") < 2 or int(answers["q4"]) <= 0:
        raise SystemExit(f"인사 답 부족 {answers}")
    if score_hr(people_map, buckets, home=False)["q4"] == answers["q4"]:
        raise SystemExit("인사 오배정을 넣으면 부족 시간이 달라져야 한다")
    return pack_hr(people, buckets, answers)


def pack_hr(people: list[Person], buckets: list[Bucket], answers: dict[str, str]) -> dict:
    catalog = table(
        "코드|과정|이수시간|대상",
        ["ETH|윤리|40|수습", "SEC|보안|60|재직,수습", "SAF|안전|30|수습", "LDR|리더|20|팀장"],
    )
    policy = "\n".join(
        [
            "별무리커머스 교육 이수 규정.",
            "기간 2026-05-01 2026-05-31",
            "일수 31",
            "제1조 기간. 일자가 2026-05-01보다 전이거나 2026-05-31보다 뒤면 그 행은 버린다.",
            "제2조 상태. 발효일이 2026-05-01 이전이거나 같으면 5월 전체가 그 상태다. 발효일이 2026-05-31보다 뒤면 5월 전체는 재직이다. 발효일이 5월 안이면 발효일 전날은 재직이고 발효일부터 적힌 상태다. 예외가 명시되지 않은 한 발효일 이전은 재직으로 본다.",
            "제3조 인정. 사용일 상태가 재직이거나 수습인 행의 시간만 이수 시간으로 더한다. 휴직과 퇴사 행은 이수 시간에서 뺀다. 사번의 명부 부서와 같은 부서 파일의 행만 본다. 다른 부서 파일에 섞인 행은 넣지 않는다.",
            "제4조 의무. 5월 31일 상태가 재직이면 보안 60시간이 필요하다. 수습이면 윤리 40, 보안 60, 안전 30이 필요하다. 휴직과 퇴사는 이수 의무가 없다. 예외가 명시되지 않은 한 직책은 이수 의무와 무관하다. 다만 직책이 팀장이고 5월 31일 상태가 재직이거나 수습이면 리더 20시간이 더 필요하다.",
            "제5조 리더. 리더 과정은 팀장만 이수 시간으로 인정할 수 있다. 팀장이 아닌 사람의 재직 또는 수습 리더 시간은 금지 이수다. 의무 계산에는 넣지 않는다.",
            "제6조 중복. 같은 파일에서 사번, 일자, 과정, 시간이 모두 같은 행이 여러 번이면 아래쪽 행만 남긴다.",
            "제7조 정정. 취소는 그 행을 지우고 정정은 시간을 새 값으로 바꾼다.",
            "제8조 소계. 표기합계와 소계 건수는 사용하지 않는다. 이름이 같아도 사번이 다르면 다른 사람이다.",
            "",
            "===CATALOG===",
            catalog,
            "===END CATALOG===",
        ]
    )
    roster_rows = [f"{person.id}|{person.name}|{person.group}|{person.role}|{person.status}|{person.effective}" for person in sorted(people, key=lambda item: item.name)]
    roster = "별무리커머스 임직원 명부. 성명 순이며 부서로 묶여 있지 않다.\n\n===ROSTER===\n" + table("사번|성명|부서|직책|상태|발효일", roster_rows) + "\n===END ROSTER===\n" + memo_block("명부", 4)
    files = [file_pdf("policy", "01_이수_규정.pdf", "이수 규정", policy, "별무리커머스", "교육 이수 감사", "exam-media/byeol-training-audit/01_policy.pdf")]
    files.append(file_pdf("roster", "03_임직원_명부.pdf", "임직원 명부", roster, "별무리커머스", "임직원 명부", "exam-media/byeol-training-audit/03_roster.pdf"))
    for bucket in buckets:
        rows = [f"{row.id}|{row.name}|{bucket.code}|{row.date}|{row.kind}|{row.amount}|{row.memo}" for row in bucket.rows]
        fixes = [f"{fix.action}|{fix.id}|{fix.date}|{fix.kind}|{fix.amount}|{fix.new}" for fix in bucket.fixes]
        body = "\n".join(
            [
                f"별무리커머스 부서 수강 기록. 부서코드 {bucket.code}. 부서명 {bucket.title}.",
                f"표기합계 {bucket.printed}",
                "===COURSES===\n" + table("사번|성명|부서|일자|과정|시간|메모", rows) + "\n===END COURSES===",
                "===FIXES===\n" + table("처리|사번|일자|과정|시간|새값", fixes) + "\n===END FIXES===",
                memo_block(bucket.title, 64),
            ]
        )
        files.append(
            file_pdf(
                f"dept-{bucket.code.lower()}",
                f"02_부서별_수강/{bucket.code}_{bucket.title}.pdf",
                f"{bucket.title} 수강 기록",
                body,
                "별무리커머스",
                "수강 기록",
                f"exam-media/byeol-training-audit/depts/{bucket.code}.pdf",
            )
        )
    questions = [
        ("q1", 1, "5월 31일 기준으로 이수 의무가 있는데 필요한 시간이 부족한 사번을 오름차순으로 쓰세요. 쉼표로 구분하고 공백은 넣지 않습니다.", answers["q1"], "월말 상태와 팀장 여부만 의무를 정한다. 인정 시간은 그날의 상태가 재직이거나 수습인 행만 더한다."),
        ("q2", 2, "팀장이 아닌데 리더 과정 시간이 인정된 사번을 오름차순으로 쓰세요. 쉼표로 구분하고 공백은 넣지 않습니다.", answers["q2"], "재직 또는 수습인 날의 리더 시간만 인정 여부 판단에 쓴다."),
        ("q3", 3, "사용일 상태가 퇴사인 수강 행은 몇 건인가. 숫자만 쓰세요.", answers["q3"], "이수 시간에서는 빠지지만 건수로는 센다."),
        ("q4", 4, "부족한 이수 시간을 사람마다 과정마다 더하면 얼마인가. 숫자만 쓰세요.", answers["q4"], "의무가 없는 사람과 이미 채운 과정은 0이다."),
    ]
    return bundle(
        "byeol-training-audit",
        "별무리커머스 교육 이수 감사",
        "인사 감사",
        "별무리커머스의 2026년 5월 교육 이수를 감사한다. 이수 규정, 명부, 부서별 수강 기록이 나뉘어 있고 한 번에 붙이면 글자 한도를 넘는다. 표기합계는 쓰지 않는다.",
        files,
        questions,
    )


def build_equip() -> dict:
    titles = ["본사", "제1공장", "제2공장", "물류센터", "연구소", "남부지점", "북부지점", "서부창고", "동부창고", "고객센터", "데이터센터", "연수원"]
    groups = [(f"B{index:02d}", title) for index, title in enumerate(titles, start=1)]
    people = make_people("A", groups, "가동", "폐기", "수리", 44, "2026-06-01")
    by_group: dict[str, list[Person]] = {}
    for person in people:
        by_group.setdefault(person.group, []).append(person)
    buckets = [Bucket(code=code, title=title) for code, title in groups]
    dates = ["2026-06-02", "2026-06-08", "2026-06-14", "2026-06-18", "2026-06-22", "2026-06-28"]
    for index, bucket in enumerate(buckets):
        members = [person for person in by_group[bucket.code] if person.status == "가동" and person.effective == "2026-01-01"]
        for offset, person in enumerate(members[:6]):
            bucket.rows.append(Row(person.id, person.name, bucket.code, dates[offset % len(dates)], "양호", 0, "정기"))
            if offset == 0 and index < 5:
                bucket.rows.append(Row(person.id, person.name, bucket.code, "2026-06-19", "불량", 3, "고장"))
            elif offset == 1 and index >= 5:
                bucket.rows.append(Row(person.id, person.name, bucket.code, "2026-06-20", "불량", 1, "고장"))
                bucket.rows.append(Row(person.id, person.name, bucket.code, "2026-06-21", "양호", 0, "재검"))
        # 양호 없이 불량만
        lonely = members[6]
        if index % 2 == 0:
            bucket.rows.append(Row(lonely.id, lonely.name, bucket.code, "2026-06-25", "불량", 2, "미재검"))
        first = bucket.rows[0]
        bucket.rows.append(Row(first.id, first.name, first.group, first.date, first.kind, first.amount, first.memo))
        retired = next(person for person in by_group[bucket.code] if person.effective == "2026-06-15")
        bucket.rows.append(Row(retired.id, retired.name, bucket.code, "2026-06-14", "불량", 4, "폐기후전"))
        bucket.rows.append(Row(retired.id, retired.name, bucket.code, "2026-06-16", "불량", 4, "폐기후"))
        bucket.rows.append(Row(members[0].id, members[0].name, bucket.code, "2026-05-20", "불량", 9, "제외"))
        bad = next((row for row in bucket.rows if row.kind == "불량" and row.memo == "고장"), None)
        if bad:
            bucket.fixes.append(Fix("정정", bad.id, bad.date, bad.kind, bad.amount, 1))
    for index, bucket in enumerate(buckets):
        other = buckets[(index + 1) % len(buckets)]
        person = by_group[other.code][0]
        bucket.rows.append(Row(person.id, person.name, bucket.code, "2026-06-22", "불량", 12, "오배정"))
    for bucket in buckets:
        bucket.printed = raw_printed(bucket)
    people_map = {person.id: person for person in people}
    answers = score_equip(people_map, buckets)
    if answers["q1"].count(",") < 1 or int(answers["q3"]) < 2 or int(answers["q4"]) <= 0:
        raise SystemExit(f"장비 답 부족 {answers}")
    if score_equip(people_map, buckets, home=False)["q4"] == answers["q4"]:
        raise SystemExit("장비 오배정을 넣으면 비용이 달라져야 한다")
    return pack_equip(people, buckets, answers)


def pack_equip(people: list[Person], buckets: list[Bucket], answers: dict[str, str]) -> dict:
    policy = "\n".join(
        [
            "푸른길설비 장비 점검 규정.",
            "기간 2026-06-01 2026-06-30",
            "일수 30",
            "단가 8000",
            "제1조 기간. 일자가 2026-06-01보다 전이거나 2026-06-30보다 뒤면 그 행은 버린다.",
            "제2조 상태. 발효일이 2026-06-01 이전이거나 같으면 6월 전체가 그 상태다. 발효일이 2026-06-30보다 뒤면 6월 전체는 가동이다. 발효일이 6월 안이면 발효일 전날은 가동이고 발효일부터 적힌 상태다. 예외가 명시되지 않은 한 발효일 이전은 가동으로 본다. 점검 수량과 양호 건수는 사용일 상태가 가동일 때만 센다. 폐기인 날의 행은 수량에서 빼고 폐기 후 점검 건수로만 센다. 수리인 날의 행은 어느 합계에도 넣지 않는다.",
            "제3조 소속. 자산의 대장 사업장과 점검 파일의 사업장 코드가 같을 때만 본다. 다른 사업장 파일에 섞인 행은 넣지 않는다.",
            "제4조 결과. 불량 행은 수량을 더한다. 양호 행은 수량과 상관없이 양호 1건으로만 센다. 불량 수량이 0이면 불량 합계에 더하지 않는다.",
            "제5조 중복. 같은 파일에서 자산, 일자, 결과, 수량이 모두 같은 행이 여러 번이면 아래쪽 행만 남긴다.",
            "제6조 정정. 취소는 그 행을 지우고 정정은 수량을 새 값으로 바꾼다. 결과는 바꾸지 않는다.",
            "제7조 비용. 불량 사업장은 가동 중 불량 수량이 가동 중 양호 건수보다 큰 사업장이다. 같으면 포함하지 않는다. 총 비용은 모든 사업장의 가동 중 불량 수량을 더한 뒤 단가 8000을 곱한다. 표기합계와 소계 건수는 사용하지 않는다. 장비명이 같아도 자산 코드가 다르면 다른 장비다.",
            "",
        ]
    )
    roster_rows = [f"{person.id}|{person.name}|{person.group}|{person.status}|{person.effective}" for person in sorted(people, key=lambda item: item.name)]
    roster = "푸른길설비 장비 대장. 장비명 순이며 사업장으로 묶여 있지 않다.\n\n===ROSTER===\n" + table("자산|장비명|사업장|상태|발효일", roster_rows) + "\n===END ROSTER===\n" + memo_block("대장", 4)
    files = [file_pdf("policy", "01_점검_규정.pdf", "점검 규정", policy, "푸른길설비", "장비 점검", "exam-media/pureun-inspect-audit/01_policy.pdf")]
    files.append(file_pdf("roster", "03_장비_대장.pdf", "장비 대장", roster, "푸른길설비", "장비 대장", "exam-media/pureun-inspect-audit/03_assets.pdf"))
    for bucket in buckets:
        rows = [f"{row.id}|{row.name}|{bucket.code}|{row.date}|{row.kind}|{row.amount}|{row.memo}" for row in bucket.rows]
        fixes = [f"{fix.action}|{fix.id}|{fix.date}|{fix.kind}|{fix.amount}|{fix.new}" for fix in bucket.fixes]
        chunks = [
            f"푸른길설비 사업장 점검 기록. 사업장코드 {bucket.code}. 사업장명 {bucket.title}.",
            f"표기합계 {bucket.printed}",
            "===CHECKS===\n" + table("자산|장비명|사업장|일자|결과|수량|메모", rows) + "\n===END CHECKS===",
        ]
        if fixes:
            chunks.append("===FIXES===\n" + table("처리|자산|일자|결과|수량|새값", fixes) + "\n===END FIXES===")
        chunks.append(memo_block(bucket.title, 64))
        files.append(
            file_pdf(
                f"site-{bucket.code.lower()}",
                f"02_사업장별_점검/{bucket.code}_{bucket.title}.pdf",
                f"{bucket.title} 점검 기록",
                "\n".join(chunks),
                "푸른길설비",
                "점검 기록",
                f"exam-media/pureun-inspect-audit/sites/{bucket.code}.pdf",
            )
        )
    questions = [
        ("q1", 1, "가동 중 불량 수량이 가동 중 양호 건수보다 큰 사업장 코드를 오름차순으로 쓰세요. 쉼표로 구분하고 공백은 넣지 않습니다.", answers["q1"], "양호는 건수이고 불량은 수량의 합이다."),
        ("q2", 2, "가동 중 불량 수량이 1 이상이고 가동 중 양호 점검이 한 건도 없는 자산 코드를 오름차순으로 쓰세요. 쉼표로 구분하고 공백은 넣지 않습니다.", answers["q2"], "폐기와 수리 날의 점검은 이 조건에 넣지 않는다."),
        ("q3", 3, "사용일 상태가 폐기인 점검 행은 몇 건인가. 숫자만 쓰세요.", answers["q3"], "비용에서는 빠지지만 건수로는 센다."),
        ("q4", 4, "모든 사업장의 가동 중 불량 수량에 단가 8000원을 곱한 총 비용은 얼마인가. 숫자만 쓰세요.", answers["q4"], "양호 행의 수량은 비용에 넣지 않는다."),
    ]
    return bundle(
        "pureun-inspect-audit",
        "푸른길설비 장비 점검 이력",
        "장비 점검",
        "푸른길설비의 2026년 6월 장비 점검을 감사한다. 점검 규정, 장비 대장, 사업장별 기록이 나뉘어 있고 한 번에 붙이면 글자 한도를 넘는다. 표기합계는 쓰지 않는다.",
        files,
        questions,
    )


def file_pdf(file_id: str, name: str, title: str, content: str, issuer: str, scope: str, media: str) -> dict:
    target = PUBLIC / media
    render_official_pdf(target, title, content, name, issuer, scope)
    return {"id": file_id, "name": name, "kind": "pdf", "media": media, "content": content, "_title": title}


def bundle(set_id: str, title: str, category: str, passage: str, files: list[dict], questions: list[tuple[str, int, str, str, str]]) -> dict:
    clean_files = []
    for item in files:
        clean = {key: value for key, value in item.items() if key != "_title"}
        clean_files.append(clean)
    return {
        "id": set_id,
        "title": title,
        "category": category,
        "difficulty": "어려움",
        "timeLimitMin": 25,
        "passage": passage,
        "files": clean_files,
        "questions": [
            {"id": qid, "number": number, "type": "short", "prompt": prompt, "answer": answer, "explanation": explain(note)}
            for qid, number, prompt, answer, note in questions
        ],
    }


def assert_shape(payload: dict) -> None:
    files = payload["files"]
    total = sum(len(item["content"]) for item in files)
    core = len(files[0]["content"]) + len(files[1]["content"])
    groups = sorted(len(item["content"]) for item in files[2:])
    if total <= 35000:
        raise SystemExit(f"{payload['id']} 총 글자 {total}")
    if not (150 <= payload["files"][1]["content"].count("\n") ):
        pass
    if core + groups[0] + groups[1] >= 20000:
        raise SystemExit(f"{payload['id']} 핵심+2파일이 한도에 들어가야 한다 {core + groups[0] + groups[1]} core={core} groups={groups[:4]}")
    if core + sum(groups[:4]) <= 20000:
        raise SystemExit(f"{payload['id']} 핵심+4파일이 한도를 넘어야 한다 {core + sum(groups[:4])} core={core} groups={groups[:4]}")
    if len(files) != 14:
        raise SystemExit(f"{payload['id']} 파일 수 {len(files)}")
    if payload["difficulty"] != "어려움" or payload["timeLimitMin"] != 25:
        raise SystemExit("난이도 또는 제한 시간")
    if len(payload["questions"]) != 4:
        raise SystemExit("문항 수")
    print(
        payload["id"],
        "total",
        total,
        "core",
        core,
        "two",
        core + groups[0] + groups[1],
        "four",
        core + sum(groups[:4]),
        "answers",
        [question["answer"] for question in payload["questions"]],
    )


def main() -> None:
    builders = [build_gpu, build_warehouse, build_hr, build_equip]
    for builder in builders:
        payload = builder()
        assert_shape(payload)
        path = DATA / f"{payload['id']}.json"
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("wrote", path.name)


if __name__ == "__main__":
    main()
