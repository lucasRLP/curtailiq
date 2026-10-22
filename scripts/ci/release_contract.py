#!/usr/bin/env python3
"""Fail-closed contracts for reproducible Linux Lambda release inputs."""
import argparse
import re
import sys
import tomllib
from pathlib import Path


def normalized(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def missing_locked_lambda_dependencies(requirements: Path, lockfile: Path) -> list[str]:
    requested = set()
    for line in requirements.read_text(encoding="utf-8").splitlines():
        line = line.split("#", 1)[0].strip()
        if not line or line.startswith(("-", "--")):
            continue
        match = re.match(r"([A-Za-z0-9_.-]+)", line)
        if match:
            requested.add(normalized(match.group(1)))
    lock = tomllib.loads(lockfile.read_text(encoding="utf-8"))
    locked = {normalized(item["name"]) for item in lock.get("package", [])}
    return sorted(requested - locked)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check-lock", action="store_true")
    args = parser.parse_args()
    if args.check_lock:
        root = Path(__file__).resolve().parents[2]
        missing = missing_locked_lambda_dependencies(root / "backend/requirements-lambda.txt", root / "backend/uv.lock")
        if missing:
            print("Lambda dependencies absent from backend/uv.lock: " + ", ".join(missing), file=sys.stderr)
            print("Release blocked: reconcile the approved manifest and lockfile before bundling.", file=sys.stderr)
            return 2
        print("All Lambda runtime requirements are present in backend/uv.lock")
        return 0
    parser.error("select --check-lock")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
