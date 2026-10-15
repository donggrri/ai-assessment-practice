#!/usr/bin/env python3
"""새 연습 세트 6개의 JSON, PDF, PNG를 만든다. 기존 세트 JSON은 건드리지 않는다."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from exam_sets import budget, etch, inquiry, overtime, privacy, supplier  # noqa: E402
from exam_sets.common import write_set  # noqa: E402

BUILDERS = [etch.build, budget.build, overtime.build, supplier.build, privacy.build, inquiry.build]


def main() -> None:
    for build in BUILDERS:
        payload = build()
        ref = payload.pop("_ref", {})
        write_set(payload)
        total = sum(len(item["content"]) for item in payload["files"])
        print(payload["id"], "files", len(payload["files"]), "chars", total, "answers", ref.get("answers"))


if __name__ == "__main__":
    main()
