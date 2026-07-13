"""Replaceable action generation boundary.

Full actions use one coherent strip call and deterministic splitting. Single-frame
repair remains independent. The application service only owns workflow state.
"""

from __future__ import annotations

import shutil
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from . import generate, processing, provider


@dataclass(frozen=True)
class ActionBatch:
    outputs: list[dict]
    quality: dict
    route: str
    source_calls: int


class ActionPipeline:
    def __init__(self, *, demo: bool, official_frame: Callable[[str, str, str, int], Path]):
        self.demo = demo
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
        model: str,
        api_key: str,
        progress: Callable[[int, str], None],
        provenance: Callable[[int, str, float, str], None],
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
                model=model,
                api_key=api_key,
                progress=progress,
                provenance=provenance,
                route="frames",
            )
        if route == "frames":
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
                model=model,
                api_key=api_key,
                progress=progress,
                provenance=provenance,
                route="frames",
            )
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
                model=model,
                api_key=api_key,
                progress=progress,
                provenance=provenance,
            )
        except provider.ProviderError:
            raise
        except RuntimeError:
            progress(8, "动作条格式异常，正在回退到逐帧生成")
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
                model=model,
                api_key=api_key,
                progress=progress,
                provenance=provenance,
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
        model: str,
        api_key: str,
        progress: Callable[[int, str], None],
        provenance: Callable[[int, str, float, str], None],
    ) -> ActionBatch:
        raw_sheet = job_root / "raw" / f"{view}-{action}-sheet.png"
        cutout_sheet = job_root / "cutout" / f"{view}-{action}-sheet.png"
        normalized_root = job_root / "normalized"
        raw_sheet.parent.mkdir(parents=True, exist_ok=True)
        cutout_sheet.parent.mkdir(parents=True, exist_ok=True)
        started = time.time()
        progress(12, f"正在一次生成 {action} 的 8 帧动作条")
        if self.demo:
            sources = []
            for index in range(len(phases)):
                source = self.official_frame(character_id, view, action, index)
                if not source.exists():
                    source = self.official_frame("lamplighter", view, action, index)
                sources.append(source if source.exists() else base)
            processing.make_action_sheet(sources, raw_sheet)
            shutil.copy2(raw_sheet, cutout_sheet)
            provider_mode = "demo-sheet"
            source_calls = 0
        else:
            generate.gen_action_sheet(
                str(base),
                description,
                action,
                phases,
                view,
                str(raw_sheet),
                custom_prompt=custom_prompt,
                model=model,
                api_key=api_key,
            )
            progress(68, "正在抠图并切分 8 个动作相位")
            processing.matte_chroma(raw_sheet, cutout_sheet)
            provider_mode = "live-sheet"
            source_calls = 1
        frames = processing.split_action_sheet(cutout_sheet, normalized_root, action, len(phases))
        quality = processing.sequence_quality(frames, action)
        elapsed = time.time() - started
        outputs = []
        for index, (path, pose) in enumerate(zip(frames, phases)):
            provenance(index, pose, elapsed, provider_mode)
            outputs.append(self._output(job_id, path, index, pose, view, action))
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
        model: str,
        api_key: str,
        progress: Callable[[int, str], None],
        provenance: Callable[[int, str, float, str], None],
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
            if self.demo:
                source = self.official_frame(character_id, view, action, index)
                if not source.exists():
                    source = base
                shutil.copy2(source, raw)
                shutil.copy2(source, cutout)
                provider_mode = "demo-frame"
            else:
                frame_prompt = pose + f"; true {view} game view; preserve exact pixel-art style"
                if custom_prompt:
                    frame_prompt += f"; creator constraints: {custom_prompt}"
                generate.gen_frame(
                    str(base), description, frame_prompt, str(raw), model=model, api_key=api_key,
                )
                processing.matte_chroma(raw, cutout)
                provider_mode = "live-frame"
            processing.normalize_frame(cutout, output, action, index)
            provenance(index, pose, time.time() - started, provider_mode)
            outputs.append(self._output(job_id, output, index, pose, view, action))
        quality = processing.sequence_quality([job_root / output["path"] for output in outputs], action)
        return ActionBatch(outputs, quality, route, 0 if self.demo else len(frame_indices))

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
