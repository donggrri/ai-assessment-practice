"""미르반도체 웨이퍼 로트 수율 분석 (어려움)."""

from __future__ import annotations

import datetime as dt
import random
from dataclasses import dataclass, field
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from official_pdf import FONT_TTF, ensure_font

from .common import PUBLIC, block, bundle, explain, join_codes, memo_block, pdf_file, png_file

SET_ID = "mirvan-wafer-yield"
ISSUER = "미르반도체"
START, END = "2026-09-08", "2026-09-21"
Q1_FROM, Q1_TO = "2026-09-08", "2026-09-14"

GROUPS = {
    "DRY": [f"E{index:02d}" for index in range(1, 8)],
    "WET": [f"E{index:02d}" for index in range(8, 15)],
    "MET": [f"E{index:02d}" for index in range(15, 21)],
}
DEFECT_GROUP = {"OPN": "OP", "OSD": "OP", "OVL": "OP", "SCR": "SC", "CHP": "SC", "MET": "MT", "MIS": "MT"}
YIELD_FLOOR = {"DRY": 92.0, "WET": 91.0, "MET": 91.5}

SPECIAL_EQUIP = {
    "E05": ("PM", "2026-09-12"),
    "E11": ("DOWN", "2026-09-10"),
    "E18": ("PM", "2026-09-17"),
}


@dataclass
class Equip:
    eid: str
    name: str
    group: str
    state: str = "RUN"
    effective: str = "2026-01-01"


@dataclass
class Row:
    lot: str
    wafer: str
    equip: str
    step: str
    ts: str
    good: int
    bad: int
    unit: str
    validity: str
    defect: str
    submitted: str

    @property
    def key(self) -> tuple[str, str, str]:
        return (self.lot, self.wafer, self.step)


@dataclass
class Fix:
    action: str
    lot: str
    wafer: str
    step: str
    ts: str
    field: str
    old: str
    new: str


@dataclass
class MesFile:
    fid: str
    title: str
    rows: list[Row] = field(default_factory=list)
    fixes: list[Fix] = field(default_factory=list)
    printed: int = 0


def equip_state(equip: Equip, day: str) -> str:
    if equip.effective <= START:
        return equip.state
    if equip.effective > END:
        return "RUN"
    if day < equip.effective:
        return "RUN"
    return equip.state


def make_equipment() -> list[Equip]:
    names = {
        "DRY": ["DRY-A", "DRY-B", "DRY-C", "DRY-D", "DRY-E", "DRY-F", "DRY-G"],
        "WET": ["WET-A", "WET-B", "WET-C", "WET-D", "WET-E", "WET-F", "WET-G"],
        "MET": ["MET-A", "MET-B", "MET-C", "MET-D", "MET-E", "MET-F"],
    }
    out: list[Equip] = []
    for group, ids in GROUPS.items():
        for index, eid in enumerate(ids):
            equip = Equip(eid, names[group][index], group)
            if eid in SPECIAL_EQUIP:
                equip.state, equip.effective = SPECIAL_EQUIP[eid]
            out.append(equip)
    return out


def add_days(date: str, days: int) -> str:
    return (dt.date.fromisoformat(date) + dt.timedelta(days=days)).isoformat()


def submit_after(ts: str, hours: int) -> str:
    base = dt.datetime.fromisoformat(ts)
    later = base + dt.timedelta(hours=hours)
    return later.strftime("%m-%d %H:%M")


def build_rows(rng: random.Random, equipment: list[Equip], serial: list[int]) -> list[MesFile]:
    by_group = {group: [e for e in equipment if e.group == group] for group in GROUPS}
    files = [
        MesFile("mes-dry", "DRY 공정 측정"),
        MesFile("mes-wet", "WET 공정 측정"),
        MesFile("mes-met", "MET 공정 측정"),
        MesFile("mes-x1", "혼합 로트 측정 1"),
        MesFile("mes-x2", "혼합 로트 측정 2"),
    ]

    def lot(rnd: bool = False) -> str:
        serial[0] += 1
        prefix = "RND" if rnd else "LOT"
        return f"{prefix}-M{serial[0]:04d}"

    def pick_ts(day: int) -> str:
        hour = rng.randrange(0, 24)
        minute = rng.randrange(0, 12) * 5
        return f"2026-09-{day:02d} {hour:02d}:{minute:02d}"

    steps = ["STP10", "STP20", "STP30", "STP40"]

    def add_row(target: MesFile, equip: Equip, day: int, *, rnd=False, invalid=False, unit="EA", defect="-") -> Row:
        good = rng.randrange(80, 99)
        bad = rng.randrange(1, 12)
        row = Row(
            lot(rnd),
            f"W{rng.randrange(1, 26):02d}",
            equip.eid,
            rng.choice(steps),
            pick_ts(day),
            good,
            bad,
            unit,
            "무효" if invalid else "유효",
            defect,
            "",
        )
        row.submitted = submit_after(row.ts, rng.randrange(1, 30))
        target.rows.append(row)
        return row

    for mes, group in zip(files[:3], ("DRY", "WET", "MET"), strict=True):
        equips = by_group[group]
        for _ in range(95):
            equip = rng.choice(equips)
            day = rng.randrange(8, 22)
            add_row(mes, equip, day)
        for _ in range(8):
            add_row(mes, rng.choice(equips), rng.randrange(8, 22), rnd=True)
        for _ in range(6):
            add_row(mes, rng.choice(equips), rng.randrange(8, 22), invalid=True)
        for _ in range(5):
            add_row(mes, rng.choice(equips), rng.randrange(8, 22), unit="K")
        for _ in range(10):
            code = rng.choice(list(DEFECT_GROUP))
            add_row(mes, rng.choice(equips), rng.randrange(8, 22), defect=code)

    for mes in files[3:]:
        for _ in range(45):
            equip = rng.choice(equipment)
            add_row(mes, equip, rng.randrange(7, 22))
        add_row(mes, rng.choice(equipment), 7)
        add_row(mes, rng.choice(equipment), 22)

    # 재측정 중복
    for mes in files:
        pool = [r for r in mes.rows if r.validity == "유효" and not r.lot.startswith("RND")]
        rng.shuffle(pool)
        for base in pool[:4]:
            twin = Row(base.lot, base.wafer, base.equip, base.step, base.ts, base.good + 3, base.bad, base.unit, base.validity, base.defect, "")
            early, late = submit_after(base.ts, 2), submit_after(base.ts, 40)
            if rng.random() < 0.5:
                base.submitted, twin.submitted = late, early
                twin.good = base.good - 5
            else:
                base.submitted, twin.submitted = early, late
            mes.rows.append(twin)

    # 정정
    for mes in files[:3]:
        target = next(r for r in mes.rows if r.validity == "유효")
        mes.fixes.append(Fix("정정", target.lot, target.wafer, target.step, target.ts, "bad", str(target.bad), str(max(0, target.bad - 2))))
        cancel = next(r for r in mes.rows if r.validity == "유효" and r is not target)
        mes.fixes.append(Fix("취소", cancel.lot, cancel.wafer, cancel.step, cancel.ts, "-", "-", "-"))

    for mes in files:
        mes.printed = len(mes.rows) + 11
    return files


def die_count(row: Row) -> tuple[int, int]:
    scale = 1000 if row.unit == "K" else 1
    return row.good * scale, row.bad * scale


def process(files: list[MesFile], equipment: list[Equip], *, dedupe: bool = True, fixes: bool = True, status: bool = True, rnd: bool = True, unit: bool = True) -> list[Row]:
    by_equip = {e.eid: e for e in equipment}
    kept: list[Row] = []
    for mes in files:
        if dedupe:
            winners: dict[tuple[str, str, str], Row] = {}
            for row in mes.rows:
                current = winners.get(row.key)
                if current is None or row.submitted > current.submitted:
                    winners[row.key] = row
            rows = list(winners.values())
        else:
            rows = list(mes.rows)
        for row in rows:
            good, bad = row.good, row.bad
            skip = False
            if fixes:
                for fix in mes.fixes:
                    if (fix.lot, fix.wafer, fix.step, fix.ts) != (row.lot, row.wafer, row.step, row.ts):
                        continue
                    if fix.action == "취소":
                        skip = True
                        break
                    if fix.field == "good":
                        good = int(fix.new)
                    elif fix.field == "bad":
                        bad = int(fix.new)
                if skip:
                    continue
            item = Row(row.lot, row.wafer, row.equip, row.step, row.ts, good, bad, row.unit, row.validity, row.defect, row.submitted)
            day = item.ts[:10]
            if not (START <= day <= END):
                continue
            equip = by_equip.get(item.equip)
            if not equip:
                continue
            if status and equip_state(equip, day) != "RUN":
                continue
            if rnd and item.lot.startswith(("RND-", "ENG-")):
                continue
            if item.validity != "유효":
                continue
            kept.append(item)
    if unit:
        return kept
    # unit flag false: treat K as EA without scaling (trap)
    out: list[Row] = []
    for row in kept:
        out.append(Row(row.lot, row.wafer, row.equip, row.step, row.ts, row.good, row.bad, "EA", row.validity, row.defect, row.submitted))
    return out


def lot_yield(rows: list[Row]) -> dict[str, tuple[int, int]]:
    totals: dict[str, list[tuple[int, int]]] = {}
    for row in rows:
        g, b = die_count(row)
        totals.setdefault(row.lot, []).append((g, b))
    out: dict[str, tuple[int, int]] = {}
    for lot, parts in totals.items():
        good = sum(g for g, _b in parts)
        bad = sum(b for _g, b in parts)
        out[lot] = (good, bad)
    return out


def yield_pct(good: int, bad: int) -> float:
    total = good + bad
    if total <= 0:
        return 0.0
    return round(good * 10000 / total) / 100


def answers_of(files: list[MesFile], equipment: list[Equip]) -> dict[str, str]:
    rows = process(files, equipment)
    by_equip = {e.eid: e for e in equipment}
    lot_stats = lot_yield(rows)

    q1_lots = set()
    for row in rows:
        day = row.ts[:10]
        if not (Q1_FROM <= day <= Q1_TO):
            continue
        equip = by_equip[row.equip]
        if equip.group != "DRY":
            continue
        q1_lots.add(row.lot)
    q1 = str(len(q1_lots))

    wet_lot_ids = {row.lot for row in rows if by_equip[row.equip].group == "WET"}
    wet_values = [yield_pct(*lot_stats[lot]) for lot in wet_lot_ids if lot in lot_stats]
    q2 = f"{round(sum(wet_values) / len(wet_values), 2):.2f}" if wet_values else "0.00"

    op_bad: dict[str, int] = {}
    for row in rows:
        if row.defect not in DEFECT_GROUP or DEFECT_GROUP[row.defect] != "OP":
            continue
        g, b = die_count(row)
        op_bad[row.equip] = op_bad.get(row.equip, 0) + b
    if op_bad:
        top = max(op_bad.values())
        q3 = join_codes([eid for eid, value in op_bad.items() if value == top])
    else:
        q3 = ""

    met_low: list[str] = []
    for lot, (g, b) in lot_stats.items():
        sample = next(r for r in rows if r.lot == lot)
        if by_equip[sample.equip].group != "MET":
            continue
        if yield_pct(g, b) < YIELD_FLOOR["MET"]:
            met_low.append(lot)
    q4 = join_codes(met_low)

    return {"q1": q1, "q2": q2, "q3": q3, "q4": q4}


def draw_flow(target: Path) -> None:
    ensure_font()
    img = Image.new("RGB", (720, 200), "white")
    draw = ImageDraw.Draw(img)
    font = ImageFont.truetype(str(FONT_TTF), 18)
    steps = ["입고", "DRY", "WET", "MET", "검사", "출하"]
    x = 30
    for index, label in enumerate(steps):
        draw.rectangle([x, 70, x + 90, 120], outline="black", width=2)
        draw.text((x + 18, 88), label, fill="black", font=font)
        if index < len(steps) - 1:
            draw.line([x + 90, 95, x + 120, 95], fill="black", width=2)
            draw.polygon([x + 120, 95, x + 112, 90, x + 112, 100], fill="black")
        x += 120
    draw.text((30, 20), "미르반도체 FAB-3 공정 흐름 (참고)", fill="black", font=font)
    target.parent.mkdir(parents=True, exist_ok=True)
    img.save(target)


def build() -> dict:
    rng = random.Random(9101)
    equipment = make_equipment()
    serial = [2000]
    mes_files = build_rows(rng, equipment, serial)
    answers = answers_of(mes_files, equipment)
    if int(answers["q1"]) < 5 or not answers["q3"] or not answers["q4"]:
        raise SystemExit(f"수율 정답 조정 필요 {answers}")

    threshold_rows = [f"{group}|{limit:.2f}" for group, limit in YIELD_FLOOR.items()]
    defect_rows = [f"{code}|{grp}" for code, grp in sorted(DEFECT_GROUP.items())]
    policy = "\n".join(
        [
            "미르반도체 웨이퍼 로트 수율 분석 기준.",
            f"기간 {START} {END}",
            "제1조 기간. 측정일시의 날짜가 2026-09-08보다 전이거나 2026-09-21보다 뒤면 그 행은 버린다.",
            "제2조 장비 상태. 장비 마스터의 상태가 RUN인 날의 행만 집계한다. 발효일이 2026-09-08 이전이거나 같으면 기간 전체가 그 상태다. 발효일이 2026-09-21보다 뒤면 기간 전체는 RUN이다. 발효일이 기간 안이면 발효일 전날까지 RUN이고 발효일 당일부터 적힌 상태다. PM이나 DOWN인 날의 행은 수율 집계에서 뺀다.",
            "제3조 무효. 유효성 열이 무효인 행은 버린다. 표기건수와 소계는 쓰지 않는다.",
            "제4조 R&D. 로트번호가 RND- 또는 ENG- 로 시작하면 모든 집계에서 뺀다.",
            "제5조 재측정. 같은 로트, 웨이퍼, 공정단계의 행이 여러 번이면 제출시각이 가장 늦은 행만 남긴다.",
            "제6조 정정. 정정 표는 측정 표 아래를 따른다. 재측정을 정리한 뒤 로트, 웨이퍼, 공정단계, 측정일시가 모두 같은 행에만 적용한다. 취소는 그 행을 지운다. 정정은 good 또는 bad 열을 새값으로 바꾼다.",
            "제7조 단위. 단위가 K이면 good과 bad에 1000을 곱해 die로 환산한다. EA는 그대로 쓴다.",
            "제8조 로트 수율. 로트의 수율은 그 로트에 남은 유효 행의 good die 합을 good+bad die 합으로 나눈 값에 100을 곱한다. 소수 셋째 자리에서 반올림해 둘째 자리까지 쓴다.",
            "제9조 평균 수율. 장비군에 속한 장비에서 측정된 로트만 대상으로 로트 수율의 산술평균을 구한다. 같은 방식으로 반올림한다.",
            "제10조 불량 그룹. 불량 코드는 아래 표의 그룹으로 묶는다. 집계는 bad die 수를 더한다.",
            "제11조 기준 미달. 장비군별 수율 하한은 아래 표다. 로트 수율이 하한보다 작으면 미달이다. 같으면 미달이 아니다.",
            "",
            block("DEFECTS", "불량코드|그룹", defect_rows),
            block("LIMITS", "장비군|수율하한(%)", threshold_rows),
        ]
    )
    equip_rows = [f"{e.eid}|{e.name}|{e.group}|{e.state}|{e.effective}" for e in equipment]
    master = "미르반도체 장비 마스터.\n\n" + block("EQUIP", "장비ID|장비명|장비군|상태|발효일", equip_rows)

    files = [
        pdf_file(SET_ID, "policy", "01_수율_분석_기준.pdf", "수율 분석 기준", policy, ISSUER, "수율 분석", "01_policy.pdf"),
        pdf_file(SET_ID, "master", "02_장비_마스터.csv", "장비 마스터", master, ISSUER, "장비 마스터", "02_equip.pdf"),
        png_file(SET_ID, "flow", "03_공정_흐름.png", "03_flow.png", "미르반도체 FAB-3 공정 흐름도", draw_flow),
    ]
    for mes in mes_files:
        row_lines = [
            f"{r.lot}|{r.wafer}|{r.equip}|{r.step}|{r.ts}|{r.good}|{r.bad}|{r.unit}|{r.validity}|{r.defect}|{r.submitted}"
            for r in mes.rows
        ]
        parts = [
            f"미르반도체 측정 데이터. 파일 {mes.title}.",
            f"표기건수 {mes.printed}",
            block("MEAS", "로트|웨이퍼|장비ID|공정단계|측정일시|good|bad|단위|유효성|불량코드|제출시각", row_lines),
        ]
        if mes.fixes:
            fix_lines = [f"{f.action}|{f.lot}|{f.wafer}|{f.step}|{f.ts}|{f.field}|{f.old}|{f.new}" for f in mes.fixes]
            parts.append(block("FIXES", "처리|로트|웨이퍼|공정단계|측정일시|항목|원값|새값", fix_lines))
        parts.append(
            memo_block(
                [
                    "이 문단은 현장 메모이며 표의 행이 아니다.",
                    "CSV 열 이름은 MEAS 표 헤더와 같다.",
                ]
            )
        )
        files.append(
            pdf_file(
                SET_ID,
                mes.fid,
                f"04_측정데이터/{mes.fid}.csv",
                mes.title,
                "\n".join(parts),
                ISSUER,
                "측정 데이터",
                f"meas/{mes.fid}.pdf",
            )
        )

    mistakes = [
        "파일을 한 번에 붙여 글자 한도에 걸린다.",
        "재측정 중복을 모두 더하거나 제출시각이 빠른 행을 남긴다.",
        "무효 행, RND/ENG 로트, PM/DOWN 날짜를 포함한다.",
        "단위 K를 환산하지 않거나 good만 환산한다.",
        "정정·취소를 재측정 정리 전에 적용한다.",
        "기간 경계(9/8, 9/21) 밖 행을 포함한다.",
    ]
    strategy = "기준 PDF에서 기간, 장비 상태, 무효, R&D, 재측정, 정정, 단위 순서를 적는다. 측정 CSV는 파일별로 정리한 뒤 합친다."

    def q_explain(prompt: str, files_note: str, note: str) -> str:
        sample = (
            "모범 프롬프트 예시:\n"
            f"「{prompt}」\n"
            "첨부: 01 수율 분석 기준, 02 장비 마스터, 필요한 04 측정 CSV.\n"
            "규칙: 기간·RUN·재측정 최신·정정·K→×1000·RND 제외를 명시하고, 마지막 줄에 답만 출력.\n"
            "검증: 표기건수 미사용, 로트 수율 반올림 2자리 확인."
        )
        return explain(strategy, mistakes, files_note, note) + "\n" + sample

    q1_prompt = (
        f"2026-09-08부터 2026-09-14까지 DRY 장비군에서 집계에 포함되는 서로 다른 로트 수는 몇 개인가. 숫자만 쓰세요."
    )
    q2_prompt = f"기간 {START}~{END} 동안 WET 장비군 로트 수율의 평균은 몇 %인가. 소수 둘째 자리까지, % 없이 숫자만 쓰세요. 예: 93.45"
    q3_prompt = "OP 불량 그룹에서 bad die 합이 가장 큰 장비ID를 오름차순으로 쓰세요. 동점이면 모두 쓰고 쉼표로 구분합니다."
    q4_prompt = f"MET 장비군에서 로트 수율이 {YIELD_FLOOR['MET']:.2f}% 미만인 로트번호를 오름차순으로 쓰세요. 쉼표 구분, 공백 없음."

    questions = [
        {"prompt": q1_prompt, "answer": answers["q1"], "explanation": q_explain(q1_prompt, "01 기준, 02 마스터, mes-dry.csv (필요 시 mes-x1)", "유효 로트는 최소 한 행이 남은 로트다.")},
        {"prompt": q2_prompt, "answer": answers["q2"], "explanation": q_explain(q2_prompt, "01 기준, 02 마스터, mes-wet.csv", "로트별 수율을 구한 뒤 WET 로트만 평균낸다.")},
        {"prompt": q3_prompt, "answer": answers["q3"], "explanation": q_explain(q3_prompt, "01 기준, 02 마스터, 측정 CSV 전부", "불량코드를 OP 그룹으로 매핑한 뒤 bad die를 장비별로 합산한다.")},
        {"prompt": q4_prompt, "answer": answers["q4"], "explanation": q_explain(q4_prompt, "01 기준, 02 마스터, mes-met.csv", "91.50과 같으면 미달이 아니다.")},
    ]
    passage = (
        "미르반도체 FAB-3의 2026년 9월 웨이퍼 로트 수율을 분석한다. 수율 기준, 장비 마스터, 공정 흐름도, 공정별 측정 CSV 5개가 나뉘어 있다. "
        "한 번에 붙이면 글자 한도를 넘는다. 표기건수는 쓰지 않는다."
    )
    payload = bundle(SET_ID, "미르반도체 웨이퍼 로트 수율 분석", "수율 분석", "어려움", passage, files, questions)
    payload["_ref"] = {"answers": answers}
    return payload
