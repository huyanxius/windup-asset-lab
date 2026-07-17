#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

find_python() {
  local candidate
  for candidate in "${PYTHON:-}" python3 python; do
    [[ -n "$candidate" ]] || continue
    if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c 'import sys; raise SystemExit(sys.version_info < (3, 11))' 2>/dev/null; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  echo "Python 3.11+ is required." >&2
  return 1
}

PYTHON_BIN="$(find_python)"

node tools/generate-contract.mjs --check
node tools/check-boundaries.mjs
"$PYTHON_BIN" tools/check_python_orphans.py
"$PYTHON_BIN" -m pyright
node --test tests/*.test.mjs
"$PYTHON_BIN" -m unittest discover -s tests -p 'test_*.py'
"$PYTHON_BIN" -m py_compile server/app.py server/windup_pipeline/*.py

while IFS= read -r -d '' file; do
  node --check "$file"
done < <(find asset-lab tools -type f \( -name '*.js' -o -name '*.mjs' \) -print0)

git diff --check
