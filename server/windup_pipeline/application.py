"""Windup application service.

HTTP routes delegate here; generation workflows do not depend on request
handlers, cookies or transport details.
"""

from __future__ import annotations

import threading
import uuid
from datetime import datetime
from pathlib import Path

from .asset_catalog import AssetCatalog
from .domain import (
    ACTIONS,
    CONTRACT_VERSION,
    FPS,
    GENERATION,
    IMAGE_MODELS,
    POSES,
    VIEWS,
)
from .generation_executor import GenerationExecutor
from .job_store import JobStore
from .publisher import AssetPublisher
from .reference_store import ReferenceStore
from .review_store import ReviewStore
from .time_utils import now_iso


class GenerationApplication:
    def __init__(self, root: Path):
        self.root = root
        self.data_root = root / "generation-data"
        self.jobs_root = self.data_root / "jobs"
        self.backups_root = self.data_root / "backups"
        self.characters_root = self.data_root / "characters"
        self.references_root = self.data_root / "references"
        self.demo = True
        self.jobs = JobStore(self.jobs_root)
        self.reviews = ReviewStore(self.data_root / "reviews")
        self.assets = AssetCatalog(root, self.characters_root)
        self.references = ReferenceStore(self.references_root)
        self.catalog = self.assets.records
        self.executor = GenerationExecutor(
            root=root,
            data_root=self.data_root,
            jobs_root=self.jobs_root,
            jobs=self.jobs,
            catalog=self.assets,
        )
        self.publisher = AssetPublisher(
            root=root,
            jobs_root=self.jobs_root,
            backups_root=self.backups_root,
            characters_root=self.characters_root,
            catalog=self.assets,
        )

    def prepare(self) -> None:
        for path in (self.jobs_root, self.backups_root, self.characters_root):
            path.mkdir(parents=True, exist_ok=True)
        self.references.prepare()
        self.assets.load_custom()
        self.jobs.load(now_iso(), contract_version=CONTRACT_VERSION)
    def health(self) -> dict:
        return {
            "ok": True,
            "configured": True,
            "verified": True,
            "model": IMAGE_MODELS[0],
            "demo": True,
            "fallback": False,
            "provider": "Windup 内置演示引擎",
            "contractVersion": CONTRACT_VERSION,
            "fps": FPS,
            "characters": self.assets.summaries(),
        }

    def character_card(self, character_id: str) -> dict:
        return self.assets.character_card(character_id)

    def characters(self) -> dict:
        return {
            "contractVersion": CONTRACT_VERSION,
            **self.assets.characters(),
        }

    def upload_reference(
        self,
        project_id: str,
        data: bytes,
        media_type: str,
        filename: str = "",
    ) -> dict:
        return self.references.save(project_id, data, media_type, filename)

    def official_frame(self, character_id: str, view: str, action: str, frame_index: int) -> Path:
        return self.assets.official_frame(character_id, view, action, frame_index)

    def character_asset_manifest(self, character_id: str) -> dict:
        return self.assets.manifest(character_id)

    def _update_job(self, job_id: str, **changes: object) -> dict:
        return self.jobs.update(job_id, updatedAt=now_iso(), **changes)

    def create_character_job(self, payload: dict) -> dict:
        def text_field(key: str, default: str = "") -> str:
            value = payload[key] if key in payload else default
            if not isinstance(value, str):
                raise ValueError(f"{key} 必须是文本")
            return value.strip()

        name = text_field("name")
        description = text_field("description")
        style = text_field("style")
        palette = text_field("palette")
        model = text_field("model")
        project_id = text_field("projectId", "windup-demo")
        reference_value = payload.get("referenceAssetId")
        if reference_value is not None and not isinstance(reference_value, str):
            raise ValueError("referenceAssetId 必须是文本或空值")
        reference_id = (reference_value or "").strip()
        if len(style) > 120 or len(palette) > 120:
            raise ValueError("风格与配色各不超过 120 字")
        raw_starter_actions = payload.get("starterActions", GENERATION["starterPack"]["actions"])
        if not 1 <= len(name) <= 40:
            raise ValueError("资产名称需要 1–40 字")
        if not 12 <= len(description) <= 800:
            raise ValueError("角色定义需要 12–800 字")
        if model not in IMAGE_MODELS:
            raise ValueError("请选择有效的图像模型")
        if reference_id:
            self.references.resolve(project_id, reference_id)
        if not isinstance(raw_starter_actions, list):
            raise ValueError("基础动作包格式不合法")
        starter_actions = list(dict.fromkeys(str(action) for action in raw_starter_actions))
        if not starter_actions or len(starter_actions) > 3 or any(action not in ACTIONS for action in starter_actions):
            raise ValueError("新角色至少需要一个有效的基础动作")
        job_id = uuid.uuid4().hex[:12]
        character_id = f"custom-{uuid.uuid4().hex[:8]}"
        job = {
            "id": job_id, "batch": f"C-{datetime.now().strftime('%Y%m%d-%H%M%S')}",
            "contractVersion": CONTRACT_VERSION,
            "status": "queued", "progress": 0, "message": "新角色与基础动作包已进入队列",
            "request": {
                "type": "character", "character": character_id, "name": name,
                "description": description, "style": style, "palette": palette, "model": model,
                "projectId": project_id, "referenceAssetId": reference_id or None,
                "sourceType": "uploaded_reference" if reference_id else "text",
                "starterView": GENERATION["starterPack"]["view"],
                "starterActions": starter_actions,
                "generationRoute": GENERATION["defaultRoute"],
            },
            "outputs": [], "createdAt": now_iso(), "updatedAt": now_iso(),
        }
        self.jobs.add(job)
        threading.Thread(target=self.executor.run_character, args=(job_id,), daemon=True).start()
        return job

    def create_job(self, payload: dict) -> dict:
        def text_field(key: str, default: str = "") -> str:
            value = payload[key] if key in payload else default
            if not isinstance(value, str):
                raise ValueError(f"{key} 必须是文本")
            return value.strip()

        character_id = text_field("character")
        view = text_field("view")
        action = text_field("action")
        mode = text_field("mode", "full")
        route = text_field("route", GENERATION["defaultRoute"])
        custom_prompt = text_field("customPrompt")
        model = text_field("model", IMAGE_MODELS[0])
        if (
            character_id not in self.catalog
            or view not in VIEWS
            or action not in ACTIONS
            or mode not in {"full", "single"}
            or route not in GENERATION["routes"]
        ):
            raise ValueError("生成参数不合法")
        if len(custom_prompt) > 800:
            raise ValueError("画面约束不能超过 800 字")
        if model not in IMAGE_MODELS:
            raise ValueError("请选择有效的图像模型")
        frame_index = int(payload.get("frameIndex", 0))
        if not 0 <= frame_index < len(POSES[action]):
            raise ValueError("帧号越界")
        job_id = uuid.uuid4().hex[:12]
        job = {
            "id": job_id, "batch": f"G-{datetime.now().strftime('%Y%m%d-%H%M%S')}",
            "contractVersion": CONTRACT_VERSION,
            "status": "queued", "progress": 0, "message": "已进入生成队列",
            "request": {
                "character": character_id, "view": view, "action": action, "mode": mode,
                "frameIndex": frame_index, "fps": FPS, "customPrompt": custom_prompt, "model": model,
                "generationRoute": "frames" if mode == "single" else route,
            },
            "outputs": [], "createdAt": now_iso(), "updatedAt": now_iso(),
        }
        self.jobs.add(job)
        threading.Thread(target=self.executor.run_action, args=(job_id,), daemon=True).start()
        return job

    def promote_job(self, job_id: str) -> dict:
        job = self.jobs.get(job_id)
        if not job or job.get("status") != "awaiting_review":
            raise ValueError("该任务尚不可采用")
        result = self.publisher.promote(job)
        return self._update_job(job_id, status="approved", **result)
