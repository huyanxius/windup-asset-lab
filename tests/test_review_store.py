import tempfile
import unittest
from pathlib import Path

from server.windup_pipeline.review_store import ReviewConflict, ReviewStore


class ReviewStoreTest(unittest.TestCase):
    def test_review_updates_are_versioned_and_conflicts_keep_current_data(self):
        with tempfile.TemporaryDirectory() as directory:
            store = ReviewStore(Path(directory))
            initial = store.get("hero:side:walk", 2, defaults=["pending", "reject"])
            saved = store.update("hero:side:walk", initial["version"], ["pass", "reject"])
            self.assertEqual(saved["version"], 2)
            with self.assertRaises(ReviewConflict) as conflict:
                store.update("hero:side:walk", initial["version"], ["reject", "reject"])
            self.assertEqual(conflict.exception.current["reviews"], ["pass", "reject"])


if __name__ == "__main__":
    unittest.main()
