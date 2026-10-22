from pathlib import Path
import json
import unittest

ROOT = Path(__file__).resolve().parents[2]

class DeployRequirements(unittest.TestCase):
    def test_smoke_explicitly_includes_lambda_task_root(self):
        text = (ROOT/'scripts/ci/build-image.sh').read_text()
        self.assertIn('-e PYTHONPATH=/var/task', text)

    def test_deploy_can_describe_only_project_ecr(self):
        data = json.loads((ROOT/'infra/iam/github-role-policy.json').read_text())
        matches = [s for s in data['Statement'] if 'ecr:DescribeRepositories' in ([s['Action']] if isinstance(s['Action'], str) else s['Action'])]
        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0]['Resource'], 'arn:aws:ecr:${AWS_REGION}:${AWS_ACCOUNT_ID}:repository/curtailai/backend')

if __name__ == '__main__':
    unittest.main()
