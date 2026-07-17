#!/usr/bin/env bash

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

STUDIO_URL="http://127.0.0.1:5174/asset-lab/"
API_URL="http://127.0.0.1:5174/api/characters"
COCOS_URL="http://127.0.0.1:5173/"
LOG_DIR="${TMPDIR:-/tmp}/windup-asset-lab"
STUDIO_LOG="$LOG_DIR/studio-api.log"
COCOS_LOG="$LOG_DIR/cocos-runtime.log"
PYTHON_CMD=""
CHILD_PIDS=""

printf '%s\n' "========================================"
printf '%s\n' "  Windup Asset Lab - macOS Launcher"
printf '%s\n\n' "========================================"

for candidate in python3 python; do
  if command -v "$candidate" >/dev/null 2>&1 \
    && "$candidate" -c "import sys; assert sys.version_info >= (3, 11)" >/dev/null 2>&1; then
    PYTHON_CMD="$candidate"
    break
  fi
done

if [[ -z "$PYTHON_CMD" ]]; then
  printf '%s\n' "[ERROR] Python 3.11 or newer was not found."
  printf '%s\n' "Install it with Homebrew: brew install python@3.11"
  printf '%s\n' "Then double-click start.command again."
  read -r -p "Press Return to close..."
  exit 1
fi

if ! "$PYTHON_CMD" -c "from PIL import Image" >/dev/null 2>&1; then
  printf '%s\n' "[ERROR] Pillow is not installed for $PYTHON_CMD."
  printf '%s\n' "Run: $PYTHON_CMD -m pip install -r server/requirements.txt"
  read -r -p "Press Return to close..."
  exit 1
fi

mkdir -p "$LOG_DIR"

api_ready() {
  "$PYTHON_CMD" -c "import json, urllib.request; payload=json.load(urllib.request.urlopen('http://127.0.0.1:5174/api/characters', timeout=1)); assert isinstance(payload.get('characters'), list)" >/dev/null 2>&1
}

cocos_ready() {
  "$PYTHON_CMD" -c "import urllib.request; response=urllib.request.urlopen('http://127.0.0.1:5173/', timeout=1); assert response.status == 200" >/dev/null 2>&1
}

cleanup() {
  status=$?
  trap - EXIT INT TERM HUP
  if [[ -n "$CHILD_PIDS" ]]; then
    printf '\n%s\n' "Stopping Windup services..."
    for pid in $CHILD_PIDS; do
      kill "$pid" >/dev/null 2>&1 || true
    done
    for pid in $CHILD_PIDS; do
      wait "$pid" >/dev/null 2>&1 || true
    done
  fi
  exit "$status"
}

trap cleanup EXIT INT TERM HUP

if api_ready; then
  printf '%s\n' "[1/2] Studio API is already running on port 5174."
else
  printf '%s\n' "[1/2] Starting API-backed studio on $STUDIO_URL ..."
  "$PYTHON_CMD" -m server.app --demo --port 5174 >"$STUDIO_LOG" 2>&1 &
  CHILD_PIDS="$CHILD_PIDS $!"
fi

if cocos_ready; then
  printf '%s\n' "[2/2] Cocos runtime is already running on port 5173."
else
  printf '%s\n' "[2/2] Starting Cocos runtime on $COCOS_URL ..."
  "$PYTHON_CMD" -m http.server 5173 --bind 127.0.0.1 --directory build/lamplighter-mvp >"$COCOS_LOG" 2>&1 &
  CHILD_PIDS="$CHILD_PIDS $!"
fi

printf '\n%s\n' "Waiting for the project asset API and Cocos runtime..."
ready=0
for ((attempt = 1; attempt <= 20; attempt += 1)); do
  if api_ready && cocos_ready; then
    ready=1
    break
  fi
  sleep 1
done

if [[ "$ready" -ne 1 ]]; then
  printf '\n%s\n' "[ERROR] Windup did not become ready."
  if [[ -f "$STUDIO_LOG" ]]; then
    printf '%s\n' "--- Studio API log ---"
    tail -n 30 "$STUDIO_LOG"
  fi
  if [[ -f "$COCOS_LOG" ]]; then
    printf '%s\n' "--- Cocos runtime log ---"
    tail -n 30 "$COCOS_LOG"
  fi
  read -r -p "Press Return to close..."
  exit 1
fi

printf '%s\n' "[OK] Project asset API and Cocos runtime are ready."
printf '%s\n' "Opening $STUDIO_URL ..."
open "http://127.0.0.1:5174/asset-lab/" || true

printf '\n%s\n' "========================================"
printf '%s\n' "  Asset Lab : $STUDIO_URL"
printf '%s\n' "  Game Build: $COCOS_URL"
printf '%s\n' "========================================"

if [[ -z "$CHILD_PIDS" ]]; then
  printf '\n%s\n' "Both services were already running. This launcher can close safely."
  read -r -p "Press Return to close..."
  exit 0
fi

printf '\n%s\n' "Services are running. Press Control-C to stop them and close this window."
while true; do
  for pid in $CHILD_PIDS; do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      printf '%s\n' "[ERROR] A Windup service stopped unexpectedly."
      printf '%s\n' "Logs: $LOG_DIR"
      exit 1
    fi
  done
  sleep 2
done
