"""Transactional promotion from candidate jobs to the formal asset library."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from . import config
from .domain import POSES
from .time_utils import now_iso


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


class AssetPublisher:
    def __init__(self, *, root: Path, jobs_root: Path, backups_root: Path, characters_root: Path, catalog):
        self.root = root
        self.jobs_root = jobs_root
        self.backups_root = backups_root
        self.characters_root = characters_root
        self.catalog = catalog

    def promote(self, job: dict) -> dict:
        if job["request"].get("type") == "character":
            return self._promote_character(job)
        return self._promote_action(job)

    def _promote_character(self, job: dict) -> dict:
        request = job["request"]
        character_id = request["character"]
        character_root = self.characters_root / character_id
        starter_actions = request.get("starterActions", [])
        base_outputs = [output for output in job.get("outputs", []) if output.get("kind") == "base"]
        frame_outputs = [output for output in job.get("outputs", []) if output.get("kind") == "frame"]
        expected_frames = sum(len(POSES[action]) for action in starter_actions)
        if len(base_outputs) != 1 or not starter_actions or len(frame_outputs) != expected_frames:
            raise ValueError("角色包缺少完整基础动作，请重新生成后再入库")

        staging = self.characters_root / f".{character_id}-{job['id']}.tmp"
        shutil.rmtree(staging, ignore_errors=True)
        try:
            target_base = staging / "base.png"
            target_base.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(self.candidate_path(job["id"], base_outputs[0]), target_base)
            promoted = []
            for output in frame_outputs:
                target = staging / "views" / output["view"] / output["file"]
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(self.candidate_path(job["id"], output), target)
                promoted.append(
                    (character_root / target.relative_to(staging)).relative_to(self.root).as_posix()
                )
            final_base = (character_root / "base.png").relative_to(self.root).as_posix()
            card = {
                "id": character_id,
                "label": request["name"],
                "description": request["description"],
                "base": final_base,
                "createdAt": now_iso(),
                "sourceJob": job["id"],
                "model": request.get("model", config.IMAGE_MODEL),
                "starterPack": {"view": request["starterView"], "actions": starter_actions},
                "generationRoute": job.get("generationRoute", request.get("generationRoute")),
                "sourceCallCount": job.get("sourceCallCount"),
            }
            write_json(staging / "card.json", card)
            if character_root.exists():
                raise ValueError("目标角色已存在，未覆盖正式资产")
            staging.replace(character_root)
        except Exception:
            shutil.rmtree(staging, ignore_errors=True)
            raise

        card_file = character_root / "card.json"
        self.catalog.register(card, card_file)
        character = {
            "id": character_id,
            "label": card["label"],
            "base": card["base"],
            "root": character_root.relative_to(self.root).as_posix(),
            "description": card["description"],
            "assets": self.catalog.manifest(character_id),
        }
        return {
            "message": "角色与基础动作已加入资产库",
            "character": character,
            "promoted": promoted,
        }

    def _promote_action(self, job: dict) -> dict:
        request = job["request"]
        backup = self.backups_root / job["id"]
        operations = []
        for output in job.get("outputs", []):
            source = self.candidate_path(job["id"], output)
            target = self.catalog.official_frame(
                request["character"], request["view"], request["action"], output["frameIndex"],
            )
            operations.append((source, target))

        created = []
        backed_up = []
        try:
            for source, target in operations:
                target.parent.mkdir(parents=True, exist_ok=True)
                if target.exists():
                    backup.mkdir(parents=True, exist_ok=True)
                    backup_target = backup / target.name
                    shutil.copy2(target, backup_target)
                    backed_up.append((backup_target, target))
                else:
                    created.append(target)
                shutil.copy2(source, target)
        except Exception:
            for backup_source, target in backed_up:
                shutil.copy2(backup_source, target)
            for target in created:
                target.unlink(missing_ok=True)
            raise
        return {
            "message": "候选帧已采用，正式资产已备份",
            "promoted": [target.relative_to(self.root).as_posix() for _, target in operations],
        }

    def candidate_path(self, job_id: str, output: dict) -> Path:
        relative = Path(str(output.get("path") or f"normalized/{output['file']}"))
        if relative.is_absolute() or ".." in relative.parts:
            raise ValueError("候选资产路径不合法")
        candidate = self.jobs_root / job_id / relative
        if not candidate.exists():
            raise ValueError("候选资产文件不存在")
        return candidate
