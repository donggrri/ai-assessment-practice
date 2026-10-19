"""미르반도체 장비 알람·PM 분석 (어려움)."""

from __future__ import annotations

import datetime as dt
import random
from dataclasses import dataclass, field

from .common import block, bundle, explain, join_codes, memo_block, pdf_file

SET_ID = "mirvan-alarm-pm"
ISSUER = "미르반도체"
START, END = "2026-10-01", "2026-10-31"
MERGE_GAP_MIN = 3
DOWN_LIMIT = 560
RECUR_MIN_H = 24
RECUR_MAX_H = 72
RECUR_COUNT = 3

EQUIPS = [f"E{index:02d}" for index in range(1, 13)]


@dataclass
class Alarm:
    lid: str
    equip: str
    code: str
    level: str
    start: str
    end: str
    submitted: str


@dataclass
class PmWindow:
    equip: str
    start: str
    end: str


@dataclass
class Adjust:
    action: str
    lid: str
    field: str
    old: str
    new: str
    deadline: str
    requested: str


@dataclass
class LogFile:
    fid: str
    title: str
    rows: list[Alarm] = field(default_factory=list)
    printed: int = 0


def parse_ts(ts: str) -> dt.datetime:
    return dt.datetime.fromisoformat(ts)


def minutes_between(a: str, b: str) -> int:
    delta = parse_ts(b) - parse_ts(a)
    return max(0, int(delta.total_seconds() // 60))


def ceil_duration(start: str, end: str) -> int:
    if not end or end == "-":
        return 15
    mins = minutes_between(start, end)
    return max(1, mins) if mins > 0 else 15


def in_pm(equip: str, start: str, end: str, windows: list[PmWindow]) -> bool:
    s, e = parse_ts(start), parse_ts(end if end != "-" else start)
    for window in windows:
        if window.equip != equip:
            continue
        ps, pe = parse_ts(window.start), parse_ts(window.end)
        if s >= ps and e <= pe:
            return True
    return False


def build_data(rng: random.Random) -> tuple[list[LogFile], list[PmWindow], list[Adjust]]:
    logs = [LogFile(f"log-w{week}", f"10월 {week}주 알람") for week in range(1, 6)]
    serial = [5000]

    def stamp(day: int, hour: int, minute: int) -> str:
        return f"2026-10-{day:02d} {hour:02d}:{minute:02d}"

    levels = ["CRI", "MAJ", "MIN"]
    codes = ["VAC", "TMP", "PRS", "PWR", "GAS", "LKT", "RFI", "MOT"]

    for log in logs:
        serial[0] += 1
        log.rows.append(
            Alarm(
                f"L{serial[0]:05d}",
                "E01",
                "VAC",
                "CRI",
                "2026-09-30 22:00",
                "2026-09-30 22:30",
                "09-30 23:00",
            )
        )
        for _ in range(110):
            serial[0] += 1
            equip = rng.choice(EQUIPS)
            level = rng.choices(levels, weights=[12, 35, 53])[0]
            day = rng.randrange(1, 32)
            hour = rng.randrange(0, 24)
            minute = rng.randrange(0, 12) * 5
            start = stamp(day, hour, minute)
            duration = rng.randrange(2, 40)
            end_dt = parse_ts(start) + dt.timedelta(minutes=duration)
            end = end_dt.strftime("%Y-%m-%d %H:%M")
            log.rows.append(
                Alarm(
                    f"L{serial[0]:05d}",
                    equip,
                    rng.choice(codes),
                    level,
                    start,
                    end,
                    end_dt.strftime("%m-%d %H:%M"),
                )
            )
        # 연속 알람 병합 후보
        equip = rng.choice(EQUIPS)
        code = rng.choice(codes)
        base_day = rng.randrange(5, 25)
        t0 = parse_ts(stamp(base_day, 10, 0))
        for offset in (0, 2, 4):
            s = (t0 + dt.timedelta(minutes=offset)).strftime("%Y-%m-%d %H:%M")
            e = (t0 + dt.timedelta(minutes=offset + 8)).strftime("%Y-%m-%d %H:%M")
            serial[0] += 1
            log.rows.append(Alarm(f"L{serial[0]:05d}", equip, code, "CRI", s, e, e))
        log.printed = len(log.rows) + 9

    pm: list[PmWindow] = []
    for equip in ("E03", "E07", "E09"):
        pm.append(PmWindow(equip, "2026-10-12 08:00", "2026-10-12 18:00"))
        pm.append(PmWindow(equip, "2026-10-26 22:00", "2026-10-27 06:00"))

    # PM 중 알람 몇 건
    for log in logs[:2]:
        for window in pm[:2]:
            serial[0] += 1
            log.rows.append(
                Alarm(
                    f"L{serial[0]:05d}",
                    window.equip,
                    "PMX",
                    "CRI",
                    "2026-10-12 09:30",
                    "2026-10-12 09:45",
                    "10-12 10:00",
                )
            )

    adjusts = [
        Adjust("정정", logs[0].rows[10].lid, "level", "MAJ", "CRI", "2026-10-05", "2026-10-04"),
        Adjust("정정", logs[1].rows[20].lid, "end", logs[1].rows[20].end, "2026-10-08 15:30", "2026-10-07", "2026-10-09"),
        Adjust("취소", logs[2].rows[30].lid, "-", "-", "-", "2026-10-15", "2026-10-14"),
        Adjust("정정", logs[3].rows[40].lid, "level", "MIN", "CRI", "2026-10-20", "2026-10-22"),
    ]

    # 재발 간격(24~72h) 검증용 CRI 3연속 — 병합되지 않도록 코드·장비 고정, 간격 36h
    recur_specs = [
        ("E02", "TMP", "2026-10-03 08:00", "2026-10-03 08:20"),
        ("E02", "TMP", "2026-10-04 20:30", "2026-10-04 20:50"),
        ("E02", "TMP", "2026-10-06 09:15", "2026-10-06 09:35"),
        ("E06", "GAS", "2026-10-10 07:00", "2026-10-10 07:15"),
        ("E06", "GAS", "2026-10-11 19:00", "2026-10-11 19:10"),
        ("E06", "GAS", "2026-10-13 08:30", "2026-10-13 08:45"),
    ]
    for equip, code, start, end in recur_specs:
        serial[0] += 1
        logs[2].rows.append(Alarm(f"L{serial[0]:05d}", equip, code, "CRI", start, end, end[5:].replace(" ", " ")[:8]))

    return logs, pm, adjusts


def apply_adjust(rows: list[Alarm], adjusts: list[Adjust], *, apply_adj: bool = True) -> list[Alarm]:
    by_id = {row.lid: row for row in rows}
    out = [Alarm(**row.__dict__) for row in rows]
    by_id = {row.lid: row for row in out}
    if not apply_adj:
        return out
    for adj in adjusts:
        if adj.requested > adj.deadline:
            continue
        row = by_id.get(adj.lid)
        if not row:
            continue
        if adj.action == "취소":
            out = [item for item in out if item.lid != adj.lid]
            by_id.pop(adj.lid, None)
            continue
        if adj.field == "level":
            row.level = adj.new
        elif adj.field == "end":
            row.end = adj.new
    return out


def merge_alarms(rows: list[Alarm], *, merge: bool = True) -> list[Alarm]:
    if not merge:
        return list(rows)
    rows = sorted(rows, key=lambda r: (r.equip, r.code, r.start))
    merged: list[Alarm] = []
    for row in rows:
        if not merged:
            merged.append(row)
            continue
        prev = merged[-1]
        if prev.equip == row.equip and prev.code == row.code:
            gap = minutes_between(prev.end, row.start)
            if 0 <= gap <= MERGE_GAP_MIN:
                prev.end = max(prev.end, row.end, key=parse_ts)
                if row.level == "CRI" or prev.level == "CRI":
                    prev.level = "CRI"
                continue
        merged.append(row)
    return merged


def prepare(
    logs: list[LogFile],
    pm: list[PmWindow],
    adjusts: list[Adjust],
    *,
    merge: bool = True,
    pm_skip: bool = True,
    adj: bool = True,
    period: bool = True,
) -> list[Alarm]:
    rows: list[Alarm] = []
    for log in logs:
        rows.extend(log.rows)
    rows = apply_adjust(rows, adjusts, apply_adj=adj)
    kept: list[Alarm] = []
    for row in rows:
        day = row.start[:10]
        if period and not (START <= day <= END):
            continue
        if pm_skip and in_pm(row.equip, row.start, row.end, pm):
            continue
        kept.append(row)
    return merge_alarms(kept, merge=merge)


def downtime_minutes(events: list[Alarm]) -> int:
    total = 0
    for row in events:
        if row.level == "MIN":
            continue
        total += ceil_duration(row.start, row.end)
    return total


def answers_of(logs: list[LogFile], pm: list[PmWindow], adjusts: list[Adjust]) -> dict[str, str]:
    events = prepare(logs, pm, adjusts)
    cri_by_equip: dict[str, int] = {}
    for row in events:
        if row.level != "CRI":
            continue
        cri_by_equip[row.equip] = cri_by_equip.get(row.equip, 0) + 1
    q1 = join_codes([eid for eid, count in cri_by_equip.items() if count >= 5])

    q2 = str(downtime_minutes(events))

    down_by_equip: dict[str, int] = {}
    for row in events:
        if row.level == "MIN":
            continue
        down_by_equip[row.equip] = down_by_equip.get(row.equip, 0) + ceil_duration(row.start, row.end)
    q3 = join_codes([eid for eid, mins in down_by_equip.items() if mins > DOWN_LIMIT])

    # 재발: 같은 equip+code, 병합 후 CRI, 연속 간격이 24~72h인 쌍이 (RECUR_COUNT-1)번 이상
    cri_events = [r for r in events if r.level == "CRI"]
    cri_events.sort(key=lambda r: (r.equip, r.code, r.start))
    codes_hit: set[str] = set()
    from collections import defaultdict

    groups: dict[tuple[str, str], list[Alarm]] = defaultdict(list)
    for row in cri_events:
        groups[(row.equip, row.code)].append(row)
    for (equip, code), items in groups.items():
        if len(items) < RECUR_COUNT:
            continue
        gaps_ok = 0
        for index in range(1, len(items)):
            gap_h = minutes_between(items[index - 1].end, items[index].start) / 60
            if RECUR_MIN_H <= gap_h <= RECUR_MAX_H:
                gaps_ok += 1
        if gaps_ok >= RECUR_COUNT - 1:
            codes_hit.add(code)
    q4 = join_codes(codes_hit)

    return {"q1": q1, "q2": q2, "q3": q3, "q4": q4}


def build() -> dict:
    rng = random.Random(9102)
    logs, pm, adjusts = build_data(rng)
    answers = answers_of(logs, pm, adjusts)
    if not answers["q1"] or not answers["q3"] or not answers["q4"] or int(answers["q2"]) < 100 or len(answers["q3"].split(",")) >= len(EQUIPS):
        raise SystemExit(f"알람 정답 조정 필요 {answers}")

    policy = "\n".join(
        [
            "미르반도체 장비 알람 처리 규정.",
            f"기간 {START} {END}",
            "제1조 기간. 알람 시작일시의 날짜가 2026-10-01보다 전이거나 2026-10-31보다 뒤면 버린다.",
            f"제2조 병합. 같은 장비ID와 알람코드에서 이전 종료와 다음 시작 사이가 {MERGE_GAP_MIN}분 이하이면 한 건으로 병합한다. 종료는 늦은 시각, 등급은 CRI가 있으면 CRI다.",
            "제3조 PM 제외. PM 일정 표에 있는 장비의 PM 시작~종료 안에 완전히 들어가는 알람은 집계에서 뺀다.",
            "제4조 정정. 정정 요청 표를 따른다. 요청일이 적용기한보다 늦으면 무시한다. 취소는 해당 log_id를 없앤다. level·end만 바꾼다.",
            "제5조 중대 알람. 등급 CRI를 중대 알람으로 본다. 병합 후 건수를 센다.",
            "제6조 다운타임. 병합 후 각 알람의 (종료-시작) 분을 올림해 더한다. 종료가 없으면 15분. MIN 등급은 0분.",
            f"제7조 장비 초과. 장비별 다운타임 합이 {DOWN_LIMIT}분보다 크면 초과 장비다.",
            f"제8조 재발 코드. 같은 장비·코드의 병합 후 CRI 알람에서 연속 두 건 사이 간격이 {RECUR_MIN_H}시간 이상 {RECUR_MAX_H}시간 이하인 경우를 재발 간격으로 본다. 재발 간격이 {RECUR_COUNT - 1}회 이상이면 그 알람코드를 재발 코드로 적는다.",
            "제9조 소계. 표기건수는 쓰지 않는다.",
        ]
    )
    pm_rows = [f"{w.equip}|{w.start}|{w.end}" for w in pm]
    pm_doc = "미르반도체 PM 일정.\n\n" + block("PM", "장비ID|시작|종료", pm_rows)
    adj_rows = [f"{a.action}|{a.lid}|{a.field}|{a.old}|{a.new}|{a.deadline}|{a.requested}" for a in adjusts]
    adj_doc = "미르반도체 알람 정정 요청.\n\n" + block("ADJ", "처리|log_id|항목|원값|새값|적용기한|요청일", adj_rows)

    files = [
        pdf_file(SET_ID, "policy", "01_알람_처리_규정.pdf", "알람 처리 규정", policy, ISSUER, "알람 규정", "01_policy.pdf"),
        pdf_file(SET_ID, "pm", "02_PM_일정.csv", "PM 일정", pm_doc, ISSUER, "PM", "02_pm.pdf"),
        pdf_file(SET_ID, "adjust", "03_정정_요청.csv", "정정 요청", adj_doc, ISSUER, "정정", "03_adjust.pdf"),
    ]
    for log in logs:
        lines = [f"{r.lid}|{r.equip}|{r.code}|{r.level}|{r.start}|{r.end}|{r.submitted}" for r in log.rows]
        body = "\n".join(
            [
                f"미르반도체 알람 로그. {log.title}.",
                f"표기건수 {log.printed}",
                block("ALARMS", "log_id|장비ID|알람코드|등급|시작|종료|제출시각", lines),
                memo_block(["표 행만 집계한다."]),
            ]
        )
        files.append(
            pdf_file(
                SET_ID,
                log.fid,
                f"04_알람로그/{log.fid}.csv",
                log.title,
                body,
                ISSUER,
                "알람 로그",
                f"logs/{log.fid}.pdf",
            )
        )

    mistakes = [
        "로그를 한 번에 붙여 글자 한도에 걸린다.",
        "병합 전 건수를 세거나 병합 간격을 잘못 적용한다.",
        "PM 시간 안 알람을 포함한다.",
        "기한이 지난 정정을 적용하거나 취소를 빼먹는다.",
        "MIN 등급 다운타임을 더한다.",
        "재발 간격을 시작-시작으로 계산한다. 이전 종료~다음 시작이다.",
    ]
    strategy = "규정에서 기간, 병합, PM 제외, 정정 기한, 다운타임, 재발 정의를 적는다. 주차별 로그를 나눠 처리한다."

    def q_explain(prompt: str, files_note: str, note: str) -> str:
        sample = (
            "모범 프롬프트 예시:\n"
            f"「{prompt}」\n"
            "첨부: 01 규정, 02 PM, 03 정정, 필요한 04 알람로그.\n"
            "규칙: 병합 3분, PM 완전 포함 제외, 정정 기한, CRI/MIN 구분을 명시.\n"
            "검증: 병합 후 건수·분 단위 다운타임 재계산."
        )
        return explain(strategy, mistakes, files_note, note) + "\n" + sample

    q1_prompt = "병합·정정·PM 제외 후 중대(CRI) 알람이 5건 이상인 장비ID를 오름차순으로 쓰세요. 쉼표 구분, 공백 없음."
    q2_prompt = "같은 조건으로 모든 장비의 다운타임(분) 합계는 얼마인가. 숫자만 쓰세요."
    q3_prompt = f"장비별 다운타임 합이 {DOWN_LIMIT}분을 초과하는 장비ID를 오름차순으로 쓰세요. 쉼표 구분."
    q4_prompt = (
        f"재발 간격 조건(연속 CRI 사이 {RECUR_MIN_H}~{RECUR_MAX_H}시간)을 {RECUR_COUNT - 1}회 이상 만족하는 알람코드를 오름차순으로 쓰세요."
    )

    questions = [
        {"prompt": q1_prompt, "answer": answers["q1"], "explanation": q_explain(q1_prompt, "01 규정, 02 PM, 03 정정, log-w1~w5", "병합 후 CRI만 센다.")},
        {"prompt": q2_prompt, "answer": answers["q2"], "explanation": q_explain(q2_prompt, "01~03 + 전체 로그", "MIN은 0분이다.")},
        {"prompt": q3_prompt, "answer": answers["q3"], "explanation": q_explain(q3_prompt, "01~03 + 전체 로그", f"{DOWN_LIMIT}분과 같으면 제외.")},
        {"prompt": q4_prompt, "answer": answers["q4"], "explanation": q_explain(q4_prompt, "01~03 + 전체 로그", "장비·코드별로 병합 후 CRI 타임라인을 본다.")},
    ]
    passage = (
        "미르반도체 FAB-3의 2026년 10월 장비 알람과 PM 일정을 분석한다. 알람 규정, PM 일정, 정정 요청, 주차별 알람 로그 5개가 나뉘어 있다. "
        "표기건수는 쓰지 않는다."
    )
    payload = bundle(SET_ID, "미르반도체 장비 알람·PM 분석", "알람 분석", "어려움", passage, files, questions)
    payload["_ref"] = {"answers": answers}
    return payload
