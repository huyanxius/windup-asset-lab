"""Windup application service.

HTTP routes delegate here; generation workflows do not depend on request
handlers, cookies or transport details.
"""

from __future__ import annotations

import re
import threading
import uuid
from datetime import datetime
from pathlib import Path

from . import config, provider
from .asset_catalog import AssetCatalog
from .domain import (
    ACTIONS,
    CONTRACT_VERSION,
    FPS,
    GENERATION,
    IMAGE_MODELS,
    POSES,
    VIEWS,
)
from .generation_executor import GenerationExecutor
from .job_store import JobStore
from .publisher import AssetPublisher
from .review_store import ReviewStore
from .session_store import ProviderSession, ProviderSessionStore
from .time_utils import now_iso
from .workflow_store import WorkflowTemplateStore


class GenerationApplication:
    def __init__(self, root: Path, *, demo: bool = False):
        self.root = root
        self.data_root = root / "generation-data"
        self.jobs_root = self.data_root / "jobs"
        self.backups_root = self.data_root / "backups"
        self.characters_root = self.data_root / "characters"
        self.workflows_root = self.data_root / "workflows"
        self.demo = demo
        self.jobs = JobStore(self.jobs_root)
        self.reviews = ReviewStore(self.data_root / "reviews")
        self.workflows = WorkflowTemplateStore(self.workflows_root)
        self.sessions = ProviderSessionStore(config.API_KEY, config.IMAGE_MODEL)
        self.assets = AssetCatalog(root, self.characters_root)
        self.catalog = self.assets.records
        self.promotion_lock = threading.Lock()
        self.executor = GenerationExecutor(
            root=root,
            data_root=self.data_root,
            jobs_root=self.jobs_root,
            jobs=self.jobs,
            catalog=self.assets,
            demo=demo,
        )
        self.publisher = AssetPublisher(
            root=root,
            jobs_root=self.jobs_root,
            backups_root=self.backups_root,
            characters_root=self.characters_root,
            catalog=self.assets,
        )

    def prepare(self) -> None:
        for path in (self.jobs_root, self.backups_root, self.characters_root, self.workflows_root):
            path.mkdir(parents=True, exist_ok=True)
        self.assets.load_custom()
        self.jobs.load(now_iso())
        self.workflows.load()
        if config.API_KEY and not self.demo:
            try:
                provider.verify_key(config.API_KEY)
                self.sessions.default_verified = True
            except provider.ProviderError:
                self.sessions.default_key = ""
                self.sessions.default_verified = False

    def session(self, session_id: str) -> ProviderSession:
        return self.sessions.get_or_create(session_id)

    def health(self, session_id: str) -> dict:
        session = self.session(session_id)
        return {
            "ok": True,
            **session.public(),
            "demo": self.demo,
            "provider": "七牛云 QnAIGC",
            "contractVersion": CONTRACT_VERSION,
            "fps": FPS,
            "characters": self.assets.summaries(),
        }

    def models(self, session_id: str) -> dict:
        session = self.session(session_id)
        return {
            "provider": "七牛云 QnAIGC",
            "models": IMAGE_MODELS,
            "selected": session.model or IMAGE_MODELS[0],
            "source": "QnAIGC image model documentation",
            "contractVersion": CONTRACT_VERSION,
        }

    def connect_provider(self, session_id: str, payload: dict) -> dict:
        api_key = str(payload.get("apiKey", "")).strip()
        model = str(payload.get("model", "")).strip() or IMAGE_MODELS[0]
        if not 16 <= len(api_key) <= 512 or any(char.isspace() for char in api_key):
            raise ValueError("API Key 格式不合法")
        if model not in IMAGE_MODELS:
            raise ValueError("不支持的图像模型")
        try:
            provider.verify_key(api_key)
        except provider.ProviderError as error:
            self.sessions.fail(session_id, str(error))
            raise
        session = self.sessions.connect(session_id, api_key, model)
        return {
            "ok": True,
            **session.public(),
            "storage": "isolated-process-session",
            "models": IMAGE_MODELS,
            "contractVersion": CONTRACT_VERSION,
        }

    def character_card(self, character_id: str) -> dict:
        return self.assets.character_card(character_id)

    def characters(self) -> dict:
        return self.assets.characters()

    def workflow_templates(self) -> dict:
        return {"workflows": self.workflows.list()}

    def save_workflow_template(self, payload: dict) -> dict:
        name = str(payload.get("name", "")).strip()
        description = str(payload.get("description", "")).strip()
        project = payload.get("project", {})
        pipeline = payload.get("pipeline", {})
        execution = payload.get("execution", {})
        graph = payload.get("graph", {})
        if not 1 <= len(name) <= 48:
            raise ValueError("流程名称需要 1–48 字")
        if len(description) > 240 or not isinstance(project, dict) or not isinstance(pipeline, dict) or not isinstance(execution, dict) or not isinstance(graph, dict):
            raise ValueError("流程模板格式不合法")
        view = str(project.get("view", "side"))
        directions = str(project.get("directions", "1"))
        canvas_size = str(project.get("canvasSize", "256"))
        style = str(project.get("style", "")).strip()
        source = str(pipeline.get("source", "zero"))
        actions = list(dict.fromkeys(str(action) for action in pipeline.get("actions", ["idle", "walk"])))
        fps = int(pipeline.get("fps", FPS))
        briefs = pipeline.get("briefs", {})
        mode = str(execution.get("mode", "automatic"))
        if view not in VIEWS or directions not in {"1", "4", "8"} or canvas_size not in {"128", "256", "512"}:
            raise ValueError("项目约束不合法")
        if len(style) > 240 or source not in {"zero", "upload", "existing"}:
            raise ValueError("素材来源或美术约束不合法")
        if set(actions) != {"idle", "walk"}:
            raise ValueError("当前画布流程需要同时保留待机和行走动作")
        if fps not in {8, 12, 16} or not isinstance(briefs, dict) or mode not in {"automatic", "guided"}:
            raise ValueError("流程执行配置不合法")
        clean_briefs = {action: str(briefs.get(action, "")).strip()[:180] for action in actions}
        clean_graph = self._clean_workflow_graph(graph)
        return self.workflows.create({
            "name": name,
            "description": description,
            "project": {
                "view": view,
                "directions": directions,
                "canvasSize": canvas_size,
                "style": style,
            },
            "pipeline": {
                "source": source,
                "actions": actions,
                "fps": fps,
                "briefs": clean_briefs,
            },
            "graph": clean_graph,
            "execution": {
                "mode": mode,
                "approval": "final_asset" if mode == "automatic" else "every_stage",
            },
        }, now_iso())

    @staticmethod
    def _clean_workflow_graph(graph: dict) -> dict:
        allowed_edges = {
            ("project", "source"), ("source", "master-gen"), ("master-gen", "master"),
            ("master", "walk-key"), ("master", "idle-key"), ("master", "custom-action"),
            ("walk-key", "walk-animation"), ("idle-key", "idle-animation"),
            ("walk-animation", "publish"), ("idle-animation", "publish"),
        }
        allowed_nodes = {node for edge in allowed_edges for node in edge}
        nodes = list(dict.fromkeys(str(node) for node in graph.get("nodes", []) if str(node) in allowed_nodes))
        connections = []
        for edge in graph.get("connections", []):
            if isinstance(edge, list) and len(edge) == 2 and tuple(str(value) for value in edge) in allowed_edges:
                clean_edge = [str(edge[0]), str(edge[1])]
                if clean_edge not in connections:
                    connections.append(clean_edge)
        positions = {}
        for node, point in graph.get("positions", {}).items():
            if str(node) not in allowed_nodes or not isinstance(point, dict):
                continue
            try:
                x = max(0, min(6000, round(float(point.get("x", 0)))))
                y = max(0, min(4000, round(float(point.get("y", 0)))))
            except (TypeError, ValueError):
                continue
            positions[str(node)] = {"x": x, "y": y}
        viewport = graph.get("viewport", {})
        try:
            viewport = {
                "x": max(-6000, min(6000, round(float(viewport.get("x", 80))))),
                "y": max(-4000, min(4000, round(float(viewport.get("y", 120))))),
                "scale": max(0.5, min(1.2, round(float(viewport.get("scale", 1)), 2))),
            }
        except (AttributeError, TypeError, ValueError):
            viewport = {"x": 80, "y": 120, "scale": 1}
        return {"version": 1, "nodes": nodes, "connections": connections, "positions": positions, "viewport": viewport}

    def run_workflow_template(self, session_id: str, template_id: str, payload: dict) -> dict:
        template = self.workflows.get(template_id)
        if not template:
            raise ValueError("流程模板不存在")
        pipeline = template["pipeline"]
        project = template["project"]
        session = self.session(session_id)
        workflow_run = {
            "templateId": template["id"],
            "templateName": template["name"],
            "templateVersion": template["version"],
            "executionMode": template["execution"]["mode"],
        }
        job = self.create_character_job(session_id, {
            "name": payload.get("name"),
            "description": payload.get("description"),
            "style": str(payload.get("style", "")).strip() or project.get("style", ""),
            "palette": payload.get("palette", ""),
            "model": str(payload.get("model", "")).strip() or session.model or config.IMAGE_MODEL,
            "starterActions": pipeline["actions"],
        }, workflow_run=workflow_run)
        self.workflows.record_run(template_id, now_iso())
        return job

    def official_frame(self, character_id: str, view: str, action: str, frame_index: int) -> Path:
        return self.assets.official_frame(character_id, view, action, frame_index)

    def character_asset_manifest(self, character_id: str) -> dict:
        return self.assets.manifest(character_id)

    def _update_job(self, job_id: str, **changes) -> dict:
        return self.jobs.update(job_id, updatedAt=now_iso(), **changes)

    def _credentials(self, session_id: str) -> ProviderSession:
        session = self.session(session_id)
        if not self.demo and (not session.api_key or not session.verified):
            raise ValueError("请先验证七牛云 API Key")
        return session

    @staticmethod
    def _quick_start_name(prompt: str) -> str:
        match = re.search(
            r"(?:名叫(?:做)?|叫做|角色名(?:是|为)?)[：:\s“\"']*"
            r"([\w\u4e00-\u9fff·-]{1,20}?)(?=的|[，,。.;；\s”\"']|$)",
            prompt,
        )
        if match:
            return match.group(1).rstrip("的")
        return f"Quick Start {datetime.now().strftime('%m%d-%H%M')}"

    @staticmethod
    def _quick_start_actions(prompt: str) -> list[str]:
        aliases = {
            "idle": ("待机", "呼吸", "站立", "idle"),
            "walk": ("行走", "走路", "步行", "walk"),
            "run": ("奔跑", "跑步", "run"),
            "jump": ("跳跃", "跳起", "jump"),
            "lantern": ("提灯", "灯笼", "lantern"),
        }
        lowered = prompt.lower()
        inferred = [action for action, words in aliases.items() if any(word in lowered for word in words)]
        return inferred[:3] or list(GENERATION["starterPack"]["actions"])

    def create_quick_start_job(self, session_id: str, payload: dict) -> dict:
        prompt = str(payload.get("prompt", "")).strip()
        if not 12 <= len(prompt) <= 800:
            raise ValueError("Quick Start 自然语言描述需要 12–800 字")
        raw_actions = payload.get("starterActions")
        starter_actions = raw_actions if raw_actions is not None else self._quick_start_actions(prompt)
        session = self.session(session_id)
        return self.create_character_job(session_id, {
            "name": str(payload.get("name", "")).strip() or self._quick_start_name(prompt),
            "description": prompt,
            "style": payload.get("style", ""),
            "palette": payload.get("palette", ""),
            "model": str(payload.get("model", "")).strip() or session.model or config.IMAGE_MODEL,
            "starterActions": starter_actions,
        }, quick_start={
            "mode": "natural-language",
            "prompt": prompt,
            "inferredActions": raw_actions is None,
        })

    def create_character_job(
        self,
        session_id: str,
        payload: dict,
        *,
        workflow_run: dict | None = None,
        quick_start: dict | None = None,
    ) -> dict:
        credentials = self._credentials(session_id)
        name = str(payload.get("name", "")).strip()
        description = str(payload.get("description", "")).strip()
        style = str(payload.get("style", "")).strip()
        palette = str(payload.get("palette", "")).strip()
        model = str(payload.get("model", "")).strip()
        if len(style) > 120 or len(palette) > 120:
            raise ValueError("风格与配色各不超过 120 字")
        raw_starter_actions = payload.get("starterActions", GENERATION["starterPack"]["actions"])
        if not 1 <= len(name) <= 40:
            raise ValueError("资产名称需要 1–40 字")
        if not 12 <= len(description) <= 800:
            raise ValueError("角色定义需要 12–800 字")
        if model not in IMAGE_MODELS:
            raise ValueError("请选择有效的图像模型")
        if not isinstance(raw_starter_actions, list):
            raise ValueError("基础动作包格式不合法")
        starter_actions = list(dict.fromkeys(str(action) for action in raw_starter_actions))
        if not starter_actions or len(starter_actions) > 3 or any(action not in ACTIONS for action in starter_actions):
            raise ValueError("新角色至少需要一个有效的基础动作")
        job_id = uuid.uuid4().hex[:12]
        character_id = f"custom-{uuid.uuid4().hex[:8]}"
        job = {
            "id": job_id, "batch": f"C-{datetime.now().strftime('%Y%m%d-%H%M%S')}",
            "status": "queued", "progress": 0, "message": "新角色与基础动作包已进入队列",
            "request": {
                "type": "character", "character": character_id, "name": name,
                "description": description, "style": style, "palette": palette, "model": model,
                "starterView": GENERATION["starterPack"]["view"],
                "starterActions": starter_actions,
                "generationRoute": GENERATION["defaultRoute"],
                **({"workflow": workflow_run} if workflow_run else {}),
                **({"quickStart": quick_start} if quick_start else {}),
            },
            "outputs": [], "createdAt": now_iso(), "updatedAt": now_iso(),
        }
        self.jobs.add(job)
        threading.Thread(target=self.executor.run_character, args=(job_id, credentials.api_key), daemon=True).start()
        return job

    def create_job(self, session_id: str, payload: dict) -> dict:
        credentials = self._credentials(session_id)
        character_id = str(payload.get("character", ""))
        view = str(payload.get("view", ""))
        action = str(payload.get("action", ""))
        mode = str(payload.get("mode", "full"))
        route = str(payload.get("route", GENERATION["defaultRoute"]))
        custom_prompt = str(payload.get("customPrompt", "")).strip()
        model = str(payload.get("model", credentials.model or config.IMAGE_MODEL)).strip()
        if (
            character_id not in self.catalog
            or view not in VIEWS
            or action not in ACTIONS
            or mode not in {"full", "single"}
            or route not in GENERATION["routes"]
        ):
            raise ValueError("生成参数不合法")
        if len(custom_prompt) > 800:
            raise ValueError("画面约束不能超过 800 字")
        if model not in IMAGE_MODELS:
            raise ValueError("请选择有效的图像模型")
        frame_index = int(payload.get("frameIndex", 0))
        if not 0 <= frame_index < len(POSES[action]):
            raise ValueError("帧号越界")
        job_id = uuid.uuid4().hex[:12]
        job = {
            "id": job_id, "batch": f"G-{datetime.now().strftime('%Y%m%d-%H%M%S')}",
            "status": "queued", "progress": 0, "message": "已进入生成队列",
            "request": {
                "character": character_id, "view": view, "action": action, "mode": mode,
                "frameIndex": frame_index, "fps": FPS, "customPrompt": custom_prompt, "model": model,
                "generationRoute": "frames" if mode == "single" else route,
            },
            "outputs": [], "createdAt": now_iso(), "updatedAt": now_iso(),
        }
        self.jobs.add(job)
        threading.Thread(target=self.executor.run_action, args=(job_id, credentials.api_key), daemon=True).start()
        return job

    def promote_job(self, job_id: str) -> dict:
        with self.promotion_lock:
            job = self.jobs.get(job_id)
            if job and job.get("status") == "approved":
                return job
            if not job or job.get("status") != "awaiting_review":
                raise ValueError("该任务尚不可采用")
            result = self.publisher.promote(job)
            return self._update_job(job_id, status="approved", **result)
