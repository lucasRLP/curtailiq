#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(git rev-parse --show-toplevel)"
BASE_SHA="${BASELINE_SHA:-f6972e0a5f6e59d433928e7c60ccfc7faa734306}"
EVIDENCE_ROOT="$ROOT/docs/fusion/evidence"
RUN_ID="${GITHUB_RUN_ID:-local}-$(date -u +%Y%m%dT%H%M%SZ)-$$"
OUT="$EVIDENCE_ROOT/ci-$RUN_ID"
BASE_WT="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/curtailiq-baseline-$RUN_ID"
mkdir -p "$OUT"

cleanup() {
  git -C "$ROOT" worktree remove --force "$BASE_WT" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if ! git -C "$ROOT" cat-file -e "$BASE_SHA^{commit}" 2>/dev/null; then
  printf 'Pinned baseline commit unavailable: %s\n' "$BASE_SHA" | tee "$OUT/preflight.log" >&2
  exit 2
fi
if [[ -f "$ROOT/backend/.env" || -f "$ROOT/.env" ]]; then
  echo 'Refusing CI test run: local .env exists in checkout.' | tee "$OUT/preflight.log" >&2
  exit 2
fi

git -C "$ROOT" worktree add --detach "$BASE_WT" "$BASE_SHA" >"$OUT/worktree.log" 2>&1
printf '%s\n' "$BASE_SHA" > "$OUT/baseline.sha"
printf '%s\n' "$(git -C "$ROOT" rev-parse HEAD)" > "$OUT/current.sha"

# One frozen export and one environment for BOTH source trees. No per-tree uv resolution.
(cd "$ROOT/backend" && uv export --frozen --no-dev --no-emit-project --format requirements-txt) > "$OUT/dependencies.txt"
uv venv --python 3.12 "$OUT/venv"
PYTHON="$OUT/venv/bin/python"
[[ -f "$PYTHON" ]] || PYTHON="$OUT/venv/Scripts/python.exe"
uv pip install --python "$PYTHON" --require-hashes -r "$OUT/dependencies.txt"
uv pip install --python "$PYTHON" 'pytest==8.4.1' 'httpx==0.28.1'
uv pip freeze --python "$PYTHON" > "$OUT/installed.txt"

run_suite() {
  local label="$1" cwd="$2" xml="$3"
  local log="$OUT/$label.stdout.log" err="$OUT/$label.stderr.log" rc
  rm -f "$xml"
  set +e
  (cd "$cwd" && DATA_BACKEND=mock PYTHONPATH="$cwd" "$PYTHON" -m pytest -q -ra --junitxml="$xml") >"$log" 2>"$err"
  rc=$?
  set -e
  printf '%s\n' "$rc" > "$OUT/$label.exit_code"
  if [[ ! -s "$xml" ]]; then
    printf '%s JUnit missing or empty (raw pytest exit %s)\n' "$label" "$rc" >&2
    return 2
  fi
  if [[ "$rc" -gt 1 ]]; then
    printf '%s pytest exited %s; collection/internal errors cannot be accepted\n' "$label" "$rc" >&2
    return 2
  fi
}

BASE_XML="$OUT/baseline.junit.xml"
CURRENT_XML="$OUT/current.junit.xml"
run_suite baseline "$BASE_WT/backend" "$BASE_XML"
python "$ROOT/scripts/ci/check-baseline.py" "$BASE_XML" > "$OUT/baseline-validation.log"
run_suite current "$ROOT/backend" "$CURRENT_XML"

set +e
python "$ROOT/docs/fusion/evidence/compare_exposure_r2.py" "$BASE_XML" "$CURRENT_XML" > "$OUT/comparison.json" 2> "$OUT/comparison.stderr.log"
COMPARE_RC=$?
set -e
printf '%s\n' "$COMPARE_RC" > "$OUT/comparison.exit_code"
[[ "$COMPARE_RC" -eq 0 ]] || exit "$COMPARE_RC"
python "$ROOT/docs/fusion/evidence/compare_exposure_r2.py" --wrapper-result "$(cat "$OUT/current.exit_code")" 1 "$COMPARE_RC"
