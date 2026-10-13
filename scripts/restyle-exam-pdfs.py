#!/usr/bin/env python3
"""기존 JSON의 content 로만 PDF를 다시 그린다. JSON은 쓰지 않는다."""

from __future__ import annotations

import json
from pathlib import Path

from official_pdf import render_official_pdf

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "problem-sets"
PUBLIC = ROOT / "public"

PROFILES = {
    ("noeul-food-review", "rules"): ("가공식품 수출 검수 규정", "노을푸드", "한국·EU 수출 검수"),
    ("noeul-food-review", "audit-a"): ("검수 기록 A", "노을푸드", "검수 기록"),
    ("noeul-food-review", "audit-b"): ("검수 기록 B", "노을푸드", "검수 기록"),
    ("noeul-food-review", "audit-c"): ("검수 기록 C", "노을푸드", "검수 기록"),
    ("bright-life-review", "rules"): ("성분·표현 규정", "온빛라이프", "입점 검수"),
    ("bright-life-review", "audit"): ("검수 기록", "온빛라이프", "검수 기록"),
    ("bright-life-review", "appendix"): ("해설 부록", "온빛라이프", "해설"),
    ("beverage-survey", "guide"): ("설문 집계 안내", "한빛소프트", "사내 음료 설문"),
    ("beverage-survey", "responses"): ("설문 응답 원본", "한빛소프트", "응답 원본"),
}


def main() -> None:
    count = 0
    for path in sorted(DATA.glob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        for item in payload.get("files", []):
            if item.get("kind") != "pdf":
                continue
            media = item.get("media")
            content = item.get("content")
            if not isinstance(media, str) or not isinstance(content, str):
                raise SystemExit(f"{path.name}: pdf content/media 가 없습니다.")
            target = PUBLIC / media
            title, issuer, scope = PROFILES.get(
                (payload["id"], item["id"]),
                (str(item.get("name") or target.name), "연습 자료", "규정"),
            )
            render_official_pdf(target, title, content, str(item.get("name") or target.name), issuer, scope)
            count += 1
            print(f"{target.relative_to(ROOT)} chars={len(content)}")
    print(f"pdfs={count}")


if __name__ == "__main__":
    main()
