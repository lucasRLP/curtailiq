#!/usr/bin/env bash
set -Eeuo pipefail
: "${GITHUB_SHA:=$(git rev-parse HEAD)}"
[[ "$GITHUB_SHA" =~ ^[0-9a-f]{40}$ ]]
mkdir -p release
# This entire script runs before requesting AWS credentials.
docker build --platform linux/amd64 --provenance=false -t "curtailai-ci:$GITHUB_SHA" -f backend/Dockerfile.lambda backend
size=$(docker image inspect "curtailai-ci:$GITHUB_SHA" --format '{{.Size}}')
[[ "$size" -lt 10000000000 ]]
printf '%s\n' "$size" > release/image-size.txt
MSYS_NO_PATHCONV=1 docker run --rm --platform linux/amd64 --network none -e PYTHONPATH=/var/task --entrypoint /var/lang/bin/python -v "$PWD/scripts/ci:/ci:ro" "curtailai-ci:$GITHUB_SHA" /ci/image-smoke.py
docker save "curtailai-ci:$GITHUB_SHA" -o release/image.tar
printf '%s\n' "$GITHUB_SHA" > release/revision.txt
