#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

node tools/generate-contract.mjs --check
node tools/check-boundaries.mjs
node --test tests/*.test.mjs
if command -v python3 >/dev/null 2>&1 && python3 --version >/dev/null 2>&1; then
  PYTHON=python3
else
  PYTHON=python
fi
"$PYTHON" -m unittest discover -s tests -p 'test_*.py'
"$PYTHON" -m py_compile server/app.py server/windup_pipeline/*.py

while IFS= read -r -d '' file; do
  node --check "$file"
done < <(find asset-lab tools -type f \( -name '*.js' -o -name '*.mjs' \) -print0)

git diff --check
