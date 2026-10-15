"""새 연습 세트 6개가 함께 쓰는 도구. JSON 구조와 PDF 스타일은 기존 어려움 세트와 같다."""

from __future__ import annotations

import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from official_pdf import render_official_pdf  # noqa: E402

DATA = ROOT / "data" / "problem-sets"
PUBLIC = ROOT / "public"

SURNAMES = list("김이박최정강조윤장임한오서신권황안송전홍고문양손배백허유남심노하곽성차주우구민진")
GIVEN = [
    "하준", "서연", "도윤", "지우", "시우", "하은", "서준", "지호", "예준", "수아",
    "민준", "지민", "현우", "지아", "건우", "서현", "유준", "아린", "준서", "하린",
    "은우", "채원", "시윤", "윤서", "지후", "다은", "연우", "서우", "하율", "지율",
]


def make_names(count: int, seed: int, twin_pairs: int) -> list[str]:
    """동명이인 twin_pairs쌍을 포함한 이름 목록. 뒤쪽 이름을 앞쪽 이름으로 덮어쓴다."""
    rng = random.Random(seed)
    pool = [s + g for s in SURNAMES for g in GIVEN]
    rng.shuffle(pool)
    picked = pool[:count]
    for index in range(twin_pairs):
        picked[count - 1 - index] = picked[index]
    return picked


def table(header: str, rows: list[str]) -> str:
    return header + "\n" + "\n".join(rows)


def block(name: str, header: str, rows: list[str]) -> str:
    return f"==={name}===\n" + table(header, rows) + f"\n===END {name}==="


def memo_block(lines: list[str]) -> str:
    return "===MEMO===\n" + "\n".join(lines) + "\n===END MEMO==="


def pdf_file(
    set_id: str,
    file_id: str,
    name: str,
    title: str,
    content: str,
    issuer: str,
    scope: str,
    media_name: str,
) -> dict:
    media = f"exam-media/{set_id}/{media_name}"
    render_official_pdf(PUBLIC / media, title, content, name, issuer, scope)
    return {"id": file_id, "name": name, "kind": "pdf", "media": media, "content": content}


def png_file(set_id: str, file_id: str, name: str, media_name: str, alt: str, draw) -> dict:
    media = f"exam-media/{set_id}/{media_name}"
    target = PUBLIC / media
    target.parent.mkdir(parents=True, exist_ok=True)
    draw(target)
    return {"id": file_id, "name": name, "kind": "png", "media": media, "content": alt}


def explain(strategy: str, mistakes: list[str], files: str, note: str) -> str:
    lines = ["질문 전략: " + strategy, "흔한 실수"]
    lines.extend(f"- {item}" for item in mistakes)
    lines.append("필요한 파일: " + files)
    lines.append(note)
    return "\n".join(lines)


def bundle(
    set_id: str,
    title: str,
    category: str,
    difficulty: str,
    passage: str,
    files: list[dict],
    questions: list[dict],
) -> dict:
    return {
        "id": set_id,
        "title": title,
        "category": category,
        "difficulty": difficulty,
        "timeLimitMin": 25,
        "passage": passage,
        "files": files,
        "questions": [
            {
                "id": f"q{index}",
                "number": index,
                "type": "short",
                "prompt": item["prompt"],
                "answer": item["answer"],
                "explanation": item["explanation"],
            }
            for index, item in enumerate(questions, start=1)
        ],
    }


def write_set(payload: dict) -> None:
    path = DATA / f"{payload['id']}.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def join_codes(codes) -> str:
    return ",".join(sorted(set(codes)))
