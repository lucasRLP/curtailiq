#!/usr/bin/env bash
# Build the Python 3.11 Lambda payload from the committed uv lock, retaining all deps.
set -Eeuo pipefail
ROOT="$(git rev-parse --show-toplevel)"
BACKEND="$ROOT/backend"
BUNDLE="${1:-$ROOT/infra/lambda-bundle}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
[[ -f "$BACKEND/uv.lock" ]] || { echo 'backend/uv.lock missing' >&2; exit 2; }
[[ -f "$BACKEND/lambda_handler.py" && -d "$BACKEND/app" ]] || { echo 'backend entrypoint/app missing' >&2; exit 2; }
[[ -f "$BACKEND/models_ml/curtailment_model.pkl" ]] || { echo 'required model artifact missing' >&2; exit 2; }
[[ -d "$BACKEND/data/samples" ]] || { echo 'required demo samples missing' >&2; exit 2; }
python "$ROOT/scripts/ci/release_contract.py" --check-lock

uv export --directory "$BACKEND" --frozen --no-dev --format requirements-txt --output-file "$TMP/requirements.txt"
rm -rf "$BUNDLE"
mkdir -p "$BUNDLE"
uv pip install --target "$BUNDLE" --python-version 3.11 --python-platform x86_64-unknown-linux-gnu --only-binary=:all: --requirement "$TMP/requirements.txt"
cp -a "$BACKEND/app" "$BUNDLE/app"
cp -a "$BACKEND/lambda_handler.py" "$BUNDLE/lambda_handler.py"
mkdir -p "$BUNDLE/models_ml" "$BUNDLE/data"
cp "$BACKEND/models_ml/curtailment_model.pkl" "$BUNDLE/models_ml/"
cp -a "$BACKEND/data/samples" "$BUNDLE/data/samples"
for optional in operation_demo_run operation_demo_study; do
  if [[ -d "$BACKEND/data/$optional" ]]; then cp -a "$BACKEND/data/$optional" "$BUNDLE/data/$optional"; fi
done
find "$BUNDLE" -type d -name __pycache__ -prune -exec rm -rf {} +
find "$BUNDLE" -type f -name '*.pyc' -delete
python "$ROOT/scripts/ci/smoke_lambda_bundle.py" "$BUNDLE"
python - "$BUNDLE" <<'PY'
from pathlib import Path
import sys
root=Path(sys.argv[1])
required=(root/'lambda_handler.py', root/'app/main.py', root/'models_ml/curtailment_model.pkl', root/'data/samples/usinas.csv')
missing=[str(p) for p in required if not p.is_file()]
if missing: raise SystemExit(f'Lambda bundle incomplete: {missing}')
size=sum(p.stat().st_size for p in root.rglob('*') if p.is_file())
print(f'Linux x86_64 Python 3.11 bundle bytes: {size}')
print(f'Lambda uncompressed limit bytes: {250*1024*1024}')
if size > 250*1024*1024: raise SystemExit('Lambda uncompressed package exceeds AWS limit')
PY
