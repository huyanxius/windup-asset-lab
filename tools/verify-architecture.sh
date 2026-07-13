#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

node tools/generate-contract.mjs --check
node --test tests/*.test.mjs
python3 -m unittest discover -s tests -p 'test_*.py'
python3 -m py_compile server/app.py server/windup_pipeline/*.py

while IFS= read -r -d '' file; do
  node --check "$file"
done < <(find asset-lab tools -type f \( -name '*.js' -o -name '*.mjs' \) -print0)

git diff --check
