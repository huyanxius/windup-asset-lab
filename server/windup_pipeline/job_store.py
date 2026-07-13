"""Thread-safe local job repository.

The HTTP layer and generation services depend on this small interface. A future
SQLite or queue-backed implementation can replace it without changing routes.
"""

import json
import threading
from pathlib import Path


class JobStore:
    ACTIVE_STATES = {"queued", "generating", "processing"}

    def __init__(self, root: Path):
        self.root = root
        self._lock = threading.Lock()
        self._jobs: dict[str, dict] = {}

    def __getitem__(self, job_id: str) -> dict:
        with self._lock:
            return dict(self._jobs[job_id])

    def get(self, job_id: str):
        with self._lock:
            job = self._jobs.get(job_id)
            return dict(job) if job else None

    def _write(self, job: dict) -> None:
        path = self.root / job["id"] / "job.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(job, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporary.replace(path)

    def add(self, job: dict) -> dict:
        with self._lock:
            self._jobs[job["id"]] = job
            self._write(job)
            return dict(job)

    def update(self, job_id: str, **changes) -> dict:
        with self._lock:
            job = self._jobs[job_id]
            job.update(changes)
            self._write(job)
            return dict(job)

    def load(self, interrupted_at: str) -> None:
        if not self.root.exists():
            return
        for job_file in self.root.glob("*/job.json"):
            try:
                job = json.loads(job_file.read_text(encoding="utf-8"))
                if job.get("status") in self.ACTIVE_STATES:
                    job.update(
                        status="interrupted",
                        message="服务重启，请重新发起该任务",
                        updatedAt=interrupted_at,
                    )
                    self._write(job)
                self._jobs[job["id"]] = job
            except (OSError, ValueError, KeyError, TypeError):
                continue
