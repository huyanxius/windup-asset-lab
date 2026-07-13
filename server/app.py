#!/usr/bin/env python3
"""Windup generation backend: static hosting, secure image API proxy and job runner."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import threading
import time
import uuid
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

try:  # Support both `python -m server.app` and the legacy direct script command.
    from .windup_pipeline import config, generate, processing, provider
    from .windup_pipeline.domain import ACTIONS, CATALOG, IMAGE_MODELS, POSES, VIEWS
    from .windup_pipeline.job_store import JobStore
except ImportError:
    from windup_pipeline import config, generate, processing, provider
    from windup_pipeline.domain import ACTIONS, CATALOG, IMAGE_MODELS, POSES, VIEWS
    from windup_pipeline.job_store import JobStore


ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = ROOT / "generation-data"
JOBS_ROOT = DATA_ROOT / "jobs"
BACKUPS_ROOT = DATA_ROOT / "backups"
CUSTOM_CHARACTERS_ROOT = DATA_ROOT / "characters"
JOB_STORE = JobStore(JOBS_ROOT)
DEMO_MODE = os.environ.get("WINDUP_DEMO") == "1"

SAFE_ID = re.compile(r"^[a-z0-9-]+$")
PROVIDER_VERIFIED = False
PROVIDER_ERROR = ""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def update_job(job_id: str, **changes) -> dict:
    return JOB_STORE.update(job_id, updatedAt=now_iso(), **changes)


def load_existing_jobs() -> None:
    JOB_STORE.load(now_iso())


def load_custom_characters() -> None:
    if not CUSTOM_CHARACTERS_ROOT.exists():
        return
    for card_file in CUSTOM_CHARACTERS_ROOT.glob("*/card.json"):
        try:
            card = json.loads(card_file.read_text(encoding="utf-8"))
            character_id = str(card.get("id", ""))
            if not SAFE_ID.fullmatch(character_id):
                continue
            base = str(card.get("base", ""))
            if not base.startswith("generation-data/characters/") or not (ROOT / base).exists():
                continue
            CATALOG[character_id] = {
                "label": str(card.get("label", character_id)),
                "base": base,
                "root": str(Path(base).parent),
                "description": str(card.get("description", "")),
                "custom": True,
                "card": str(card_file.relative_to(ROOT)),
            }
        except Exception:
            continue


def character_card(character_id: str) -> dict:
    item = dict(CATALOG[character_id])
    card_path = item.get("card")
    if card_path and (ROOT / card_path).exists():
        item["cardData"] = json.loads((ROOT / card_path).read_text(encoding="utf-8"))
    item["assets"] = character_asset_manifest(character_id)
    return item


def official_frame(character_id: str, view: str, action: str, frame_index: int) -> Path:
    name = f"{action}-{frame_index + 1:02d}.png"
    if character_id == "lamplighter":
        if view == "side" and action == "walk":
            return ROOT / "assets/resources/character/frames" / name
        return ROOT / "assets/resources/character/views" / view / name
    custom_root = CATALOG.get(character_id, {}).get("root")
    if custom_root:
        return ROOT / custom_root / "views" / view / name
    return ROOT / "assets/resources/characters" / character_id / "views" / view / name


def character_asset_manifest(character_id: str) -> dict:
    manifest = {}
    for view in VIEWS:
        actions = {}
        for action in ACTIONS:
            frames = []
            for frame_index in range(len(POSES[action])):
                path = official_frame(character_id, view, action, frame_index)
                if not path.exists():
                    break
                frames.append(str(path.relative_to(ROOT)))
            if frames:
                actions[action] = {"frames": frames, "fps": 8, "loop": action not in {"jump", "lantern"}}
        manifest[view] = actions
    return manifest


def provenance(job: dict, frame_index: int, pose: str, elapsed: float, mode: str) -> None:
    row = {
        "ts": time.time(),
        "job": job["id"],
        "batch": job["batch"],
        "character": job["request"]["character"],
        "view": job["request"]["view"],
        "action": job["request"]["action"],
        "frame": frame_index,
        "prompt": pose,
        "model": job["request"].get("model", config.IMAGE_MODEL),
        "mode": mode,
        "elapsed_s": round(elapsed, 2),
        "aigc_label": "AI-generated" if mode == "live" else "demo-copy",
    }
    DATA_ROOT.mkdir(parents=True, exist_ok=True)
    with (DATA_ROOT / "provenance.jsonl").open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(row, ensure_ascii=False) + "\n")


def run_job(job_id: str) -> None:
    job = JOB_STORE[job_id]
    request = job["request"]
    character_id = request["character"]
    view = request["view"]
    action = request["action"]
    mode = request["mode"]
    custom_prompt = request.get("customPrompt", "")
    model = request.get("model", config.IMAGE_MODEL)
    frame_indices = [request["frameIndex"]] if mode == "single" else list(range(len(POSES[action])))
    job_root = JOBS_ROOT / job_id
    outputs = []
    live = bool(config.API_KEY) and PROVIDER_VERIFIED and not DEMO_MODE

    try:
        update_job(job_id, status="generating", progress=2, message="正在准备角色母版")
        base = ROOT / CATALOG[character_id]["base"]
        if not base.exists():
            raise RuntimeError("角色母版不存在")
        if not live and not DEMO_MODE:
            raise RuntimeError("生成服务未配置：请在生成界面连接七牛云 Key，或用 --demo 验证管线")

        for order, frame_index in enumerate(frame_indices):
            pose = POSES[action][frame_index]
            raw = job_root / "raw" / f"{action}-{frame_index + 1:02d}.png"
            cutout = job_root / "cutout" / raw.name
            output = job_root / "normalized" / raw.name
            raw.parent.mkdir(parents=True, exist_ok=True)
            cutout.parent.mkdir(parents=True, exist_ok=True)
            started = time.time()
            update_job(
                job_id,
                progress=5 + round(order / max(1, len(frame_indices)) * 78),
                message=f"正在生成 {action} 第 {frame_index + 1} 帧",
            )

            if live:
                frame_prompt = pose + f"; true {view} game view; preserve exact pixel-art style"
                if custom_prompt:
                    frame_prompt += f"; creator constraints: {custom_prompt}"
                ok = generate.gen_frame(
                    str(base),
                    CATALOG[character_id]["description"],
                    frame_prompt,
                    str(raw),
                    model=model,
                )
                if not ok:
                    raise RuntimeError(f"第 {frame_index + 1} 帧生成失败")
                processing.matte_chroma(raw, cutout)
                provenance(job, frame_index, pose, time.time() - started, "live")
            else:
                source = official_frame(character_id, view, action, frame_index)
                if not source.exists():
                    source = official_frame("lamplighter", "side", "walk", frame_index % 8)
                shutil.copy2(source, raw)
                shutil.copy2(source, cutout)
                provenance(job, frame_index, pose, time.time() - started, "demo")

            processing.normalize_frame(cutout, output, action, frame_index)
            outputs.append({
                "frameIndex": frame_index,
                "url": f"/generation-data/jobs/{job_id}/normalized/{output.name}",
                "file": output.name,
                "pose": pose,
            })

        update_job(
            job_id,
            status="awaiting_review",
            progress=100,
            message="候选帧已生成，等待人工确认",
            outputs=outputs,
            provider="live" if live else "demo",
        )
    except Exception as error:
        update_job(job_id, status="failed", message=str(error), error=str(error))


def run_character_job(job_id: str) -> None:
    job = JOB_STORE[job_id]
    request = job["request"]
    job_root = JOBS_ROOT / job_id
    raw = job_root / "raw" / "base.png"
    cutout = job_root / "cutout" / "base.png"
    output = job_root / "normalized" / "base.png"
    model = request["model"]
    live = bool(config.API_KEY) and PROVIDER_VERIFIED and not DEMO_MODE
    try:
        update_job(job_id, status="generating", progress=8, message="正在构建原创角色母版")
        raw.parent.mkdir(parents=True, exist_ok=True)
        cutout.parent.mkdir(parents=True, exist_ok=True)
        if live:
            if not generate.gen_character(request["description"], str(raw), model=model):
                raise RuntimeError("角色母版生成失败")
            update_job(job_id, progress=72, message="正在去背景与统一画布")
            processing.matte_chroma(raw, cutout)
        elif DEMO_MODE:
            source = ROOT / CATALOG["lamplighter"]["base"]
            shutil.copy2(source, raw)
            shutil.copy2(source, cutout)
        else:
            raise RuntimeError("请先在生成界面连接七牛云 Key")
        processing.normalize_frame(cutout, output, "idle", 0)
        update_job(
            job_id, status="awaiting_review", progress=100,
            message="角色母版已生成，等待确认入库",
            outputs=[{"frameIndex": 0, "url": f"/generation-data/jobs/{job_id}/normalized/base.png", "file": "base.png"}],
            provider="live" if live else "demo",
        )
    except Exception as error:
        update_job(job_id, status="failed", message=str(error), error=str(error))


def create_character_job(payload: dict) -> dict:
    name = str(payload.get("name", "")).strip()
    description = str(payload.get("description", "")).strip()
    model = str(payload.get("model", "")).strip()
    if not 1 <= len(name) <= 40:
        raise ValueError("资产名称需要 1–40 字")
    if not 12 <= len(description) <= 800:
        raise ValueError("角色定义需要 12–800 字")
    if model not in IMAGE_MODELS:
        raise ValueError("请选择有效的图像模型")
    if not DEMO_MODE and (not config.API_KEY or not PROVIDER_VERIFIED):
        raise ValueError("请先验证七牛云 API Key")
    job_id = uuid.uuid4().hex[:12]
    character_id = f"custom-{uuid.uuid4().hex[:8]}"
    job = {
        "id": job_id,
        "batch": f"C-{datetime.now().strftime('%Y%m%d-%H%M%S')}",
        "status": "queued", "progress": 0, "message": "新角色创建任务已入队",
        "request": {"type": "character", "character": character_id, "name": name, "description": description, "model": model},
        "outputs": [], "createdAt": now_iso(), "updatedAt": now_iso(),
    }
    JOB_STORE.add(job)
    threading.Thread(target=run_character_job, args=(job_id,), daemon=True).start()
    return job


def create_job(payload: dict) -> dict:
    character_id = str(payload.get("character", ""))
    view = str(payload.get("view", ""))
    action = str(payload.get("action", ""))
    mode = str(payload.get("mode", "full"))
    custom_prompt = str(payload.get("customPrompt", "")).strip()
    model = str(payload.get("model", config.IMAGE_MODEL)).strip()
    if character_id not in CATALOG or view not in VIEWS or action not in ACTIONS or mode not in {"full", "single"}:
        raise ValueError("生成参数不合法")
    if len(custom_prompt) > 800:
        raise ValueError("画面约束不能超过 800 字")
    if model not in IMAGE_MODELS:
        raise ValueError("请选择有效的图像模型")
    if not DEMO_MODE and (not config.API_KEY or not PROVIDER_VERIFIED):
        raise ValueError("请先验证七牛云 API Key")
    frame_index = int(payload.get("frameIndex", 0))
    if not 0 <= frame_index < len(POSES[action]):
        raise ValueError("帧号越界")
    job_id = uuid.uuid4().hex[:12]
    job = {
        "id": job_id,
        "batch": f"G-{datetime.now().strftime('%Y%m%d-%H%M%S')}",
        "status": "queued",
        "progress": 0,
        "message": "已进入生成队列",
        "request": {"character": character_id, "view": view, "action": action, "mode": mode, "frameIndex": frame_index, "fps": 8, "customPrompt": custom_prompt, "model": model},
        "outputs": [],
        "createdAt": now_iso(),
        "updatedAt": now_iso(),
    }
    JOB_STORE.add(job)
    threading.Thread(target=run_job, args=(job_id,), daemon=True).start()
    return job


def promote_job(job_id: str) -> dict:
    job = JOB_STORE.get(job_id)
    if not job or job.get("status") != "awaiting_review":
        raise ValueError("该任务尚不可采用")
    request = job["request"]
    if request.get("type") == "character":
        character_id = request["character"]
        character_root = CUSTOM_CHARACTERS_ROOT / character_id
        source = JOBS_ROOT / job_id / "normalized" / "base.png"
        target = character_root / "base.png"
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        card = {
            "id": character_id, "label": request["name"], "description": request["description"],
            "base": str(target.relative_to(ROOT)), "createdAt": now_iso(),
            "sourceJob": job_id, "model": request.get("model", config.IMAGE_MODEL),
        }
        write_json(character_root / "card.json", card)
        CATALOG[character_id] = {
            "label": card["label"], "description": card["description"], "base": card["base"],
            "root": str(character_root.relative_to(ROOT)), "custom": True,
            "card": str((character_root / "card.json").relative_to(ROOT)),
        }
        return update_job(
            job_id, status="approved", message="新角色已加入资产库",
            character={"id": character_id, "label": card["label"], "base": card["base"],
                       "root": str(character_root.relative_to(ROOT)), "description": card["description"]},
        )
    backup = BACKUPS_ROOT / job_id
    promoted = []
    for output in job.get("outputs", []):
        source = JOBS_ROOT / job_id / "normalized" / output["file"]
        target = official_frame(request["character"], request["view"], request["action"], output["frameIndex"])
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            backup.mkdir(parents=True, exist_ok=True)
            shutil.copy2(target, backup / target.name)
        shutil.copy2(source, target)
        promoted.append(str(target.relative_to(ROOT)))
    return update_job(job_id, status="approved", message="候选帧已采用，正式资产已备份", promoted=promoted)


class Handler(SimpleHTTPRequestHandler):
    server_version = "WindupGeneration/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_json(self, value: dict, status: int = 200) -> None:
        body = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        origin = self.headers.get("Origin", "")
        if re.fullmatch(r"https?://(?:127\.0\.0\.1|localhost)(?::\d+)?", origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        origin = self.headers.get("Origin", "")
        self.send_response(204)
        if re.fullmatch(r"https?://(?:127\.0\.0\.1|localhost)(?::\d+)?", origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Windup-Request")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > 1_000_000:
            raise ValueError("请求体不合法")
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/health":
            self.send_json({
                "ok": True,
                "configured": bool(config.API_KEY),
                "verified": PROVIDER_VERIFIED,
                "providerError": PROVIDER_ERROR,
                "demo": DEMO_MODE,
                "provider": "七牛云 QnAIGC",
                "model": config.IMAGE_MODEL,
                "characters": [{"id": key, "label": value["label"]} for key, value in CATALOG.items()],
            })
            return
        if path == "/api/provider/models":
            self.send_json({
                "provider": "七牛云 QnAIGC",
                "models": IMAGE_MODELS,
                "selected": config.IMAGE_MODEL,
                "source": "QnAIGC image model documentation",
            })
            return
        if path == "/api/characters":
            self.send_json({"characters": [{"id": key, **character_card(key)} for key in CATALOG]})
            return
        match = re.fullmatch(r"/api/generations/([a-f0-9]{12})", path)
        if match:
            job = JOB_STORE.get(match.group(1))
            self.send_json(job or {"error": "任务不存在"}, 200 if job else 404)
            return
        super().do_GET()

    def do_POST(self):
        global PROVIDER_VERIFIED, PROVIDER_ERROR
        path = urlparse(self.path).path
        try:
            if path == "/api/provider/session":
                if self.headers.get("X-Windup-Request") != "studio":
                    self.send_json({"error": "非法请求"}, 403)
                    return
                payload = self.read_json()
                api_key = str(payload.get("apiKey", "")).strip()
                model = str(payload.get("model", "")).strip() or IMAGE_MODELS[0]
                if not 16 <= len(api_key) <= 512 or any(char.isspace() for char in api_key):
                    raise ValueError("API Key 格式不合法")
                if model not in IMAGE_MODELS:
                    raise ValueError("不支持的图像模型")
                provider.verify_key(api_key)
                config.API_KEY = api_key
                config.API_BASE = "https://api.qnaigc.com/v1"
                config.IMAGE_MODEL = model
                PROVIDER_VERIFIED = True
                PROVIDER_ERROR = ""
                self.send_json({
                    "ok": True,
                    "configured": True,
                    "verified": True,
                    "storage": "process-memory",
                    "model": model,
                    "models": IMAGE_MODELS,
                })
                return
            if path == "/api/characters/generations":
                self.send_json(create_character_job(self.read_json()), 202)
                return
            if path == "/api/generations":
                self.send_json(create_job(self.read_json()), 202)
                return
            match = re.fullmatch(r"/api/generations/([a-f0-9]{12})/promote", path)
            if match:
                self.send_json(promote_job(match.group(1)))
                return
            self.send_json({"error": "接口不存在"}, 404)
        except provider.ProviderError as error:
            PROVIDER_VERIFIED = False
            PROVIDER_ERROR = str(error)
            status = 401 if error.status in {401, 403} else 502
            self.send_json({"error": str(error), "upstreamStatus": error.status}, status)
        except (ValueError, json.JSONDecodeError) as error:
            self.send_json({"error": str(error)}, 400)
        except Exception as error:
            self.send_json({"error": str(error)}, 500)

    def log_message(self, fmt, *args):
        print(f"[{self.log_date_time_string()}] {fmt % args}")


def main() -> None:
    global DEMO_MODE, PROVIDER_VERIFIED, PROVIDER_ERROR
    parser = argparse.ArgumentParser(description="Windup generation backend and static server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=4174)
    parser.add_argument("--demo", action="store_true", help="Use existing frames to verify the complete job flow without API cost")
    args = parser.parse_args()
    DEMO_MODE = DEMO_MODE or args.demo
    JOBS_ROOT.mkdir(parents=True, exist_ok=True)
    BACKUPS_ROOT.mkdir(parents=True, exist_ok=True)
    CUSTOM_CHARACTERS_ROOT.mkdir(parents=True, exist_ok=True)
    load_custom_characters()
    load_existing_jobs()
    if config.API_KEY and not DEMO_MODE:
        try:
            provider.verify_key(config.API_KEY)
            PROVIDER_VERIFIED = True
            PROVIDER_ERROR = ""
        except provider.ProviderError as error:
            PROVIDER_VERIFIED = False
            PROVIDER_ERROR = str(error)
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"Windup Asset Lab: http://{args.host}:{args.port}/asset-lab/")
    print(f"Generation provider: {'demo' if DEMO_MODE else 'live' if config.API_KEY else 'not configured'}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
