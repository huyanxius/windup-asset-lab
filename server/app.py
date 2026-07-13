#!/usr/bin/env python3
"""Windup generation backend: static hosting, secure image API proxy and job runner."""

from __future__ import annotations

import argparse
import json
import math
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

from PIL import Image

from windup_pipeline import generate


ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = ROOT / "generation-data"
JOBS_ROOT = DATA_ROOT / "jobs"
BACKUPS_ROOT = DATA_ROOT / "backups"
CUSTOM_CHARACTERS_ROOT = DATA_ROOT / "characters"
LOCK = threading.Lock()
JOBS: dict[str, dict] = {}
DEMO_MODE = os.environ.get("WINDUP_DEMO") == "1"

VIEWS = {"side", "topdown", "isometric"}
ACTIONS = {"idle", "walk", "run", "jump", "lantern"}
SAFE_ID = re.compile(r"^[a-z0-9-]+$")
IMAGE_MODELS = [
    "gemini-2.5-flash-image",
    "gemini-3.1-flash-image-preview",
    "gemini-3.0-pro-image-preview",
]

CATALOG = {
    "lamplighter": {
        "label": "点灯少年",
        "base": "assets/resources/character/frames/walk-01.png",
        "description": "young chibi pixel-art lamplighter, tousled black hair, navy coat, red scarf, charcoal trousers, brown boots, warm brass fasteners",
    },
    "boy": {
        "label": "Boy",
        "base": "assets/resources/characters/boy/base.png",
        "card": "artifacts/characters/boy/card.json",
        "description": "young slender pixel-art boy with messy black hair, dark blue long coat, brown vest, white shirt, red scarf, brown trousers and boots",
    },
    "skeleton": {
        "label": "Skeleton",
        "base": "assets/resources/characters/skeleton/base.png",
        "card": "artifacts/characters/skeleton/card.json",
        "description": "cartoon pixel-art skeleton in dark segmented armour, flowing red scarf, broad weathered sword",
    },
    "lirael": {
        "label": "Lirael",
        "base": "assets/resources/characters/lirael/base.png",
        "description": "pixel-art young druid in a deep green hooded dress, red hair, antler crown, rune details and a staff with a blue orb",
    },
}

POSES = {
    "idle": [
        "neutral standing pose, weight centered, relaxed arms, breathing in",
        "slight downward settle, shoulders lower subtly",
        "lowest breathing point, knees and chest compressed slightly",
        "rising toward neutral",
        "neutral standing pose with a tiny sway",
        "slight upward breathing motion",
        "highest breathing point, chest expanded subtly",
        "settling smoothly back to the first frame",
    ],
    "walk": [
        "WALK CONTACT: right heel forward, left leg extended behind, widest relaxed stride",
        "WALK DOWN: right foot takes weight, body at lowest point, left foot lifting",
        "WALK PASSING: left leg passes under body, right leg supports, legs close",
        "WALK UP: left leg reaches forward, body at highest point on right toe",
        "OPPOSITE CONTACT: left heel forward, right leg behind, widest stride",
        "OPPOSITE DOWN: left foot takes weight, right foot lifting",
        "OPPOSITE PASSING: right leg passes under body, left leg supports",
        "OPPOSITE UP: right leg reaches forward, returning smoothly to frame one",
    ],
    "run": [
        "RUN CONTACT: right leg reaches forward, left leg fully behind, arms counter-swing",
        "RUN COMPRESSION: right foot takes weight, body low and loaded",
        "RUN PASSING: left knee drives forward under body",
        "RUN FLIGHT: both feet briefly airborne, body stretched",
        "OPPOSITE RUN CONTACT: left leg forward, right leg behind",
        "OPPOSITE COMPRESSION: left foot takes weight, body low",
        "OPPOSITE PASSING: right knee drives forward under body",
        "OPPOSITE FLIGHT: both feet airborne, returning to first contact",
    ],
    "jump": [
        "JUMP ANTICIPATION: deep crouch, knees bent, arms back",
        "JUMP LAUNCH: legs extending powerfully, feet leaving the ground",
        "JUMP RISE: body travelling upward, legs trailing",
        "JUMP APEX: highest point, limbs tucked compactly",
        "JUMP FALL: body descending, legs extending for landing",
        "JUMP LAND: feet contact ground, knees absorb impact",
        "JUMP RECOVERY: body rises from landing crouch",
        "return to the neutral standing pose",
    ],
    "lantern": [
        "standing with lantern held low at the side",
        "hand begins lifting the lantern",
        "lantern reaches chest height, eyes following its glow",
        "lantern raised beside the face",
        "lantern held high, warm light at maximum intensity",
        "hold the high lantern pose with a subtle breathing shift",
        "lantern begins lowering smoothly",
        "lantern returns toward the starting pose",
    ],
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def persist(job: dict) -> None:
    write_json(JOBS_ROOT / job["id"] / "job.json", job)


def update_job(job_id: str, **changes) -> dict:
    with LOCK:
        job = JOBS[job_id]
        job.update(changes)
        job["updatedAt"] = now_iso()
        persist(job)
        return dict(job)


def load_existing_jobs() -> None:
    if not JOBS_ROOT.exists():
        return
    for job_file in JOBS_ROOT.glob("*/job.json"):
        try:
            job = json.loads(job_file.read_text(encoding="utf-8"))
            if job.get("status") in {"queued", "generating", "processing"}:
                job["status"] = "interrupted"
                job["message"] = "服务重启，请重新发起该任务"
                persist(job)
            JOBS[job["id"]] = job
        except Exception:
            continue


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


def matte_chroma(source: Path, destination: Path) -> None:
    image = Image.open(source).convert("RGBA")
    pixels = image.load()
    width, height = image.size
    corners = [pixels[0, 0], pixels[width - 1, 0], pixels[0, height - 1], pixels[width - 1, height - 1]]
    key = tuple(sum(pixel[channel] for pixel in corners) / len(corners) for channel in range(3))
    for y in range(height):
        for x in range(width):
            red, green, blue, _ = pixels[x, y]
            distance = math.sqrt((red - key[0]) ** 2 + (green - key[1]) ** 2 + (blue - key[2]) ** 2)
            alpha = max(0, min(255, round((distance - 18) / 110 * 255)))
            pixels[x, y] = (red, green, blue, alpha)
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination)


def normalize_frame(source: Path, destination: Path, action: str, frame_index: int) -> None:
    image = Image.open(source).convert("RGBA")
    alpha = image.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value > 24 else 0).getbbox()
    if not bbox:
        raise RuntimeError("该帧没有可见角色")
    subject = image.crop(bbox)
    subject.thumbnail((224, 208), Image.Resampling.NEAREST)
    canvas = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    left = round((256 - subject.width) / 2)
    jump_offsets = [0, 18, 42, 62, 38, 0, 0, 0]
    vertical_offset = jump_offsets[frame_index] if action == "jump" and frame_index < len(jump_offsets) else 0
    top = 238 - subject.height - vertical_offset
    canvas.alpha_composite(subject, (left, top))
    destination.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(destination)


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
        "model": generate.config.IMAGE_MODEL,
        "mode": mode,
        "elapsed_s": round(elapsed, 2),
        "aigc_label": "AI-generated" if mode == "live" else "demo-copy",
    }
    DATA_ROOT.mkdir(parents=True, exist_ok=True)
    with (DATA_ROOT / "provenance.jsonl").open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(row, ensure_ascii=False) + "\n")


def run_job(job_id: str) -> None:
    job = JOBS[job_id]
    request = job["request"]
    character_id = request["character"]
    view = request["view"]
    action = request["action"]
    mode = request["mode"]
    custom_prompt = request.get("customPrompt", "")
    frame_indices = [request["frameIndex"]] if mode == "single" else list(range(len(POSES[action])))
    job_root = JOBS_ROOT / job_id
    outputs = []
    live = bool(generate.config.API_KEY) and not DEMO_MODE

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
                )
                if not ok:
                    raise RuntimeError(f"第 {frame_index + 1} 帧生成失败")
                matte_chroma(raw, cutout)
                provenance(job, frame_index, pose, time.time() - started, "live")
            else:
                source = official_frame(character_id, view, action, frame_index)
                if not source.exists():
                    source = official_frame("lamplighter", "side", "walk", frame_index % 8)
                shutil.copy2(source, raw)
                shutil.copy2(source, cutout)
                provenance(job, frame_index, pose, time.time() - started, "demo")

            normalize_frame(cutout, output, action, frame_index)
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
    job = JOBS[job_id]
    request = job["request"]
    job_root = JOBS_ROOT / job_id
    raw = job_root / "raw" / "base.png"
    cutout = job_root / "cutout" / "base.png"
    output = job_root / "normalized" / "base.png"
    live = bool(generate.config.API_KEY) and not DEMO_MODE
    try:
        update_job(job_id, status="generating", progress=8, message="正在构建原创角色母版")
        raw.parent.mkdir(parents=True, exist_ok=True)
        cutout.parent.mkdir(parents=True, exist_ok=True)
        if live:
            if not generate.gen_character(request["description"], str(raw)):
                raise RuntimeError("角色母版生成失败")
            update_job(job_id, progress=72, message="正在去背景与统一画布")
            matte_chroma(raw, cutout)
        elif DEMO_MODE:
            source = ROOT / CATALOG["lamplighter"]["base"]
            shutil.copy2(source, raw)
            shutil.copy2(source, cutout)
        else:
            raise RuntimeError("请先在生成界面连接七牛云 Key")
        normalize_frame(cutout, output, "idle", 0)
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
    if not 1 <= len(name) <= 40:
        raise ValueError("资产名称需要 1–40 字")
    if not 12 <= len(description) <= 800:
        raise ValueError("角色定义需要 12–800 字")
    job_id = uuid.uuid4().hex[:12]
    character_id = f"custom-{uuid.uuid4().hex[:8]}"
    job = {
        "id": job_id,
        "batch": f"C-{datetime.now().strftime('%Y%m%d-%H%M%S')}",
        "status": "queued", "progress": 0, "message": "新角色创建任务已入队",
        "request": {"type": "character", "character": character_id, "name": name, "description": description},
        "outputs": [], "createdAt": now_iso(), "updatedAt": now_iso(),
    }
    with LOCK:
        JOBS[job_id] = job
        persist(job)
    threading.Thread(target=run_character_job, args=(job_id,), daemon=True).start()
    return job


def create_job(payload: dict) -> dict:
    character_id = str(payload.get("character", ""))
    view = str(payload.get("view", ""))
    action = str(payload.get("action", ""))
    mode = str(payload.get("mode", "full"))
    custom_prompt = str(payload.get("customPrompt", "")).strip()
    if character_id not in CATALOG or view not in VIEWS or action not in ACTIONS or mode not in {"full", "single"}:
        raise ValueError("生成参数不合法")
    if len(custom_prompt) > 800:
        raise ValueError("画面约束不能超过 800 字")
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
        "request": {"character": character_id, "view": view, "action": action, "mode": mode, "frameIndex": frame_index, "fps": 8, "customPrompt": custom_prompt},
        "outputs": [],
        "createdAt": now_iso(),
        "updatedAt": now_iso(),
    }
    with LOCK:
        JOBS[job_id] = job
        persist(job)
    threading.Thread(target=run_job, args=(job_id,), daemon=True).start()
    return job


def promote_job(job_id: str) -> dict:
    job = JOBS.get(job_id)
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
            "sourceJob": job_id, "model": generate.config.IMAGE_MODEL,
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
        self.end_headers()
        self.wfile.write(body)

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
                "configured": bool(generate.config.API_KEY),
                "demo": DEMO_MODE,
                "provider": "七牛云 QnAIGC",
                "model": generate.config.IMAGE_MODEL,
                "characters": [{"id": key, "label": value["label"]} for key, value in CATALOG.items()],
            })
            return
        if path == "/api/provider/models":
            self.send_json({"provider": "七牛云 QnAIGC", "models": IMAGE_MODELS, "selected": generate.config.IMAGE_MODEL})
            return
        if path == "/api/characters":
            self.send_json({"characters": [{"id": key, **character_card(key)} for key in CATALOG]})
            return
        match = re.fullmatch(r"/api/generations/([a-f0-9]{12})", path)
        if match:
            job = JOBS.get(match.group(1))
            self.send_json(job or {"error": "任务不存在"}, 200 if job else 404)
            return
        super().do_GET()

    def do_POST(self):
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
                generate.config.API_KEY = api_key
                generate.config.API_BASE = "https://api.qnaigc.com/v1"
                generate.config.IMAGE_MODEL = model
                self.send_json({"ok": True, "configured": True, "storage": "process-memory", "model": model})
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
        except (ValueError, json.JSONDecodeError) as error:
            self.send_json({"error": str(error)}, 400)
        except Exception as error:
            self.send_json({"error": str(error)}, 500)

    def log_message(self, fmt, *args):
        print(f"[{self.log_date_time_string()}] {fmt % args}")


def main() -> None:
    global DEMO_MODE
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
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"Windup Asset Lab: http://{args.host}:{args.port}/asset-lab/")
    print(f"Generation provider: {'demo' if DEMO_MODE else 'live' if generate.config.API_KEY else 'not configured'}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
