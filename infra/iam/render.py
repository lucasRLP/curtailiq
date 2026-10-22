"""Offline renderer: no SDK, credentials, subprocesses or network calls."""
import argparse
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
FILES = ['github-trust.json', 'github-role-policy.json', 'bootstrap-policy.json', 'cloudformation-trust.json', 'cloudformation-execution-policy.json', 'permissions-boundary.json']

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--account-id', required=True)
    parser.add_argument('--region', required=True)
    parser.add_argument('--image-digest', required=True)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--dry-run', action='store_true')
    mode.add_argument('--output-dir', type=Path)
    args = parser.parse_args()
    for name, value, pattern in [('account-id', args.account_id, r'[0-9]{12}'), ('region', args.region, r'(us|eu|ap|sa|ca|me|af|il|mx)-(?:[a-z]+-)+[0-9]+'), ('image-digest', args.image_digest, r'sha256:[a-f0-9]{64}')]:
        if not re.fullmatch(pattern, value):
            parser.error('invalid ' + name)
    documents = {}
    for filename in FILES:
        text = (HERE / filename).read_text(encoding='utf-8')
        text = text.replace('${AWS_ACCOUNT_ID}', args.account_id).replace('${AWS_REGION}', args.region)
        if '${' in text:
            parser.error('unresolved placeholder in ' + filename)
        documents[filename] = json.loads(text)
    boundary = f'arn:aws:iam::{args.account_id}:policy/curtailai-demo-runtime-boundary'
    execution = f'arn:aws:iam::{args.account_id}:role/curtailai-cloudformation-execution'
    parameters = {'PermissionsBoundaryArn': boundary, 'ImageDigest': args.image_digest}
    bundle = {'account_id': args.account_id, 'region': args.region, 'roles': {'github': 'curtailai-github-deploy', 'execution': 'curtailai-cloudformation-execution'}, 'parameters': parameters, 'policies': documents,
              'cloudformation_command': ['aws', 'cloudformation', 'deploy', '--region', args.region, '--stack-name', 'curtailai-demo', '--template-file', 'infra/cdk.out/curtailai-demo.template.json', '--role-arn', execution, '--capabilities', 'CAPABILITY_NAMED_IAM', '--parameter-overrides', 'PermissionsBoundaryArn=' + boundary, 'ImageDigest=' + args.image_digest, '--no-execute-changeset']}
    if args.output_dir:
        output = args.output_dir.resolve()
        if output != HERE and HERE not in output.parents:
            parser.error('output-dir must be inside infra/iam (ownership guard)')
        if output == HERE:
            parser.error('output-dir cannot overwrite source templates')
        output.mkdir(parents=True, exist_ok=True)
        for filename, policy in documents.items():
            (output / filename).write_text(json.dumps(policy, indent=2) + '\n', encoding='utf-8')
        (output / 'deployment.json').write_text(json.dumps(bundle, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(bundle, indent=2))

if __name__ == '__main__':
    main()
