"""Deterministic post-processing for generated sprite frames and action strips."""

import math
import statistics
from pathlib import Path

from PIL import Image


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


def split_action_sheet(
    source: Path,
    destination: Path,
    action: str,
    frame_count: int = 8,
) -> list[Path]:
    """Split one horizontal strip and normalize every panel to the runtime spec."""
    image = Image.open(source).convert("RGBA")
    width, height = image.size
    if frame_count != 8 or width < height * 2 or width // frame_count < 32:
        raise RuntimeError("生成结果不是可切分的 8 帧横向动作条")
    destination.mkdir(parents=True, exist_ok=True)
    outputs = []
    for frame_index in range(frame_count):
        left = round(frame_index * width / frame_count)
        right = round((frame_index + 1) * width / frame_count)
        panel = destination / f".{action}-{frame_index + 1:02d}-panel.png"
        output = destination / f"{action}-{frame_index + 1:02d}.png"
        image.crop((left, 0, right, height)).save(panel)
        try:
            normalize_frame(panel, output, action, frame_index)
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
    if visible:
        median_height = statistics.median(metric["height"] for metric in visible)
        height_spread = (max(metric["height"] for metric in visible) - min(metric["height"] for metric in visible)) / max(1, median_height)
        center_spread = max(metric["centerX"] for metric in visible) - min(metric["centerX"] for metric in visible)
        foot_spread = max(metric["footY"] for metric in visible) - min(metric["footY"] for metric in visible)
        if height_spread > 0.28:
            warnings.append("主体高度波动过大")
        if center_spread > 42:
            warnings.append("主体水平中心漂移过大")
        if action != "jump" and foot_spread > 5:
            warnings.append("脚底基线不连续")
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
