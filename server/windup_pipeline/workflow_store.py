"""Persistent reusable workflow definitions.

Workflow templates contain production configuration only. Generated assets,
provider credentials and transient job state stay in their existing stores.
"""

from __future__ import annotations

import json
import threading
import uuid
from pathlib import Path


class WorkflowTemplateStore:
    def __init__(self, root: Path):
        self.root = root
        self._lock = threading.Lock()
        self._templates: dict[str, dict] = {}

    def _write(self, template: dict) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        path = self.root / f"{template['id']}.json"
        temporary = path.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(template, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporary.replace(path)

    def load(self) -> None:
        if not self.root.exists():
            return
        with self._lock:
            for path in self.root.glob("*.json"):
                try:
                    template = json.loads(path.read_text(encoding="utf-8"))
                    template_id = str(template["id"])
                    if len(template_id) == 12:
                        self._templates[template_id] = template
                except (OSError, ValueError, KeyError, TypeError):
                    continue

    def create(self, definition: dict, created_at: str) -> dict:
        template = {
            **definition,
            "id": uuid.uuid4().hex[:12],
            "version": 1,
            "runCount": 0,
            "lastRunAt": None,
            "createdAt": created_at,
            "updatedAt": created_at,
        }
        with self._lock:
            self._templates[template["id"]] = template
            self._write(template)
            return dict(template)

    def get(self, template_id: str):
        with self._lock:
            template = self._templates.get(template_id)
            return dict(template) if template else None

    def list(self) -> list[dict]:
        with self._lock:
            return [dict(item) for item in sorted(
                self._templates.values(),
                key=lambda item: item.get("updatedAt", ""),
                reverse=True,
            )]

    def record_run(self, template_id: str, run_at: str) -> dict:
        with self._lock:
            template = self._templates[template_id]
            template["runCount"] = int(template.get("runCount", 0)) + 1
            template["lastRunAt"] = run_at
            template["updatedAt"] = run_at
            self._write(template)
            return dict(template)
