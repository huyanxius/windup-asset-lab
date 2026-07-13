import http.cookiejar
import json
import shutil
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

from server.app import create_handler
from server.windup_pipeline.application import GenerationApplication

PROJECT_ROOT = Path(__file__).resolve().parents[1]


class HttpContractTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        frame_root = self.root / "assets/resources/character/frames"
        frame_root.mkdir(parents=True)
        shutil.copy2(PROJECT_ROOT / "assets/resources/character/frames/walk-01.png", frame_root / "walk-01.png")
        self.application = GenerationApplication(self.root, demo=True)
        self.application.prepare()
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), create_handler(self.application, self.root))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.server.server_address[1]}"
        self.opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}),
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()),
        )

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.temporary.cleanup()

    def request(self, path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(
            self.base + path,
            data=data,
            method="POST" if body is not None else "GET",
            headers={"Content-Type": "application/json"} if body is not None else {},
        )
        with self.opener.open(request, timeout=5) as response:
            return response.status, json.load(response)

    def test_versioned_contract_generation_and_review_flow(self):
        _, health = self.request("/api/health")
        self.assertEqual(health["contractVersion"], "1.0.0")
        self.assertEqual(health["fps"], 8)
        self.assertTrue(health["demo"])

        status, job = self.request("/api/generations", {
            "character": "lamplighter", "view": "side", "action": "walk",
            "mode": "single", "frameIndex": 0, "model": "gemini-2.5-flash-image",
        })
        self.assertEqual(status, 202)
        for _ in range(50):
            _, current = self.request(f"/api/generations/{job['id']}")
            if current["status"] in {"awaiting_review", "failed"}:
                break
            time.sleep(0.02)
        self.assertEqual(current["status"], "awaiting_review")
        self.assertEqual(len(current["outputs"]), 1)

        _, review = self.request("/api/reviews?key=hero%3Aside%3Awalk&length=2&defaults=pending%2Creject")
        _, saved = self.request("/api/reviews", {
            "key": review["key"], "expectedVersion": review["version"], "reviews": ["pass", "reject"],
        })
        self.assertEqual(saved["version"], 2)
        with self.assertRaises(urllib.error.HTTPError) as conflict:
            self.request("/api/reviews", {
                "key": review["key"], "expectedVersion": 1, "reviews": ["reject", "reject"],
            })
        self.assertEqual(conflict.exception.code, 409)


if __name__ == "__main__":
    unittest.main()
