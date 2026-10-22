"""Executed inside the actual Linux image, with network disabled."""
import importlib
import json
from types import SimpleNamespace

for module in ('numpy', 'pandas', 'scipy', 'sklearn', 'psycopg', 'sqlalchemy', 'mangum', 'anthropic', 'docx', 'reportlab', 'redshift_connector'):
    importlib.import_module(module)
from lambda_handler import handler
context = SimpleNamespace(aws_request_id='ci-smoke', function_name='ci-smoke', memory_limit_in_mb=2048, invoked_function_arn='local')
for path, expected in (('/health', 200), ('/api/build-info', 200), ('/api/usinas', 200), ('/api/ci-nonexistent', 404)):
    event = {'version': '2.0', 'routeKey': '$default', 'rawPath': path, 'rawQueryString': '', 'headers': {'host': 'localhost'}, 'requestContext': {'http': {'method': 'GET', 'path': path, 'sourceIp': '127.0.0.1', 'protocol': 'HTTP/1.1'}, 'requestId': 'ci'}, 'isBase64Encoded': False}
    response = handler(event, context)
    assert response['statusCode'] == expected, response
    assert 'application/json' in response['headers'].get('content-type', ''), response
    body = json.loads(response['body'])
    if path == '/health':
        assert body['status'] == 'ok'
    if path == '/api/usinas':
        assert body['total_count'] == 10, body
        assert all(p['latitude'] is not None and p['longitude'] is not None for p in body['items'])
        assert 'max-age=60' in response['headers'].get('cache-control', '')
    print(path, response['statusCode'])
