"""Versioned file-backed review decisions with optimistic concurrency."""

from __future__ import annotations

import hashlib
import json
import threading
from pathlib import Path

VALID_STATES = {"pass", "pending", "reject"}


class ReviewConflict(RuntimeError):
    def __init__(self, current: dict):
        super().__init__("审核记录已被其他会话更新")
        self.current = current


class ReviewStore:
    def __init__(self, root: Path):
        self.root = root
        self._lock = threading.Lock()

    def _path(self, key: str) -> Path:
        digest = hashlib.sha256(key.encode("utf-8")).hexdigest()
        return self.root / f"{digest}.json"

    def _read(self, key: str) -> dict | None:
        path = self._path(key)
        if not path.exists():
            return None
        try:
            record = json.loads(path.read_text(encoding="utf-8"))
            return record if record.get("key") == key else None
        except (OSError, ValueError, TypeError):
            return None

    def _write(self, record: dict) -> None:
        path = self._path(record["key"])
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporary.replace(path)

    @staticmethod
    def _validate(key: str, reviews: list[str]) -> None:
        if not key or len(key) > 200:
            raise ValueError("审核资产标识不合法")
        if not reviews or len(reviews) > 64 or any(value not in VALID_STATES for value in reviews):
            raise ValueError("审核状态不合法")

    def get(self, key: str, length: int, initial: str = "pending", defaults: list[str] | None = None) -> dict:
        if not 1 <= length <= 64 or initial not in VALID_STATES:
            raise ValueError("审核初始化参数不合法")
        with self._lock:
            record = self._read(key)
            if record and len(record.get("reviews", [])) == length:
                return record
            reviews = list(defaults) if defaults and len(defaults) == length else [initial] * length
            record = {"key": key, "version": 1, "reviews": reviews}
            self._validate(key, record["reviews"])
            self._write(record)
            return record

    def update(self, key: str, expected_version: int, reviews: list[str]) -> dict:
        self._validate(key, reviews)
        with self._lock:
            current = self._read(key)
            current_version = int(current.get("version", 0)) if current else 0
            if expected_version != current_version:
                raise ReviewConflict(current or {"key": key, "version": 0, "reviews": []})
            record = {"key": key, "version": current_version + 1, "reviews": list(reviews)}
            self._write(record)
            return record
