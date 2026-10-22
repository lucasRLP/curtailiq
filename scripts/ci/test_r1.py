import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]

class R1(unittest.TestCase):
    def test_release_scripts_exist(self):
        for name in ('image-smoke.py', 'build-image.sh', 'deploy-image.sh', 'http-smoke.py', 'frontend-gate.py'):
            self.assertTrue((ROOT/'scripts/ci'/name).is_file(), name)

    def test_workflow_no_zip_or_bootstrap(self):
        text = (ROOT/'.github/workflows/curtailai-deploy.yml').read_text()
        self.assertNotIn('build-lambda-bundle', text)
        self.assertNotIn('cdk deploy', text)
        self.assertIn('AWS_CFN_EXECUTION_ROLE_ARN', text)
        self.assertIn('needs: validate', text)

    def test_shared_regression_environment(self):
        text = (ROOT/'scripts/ci/backend-regression.sh').read_text()
        self.assertIn('uv export', text)
        self.assertNotIn('uv run --frozen --with pytest', text)

if __name__ == '__main__':
    unittest.main()
