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
from .domain import (
    ACTION_LOOPS,
    ACTIONS,
    CATALOG,
    CONTRACT_VERSION,
    FPS,
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

    def _provenance(self, job: dict, frame_index: int, pose: str, elapsed: float, mode: str) -> None:
        row = {
            "ts": time.time(), "job": job["id"], "batch": job["batch"],
            "character": job["request"]["character"], "view": job["request"].get("view", "side"),
            "action": job["request"].get("action", "idle"), "frame": frame_index,
            "prompt": pose, "model": job["request"].get("model", config.IMAGE_MODEL),
            "mode": mode, "elapsed_s": round(elapsed, 2),
            "aigc_label": "AI-generated" if mode == "live" else "demo-copy",
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
        if not 1 <= len(name) <= 40:
            raise ValueError("资产名称需要 1–40 字")
        if not 12 <= len(description) <= 800:
            raise ValueError("角色定义需要 12–800 字")
        if model not in IMAGE_MODELS:
            raise ValueError("请选择有效的图像模型")
        job_id = uuid.uuid4().hex[:12]
        character_id = f"custom-{uuid.uuid4().hex[:8]}"
        job = {
            "id": job_id, "batch": f"C-{datetime.now().strftime('%Y%m%d-%H%M%S')}",
            "status": "queued", "progress": 0, "message": "新角色创建任务已入队",
            "request": {"type": "character", "character": character_id, "name": name, "description": description, "model": model},
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
        custom_prompt = str(payload.get("customPrompt", "")).strip()
        model = str(payload.get("model", credentials.model or config.IMAGE_MODEL)).strip()
        if character_id not in self.catalog or view not in VIEWS or action not in ACTIONS or mode not in {"full", "single"}:
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
        frame_indices = [request["frameIndex"]] if request["mode"] == "single" else list(range(len(POSES[action])))
        job_root = self.jobs_root / job_id
        outputs = []
        live = bool(api_key) and not self.demo
        try:
            self._update_job(job_id, status="generating", progress=2, message="正在准备角色母版")
            base = self.root / self.catalog[character_id]["base"]
            if not base.exists():
                raise RuntimeError("角色母版不存在")
            for order, frame_index in enumerate(frame_indices):
                pose = POSES[action][frame_index]
                raw = job_root / "raw" / f"{action}-{frame_index + 1:02d}.png"
                cutout = job_root / "cutout" / raw.name
                output = job_root / "normalized" / raw.name
                raw.parent.mkdir(parents=True, exist_ok=True)
                cutout.parent.mkdir(parents=True, exist_ok=True)
                started = time.time()
                self._update_job(job_id, progress=5 + round(order / max(1, len(frame_indices)) * 78), message=f"正在生成 {action} 第 {frame_index + 1} 帧")
                if live:
                    prompt = pose + f"; true {view} game view; preserve exact pixel-art style"
                    if request.get("customPrompt"):
                        prompt += f"; creator constraints: {request['customPrompt']}"
                    generate.gen_frame(
                        str(base), self.catalog[character_id]["description"], prompt, str(raw),
                        model=request["model"], api_key=api_key,
                    )
                    processing.matte_chroma(raw, cutout)
                    self._provenance(job, frame_index, pose, time.time() - started, "live")
                else:
                    source = self.official_frame(character_id, view, action, frame_index)
                    if not source.exists():
                        source = self.official_frame("lamplighter", "side", "walk", frame_index % FPS)
                    shutil.copy2(source, raw)
                    shutil.copy2(source, cutout)
                    self._provenance(job, frame_index, pose, time.time() - started, "demo")
                processing.normalize_frame(cutout, output, action, frame_index)
                outputs.append({"frameIndex": frame_index, "url": f"/generation-data/jobs/{job_id}/normalized/{output.name}", "file": output.name, "pose": pose})
            self._update_job(job_id, status="awaiting_review", progress=100, message="候选帧已生成，等待人工确认", outputs=outputs, provider="live" if live else "demo")
        except Exception as error:
            self._update_job(job_id, status="failed", message=str(error), error=str(error))

    def _run_character_job(self, job_id: str, api_key: str) -> None:
        job = self.jobs[job_id]
        request = job["request"]
        job_root = self.jobs_root / job_id
        raw, cutout, output = job_root / "raw/base.png", job_root / "cutout/base.png", job_root / "normalized/base.png"
        live = bool(api_key) and not self.demo
        try:
            self._update_job(job_id, status="generating", progress=8, message="正在构建原创角色母版")
            raw.parent.mkdir(parents=True, exist_ok=True)
            cutout.parent.mkdir(parents=True, exist_ok=True)
            if live:
                generate.gen_character(request["description"], str(raw), model=request["model"], api_key=api_key)
                self._update_job(job_id, progress=72, message="正在去背景与统一画布")
                processing.matte_chroma(raw, cutout)
            else:
                source = self.root / self.catalog["lamplighter"]["base"]
                shutil.copy2(source, raw)
                shutil.copy2(source, cutout)
            processing.normalize_frame(cutout, output, "idle", 0)
            self._update_job(job_id, status="awaiting_review", progress=100, message="角色母版已生成，等待确认入库", outputs=[{"frameIndex": 0, "url": f"/generation-data/jobs/{job_id}/normalized/base.png", "file": "base.png"}], provider="live" if live else "demo")
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
            source = self.jobs_root / job_id / "normalized/base.png"
            target = character_root / "base.png"
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
            card = {
                "id": character_id, "label": request["name"], "description": request["description"],
                "base": str(target.relative_to(self.root)), "createdAt": now_iso(),
                "sourceJob": job_id, "model": request.get("model", config.IMAGE_MODEL),
            }
            write_json(character_root / "card.json", card)
            self.catalog[character_id] = {
                "label": card["label"], "description": card["description"], "base": card["base"],
                "root": str(character_root.relative_to(self.root)), "custom": True,
                "card": str((character_root / "card.json").relative_to(self.root)),
            }
            return self._update_job(job_id, status="approved", message="新角色已加入资产库", character={"id": character_id, "label": card["label"], "base": card["base"], "root": str(character_root.relative_to(self.root)), "description": card["description"]})
        backup = self.backups_root / job_id
        promoted = []
        for output in job.get("outputs", []):
            source = self.jobs_root / job_id / "normalized" / output["file"]
            target = self.official_frame(request["character"], request["view"], request["action"], output["frameIndex"])
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.exists():
                backup.mkdir(parents=True, exist_ok=True)
                shutil.copy2(target, backup / target.name)
            shutil.copy2(source, target)
            promoted.append(str(target.relative_to(self.root)))
        return self._update_job(job_id, status="approved", message="候选帧已采用，正式资产已备份", promoted=promoted)
