"""Offline contract/effective-allow regression tests; not an AWS IAM simulator."""
import fnmatch
import json
import subprocess
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ACCOUNT = '111122223333'  # synthetic fixture, never a deployment target
REGION = 'us-east-1'

def load(name):
    return json.loads((HERE / name).read_text(encoding='utf-8').replace('${AWS_ACCOUNT_ID}', ACCOUNT).replace('${AWS_REGION}', REGION))

def allowed(policy, action, resource, context=None):
    context = context or {}
    result = False
    for s in policy['Statement']:
        actions = s['Action'] if isinstance(s['Action'], list) else [s['Action']]
        resources = s.get('Resource', '*')
        resources = resources if isinstance(resources, list) else [resources]
        if not any(fnmatch.fnmatchcase(action.lower(), a.lower()) for a in actions):
            continue
        if not any(fnmatch.fnmatchcase(resource, r) for r in resources):
            continue
        matches = True
        for operator, pairs in s.get('Condition', {}).items():
            for key, value in pairs.items():
                if operator == 'StringEquals':
                    matches &= context.get(key) == value
                elif operator == 'ArnEquals':
                    matches &= context.get(key) == value
                elif operator == 'StringNotEquals':
                    matches &= context.get(key) != value
                else:
                    raise AssertionError('Unsupported test condition: ' + operator)
        if matches:
            if s['Effect'] == 'Deny':
                return False
            result = True
    return result

class OidcPolicyTests(unittest.TestCase):
    def test_exact_trust_and_negative_subjects(self):
        p = load('github-trust.json')
        s = p['Statement'][0]
        self.assertEqual(len(p['Statement']), 1)
        self.assertEqual(s['Principal'], {'Federated': f'arn:aws:iam::{ACCOUNT}:oidc-provider/token.actions.githubusercontent.com'})
        ctx = {'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com', 'token.actions.githubusercontent.com:sub': 'repo:lucasRLP/curtailiq:environment:curtailai-demo'}
        self.assertTrue(allowed(p, 'sts:AssumeRoleWithWebIdentity', '*', ctx))
        for key, bad in [('token.actions.githubusercontent.com:aud', 'other'), ('token.actions.githubusercontent.com:sub', 'repo:lucasRLP/curtailiq:ref:refs/heads/main'), ('token.actions.githubusercontent.com:sub', 'repo:attacker/curtailiq:environment:curtailai-demo')]:
            self.assertFalse(allowed(p, 'sts:AssumeRoleWithWebIdentity', '*', {**ctx, key: bad}))

    def test_direct_deploy_no_bootstrap(self):
        p = load('github-role-policy.json')
        text = json.dumps(p)
        self.assertNotIn('cdk-', text)
        self.assertNotIn('sts:AssumeRole', text)
        self.assertTrue(allowed(p, 'ecr:PutImage', f'arn:aws:ecr:{REGION}:{ACCOUNT}:repository/curtailai/backend'))
        self.assertFalse(allowed(p, 'ecr:PutImage', f'arn:aws:ecr:{REGION}:{ACCOUNT}:repository/other'))
        for stack, expected in [('curtailai-demo', True), ('other', False)]:
            self.assertEqual(allowed(p, 'cloudformation:CreateChangeSet', f'arn:aws:cloudformation:{REGION}:{ACCOUNT}:stack/{stack}/id', {'iam:PassedToService': 'cloudformation.amazonaws.com', 'cloudformation:RoleArn': f'arn:aws:iam::{ACCOUNT}:role/curtailai-cloudformation-execution'}), expected)
        self.assertEqual(load('bootstrap-policy.json'), p)

    def test_passrole_scope(self):
        for name, role, service in [('github-role-policy.json', 'curtailai-cloudformation-execution', 'cloudformation.amazonaws.com'), ('cloudformation-execution-policy.json', 'curtailai-demo-curtailai-demo-runtime', 'lambda.amazonaws.com')]:
            p = load(name)
            arn = f'arn:aws:iam::{ACCOUNT}:role/{role}'
            self.assertTrue(allowed(p, 'iam:PassRole', arn, {'iam:PassedToService': service}))
            self.assertFalse(allowed(p, 'iam:PassRole', arn, {'iam:PassedToService': 'ec2.amazonaws.com'}))
            self.assertFalse(allowed(p, 'iam:PassRole', f'arn:aws:iam::{ACCOUNT}:role/Admin', {'iam:PassedToService': service}))

    def test_runtime_boundary_and_no_escalation(self):
        p = load('cloudformation-execution-policy.json')
        role = f'arn:aws:iam::{ACCOUNT}:role/curtailai-demo-curtailai-demo-runtime'
        boundary = f'arn:aws:iam::{ACCOUNT}:policy/curtailai-demo-runtime-boundary'
        self.assertTrue(allowed(p, 'iam:CreateRole', role, {'iam:PermissionsBoundary': boundary}))
        for ctx in [{}, {'iam:PermissionsBoundary': 'arn:aws:iam::111122223333:policy/Admin'}]:
            self.assertFalse(allowed(p, 'iam:CreateRole', role, ctx))
        for action in ['iam:DeleteRolePermissionsBoundary', 'iam:PutRolePermissionsBoundary', 'iam:CreatePolicyVersion', 'iam:AttachRolePolicy']:
            self.assertFalse(allowed(p, action, role))
        boundary_policy = load('permissions-boundary.json')
        self.assertTrue(allowed(boundary_policy, 'logs:PutLogEvents', f'arn:aws:logs:{REGION}:{ACCOUNT}:log-group:/aws/lambda/curtailai-backend:log-stream:x'))
        for action in ['iam:PassRole', 'sts:AssumeRole', 'bedrock:InvokeModel', 's3:GetObject', 'ecr:PutImage']:
            self.assertFalse(allowed(boundary_policy, action, '*'))
        self.assertFalse(allowed(boundary_policy, 'logs:PutLogEvents', f'arn:aws:logs:{REGION}:{ACCOUNT}:log-group:/aws/lambda/other:log-stream:x'))

    def test_global_allowlist_and_no_action_wildcards(self):
        globals_ok = {'ecr:GetAuthorizationToken', 'cloudfront:CreateOriginAccessControl', 'logs:DescribeLogGroups'}
        for name in ['github-role-policy.json', 'bootstrap-policy.json', 'cloudformation-execution-policy.json', 'permissions-boundary.json']:
            for s in load(name)['Statement']:
                actions = s['Action'] if isinstance(s['Action'], list) else [s['Action']]
                self.assertTrue(all('*' not in a for a in actions), name)
                if s['Effect'] == 'Allow' and s['Resource'] == '*':
                    self.assertTrue(set(actions) <= globals_ok, name)

    def test_template_contract_and_log_discovery(self):
        template = json.loads((HERE.parent / 'cdk.out' / 'curtailai-demo.template.json').read_text(encoding='utf-8'))
        self.assertEqual(set(template['Parameters']), {'PermissionsBoundaryArn', 'ImageDigest'})
        role = next(r for r in template['Resources'].values() if r['Type'] == 'AWS::IAM::Role')
        self.assertEqual(role['Properties']['PermissionsBoundary'], {'Ref': 'PermissionsBoundaryArn'})
        self.assertTrue(allowed(load('cloudformation-execution-policy.json'), 'logs:DescribeLogGroups', '*'))

    def test_cfn_trust(self):
        self.assertTrue((HERE / 'cloudformation-trust.json').exists(), 'missing execution trust')
        p = load('cloudformation-trust.json')
        self.assertEqual(p['Statement'], [{'Effect': 'Allow', 'Principal': {'Service': 'cloudformation.amazonaws.com'}, 'Action': 'sts:AssumeRole'}])

    def test_renderer_dryrun_and_invalid_inputs(self):
        script = HERE / 'render.py'
        self.assertTrue(script.exists(), 'missing offline renderer')
        command = [sys.executable, str(script), '--account-id', ACCOUNT, '--region', REGION, '--image-digest', 'sha256:' + 'a' * 64, '--dry-run']
        run = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(run.returncode, 0, run.stderr)
        output = json.loads(run.stdout)
        self.assertIn('PermissionsBoundaryArn', output['parameters'])
        self.assertNotIn('${AWS_', run.stdout)
        for flag, value in [('--account-id', 'bad'), ('--region', '../bad'), ('--image-digest', 'latest')]:
            bad = command.copy()
            bad[bad.index(flag) + 1] = value
            self.assertNotEqual(subprocess.run(bad, capture_output=True).returncode, 0)

if __name__ == '__main__':
    unittest.main(verbosity=2)
