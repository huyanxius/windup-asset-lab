"""Validated, transport-neutral data models for the MS1 project graph."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import PurePosixPath
from typing import Any

from .domain import ACTIONS, VIEWS

SAFE_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,79}$")
MASTER_STATES = {"draft", "generating", "awaiting_review", "locked", "failed", "interrupted"}
ACTION_STATES = {
    "draft", "queued", "generating", "quality_check", "awaiting_review",
    "needs_repair", "needs_input", "failed", "completed", "promoted",
}
FRAME_STATES = {"pending", "pass", "reject", "regenerating"}


def _mapping(value: Any, label: str) -> dict:
    if not isinstance(value, dict):
        raise ValueError(f"{label}必须是对象")
    return dict(value)


def _text(data: dict, key: str, *, minimum: int = 1, maximum: int = 800) -> str:
    value = data.get(key)
    if not isinstance(value, str):
        raise ValueError(f"{key}必须是文本")
    value = value.strip()
    if not minimum <= len(value) <= maximum:
        raise ValueError(f"{key}长度不合法")
    return value


def _identifier(data: dict, key: str) -> str:
    value = _text(data, key, maximum=80)
    if not SAFE_ID.fullmatch(value):
        raise ValueError(f"{key}不是安全 ID")
    return value


def _optional_identifier(data: dict, key: str) -> str | None:
    value = data.get(key)
    if value is None:
        return None
    return _identifier({key: value}, key)


def _integer(data: dict, key: str, *, minimum: int = 0, maximum: int = 1_000_000) -> int:
    value = data.get(key)
    if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
        raise ValueError(f"{key}不是有效整数")
    return value


def _timestamp(data: dict, key: str, *, optional: bool = False) -> str | None:
    if optional and data.get(key) is None:
        return None
    value = _text(data, key, maximum=80)
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as error:
        raise ValueError(f"{key}不是 ISO-8601 时间") from error
    if parsed.tzinfo is None:
        raise ValueError(f"{key}必须包含时区")
    return value


def _asset_path(value: Any) -> str:
    if not isinstance(value, str) or not value or "\\" in value or ":" in value:
        raise ValueError("assetPath 必须是 POSIX 相对路径")
    path = PurePosixPath(value)
    if path.is_absolute() or ".." in path.parts or "." in path.parts:
        raise ValueError("assetPath 必须是安全相对路径")
    return path.as_posix()


@dataclass(frozen=True)
class Project:
    id: str
    name: str
    art_style: str
    view_mode: str
    canvas_size: int
    target: str
    created_at: str
    updated_at: str

    @classmethod
    def from_dict(cls, value: dict) -> "Project":
        data = _mapping(value, "Project")
        view_mode = _text(data, "viewMode", maximum=40)
        canvas_size = _integer(data, "canvasSize", minimum=1, maximum=4096)
        if view_mode not in VIEWS or canvas_size != 256:
            raise ValueError("MS1 Project 只接受契约视角与 256 画布")
        return cls(
            id=_identifier(data, "id"),
            name=_text(data, "name", maximum=80),
            art_style=_text(data, "artStyle", maximum=240),
            view_mode=view_mode,
            canvas_size=canvas_size,
            target=_text(data, "target", maximum=80),
            created_at=str(_timestamp(data, "createdAt")),
            updated_at=str(_timestamp(data, "updatedAt")),
        )

    def to_dict(self) -> dict:
        return {
            "id": self.id, "name": self.name, "artStyle": self.art_style,
            "viewMode": self.view_mode, "canvasSize": self.canvas_size, "target": self.target,
            "createdAt": self.created_at, "updatedAt": self.updated_at,
        }


@dataclass(frozen=True)
class Character:
    id: str
    project_id: str
    name: str
    identity_id: str
    active_outfit_id: str

    @classmethod
    def from_dict(cls, value: dict) -> "Character":
        data = _mapping(value, "Character")
        return cls(
            id=_identifier(data, "id"),
            project_id=_identifier(data, "projectId"),
            name=_text(data, "name", maximum=80),
            identity_id=_identifier(data, "identityId"),
            active_outfit_id=_identifier(data, "activeOutfitId"),
        )

    def to_dict(self) -> dict:
        return {
            "id": self.id, "projectId": self.project_id, "name": self.name,
            "identityId": self.identity_id, "activeOutfitId": self.active_outfit_id,
        }


@dataclass(frozen=True)
class CharacterIdentity:
    id: str
    description: str
    reference_asset_id: str | None
    version: int

    @classmethod
    def from_dict(cls, value: dict) -> "CharacterIdentity":
        data = _mapping(value, "CharacterIdentity")
        return cls(
            id=_identifier(data, "id"),
            description=_text(data, "description", maximum=800),
            reference_asset_id=_optional_identifier(data, "referenceAssetId"),
            version=_integer(data, "version", minimum=1),
        )

    def to_dict(self) -> dict:
        return {
            "id": self.id, "description": self.description,
            "referenceAssetId": self.reference_asset_id, "version": self.version,
        }


@dataclass(frozen=True)
class Outfit:
    id: str
    character_id: str
    name: str
    active_master_set_version_id: str | None

    @classmethod
    def from_dict(cls, value: dict) -> "Outfit":
        data = _mapping(value, "Outfit")
        return cls(
            id=_identifier(data, "id"),
            character_id=_identifier(data, "characterId"),
            name=_text(data, "name", maximum=80),
            active_master_set_version_id=_optional_identifier(data, "activeMasterSetVersionId"),
        )

    def to_dict(self) -> dict:
        return {
            "id": self.id, "characterId": self.character_id, "name": self.name,
            "activeMasterSetVersionId": self.active_master_set_version_id,
        }


@dataclass(frozen=True)
class MasterSetVersion:
    id: str
    outfit_id: str
    status: str
    source_type: str
    views: dict
    created_at: str
    locked_at: str | None

    @classmethod
    def from_dict(cls, value: dict) -> "MasterSetVersion":
        data = _mapping(value, "MasterSetVersion")
        status = _text(data, "status", maximum=40)
        if status not in MASTER_STATES:
            raise ValueError("母版状态不合法")
        raw_views = _mapping(data.get("views"), "views")
        views = {}
        for view, raw in raw_views.items():
            if view not in VIEWS:
                raise ValueError("母版视角不在契约中")
            item = _mapping(raw, "master view")
            direction = _text(item, "direction", maximum=20)
            if direction not in {"left", "right"}:
                raise ValueError("母版方向不合法")
            views[view] = {"direction": direction, "assetPath": _asset_path(item.get("assetPath"))}
        if not views:
            raise ValueError("母版至少需要一个视角")
        return cls(
            id=_identifier(data, "id"),
            outfit_id=_identifier(data, "outfitId"),
            status=status,
            source_type=_text(data, "sourceType", maximum=80),
            views=views,
            created_at=str(_timestamp(data, "createdAt")),
            locked_at=_timestamp(data, "lockedAt", optional=True),
        )

    def to_dict(self) -> dict:
        return {
            "id": self.id, "outfitId": self.outfit_id, "status": self.status,
            "sourceType": self.source_type,
            "views": {key: dict(value) for key, value in self.views.items()},
            "createdAt": self.created_at, "lockedAt": self.locked_at,
        }


@dataclass(frozen=True)
class ActionInstance:
    id: str
    outfit_id: str
    definition_id: str
    view: str
    status: str
    version: int

    @classmethod
    def from_dict(cls, value: dict) -> "ActionInstance":
        data = _mapping(value, "ActionInstance")
        definition_id = _text(data, "definitionId", maximum=40)
        view = _text(data, "view", maximum=40)
        status = _text(data, "status", maximum=40)
        if definition_id not in ACTIONS or view not in VIEWS or status not in ACTION_STATES:
            raise ValueError("动作实例不符合产品契约")
        return cls(
            id=_identifier(data, "id"),
            outfit_id=_identifier(data, "outfitId"),
            definition_id=definition_id,
            view=view,
            status=status,
            version=_integer(data, "version", minimum=1),
        )

    def to_dict(self) -> dict:
        return {
            "id": self.id, "outfitId": self.outfit_id, "definitionId": self.definition_id,
            "view": self.view, "status": self.status, "version": self.version,
        }


@dataclass(frozen=True)
class FrameRecord:
    id: str
    action_instance_id: str
    index: int
    asset_path: str
    review_status: str
    record_id: str | None
    qc: dict

    @classmethod
    def from_dict(cls, value: dict) -> "FrameRecord":
        data = _mapping(value, "FrameRecord")
        review_status = _text(data, "reviewStatus", maximum=40)
        if review_status not in FRAME_STATES:
            raise ValueError("帧审核状态不合法")
        qc = _mapping(data.get("qc"), "qc")
        if not isinstance(qc.get("passed"), bool):
            raise ValueError("qc.passed 必须是布尔值")
        warnings = qc.get("warnings")
        if not isinstance(warnings, list) or any(not isinstance(item, str) for item in warnings):
            raise ValueError("qc.warnings 必须是文本数组")
        return cls(
            id=_identifier(data, "id"),
            action_instance_id=_identifier(data, "actionInstanceId"),
            index=_integer(data, "index", maximum=7),
            asset_path=_asset_path(data.get("assetPath")),
            review_status=review_status,
            record_id=_optional_identifier(data, "recordId"),
            qc=dict(qc),
        )

    def to_dict(self) -> dict:
        return {
            "id": self.id, "actionInstanceId": self.action_instance_id, "index": self.index,
            "assetPath": self.asset_path, "reviewStatus": self.review_status,
            "recordId": self.record_id, "qc": dict(self.qc),
        }


@dataclass(frozen=True)
class GenerationRecord:
    id: str
    job_id: str
    kind: str
    model: str
    route: str
    attempt: int
    elapsed_ms: int
    cost: float | int | None
    parent_record_id: str | None
    created_at: str

    @classmethod
    def from_dict(cls, value: dict) -> "GenerationRecord":
        data = _mapping(value, "GenerationRecord")
        cost = data.get("cost")
        if isinstance(cost, bool) or (cost is not None and not isinstance(cost, (int, float))):
            raise ValueError("cost 必须是数字或 null")
        return cls(
            id=_identifier(data, "id"),
            job_id=_identifier(data, "jobId"),
            kind=_text(data, "kind", maximum=80),
            model=_text(data, "model", maximum=120),
            route=_text(data, "route", maximum=40),
            attempt=_integer(data, "attempt", minimum=1),
            elapsed_ms=_integer(data, "elapsedMs"),
            cost=cost,
            parent_record_id=_optional_identifier(data, "parentRecordId"),
            created_at=str(_timestamp(data, "createdAt")),
        )

    def to_dict(self) -> dict:
        return {
            "id": self.id, "jobId": self.job_id, "kind": self.kind, "model": self.model,
            "route": self.route, "attempt": self.attempt, "elapsedMs": self.elapsed_ms,
            "cost": self.cost, "parentRecordId": self.parent_record_id,
            "createdAt": self.created_at,
        }
