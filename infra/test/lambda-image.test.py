"""Offline packaging contracts; no Docker/cloud/credentials required."""
import ast
import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
BACKEND = ROOT / 'backend'

class ImageContract(unittest.TestCase):
    def test_al2023_and_hash_only_binary_install(self):
        docker = (BACKEND / 'Dockerfile.lambda').read_text()
        self.assertIn('FROM public.ecr.aws/lambda/python:3.12', docker)
        self.assertIn('--require-hashes', docker)
        self.assertIn('--only-binary=:all:', docker)
        self.assertIn('lambda_handler.handler', docker)

    def test_effective_dockerfile_specific_ignore_is_allowlist(self):
        path = BACKEND / 'Dockerfile.lambda.dockerignore'
        self.assertTrue(path.is_file(), 'Docker-specific ignore file missing')
        ignore = path.read_text().splitlines()
        self.assertEqual(ignore[0], '**')
        for item in ['!app/**', '!data/**', '!lambda_handler.py', '!requirements-lambda-image.txt']:
            self.assertIn(item, ignore)
        for item in ['**/.env*', '**/secrets/**', '**/*.ipynb', '**/tests/**', '**/__pycache__/**', '**/.git/**']:
            self.assertIn(item, ignore)

    def test_lock_targets_python312_and_all_dependencies_hashed(self):
        text = (BACKEND / 'requirements-lambda-image.txt').read_text()
        self.assertIn('--python-version 3.12', text)
        self.assertIn('--python-platform x86_64-manylinux_2_28', text)
        requirements = re.findall(r'^([a-zA-Z0-9_.-]+)==([^\n]+)((?:\n[ \t]+[^\n]+)*)', text, re.M)
        packages = {name.lower() for name, _, _ in requirements}
        for package in ['mangum', 'scipy', 'scikit-learn', 'pandas', 'sqlalchemy', 'psycopg-binary', 'python-docx', 'reportlab', 'anthropic']:
            self.assertIn(package, packages)
        for name, version, continuation in requirements:
            self.assertIn('--hash=sha256:', continuation, name)

    def test_docker_model_mode_is_accepted_and_pickle_disabled(self):
        docker = (BACKEND / 'Dockerfile.lambda').read_text()
        mode = re.search(r'CURTAILMENT_MODEL_MODE=(\w+)', docker).group(1)
        config = ast.parse((BACKEND / 'app/config.py').read_text())
        validator = next(n for n in ast.walk(config) if isinstance(n, ast.FunctionDef) and n.name == 'validate_curtailment_model_mode')
        allowed = next(n for n in ast.walk(validator) if isinstance(n, ast.Set))
        self.assertIn(mode, ast.literal_eval(allowed))
        self.assertIn('CURTAILMENT_MODEL_PATH=/opt/curtailai-demo-disabled/base.pkl', docker)
        self.assertIn('CURTAILMENT_MODEL_ADVANCED_PATH=/opt/curtailai-demo-disabled/advanced.pkl', docker)

if __name__ == '__main__':
    unittest.main(verbosity=2)
