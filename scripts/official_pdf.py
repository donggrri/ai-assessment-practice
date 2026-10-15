"""문제 세트 PDF를 공식 문서 레이아웃으로 그린다.

본문 수치와 문장은 호출자가 넘긴 content 그대로 배치한다.
문서 번호·발효일처럼 원문에 없는 사실은 넣지 않는다.
"""

from __future__ import annotations

import re
from pathlib import Path

from fontTools.ttLib import TTCollection
from fpdf import FPDF

FONT_TTF = Path("/tmp/wqy-microhei.ttf")

NAVY = (18, 52, 92)
NAVY_MID = (27, 78, 138)
INK = (23, 32, 48)
MUTED = (90, 104, 124)
LINE = (206, 216, 228)
ZEBRA = (244, 247, 252)
CARD = (244, 247, 252)
SUB = (226, 234, 246)
FAIL = (168, 36, 42)
WHITE = (255, 255, 255)

ARTICLE = re.compile(r"^(제\d+조)\s*([^.]*)\.\s*(.*)$")
NUMBERED = re.compile(r"^(\d+)\.\s+(.*)$")
MARKER = re.compile(r"^===(.+?)===$")
HEADER_LABELS = {
    "code": "제품코드",
    "markets": "수출국",
    "inspector": "검수자",
    "result": "결과",
    "audience": "대상",
    "ingredients": "성분·함량",
    "claim": "라벨 문구",
    "id": "응답ID",
    "employee": "사번",
    "department": "부서",
    "drink": "음료",
    "score": "점수",
    "submitted": "제출시각",
    "성분": "성분",
    "단위": "단위",
    "kr": "KR",
    "eu": "EU",
    "어린이": "어린이",
    "비고": "비고",
}


def ensure_font() -> None:
    if FONT_TTF.exists():
        return
    ttc = TTCollection("/usr/share/fonts/truetype/wqy/wqy-microhei.ttc")
    ttc.fonts[0].save(str(FONT_TTF))


def _split_blocks(content: str) -> list[tuple[str, list[str]]]:
    blocks: list[tuple[str, list[str]]] = [("lead", [])]
    name = "lead"
    for raw in content.split("\n"):
        matched = MARKER.match(raw.strip())
        if matched:
            name = matched.group(1).strip()
            blocks.append((name, []))
            continue
        blocks[-1][1].append(raw)
    return [(label, lines) for label, lines in blocks if any(line.strip() for line in lines)]


def _pipe_table(lines: list[str]) -> tuple[list[str], list[list[str]]] | None:
    rows = [line for line in lines if line.strip()]
    if len(rows) < 2 or not all("|" in line for line in rows[:2]):
        return None
    header = rows[0].split("|")
    body = [line.split("|") for line in rows[1:]]
    width = len(header)
    if any(len(row) != width for row in body):
        return None
    return header, body


def _csv_table(lines: list[str]) -> tuple[list[str], list[list[str]]] | None:
    rows = [line for line in lines if line.strip()]
    if len(rows) < 2 or "," not in rows[0] or "|" in rows[0]:
        return None
    header = rows[0].split(",")
    body = [line.split(",") for line in rows[1:]]
    width = len(header)
    if any(len(row) != width for row in body):
        return None
    return header, body


def _limit_table(lines: list[str]) -> tuple[list[str], list[list[str]]] | None:
    rows = [line for line in lines if line.strip() and "|" in line]
    if not rows:
        return None
    parsed: list[list[str]] = []
    for line in rows:
        parts = line.split("|")
        if len(parts) < 3:
            return None
        record = {"성분": parts[0], "단위": parts[1], "KR": "", "EU": "", "어린이": "", "비고": ""}
        for part in parts[2:]:
            if ":" in part:
                key, value = part.split(":", 1)
                slot = {"KR": "KR", "EU": "EU", "어린이": "어린이"}.get(key)
                if slot:
                    record[slot] = value
                else:
                    record["비고"] = part if not record["비고"] else f"{record['비고']} {part}"
            else:
                record["비고"] = part if not record["비고"] else f"{record['비고']} {part}"
        parsed.append([record[key] for key in ("성분", "단위", "KR", "EU", "어린이", "비고")])
    return ["성분", "단위", "KR", "EU", "어린이", "비고"], parsed


def _label(header: str) -> str:
    return HEADER_LABELS.get(header.strip(), HEADER_LABELS.get(header.strip().lower(), header.strip()))


class OfficialPdf(FPDF):
    def __init__(self, doc_title: str) -> None:
        super().__init__(format="A4")
        self.doc_title = doc_title
        self.set_auto_page_break(auto=True, margin=16)
        self.add_font("wqy", "", str(FONT_TTF))
        self.set_font("wqy", size=10)

    def header(self) -> None:
        if self.page_no() == 1:
            return
        self.set_fill_color(*NAVY)
        self.rect(0, 0, self.w, 10, style="F")
        self.set_xy(12, 2.4)
        self.set_text_color(*WHITE)
        self.set_font("wqy", size=8)
        self.cell(0, 5, self.doc_title)
        self.set_y(16)

    def footer(self) -> None:
        self.set_y(-12)
        self.set_font("wqy", size=8)
        self.set_text_color(*MUTED)
        self.cell(0, 8, str(self.page_no()), align="C")

    def banner(self, kicker: str, title: str, doc_label: str) -> None:
        self.set_fill_color(*NAVY)
        self.rect(0, 0, self.w, 34, style="F")
        self.set_fill_color(*NAVY_MID)
        self.rect(0, 34, self.w, 1.4, style="F")
        self.set_xy(12, 5)
        self.set_text_color(198, 216, 238)
        self.set_font("wqy", size=8)
        self.cell(120, 5, kicker)
        self.set_xy(12, 12)
        self.set_text_color(*WHITE)
        self.set_font("wqy", size=16)
        self.multi_cell(128, 8, title, new_x="LMARGIN", new_y="NEXT")
        self.set_xy(146, 8)
        self.set_font("wqy", size=8)
        self.set_text_color(214, 226, 242)
        self.multi_cell(52, 4.6, doc_label, align="R")
        self.set_y(40)

    def meta_cards(self, cards: list[tuple[str, str]]) -> None:
        if not cards:
            return
        gap = 3
        width = (self.epw - gap * (len(cards) - 1)) / len(cards)
        y = self.get_y()
        x = self.l_margin
        for label, value in cards:
            self.set_fill_color(*CARD)
            self.set_draw_color(*LINE)
            self.rect(x, y, width, 16, style="FD")
            self.set_xy(x + 2.5, y + 1.6)
            self.set_font("wqy", size=7)
            self.set_text_color(*MUTED)
            self.cell(width - 5, 4, label)
            self.set_xy(x + 2.5, y + 7.2)
            self.set_font("wqy", size=9)
            self.set_text_color(*NAVY)
            shown = value if self.get_string_width(value) <= width - 6 else value[:18]
            self.cell(width - 5, 6, shown)
            x += width + gap
        self.set_y(y + 20)

    def section_title(self, number: str, title: str) -> None:
        if self.get_y() > self.h - 30:
            self.add_page()
        self.ln(1.5)
        y = self.get_y()
        self.set_fill_color(*NAVY)
        self.rect(self.l_margin, y, 8, 8, style="F")
        self.set_xy(self.l_margin, y + 1.1)
        self.set_text_color(*WHITE)
        self.set_font("wqy", size=9)
        self.cell(8, 6, number, align="C")
        self.set_xy(self.l_margin + 11, y + 0.6)
        self.set_text_color(*NAVY)
        self.set_font("wqy", size=12)
        self.cell(0, 7, title, new_x="LMARGIN", new_y="NEXT")
        self.ln(1.2)

    def article(self, label: str, heading: str, body: str) -> None:
        if self.get_y() > self.h - 24:
            self.add_page()
        self.set_text_color(*NAVY)
        self.set_font("wqy", size=11)
        title = f"{label} {heading}".strip()
        self.multi_cell(0, 6, title, new_x="LMARGIN", new_y="NEXT")
        if body:
            self.set_text_color(*INK)
            self.set_font("wqy", size=10)
            self.multi_cell(0, 5.4, body, new_x="LMARGIN", new_y="NEXT")
        self.ln(1.2)

    def prose(self, text: str, size: float = 10, color: tuple[int, int, int] = INK) -> None:
        cleaned = text.strip()
        if not cleaned:
            return
        if self.get_y() > self.h - 20:
            self.add_page()
        self.set_text_color(*color)
        self.set_font("wqy", size=size)
        self.multi_cell(0, 5.2, cleaned, new_x="LMARGIN", new_y="NEXT")
        self.ln(0.8)

    def numbered_rule(self, number: str, text: str) -> None:
        if self.get_y() > self.h - 22:
            self.add_page()
        y = self.get_y()
        self.set_fill_color(*NAVY_MID)
        self.rect(self.l_margin, y, 7, 7, style="F")
        self.set_xy(self.l_margin, y + 0.8)
        self.set_text_color(*WHITE)
        self.set_font("wqy", size=8)
        self.cell(7, 5.2, number, align="C")
        self.set_xy(self.l_margin + 9, y)
        self.set_text_color(*INK)
        self.set_font("wqy", size=10)
        self.multi_cell(self.epw - 9, 5.2, text, new_x="LMARGIN", new_y="NEXT")
        self.ln(1.4)

    def _col_widths(self, headers: list[str]) -> list[float]:
        weights: list[float] = []
        for header in headers:
            key = header.strip().lower()
            if key in {"id", "result", "score", "결과", "점수", "단위"}:
                weights.append(0.7)
            elif key in {"claim", "ingredients", "라벨 문구", "성분·함량", "drink", "음료", "비고"}:
                weights.append(1.7)
            elif key in {"submitted", "제출시각", "접수시각"}:
                weights.append(1.45)
            elif key in {"값", "value"}:
                weights.append(1.9)
            elif key in {"항목", "통화", "센서", "언어"}:
                weights.append(0.75)
            elif key == "본문":
                weights.append(3.4)
            else:
                weights.append(1)
        total = sum(weights) or 1
        return [self.epw * weight / total for weight in weights]

    def _fits(self, text: str, width: float, size: float) -> bool:
        self.set_font("wqy", size=size)
        return self.get_string_width(text) <= width - 1.6

    def data_table(self, headers: list[str], rows: list[list[str]], group_index: int | None) -> None:
        labels = [_label(header) for header in headers]
        widths = self._col_widths(labels)
        self._table_header(labels, widths)
        for index, row in enumerate(rows):
            self._table_row(row, widths, index % 2 == 1)
        self.ln(1)
        if group_index is not None:
            self._group_summary(headers, rows, group_index, widths)

    def _group_summary(self, headers: list[str], rows: list[list[str]], group_index: int, widths: list[float]) -> None:
        counts: dict[str, int] = {}
        order: list[str] = []
        for row in rows:
            key = row[group_index] if group_index < len(row) else ""
            if key not in counts:
                order.append(key)
                counts[key] = 0
            counts[key] += 1
        if len(order) <= 1 and counts.get(order[0] if order else "", 0) == len(rows):
            label = order[0] if order and order[0] else "전체"
            self._subtotal(f"{label} 소계", counts.get(order[0], len(rows)) if order else len(rows), widths)
            self.ln(2)
            return
        title = _label(headers[group_index])
        self.prose(f"{title}별 소계", size=9, color=NAVY)
        span = sum(widths[:-1]) if len(widths) > 1 else widths[0]
        last = widths[-1] if len(widths) > 1 else 0
        for key in order:
            if self.get_y() + 7 > self.h - 16:
                self.add_page()
            y = self.get_y()
            name = key if key else "빈 값"
            self.set_fill_color(*SUB)
            self.set_draw_color(*LINE)
            self.set_text_color(*NAVY)
            self.set_font("wqy", size=8)
            self.set_xy(self.l_margin, y)
            if last:
                self.cell(span, 6.6, f"{name} 소계", border=1, fill=True)
                self.set_xy(self.l_margin + span, y)
                self.cell(last, 6.6, f"{counts[key]}건", border=1, fill=True, align="R")
            else:
                self.cell(span, 6.6, f"{name} 소계  {counts[key]}건", border=1, fill=True)
            self.set_xy(self.l_margin, y + 6.6)
        self.ln(2)

    def _table_header(self, labels: list[str], widths: list[float]) -> None:
        if self.get_y() + 15 > self.h - 16:
            self.add_page()
        y = self.get_y()
        x = self.l_margin
        self.set_fill_color(*NAVY)
        self.set_draw_color(*NAVY)
        self.set_text_color(*WHITE)
        self.set_font("wqy", size=8)
        for label, width in zip(labels, widths):
            self.set_xy(x, y)
            self.cell(width, 7.2, label, border=1, fill=True)
            x += width
        self.set_xy(self.l_margin, y + 7.2)

    def _table_row(self, cells: list[str], widths: list[float], zebra: bool) -> None:
        if self.get_y() + 7 > self.h - 16:
            self.add_page()
        y = self.get_y()
        x = self.l_margin
        fill = ZEBRA if zebra else WHITE
        self.set_draw_color(*LINE)
        self.set_font("wqy", size=8)
        if any(not self._fits(text, width, 7) for text, width in zip(cells, widths)):
            self._wrapped_row(cells, widths, fill)
            return
        for text, width in zip(cells, widths):
            shown = text
            size = 8
            if not self._fits(shown, width, size):
                size = 7
            self.set_font("wqy", size=size)
            self.set_fill_color(*fill)
            self.set_text_color(*FAIL if text == "Fail" else INK)
            self.set_xy(x, y)
            self.cell(width, 6.6, shown, border=1, fill=True)
            x += width
        self.set_xy(self.l_margin, y + 6.6)

    def _wrapped_row(self, cells: list[str], widths: list[float], fill: tuple[int, int, int]) -> None:
        size, line_h = 7, 4.2
        self.set_font("wqy", size=size)
        wrapped = [self.multi_cell(width - 1.6, line_h, text, split_only=True) or [""] for text, width in zip(cells, widths)]
        height = max(len(lines) for lines in wrapped) * line_h + 2.4
        if self.get_y() + height > self.h - 16:
            self.add_page()
        y = self.get_y()
        x = self.l_margin
        self.set_draw_color(*LINE)
        self.set_fill_color(*fill)
        self.set_text_color(*INK)
        for lines, width in zip(wrapped, widths):
            self.rect(x, y, width, height, style="FD")
            for index, line in enumerate(lines):
                self.set_xy(x + 0.8, y + 1.2 + index * line_h)
                self.cell(width - 1.6, line_h, line)
            x += width
        self.set_xy(self.l_margin, y + height)

    def _subtotal(self, label: str, count: int, widths: list[float]) -> None:
        if self.get_y() + 7 > self.h - 16:
            self.add_page()
        y = self.get_y()
        self.set_fill_color(*SUB)
        self.set_draw_color(*LINE)
        self.set_text_color(*NAVY)
        self.set_font("wqy", size=8)
        self.set_xy(self.l_margin, y)
        self.cell(sum(widths), 6.6, f"{label}  {count}건", border=1, fill=True)
        self.set_xy(self.l_margin, y + 6.6)


def _group_index(headers: list[str]) -> int | None:
    keys = [header.strip().lower() for header in headers]
    for name in ("inspector", "department", "검수자", "부서", "창고", "사업장", "공급사", "시스템", "언어", "팀"):
        if name in keys:
            return keys.index(name)
    return None


MEMO_LABELS = {"CLAUSES", "NOTES", "MARGIN", "AUDITNOTES", "APPENDIX", "PRINT", "CHARTNOTES", "MEMO"}


def _profile(title: str, filename: str, issuer: str, scope: str) -> tuple[str, str, list[tuple[str, str]]]:
    doc = Path(filename).name if filename else title
    return title, doc, [("ISSUED BY", issuer), ("SCOPE", scope), ("문서", doc)]


def _render_lines(pdf: OfficialPdf, lines: list[str], memo: bool) -> None:
    for line in lines:
        if not line.strip():
            continue
        article = ARTICLE.match(line.strip())
        if article and not memo:
            pdf.article(article.group(1), article.group(2).strip(), article.group(3).strip())
            continue
        numbered = NUMBERED.match(line.strip())
        if numbered and not memo:
            pdf.numbered_rule(numbered.group(1), numbered.group(2).strip())
            continue
        pdf.prose(line, size=8.5 if memo else 10, color=MUTED if memo else INK)


def _section_name(label: str) -> str:
    names = {
        "LIMITS": "성분 상한",
        "CLAUSES": "운영 메모",
        "ROWS": "제품 행",
        "NOTES": "운영 메모",
        "RULES": "집계 규칙",
        "RESPONSES": "응답 원본",
        "MARGIN": "여백 메모",
        "AUDIT": "검수 행",
        "AUDITNOTES": "검수 메모",
        "APPENDIX": "부록 해설",
        "PLANS": "요금제",
        "ROSTER": "명부",
        "USAGE": "사용 행",
        "SLIPS": "입출고 전표",
        "COURSES": "수강 행",
        "CHECKS": "점검 행",
        "FIXES": "정정 기록",
        "PLANCHANGE": "플랜 변경",
        "CATALOG": "과정",
        "MEMO": "점검 메모",
        "FEATURES": "기능",
        "THRESHOLDS": "판정 기준",
        "EXPENSE": "비목 기준",
        "FX": "환율",
        "PROJECTS": "과제",
        "VOUCHERS": "집행 전표",
        "CALENDAR": "휴무일",
        "LOGS": "근태 기록",
        "AMENDS": "정정 신청",
        "SUPPLIERS": "공급사",
        "ORDERS": "발주·입고",
        "SYSTEMS": "시스템",
        "RECORDS": "추출 레코드",
        "REMASKED": "재처리 완료",
        "KEYWORDS": "분류 키워드",
        "CUSTOMERS": "고객",
        "INQUIRIES": "접수 문의",
        "CHAMBERS": "챔버",
        "READINGS": "센서 로그",
        "lead": "본문",
    }
    return names.get(label, label)


def _guess_issuer(title: str, content: str) -> str:
    head = f"{title}\n{content[:120]}"
    for name in ("노을푸드", "온빛라이프", "한빛소프트"):
        if name in head:
            return name
    return "연습 자료"


def _guess_scope(title: str) -> str:
    if "응답" in title:
        return "응답 원본"
    if "설문" in title or "집계" in title:
        return "사내 음료 설문"
    if "부록" in title or "해설" in title:
        return "해설"
    if "검수 기록" in title:
        return "검수 기록"
    if "수출" in title:
        return "한국·EU 수출 검수"
    return "규정"


def _table_line_keys(header: list[str], body: list[list[str]]) -> set[str]:
    keys = {"|".join(header), ",".join(header)}
    for row in body:
        keys.add("|".join(row))
        keys.add(",".join(row))
    return keys


def render_official_pdf(
    path: Path,
    title: str,
    content: str,
    filename: str | None = None,
    issuer: str | None = None,
    scope: str | None = None,
) -> None:
    ensure_font()
    shown = filename or path.name
    issuer_label = issuer or _guess_issuer(title, content)
    scope_label = scope or _guess_scope(title)
    heading, doc, cards = _profile(title, shown, issuer_label, scope_label)
    pdf = OfficialPdf(heading)
    pdf.set_margins(12, 16, 12)
    pdf.add_page()
    pdf.banner(issuer_label, heading, doc)
    pdf.meta_cards(cards)
    section = 0
    for label, lines in _split_blocks(content):
        memo = label in MEMO_LABELS
        table = None
        if not memo:
            table = _limit_table(lines) if label == "LIMITS" else (_pipe_table(lines) or _csv_table(lines))
        section += 1
        pdf.section_title(str(section), _section_name("본문" if label == "lead" else label))
        if table:
            header, body = table
            if label == "LIMITS":
                leftover = [line for line in lines if line.strip() and "|" not in line]
            else:
                consumed = _table_line_keys(header, body)
                leftover = [line for line in lines if line.strip() and line.strip() not in consumed and line not in consumed]
            _render_lines(pdf, leftover, False)
            if body:
                pdf.data_table(header, body, None if label == "LIMITS" else _group_index(header))
        else:
            _render_lines(pdf, lines, memo)
    path.parent.mkdir(parents=True, exist_ok=True)
    pdf.output(str(path))
