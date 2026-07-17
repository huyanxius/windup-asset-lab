import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from server.windup_pipeline.project_models import (
    ActionInstance,
    Character,
    CharacterIdentity,
    FrameRecord,
    GenerationRecord,
    MasterSetVersion,
    Outfit,
    Project,
)
from server.windup_pipeline.project_store import DEFAULT_PROJECT_ID, ProjectStore


class FakeCatalog:
    records = {
        "boy": {
            "label": "少年",
            "base": "assets/resources/characters/boy/base.png",
            "description": "short-haired courier with a red scarf",
        },
    }

    def manifest(self, character_id):
        self.assert_character(character_id)
        return {
            "side": {
                "idle": {
                    "frames": [
                        f"assets/resources/characters/boy/views/side/idle-{index:02d}.png"
                        for index in range(1, 9)
                    ],
                    "fps": 8,
                    "loop": True,
                },
            },
            "topdown": {},
            "isometric": {},
        }

    @staticmethod
    def assert_character(character_id):
        if character_id != "boy":
            raise KeyError(character_id)


class ProjectModelTest(unittest.TestCase):
    def test_all_ms1_relationship_models_round_trip(self):
        values = [
            Project.from_dict({
                "id": "project-demo", "name": "Demo", "artStyle": "pixel",
                "viewMode": "side", "canvasSize": 256, "target": "cocos-wechat",
                "createdAt": "2026-07-17T00:00:00+00:00", "updatedAt": "2026-07-17T00:00:00+00:00",
            }),
            Character.from_dict({
                "id": "character-aran", "projectId": "project-demo", "name": "Aran",
                "identityId": "identity-aran-v1", "activeOutfitId": "outfit-aran-default",
            }),
            CharacterIdentity.from_dict({
                "id": "identity-aran-v1", "description": "red scarf",
                "referenceAssetId": None, "version": 1,
            }),
            Outfit.from_dict({
                "id": "outfit-aran-default", "characterId": "character-aran",
                "name": "Default", "activeMasterSetVersionId": "master-aran-v1",
            }),
            MasterSetVersion.from_dict({
                "id": "master-aran-v1", "outfitId": "outfit-aran-default", "status": "locked",
                "sourceType": "legacy_import",
                "views": {"side": {"direction": "right", "assetPath": "assets/aran/base.png"}},
                "createdAt": "2026-07-17T00:00:00+00:00", "lockedAt": "2026-07-17T00:00:00+00:00",
            }),
            ActionInstance.from_dict({
                "id": "action-aran-side-idle-v1", "outfitId": "outfit-aran-default",
                "definitionId": "idle", "view": "side", "status": "promoted", "version": 1,
            }),
            FrameRecord.from_dict({
                "id": "frame-aran-idle-01-v1", "actionInstanceId": "action-aran-side-idle-v1",
                "index": 0, "assetPath": "assets/aran/idle-01.png", "reviewStatus": "pass",
                "recordId": "record-aran-idle-v1", "qc": {"passed": True, "warnings": []},
            }),
            GenerationRecord.from_dict({
                "id": "record-aran-idle-v1", "jobId": "legacy-aran-idle",
                "kind": "legacy_import", "model": "built-in", "route": "import",
                "attempt": 1, "elapsedMs": 0, "cost": None, "parentRecordId": None,
                "createdAt": "2026-07-17T00:00:00+00:00",
            }),
        ]

        for value in values:
            self.assertEqual(type(value).from_dict(value.to_dict()), value)

    def test_models_reject_unsafe_ids_paths_and_contract_drift(self):
        with self.assertRaises(ValueError):
            Project.from_dict({
                "id": "../escape", "name": "Demo", "artStyle": "pixel",
                "viewMode": "side", "canvasSize": 256, "target": "cocos-wechat",
                "createdAt": "2026-07-17T00:00:00+00:00", "updatedAt": "2026-07-17T00:00:00+00:00",
            })
        with self.assertRaises(ValueError):
            Project.from_dict({
                "id": "project-demo", "name": "Demo", "artStyle": "pixel",
                "viewMode": "side", "canvasSize": 512, "target": "cocos-wechat",
                "createdAt": "2026-07-17T00:00:00+00:00", "updatedAt": "2026-07-17T00:00:00+00:00",
            })
        with self.assertRaises(ValueError):
            FrameRecord.from_dict({
                "id": "frame-demo", "actionInstanceId": "action-demo",
                "index": 0, "assetPath": "../../secret.png", "reviewStatus": "pending",
                "recordId": None, "qc": {"passed": False, "warnings": []},
            })
        with self.assertRaises(ValueError):
            FrameRecord.from_dict({
                "id": "frame-demo", "actionInstanceId": "action-demo",
                "index": 0, "assetPath": "C:/secret.png", "reviewStatus": "pending",
                "recordId": None, "qc": {"passed": False, "warnings": []},
            })


class ProjectStoreTest(unittest.TestCase):
    def test_default_project_persists_complete_relationships_and_gaps(self):
        with tempfile.TemporaryDirectory() as directory:
            data_root = Path(directory) / "generation-data"
            store = ProjectStore(data_root / "projects", data_root / "records")
            store.prepare_default(FakeCatalog())

            first = store.asset_tree(DEFAULT_PROJECT_ID)
            boy = first["characters"][0]
            outfit = boy["outfits"][0]
            idle = outfit["actionInstances"][0]

            self.assertEqual(first["project"]["id"], DEFAULT_PROJECT_ID)
            self.assertEqual(boy["character"]["identityId"], boy["identity"]["id"])
            self.assertEqual(outfit["outfit"]["activeMasterSetVersionId"], outfit["masterSets"][0]["id"])
            self.assertEqual(idle["definition"]["fps"], 8)
            self.assertEqual(len(idle["frames"]), 8)
            self.assertEqual(idle["frames"][0]["recordId"], idle["generationRecord"]["id"])
            self.assertTrue(any(gap["action"] == "walk" for gap in first["gaps"]))
            self.assertFalse(list(data_root.rglob("*.tmp")))

            project = Project.from_dict({**first["project"], "name": "Renamed Demo"})
            store.put_project(project)
            restored = ProjectStore(data_root / "projects", data_root / "records")
            restored.prepare_default(FakeCatalog())
            second = restored.asset_tree(DEFAULT_PROJECT_ID)

            self.assertEqual(second["project"]["name"], "Renamed Demo")
            self.assertEqual(second["characters"], first["characters"])
            self.assertEqual(second["generationRecords"], first["generationRecords"])

    def test_project_creation_is_atomic_concurrent_and_restart_safe(self):
        with tempfile.TemporaryDirectory() as directory:
            data_root = Path(directory) / "generation-data"
            store = ProjectStore(data_root / "projects", data_root / "records")

            def create(index):
                return store.create_project({
                    "name": f"Project {index}",
                    "artStyle": "restrained pixel art",
                    "viewMode": "side",
                    "canvasSize": 256,
                    "target": "cocos-wechat",
                })

            with ThreadPoolExecutor(max_workers=4) as executor:
                projects = list(executor.map(create, range(8)))

            self.assertEqual(len({project["id"] for project in projects}), 8)
            self.assertFalse(list(data_root.rglob("*.tmp")))

            restored = ProjectStore(data_root / "projects", data_root / "records")
            for project in projects:
                self.assertEqual(restored.get_project(project["id"]), project)

            with self.assertRaises(ValueError):
                restored.get_project("../outside")


if __name__ == "__main__":
    unittest.main()
