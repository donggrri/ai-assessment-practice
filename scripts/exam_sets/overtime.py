"""다온시스템즈 근태·초과근무 수당 정산 (어려움)."""

from __future__ import annotations

import datetime as dt
import random
from dataclasses import dataclass, field

from .common import block, bundle, explain, join_codes, make_names, memo_block, pdf_file

SET_ID = "daon-overtime-pay"
ISSUER = "다온시스템즈"
START, END = "2026-09-01", "2026-09-30"
TEAMS = ["개발", "설계", "생산기술", "품질", "영업지원"]

HOLIDAYS = {
    "2026-09-05": "토요휴무",
    "2026-09-06": "일요일",
    "2026-09-12": "토요휴무",
    "2026-09-13": "일요일",
    "2026-09-15": "창립기념일",
    "2026-09-19": "토요휴무",
    "2026-09-20": "일요일",
    "2026-09-24": "추석연휴",
    "2026-09-25": "추석연휴",
    "2026-09-26": "추석연휴",
    "2026-09-27": "일요일",
}
WEEKS = [
    ("W36", "2026-08-31", "2026-09-06"),
    ("W37", "2026-09-07", "2026-09-13"),
    ("W38", "2026-09-14", "2026-09-20"),
    ("W39", "2026-09-21", "2026-09-27"),
    ("W40", "2026-09-28", "2026-10-04"),
]


@dataclass
class Emp:
    eid: str
    name: str
    team: str
    kind: str
    wage: int
    new_wage: int = 0
    new_eff: str = "-"
    status: str = "재직"
    effective: str = "2026-01-01"


@dataclass
class Row:
    eid: str
    name: str
    date: str
    start: int
    end: int
    brk: int
    submitted: str

    @property
    def end_text(self) -> str:
        return hhmm(self.end)


@dataclass
class Fix:
    action: str
    eid: str
    date: str
    old: str
    new: str


@dataclass
class WeekFile:
    code: str
    first: str
    last: str
    rows: list[Row] = field(default_factory=list)
    printed: int = 0


def hhmm(minutes: int) -> str:
    if minutes >= 1440:
        return "익일" + hhmm(minutes - 1440)
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def parse_hhmm(text: str) -> int:
    if text.startswith("익일"):
        return 1440 + parse_hhmm(text[2:])
    return int(text[:2]) * 60 + int(text[3:5])


def d(day: int, month: int = 9) -> str:
    return f"2026-{month:02d}-{day:02d}"


def weekday(date: str) -> int:
    return dt.date.fromisoformat(date).weekday()


def status_on(emp: Emp, day: str) -> str:
    if emp.effective <= START:
        return emp.status
    if emp.effective > END:
        return "재직"
    if day < emp.effective:
        return "재직"
    return emp.status


def night_minutes(start: int, end: int) -> int:
    total = 0
    for low, high in ((0, 360), (1320, 1800), (2760, 3240)):
        total += max(0, min(end, high) - max(start, low))
    return total


def week_of(date: str) -> str:
    for code, first, last in WEEKS:
        if first <= date <= last:
            return code
    return "-"


def make_emps() -> list[Emp]:
    names = make_names(24, 9091, 2)
    wages = [12000, 13500, 11000, 14500, 12500, 16000, 15500, 18000, 17500, 20000, 21000, 12000, 13000, 14000,
             11500, 12500, 13500, 15000, 16500, 12000, 13000, 14000, 15000, 16000]
    emps = [Emp(f"D{1001 + i}", names[i], TEAMS[i % 5], "일반", wages[i]) for i in range(24)]
    for index in (7, 8, 9, 10):
        emps[index].kind = "재량"
    emps[11].new_wage, emps[11].new_eff = 13500, d(16)
    emps[12].new_wage, emps[12].new_eff = 14500, d(21)
    emps[13].new_wage, emps[13].new_eff = 15500, d(30)
    emps[14].status, emps[14].effective = "휴직", d(8)
    emps[15].status, emps[15].effective = "퇴사", d(25)
    emps[16].status, emps[16].effective = "퇴사", "2026-08-20"
    emps[17].status, emps[17].effective = "휴직", "2026-10-05"
    return emps


def build_rows(rng: random.Random, emps: list[Emp]) -> tuple[list[WeekFile], list[Fix]]:
    files = [WeekFile(code, first, last) for code, first, last in WEEKS]
    plans: dict[tuple[str, str], tuple[int, int, int]] = {}

    def plan(index: int, date: str, net: int, start: int | None = None, brk: int = 60) -> None:
        begin = start if start is not None else rng.randrange(8 * 12 + 6, 9 * 12 + 7) * 5
        plans[(emps[index].eid, date)] = (begin, net, brk)

    # W36
    for day in (1, 2, 3, 4):
        plan(2, d(day), 600)
        plan(3, d(day), 560)
    plan(2, d(5), 780)
    plan(3, d(5), 480)
    plan(3, "2026-08-31", 600)
    # W37
    for day in (7, 8, 9, 10, 11):
        plan(4, d(day), 640)
        plan(5, d(day), 624)
        plan(7, d(day), 700)
    # W38
    for day in (14, 16, 17, 18):
        plan(2, d(day), 690)
        plan(3, d(day), 700)
        plan(4, d(day), 720)
        plan(5, d(day), 780)
        plan(6, d(day), 650)
        plan(7, d(day), 700)
        plan(18, d(day), 680)
    plan(2, d(19), 420)
    plan(3, d(19), 300)
    plan(4, d(19), 270)
    plan(6, d(19), 400)
    plan(7, d(19), 400)
    plan(18, d(20), 480)
    # W39 휴일근로와 야간 교대
    plan(8, d(24), 300)
    plan(9, d(24), 540)
    plan(9, d(25), 420)
    plan(10, d(26), 600)
    plan(15, d(24), 360)
    plan(15, d(25), 360)
    plan(19, d(26), 480)
    plan(20, d(27), 540)
    plan(18, d(26), 180)
    for day in (21, 22, 23):
        plan(19, d(day), 480, start=17 * 60, brk=60)
    # W40
    for day in (28, 29, 30):
        plan(21, d(day), 700)
    plan(21, "2026-10-01", 700)
    plan(21, "2026-10-02", 700)
    # 시급 변경과 상태 경계
    plan(11, d(15), 360)
    plan(11, d(16), 600)
    plan(11, d(14), 570)
    plan(12, d(21), 600)
    plan(12, d(18), 540)
    plan(13, d(30), 660)
    plan(13, d(29), 560)
    plan(14, d(7), 560)
    plan(14, d(8), 560)
    plan(14, d(9), 560)
    plan(15, d(23), 620)
    plan(16, d(3), 600)
    plan(17, d(30), 600)
    # 이른 출근 몇 건
    plan(1, d(2), 500, start=5 * 60 + 10)
    plan(1, d(3), 480, start=4 * 60 + 40)
    plan(0, d(22), 520, start=5 * 60 + 30)

    controlled = {2: {"W36", "W38"}, 3: {"W36", "W38"}, 4: {"W37", "W38"}, 5: {"W37", "W38"}, 6: {"W38"}, 7: {"W37", "W38"}, 18: {"W38"}, 21: {"W40"}, 19: {"W39"}}
    for index, emp in enumerate(emps):
        day = dt.date(2026, 8, 31)
        while day <= dt.date(2026, 10, 2):
            iso = day.isoformat()
            day += dt.timedelta(days=1)
            if (emp.eid, iso) in plans or iso in HOLIDAYS or dt.date.fromisoformat(iso).weekday() >= 5:
                continue
            if week_of(iso) in controlled.get(index, set()) or rng.random() < 0.07:
                continue
            extra = rng.choice([0, 0, 0, 0, 20, 45, 50, 59, 75, 100, 130])
            plan(index, iso, 480 + extra, brk=rng.choice([60, 60, 60, 90, 45]))
    for index in (0, 1):
        for date in ("2026-08-31", "2026-10-01"):
            if (emps[index].eid, date) not in plans:
                plan(index, date, 540)
    for index in (1, 20, 22):
        plan(index, d(12), rng.choice([240, 300]))
        plan(index, d(13), rng.choice([360, 420]))
    for index in (22, 23):
        plan(index, d(15), 300)

    rows: list[Row] = []
    for (eid, date), (begin, net, brk) in plans.items():
        emp = next(item for item in emps if item.eid == eid)
        end = begin + net + brk
        submitted = (dt.date.fromisoformat(date) + dt.timedelta(days=1)).strftime("%m-%d") + f" {rng.randrange(8, 11):02d}:{rng.randrange(0, 60):02d}"
        rows.append(Row(eid, emp.name, date, begin, end, brk, submitted))

    lookup = {(row.eid, row.date): row for row in rows}
    # 중복 제출. 먼저 낸 행은 퇴근이 다르다.
    extra_rows: list[Row] = []
    dup_specs = [(6, d(14), 200, True), (6, d(16), 30, False), (0, d(10), 60, True), (22, d(2), 120, False), (4, d(17), 90, True), (13, d(29), 45, False)]
    for index, date, delta, later_is_short in dup_specs:
        row = lookup.get((emps[index].eid, date))
        if row is None:
            continue
        older = Row(row.eid, row.name, row.date, row.start, row.end + delta if later_is_short else max(row.start + 60, row.end - delta), row.brk, row.submitted)
        row.submitted = (dt.date.fromisoformat(date) + dt.timedelta(days=2)).strftime("%m-%d") + " 09:40"
        older.submitted = (dt.date.fromisoformat(date) + dt.timedelta(days=1)).strftime("%m-%d") + " 08:50"
        extra_rows.append(older)
    rows.extend(extra_rows)

    fixes: list[Fix] = []

    def fix(action: str, index: int, date: str, shift: int = 0) -> None:
        row = lookup[(emps[index].eid, date)]
        new = "-" if action == "취소" else hhmm(row.end + shift)
        fixes.append(Fix(action, row.eid, row.date, row.end_text, new))

    fix("정정", 3, d(17), 30)
    fix("취소", 4, d(19))
    fix("정정", 0, d(22), 60)
    fix("정정", 8, d(24), 120)
    fix("취소", 9, d(25))
    fix("정정", 12, d(21), -60)
    fix("정정", 20, d(27), 60)
    stale = lookup[(emps[6].eid, d(14))]
    fixes.append(Fix("정정", stale.eid, stale.date, hhmm(stale.end + 200), hhmm(stale.end + 260)))
    unmatched = lookup.get((emps[1].eid, d(9)))
    if unmatched:
        fixes.append(Fix("취소", unmatched.eid, unmatched.date, hhmm(unmatched.end + 5), "-"))

    for row in rows:
        file = next(item for item in files if item.first <= row.date <= item.last)
        file.rows.append(row)
    for file in files:
        rng.shuffle(file.rows)
        file.rows.sort(key=lambda item: (item.date, item.eid))
        for index in range(len(file.rows) - 1):
            if file.rows[index].eid == file.rows[index + 1].eid and file.rows[index].date == file.rows[index + 1].date and rng.random() < 0.5:
                file.rows[index], file.rows[index + 1] = file.rows[index + 1], file.rows[index]
        file.printed = len(file.rows) + 11
    return files, fixes


def valid_days(emps: list[Emp], files: list[WeekFile], fixes: list[Fix]) -> dict[tuple[str, str], tuple[int, int, int]]:
    by_eid = {emp.eid: emp for emp in emps}
    latest: dict[tuple[str, str], Row] = {}
    for file in files:
        for row in file.rows:
            key = (row.eid, row.date)
            current = latest.get(key)
            if current is None or row.submitted > current.submitted:
                latest[key] = row
    out: dict[tuple[str, str], tuple[int, int, int]] = {}
    for key, row in latest.items():
        end = row.end
        drop = False
        for item in fixes:
            if (item.eid, item.date, item.old) == (row.eid, row.date, row.end_text):
                if item.action == "취소":
                    drop = True
                else:
                    end = parse_hhmm(item.new)
                break
        if drop:
            continue
        if not (START <= row.date <= END):
            continue
        if status_on(by_eid[row.eid], row.date) != "재직":
            continue
        out[key] = (row.start, end, row.brk)
    return out


def evaluate(emps: list[Emp], files: list[WeekFile], fixes: list[Fix]) -> dict[str, str]:
    by_eid = {emp.eid: emp for emp in emps}
    days = valid_days(emps, files, fixes)
    week_totals: dict[tuple[str, str], int] = {}
    night_total = 0
    holiday_w39 = 0
    pay_num: dict[str, int] = {}
    for (eid, date), (start, end, brk) in days.items():
        emp = by_eid[eid]
        net = end - start - brk
        week_totals[(eid, week_of(date))] = week_totals.get((eid, week_of(date)), 0) + net
        night = night_minutes(start, end)
        night_total += night
        wage = emp.new_wage if emp.new_eff != "-" and date >= emp.new_eff else emp.wage
        units = night
        if date in HOLIDAYS:
            first = min(net, 480)
            rest = max(0, net - 480)
            units += 3 * first + 4 * rest
            if "2026-09-21" <= date <= "2026-09-27":
                holiday_w39 += net
        elif emp.kind != "재량":
            overtime = max(0, net - 480) // 15 * 15
            units += 3 * overtime
        pay_num[eid] = pay_num.get(eid, 0) + wage * units
    over = [eid for (eid, week), total in week_totals.items() if week == "W38" and total > 3120 and by_eid[eid].kind != "재량"]
    pay = sum(value // 120 for value in pay_num.values())
    return {"q1": join_codes(over), "q2": str(night_total), "q3": str(holiday_w39), "q4": str(pay)}


def build() -> dict:
    rng = random.Random(9302)
    emps = make_emps()
    files, fixes = build_rows(rng, emps)
    answers = evaluate(emps, files, fixes)
    if len(answers["q1"].split(",")) < 2:
        raise SystemExit(f"근태 정답 조정 필요 {answers}")

    policy = "\n".join(
        [
            "다온시스템즈 근태 및 초과근무 수당 정산 규정.",
            f"기간 {START} {END}",
            "제1조 기간. 근무일이 2026-09-01보다 전이거나 2026-09-30보다 뒤인 행은 버린다. 주 단위 계산에도 버린 날은 넣지 않는다.",
            "제2조 상태. 직원 마스터의 상태가 재직인 날의 행만 쓴다. 발효일이 2026-09-01 이전이거나 같으면 9월 전체가 그 상태다. 발효일이 2026-09-30보다 뒤면 9월 전체는 재직이다. 발효일이 9월 안이면 발효일 전날까지는 재직이고 발효일 당일부터 적힌 상태다. 예외가 명시되지 않은 한 발효일 이전은 재직으로 본다. 휴직과 퇴사인 날의 행은 모든 계산에서 뺀다.",
            "제3조 중복. 같은 사번과 근무일의 행이 여러 번 제출되면 제출시각이 가장 늦은 행만 남긴다. 파일에서 몇 번째 줄인지는 상관없다.",
            "제4조 정정. 정정 신청 파일의 기록은 중복을 정리한 뒤 사번, 근무일, 원퇴근이 모두 같은 남은 행에만 적용한다. 취소는 그 날의 행을 지우고 정정은 퇴근 시각을 새퇴근으로 바꾼다. 맞는 행이 없으면 무시한다.",
            "제5조 실근로. 실근로분은 퇴근 시각에서 출근 시각과 휴게분을 뺀 값이다. 퇴근 칸이 익일로 시작하면 다음 날 그 시각이다.",
            "제6조 휴일. 휴무일 캘린더에 적힌 날은 휴일이고 나머지는 평일이다. 토요일도 캘린더에 적혀 있으면 휴일이다. 평일의 소정근로는 480분이다.",
            "제7조 연장. 평일 실근로분 중 480분을 넘는 부분이 연장분이다. 일별 연장분은 15분 단위로 버린다. 연장분은 1.5배로 환산한다.",
            "제8조 휴일근로. 휴일 실근로분 중 처음 480분은 1.5배, 480분을 넘는 부분은 2.0배로 환산한다. 휴일에는 연장분 규정을 쓰지 않는다.",
            "제9조 야간. 야간분은 출근 시각부터 퇴근 시각까지 구간 중 22:00부터 다음 날 06:00과 겹치는 분이다. 휴게분은 야간분에서 빼지 않는다. 야간분은 평일과 휴일 모두 0.5배를 더한다.",
            "제10조 재량근로. 근무형태가 재량인 직원은 연장 수당과 주 52시간 판정에서 뺀다. 휴일근로와 야간 가산은 받는다.",
            "제11조 수당. 직원별 환산분은 연장분 1.5배, 휴일 구간별 배수, 야간 0.5배를 모두 더한 값이다. 수당은 시급을 곱해 60으로 나눈다. 시급은 근무일 기준이며 신시급발효일 당일부터 신시급이다. 원 미만은 직원별 월 합계에서 한 번만 버린다.",
            "제12조 주 52시간. 월요일부터 일요일까지 한 주의 실근로분 합이 3120분보다 크면 초과다. 3120분과 같으면 초과가 아니다.",
            "제13조 소계. 파일 머리의 표기건수와 표 아래 소계 건수는 사용하지 않는다. 이름이 같아도 사번이 다르면 다른 사람이다.",
        ]
    )
    emp_rows = [
        f"{e.eid}|{e.name}|{e.team}|{e.kind}|{e.wage}|{e.new_wage if e.new_eff != '-' else '-'}|{e.new_eff}|{e.status}|{e.effective}"
        for e in sorted(emps, key=lambda item: (item.name, item.eid))
    ]
    master = "다온시스템즈 직원 마스터. 성명 순이며 팀으로 묶여 있지 않다.\n\n" + block(
        "ROSTER", "사번|성명|팀|근무형태|시급|신시급|신시급발효일|상태|발효일", emp_rows
    )
    calendar = "다온시스템즈 9월 휴무일 캘린더. 여기에 없는 날은 평일이다.\n\n" + block(
        "CALENDAR", "일자|구분|사유", [f"{date}|휴일|{reason}" for date, reason in HOLIDAYS.items()]
    )
    amend_rows = [f"{item.action}|{item.eid}|{item.date}|{item.old}|{item.new}" for item in fixes]
    amend = "다온시스템즈 근태 정정 신청. 모든 주차에 적용한다.\n\n" + block("AMENDS", "처리|사번|근무일|원퇴근|새퇴근", amend_rows)
    files_out = [
        pdf_file(SET_ID, "policy", "01_근태_수당_규정.pdf", "근태 수당 규정", policy, ISSUER, "수당 정산", "01_policy.pdf"),
        pdf_file(SET_ID, "roster", "02_직원_마스터.pdf", "직원 마스터", master, ISSUER, "직원 마스터", "02_roster.pdf"),
        pdf_file(SET_ID, "calendar", "03_휴무일_캘린더.pdf", "휴무일 캘린더", calendar, ISSUER, "휴무일", "03_calendar.pdf"),
        pdf_file(SET_ID, "amend", "04_정정_신청.pdf", "근태 정정 신청", amend, ISSUER, "정정 신청", "04_amend.pdf"),
    ]
    for file in files:
        rows = [f"{r.eid}|{r.name}|{r.date}|{hhmm(r.start)}|{r.end_text}|{r.brk}|{r.submitted}" for r in file.rows]
        body = "\n".join(
            [
                f"다온시스템즈 주차별 근태 기록. 주차 {file.code}. 기간 {file.first} {file.last}.",
                f"표기건수 {file.printed}",
                block("LOGS", "사번|성명|근무일|출근|퇴근|휴게분|제출시각", rows),
                memo_block(
                    [
                        "이 문단은 현장 메모이며 표의 행이 아니다. 표기건수와 소계는 다시 더하지 않는다.",
                        f"{file.code} 주차 메모. 퇴근 칸의 익일은 다음 날 시각이다. 휴게분은 분 단위다.",
                        "메모에 적힌 숫자는 예시이며 정산에 쓰지 않는다. 예: 지난 달 수당 합계 4200000원.",
                    ]
                ),
            ]
        )
        files_out.append(
            pdf_file(
                SET_ID,
                f"week-{file.code.lower()}",
                f"05_주차별_근태/{file.code}_{file.first[5:].replace('-', '')}.pdf",
                f"{file.code} 근태 기록",
                body,
                ISSUER,
                "주차별 근태",
                f"weeks/{file.code}.pdf",
            )
        )

    mistakes = [
        "파일을 한꺼번에 붙여 글자 한도에 걸린다.",
        "퇴근 칸의 익일을 같은 날 시각으로 읽어 실근로분이 음수가 된다. 휴게분 빼기를 빼먹는다.",
        "9월 밖의 8월 31일과 10월 행을 주 합계나 수당에 넣는다.",
        "같은 날 다시 제출한 행을 모두 세거나 줄 위치로 최신을 고른다. 제출시각이 가장 늦은 행만 남긴다.",
        "정정과 취소를 원퇴근이 맞지 않는 행에 적용하거나 빼먹는다. 3120분과 같은 주를 초과로 센다.",
        "재량근로의 연장 제외와 주 52시간 제외를 헷갈린다. 신시급발효일 당일을 구시급으로 계산한다. 동명이인을 합친다.",
    ]
    strategy = "규정에서 기간, 상태 발효일, 중복, 정정 순서, 실근로, 휴일, 연장 절사, 야간 구간, 재량 예외를 먼저 적는다. 주차 파일은 하나씩 같은 표로 정리한 뒤 합친다."
    questions = [
        {
            "prompt": "2026-09-14부터 2026-09-20까지 한 주(W38)의 실근로분 합이 3120분보다 큰 사번을 오름차순으로 쓰세요. 쉼표로 구분하고 공백은 넣지 않습니다. 재량근로자는 제외합니다.",
            "answer": answers["q1"],
            "explanation": explain(strategy, mistakes, "01 규정, 02 직원 마스터, 04 정정 신청, W38 (휴무일 캘린더는 필요 없다)", "그 주의 중복과 정정을 정리한 뒤 사번별로 실근로분을 더한다. 정확히 3120분이면 초과가 아니다."),
        },
        {
            "prompt": "9월 한 달 동안 인정되는 야간분(22:00~다음 날 06:00과 겹치는 분)의 전체 합은 몇 분인가. 숫자만 쓰세요.",
            "answer": answers["q2"],
            "explanation": explain(strategy, mistakes, "01 규정, 02 직원 마스터, 04 정정 신청, W36~W40 전부 (휴무일 캘린더는 필요 없다)", "휴게분은 야간분에서 빼지 않는다. 이른 아침 출근과 익일 퇴근 모두 겹침을 센다."),
        },
        {
            "prompt": "2026-09-21부터 2026-09-27까지 한 주(W39)에서 휴일로 인정되는 근무일의 실근로분 합은 몇 분인가. 숫자만 쓰세요.",
            "answer": answers["q3"],
            "explanation": explain(strategy, mistakes, "01 규정, 02 직원 마스터, 03 휴무일 캘린더, 04 정정 신청, W39", "휴일은 캘린더에 적힌 날만이다. 퇴사나 휴직 발효일 당일부터의 행은 뺀다."),
        },
        {
            "prompt": "9월 전체 직원의 연장, 휴일, 야간 수당을 모두 더하면 얼마인가. 직원별로 원 미만을 한 번 버린 뒤 더한 원 단위 숫자만 쓰세요.",
            "answer": answers["q4"],
            "explanation": explain(strategy, mistakes, "01 규정, 02 직원 마스터, 03 휴무일 캘린더, 04 정정 신청, W36~W40 전부", "직원별 환산분에 근무일 시급을 곱해 합친 뒤 60으로 나눈 몫을 직원마다 한 번만 버린다."),
        },
    ]
    passage = (
        "다온시스템즈의 2026년 9월 근태와 초과근무 수당을 정산한다. 규정, 직원 마스터, 휴무일 캘린더, 정정 신청, 주차별 근태 5개 파일이 나뉘어 있다. "
        "문제마다 필요한 파일이 다르며, 전부 한 번에 붙이면 글자 한도를 넘는다. 표기건수와 소계는 쓰지 않는다."
    )
    payload = bundle(SET_ID, "다온시스템즈 근태·초과근무 수당 정산", "수당 정산", "어려움", passage, files_out, questions)
    payload["_ref"] = {"answers": answers}
    return payload
