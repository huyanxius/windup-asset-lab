#!/usr/bin/env python3
"""Windup HTTP adapter: routes, cookies, CORS and static hosting only."""

from __future__ import annotations

import argparse
import json
import os
import re
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

try:
    from .windup_pipeline import provider
    from .windup_pipeline.application import GenerationApplication
    from .windup_pipeline.review_store import ReviewConflict
except ImportError:  # Legacy `python server/app.py` support.
    from windup_pipeline import provider
    from windup_pipeline.application import GenerationApplication
    from windup_pipeline.review_store import ReviewConflict

ROOT = Path(__file__).resolve().parents[1]
LOCAL_ORIGIN = re.compile(r"https?://(?:127\.0\.0\.1|localhost)(?::\d+)?")
SESSION_ID = re.compile(r"^[A-Za-z0-9_-]{20,80}$")


def allowed_origins() -> set[str]:
    return {value.strip() for value in os.environ.get("WINDUP_ALLOWED_ORIGINS", "").split(",") if value.strip()}


def create_handler(application: GenerationApplication, root: Path = ROOT):
    configured_origins = allowed_origins()

    class Handler(SimpleHTTPRequestHandler):
        server_version = "WindupGeneration/2.0"

        def __init__(self, *args, **kwargs):
            self._session_id = ""
            self._set_session_cookie = False
            super().__init__(*args, directory=str(root), **kwargs)

        def end_headers(self) -> None:
            if not urlparse(self.path).path.startswith("/api/"):
                self.send_header("Cache-Control", "no-store")
            super().end_headers()

        def origin_allowed(self, origin: str) -> bool:
            return origin in configured_origins if configured_origins else bool(LOCAL_ORIGIN.fullmatch(origin))

        def session_id(self) -> str:
            if self._session_id:
                return self._session_id
            cookie = SimpleCookie(self.headers.get("Cookie", ""))
            candidate = cookie.get("WINDUP_SESSION")
            value = candidate.value if candidate else ""
            if not SESSION_ID.fullmatch(value):
                value = application.sessions.create_id()
                self._set_session_cookie = True
            self._session_id = value
            application.session(value)
            return value

        def send_json(self, value: dict, status: int = 200) -> None:
            body = json.dumps(value, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            if self._set_session_cookie:
                self.send_header("Set-Cookie", f"WINDUP_SESSION={self._session_id}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=43200")
            origin = self.headers.get("Origin", "")
            if self.origin_allowed(origin):
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Access-Control-Allow-Credentials", "true")
                self.send_header("Vary", "Origin")
            self.end_headers()
            self.wfile.write(body)

        def do_OPTIONS(self):
            origin = self.headers.get("Origin", "")
            self.send_response(204)
            if self.origin_allowed(origin):
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Access-Control-Allow-Credentials", "true")
                self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Windup-Request")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.end_headers()

        def read_json(self) -> dict:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 1_000_000:
                raise ValueError("请求体不合法")
            value = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(value, dict):
                raise ValueError("请求体必须是对象")
            return value

        def do_GET(self):
            parsed = urlparse(self.path)
            path = parsed.path
            try:
                if path == "/api/health":
                    self.send_json(application.health(self.session_id()))
                    return
                if path == "/api/provider/models":
                    self.send_json(application.models(self.session_id()))
                    return
                if path == "/api/characters":
                    self.send_json(application.characters())
                    return
                if path == "/api/reviews":
                    query = parse_qs(parsed.query)
                    key = str(query.get("key", [""])[0])
                    length = int(query.get("length", ["0"])[0])
                    initial = str(query.get("initial", ["pending"])[0])
                    defaults_value = str(query.get("defaults", [""])[0])
                    defaults = defaults_value.split(",") if defaults_value else None
                    self.send_json(application.reviews.get(key, length, initial, defaults))
                    return
                match = re.fullmatch(r"/api/generations/([a-f0-9]{12})", path)
                if match:
                    job = application.jobs.get(match.group(1))
                    self.send_json(job or {"error": "任务不存在"}, 200 if job else 404)
                    return
            except (ValueError, json.JSONDecodeError) as error:
                self.send_json({"error": str(error)}, 400)
                return
            super().do_GET()

        def do_POST(self):
            path = urlparse(self.path).path
            try:
                if path == "/api/provider/session":
                    if self.headers.get("X-Windup-Request") != "studio":
                        self.send_json({"error": "非法请求"}, 403)
                        return
                    self.send_json(application.connect_provider(self.session_id(), self.read_json()))
                    return
                if path == "/api/characters/generations":
                    self.send_json(application.create_character_job(self.session_id(), self.read_json()), 202)
                    return
                if path == "/api/generations":
                    self.send_json(application.create_job(self.session_id(), self.read_json()), 202)
                    return
                if path == "/api/reviews":
                    payload = self.read_json()
                    record = application.reviews.update(
                        str(payload.get("key", "")),
                        int(payload.get("expectedVersion", -1)),
                        list(payload.get("reviews", [])),
                    )
                    self.send_json(record)
                    return
                match = re.fullmatch(r"/api/generations/([a-f0-9]{12})/promote", path)
                if match:
                    self.send_json(application.promote_job(match.group(1)))
                    return
                self.send_json({"error": "接口不存在"}, 404)
            except ReviewConflict as error:
                self.send_json({"error": str(error), "current": error.current}, 409)
            except provider.ProviderError as error:
                status = 401 if error.status in {401, 403} else 502
                self.send_json({"error": str(error), "upstreamStatus": error.status}, status)
            except (ValueError, json.JSONDecodeError, TypeError) as error:
                self.send_json({"error": str(error)}, 400)
            except Exception as error:
                self.send_json({"error": str(error)}, 500)

        def log_message(self, fmt, *args):
            print(f"[{self.log_date_time_string()}] {fmt % args}")

    return Handler


def main() -> None:
    parser = argparse.ArgumentParser(description="Windup generation backend and static server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=4174)
    parser.add_argument("--demo", action="store_true", help="Use existing frames without API cost")
    args = parser.parse_args()
    application = GenerationApplication(ROOT, demo=os.environ.get("WINDUP_DEMO") == "1" or args.demo)
    application.prepare()
    server = ThreadingHTTPServer((args.host, args.port), create_handler(application))
    print(f"Windup Asset Lab: http://{args.host}:{args.port}/asset-lab/")
    print(f"Generation provider: {'demo' if application.demo else 'session-isolated'}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
