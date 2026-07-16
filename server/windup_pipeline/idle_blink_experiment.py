"""Standalone experiment: minimal-variation idle built from a single blink frame.

Reuses the character's existing master as the "eyes open" state (zero
generation risk, it is already-approved pixels) and generates exactly one new
"eyes closed" frame conditioned on it. Not wired into the production
contract, action pipeline or job store — deliberately isolated so it can be
deleted without touching any of that.
"""

from __future__ import annotations

from pathlib import Path

from . import generate, processing

SLOT_PATTERN = ["open", "open", "open", "blink", "open", "open", "open", "open"]
BLINK_POSE = (
    "eyes fully closed in a natural mid-blink; body stance, hands, held items "
    "and everything else stay exactly as the reference"
)


def run(job_root: Path, base_path: Path, char_desc: str, model: str, api_key: str) -> Path:
    """Generate the single blink frame and return its normalized path."""
    raw = job_root / "raw" / "idle-blink.png"
    cutout = job_root / "cutout" / "idle-blink.png"
    output = job_root / "normalized" / "idle-blink.png"
    raw.parent.mkdir(parents=True, exist_ok=True)
    cutout.parent.mkdir(parents=True, exist_ok=True)
    generate.gen_frame(str(base_path), char_desc, BLINK_POSE, str(raw), model=model, api_key=api_key)
    processing.matte_chroma(raw, cutout)
    processing.normalize_frame(cutout, output, "idle", 0)
    return output
