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

    def test_old_contract_jobs_are_isolated_instead_of_becoming_reviewable(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            store = JobStore(root)
            store.add({
                "id": "old123",
                "status": "awaiting_review",
                "message": "ready",
                "contractVersion": "1.0.0",
            })

            restored = JobStore(root)
            restored.load("2026-07-17T12:00:00+00:00", contract_version="1.1.0")
            job = restored.get("old123")

            self.assertEqual(job["status"], "incompatible")
            self.assertEqual(job["contractVersion"], "1.0.0")
            self.assertIn("1.1.0", job["message"])

    def test_old_approved_jobs_keep_their_history_status(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            store = JobStore(root)
            store.add({
                "id": "approved123",
                "status": "approved",
                "message": "done",
                "contractVersion": "1.0.0",
            })

            restored = JobStore(root)
            restored.load("2026-07-17T12:00:00+00:00", contract_version="1.1.0")
            job = restored.get("approved123")

            self.assertEqual(job["status"], "approved")
            self.assertFalse(job["compatible"])


if __name__ == "__main__":
    unittest.main()
