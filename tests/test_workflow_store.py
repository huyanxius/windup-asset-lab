import tempfile
import unittest
from pathlib import Path

from server.windup_pipeline.workflow_store import WorkflowTemplateStore


class WorkflowTemplateStoreTest(unittest.TestCase):
    def test_templates_survive_restart_and_track_runs(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            store = WorkflowTemplateStore(root)
            saved = store.create({
                "name": "Side character starter",
                "project": {"view": "side", "directions": "1", "canvasSize": "256"},
                "pipeline": {"source": "zero", "actions": ["idle", "walk"], "fps": 8},
                "execution": {"mode": "automatic", "approval": "final_asset"},
            }, "2026-07-16T08:00:00+00:00")
            store.record_run(saved["id"], "2026-07-16T08:05:00+00:00")

            restored = WorkflowTemplateStore(root)
            restored.load()
            template = restored.get(saved["id"])

            self.assertEqual(template["version"], 1)
            self.assertEqual(template["runCount"], 1)
            self.assertEqual(template["lastRunAt"], "2026-07-16T08:05:00+00:00")
            self.assertEqual(restored.list()[0]["name"], "Side character starter")


if __name__ == "__main__":
    unittest.main()
