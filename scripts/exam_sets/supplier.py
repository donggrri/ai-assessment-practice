"""미래모듈 공급사 납기·품질 패널티 정산 (어려움)."""

from __future__ import annotations

import datetime as dt
import random
from dataclasses import dataclass, field
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from official_pdf import FONT_TTF, ensure_font

from .common import PUBLIC, block, bundle, explain, join_codes, memo_block, pdf_file, png_file

SET_ID = "mirae-supplier-penalty"
ISSUER = "미래모듈"
START, END = "2026-04-01", "2026-06-30"

GRADE_BP = {"A": 20, "B": 40, "C": 70}
FX = {
    "04": {"USD": 1352, "EUR": 1468, "JPY": 921, "CNY": 187},
    "05": {"USD": 1344, "EUR": 1459, "JPY": 927, "CNY": 186},
    "06": {"USD": 1337, "EUR": 1451, "JPY": 934, "CNY": 185},
}
UNIT = {"KRW": 1, "USD": 1, "EUR": 1, "JPY": 100, "CNY": 1}
PART_CODES = ["CAP-100", "RES-220", "PCB-310", "CON-045", "IC-8800", "SEN-120", "BRK-22", "FAN-60", "LED-35", "PWR-90"]

SUPPLIERS = [
    ("S01", "대성전자", "KRW", "B", "-", "-"),
    ("S02", "블루웨이브", "USD", "B", "C", "2026-05-16"),
    ("S03", "도쿄프리시전", "JPY", "C", "-", "-"),
    ("S04", "라인메탈", "EUR", "A", "-", "-"),
    ("S05", "선셋마이크로", "USD", "A", "B", "2026-06-01"),
    ("S06", "화동부품", "CNY", "C", "-", "-"),
    ("S07", "한결정밀", "KRW", "C", "B", "2026-04-20"),
    ("S08", "코발트세미", "USD", "B", "-", "-"),
    ("S09", "오사카테크", "JPY", "B", "C", "2026-07-10"),
    ("S10", "노바컴포넌트", "EUR", "C", "-", "-"),
]


@dataclass
class Order:
    po: str
    date: str
    part: str
    price: int
    qty: int
    due: str
    recv_date: str
    recv_qty: int
    defects: int
    reason: str
    submitted: str


@dataclass
class Fix:
    action: str
    po: str
    item: str
    new: str


@dataclass
class Supplier:
    code: str
    name: str
    cur: str
    grade: str
    new_grade: str
    eff: str
    orders: list[Order] = field(default_factory=list)
    fixes: list[Fix] = field(default_factory=list)
    printed: int = 0


def add_days(date: str, days: int) -> str:
    return (dt.date.fromisoformat(date) + dt.timedelta(days=days)).isoformat()


def days_between(first: str, second: str) -> int:
    return (dt.date.fromisoformat(second) - dt.date.fromisoformat(first)).days


def won(foreign: int, cur: str, month: str) -> int:
    if cur == "KRW":
        return foreign
    return foreign * FX[month][cur] // UNIT[cur]


def grade_on(supplier: Supplier, date: str) -> str:
    if supplier.eff != "-" and date >= supplier.eff:
        return supplier.new_grade
    return supplier.grade


def settle(supplier: Supplier) -> list[dict]:
    latest: dict[str, Order] = {}
    for order in supplier.orders:
        current = latest.get(order.po)
        if current is None or order.submitted > current.submitted:
            latest[order.po] = order
    out: list[dict] = []
    for order in latest.values():
        recv_date, defects = order.recv_date, order.defects
        cancelled = False
        for fix in supplier.fixes:
            if fix.po != order.po:
                continue
            if fix.action == "취소":
                cancelled = True
            elif fix.item == "입고일":
                recv_date = fix.new
            elif fix.item == "불량수":
                defects = int(fix.new)
        if cancelled or not (START <= order.date <= END):
            continue
        month = order.date[5:7]
        amount = won(order.price * order.qty, supplier.cur, month)
        late_days = max(0, days_between(order.due, recv_date))
        bp = GRADE_BP[grade_on(supplier, order.date)]
        raw = amount * bp * late_days // 10000
        cap = amount // 10
        exempt = order.reason == "FM"
        late = 0 if exempt else min(raw, cap)
        capped = (not exempt) and raw > cap
        if defects * 100 > 5 * order.recv_qty:
            mult = 2
        elif defects * 100 > 2 * order.recv_qty:
            mult = 1
        else:
            mult = 0
        defect = won(defects * order.price * mult, supplier.cur, month)
        out.append({"po": order.po, "late": late, "capped": capped, "defect": defect})
    return out


def build_supplier(rng: random.Random, supplier: Supplier, index: int) -> None:
    seq = [0]
    price_range = {"KRW": (15, 90), "USD": (3, 45), "EUR": (3, 40), "JPY": (6, 100), "CNY": (20, 200)}[supplier.cur]
    price_step = 100 if supplier.cur == "KRW" else 50 if supplier.cur == "JPY" else 1

    def new_po() -> str:
        seq[0] += 1
        return f"PO-{index:02d}{seq[0]:03d}"

    def price() -> int:
        return rng.randrange(price_range[0], price_range[1]) * price_step

    def submit(recv: str, plus: int | None = None) -> str:
        day = add_days(recv, plus if plus is not None else rng.randrange(1, 3))
        return f"{day} {rng.randrange(8, 18):02d}:{rng.randrange(0, 60):02d}"

    def add(date: str, delay: int, *, qty: int | None = None, defect_ratio: tuple[int, int] | None = None, reason: str = "-", lead: int | None = None) -> Order:
        quantity = qty if qty is not None else rng.randrange(5, 60) * 100
        due = add_days(date, lead if lead is not None else rng.randrange(14, 41))
        recv = add_days(due, delay)
        recv_qty = quantity - (rng.randrange(0, 3) * 10 if rng.random() < 0.2 else 0)
        if defect_ratio:
            numerator, denominator = defect_ratio
            recv_qty = denominator
            defects = numerator
        else:
            defects = int(recv_qty * rng.uniform(0, 0.0185))
        order = Order(new_po(), date, rng.choice(PART_CODES), price(), quantity, due, recv, recv_qty, defects, reason, submit(recv))
        supplier.orders.append(order)
        return order

    def day(month_from: int = 4, month_to: int = 6) -> str:
        month = rng.randrange(month_from, month_to + 1)
        last = 30 if month in (4, 6) else 31
        return f"2026-{month:02d}-{rng.randrange(1, last + 1):02d}"

    for _ in range(18):
        add(day(), rng.choice([-6, -3, -1, 0, 0, 0, 1, 2, 3, 5, 8]))
    for _ in range(3):
        add(day(), rng.randrange(18, 46))
    add(day(), rng.randrange(6, 14), reason="FM")
    add(day(), rng.randrange(9, 20), reason="FM")
    add(day(), rng.randrange(5, 12), reason="FMX")
    add(day(), rng.randrange(4, 10), reason="통관지연")
    add(day(), rng.randrange(20, 40), reason="FM")
    add(day(), 0, defect_ratio=(40, 2000))
    add(day(), 0, defect_ratio=(50, 1000))
    add(day(), 0, defect_ratio=(51, 1000))
    add(day(), 0, defect_ratio=(30, 1000))
    add(day(), 0, defect_ratio=(120, 1500))
    add(day(), 2, defect_ratio=(41, 2000))
    if supplier.eff != "-":
        for shift in (-1, 0, 1):
            date = add_days(supplier.eff, shift)
            if START <= date <= END:
                add(date, rng.randrange(8, 17))
    add("2026-03-31", rng.randrange(10, 30), defect_ratio=(150, 1000))
    add("2026-07-01", rng.randrange(10, 30), defect_ratio=(150, 1000))
    add("2026-03-30", rng.randrange(10, 30))
    add("2026-07-02", rng.randrange(10, 30))

    inside = [item for item in supplier.orders if START <= item.date <= END]
    rng.shuffle(inside)
    for item in inside[:3]:
        older = Order(item.po, item.date, item.part, item.price, item.qty, item.due, item.recv_date, item.recv_qty, item.defects, item.reason, "")
        older.recv_date = add_days(item.due, rng.randrange(25, 40))
        older.defects = int(item.recv_qty * 0.06)
        older.reason = "-"
        older.submitted = submit(item.recv_date, 0)
        item.submitted = submit(item.recv_date, 6)
        supplier.orders.append(older)
    for item in inside[3:5]:
        older = Order(item.po, item.date, item.part, item.price, item.qty, item.due, add_days(item.due, -2), item.recv_qty, 0, "-", "")
        older.submitted = submit(item.recv_date, 0)
        item.recv_date = add_days(item.due, rng.randrange(25, 40))
        item.submitted = submit(item.recv_date, 6)
        supplier.orders.append(older)

    heavy = [item for item in inside[5:] if days_between(item.due, item.recv_date) > 10 and item.reason != "FM"]
    for item in heavy[:1]:
        supplier.fixes.append(Fix("취소", item.po, "-", "-"))
    corr = [item for item in inside[5:] if item.po not in {fix.po for fix in supplier.fixes} and item.reason == "-"]
    if corr:
        item = corr[0]
        supplier.fixes.append(Fix("정정", item.po, "입고일", add_days(item.due, rng.randrange(14, 32))))
    if len(corr) > 1:
        item = corr[1]
        supplier.fixes.append(Fix("정정", item.po, "불량수", str(int(item.recv_qty * 0.07) + 1)))
    if len(corr) > 2:
        item = corr[2]
        supplier.fixes.append(Fix("정정", item.po, "입고일", add_days(item.due, -4)))
    heavy2 = [item for item in inside[5:] if days_between(item.due, item.recv_date) >= 18 and item.po not in {fix.po for fix in supplier.fixes} and item.reason == "-"]
    if heavy2:
        supplier.fixes.append(Fix("정정", heavy2[0].po, "입고일", add_days(heavy2[0].due, rng.randrange(1, 8))))
    if index in (2, 5, 8):
        supplier.fixes.append(Fix("정정", f"PO-{index:02d}900", "입고일", "2026-06-30"))

    supplier.orders.sort(key=lambda item: (item.date, item.po, rng.random()))
    supplier.printed = len(supplier.orders) + 13


def answers_of(suppliers: list[Supplier]) -> dict[str, str]:
    results = {item.code: settle(item) for item in suppliers}
    q1 = join_codes(row["po"] for code in ("S03", "S06") for row in results[code] if row["capped"])
    q2 = str(sum(1 for rows in results.values() for row in rows if row["late"] > 0))
    q3 = str(sum(row["defect"] for row in results["S08"]))
    q4 = str(sum(row["late"] + row["defect"] for rows in results.values() for row in rows))
    return {"q1": q1, "q2": q2, "q3": q3, "q4": q4}


def draw_chart(suppliers: list[Supplier]) -> tuple[str, "callable"]:
    counts = {"4월": 0, "5월": 0, "6월": 0}
    for supplier in suppliers:
        for order in supplier.orders:
            if order.date[:7] in {"2026-04", "2026-05", "2026-06"} and days_between(order.due, order.recv_date) > 0:
                counts[f"{int(order.date[5:7])}월"] += 1
    alt = (
        "월별 지연 입고 행 수 막대그래프. 중복 제출, 취소, 정정, 불가항력 면제를 반영하기 전의 원본 행 수다. "
        + ", ".join(f"{month} {value}건" for month, value in counts.items())
        + ". 이 숫자는 패널티 부과 건수가 아니다."
    )

    def draw(path: Path) -> None:
        ensure_font()
        title = ImageFont.truetype(str(FONT_TTF), 22)
        small = ImageFont.truetype(str(FONT_TTF), 16)
        image = Image.new("RGB", (760, 480), "white")
        pen = ImageDraw.Draw(image)
        pen.text((24, 16), "월별 지연 입고 행 수 (원본)", fill="#12344d", font=title)
        pen.text((24, 48), "중복·취소·정정·면제 반영 전", fill="#52667a", font=small)
        peak = max(counts.values())
        for position, (month, value) in enumerate(counts.items()):
            height = int(280 * value / peak)
            x = 120 + position * 190
            pen.rectangle((x, 400 - height, x + 100, 400), fill="#3b6f9c")
            pen.text((x + 30, 408), month, fill="#12344d", font=small)
            pen.text((x + 34, 400 - height - 28), str(value), fill="#12344d", font=title)
        image.save(path, "PNG")

    return alt, draw


def build() -> dict:
    rng = random.Random(4627)
    suppliers = [Supplier(code, name, cur, grade, new_grade, eff) for code, name, cur, grade, new_grade, eff in SUPPLIERS]
    for index, supplier in enumerate(suppliers, start=1):
        build_supplier(rng, supplier, index)
    answers = answers_of(suppliers)
    if len(answers["q1"].split(",")) < 3 or int(answers["q3"]) <= 0:
        raise SystemExit(f"공급사 정답 조정 필요 {answers}")

    grade_rows = [f"{grade}|{bp}" for grade, bp in GRADE_BP.items()]
    policy = "\n".join(
        [
            "미래모듈 공급사 납기 및 품질 패널티 계약 조건.",
            f"기간 {START} {END}",
            "제1조 기간. 발주일이 2026-04-01보다 전이거나 2026-06-30보다 뒤인 발주는 모든 계산에서 버린다.",
            "제2조 중복. 같은 발주번호가 여러 번 제출되면 제출시각이 가장 늦은 행만 남긴다. 파일에서 몇 번째 줄인지는 상관없다.",
            "제3조 정정. 정정 기록은 발주 표 아래에 있다. 중복을 정리한 뒤 발주번호가 같은 남은 행에만 적용한다. 취소는 그 발주를 없앤다. 정정은 항목이 입고일이면 입고일을, 불량수이면 불량수를 새값으로 바꾼다. 맞는 발주가 없으면 무시한다.",
            "제4조 환산. 발주금액은 단가에 발주수량을 곱한 외화 금액을 발주일이 속한 달의 환율로 바꾼 원화다. 원화금액은 외화 금액에 환율을 곱해 단위로 나눈 몫이며 소수점 이하는 버린다. 환율표의 단위가 100이면 환율은 100 단위당 원화다. 통화가 KRW이면 환산하지 않는다.",
            "제5조 등급. 공급사 마스터의 계약등급이 기본 등급이다. 변경발효일이 있으면 발주일이 변경발효일과 같거나 뒤인 발주는 변경등급을 쓴다. 변경발효일이 2026-06-30보다 뒤이면 이번 기간에는 변경등급을 쓰지 않는다. 일 지연율은 등급표를 따른다.",
            "제6조 지연. 지연일수는 입고일에서 납기일을 뺀 달력 일수이며 0보다 작으면 0이다. 지연 패널티는 발주금액에 일 지연율을 곱하고 지연일수를 곱한 뒤 10000으로 나눈 몫이다. 소수점 이하는 버린다.",
            "제7조 상한. 지연 패널티는 발주금액의 10%를 넘을 수 없다. 발주금액을 10으로 나눈 몫이 상한이며, 계산한 패널티가 상한보다 크면 상한을 적용한 것이다. 제8조로 면제되는 발주는 상한을 적용한 발주로 보지 않는다.",
            "제8조 불가항력. 사유가 FM인 발주는 지연 패널티를 내지 않는다. FM과 글자가 다르면 면제가 아니다. 불가항력은 불량 패널티와 무관하다.",
            "제9조 불량. 불량률은 불량수를 입고수량으로 나눈 값이다. 2% 이하이면 패널티가 없다. 2%보다 크고 5% 이하이면 불량수에 단가를 곱한 금액의 1배, 5%보다 크면 2배를 외화로 계산한 뒤 제4조의 환율로 원화로 바꾼다. 환산과 소수점 이하 버림은 발주 건마다 한다.",
            "제10조 합계. 총 패널티는 지연 패널티와 불량 패널티의 합이다. 파일 머리의 표기건수와 표 아래 소계 건수는 사용하지 않는다.",
            "",
            block("GRADES", "등급|일지연율(만분율)", grade_rows),
        ]
    )
    supplier_rows = [f"{s.code}|{s.name}|{s.cur}|{s.grade}|{s.new_grade}|{s.eff}" for s in suppliers]
    master = "미래모듈 공급사 마스터. 공급사코드 순이다.\n\n" + block("SUPPLIERS", "공급사코드|공급사명|통화|계약등급|변경등급|변경발효일", supplier_rows)
    fx_rows = [f"2026-{month}|{cur}|{rate}|{UNIT[cur]}" for month, rates in FX.items() for cur, rate in rates.items()]
    fx = "미래모듈 월별 환율표. 발주일이 속한 달의 행을 쓴다.\n\n" + block("FX", "월|통화|환율|단위", fx_rows)
    alt, draw = draw_chart(suppliers)
    files = [
        pdf_file(SET_ID, "policy", "01_납기품질_패널티_계약조건.pdf", "패널티 계약 조건", policy, ISSUER, "납기·품질 패널티", "01_policy.pdf"),
        pdf_file(SET_ID, "suppliers", "02_공급사_마스터.pdf", "공급사 마스터", master, ISSUER, "공급사 마스터", "02_suppliers.pdf"),
        pdf_file(SET_ID, "fx", "03_월별_환율표.pdf", "월별 환율표", fx, ISSUER, "환율", "03_fx.pdf"),
        png_file(SET_ID, "trend", "04_월별_지연추이.png", "04_trend.png", alt, draw),
    ]
    for supplier in suppliers:
        rows = [
            f"{o.po}|{o.date}|{o.part}|{o.price}|{o.qty}|{o.due}|{o.recv_date}|{o.recv_qty}|{o.defects}|{o.reason}|{o.submitted}"
            for o in supplier.orders
        ]
        parts = [
            f"미래모듈 공급사 발주 입고 대장. 공급사 {supplier.code}. 공급사명 {supplier.name}. 통화 {supplier.cur}.",
            f"표기건수 {supplier.printed}",
            block("ORDERS", "발주번호|발주일|품목|단가|발주수량|납기일|입고일|입고수량|불량수|사유|제출시각", rows),
        ]
        if supplier.fixes:
            parts.append(block("FIXES", "처리|발주번호|항목|새값", [f"{f.action}|{f.po}|{f.item}|{f.new}" for f in supplier.fixes]))
        parts.append(
            memo_block(
                [
                    "이 문단은 현장 메모이며 표의 행이 아니다. 표기건수와 소계는 다시 더하지 않는다.",
                    f"{supplier.name} 대장 메모. 단가는 공급사 통화 기준이며 원화가 아닐 수 있다.",
                    "메모에 적힌 숫자는 예시이며 정산에 쓰지 않는다. 예: 지난 분기 패널티 합계 3800만원.",
                ]
            )
        )
        files.append(
            pdf_file(
                SET_ID,
                f"sup-{supplier.code.lower()}",
                f"05_공급사별_대장/{supplier.code}_{supplier.name}.pdf",
                f"{supplier.name} 발주 입고 대장",
                "\n".join(parts),
                ISSUER,
                "발주 입고 대장",
                f"suppliers/{supplier.code}.pdf",
            )
        )

    mistakes = [
        "파일을 한꺼번에 붙여 글자 한도에 걸린다.",
        "외화를 환산하지 않거나 입고월 환율을 쓴다. 발주일이 속한 달의 환율이며 JPY는 100 단위당이다.",
        "발주일이 변경발효일과 같은 날을 이전 등급으로 계산한다. 변경발효일이 기간 뒤인 공급사에 변경등급을 쓴다.",
        "다시 제출한 같은 발주번호를 모두 센다. 취소와 정정을 빼먹거나 맞지 않는 정정을 적용한다.",
        "FMX나 통관지연 같은 사유를 불가항력으로 본다. 상한을 적용하지 않는다.",
        "불량률이 정확히 2%, 5%일 때 구간을 잘못 고른다. 차트의 원본 건수를 그대로 쓴다.",
    ]
    strategy = "계약 조건에서 기간, 중복, 정정 순서, 환산 월, 등급 발효일, 상한, 불가항력, 불량 구간을 먼저 적는다. 대장은 파일마다 같은 표로 정리한 뒤 합친다."
    questions = [
        {
            "prompt": "S03 파일과 S06 파일에서 지연 패널티 상한(발주금액의 10%)이 적용된 발주번호를 오름차순으로 쓰세요. 쉼표로 구분하고 공백은 넣지 않습니다.",
            "answer": answers["q1"],
            "explanation": explain(strategy, mistakes, "01 계약 조건, 03 환율표, S03, S06 (공급사 마스터는 필요 없다. 통화는 파일 머리에 있다)", "S03과 S06은 변경등급이 없다. 계산한 패널티가 상한보다 큰 발주만 모으며, 불가항력 발주는 패널티가 0이라 제외된다."),
        },
        {
            "prompt": "지연 패널티가 0원보다 큰 발주는 모든 공급사를 합쳐 몇 건인가. 숫자만 쓰세요.",
            "answer": answers["q2"],
            "explanation": explain(strategy, mistakes, "01 계약 조건, 02 공급사 마스터, 03 환율표, S01~S10 전부", "정정으로 입고일이 납기 안으로 들어오면 지연이 없다. 불가항력 FM 발주와 기간 밖 발주는 센다고 하지 않는다."),
        },
        {
            "prompt": "S08 파일만 기준으로, 불량 패널티의 원화 합계는 얼마인가. 숫자만 쓰세요.",
            "answer": answers["q3"],
            "explanation": explain(strategy, mistakes, "01 계약 조건, 03 환율표, S08", "발주마다 불량률 구간에 따라 외화 금액을 구해 발주일 월 환율로 원화로 바꾸고 소수점 이하를 버린 뒤 더한다."),
        },
        {
            "prompt": "모든 공급사의 지연 패널티와 불량 패널티를 더한 총 패널티는 몇 원인가. 숫자만 쓰세요.",
            "answer": answers["q4"],
            "explanation": explain(strategy, mistakes, "01 계약 조건, 02 공급사 마스터, 03 환율표, S01~S10 전부 (월별 지연추이 이미지는 필요 없다)", "공급사별로 지연과 불량 패널티를 구해 합친다. 등급 변경, 상한, 불가항력, 취소와 정정을 모두 반영한다."),
        },
    ]
    passage = (
        "미래모듈의 2026년 2분기 부품 공급사 10곳의 납기와 품질 패널티를 정산한다. 계약 조건, 공급사 마스터, 월별 환율표, 월별 지연추이 이미지, 공급사별 발주 입고 대장 10개가 나뉘어 있다. "
        "문제마다 필요한 파일이 다르며, 전부 한 번에 붙이면 글자 한도를 넘는다. 표기건수와 소계는 쓰지 않는다."
    )
    payload = bundle(SET_ID, "미래모듈 공급사 납기·품질 패널티 정산", "패널티 정산", "어려움", passage, files, questions)
    payload["_ref"] = {"answers": answers}
    return payload
