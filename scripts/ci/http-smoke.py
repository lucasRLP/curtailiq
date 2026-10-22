import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


def get(url, status=200, kind='application/json'):
    for attempt in range(12):
        try:
            try:
                response = urllib.request.urlopen(url, timeout=30)
            except urllib.error.HTTPError as error:
                response = error
            with response:
                body = response.read()
                assert response.status == status, (url, response.status)
                assert kind in response.headers.get('Content-Type', ''), (url, response.headers)
                return body
        except (AssertionError, OSError):
            if attempt == 11:
                raise
            time.sleep(10)


if __name__ == '__main__':
    base, function = (value.rstrip('/') for value in sys.argv[1:3])
    assert json.loads(get(function+'/health'))['status'] == 'ok'
    json.loads(get(base+'/api/build-info'))
    json.loads(get(base+'/api/ci-nonexistent', 404))  # Never accept HTML fallback for API errors.
    html = get(base+'/curtailai/', kind='text/html').decode()
    deep = get(base+'/curtailai/operacao', kind='text/html').decode()
    assert '/curtailai/assets/' in deep
    assets = re.findall(r'(?:src|href)=[\"\'](/curtailai/assets/[^\"\']+)', html)
    assert any(p.endswith('.js') for p in assets) and any(p.endswith('.css') for p in assets)
    for asset in assets:
        body = get(base+asset, kind='javascript' if asset.endswith('.js') else 'text/css')
        local = Path('release/dist')/asset.removeprefix('/curtailai/')
        assert body == local.read_bytes(), asset
    assert get(base+'/curtailai/deploy-revision.txt', kind='text/plain').decode().strip() == Path('release/revision.txt').read_text().strip()
    print('HTTP API, 404 JSON, HTML, deep link, assets and revision verified')
