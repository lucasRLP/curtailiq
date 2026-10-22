"""Fail closed until frontend owns the actual router basename and deployment base."""
from pathlib import Path
import re

root = Path(__file__).resolve().parents[2]
config = (root/'front/vite.config.ts').read_text(encoding='utf-8')
assert re.search(r'base\s*:\s*[\"\']/curtailai/[\"\']', config), 'BLOCKED: frontend Vite base /curtailai/ is not implemented; CLI override is not acceptance'
sources = '\n'.join(p.read_text(encoding='utf-8') for p in (root/'front/src').rglob('*.tsx'))
assert re.search(r'basename\s*[=:]\s*[\{]?\s*[\"\']/curtailai/?[\"\']', sources), 'BLOCKED: frontend router basename /curtailai/ is not implemented'
html = (root/'front/dist/index.html').read_text(encoding='utf-8')
assert re.search(r'/curtailai/assets/[^\"\']+\.js', html), 'missing JS assets'
assert re.search(r'/curtailai/assets/[^\"\']+\.css', html), 'missing CSS assets'
assert '"/api"' in (root/'front/src/lib/constants.ts').read_text(encoding='utf-8')
print('Frontend static contract accepted; browser acceptance still requires independent review')
