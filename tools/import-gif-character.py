#!/usr/bin/env python3
"""把 GIF 动画角色转换为本项目的编号 PNG 帧序列格式。

项目约定（见 GENERATION_WORKFLOW.md / tools/process-sprites.js）：
  - 画布 256×256，主体 fit 进 224×208，脚底基线 y=238
  - 每个动作用 `{action}-NN.png` 编号帧序列，每帧一个 Cocos 3.x `.meta`
  - 播放 8 FPS（本脚本只负责资产，帧率由 catalog/运行时决定）

本脚本面向「外部导入的 GIF 角色」（如 samurai）：GIF 已是透明背景、N 个独立帧。
为保留源动作，**不抽样**，全部帧保留；按动作内统一缩放系数归一化，并以
「动作内最低脚位」为锚保留帧间相对位移（idle/walk 保留细微起伏，jump 保留腾空弧线）。

用法:
  python3 tools/import-gif-character.py <character-dir>

<character-dir> 下应包含 base.png 与 views/side/*.gif。
"""

import json
import sys
import uuid
from pathlib import Path

from PIL import Image

CANVAS = 256
SUBJECT_W = 224
SUBJECT_H = 208
FOOTLINE = 238  # 脚底基线 y

TEXTURE_SUBID = "6c48a"
SPRITE_SUBID = "f9941"


def alpha_bbox(image: Image.Image):
    """返回 RGBA 图像按 alpha 通道的可见区域 (left, upper, right, lower)。"""
    alpha = image.split()[-1]
    return alpha.getbbox()  # None 表示全透明


def normalized_bbox_size(image: Image.Image):
    bbox = alpha_bbox(image)
    if not bbox:
        return None
    left, upper, right, lower = bbox
    return left, upper, right - left, lower - upper  # x, y, w, h


def load_gif_frames(gif_path: Path):
    """读取 GIF 全部帧为 RGBA，返回 [(frame_rgba, bbox=(x,y,w,h)), ...]。"""
    im = Image.open(gif_path)
    frames = []
    for _ in range(im.n_frames):
        im.seek(_)
        rgba = im.convert("RGBA")
        bbox = normalized_bbox_size(rgba)
        if not bbox:
            # 空帧：用 1×1 占位避免除零，后续缩放后基本不可见
            bbox = (0, 0, 1, 1)
        frames.append((rgba, bbox))
    return frames


def common_scale(bboxes):
    """动作内统一缩放系数：让最大主体 fit 进 224×208。"""
    max_w = max(b[2] for b in bboxes)
    max_h = max(b[3] for b in bboxes)
    return min(SUBJECT_W / max_w, SUBJECT_H / max_h)


def place_on_canvas(subject: Image.Image, canvas_left: int, canvas_top: int) -> Image.Image:
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    canvas.paste(subject, (int(round(canvas_left)), int(round(canvas_top))), subject)
    return canvas


def normalize_action(frames, action: str, out_dir: Path):
    """把一个动作的全部帧归一化写出，并生成 meta。返回写出路径列表。"""
    bboxes = [f[1] for f in frames]
    scale = common_scale(bboxes)

    # 动作内「最低脚位」(最大 foot-y) 映射到基线 238，保留帧间相对垂直位移
    foot_ys = [y + h for (_, (x, y, w, h)) in [(f, f[1]) for f in frames]]
    ground = max(foot_ys)

    paths = []
    for index, (rgba, (x, y, w, h)) in enumerate(frames, start=1):
        subject = rgba.crop((x, y, x + w, y + h)).resize(
            (max(1, round(w * scale)), max(1, round(h * scale))), Image.NEAREST
        )
        sw, sh = subject.size
        # 脚位（原图 bottom = y+h）映射到画布：ground -> 238，其余保留相对位置
        canvas_foot = FOOTLINE - (ground - (y + h)) * scale
        canvas_top = canvas_foot - sh
        canvas_left = (CANVAS - sw) / 2
        frame_img = place_on_canvas(subject, canvas_left, canvas_top)

        name = f"{action}-{index:02d}"
        png_path = out_dir / f"{name}.png"
        frame_img.save(png_path, "PNG")
        write_image_meta(png_path, name)
        paths.append(png_path)
    return paths


def normalize_base(base_path: Path):
    """母版：trim -> fit 224×208 -> 脚底基线 -> 256 画布，覆盖写回 + meta。"""
    im = Image.open(base_path).convert("RGBA")
    bbox = normalized_bbox_size(im)
    if not bbox:
        raise RuntimeError(f"base.png 主体为空: {base_path}")
    x, y, w, h = bbox
    scale = min(SUBJECT_W / w, SUBJECT_H / h)
    subject = im.crop((x, y, x + w, y + h)).resize(
        (max(1, round(w * scale)), max(1, round(h * scale))), Image.NEAREST
    )
    sw, sh = subject.size
    canvas_top = FOOTLINE - sh  # 单帧：脚底直接锚到基线
    canvas_left = (CANVAS - sw) / 2
    canvas = place_on_canvas(subject, canvas_left, canvas_top)
    canvas.save(base_path, "PNG")
    write_image_meta(base_path, "base")


def write_directory_meta(dir_path: Path):
    meta_path = dir_path.with_name(dir_path.name + ".meta")
    payload = {
        "ver": "1.2.0",
        "importer": "directory",
        "imported": True,
        "uuid": str(uuid.uuid4()),
        "files": [],
        "subMetas": {},
        "userData": {},
    }
    meta_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def write_image_meta(png_path: Path, display_name: str):
    """按 Cocos 3.x sprite-frame meta 模板生成像素精确的 meta。"""
    im = Image.open(png_path).convert("RGBA")
    raw_w, raw_h = CANVAS, CANVAS
    bbox = alpha_bbox(im)
    if not bbox:
        trim_x = trim_y = 0
        width = height = 0
    else:
        trim_x, trim_y = bbox[0], bbox[1]
        width = bbox[2] - bbox[0]
        height = bbox[3] - bbox[1]

    hw = width / 2
    hh = height / 2
    offset_x = trim_x + hw - raw_w / 2
    offset_y = raw_h / 2 - (trim_y + hh)
    right = trim_x + width
    bottom = trim_y + height

    main_uuid = str(uuid.uuid4())
    payload = {
        "ver": "1.0.27",
        "importer": "image",
        "imported": True,
        "uuid": main_uuid,
        "files": [".json", ".png"],
        "subMetas": {
            TEXTURE_SUBID: {
                "importer": "texture",
                "uuid": f"{main_uuid}@{TEXTURE_SUBID}",
                "displayName": display_name,
                "id": TEXTURE_SUBID,
                "name": "texture",
                "userData": {
                    "wrapModeS": "clamp-to-edge",
                    "wrapModeT": "clamp-to-edge",
                    "imageUuidOrDatabaseUri": main_uuid,
                    "isUuid": True,
                    "visible": False,
                    "minfilter": "linear",
                    "magfilter": "linear",
                    "mipfilter": "none",
                    "anisotropy": 0,
                },
                "ver": "1.0.22",
                "imported": True,
                "files": [".json"],
                "subMetas": {},
            },
            SPRITE_SUBID: {
                "importer": "sprite-frame",
                "uuid": f"{main_uuid}@{SPRITE_SUBID}",
                "displayName": display_name,
                "id": SPRITE_SUBID,
                "name": "spriteFrame",
                "userData": {
                    "trimThreshold": 1,
                    "rotated": False,
                    "offsetX": offset_x,
                    "offsetY": offset_y,
                    "trimX": trim_x,
                    "trimY": trim_y,
                    "width": width,
                    "height": height,
                    "rawWidth": raw_w,
                    "rawHeight": raw_h,
                    "borderTop": 0,
                    "borderBottom": 0,
                    "borderLeft": 0,
                    "borderRight": 0,
                    "packable": True,
                    "pixelsToUnit": 100,
                    "pivotX": 0.5,
                    "pivotY": 0.5,
                    "meshType": 0,
                    "vertices": {
                        "rawPosition": [-hw, -hh, 0, hw, -hh, 0, -hw, hh, 0, hw, hh, 0],
                        "indexes": [0, 1, 2, 2, 1, 3],
                        "uv": [trim_x, bottom, right, bottom, trim_x, trim_y, right, trim_y],
                        "nuv": [
                            trim_x / raw_w, trim_y / raw_h,
                            right / raw_w, trim_y / raw_h,
                            trim_x / raw_w, bottom / raw_h,
                            right / raw_w, bottom / raw_h,
                        ],
                        "minPos": [-hw, -hh, 0],
                        "maxPos": [hw, hh, 0],
                    },
                    "isUuid": True,
                    "imageUuidOrDatabaseUri": f"{main_uuid}@{TEXTURE_SUBID}",
                    "atlasUuid": "",
                    "trimType": "auto",
                },
                "ver": "1.0.12",
                "imported": True,
                "files": [".json"],
                "subMetas": {},
            },
        },
        "userData": {
            "type": "sprite-frame",
            "fixAlphaTransparencyArtifacts": False,
            "hasAlpha": True,
            "redirect": f"{main_uuid}@{TEXTURE_SUBID}",
        },
    }
    meta_path = png_path.with_suffix(png_path.suffix + ".meta")
    meta_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def main():
    if len(sys.argv) != 2:
        print("用法: python3 tools/import-gif-character.py <character-dir>", file=sys.stderr)
        sys.exit(1)

    char_dir = Path(sys.argv[1]).resolve()
    side_dir = char_dir / "views" / "side"
    base_path = char_dir / "base.png"

    if not base_path.exists():
        raise SystemExit(f"找不到 base.png: {base_path}")
    if not side_dir.exists():
        raise SystemExit(f"找不到 views/side 目录: {side_dir}")

    # 目录 meta（角色根 / views / side）
    for d in (char_dir, char_dir / "views", side_dir):
        write_directory_meta(d)

    # 母版
    normalize_base(base_path)
    print(f"[base] 归一化并生成 meta: {base_path}")

    # 各动作 GIF
    gifs = sorted(side_dir.glob("*.gif"))
    if not gifs:
        raise SystemExit(f"在 {side_dir} 下未发现 GIF 动作")
    for gif in gifs:
        action = gif.stem
        frames = load_gif_frames(gif)
        paths = normalize_action(frames, action, side_dir)
        print(f"[{action}] 保留全部 {len(paths)} 帧 -> {side_dir}/{action}-01..{len(paths):02d}.png + meta")


if __name__ == "__main__":
    main()
