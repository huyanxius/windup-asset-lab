"""Windup application service.

HTTP routes delegate here; generation workflows do not depend on request
handlers, cookies or transport details.
"""

from __future__ import annotations

import threading
import uuid
from datetime import datetime
from pathlib import Path

from . import config, idle_blink_experiment, provider
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
from .review_store import ReviewStore
from .session_store import ProviderSession, ProviderSessionStore
from .time_utils import now_iso


class GenerationApplication:
    def __init__(self, root: Path, *, demo: bool = False):
        self.root = root
        self.data_root = root / "generation-data"
        self.jobs_root = self.data_root / "jobs"
        self.backups_root = self.data_root / "backups"
        self.characters_root = self.data_root / "characters"
        self.demo = demo
        self.jobs = JobStore(self.jobs_root)
        self.reviews = ReviewStore(self.data_root / "reviews")
        self.sessions = ProviderSessionStore(config.API_KEY, config.IMAGE_MODEL)
        self.assets = AssetCatalog(root, self.characters_root)
        self.catalog = self.assets.records
        self.executor = GenerationExecutor(
            root=root,
            data_root=self.data_root,
            jobs_root=self.jobs_root,
            jobs=self.jobs,
            catalog=self.assets,
            demo=demo,
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
        self.assets.load_custom()
        self.jobs.load(now_iso())
        if config.API_KEY and not self.demo:
            try:
                provider.verify_key(config.API_KEY)
                self.sessions.default_verified = True
            except provider.ProviderError:
                self.sessions.default_key = ""
                self.sessions.default_verified = False

    def session(self, session_id: str) -> ProviderSession:
        return self.sessions.get_or_create(session_id)

    def health(self, session_id: str) -> dict:
        session = self.session(session_id)
        return {
            "ok": True,
            **session.public(),
            "demo": self.demo,
            "provider": "七牛云 QnAIGC",
            "contractVersion": CONTRACT_VERSION,
            "fps": FPS,
            "characters": self.assets.summaries(),
        }

    def models(self, session_id: str) -> dict:
        session = self.session(session_id)
        return {
            "provider": "七牛云 QnAIGC",
            "models": IMAGE_MODELS,
            "selected": session.model or IMAGE_MODELS[0],
            "source": "QnAIGC image model documentation",
            "contractVersion": CONTRACT_VERSION,
        }

    def connect_provider(self, session_id: str, payload: dict) -> dict:
        api_key = str(payload.get("apiKey", "")).strip()
        model = str(payload.get("model", "")).strip() or IMAGE_MODELS[0]
        if not 16 <= len(api_key) <= 512 or any(char.isspace() for char in api_key):
            raise ValueError("API Key 格式不合法")
        if model not in IMAGE_MODELS:
            raise ValueError("不支持的图像模型")
        try:
            provider.verify_key(api_key)
        except provider.ProviderError as error:
            self.sessions.fail(session_id, str(error))
            raise
        session = self.sessions.connect(session_id, api_key, model)
        return {
            "ok": True,
            **session.public(),
            "storage": "isolated-process-session",
            "models": IMAGE_MODELS,
            "contractVersion": CONTRACT_VERSION,
        }

    def character_card(self, character_id: str) -> dict:
        return self.assets.character_card(character_id)

    def characters(self) -> dict:
        return self.assets.characters()

    def official_frame(self, character_id: str, view: str, action: str, frame_index: int) -> Path:
        return self.assets.official_frame(character_id, view, action, frame_index)

    def character_asset_manifest(self, character_id: str) -> dict:
        return self.assets.manifest(character_id)

    def _update_job(self, job_id: str, **changes) -> dict:
        return self.jobs.update(job_id, updatedAt=now_iso(), **changes)

    def _credentials(self, session_id: str) -> ProviderSession:
        session = self.session(session_id)
        if not self.demo and (not session.api_key or not session.verified):
            raise ValueError("请先验证七牛云 API Key")
        return session

    def create_character_job(self, session_id: str, payload: dict) -> dict:
        credentials = self._credentials(session_id)
        name = str(payload.get("name", "")).strip()
        description = str(payload.get("description", "")).strip()
        style = str(payload.get("style", "")).strip()
        palette = str(payload.get("palette", "")).strip()
        model = str(payload.get("model", "")).strip()
        if len(style) > 120 or len(palette) > 120:
            raise ValueError("风格与配色各不超过 120 字")
        raw_starter_actions = payload.get("starterActions", GENERATION["starterPack"]["actions"])
        if not 1 <= len(name) <= 40:
            raise ValueError("资产名称需要 1–40 字")
        if not 12 <= len(description) <= 800:
            raise ValueError("角色定义需要 12–800 字")
        if model not in IMAGE_MODELS:
            raise ValueError("请选择有效的图像模型")
        if not isinstance(raw_starter_actions, list):
            raise ValueError("基础动作包格式不合法")
        starter_actions = list(dict.fromkeys(str(action) for action in raw_starter_actions))
        if not starter_actions or len(starter_actions) > 3 or any(action not in ACTIONS for action in starter_actions):
            raise ValueError("新角色至少需要一个有效的基础动作")
        job_id = uuid.uuid4().hex[:12]
        character_id = f"custom-{uuid.uuid4().hex[:8]}"
        job = {
            "id": job_id, "batch": f"C-{datetime.now().strftime('%Y%m%d-%H%M%S')}",
            "status": "queued", "progress": 0, "message": "新角色与基础动作包已进入队列",
            "request": {
                "type": "character", "character": character_id, "name": name,
                "description": description, "style": style, "palette": palette, "model": model,
                "starterView": GENERATION["starterPack"]["view"],
                "starterActions": starter_actions,
                "generationRoute": GENERATION["defaultRoute"],
            },
            "outputs": [], "createdAt": now_iso(), "updatedAt": now_iso(),
        }
        self.jobs.add(job)
        threading.Thread(target=self.executor.run_character, args=(job_id, credentials.api_key), daemon=True).start()
        return job

    def run_idle_blink_experiment(self, session_id: str, payload: dict) -> dict:
        """Standalone reliability experiment: 1 generated blink frame + the
        existing master reused for the other 7 slots. Not part of the
        production contract or job store."""
        credentials = self._credentials(session_id)
        character_id = str(payload.get("character", ""))
        if character_id not in self.catalog:
            raise ValueError("角色不存在")
        record = self.catalog[character_id]
        model = str(payload.get("model", credentials.model or config.IMAGE_MODEL)).strip()
        if model not in IMAGE_MODELS:
            raise ValueError("请选择有效的图像模型")
        job_id = uuid.uuid4().hex[:12]
        job_root = self.data_root / "experiments" / "idle-blink" / job_id
        base_path = self.root / record["base"]
        blink_path = idle_blink_experiment.run(job_root, base_path, record["description"], model, credentials.api_key)
        blink_url = str(blink_path.relative_to(self.root).as_posix())
        outputs = [
            {
                "kind": "frame", "action": "idle", "frameIndex": index,
                "slot": slot,
                "url": record["base"] if slot == "open" else blink_url,
                "file": "base.png" if slot == "open" else "idle-blink.png",
            }
            for index, slot in enumerate(idle_blink_experiment.SLOT_PATTERN)
        ]
        return {"id": job_id, "character": character_id, "sourceCallCount": 1, "outputs": outputs}

    def create_job(self, session_id: str, payload: dict) -> dict:
        credentials = self._credentials(session_id)
        character_id = str(payload.get("character", ""))
        view = str(payload.get("view", ""))
        action = str(payload.get("action", ""))
        mode = str(payload.get("mode", "full"))
        route = str(payload.get("route", GENERATION["defaultRoute"]))
        custom_prompt = str(payload.get("customPrompt", "")).strip()
        model = str(payload.get("model", credentials.model or config.IMAGE_MODEL)).strip()
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
            "status": "queued", "progress": 0, "message": "已进入生成队列",
            "request": {
                "character": character_id, "view": view, "action": action, "mode": mode,
                "frameIndex": frame_index, "fps": FPS, "customPrompt": custom_prompt, "model": model,
                "generationRoute": "frames" if mode == "single" else route,
            },
            "outputs": [], "createdAt": now_iso(), "updatedAt": now_iso(),
        }
        self.jobs.add(job)
        threading.Thread(target=self.executor.run_action, args=(job_id, credentials.api_key), daemon=True).start()
        return job

    def promote_job(self, job_id: str) -> dict:
        job = self.jobs.get(job_id)
        if not job or job.get("status") != "awaiting_review":
            raise ValueError("该任务尚不可采用")
        result = self.publisher.promote(job)
        return self._update_job(job_id, status="approved", **result)
