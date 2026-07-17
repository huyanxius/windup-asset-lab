"""Validated project reference-image storage."""

from __future__ import annotations

import io
import json
import os
import re
import uuid
from pathlib import Path

from PIL import Image, UnidentifiedImageError

from .time_utils import now_iso


REFERENCE_ID = re.compile(r"^ref-[a-f0-9]{12}$")
PROJECT_ID = re.compile(r"^[a-z0-9][a-z0-9-]{1,63}$")
SUPPORTED_FORMATS = {"PNG": ("image/png", ".png"), "JPEG": ("image/jpeg", ".jpg")}
MAX_BYTES = 10 * 1024 * 1024
MIN_DIMENSION = 32
MAX_DIMENSION = 8192


class ReferenceStore:
    def __init__(self, root: Path):
        self.root = root

    def prepare(self) -> None:
        self.root.mkdir(parents=True, exist_ok=True)

    def save(self, project_id: str, data: bytes, media_type: str, filename: str = "") -> dict:
        if not PROJECT_ID.fullmatch(project_id):
            raise ValueError("项目 ID 不合法")
        if not data or len(data) > MAX_BYTES:
            raise ValueError("参考图需要小于 10 MB")
        try:
            with Image.open(io.BytesIO(data)) as image:
                image_format = str(image.format or "").upper()
                image.verify()
            with Image.open(io.BytesIO(data)) as image:
                width, height = image.size
        except (UnidentifiedImageError, OSError, ValueError) as error:
            raise ValueError("参考图不是有效的 PNG 或 JPEG") from error
        if image_format not in SUPPORTED_FORMATS:
            raise ValueError("参考图只支持 PNG 或 JPEG")
        expected_type, suffix = SUPPORTED_FORMATS[image_format]
        normalized_type = media_type.split(";", 1)[0].strip().lower()
        if normalized_type and normalized_type not in {"application/octet-stream", expected_type}:
            raise ValueError("参考图声明类型与文件内容不一致")
        if not (
            MIN_DIMENSION <= width <= MAX_DIMENSION
            and MIN_DIMENSION <= height <= MAX_DIMENSION
        ):
            raise ValueError("参考图尺寸需要在 32–8192 像素之间")

        reference_id = f"ref-{uuid.uuid4().hex[:12]}"
        target = self.root / project_id / reference_id
        target.mkdir(parents=True, exist_ok=False)
        image_path = target / f"source{suffix}"
        temporary = target / f".source{suffix}.tmp"
        temporary.write_bytes(data)
        os.replace(temporary, image_path)
        record = {
            "id": reference_id,
            "projectId": project_id,
            "mediaType": expected_type,
            "filename": Path(filename).name[:160],
            "width": width,
            "height": height,
            "size": len(data),
            "assetUrl": f"/generation-data/references/{project_id}/{reference_id}/source{suffix}",
            "createdAt": now_iso(),
        }
        manifest = target / "reference.json"
        manifest_tmp = target / ".reference.json.tmp"
        manifest_tmp.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(manifest_tmp, manifest)
        return record

    def resolve(self, project_id: str, reference_id: str) -> Path:
        if not PROJECT_ID.fullmatch(project_id) or not REFERENCE_ID.fullmatch(reference_id):
            raise ValueError("参考图 ID 不合法")
        target = self.root / project_id / reference_id
        path = next(
            (candidate for candidate in (target / "source.png", target / "source.jpg") if candidate.is_file()),
            None,
        )
        if path is None:
            raise ValueError("参考图不存在或已失效")
        return path
