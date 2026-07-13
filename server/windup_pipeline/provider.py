"""QnAIGC transport boundary.

This module owns authentication, retries and readable upstream errors. Pipeline
steps depend on this boundary instead of implementing HTTP behavior themselves.
"""

import json
import time
import urllib.error
import urllib.request

from . import config


class ProviderError(RuntimeError):
    """An upstream error safe to surface in the local studio UI."""

    def __init__(self, message, status=None):
        super().__init__(message)
        self.status = status


def require_key(api_key=None):
    key = api_key or config.API_KEY
    if not key:
        raise ProviderError("请先连接七牛云 API Key")
    return key


def _error_message(raw, fallback):
    try:
        data = json.loads(raw)
        error = data.get("error", data)
        if isinstance(error, dict):
            return str(error.get("message") or error.get("detail") or fallback)
        return str(error or fallback)
    except Exception:
        return fallback


def request_json(method, path, body=None, *, api_key=None, retries=3, timeout=180):
    """Call QnAIGC without hiding authentication, quota or model errors."""
    key = require_key(api_key)
    payload = None if body is None else json.dumps(body).encode("utf-8")
    last_error = None
    for attempt in range(retries):
        try:
            request = urllib.request.Request(
                config.API_BASE.rstrip("/") + path,
                data=payload,
                method=method,
                headers={
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json",
                },
            )
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            raw = error.read().decode("utf-8", errors="replace")
            last_error = ProviderError(_error_message(raw, f"七牛云返回 HTTP {error.code}"), error.code)
            if 400 <= error.code < 500:
                raise last_error
        except Exception as error:
            last_error = error
        if attempt + 1 < retries:
            time.sleep(1 + attempt * 2)
    if isinstance(last_error, ProviderError):
        raise last_error
    raise ProviderError(f"无法连接七牛云：{last_error}")


def verify_key(api_key):
    """Validate credentials with an invalid-model probe that creates no image."""
    try:
        request_json(
            "POST",
            "/chat/completions",
            {"model": "__windup_auth_probe__", "messages": []},
            api_key=api_key,
            retries=1,
            timeout=20,
        )
    except ProviderError as error:
        if error.status in {400, 404, 422}:
            return True
        raise
    return True


def list_models(api_key=None):
    result = request_json("GET", "/models", api_key=api_key, retries=2, timeout=20)
    return [str(item.get("id")) for item in result.get("data", []) if item.get("id")]


def post_json(path, body, retries=4, timeout=180):
    return request_json("POST", path, body, retries=retries, timeout=timeout)
