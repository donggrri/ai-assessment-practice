"""청솔연구재단 연구과제 예산 집행 감사 (어려움)."""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field

from .common import block, bundle, explain, join_codes, memo_block, pdf_file

SET_ID = "cheongsol-budget-audit"
ISSUER = "청솔연구재단"
START, END = "2026-01-01", "2026-06-30"

LIMITS = {"MAT": 3_000_000, "EQP": 8_000_000, "TRV": 1_500_000, "MTG": 300_000, "OUT": 6_000_000, "ENT": 500_000}
CATEGORY_NAMES = {"MAT": "재료비", "EQP": "장비비", "TRV": "출장비", "MTG": "회의비", "OUT": "외주용역비", "ENT": "접대비"}
FX = {
    "01": {"USD": 1382, "EUR": 1494, "JPY": 903},
    "02": {"USD": 1371, "EUR": 1488, "JPY": 911},
    "03": {"USD": 1366, "EUR": 1479, "JPY": 917},
    "04": {"USD": 1359, "EUR": 1471, "JPY": 922},
    "05": {"USD": 1348, "EUR": 1463, "JPY": 930},
    "06": {"USD": 1342, "EUR": 1455, "JPY": 936},
}
UNIT = {"USD": 1, "EUR": 1, "JPY": 100}
EVIDENCE = ["세금계산서", "카드전표", "영수증", "계약서"]

PROJECTS = [
    ("P01", "저전력 메모리 소재", "김서윤", "진행", "2026-01-01", "N"),
    ("P02", "차세대 패키징 접합", "이도현", "중단", "2026-03-10", "N"),
    ("P03", "공정 이상 예측 모델", "박지안", "진행", "2026-01-01", "N"),
    ("P04", "해외 공동연구 협력", "최하린", "진행", "2026-01-01", "Y"),
    ("P05", "고순도 가스 정제", "정우진", "중단", "2026-04-15", "N"),
    ("P06", "웨이퍼 세정 신기술", "강민서", "중단", "2026-06-30", "N"),
    ("P07", "열관리 시뮬레이션", "조예린", "진행", "2026-01-01", "N"),
    ("P08", "검사 장비 국산화", "윤시우", "중단", "2026-05-02", "N"),
    ("P09", "실증 라인 구축", "장아윤", "중단", "2026-07-01", "N"),
    ("P10", "소재 분석 플랫폼", "임준서", "진행", "2026-01-01", "N"),
]
# 합계가 총예산과 같은 과제, 총예산을 넘는 과제를 정한다. 나머지는 예산 안.
EXACT = {"P07"}
OVER = {"P02", "P04", "P06", "P09"}


@dataclass
class Voucher:
    vid: str
    kind: str
    orig: str
    date: str
    cat: str
    cur: str
    amount: int
    evid: str
    submitted: str


@dataclass
class Project:
    code: str
    title: str
    owner: str
    status: str
    effective: str
    entertain: str
    budget: int = 0
    vouchers: list[Voucher] = field(default_factory=list)
    printed: int = 0


def krw(amount: int, cur: str, month: str) -> int:
    if cur == "KRW":
        return amount
    return amount * FX[month][cur] // UNIT[cur]


def status_on(project: Project, day: str) -> str:
    if project.effective <= START:
        return project.status
    if project.effective > END:
        return "진행"
    if day < project.effective:
        return "진행"
    return project.status


def effective_vouchers(project: Project) -> list[tuple[Voucher, int]]:
    latest: dict[str, Voucher] = {}
    for item in project.vouchers:
        current = latest.get(item.vid)
        if current is None or item.submitted > current.submitted:
            latest[item.vid] = item
    rows = list(latest.values())
    cancelled = {item.orig for item in rows if item.kind == "취소"}
    fixed = {item.orig: item.amount for item in rows if item.kind == "정정"}
    out: list[tuple[Voucher, int]] = []
    for item in rows:
        if item.kind != "정상" or item.vid in cancelled:
            continue
        amount = fixed.get(item.vid, item.amount)
        if not (START <= item.date <= END):
            continue
        out.append((item, amount))
    return out


def violation(project: Project, item: Voucher, amount: int) -> bool:
    month = item.date[5:7]
    won = krw(amount, item.cur, month)
    if status_on(project, item.date) == "중단":
        return True
    if item.cat == "ENT":
        if project.entertain != "Y" or won > LIMITS["ENT"]:
            return True
    elif won > LIMITS[item.cat]:
        return True
    if item.evid == "없음" and won >= 50_000:
        return True
    return False


def missing_evidence(item: Voucher, amount: int) -> bool:
    return item.evid == "없음" and krw(amount, item.cur, item.date[5:7]) >= 50_000


def evaluate(projects: list[Project]) -> dict:
    out: dict = {"viol": {}, "total": {}, "viol_amount": {}, "evidence": {}}
    for project in projects:
        ids: list[str] = []
        evidence: list[str] = []
        total = 0
        vsum = 0
        for item, amount in effective_vouchers(project):
            won = krw(amount, item.cur, item.date[5:7])
            total += won
            if missing_evidence(item, amount):
                evidence.append(item.vid)
            if violation(project, item, amount):
                ids.append(item.vid)
                vsum += won
        out["viol"][project.code] = ids
        out["evidence"][project.code] = evidence
        out["total"][project.code] = total
        out["viol_amount"][project.code] = vsum
    return out


def answers_of(projects: list[Project], result: dict) -> dict[str, str]:
    q1 = ",".join(sorted(result["evidence"]["P03"] + result["evidence"]["P07"]))
    q2 = str(result["total"]["P10"])
    q3 = join_codes(project.code for project in projects if result["total"][project.code] > project.budget)
    q4 = str(sum(result["viol_amount"].values()))
    return {"q1": q1, "q2": q2, "q3": q3, "q4": q4}


def build_project(rng: random.Random, project: Project, index: int) -> None:
    seq = [0]
    used_dates: set[str] = set()

    def new_id() -> str:
        seq[0] += 1
        return f"V{index:02d}-{seq[0]:03d}"

    def day_in(month_from: int = 1, month_to: int = 6) -> str:
        month = rng.randrange(month_from, month_to + 1)
        last = 30 if month in (4, 6) else 28 if month == 2 else 31
        return f"2026-{month:02d}-{rng.randrange(1, last + 1):02d}"

    def submit(date: str, late_days: int | None = None) -> str:
        year, month, day = int(date[:4]), int(date[5:7]), int(date[8:10])
        day += late_days if late_days is not None else rng.randrange(1, 4)
        while day > 28:
            day -= 28
            month += 1
            if month > 12:
                month, year = 1, year + 1
        return f"{year}-{month:02d}-{day:02d} {rng.randrange(8, 19):02d}:{rng.randrange(0, 60):02d}"

    def add(date: str, cat: str, cur: str, amount: int, evid: str | None = None, kind: str = "정상", orig: str = "-", vid: str | None = None, late: int | None = None) -> Voucher:
        item = Voucher(vid or new_id(), kind, orig, date, cat, cur, amount, evid or rng.choice(EVIDENCE), submit(date, late))
        project.vouchers.append(item)
        used_dates.add(date)
        return item

    def safe_amount(cat: str, cur: str, month: str, fraction: float) -> int:
        limit = LIMITS[cat]
        if cur == "KRW":
            return max(1, int(limit * fraction) // 1000) * 1000
        rate, unit = FX[month][cur], UNIT[cur]
        value = int(limit * fraction * unit / rate)
        step = 1000 if cur == "JPY" else 10
        return max(step, value // step * step)

    def over_amount(cat: str, cur: str, month: str) -> int:
        limit = LIMITS[cat]
        if cur == "KRW":
            return limit + rng.randrange(1, 9) * 10_000
        rate, unit = FX[month][cur], UNIT[cur]
        value = math.ceil((limit + 1) * unit / rate) + rng.randrange(1, 4) * (1000 if cur == "JPY" else 10)
        step = 1000 if cur == "JPY" else 10
        return -(-value // step) * step

    normal_cats = ["MAT", "EQP", "TRV", "MTG", "OUT", "MTG", "TRV", "MAT"]
    for _ in range(32):
        cat = rng.choice(normal_cats)
        cur = "KRW"
        roll = rng.random()
        if roll < 0.2 and cat in {"TRV", "MAT", "EQP"}:
            cur = rng.choice(["USD", "EUR", "JPY"])
        date = day_in()
        evid = rng.choice(EVIDENCE)
        amount = safe_amount(cat, cur, date[5:7], rng.uniform(0.1, 0.85))
        if rng.random() < 0.1:
            evid, cur, amount = "없음", "KRW", rng.randrange(8, 40) * 1000
        add(date, cat, cur, amount, evid)

    # 한도 경계와 초과
    add(day_in(), "MTG", "KRW", LIMITS["MTG"])
    add(day_in(), "MTG", "KRW", LIMITS["MTG"] + 5_000)
    cur = rng.choice(["USD", "EUR"])
    date = day_in()
    add(date, "TRV", cur, over_amount("TRV", cur, date[5:7]))
    date = day_in()
    add(date, "OUT", "KRW", over_amount("OUT", "KRW", date[5:7]))
    # 증빙 경계
    add(day_in(), "MTG", "KRW", 49_000, "없음")
    add(day_in(), "MTG", "KRW", 50_000, "없음")
    add(day_in(), "MAT", "KRW", rng.randrange(60, 300) * 1000, "없음")
    # 접대비
    add(day_in(), "ENT", "KRW", rng.randrange(20, 45) * 10_000)
    if project.entertain == "Y":
        add(day_in(), "ENT", "KRW", 500_000)
        add(day_in(), "ENT", "KRW", 550_000)
    # 중단 경계
    if project.status == "중단" and START < project.effective <= END:
        month = int(project.effective[5:7])
        day = int(project.effective[8:10])
        prev = f"2026-{month:02d}-{day - 1:02d}" if day > 1 else f"2026-{month - 1:02d}-28"
        add(prev, "MAT", "KRW", rng.randrange(20, 90) * 10_000)
        add(project.effective, "MAT", "KRW", rng.randrange(20, 90) * 10_000)
        add(project.effective, "OUT", "KRW", rng.randrange(20, 90) * 10_000)
        add(day_in(month, 6) if month < 6 else project.effective, "TRV", "KRW", rng.randrange(20, 90) * 10_000)
    if project.status == "중단" and project.effective > END:
        add("2026-06-30", "MAT", "KRW", rng.randrange(20, 90) * 10_000)
        add("2026-07-02", "MAT", "KRW", 5_000_000)
        add("2026-07-15", "OUT", "KRW", 9_000_000)

    # 기간 밖
    add("2025-12-" + f"{rng.randrange(10, 31):02d}", "OUT", "KRW", 7_500_000)
    add("2025-12-31", "MAT", "KRW", 4_000_000)
    add("2026-07-01", "MTG", "KRW", 450_000)

    base = [item for item in project.vouchers if item.kind == "정상" and START <= item.date <= END]
    rng.shuffle(base)

    # 중복 제출. 먼저 낸 행은 값이 다르다.
    for item in base[:3]:
        older = Voucher(item.vid, item.kind, item.orig, item.date, item.cat, item.cur, item.amount, item.evid, item.submitted)
        if item.cat == "MTG" and item.cur == "KRW":
            older.amount = LIMITS["MTG"] + 60_000
        else:
            older.evid = "없음" if item.evid != "없음" else "영수증"
            older.amount = item.amount + 10_000 if item.cur == "KRW" else item.amount
        older.submitted = submit(item.date, 0)
        item.submitted = submit(item.date, 5)
        project.vouchers.append(older)

    # 취소 전표
    victims = [item for item in base[3:] if item.evid != "없음"]
    for item in victims[:2]:
        add(item.date, item.cat, item.cur, item.amount, item.evid, "취소", item.vid, late=3)
    over_rows = [item for item in project.vouchers if item.kind == "정상" and START <= item.date <= END and violation(project, item, item.amount) and item.vid not in {v.orig for v in project.vouchers}]
    if over_rows:
        pick = over_rows[0]
        add(pick.date, pick.cat, pick.cur, pick.amount, pick.evid, "취소", pick.vid, late=2)

    # 정정 전표
    targets = [item for item in base[6:] if item.cat in {"MTG", "TRV", "OUT"} and item.vid not in {v.orig for v in project.vouchers}]
    if targets:
        item = targets[0]
        if item.cat == "MTG" and item.cur == "KRW":
            new = LIMITS["MTG"] + 20_000 if item.amount <= LIMITS["MTG"] else 120_000
        else:
            new = safe_amount(item.cat, item.cur, item.date[5:7], 0.4) if item.amount > 0 else item.amount
        add(item.date, item.cat, item.cur, new, item.evid, "정정", item.vid, late=4)
    if len(targets) > 1:
        item = targets[1]
        over = over_amount(item.cat, item.cur, item.date[5:7])
        add(item.date, item.cat, item.cur, over, item.evid, "정정", item.vid, late=4)
    # 원전표가 없는 정정은 무시한다.
    add("2026-03-15", "MTG", "KRW", 999_000, "영수증", "정정", f"V{index:02d}-900", late=1)

    project.vouchers.sort(key=lambda item: (item.date, item.vid, item.submitted))
    rng.shuffle(project.vouchers)
    project.vouchers.sort(key=lambda item: item.date)
    raw = sum(item.amount for item in project.vouchers)
    project.printed = raw + 1_234_000


def build() -> dict:
    rng = random.Random(2026)
    projects = [Project(code, title, owner, status, eff, ent) for code, title, owner, status, eff, ent in PROJECTS]
    for index, project in enumerate(projects, start=1):
        build_project(rng, project, index)
    result = evaluate(projects)
    for project in projects:
        total = result["total"][project.code]
        unit = 1_000_000
        if project.code in EXACT:
            project.budget = total
        elif project.code in OVER:
            project.budget = max(unit, (total - rng.randrange(40, 400) * 1000) // 1000 * 1000)
        else:
            project.budget = (total + rng.randrange(300, 900) * 1000) // 1000 * 1000
    answers = answers_of(projects, result)
    if len(answers["q1"].split(",")) < 3 or answers["q3"].count(",") < 2:
        raise SystemExit(f"예산 정답 조정 필요 {answers}")

    expense_rows = [f"{code}|{CATEGORY_NAMES[code]}|{limit}|{'접대허용 Y 과제만' if code == 'ENT' else '-'}" for code, limit in LIMITS.items()]
    policy = "\n".join(
        [
            "청솔연구재단 연구과제 예산 집행 감사 규정.",
            f"기간 {START} {END}",
            "제1조 기간. 집행일이 2026-01-01보다 전이거나 2026-06-30보다 뒤인 전표는 버린다. 취소나 정정 전표의 집행일은 원전표를 따른다.",
            "제2조 중복. 같은 전표번호가 여러 번 제출되면 제출시각이 가장 늦은 행만 남긴다. 파일에서 몇 번째 줄인지는 상관없다.",
            "제3조 취소와 정정. 구분이 취소인 전표는 원전표를 없앤다. 구분이 정정인 전표는 원전표의 금액을 이 전표의 금액으로 바꾼다. 취소와 정정 전표 자체는 집행이 아니며 비목, 집행일, 통화, 증빙은 원전표를 따르고 전표번호도 원전표 번호로 본다. 같은 파일에 원전표가 없으면 그 전표는 무시한다. 중복을 정리한 뒤에 적용한다.",
            "제4조 환산. 외화 금액은 집행일이 속한 달의 환율로 원화로 바꾼다. 원화금액은 금액에 환율을 곱해 단위로 나눈 몫이며 소수점 이하는 버린다. 환율표의 단위가 100이면 환율은 100 단위당 원화다.",
            "제5조 중단. 과제 마스터의 상태가 중단이면 발효일 당일부터 집행할 수 없다. 발효일이 2026-01-01 이전이거나 같으면 상반기 전체가 그 상태다. 발효일이 2026-06-30보다 뒤면 상반기 전체는 진행이다. 예외가 명시되지 않은 한 발효일 이전은 진행으로 본다. 중단인 날의 집행은 위반이다.",
            "제6조 한도. 비목 기준표의 건당한도보다 원화금액이 크면 한도 초과이며 위반이다. 한도와 같으면 정상이다. 비목 ENT는 집행할 수 없다. 다만 과제 마스터의 접대허용이 Y인 과제는 ENT를 건당한도까지 집행할 수 있다.",
            "제7조 증빙. 증빙이 없음이고 원화금액이 50000원 이상이면 증빙 누락이며 위반이다. 50000원보다 작으면 증빙이 없어도 위반이 아니다.",
            "제8조 위반. 제1조부터 제4조까지 적용해 남은 전표만 판정한다. 기간 밖, 중복으로 버린 행, 취소된 전표는 위반으로 세지 않는다. 제5조부터 제7조까지 중 하나라도 해당하면 그 전표는 위반이다. 한 전표가 여러 조에 걸려도 1건이고 금액도 한 번만 센다.",
            "제9조 집행액. 과제의 집행액은 위반 여부와 상관없이 제1조부터 제4조까지 적용해 남은 전표의 원화금액 합이다. 집행액이 총예산보다 크면 예산 초과이고 같으면 초과가 아니다.",
            "제10조 소계. 파일 머리의 표기합계와 표 아래 소계 건수는 사용하지 않는다.",
            "",
            block("EXPENSE", "비목|비목명|건당한도|비고", expense_rows),
        ]
    )
    project_rows = [
        f"{item.code}|{item.title}|{item.owner}|{item.budget}|{item.status}|{item.effective}|{item.entertain}"
        for item in projects
    ]
    master = (
        "청솔연구재단 연구과제 마스터. 과제코드 순이다.\n\n"
        + block("PROJECTS", "과제코드|과제명|책임자|총예산|상태|발효일|접대허용", project_rows)
    )
    fx_rows = [f"2026-{month}|{cur}|{rate}|{UNIT[cur]}" for month, rates in FX.items() for cur, rate in rates.items()]
    fx = "청솔연구재단 월별 환율표. 집행일이 속한 달의 행을 쓴다.\n\n" + block("FX", "월|통화|환율|단위", fx_rows)
    files = [
        pdf_file(SET_ID, "policy", "01_예산집행_규정.pdf", "예산 집행 규정", policy, ISSUER, "예산 집행 감사", "01_policy.pdf"),
        pdf_file(SET_ID, "projects", "02_과제_마스터.pdf", "과제 마스터", master, ISSUER, "과제 마스터", "02_projects.pdf"),
        pdf_file(SET_ID, "fx", "03_월별_환율표.pdf", "월별 환율표", fx, ISSUER, "환율", "03_fx.pdf"),
    ]
    for project in projects:
        rows = [
            f"{item.vid}|{item.kind}|{item.orig}|{item.date}|{item.cat}|{item.cur}|{item.amount}|{item.evid}|{item.submitted}"
            for item in project.vouchers
        ]
        body = "\n".join(
            [
                f"청솔연구재단 과제 집행 전표. 과제코드 {project.code}. 과제명 {project.title}.",
                f"표기합계 {project.printed}",
                block("VOUCHERS", "전표번호|구분|원전표|집행일|비목|통화|금액|증빙|제출시각", rows),
                memo_block(
                    [
                        "이 문단은 현장 메모이며 표의 행이 아니다. 표기합계와 소계는 다시 더하지 않는다.",
                        f"{project.title} 과제 메모. 금액 칸은 전표에 적힌 통화의 금액이며 원화가 아닐 수 있다.",
                        "메모에 적힌 숫자는 예시이며 감사에 쓰지 않는다. 예: 지난 반기 위반 9건.",
                    ]
                ),
            ]
        )
        files.append(
            pdf_file(
                SET_ID,
                f"proj-{project.code.lower()}",
                f"04_과제별_전표/{project.code}_{project.title}.pdf",
                f"{project.title} 집행 전표",
                body,
                ISSUER,
                "과제 집행 전표",
                f"projects/{project.code}.pdf",
            )
        )

    mistakes = [
        "파일을 한꺼번에 붙여 글자 한도에 걸린다.",
        "외화 금액을 환산하지 않거나 집행일이 속한 달이 아닌 환율을 쓴다. JPY는 100 단위당이다.",
        "취소 전표와 정정 전표를 집행으로 센다. 원전표를 지우거나 금액을 바꿔야 한다.",
        "같은 전표번호의 다시 낸 행을 모두 센다. 제출시각이 가장 늦은 행만 남긴다.",
        "기간 밖 전표, 한도와 같은 금액, 50000원 미만 증빙 없음을 위반으로 센다.",
        "접대허용 과제의 ENT 예외를 놓치고, 중단 발효일 당일을 진행으로 본다.",
    ]
    strategy = "규정에서 기간, 중복, 취소·정정 순서, 환산, 중단, 한도, 증빙 규칙을 먼저 적는다. 과제 파일은 하나씩 같은 표로 정리한 뒤 합친다."
    questions = [
        {
            "prompt": "P03 파일과 P07 파일에서 증빙 누락(제7조)에 해당하는 원전표 번호를 오름차순으로 쓰세요. 쉼표로 구분하고 공백은 넣지 않습니다. 다른 조의 위반이 겹쳐도 증빙 누락이면 포함합니다.",
            "answer": answers["q1"],
            "explanation": explain(strategy, mistakes, "01 규정, 03 환율표, P03, P07 (과제 마스터는 필요 없다. 두 과제 파일만 붙이면 한도 안에서 풀린다)", "취소와 정정을 반영하고 남은 전표에서 증빙이 없음이고 원화금액이 50000원 이상인 것만 모은다. 정정으로 금액이 바뀌면 판정도 바뀐다."),
        },
        {
            "prompt": "P10 파일만 기준으로, 상반기 집행액(원)은 얼마인가. 위반 전표도 포함하며 숫자만 쓰세요.",
            "answer": answers["q2"],
            "explanation": explain(strategy, mistakes, "01 규정, 03 환율표, P10 (과제 마스터는 필요 없다)", "제1조부터 제4조까지만 적용해 남은 전표의 원화금액을 더한다. 위반 여부로 빼지 않는다."),
        },
        {
            "prompt": "집행액이 총예산보다 큰 과제 코드를 오름차순으로 쓰세요. 쉼표로 구분하고 공백은 넣지 않습니다. 같으면 포함하지 않습니다.",
            "answer": answers["q3"],
            "explanation": explain(strategy, mistakes, "01 규정, 02 과제 마스터, 03 환율표, P01~P10 전부 (파일별 집행액을 먼저 구한다)", "과제마다 집행액을 원화로 구해 총예산과 비교한다. 총예산과 같은 과제가 있다."),
        },
        {
            "prompt": "모든 과제의 위반 전표 원화금액을 더하면 얼마인가. 숫자만 쓰세요.",
            "answer": answers["q4"],
            "explanation": explain(strategy, mistakes, "01 규정, 02 과제 마스터, 03 환율표, P01~P10 전부", "위반 전표는 한 번만 센다. 취소로 사라진 전표와 정정 전 금액은 넣지 않는다."),
        },
    ]
    passage = (
        "청솔연구재단이 지원한 연구과제 10개의 2026년 상반기 예산 집행을 감사한다. 규정과 과제 마스터, 월별 환율표, 과제별 전표 10개가 나뉘어 있다. "
        "문제마다 필요한 파일이 다르며, 전부 한 번에 붙이면 글자 한도를 넘는다. 표기합계와 소계는 쓰지 않는다."
    )
    payload = bundle(SET_ID, "청솔연구재단 연구과제 예산 집행 감사", "예산 감사", "어려움", passage, files, questions)
    payload["_ref"] = {"answers": answers}
    return payload
