"""Composable quality-gate evaluators for sprite sequences."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from PIL import Image


@dataclass(frozen=True)
class EvaluationResult:
    blocking_issues: list[dict] = field(default_factory=list)
    metrics: dict = field(default_factory=dict)


class QualityGate:
    def __init__(self, evaluators: list):
        self._evaluators = evaluators

    def evaluate(self, frames: list[Path]) -> dict:
        blocking_issues: list[dict] = []
        metrics: dict = {}
        for evaluator in self._evaluators:
            result = evaluator.evaluate(frames)
            blocking_issues.extend(result.blocking_issues)
            metrics.update(result.metrics)
        return {
            "passed": len(blocking_issues) == 0,
            "frameCount": len(frames),
            "blockingIssues": blocking_issues,
            "metrics": metrics,
        }


# ---------------------------------------------------------------------------
# Per-frame geometry
# ---------------------------------------------------------------------------

def _compute_metrics(frames: list[Path]) -> list[dict | None]:
    metrics_list = []
    for path in frames:
        image = Image.open(path).convert("RGBA")
        alpha = image.getchannel("A")
        bbox = alpha.point(lambda value: 255 if value > 24 else 0).getbbox()
        if not bbox:
            metrics_list.append(None)
            continue
        left, top, right, bottom = bbox
        metrics_list.append({
            "width": right - left,
            "height": bottom - top,
            "centerX": round((left + right) / 2, 2),
            "footY": bottom,
            "coverage": round(sum(1 for value in alpha.getdata() if value > 24) / (image.width * image.height), 4),
        })
    return metrics_list


# ---------------------------------------------------------------------------
# Individual evaluators
# ---------------------------------------------------------------------------

class InvisibleFrameEvaluator:
    @staticmethod
    def evaluate(frames: list[Path]) -> EvaluationResult:
        metrics_list = _compute_metrics(frames)
        invisible = any(metric is None for metric in metrics_list)
        if invisible:
            return EvaluationResult(blocking_issues=[
                {"code": "invisible_frames", "message": "存在全透明帧，角色不可见"},
            ])
        return EvaluationResult()


class HorizontalGuideLineEvaluator:
    @staticmethod
    def evaluate(frames: list[Path]) -> EvaluationResult:
        metrics_list = _compute_metrics(frames)
        for path, metric in zip(frames, metrics_list):
            if metric is None:
                continue
            image = Image.open(path).convert("RGBA")
            pixels = image.load()
            width, height = image.size
            for y in range(height * 2 // 3, height):
                run = 0
                for x in range(width):
                    _, _, _, alpha = pixels[x, y]
                    if alpha > 24:
                        run += 1
                    else:
                        run = 0
                    if run > width * 0.45:
                        return EvaluationResult(
                            blocking_issues=[{"code": "horizontal_guide_line", "message": f"第 {y} 行检测到连续水平线段"}],
                            metrics={"horizontalGuideLines": True},
                        )
        return EvaluationResult(metrics={"horizontalGuideLines": False})


class DuplicateFrameEvaluator:
    """Only exact duplicates are blocking. Near-duplicates are reported as a
    metric so the caller can surface them as warnings."""

    @staticmethod
    def evaluate(frames: list[Path]) -> EvaluationResult:
        metrics_list = _compute_metrics(frames)
        pairs: list[list[int]] = []
        near_duplicate = False
        for i in range(len(frames) - 1):
            if metrics_list[i] is None or metrics_list[i + 1] is None:
                continue
            try:
                a = Image.open(frames[i]).convert("RGBA")
                b = Image.open(frames[i + 1]).convert("RGBA")
            except (OSError, ValueError):
                continue
            if a.size != b.size:
                continue
            pixels_a = list(a.getdata())
            pixels_b = list(b.getdata())
            same = sum(1 for pa, pb in zip(pixels_a, pixels_b) if pa == pb)
            ratio = same / max(1, len(pixels_a))
            if ratio > 0.9999:
                pairs.append([i, i + 1])
            elif ratio > 0.97:
                near_duplicate = True
        blocking: list[dict] = []
        if pairs:
            blocking.append({"code": "duplicate_frames", "message": f"存在像素完全相同的相邻帧 {pairs}"})
        return EvaluationResult(
            blocking_issues=blocking,
            metrics={"duplicatePairs": pairs, "nearDuplicatePairs": near_duplicate},
        )


class PaletteDriftEvaluator:
    @staticmethod
    def evaluate(frames: list[Path]) -> EvaluationResult:
        metrics_list = _compute_metrics(frames)
        footprints: list[dict[int, float] | None] = []
        for path, metric in zip(frames, metrics_list):
            if metric is None:
                footprints.append(None)
                continue
            image = Image.open(path).convert("RGBA")
            pixels = image.getdata()
            bins: dict[int, int] = {}
            for red, green, blue, alpha in pixels:
                if alpha < 25:
                    continue
                quantised = ((red >> 5) << 11) | ((green >> 5) << 5) | (blue >> 5)
                bins[quantised] = bins.get(quantised, 0) + 1
            total = sum(bins.values()) or 1
            footprints.append({key: value / total for key, value in bins.items()})
        valid = [footprint for footprint in footprints if footprint]
        if len(valid) < 4:
            return EvaluationResult(metrics={"paletteOutlierFrames": []})
        median_footprint: dict[int, float] = {}
        keys = {key for footprint in valid for key in footprint}
        for key in keys:
            values = sorted(footprint.get(key, 0) for footprint in valid)
            median_footprint[key] = values[len(values) // 2]
        outliers: list[int] = []
        for idx, footprint in enumerate(footprints):
            if footprint is None:
                continue
            distance = 0.0
            all_keys = set(footprint) | set(median_footprint)
            for key in all_keys:
                distance += abs(footprint.get(key, 0) - median_footprint.get(key, 0))
            if distance > 0.6:
                outliers.append(idx)
        blocking: list[dict] = []
        if outliers:
            blocking.append({"code": "palette_drift", "message": f"第 {outliers} 帧色盘偏离序列中位数"})
        return EvaluationResult(blocking_issues=blocking, metrics={"paletteOutlierFrames": outliers})


class LoopSeamEvaluator:
    def __init__(self, action: str = ""):
        self._action = action

    def evaluate(self, frames: list[Path]) -> EvaluationResult:
        metrics_list = _compute_metrics(frames)
        action = self._action
        if not action or action in {"idle", "jump"} or len(frames) < 3:
            return EvaluationResult()
        visible_idx = [i for i, m in enumerate(metrics_list) if m]
        if len(visible_idx) < 3:
            return EvaluationResult()
        centres = [metrics_list[i]["centerX"] for i in visible_idx]  # type: ignore[index]
        adjacent_diffs = [abs(centres[i + 1] - centres[i]) for i in range(len(centres) - 1)]
        seam_diff = abs(centres[-1] - centres[0])
        median_adjacent = sorted(adjacent_diffs)[len(adjacent_diffs) // 2] if adjacent_diffs else 0.0
        blocking: list[dict] = []
        if median_adjacent > 0 and seam_diff > median_adjacent * 3:
            blocking.append({
                "code": "loop_seam",
                "message": f"首尾帧水平中心差 {seam_diff:.1f}px，明显超过帧间中位差 {median_adjacent:.1f}px",
            })
        return EvaluationResult(
            blocking_issues=blocking,
            metrics={"loopSeamDifference": seam_diff, "medianAdjacentDifference": median_adjacent},
        )
