"""Bundled-fixture action generation for the demo-only workflow."""

from __future__ import annotations

import shutil
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from . import processing


@dataclass(frozen=True)
class ActionBatch:
    outputs: list[dict]
    quality: dict
    route: str
    source_calls: int


class ActionPipeline:
    def __init__(self, *, official_frame: Callable[[str, str, str, int], Path]):
        self.official_frame = official_frame

    def run(
        self,
        *,
        job_id: str,
        job_root: Path,
        character_id: str,
        base: Path,
        description: str,
        view: str,
        action: str,
        phases: list[str],
        mode: str,
        frame_index: int,
        route: str,
        custom_prompt: str,
        progress: Callable[[int, str], None],
        provenance: Callable[[int, str, float, str], None],
        publish: Callable[[list[dict]], None] | None = None,
    ) -> ActionBatch:
        if mode == "single":
            return self._frames(
                job_id=job_id,
                job_root=job_root,
                character_id=character_id,
                base=base,
                description=description,
                view=view,
                action=action,
                phases=phases,
                frame_indices=[frame_index],
                custom_prompt=custom_prompt,
                progress=progress,
                provenance=provenance,
                publish=publish,
                route="frames",
            )
        if route == "frames" or action == "walk":
            # walk 直接按合同帧序复制打包素材，避免动作条切分改变既有演示帧。
            return self._frames(
                job_id=job_id,
                job_root=job_root,
                character_id=character_id,
                base=base,
                description=description,
                view=view,
                action=action,
                phases=phases,
                frame_indices=list(range(len(phases))),
                custom_prompt=custom_prompt,
                progress=progress,
                provenance=provenance,
                publish=publish,
                route="frames",
            )
        for attempt in range(2):
            try:
                return self._sheet(
                    job_id=job_id,
                    job_root=job_root,
                    character_id=character_id,
                    base=base,
                    description=description,
                    view=view,
                    action=action,
                    phases=phases,
                    custom_prompt=custom_prompt,
                    progress=progress,
                    provenance=provenance,
                    publish=publish,
                )
            except RuntimeError:
                if attempt == 0:
                    progress(6, "动作条格式异常，正在重试一次")
        progress(8, "动作条两次格式异常，正在回退到逐帧生成")
        return self._frames(
            job_id=job_id,
            job_root=job_root,
            character_id=character_id,
            base=base,
            description=description,
            view=view,
            action=action,
            phases=phases,
            frame_indices=list(range(len(phases))),
            custom_prompt=custom_prompt,
            progress=progress,
            provenance=provenance,
            publish=publish,
            route="frames-fallback",
        )

    def _sheet(
        self,
        *,
        job_id: str,
        job_root: Path,
        character_id: str,
        base: Path,
        description: str,
        view: str,
        action: str,
        phases: list[str],
        custom_prompt: str,
        progress: Callable[[int, str], None],
        provenance: Callable[[int, str, float, str], None],
        publish: Callable[[list[dict]], None] | None = None,
    ) -> ActionBatch:
        raw_sheet = job_root / "raw" / f"{view}-{action}-sheet.png"
        cutout_sheet = job_root / "cutout" / f"{view}-{action}-sheet.png"
        normalized_root = job_root / "normalized"
        raw_sheet.parent.mkdir(parents=True, exist_ok=True)
        cutout_sheet.parent.mkdir(parents=True, exist_ok=True)
        started = time.time()
        progress(12, f"正在一次生成 {action} 的 8 帧动作条")
        sources = []
        for index in range(len(phases)):
            source = self.official_frame(character_id, view, action, index)
            if not source.exists():
                source = base
            sources.append(source)
        processing.make_action_sheet(sources, raw_sheet)
        shutil.copy2(raw_sheet, cutout_sheet)
        provider_mode = "demo-sheet"
        source_calls = 0
        frames = processing.split_action_sheet(cutout_sheet, normalized_root, action, len(phases))
        quality = processing.sequence_quality(frames, action)
        elapsed = time.time() - started
        outputs = []
        for index, (path, pose) in enumerate(zip(frames, phases)):
            provenance(index, pose, elapsed, provider_mode)
            outputs.append(self._output(job_id, path, index, pose, view, action))
        if publish:
            publish(list(outputs))
        progress(92, "动作条已切分，正在完成连续性质检")
        return ActionBatch(outputs, quality, "sheet", source_calls)

    def _frames(
        self,
        *,
        job_id: str,
        job_root: Path,
        character_id: str,
        base: Path,
        description: str,
        view: str,
        action: str,
        phases: list[str],
        frame_indices: list[int],
        custom_prompt: str,
        progress: Callable[[int, str], None],
        provenance: Callable[[int, str, float, str], None],
        publish: Callable[[list[dict]], None] | None,
        route: str,
    ) -> ActionBatch:
        outputs = []
        for order, index in enumerate(frame_indices):
            pose = phases[index]
            name = f"{action}-{index + 1:02d}.png"
            raw = job_root / "raw" / name
            cutout = job_root / "cutout" / name
            output = job_root / "normalized" / name
            raw.parent.mkdir(parents=True, exist_ok=True)
            cutout.parent.mkdir(parents=True, exist_ok=True)
            started = time.time()
            progress(10 + round(order / max(1, len(frame_indices)) * 78), f"正在修复 {action} 第 {index + 1} 帧")
            source = self.official_frame(character_id, view, action, index)
            if not source.exists():
                source = base
            shutil.copy2(source, raw)
            shutil.copy2(source, cutout)
            provider_mode = "demo-frame"
            processing.normalize_frame(cutout, output, action, index)
            provenance(index, pose, time.time() - started, provider_mode)
            outputs.append(self._output(job_id, output, index, pose, view, action))
            if publish:
                publish(list(outputs))
        quality = processing.sequence_quality([job_root / output["path"] for output in outputs], action)
        return ActionBatch(outputs, quality, route, 0)

    @staticmethod
    def _output(job_id: str, path: Path, index: int, pose: str, view: str, action: str) -> dict:
        relative = path.relative_to(path.parents[1])
        return {
            "kind": "frame",
            "view": view,
            "action": action,
            "frameIndex": index,
            "url": f"/generation-data/jobs/{job_id}/{relative.as_posix()}",
            "path": relative.as_posix(),
            "file": path.name,
            "pose": pose,
        }
