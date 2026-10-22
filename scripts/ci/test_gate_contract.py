"""Contract tests for the regression comparator used by Linux CI."""
import importlib.util
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COMPARATOR = ROOT / "docs/fusion/evidence/compare_exposure_r2.py"
SPEC = importlib.util.spec_from_file_location("comparator", COMPARATOR)
COMPARATOR_MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(COMPARATOR_MODULE)


class GateContract(unittest.TestCase):
    def test_validated_baseline_fixture_has_146_unique_cases_and_17_legacy_failures(self):
        baseline = ROOT / "docs/fusion/evidence/baseline-r2.junit.xml"
        parsed = COMPARATOR_MODULE.parse_junit(baseline)
        self.assertEqual(len(parsed), 146)
        self.assertEqual(sum(any(state == "failure" for state, _ in outcomes) for outcomes in parsed.values()), 17)

    def test_raw_pytest_exit_two_never_passes_even_with_valid_junit(self):
        result = subprocess.run([sys.executable, str(COMPARATOR), "--wrapper-result", "2", "1", "0"], check=False)
        self.assertNotEqual(result.returncode, 0)

    def test_missing_legacy_id_fails_comparison(self):
        before = {"legacy::one": [("passed", "")], "legacy::two": [("passed", "")]}
        after = {"legacy::one": [("passed", "")]}
        self.assertFalse(COMPARATOR_MODULE.compare_cases(before, after)["comparison_pass"])

    def test_new_skipped_case_fails_comparison(self):
        before = {"legacy::one": [("passed", "")]}
        after = {"legacy::one": [("passed", "")], "new::skip": [("skipped", "reason")]}
        result = COMPARATOR_MODULE.compare_cases(before, after)
        self.assertEqual(result["new_skipped_ids_not_coverage"], ["new::skip"])
        self.assertFalse(result["comparison_pass"])

    def test_comparator_rejects_absent_junit_file(self):
        with tempfile.TemporaryDirectory() as temp:
            result = subprocess.run([sys.executable, str(COMPARATOR), str(Path(temp)/"absent.xml"), str(Path(temp)/"absent2.xml")], capture_output=True)
        self.assertNotEqual(result.returncode, 0)


if __name__ == "__main__":
    unittest.main()
