#!/usr/bin/env python3
"""Invoke the packaged Lambda handler directly on Linux; never calls AWS."""
import json
import os
import sys
from pathlib import Path


def request(path: str, method: str = "GET") -> dict:
    return {
        "version": "2.0",
        "routeKey": f"{method} {path}",
        "rawPath": path,
        "rawQueryString": "",
        "headers": {"host": "localhost", "x-forwarded-proto": "https", "x-forwarded-port": "443"},
        "requestContext": {
            "accountId": "ci", "apiId": "ci", "domainName": "localhost", "domainPrefix": "ci",
            "http": {"method": method, "path": path, "protocol": "HTTP/1.1", "sourceIp": "127.0.0.1", "userAgent": "ci-smoke"},
            "requestId": "ci-smoke", "routeKey": f"{method} {path}", "stage": "$default",
            "time": "21/Oct/2026:00:00:00 +0000", "timeEpoch": 1792540800000,
        },
        "isBase64Encoded": False,
    }


class Context:
    function_name = "curtailiq-ci-smoke"
    memory_limit_in_mb = "1024"
    invoked_function_arn = "arn:aws:lambda:us-east-1:000000000000:function:ci"
    aws_request_id = "ci-smoke"

    def get_remaining_time_in_millis(self) -> int:
        return 60_000


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: smoke_lambda_bundle.py <bundle-dir>", file=sys.stderr)
        return 2
    bundle = Path(sys.argv[1]).resolve()
    if not (bundle / "lambda_handler.py").is_file():
        print(f"Lambda handler missing from bundle: {bundle}", file=sys.stderr)
        return 2
    sys.path.insert(0, str(bundle))
    os.environ.update({"DATA_BACKEND": "mock", "BEDROCK_ENABLED": "false", "CURTAILMENT_MODEL_MODE": "base"})
    try:
        from lambda_handler import handler
        checks = (("/health", 200), ("/api/unknown-ci-smoke-path", 404))
        for path, expected in checks:
            response = handler(request(path), Context())
            status = response.get("statusCode")
            headers = {str(k).lower(): str(v).lower() for k, v in response.get("headers", {}).items()}
            body = response.get("body", "")
            if status != expected:
                raise AssertionError(f"{path}: expected status {expected}, got {status}")
            if "application/json" not in headers.get("content-type", ""):
                raise AssertionError(f"{path}: response is not JSON: {headers.get('content-type')}")
            decoded = json.loads(body)
            if path == "/health" and decoded.get("status") != "ok":
                raise AssertionError(f"unexpected health payload: {decoded!r}")
            if "<html" in body.lower():
                raise AssertionError(f"{path}: API error incorrectly returned SPA HTML")
            print(f"PASS {path} status={status} content-type={headers.get('content-type')}")
    except Exception as exc:
        print(f"FAIL packaged Lambda smoke: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
