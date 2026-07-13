"""Windup application service.

HTTP routes delegate here; generation workflows do not depend on request
handlers, cookies or transport details.
"""

from __future__ import annotations

import json
import re
import shutil
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from . import config, generate, processing, provider
from .action_pipeline import ActionPipeline
from .domain import (
    ACTION_LOOPS,
    ACTIONS,
    CATALOG,
    CONTRACT_VERSION,
    FPS,
    GENERATION,
    IMAGE_MODELS,
    POSES,
    VIEWS,
)
from .job_store import JobStore
from .review_store import ReviewStore
from .session_store import ProviderSession, ProviderSessionStore

SAFE_ID = re.compile(r"^[a-z0-9-]+$")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


class GenerationApplication:
    def __init__(self, root: Path, *, demo: bool = False):
        self.root = root
        self.data_root = root / "generation-data"
        self.jobs_root = self.data_root / "jobs"
        self.backups_root = self.data_root / "backups"
        self.characters_root = self.data_root / "characters"
        self.demo = demo
        self.catalog = {key: dict(value) for key, value in CATALOG.items()}
        self.jobs = JobStore(self.jobs_root)
        self.reviews = ReviewStore(self.data_root / "reviews")
        self.sessions = ProviderSessionStore(config.API_KEY, config.IMAGE_MODEL)
        self.action_pipeline = ActionPipeline(demo=demo, official_frame=self.official_frame)

    def prepare(self) -> None:
        for path in (self.jobs_root, self.backups_root, self.characters_root):
            path.mkdir(parents=True, exist_ok=True)
        self._load_custom_characters()
        self.jobs.load(now_iso())
        if config.API_KEY and not self.demo:
            try:
                provider.verify_key(config.API_KEY)
                self.sessions.default_verified = True
            except provider.ProviderError:
                self.sessions.default_key = ""
                self.sessions.default_verified = False

    def _load_custom_characters(self) -> None:
        if not self.characters_root.exists():
            return
        for card_file in self.characters_root.glob("*/card.json"):
            try:
                card = json.loads(card_file.read_text(encoding="utf-8"))
                character_id = str(card.get("id", ""))
                base = str(card.get("base", ""))
                if not SAFE_ID.fullmatch(character_id):
                    continue
                if not base.startswith("generation-data/characters/") or not (self.root / base).exists():
                    continue
                self.catalog[character_id] = {
                    "label": str(card.get("label", character_id)),
                    "base": base,
                    "root": str(Path(base).parent),
                    "description": str(card.get("description", "")),
                    "custom": True,
                    "card": str(card_file.relative_to(self.root)),
                }
            except (OSError, ValueError, TypeError):
                continue

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
            "characters": [{"id": key, "label": value["label"]} for key, value in self.catalog.items()],
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
        return {"ok": True, **session.public(), "storage": "isolated-process-session", "models": IMAGE_MODELS}

    def character_card(self, character_id: str) -> dict:
        item = dict(self.catalog[character_id])
        card_path = item.get("card")
        if card_path and (self.root / card_path).exists():
            item["cardData"] = json.loads((self.root / card_path).read_text(encoding="utf-8"))
        item["assets"] = self.character_asset_manifest(character_id)
        return item

    def characters(self) -> dict:
        return {"characters": [{"id": key, **self.character_card(key)} for key in self.catalog]}

    def official_frame(self, character_id: str, view: str, action: str, frame_index: int) -> Path:
        name = f"{action}-{frame_index + 1:02d}.png"
        if character_id == "lamplighter":
            if view == "side" and action == "walk":
                return self.root / "assets/resources/character/frames" / name
            return self.root / "assets/resources/character/views" / view / name
        custom_root = self.catalog.get(character_id, {}).get("root")
        if custom_root:
            return self.root / custom_root / "views" / view / name
        return self.root / "assets/resources/characters" / character_id / "views" / view / name

    def character_asset_manifest(self, character_id: str) -> dict:
        manifest = {}
        for view in VIEWS:
            actions = {}
            for action in ACTIONS:
                frames = []
                for frame_index in range(len(POSES[action])):
                    path = self.official_frame(character_id, view, action, frame_index)
                    if not path.exists():
                        break
                    frames.append(str(path.relative_to(self.root)))
                if frames:
                    actions[action] = {"frames": frames, "fps": FPS, "loop": ACTION_LOOPS[action]}
            manifest[view] = actions
        return manifest

    def _update_job(self, job_id: str, **changes) -> dict:
        return self.jobs.update(job_id, updatedAt=now_iso(), **changes)

    def _provenance(
        self,
        job: dict,
        frame_index: int,
        pose: str,
        elapsed: float,
        mode: str,
        *,
        view: str | None = None,
        action: str | None = None,
    ) -> None:
        row = {
            "ts": time.time(), "job": job["id"], "batch": job["batch"],
            "character": job["request"]["character"], "view": view or job["request"].get("view", "side"),
            "action": action or job["request"].get("action", "idle"), "frame": frame_index,
            "prompt": pose, "model": job["request"].get("model", config.IMAGE_MODEL),
            "mode": mode, "elapsed_s": round(elapsed, 2),
            "aigc_label": "AI-generated" if mode.startswith("live") else "demo-copy",
        }
        self.data_root.mkdir(parents=True, exist_ok=True)
        with (self.data_root / "provenance.jsonl").open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(row, ensure_ascii=False) + "\n")

    def _credentials(self, session_id: str) -> ProviderSession:
        session = self.session(session_id)
        if not self.demo and (not session.api_key or not session.verified):
            raise ValueError("请先验证七牛云 API Key")
        return session

    def create_character_job(self, session_id: str, payload: dict) -> dict:
        credentials = self._credentials(session_id)
        name = str(payload.get("name", "")).strip()
        description = str(payload.get("description", "")).strip()
        model = str(payload.get("model", "")).strip()
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
                "description": description, "model": model,
                "starterView": GENERATION["starterPack"]["view"],
                "starterActions": starter_actions,
                "generationRoute": GENERATION["defaultRoute"],
            },
            "outputs": [], "createdAt": now_iso(), "updatedAt": now_iso(),
        }
        self.jobs.add(job)
        threading.Thread(target=self._run_character_job, args=(job_id, credentials.api_key), daemon=True).start()
        return job

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
        threading.Thread(target=self._run_job, args=(job_id, credentials.api_key), daemon=True).start()
        return job

    def _run_job(self, job_id: str, api_key: str) -> None:
        job = self.jobs[job_id]
        request = job["request"]
        character_id, view, action = request["character"], request["view"], request["action"]
        job_root = self.jobs_root / job_id
        live = bool(api_key) and not self.demo
        try:
            self._update_job(job_id, status="generating", progress=2, message="正在准备角色母版")
            base = self.root / self.catalog[character_id]["base"]
            if not base.exists():
                raise RuntimeError("角色母版不存在")
            batch = self.action_pipeline.run(
                job_id=job_id,
                job_root=job_root,
                character_id=character_id,
                base=base,
                description=self.catalog[character_id]["description"],
                view=view,
                action=action,
                phases=POSES[action],
                mode=request["mode"],
                frame_index=request["frameIndex"],
                route=request["generationRoute"],
                custom_prompt=request.get("customPrompt", ""),
                model=request["model"],
                api_key=api_key,
                progress=lambda progress, message: self._update_job(job_id, progress=progress, message=message),
                provenance=lambda index, pose, elapsed, mode: self._provenance(job, index, pose, elapsed, mode),
            )
            self._update_job(
                job_id,
                status="awaiting_review",
                progress=100,
                message="候选动作已切分并完成连续性质检，等待人工确认",
                outputs=batch.outputs,
                quality=batch.quality,
                generationRoute=batch.route,
                sourceCallCount=batch.source_calls,
                provider="live" if live else "demo",
            )
        except Exception as error:
            self._update_job(job_id, status="failed", message=str(error), error=str(error))

    def _run_character_job(self, job_id: str, api_key: str) -> None:
        job = self.jobs[job_id]
        request = job["request"]
        job_root = self.jobs_root / job_id
        raw, cutout, output = job_root / "raw/base.png", job_root / "cutout/base.png", job_root / "normalized/base.png"
        live = bool(api_key) and not self.demo
        try:
            self._update_job(job_id, status="generating", progress=5, message="正在构建原创角色母版")
            raw.parent.mkdir(parents=True, exist_ok=True)
            cutout.parent.mkdir(parents=True, exist_ok=True)
            if live:
                generate.gen_character(request["description"], str(raw), model=request["model"], api_key=api_key)
                self._update_job(job_id, progress=24, message="正在去背景与统一母版画布")
                processing.matte_chroma(raw, cutout)
            else:
                source = self.root / self.catalog["lamplighter"]["base"]
                shutil.copy2(source, raw)
                shutil.copy2(source, cutout)
            processing.normalize_frame(cutout, output, "idle", 0)
            outputs = [{
                "kind": "base", "frameIndex": 0,
                "url": f"/generation-data/jobs/{job_id}/normalized/base.png",
                "path": "normalized/base.png", "file": "base.png",
            }]
            qualities = {}
            source_calls = 1 if live else 0
            actions = request["starterActions"]
            view = request["starterView"]
            for order, action in enumerate(actions):
                def update_action_progress(percent, message, *, order=order):
                    overall = 30 + round((order + percent / 100) / len(actions) * 64)
                    self._update_job(job_id, progress=overall, message=message)

                batch = self.action_pipeline.run(
                    job_id=job_id,
                    job_root=job_root,
                    character_id=request["character"],
                    base=output,
                    description=request["description"],
                    view=view,
                    action=action,
                    phases=POSES[action],
                    mode="full",
                    frame_index=0,
                    route=request["generationRoute"],
                    custom_prompt="",
                    model=request["model"],
                    api_key=api_key,
                    progress=update_action_progress,
                    provenance=lambda index, pose, elapsed, mode, action=action: self._provenance(
                        job, index, pose, elapsed, mode, view=view, action=action,
                    ),
                )
                outputs.extend(batch.outputs)
                qualities[action] = batch.quality
                source_calls += batch.source_calls
            self._update_job(
                job_id,
                status="awaiting_review",
                progress=100,
                message="角色母版与基础动作包已生成，等待整体确认入库",
                outputs=outputs,
                quality={"actions": qualities, "semanticReviewRequired": True},
                generationRoute=request["generationRoute"],
                sourceCallCount=source_calls,
                provider="live" if live else "demo",
            )
        except Exception as error:
            self._update_job(job_id, status="failed", message=str(error), error=str(error))

    def promote_job(self, job_id: str) -> dict:
        job = self.jobs.get(job_id)
        if not job or job.get("status") != "awaiting_review":
            raise ValueError("该任务尚不可采用")
        request = job["request"]
        if request.get("type") == "character":
            character_id = request["character"]
            character_root = self.characters_root / character_id
            starter_actions = request.get("starterActions", [])
            frame_outputs = [output for output in job.get("outputs", []) if output.get("kind") == "frame"]
            expected_frames = sum(len(POSES[action]) for action in starter_actions)
            if not starter_actions or len(frame_outputs) != expected_frames:
                raise ValueError("角色包缺少完整基础动作，请重新生成后再入库")
            source = self._candidate_path(job_id, next(output for output in job["outputs"] if output.get("kind") == "base"))
            target = character_root / "base.png"
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
            promoted = []
            for output in frame_outputs:
                source_frame = self._candidate_path(job_id, output)
                target_frame = character_root / "views" / output["view"] / output["file"]
                target_frame.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source_frame, target_frame)
                promoted.append(str(target_frame.relative_to(self.root)))
            card = {
                "id": character_id, "label": request["name"], "description": request["description"],
                "base": str(target.relative_to(self.root)), "createdAt": now_iso(),
                "sourceJob": job_id, "model": request.get("model", config.IMAGE_MODEL),
                "starterPack": {"view": request["starterView"], "actions": starter_actions},
                "generationRoute": job.get("generationRoute", request.get("generationRoute")),
                "sourceCallCount": job.get("sourceCallCount"),
            }
            write_json(character_root / "card.json", card)
            self.catalog[character_id] = {
                "label": card["label"], "description": card["description"], "base": card["base"],
                "root": str(character_root.relative_to(self.root)), "custom": True,
                "card": str((character_root / "card.json").relative_to(self.root)),
            }
            character = {
                "id": character_id, "label": card["label"], "base": card["base"],
                "root": str(character_root.relative_to(self.root)), "description": card["description"],
                "assets": self.character_asset_manifest(character_id),
            }
            return self._update_job(
                job_id, status="approved", message="角色与基础动作已加入资产库",
                character=character, promoted=promoted,
            )
        backup = self.backups_root / job_id
        promoted = []
        for output in job.get("outputs", []):
            source = self._candidate_path(job_id, output)
            target = self.official_frame(request["character"], request["view"], request["action"], output["frameIndex"])
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.exists():
                backup.mkdir(parents=True, exist_ok=True)
                shutil.copy2(target, backup / target.name)
            shutil.copy2(source, target)
            promoted.append(str(target.relative_to(self.root)))
        return self._update_job(job_id, status="approved", message="候选帧已采用，正式资产已备份", promoted=promoted)

    def _candidate_path(self, job_id: str, output: dict) -> Path:
        relative = Path(str(output.get("path") or f"normalized/{output['file']}"))
        if relative.is_absolute() or ".." in relative.parts:
            raise ValueError("候选资产路径不合法")
        candidate = self.jobs_root / job_id / relative
        if not candidate.exists():
            raise ValueError("候选资产文件不存在")
        return candidate
