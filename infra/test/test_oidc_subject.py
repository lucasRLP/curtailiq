"""Contrato local da trust OIDC do GitHub Actions, sem acesso a AWS."""

import json
from pathlib import Path
import unittest


TRUST_PATH = Path(__file__).resolve().parents[1] / "iam" / "github-trust.json"


class GitHubOidcTrustTest(unittest.TestCase):
    def test_exact_immutable_subject_and_audience(self):
        trust = json.loads(TRUST_PATH.read_text(encoding="utf-8"))
        self.assertEqual(len(trust["Statement"]), 1)
        statement = trust["Statement"][0]
        self.assertEqual(statement["Effect"], "Allow")
        self.assertEqual(statement["Action"], "sts:AssumeRoleWithWebIdentity")
        self.assertEqual(
            statement["Condition"],
            {
                "StringEquals": {
                    "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
                    "token.actions.githubusercontent.com:sub": (
                        "repo:lucasRLP@170772538/curtailiq@1389062638"
                        ":environment:curtailai-demo"
                    ),
                }
            },
        )


if __name__ == "__main__":
    unittest.main()
