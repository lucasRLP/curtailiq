"""Regression contract for first release without touching main."""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]

class FeatureRelease(unittest.TestCase):
    def test_only_main_and_explicit_delivery_branch_can_push_deploy(self):
        text = (ROOT / '.github/workflows/curtailai-deploy.yml').read_text()
        branches = re.search(r'branches:\s*\[([^\]]+)\]', text).group(1)
        self.assertEqual({s.strip() for s in branches.split(',')}, {'main', 'feat/curtailai-deploy'})
        condition = next(line for line in text.splitlines() if 'if: github.repository' in line)
        self.assertIn("github.event_name == 'push'", condition)
        self.assertIn("github.ref == 'refs/heads/feat/curtailai-deploy'", condition)
        self.assertIn("github.repository == 'lucasRLP/curtailiq'", condition)
        self.assertIn('environment: curtailai-demo', text)
        self.assertIn('needs: validate', text)

if __name__ == '__main__':
    unittest.main()
