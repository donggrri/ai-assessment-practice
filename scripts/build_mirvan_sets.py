#!/usr/bin/env python3
"""미르반도체 AI Native 실무 세트 2개의 JSON과 첨부를 만든다."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from exam_sets.common import write_set  # noqa: E402
from exam_sets.mirvan_alarm import build as build_alarm  # noqa: E402
from exam_sets.mirvan_yield import build as build_yield  # noqa: E402


def main() -> None:
    for build in (build_yield, build_alarm):
        payload = build()
        ref = payload.pop("_ref", {})
        write_set(payload)
        total = sum(len(item["content"]) for item in payload["files"])
        print(payload["id"], "files", len(payload["files"]), "chars", total, "answers", ref.get("answers"))


if __name__ == "__main__":
    main()
