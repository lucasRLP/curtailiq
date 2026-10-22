"""Local pitch smoke against the real packaged historical snapshot."""
import os
import time

os.environ['DATA_BACKEND'] = 'mock'
os.environ['MOCK_DATA_DIR'] = 'data/local_demo'
from fastapi.testclient import TestClient
from app.main import app

with TestClient(app) as client:
    for attempt in range(2):
        started = time.perf_counter()
        response = client.get('/api/usinas')
        elapsed = time.perf_counter() - started
        assert response.status_code == 200, response.text
        payload = response.json()
        assert payload['total_count'] == 10, payload
        assert len(payload['items']) == 10
        assert all(item['latitude'] is not None and item['longitude'] is not None for item in payload['items'])
        assert 'max-age=60' in response.headers['cache-control']
        print('catalog', attempt, 'seconds', round(elapsed, 4), 'count', payload['total_count'])
    for attempt in range(2):
        started = time.perf_counter()
        response = client.get('/api/usinas/1/perda?inicio=2026-06-01&fim=2026-07-08&limit=10')
        assert response.status_code == 200, response.text[:1000]
        print('finance', attempt, 'seconds', round(time.perf_counter() - started, 4))
    response = client.get('/api/cache/status')
    assert response.headers['cache-control'] == 'no-store'
    status = response.json()
    print('cache', status)
    assert status['cache_enabled']
    assert any(value.get('hits', 0) > 0 for value in status['caches'].values()), status
