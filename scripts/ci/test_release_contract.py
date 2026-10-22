import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CHECK = ROOT / "scripts/ci/release_contract.py"


class LambdaDependencyContract(unittest.TestCase):
    def test_unlocked_lambda_runtime_dependency_blocks_package_build(self):
        result = subprocess.run(
            [sys.executable, str(CHECK), "--check-lock"], cwd=ROOT,
            capture_output=True, text=True, check=False,
        )
        self.assertEqual(result.returncode, 2)
        self.assertIn("mangum", result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
