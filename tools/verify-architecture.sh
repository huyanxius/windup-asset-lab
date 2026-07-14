#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

select_python() {
  local candidate
  for candidate in python3 python; do
    if command -v "$candidate" >/dev/null 2>&1 \
      && "$candidate" -c 'import sys; raise SystemExit(sys.version_info.major != 3)' >/dev/null 2>&1; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  printf 'Python 3 is required but neither python3 nor python is usable.\n' >&2
  return 1
}

PYTHON="$(select_python)"

node tools/generate-contract.mjs --check
node tools/check-boundaries.mjs
node --test tests/*.test.mjs
"$PYTHON" -m unittest discover -s tests -p 'test_*.py'
"$PYTHON" -m py_compile server/app.py server/windup_pipeline/*.py

while IFS= read -r -d '' file; do
  node --check "$file"
done < <(find asset-lab tools -type f \( -name '*.js' -o -name '*.mjs' \) -print0)

git diff --check
