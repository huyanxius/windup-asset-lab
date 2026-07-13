"""Deterministic post-processing for generated sprite frames."""

import math
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
