import tempfile
import unittest
from pathlib import Path

from server.windup_pipeline.job_store import JobStore


class JobStoreTest(unittest.TestCase):
    def test_jobs_survive_restart_and_active_jobs_become_interrupted(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            store = JobStore(root)
            store.add({"id": "abc123", "status": "queued", "message": "queued"})
            store.update("abc123", progress=25)

            restored = JobStore(root)
            restored.load("2026-07-13T12:00:00+00:00")
            job = restored.get("abc123")

            self.assertEqual(job["status"], "interrupted")
            self.assertEqual(job["progress"], 25)
            self.assertEqual(job["updatedAt"], "2026-07-13T12:00:00+00:00")


if __name__ == "__main__":
    unittest.main()
