"""Atomic file store and read model for the MS1 project relationship graph."""

from __future__ import annotations

import json
import threading
import uuid
from pathlib import Path

from .domain import ACTION_LOOPS, ACTIONS, FPS, POSES, VIEWS
from .project_models import (
    SAFE_ID,
    ActionInstance,
    Character,
    CharacterIdentity,
    FrameRecord,
    GenerationRecord,
    MasterSetVersion,
    Outfit,
    Project,
)
from .time_utils import now_iso

DEFAULT_PROJECT_ID = "project-windup-demo"


class ProjectStore:
    def __init__(self, projects_root: Path, records_root: Path):
        self.projects_root = projects_root
        self.records_root = records_root
        self._lock = threading.RLock()

    @staticmethod
    def _validate_id(value: str) -> str:
        if not isinstance(value, str) or not SAFE_ID.fullmatch(value):
            raise ValueError("资源 ID 不合法")
        return value

    def _project_root(self, project_id: str) -> Path:
        return self.projects_root / self._validate_id(project_id)

    def _project_path(self, project_id: str) -> Path:
        return self._project_root(project_id) / "project.json"

    def _character_root(self, project_id: str, character_id: str) -> Path:
        return self._project_root(project_id) / "characters" / self._validate_id(character_id)

    def _record_path(self, record_id: str) -> Path:
        return self.records_root / f"{self._validate_id(record_id)}.json"

    @staticmethod
    def _read(path: Path) -> dict | None:
        if not path.exists():
            return None
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError, TypeError) as error:
            raise ValueError(f"项目数据损坏：{path.name}") from error
        if not isinstance(value, dict):
            raise ValueError(f"项目数据损坏：{path.name}")
        return value

    @staticmethod
    def _atomic_write(path: Path, value: dict) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(path.suffix + ".tmp")
        temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporary.replace(path)

    def _write_if_missing(self, path: Path, value: dict) -> None:
        if not path.exists():
            self._atomic_write(path, value)

    def put_project(self, project: Project) -> dict:
        with self._lock:
            value = project.to_dict()
            self._atomic_write(self._project_path(project.id), value)
            return value

    def create_project(self, payload: dict) -> dict:
        if not isinstance(payload, dict):
            raise ValueError("Project 请求必须是对象")
        with self._lock:
            project_id = f"project-{uuid.uuid4().hex[:12]}"
            timestamp = now_iso()
            project = Project.from_dict({
                "id": project_id,
                "name": payload.get("name"),
                "artStyle": payload.get("artStyle"),
                "viewMode": payload.get("viewMode"),
                "canvasSize": payload.get("canvasSize"),
                "target": payload.get("target"),
                "createdAt": timestamp,
                "updatedAt": timestamp,
            })
            return self.put_project(project)

    def get_project(self, project_id: str) -> dict | None:
        with self._lock:
            value = self._read(self._project_path(project_id))
            return Project.from_dict(value).to_dict() if value else None

    def put_generation_record(self, record: GenerationRecord) -> dict:
        with self._lock:
            value = record.to_dict()
            self._atomic_write(self._record_path(record.id), value)
            return value

    def prepare_default(self, catalog) -> None:
        with self._lock:
            timestamp = now_iso()
            project = Project.from_dict({
                "id": DEFAULT_PROJECT_ID,
                "name": "Windup Demo",
                "artStyle": "低饱和文艺像素风",
                "viewMode": "side",
                "canvasSize": 256,
                "target": "cocos-wechat",
                "createdAt": timestamp,
                "updatedAt": timestamp,
            })
            self._write_if_missing(self._project_path(project.id), project.to_dict())

            for character_id in sorted(catalog.records):
                source = catalog.records[character_id]
                self._prepare_catalog_character(project.id, character_id, source, catalog, timestamp)

    def _prepare_catalog_character(
        self,
        project_id: str,
        character_id: str,
        source: dict,
        catalog,
        timestamp: str,
    ) -> None:
        character_root = self._character_root(project_id, character_id)
        identity_id = f"identity-{character_id}-v1"
        outfit_id = f"outfit-{character_id}-default"
        master_id = f"master-{character_id}-v1"
        character = Character.from_dict({
            "id": character_id,
            "projectId": project_id,
            "name": source["label"],
            "identityId": identity_id,
            "activeOutfitId": outfit_id,
        })
        identity = CharacterIdentity.from_dict({
            "id": identity_id,
            "description": source["description"],
            "referenceAssetId": None,
            "version": 1,
        })
        outfit = Outfit.from_dict({
            "id": outfit_id,
            "characterId": character_id,
            "name": "默认造型",
            "activeMasterSetVersionId": master_id,
        })
        master = MasterSetVersion.from_dict({
            "id": master_id,
            "outfitId": outfit_id,
            "status": "locked",
            "sourceType": "legacy_import",
            "views": {"side": {"direction": "right", "assetPath": source["base"]}},
            "createdAt": timestamp,
            "lockedAt": timestamp,
        })
        self._write_if_missing(character_root / "character.json", character.to_dict())
        self._write_if_missing(character_root / "identity.json", identity.to_dict())
        self._write_if_missing(character_root / "outfits" / f"{outfit.id}.json", outfit.to_dict())
        self._write_if_missing(
            character_root / "masters" / master.id / "manifest.json",
            master.to_dict(),
        )

        manifest = catalog.manifest(character_id)
        for view in sorted(manifest):
            for action in sorted(manifest[view]):
                frame_paths = list(manifest[view][action].get("frames", []))
                if not frame_paths:
                    continue
                self._prepare_catalog_action(
                    character_root=character_root,
                    character_id=character_id,
                    outfit_id=outfit_id,
                    view=view,
                    action=action,
                    frame_paths=frame_paths,
                    timestamp=timestamp,
                )

    def _prepare_catalog_action(
        self,
        *,
        character_root: Path,
        character_id: str,
        outfit_id: str,
        view: str,
        action: str,
        frame_paths: list[str],
        timestamp: str,
    ) -> None:
        instance_id = f"action-{character_id}-{view}-{action}-v1"
        record_id = f"record-import-{character_id}-{view}-{action}-v1"
        expected = len(POSES[action])
        instance = ActionInstance.from_dict({
            "id": instance_id,
            "outfitId": outfit_id,
            "definitionId": action,
            "view": view,
            "status": "promoted" if len(frame_paths) == expected else "awaiting_review",
            "version": 1,
        })
        record = GenerationRecord.from_dict({
            "id": record_id,
            "jobId": f"legacy-{character_id}-{view}-{action}",
            "kind": "legacy_import",
            "model": "built-in",
            "route": "import",
            "attempt": 1,
            "elapsedMs": 0,
            "cost": None,
            "parentRecordId": None,
            "createdAt": timestamp,
        })
        action_root = character_root / "actions" / instance.id
        self._write_if_missing(action_root / "action.json", instance.to_dict())
        self._write_if_missing(self._record_path(record.id), record.to_dict())
        for index, asset_path in enumerate(frame_paths[:expected]):
            frame = FrameRecord.from_dict({
                "id": f"frame-{character_id}-{view}-{action}-{index + 1:02d}-v1",
                "actionInstanceId": instance.id,
                "index": index,
                "assetPath": asset_path,
                "reviewStatus": "pass",
                "recordId": record.id,
                "qc": {"passed": True, "warnings": [], "source": "legacy_import"},
            })
            self._write_if_missing(action_root / "frames" / f"{frame.id}.json", frame.to_dict())

    def asset_tree(self, project_id: str) -> dict | None:
        with self._lock:
            project_value = self._read(self._project_path(project_id))
            if not project_value:
                return None
            project = Project.from_dict(project_value).to_dict()
            characters = []
            gaps = []
            records = {}
            characters_root = self._project_root(project_id) / "characters"
            for character_root in sorted(characters_root.glob("*")) if characters_root.exists() else []:
                if not character_root.is_dir():
                    continue
                item, item_gaps, item_records = self._character_tree(project_id, character_root)
                characters.append(item)
                gaps.extend(item_gaps)
                records.update(item_records)
            return {
                "project": project,
                "characters": characters,
                "gaps": gaps,
                "generationRecords": [records[key] for key in sorted(records)],
            }

    def _character_tree(self, project_id: str, character_root: Path) -> tuple[dict, list[dict], dict]:
        character = Character.from_dict(self._read(character_root / "character.json") or {}).to_dict()
        if character["projectId"] != project_id:
            raise ValueError("角色不属于当前 Project")
        identity = CharacterIdentity.from_dict(self._read(character_root / "identity.json") or {}).to_dict()
        outfits = []
        gaps = []
        records = {}
        for outfit_path in sorted((character_root / "outfits").glob("*.json")):
            outfit = Outfit.from_dict(self._read(outfit_path) or {}).to_dict()
            masters = [
                MasterSetVersion.from_dict(self._read(path) or {}).to_dict()
                for path in sorted((character_root / "masters").glob("*/manifest.json"))
            ]
            actions, action_records = self._action_trees(character_root, outfit["id"])
            records.update(action_records)
            gaps.extend(self._gaps(character["id"], outfit["id"], actions))
            outfits.append({
                "outfit": outfit,
                "masterSets": masters,
                "actionInstances": actions,
            })
        return {
            "character": character,
            "identity": identity,
            "outfits": outfits,
        }, gaps, records

    def _action_trees(self, character_root: Path, outfit_id: str) -> tuple[list[dict], dict]:
        actions = []
        records = {}
        for action_path in sorted((character_root / "actions").glob("*/action.json")):
            instance = ActionInstance.from_dict(self._read(action_path) or {}).to_dict()
            if instance["outfitId"] != outfit_id:
                continue
            action_root = action_path.parent
            frames = [
                FrameRecord.from_dict(self._read(path) or {}).to_dict()
                for path in sorted((action_root / "frames").glob("*.json"))
            ]
            generation_record = None
            record_ids = {frame["recordId"] for frame in frames if frame["recordId"]}
            for record_id in sorted(record_ids):
                value = self._read(self._record_path(record_id))
                if value:
                    record = GenerationRecord.from_dict(value).to_dict()
                    records[record_id] = record
                    generation_record = generation_record or record
            definition_id = instance["definitionId"]
            actions.append({
                "instance": instance,
                "definition": {
                    "id": definition_id,
                    "fps": FPS,
                    "frameCount": len(POSES[definition_id]),
                    "loop": ACTION_LOOPS[definition_id],
                    "canvas": {"width": 256, "height": 256},
                    "anchor": "feet-center",
                },
                "frames": sorted(frames, key=lambda frame: frame["index"]),
                "generationRecord": generation_record,
            })
        actions.sort(key=lambda item: (item["instance"]["view"], item["instance"]["definitionId"]))
        return actions, records

    @staticmethod
    def _gaps(character_id: str, outfit_id: str, actions: list[dict]) -> list[dict]:
        available = {
            (item["instance"]["view"], item["instance"]["definitionId"]): len(item["frames"])
            for item in actions
        }
        gaps = []
        for view in sorted(VIEWS):
            for action in sorted(ACTIONS):
                expected = len(POSES[action])
                count = available.get((view, action), 0)
                if count >= expected:
                    continue
                gaps.append({
                    "characterId": character_id,
                    "outfitId": outfit_id,
                    "view": view,
                    "action": action,
                    "expectedFrameCount": expected,
                    "availableFrameCount": count,
                    "missingFrameCount": expected - count,
                    "status": "missing" if count == 0 else "partial",
                })
        return gaps
