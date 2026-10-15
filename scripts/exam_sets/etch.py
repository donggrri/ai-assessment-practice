"""한울반도체 식각 장비 로그 이상 판정 (어려움)."""

from __future__ import annotations

import random
from dataclasses import dataclass, field

from .common import block, bundle, explain, join_codes, memo_block, pdf_file, table

SET_ID = "hanul-etch-log-audit"
ISSUER = "한울반도체"
START, END = "2026-07-01", "2026-07-31"

THRESHOLDS = {
    "OXE": {"PRS": (20, 80), "TMP": (55, 75), "RFP": (1200, 1800)},
    "NIE": {"PRS": (30, 90), "TMP": (60, 80), "RFP": (900, 1500)},
    "CLN": {"PRS": (50, 200), "TMP": (40, 60), "RFP": (300, 700)},
}
LOSS = {"PRS": 5, "TMP": 3, "RFP": 8}
UNITS = {"PRS": ("mTorr", "Torr"), "TMP": ("°C", "K"), "RFP": ("W", "kW")}
SENSORS = ["PRS", "TMP", "RFP"]

BAYS = [
    ("B01", "식각1"), ("B02", "식각2"), ("B03", "식각3"), ("B04", "식각4"),
    ("B05", "세정1"), ("B06", "세정2"), ("B07", "박막1"), ("B08", "박막2"),
]
# 챔버ID -> (상태, 발효일)
SPECIAL_STATES = {
    "CH-0202": ("PM", "2026-07-15"),
    "CH-0402": ("PM", "2026-07-15"),
    "CH-0701": ("PM", "2026-07-15"),
    "CH-0303": ("폐기", "2026-07-22"),
    "CH-0501": ("PM", "2026-08-05"),
    "CH-0802": ("PM", "2026-08-05"),
    "CH-0601": ("PM", "2026-06-20"),
}


@dataclass
class Chamber:
    cid: str
    tool: str
    bay: str
    recipe: str
    state: str = "가동"
    effective: str = "2026-01-01"


@dataclass
class Reading:
    cid: str
    tool: str
    ts: str
    sensor: str
    value: int
    alt_unit: bool
    lot: str
    submitted: str

    @property
    def unit(self) -> str:
        return UNITS[self.sensor][1 if self.alt_unit else 0]

    @property
    def raw(self) -> str:
        return raw_text(self.sensor, self.value, self.alt_unit)

    @property
    def key(self) -> tuple[str, str, str]:
        return (self.cid, self.ts, self.sensor)


@dataclass
class Fix:
    action: str
    cid: str
    ts: str
    sensor: str
    raw: str
    new: str


@dataclass
class BayFile:
    code: str
    title: str
    readings: list[Reading] = field(default_factory=list)
    fixes: list[Fix] = field(default_factory=list)
    printed: int = 0


def raw_text(sensor: str, value: int, alt: bool) -> str:
    if sensor == "PRS":
        return f"{value / 1000:.3f}" if alt else str(value)
    if sensor == "TMP":
        return str(value + 273) if alt else str(value)
    return f"{value / 1000:.2f}" if alt else str(value)


def state_on(chamber: Chamber, day: str) -> str:
    if chamber.effective <= START:
        return chamber.state
    if chamber.effective > END:
        return "가동"
    if day < chamber.effective:
        return "가동"
    return chamber.state


def make_chambers() -> list[Chamber]:
    chambers: list[Chamber] = []
    tools = [f"ETX-{11 + index * 2}" for index in range(21)]
    index = 0
    for bay_index, (code, _title) in enumerate(BAYS, start=1):
        for slot in range(1, 4):
            cid = f"CH-{bay_index:02d}{slot:02d}"
            tool = tools[index] if index < 21 else tools[index - 21]
            recipe = ["OXE", "NIE", "CLN"][(bay_index + slot) % 3]
            chamber = Chamber(cid, tool, code, recipe)
            if cid in SPECIAL_STATES:
                chamber.state, chamber.effective = SPECIAL_STATES[cid]
            chambers.append(chamber)
            index += 1
    return chambers


def in_range(rng: random.Random, sensor: str, recipe: str) -> int:
    low, high = THRESHOLDS[recipe][sensor]
    step = 10 if sensor == "RFP" else 1
    return rng.randrange(low // step, high // step + 1) * step


def out_of_range(rng: random.Random, sensor: str, recipe: str, side: str | None = None) -> int:
    low, high = THRESHOLDS[recipe][sensor]
    step = 10 if sensor == "RFP" else 1
    delta = rng.randrange(1, 8) * step
    if side is None:
        side = rng.choice(["low", "high"])
    if side == "low":
        return low - delta
    return high + delta


def fmt_ts(day: int, hour: int, minute: int, month: int = 7) -> str:
    return f"2026-{month:02d}-{day:02d} {hour:02d}:{minute:02d}"


def submit_after(rng: random.Random, ts: str, late_hours: int) -> str:
    month, day = int(ts[5:7]), int(ts[8:10])
    hour = int(ts[11:13]) + late_hours
    minute = int(ts[14:16])
    day += hour // 24
    hour %= 24
    if day > 31 and month == 7:
        month, day = 8, day - 31
    return f"{month:02d}-{day:02d} {hour:02d}:{minute:02d}"


def build_bay(rng: random.Random, bay: str, title: str, chambers: list[Chamber], lot_serial: list[int]) -> BayFile:
    mine = [item for item in chambers if item.bay == bay]
    out = BayFile(bay, title)
    used: set[tuple[str, str, str]] = set()

    def lot(eng: bool = False) -> str:
        lot_serial[0] += 1
        letter = rng.choice("ABCDEFGH")
        return f"ENG-{lot_serial[0]:04d}" if eng else f"LOT-{letter}{lot_serial[0]:04d}"

    def add(chamber: Chamber, ts: str, sensor: str, value: int, *, alt: bool | None = None, eng: bool = False, late: int | None = None) -> Reading | None:
        key = (chamber.cid, ts, sensor)
        if key in used:
            return None
        used.add(key)
        use_alt = rng.random() < 0.16 if alt is None else alt
        row = Reading(chamber.cid, chamber.tool, ts, sensor, value, use_alt, lot(eng), submit_after(rng, ts, late if late is not None else rng.randrange(1, 6)))
        out.readings.append(row)
        return row

    def stamp(day: int | None = None, month: int = 7) -> str:
        return fmt_ts(day if day is not None else rng.randrange(1, 32), rng.randrange(6, 22), rng.randrange(0, 12) * 5, month)

    for chamber in mine:
        for index in range(15):
            sensor = SENSORS[index % 3]
            add(chamber, stamp(), sensor, in_range(rng, sensor, chamber.recipe))
        for sensor in SENSORS[:2]:
            low, high = THRESHOLDS[chamber.recipe][sensor]
            add(chamber, stamp(), sensor, rng.choice([low, high]))
        low, high = THRESHOLDS[chamber.recipe]["RFP"]
        add(chamber, stamp(), "RFP", rng.choice([low, high]))

    for chamber in mine:
        for _ in range(2):
            sensor = rng.choice(SENSORS)
            side = "high" if chamber.recipe == "CLN" and sensor == "PRS" else None
            day = rng.randrange(1, 30)
            effective = chamber.effective if START < chamber.effective <= END else None
            if effective and day >= int(effective[8:10]) - 1:
                day = max(1, int(effective[8:10]) - 4)
            add(chamber, stamp(day), sensor, out_of_range(rng, sensor, chamber.recipe, side))

    cleaner = next(item for item in mine if item.recipe == "CLN")
    add(cleaner, stamp(rng.randrange(1, 28)), "PRS", THRESHOLDS["CLN"]["PRS"][0] - rng.randrange(3, 20))

    for chamber in mine:
        if START < chamber.effective <= END:
            day = int(chamber.effective[8:10])
            sensor = rng.choice(SENSORS)
            add(chamber, stamp(day - 1), sensor, out_of_range(rng, sensor, chamber.recipe, "high" if sensor == "PRS" else None))
            sensor = rng.choice(SENSORS)
            add(chamber, stamp(day), sensor, out_of_range(rng, sensor, chamber.recipe, "high" if sensor == "PRS" else None))
            sensor = rng.choice(SENSORS)
            add(chamber, stamp(day + 2), sensor, out_of_range(rng, sensor, chamber.recipe, "high" if sensor == "PRS" else None))
        elif chamber.effective < START:
            sensor = rng.choice(SENSORS)
            add(chamber, stamp(rng.randrange(1, 28)), sensor, out_of_range(rng, sensor, chamber.recipe, "high" if sensor == "PRS" else None))
        elif chamber.effective > END:
            sensor = rng.choice(SENSORS)
            add(chamber, stamp(31), sensor, out_of_range(rng, sensor, chamber.recipe, "high" if sensor == "PRS" else None))
            sensor = rng.choice(SENSORS)
            add(chamber, stamp(rng.randrange(1, 3), 8), sensor, out_of_range(rng, sensor, chamber.recipe, "high" if sensor == "PRS" else None))

    by_cid = {item.cid: item for item in mine}
    for _ in range(2):
        chamber = rng.choice(mine)
        sensor = rng.choice(SENSORS)
        month, day = rng.choice([(6, 29), (6, 30), (8, 1), (8, 2)])
        add(chamber, stamp(day, month), sensor, out_of_range(rng, sensor, chamber.recipe, "high" if sensor == "PRS" and chamber.recipe == "CLN" else None))

    for _ in range(2):
        chamber = rng.choice(mine)
        sensor = rng.choice(SENSORS)
        add(chamber, stamp(rng.randrange(1, 29)), sensor, out_of_range(rng, sensor, chamber.recipe, "high" if sensor == "PRS" and chamber.recipe == "CLN" else None), eng=True)

    active = [item for item in mine if item.state == "가동" and item.effective <= START]
    base_rows = [row for row in out.readings if row.cid in {item.cid for item in active}]
    candidates = [row for row in base_rows if THRESHOLDS[by_cid[row.cid].recipe][row.sensor][0] <= row.value <= THRESHOLDS[by_cid[row.cid].recipe][row.sensor][1]]
    rng.shuffle(candidates)
    pairs = candidates[:6]
    for index, row in enumerate(pairs):
        chamber = by_cid[row.cid]
        side = "high" if row.sensor == "PRS" and chamber.recipe == "CLN" else None
        bad = out_of_range(rng, row.sensor, chamber.recipe, side)
        twin = Reading(row.cid, row.tool, row.ts, row.sensor, bad, rng.random() < 0.2, row.lot, "")
        early, late = submit_after(rng, row.ts, 1), submit_after(rng, row.ts, 30)
        if index % 2 == 0:
            row.submitted, twin.submitted = late, early
        else:
            row.submitted, twin.submitted = early, late
        out.readings.append(twin)

    keys: dict[tuple[str, str, str], list[Reading]] = {}
    for item in out.readings:
        keys.setdefault(item.key, []).append(item)
    supersede = {key for key, items in keys.items() if len(items) > 1}
    winners = {key: max(items, key=lambda entry: entry.submitted) for key, items in keys.items() if len(items) > 1}

    survivors = [item for item in out.readings if item.key not in supersede or winners[item.key] is item]
    fix_pool = [row for row in survivors if row.cid in {item.cid for item in active} and START <= row.ts[:10] <= END and not row.lot.startswith("ENG-")]
    rng.shuffle(fix_pool)
    bad_pool = [row for row in fix_pool if not (THRESHOLDS[by_cid[row.cid].recipe][row.sensor][0] <= row.value <= THRESHOLDS[by_cid[row.cid].recipe][row.sensor][1])]
    good_pool = [row for row in fix_pool if THRESHOLDS[by_cid[row.cid].recipe][row.sensor][0] <= row.value <= THRESHOLDS[by_cid[row.cid].recipe][row.sensor][1]]
    if bad_pool:
        row = bad_pool[0]
        out.fixes.append(Fix("취소", row.cid, row.ts, row.sensor, row.raw, "-"))
    if len(bad_pool) > 1:
        row = bad_pool[1]
        chamber = by_cid[row.cid]
        new = in_range(rng, row.sensor, chamber.recipe)
        out.fixes.append(Fix("정정", row.cid, row.ts, row.sensor, row.raw, raw_text(row.sensor, new, row.alt_unit)))
    if good_pool:
        row = good_pool[0]
        chamber = by_cid[row.cid]
        side = "high" if row.sensor == "PRS" and chamber.recipe == "CLN" else None
        new = out_of_range(rng, row.sensor, chamber.recipe, side)
        out.fixes.append(Fix("정정", row.cid, row.ts, row.sensor, row.raw, raw_text(row.sensor, new, row.alt_unit)))
    stale = [item for item in out.readings if item.key in supersede and winners[item.key] is not item]
    if stale and bay in {"B02", "B05", "B07"}:
        row = stale[0]
        out.fixes.append(Fix("정정", row.cid, row.ts, row.sensor, row.raw, raw_text(row.sensor, in_range(rng, row.sensor, by_cid[row.cid].recipe), row.alt_unit)))
    out.readings.sort(key=lambda item: (item.ts, item.cid, item.sensor, rng.random()))
    out.printed = len(out.readings) + 7
    return out


def evaluate(bays: list[BayFile], chambers: list[Chamber]) -> dict[str, list[tuple[str, str, int]]]:
    by_cid = {item.cid: item for item in chambers}
    result: dict[str, list[tuple[str, str, int]]] = {}
    for bay in bays:
        winners: dict[tuple[str, str, str], Reading] = {}
        for row in bay.readings:
            current = winners.get(row.key)
            if current is None or row.submitted > current.submitted:
                winners[row.key] = row
        kept: list[tuple[Reading, int]] = []
        for row in winners.values():
            value = row.value
            drop = False
            for fix in bay.fixes:
                if (fix.cid, fix.ts, fix.sensor) == row.key and fix.raw == row.raw:
                    if fix.action == "취소":
                        drop = True
                    else:
                        number = float(fix.new)
                        if row.sensor == "PRS":
                            value = round(number * 1000) if row.alt_unit else int(number)
                        elif row.sensor == "TMP":
                            value = round(number - 273) if row.alt_unit else int(number)
                        else:
                            value = round(number * 1000) if row.alt_unit else int(number)
                    break
            if not drop:
                kept.append((row, value))
        rows: list[tuple[str, str, int]] = []
        for row, value in kept:
            day = row.ts[:10]
            if not (START <= day <= END):
                continue
            chamber = by_cid[row.cid]
            if state_on(chamber, day) != "가동":
                continue
            if row.lot.startswith("ENG-"):
                continue
            low, high = THRESHOLDS[chamber.recipe][row.sensor]
            if value > high or (value < low and not (chamber.recipe == "CLN" and row.sensor == "PRS")):
                rows.append((row.cid, row.sensor, LOSS[row.sensor]))
        result[bay.code] = rows
    return result


def answers_of(result: dict[str, list[tuple[str, str, int]]]) -> dict[str, str]:
    q1 = join_codes(cid for code in ("B03", "B06") for cid, _s, _l in result[code])
    q2 = str(sum(len(rows) for rows in result.values()))
    q3 = str(sum(loss for _c, _s, loss in result["B01"]))
    q4 = str(sum(loss for rows in result.values() for _c, _s, loss in rows))
    return {"q1": q1, "q2": q2, "q3": q3, "q4": q4}


def build() -> dict:
    chambers = make_chambers()
    rng = random.Random(7141)
    serial = [100]
    bays = [build_bay(rng, code, title, chambers, serial) for code, title in BAYS]
    result = evaluate(bays, chambers)
    answers = answers_of(result)
    if len(answers["q1"].split(",")) < 2 or int(answers["q3"]) < 20:
        raise SystemExit(f"식각 정답 조정 필요 {answers}")

    threshold_rows = [
        f"{recipe}|{sensor}|{low}|{high}|{UNITS[sensor][0]}|{LOSS[sensor]}"
        for recipe, sensors in THRESHOLDS.items()
        for sensor, (low, high) in sensors.items()
    ]
    policy = "\n".join(
        [
            "한울반도체 식각 장비 로그 이상 판정 규정.",
            f"기간 {START} {END}",
            "제1조 기간. 측정일이 2026-07-01보다 전이거나 2026-07-31보다 뒤인 행은 버린다. 측정일은 측정일시의 날짜 부분이다.",
            "제2조 상태. 챔버 마스터의 상태가 가동인 날의 행만 판정한다. 발효일이 2026-07-01 이전이거나 같으면 7월 전체가 그 상태다. 발효일이 2026-07-31보다 뒤면 7월 전체는 가동이다. 발효일이 7월 안이면 발효일 전날까지는 가동이고 발효일 당일부터 적힌 상태다. 예외가 명시되지 않은 한 발효일 이전은 가동으로 본다. PM이나 폐기인 날의 행은 판정에서 뺀다.",
            "제3조 중복. 같은 챔버ID, 측정일시, 센서의 행이 여러 번 제출되면 제출시각이 가장 늦은 행만 남긴다. 파일에서 몇 번째 줄인지는 상관없다.",
            "제4조 정정. 정정 기록은 로그 표 아래에 있다. 중복을 정리한 뒤 챔버ID, 측정일시, 센서, 원값이 모두 같은 남은 행에만 적용한다. 취소는 그 행을 지우고 정정은 값을 새값으로 바꾼다. 맞는 행이 없으면 무시한다. 새값의 단위는 그 행의 단위와 같다.",
            "제5조 단위. 판정은 기준 단위로 한다. 압력은 mTorr이며 1 Torr는 1000 mTorr다. 온도는 °C이며 K 값에서 273을 빼서 구한다. RF 파워는 W이며 1 kW는 1000 W다.",
            "제6조 판정. 기준 단위로 바꾼 센서값이 판정 기준표의 하한보다 작거나 상한보다 크면 이상이다. 하한이나 상한과 같으면 정상이다. 기준은 챔버 마스터의 레시피군에 따른다.",
            "제7조 면제. 로트 번호가 ENG- 로 시작하는 행은 판정에서 뺀다. 레시피군이 CLN이면 압력이 하한보다 작은 것은 이상이 아니다. 압력이 상한을 넘으면 이상이다.",
            "제8조 손실. 이상으로 판정된 행 1건마다 기준표의 건당손실 웨이퍼를 더한다. 손실은 센서마다 다르다.",
            "제9조 소계. 파일 머리의 표기건수와 표 아래 소계 건수는 사용하지 않는다. 장비명이 같아도 챔버ID가 다르면 다른 챔버다. 판정과 집계는 챔버ID로 한다.",
            "",
            block("THRESHOLDS", "레시피군|센서|하한|상한|기준단위|건당손실", threshold_rows),
        ]
    )
    chamber_rows = [
        f"{item.cid}|{item.tool}|{item.bay}|{item.recipe}|{item.state}|{item.effective}"
        for item in sorted(chambers, key=lambda item: (item.tool, item.cid))
    ]
    master = (
        "한울반도체 식각 챔버 마스터. 장비명 순이며 베이로 묶여 있지 않다.\n\n"
        + block("CHAMBERS", "챔버ID|장비명|베이|레시피군|상태|발효일", chamber_rows)
    )
    files = [
        pdf_file(SET_ID, "policy", "01_이상판정_규정.pdf", "이상 판정 규정", policy, ISSUER, "식각 로그 판정", "01_policy.pdf"),
        pdf_file(SET_ID, "master", "02_챔버_마스터.pdf", "챔버 마스터", master, ISSUER, "챔버 마스터", "02_chambers.pdf"),
    ]
    for bay in bays:
        reading_rows = [
            f"{row.cid}|{row.tool}|{row.ts}|{row.sensor}|{row.raw}|{row.unit}|{row.lot}|{row.submitted}" for row in bay.readings
        ]
        fix_rows = [f"{fix.action}|{fix.cid}|{fix.ts}|{fix.sensor}|{fix.raw}|{fix.new}" for fix in bay.fixes]
        parts = [
            f"한울반도체 식각 센서 로그. 베이 {bay.code}. 베이명 {bay.title}.",
            f"표기건수 {bay.printed}",
            block("READINGS", "챔버ID|장비명|측정일시|센서|값|단위|로트|제출시각", reading_rows),
        ]
        if fix_rows:
            parts.append(block("FIXES", "처리|챔버ID|측정일시|센서|원값|새값", fix_rows))
        parts.append(
            memo_block(
                [
                    "이 문단은 현장 메모이며 표의 행이 아니다. 표기건수와 소계는 다시 더하지 않는다.",
                    f"{bay.title} 베이 메모. 점검 순서는 규정, 챔버 마스터, 이 파일 순서로 읽는다.",
                    "메모에 적힌 숫자는 예시이며 판정에 쓰지 않는다. 예: 지난 달 압력 이상 보고 17건.",
                ]
            )
        )
        files.append(
            pdf_file(
                SET_ID,
                f"bay-{bay.code.lower()}",
                f"03_베이별_센서로그/{bay.code}_{bay.title}.pdf",
                f"{bay.title} 센서 로그",
                "\n".join(parts),
                ISSUER,
                "베이 센서 로그",
                f"bays/{bay.code}.pdf",
            )
        )

    mistakes = [
        "파일을 한꺼번에 붙여 글자 한도에 걸린다.",
        "Torr, K, kW 값을 단위 변환 없이 기준표와 비교한다.",
        "같은 측정을 다시 제출한 행을 모두 센다. 제출시각이 가장 늦은 행만 남긴다.",
        "PM이나 폐기 발효일 당일의 행을 아직 가동으로 본다.",
        "정정을 원값이 맞지 않는 행에 적용하거나, 취소된 행을 센다.",
        "ENG- 로트와 CLN 압력 하한 예외를 놓친다. 장비명이 같다고 같은 챔버로 합친다.",
    ]
    strategy = "규정에서 기간, 상태 발효일, 중복, 정정 순서, 단위, 면제를 먼저 적는다. 큰 로그는 파일마다 같은 표로 정리한 뒤 합친다."
    questions = [
        {
            "prompt": "B03 파일과 B06 파일에 있는 챔버 중 이상으로 판정된 행이 1건 이상인 챔버ID를 오름차순으로 쓰세요. 쉼표로 구분하고 공백은 넣지 않습니다.",
            "answer": answers["q1"],
            "explanation": explain(strategy, mistakes, "01 규정, 02 챔버 마스터, B03, B06 (두 베이 파일만 붙여도 한도 안에서 풀린다)", "챔버ID가 그 파일의 베이와 다른 행은 없다. 두 파일을 합쳐 이상 행이 있는 챔버만 모은다."),
        },
        {
            "prompt": "7월 전체 베이에서 이상으로 판정된 행은 모두 몇 건인가. 숫자만 쓰세요.",
            "answer": answers["q2"],
            "explanation": explain(strategy, mistakes, "01 규정, 02 챔버 마스터, B01~B08 전부 (파일별로 나눠 건수를 구한 뒤 더한다)", "표기건수가 아니라 규정을 적용해 남은 이상 행의 수다."),
        },
        {
            "prompt": "B01 파일만 기준으로, 이상으로 판정된 행들의 손실 웨이퍼 합계는 몇 장인가. 숫자만 쓰세요.",
            "answer": answers["q3"],
            "explanation": explain(strategy, mistakes, "01 규정, 02 챔버 마스터, B01", "건당손실은 센서마다 다르다. 이상 행마다 해당 센서의 손실을 더한다."),
        },
        {
            "prompt": "7월 전체 베이에서 이상으로 판정된 행들의 손실 웨이퍼 합계는 몇 장인가. 숫자만 쓰세요.",
            "answer": answers["q4"],
            "explanation": explain(strategy, mistakes, "01 규정, 02 챔버 마스터, B01~B08 전부", "베이마다 센서별 이상 건수를 세어 건당손실을 곱한 뒤 더한다."),
        },
    ]
    passage = (
        "한울반도체 FAB-2 식각 장비의 2026년 7월 챔버 센서 로그를 점검한다. 규정과 챔버 마스터, 베이별 센서 로그 8개가 나뉘어 있다. "
        "문제마다 필요한 파일이 다르며, 전부 한 번에 붙이면 글자 한도를 넘는다. 표기건수와 소계는 쓰지 않는다."
    )
    payload = bundle(SET_ID, "한울반도체 식각 장비 로그 이상 판정", "장비 로그", "어려움", passage, files, questions)
    payload["_ref"] = {"answers": answers}
    return payload
