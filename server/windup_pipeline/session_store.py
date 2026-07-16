"""Process-local provider sessions with isolated, non-persistent credentials."""

from __future__ import annotations

import secrets
import threading
from dataclasses import dataclass


@dataclass(frozen=True)
class ProviderSession:
    api_key: str = ""
    model: str = ""
    verified: bool = False
    error: str = ""

    def public(self) -> dict:
        return {
            "configured": bool(self.api_key),
            "verified": self.verified,
            "providerError": self.error,
            "model": self.model,
        }


class ProviderSessionStore:
    """Keeps API keys out of config globals, job JSON and disk storage."""

    def __init__(self, default_key: str = "", default_model: str = "", default_verified: bool = False):
        self.default_key = default_key
        self.default_model = default_model
        self.default_verified = default_verified
        self._lock = threading.Lock()
        self._sessions: dict[str, ProviderSession] = {}

    def create_id(self) -> str:
        return secrets.token_urlsafe(24)

    def get_or_create(self, session_id: str) -> ProviderSession:
        with self._lock:
            if session_id not in self._sessions:
                self._sessions[session_id] = ProviderSession(
                    api_key=self.default_key,
                    model=self.default_model,
                    verified=self.default_verified,
                )
            return self._sessions[session_id]

    def connect(self, session_id: str, api_key: str, model: str) -> ProviderSession:
        session = ProviderSession(api_key=api_key, model=model, verified=True)
        with self._lock:
            self._sessions[session_id] = session
        return session

    def fail(self, session_id: str, error: str) -> ProviderSession:
        with self._lock:
            previous = self._sessions.get(session_id, ProviderSession(model=self.default_model))
            session = ProviderSession(
                api_key="",
                model=previous.model or self.default_model,
                verified=False,
                error=error,
            )
            self._sessions[session_id] = session
            return session
