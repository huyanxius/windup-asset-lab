"""Character catalogue and formal asset discovery.

This boundary owns where formal assets live. Generation and HTTP code consume
manifests instead of reconstructing directory rules.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from .domain import ACTION_LOOPS, ACTIONS, CATALOG, FPS, POSES, VIEWS

SAFE_ID = re.compile(r"^[a-z0-9-]+$")


class AssetCatalog:
    def __init__(self, root: Path, characters_root: Path):
        self.root = root
        self.characters_root = characters_root
        self.records = {key: dict(value) for key, value in CATALOG.items()}

    def load_custom(self) -> None:
        if not self.characters_root.exists():
            return
        for card_file in self.characters_root.glob("*/card.json"):
            try:
                card = json.loads(card_file.read_text(encoding="utf-8"))
                self.register(card, card_file)
            except (OSError, ValueError, TypeError):
                continue

    def register(self, card: dict, card_file: Path) -> dict:
        character_id = str(card.get("id", ""))
        base = str(card.get("base", ""))
        if not SAFE_ID.fullmatch(character_id):
            raise ValueError("角色 ID 不合法")
        if not base.startswith("generation-data/characters/") or not (self.root / base).exists():
            raise ValueError("角色母版路径不合法")
        record = {
            "label": str(card.get("label", character_id)),
            "base": base,
            "root": Path(base).parent.as_posix(),
            "description": str(card.get("description", "")),
            "custom": True,
            "card": card_file.relative_to(self.root).as_posix(),
        }
        self.records[character_id] = record
        return record

    def __contains__(self, character_id: str) -> bool:
        return character_id in self.records

    def __getitem__(self, character_id: str) -> dict:
        return self.records[character_id]

    def summaries(self) -> list[dict]:
        return [{"id": key, "label": value["label"]} for key, value in self.records.items()]

    def characters(self) -> dict:
        return {"characters": [{"id": key, **self.character_card(key)} for key in self.records]}

    def character_card(self, character_id: str) -> dict:
        item = dict(self.records[character_id])
        card_path = item.get("card")
        if card_path and (self.root / card_path).exists():
            item["cardData"] = json.loads((self.root / card_path).read_text(encoding="utf-8"))
        item["assets"] = self.manifest(character_id)
        return item

    def official_frame(self, character_id: str, view: str, action: str, frame_index: int) -> Path:
        name = f"{action}-{frame_index + 1:02d}.png"
        if character_id == "lamplighter":
            if view == "side" and action == "walk":
                return self.root / "assets/resources/character/frames" / name
            return self.root / "assets/resources/character/views" / view / name
        custom_root = self.records.get(character_id, {}).get("root")
        if custom_root:
            return self.root / custom_root / "views" / view / name
        return self.root / "assets/resources/characters" / character_id / "views" / view / name

    def manifest(self, character_id: str) -> dict:
        manifest = {}
        for view in VIEWS:
            actions = {}
            for action in ACTIONS:
                frames = []
                for frame_index in range(len(POSES[action])):
                    path = self.official_frame(character_id, view, action, frame_index)
                    if not path.exists():
                        break
                    frames.append(path.relative_to(self.root).as_posix())
                if frames:
                    actions[action] = {"frames": frames, "fps": FPS, "loop": ACTION_LOOPS[action]}
            manifest[view] = actions
        return manifest
