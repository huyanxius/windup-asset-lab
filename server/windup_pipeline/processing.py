"""Deterministic post-processing for generated sprite frames and action strips."""

import math
import statistics
from pathlib import Path

from PIL import Image


def _foreground_ratio(image: "Image.Image") -> float:
    alpha = image.getchannel("A")
    return sum(1 for value in alpha.getdata() if value > 24) / (image.width * image.height)


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
    if _foreground_ratio(image) > 0.6:
        # 色键没抠动（背景偏离四角键色）：回退 AI 主体分割，仍失败则拒绝出帧。
        try:
            from .matte import cutout
            cutout(source, destination)
            image = Image.open(destination).convert("RGBA")
        except ImportError:
            pass
        if _foreground_ratio(image) > 0.6:
            raise RuntimeError("背景未能去除，该帧需要重新生成")
    image.save(destination)


def fit_scale(width: int, height: int) -> float:
    return min(224 / width, 208 / height, 1.0)


def normalize_frame(source: Path, destination: Path, action: str, frame_index: int, scale: float | None = None) -> None:
    image = Image.open(source).convert("RGBA")
    alpha = image.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value > 24 else 0).getbbox()
    if not bbox:
        raise RuntimeError("该帧没有可见角色")
    subject = image.crop(bbox)
    if scale is None:
        scale = fit_scale(subject.width, subject.height)
    if scale < 1:
        subject = subject.resize(
            (max(1, round(subject.width * scale)), max(1, round(subject.height * scale))),
            Image.Resampling.NEAREST,
        )
    canvas = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    left = round((256 - subject.width) / 2)
    # Per-frame vertical offsets for non-standard actions.
    # Jump: simulates air displacement (larger offsets).
    # Idle: simulates breathing (tiny offsets to prevent pixel-identical frames).
    jump_offsets = [0, 18, 42, 62, 38, 0, 0, 0]
    idle_breath = [0, 1, 1, 0, -1, -1, -1, 0]  # ±1px breathing wobble
    vertical_offset = 0
    if action == "jump" and frame_index < len(jump_offsets):
        vertical_offset = jump_offsets[frame_index]
    elif action == "idle" and frame_index < len(idle_breath):
        vertical_offset = idle_breath[frame_index]
    top = 238 - subject.height - vertical_offset
    canvas.alpha_composite(subject, (left, top))
    destination.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(destination)


def split_action_sheet(
    source: Path,
    destination: Path,
    action: str,
    frame_count: int = 8,
) -> list[Path]:
    """Split one horizontal strip and normalize every panel to the runtime spec."""
    image = Image.open(source).convert("RGBA")
    width, height = image.size
    # 3:1 是保住竖长格子合法条(契约测试 800×240)的同时能拒掉多行网格(≤2:1)的最紧阈值。
    if frame_count != 8 or width < height * 3 or width // frame_count < 32:
        raise RuntimeError("生成结果不是可切分的 8 帧横向动作条")
    destination.mkdir(parents=True, exist_ok=True)
    crops = [
        image.crop((round(index * width / frame_count), 0, round((index + 1) * width / frame_count), height))
        for index in range(frame_count)
    ]
    # 整条动作共用一个缩放系数：逐帧各自适配会让宽姿势帧被缩小，破坏跨帧比例一致性。
    boxes = [crop.getchannel("A").point(lambda value: 255 if value > 24 else 0).getbbox() for crop in crops]
    scale = min((fit_scale(box[2] - box[0], box[3] - box[1]) for box in boxes if box), default=1.0)
    outputs = []
    for frame_index, crop in enumerate(crops):
        panel = destination / f".{action}-{frame_index + 1:02d}-panel.png"
        output = destination / f"{action}-{frame_index + 1:02d}.png"
        crop.save(panel)
        try:
            normalize_frame(panel, output, action, frame_index, scale)
        finally:
            panel.unlink(missing_ok=True)
        outputs.append(output)
    return outputs


def make_action_sheet(frames: list[Path], destination: Path) -> Path:
    """Build a deterministic horizontal sheet, mainly for demo and import flows."""
    if not frames:
        raise ValueError("动作条至少需要一帧")
    images = [Image.open(path).convert("RGBA") for path in frames]
    cell_width = max(image.width for image in images)
    height = max(image.height for image in images)
    sheet = Image.new("RGBA", (cell_width * len(images), height), (0, 0, 0, 0))
    for index, image in enumerate(images):
        sheet.alpha_composite(image, (index * cell_width, height - image.height))
    destination.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(destination)
    return destination


def sequence_quality(frames: list[Path], action: str = "") -> dict:
    """Measure deterministic geometry continuity; semantic motion remains human-reviewed."""
    metrics = []
    for path in frames:
        image = Image.open(path).convert("RGBA")
        alpha = image.getchannel("A")
        bbox = alpha.point(lambda value: 255 if value > 24 else 0).getbbox()
        if not bbox:
            metrics.append(None)
            continue
        left, top, right, bottom = bbox
        metrics.append({
            "width": right - left,
            "height": bottom - top,
            "centerX": round((left + right) / 2, 2),
            "footY": bottom,
            "coverage": round(sum(1 for value in alpha.getdata() if value > 24) / (image.width * image.height), 4),
        })
    visible = [metric for metric in metrics if metric]
    warnings = []
    if len(visible) != len(frames):
        warnings.append("存在不可见帧")
    if any(metric and metric["coverage"] > 0.5 for metric in metrics):
        warnings.append("疑似存在背景未去除的帧")
    if visible:
        median_height = statistics.median(metric["height"] for metric in visible)
        height_spread = (max(metric["height"] for metric in visible) - min(metric["height"] for metric in visible)) / max(1, median_height)
        center_spread = max(metric["centerX"] for metric in visible) - min(metric["centerX"] for metric in visible)
        foot_spread = max(metric["footY"] for metric in visible) - min(metric["footY"] for metric in visible)
        if height_spread > 0.28:
            warnings.append("主体高度波动过大")
        if center_spread > 42:
            warnings.append("主体水平中心漂移过大")
        if action != "jump" and action != "idle" and foot_spread > 5:
            warnings.append("脚底基线不连续")
        elif action == "idle" and foot_spread > 3:
            warnings.append("待机帧脚底波动过大")
    else:
        height_spread = center_spread = foot_spread = 0
    return {
        "passed": len(visible) == len(frames) and not warnings,
        "frameCount": len(frames),
        "geometryContinuity": round(max(0, 100 - height_spread * 90 - center_spread * 0.8 - foot_spread * 2), 1),
        "warnings": warnings,
        "frames": metrics,
        "semanticReviewRequired": True,
    }
