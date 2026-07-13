"""Background generation executor.

It owns long-running image work and job progress, while the application service
owns validation and use-case entry points.
"""

from __future__ import annotations

import json
import shutil
import time
from pathlib import Path

from . import config, generate, processing
from .action_pipeline import ActionPipeline
from .domain import POSES
from .time_utils import now_iso


class GenerationExecutor:
    def __init__(self, *, root: Path, data_root: Path, jobs_root: Path, jobs, catalog, demo: bool):
        self.root = root
        self.data_root = data_root
        self.jobs_root = jobs_root
        self.jobs = jobs
        self.catalog = catalog
        self.demo = demo
        self.actions = ActionPipeline(demo=demo, official_frame=catalog.official_frame)

    def update(self, job_id: str, **changes) -> dict:
        return self.jobs.update(job_id, updatedAt=now_iso(), **changes)

    def provenance(
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
            "ts": time.time(),
            "job": job["id"],
            "batch": job["batch"],
            "character": job["request"]["character"],
            "view": view or job["request"].get("view", "side"),
            "action": action or job["request"].get("action", "idle"),
            "frame": frame_index,
            "prompt": pose,
            "model": job["request"].get("model", config.IMAGE_MODEL),
            "mode": mode,
            "elapsed_s": round(elapsed, 2),
            "aigc_label": "AI-generated" if mode.startswith("live") else "demo-copy",
        }
        self.data_root.mkdir(parents=True, exist_ok=True)
        with (self.data_root / "provenance.jsonl").open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(row, ensure_ascii=False) + "\n")

    def run_action(self, job_id: str, api_key: str) -> None:
        job = self.jobs[job_id]
        request = job["request"]
        character_id, view, action = request["character"], request["view"], request["action"]
        job_root = self.jobs_root / job_id
        live = bool(api_key) and not self.demo
        try:
            self.update(job_id, status="generating", progress=2, message="正在准备角色母版")
            base = self.root / self.catalog[character_id]["base"]
            if not base.exists():
                raise RuntimeError("角色母版不存在")
            batch = self.actions.run(
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
                progress=lambda progress, message: self.update(job_id, progress=progress, message=message),
                provenance=lambda index, pose, elapsed, mode: self.provenance(job, index, pose, elapsed, mode),
            )
            self.update(
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
            self.update(job_id, status="failed", message=str(error), error=str(error))

    def run_character(self, job_id: str, api_key: str) -> None:
        job = self.jobs[job_id]
        request = job["request"]
        job_root = self.jobs_root / job_id
        raw = job_root / "raw/base.png"
        cutout = job_root / "cutout/base.png"
        output = job_root / "normalized/base.png"
        live = bool(api_key) and not self.demo
        try:
            self.update(job_id, status="generating", progress=5, message="正在构建原创角色母版")
            raw.parent.mkdir(parents=True, exist_ok=True)
            cutout.parent.mkdir(parents=True, exist_ok=True)
            if live:
                generate.gen_character(request["description"], str(raw), model=request["model"], api_key=api_key)
                self.update(job_id, progress=24, message="正在去背景与统一母版画布")
                processing.matte_chroma(raw, cutout)
            else:
                source = self.root / self.catalog["lamplighter"]["base"]
                shutil.copy2(source, raw)
                shutil.copy2(source, cutout)
            processing.normalize_frame(cutout, output, "idle", 0)
            outputs = [{
                "kind": "base",
                "frameIndex": 0,
                "url": f"/generation-data/jobs/{job_id}/normalized/base.png",
                "path": "normalized/base.png",
                "file": "base.png",
            }]
            qualities = {}
            source_calls = 1 if live else 0
            actions = request["starterActions"]
            view = request["starterView"]
            for order, action in enumerate(actions):
                def update_action_progress(percent, message, *, order=order):
                    overall = 30 + round((order + percent / 100) / len(actions) * 64)
                    self.update(job_id, progress=overall, message=message)

                batch = self.actions.run(
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
                    provenance=lambda index, pose, elapsed, mode, action=action: self.provenance(
                        job, index, pose, elapsed, mode, view=view, action=action,
                    ),
                )
                outputs.extend(batch.outputs)
                qualities[action] = batch.quality
                source_calls += batch.source_calls
            self.update(
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
            self.update(job_id, status="failed", message=str(error), error=str(error))
