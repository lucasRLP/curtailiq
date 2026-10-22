"""Offline workflow and baseline contracts; no cloud calls."""
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import yaml

root = Path(__file__).resolve().parents[2]
for name in ('curtailai-ci.yml', 'curtailai-deploy.yml'):
    data = yaml.safe_load((root/'.github/workflows'/name).read_text())
    assert data['concurrency']['cancel-in-progress'] is False
    assert data['permissions'] == {'contents': 'read'}
    assert 'pull_request_target' not in data.get('on', data.get(True, {}))
    for job_name, job in data['jobs'].items():
        if job.get('permissions', {}).get('id-token'):
            assert name == 'curtailai-deploy.yml' and job_name == 'deploy'
            assert job['environment'] == 'curtailai-demo'
            assert job['needs'] == 'validate'
        for step in job.get('steps', []):
            assert 'continue-on-error' not in step
    print('YAML/security contract:', name, 'OK')
