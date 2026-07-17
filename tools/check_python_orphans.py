#!/usr/bin/env python3
"""Fail when a backend module is unreachable from the HTTP application entrypoint."""

from __future__ import annotations

import ast
from collections.abc import Iterable
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
APP_PATH = ROOT / "server" / "app.py"
PIPELINE_ROOT = ROOT / "server" / "windup_pipeline"


def pipeline_modules() -> dict[str, Path]:
    return {
        path.stem: path
        for path in PIPELINE_ROOT.glob("*.py")
        if path.name != "__init__.py"
    }


def imported_pipeline_modules(path: Path, known: set[str]) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    imported: set[str] = set()

    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            module = node.module or ""
            parts = module.split(".") if module else []

            if "windup_pipeline" in parts:
                pipeline_index = parts.index("windup_pipeline")
                if pipeline_index + 1 < len(parts):
                    candidate = parts[pipeline_index + 1]
                    if candidate in known:
                        imported.add(candidate)
                else:
                    imported.update(alias.name.split(".")[0] for alias in node.names if alias.name.split(".")[0] in known)
            elif path.parent == PIPELINE_ROOT and node.level:
                if parts and parts[0] in known:
                    imported.add(parts[0])
                elif not parts:
                    imported.update(alias.name.split(".")[0] for alias in node.names if alias.name.split(".")[0] in known)

        elif isinstance(node, ast.Import):
            for alias in node.names:
                parts = alias.name.split(".")
                if "windup_pipeline" not in parts:
                    continue
                pipeline_index = parts.index("windup_pipeline")
                if pipeline_index + 1 < len(parts) and parts[pipeline_index + 1] in known:
                    imported.add(parts[pipeline_index + 1])

    return imported


def reachable_modules(roots: Iterable[str], graph: dict[str, set[str]]) -> set[str]:
    reachable: set[str] = set()
    pending = list(roots)
    while pending:
        module = pending.pop()
        if module in reachable or module not in graph:
            continue
        reachable.add(module)
        pending.extend(graph[module] - reachable)
    return reachable


def main() -> int:
    modules = pipeline_modules()
    known = set(modules)
    graph = {
        module: imported_pipeline_modules(path, known)
        for module, path in modules.items()
    }
    roots = imported_pipeline_modules(APP_PATH, known)
    reachable = reachable_modules(roots, graph)
    orphans = sorted(known - reachable)

    if orphans:
        print("Python orphan check failed:")
        for module in orphans:
            print(f"- server/windup_pipeline/{module}.py is unreachable from server/app.py")
        return 1

    print(f"Python orphan check OK ({len(reachable)} reachable backend modules).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
