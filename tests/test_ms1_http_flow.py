import http.cookiejar
import json
import shutil
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

from server.app import create_handler
from server.windup_pipeline.application import GenerationApplication
from server.windup_pipeline.project_store import DEFAULT_PROJECT_ID

PROJECT_ROOT = Path(__file__).resolve().parents[1]


class Ms1ProjectHttpTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        shutil.copytree(
            PROJECT_ROOT / "assets/resources/characters/boy",
            self.root / "assets/resources/characters/boy",
        )
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

    def test_default_project_asset_tree_exposes_relations_gaps_and_records(self):
        status, project = self.request(f"/api/projects/{DEFAULT_PROJECT_ID}")
        self.assertEqual(status, 200)
        self.assertEqual(project["id"], DEFAULT_PROJECT_ID)

        status, tree = self.request(f"/api/projects/{DEFAULT_PROJECT_ID}/assets")
        self.assertEqual(status, 200)
        boy = next(item for item in tree["characters"] if item["character"]["id"] == "boy")
        outfit = boy["outfits"][0]

        self.assertEqual(boy["character"]["projectId"], DEFAULT_PROJECT_ID)
        self.assertEqual(outfit["outfit"]["characterId"], "boy")
        self.assertEqual(outfit["masterSets"][0]["status"], "locked")
        self.assertEqual(
            {item["instance"]["definitionId"] for item in outfit["actionInstances"]},
            {"idle", "walk"},
        )
        self.assertTrue(tree["gaps"])
        self.assertTrue(tree["generationRecords"])
        serialized = json.dumps(tree)
        self.assertNotIn(str(self.root), serialized)
        self.assertNotIn("\\\\", serialized)
        self.assertNotIn("apiKey", serialized)

    def test_created_project_survives_application_restart(self):
        status, created = self.request("/api/projects", {
            "name": "MS1 Test",
            "artStyle": "low saturation literary pixel art",
            "viewMode": "side",
            "canvasSize": 256,
            "target": "cocos-wechat",
        })
        self.assertEqual(status, 201)

        restored = GenerationApplication(self.root, demo=True)
        restored.prepare()
        self.assertEqual(restored.project(created["id"]), created)
        self.assertEqual(restored.project_assets(created["id"])["characters"], [])

    def test_unknown_project_is_404_and_invalid_project_is_400(self):
        with self.assertRaises(urllib.error.HTTPError) as missing:
            self.request("/api/projects/project-missing")
        self.assertEqual(missing.exception.code, 404)

        with self.assertRaises(urllib.error.HTTPError) as invalid:
            self.request("/api/projects", {
                "name": "Wrong canvas",
                "artStyle": "pixel",
                "viewMode": "side",
                "canvasSize": 512,
                "target": "cocos-wechat",
            })
        self.assertEqual(invalid.exception.code, 400)


if __name__ == "__main__":
    unittest.main()
