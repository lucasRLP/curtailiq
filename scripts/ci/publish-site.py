import json
import subprocess
import sys
from pathlib import Path

outputs = {item['OutputKey']: item['OutputValue'] for item in json.loads(Path('release/outputs.json').read_text())}
for key in ('FunctionUrl', 'CloudFrontUrl', 'BucketName', 'DistributionId'):
    assert outputs.get(key), key

def aws(*args):
    return subprocess.check_output(['aws', *args], text=True)

bucket = 's3://' + outputs['BucketName'] + '/curtailai/'
aws('s3', 'sync', 'release/dist/', bucket, '--delete', '--exclude', 'index.html', '--cache-control', 'public,max-age=31536000,immutable')
aws('s3', 'cp', 'release/dist/index.html', bucket+'index.html', '--content-type', 'text/html; charset=utf-8', '--cache-control', 'no-cache,no-store,must-revalidate')
aws('s3', 'cp', 'release/revision.txt', bucket+'deploy-revision.txt', '--content-type', 'text/plain', '--cache-control', 'no-store')
result = json.loads(aws('cloudfront', 'create-invalidation', '--distribution-id', outputs['DistributionId'], '--paths', '/curtailai/*', '/api/*', '--output', 'json'))
aws('cloudfront', 'wait', 'invalidation-completed', '--distribution-id', outputs['DistributionId'], '--id', result['Invalidation']['Id'])
subprocess.run([sys.executable, 'scripts/ci/http-smoke.py', outputs['CloudFrontUrl'], outputs['FunctionUrl']], check=True)
print('Verified deployment:', Path('release/revision.txt').read_text().strip(), outputs['CloudFrontUrl'].rstrip('/')+'/curtailai/')
