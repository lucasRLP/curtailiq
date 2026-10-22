"""Synthetic XML fixtures for regression-gate behavior; never suite output."""
import importlib.util
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("gate", HERE / "compare_exposure_r2.py")
GATE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(GATE)
COMPARATOR = HERE / "compare_exposure_r2.py"


def xml(*cases):
    return "<testsuites><testsuite>" + "".join(cases) + "</testsuite></testsuites>"


def case(name, outcome="", detail=""):
    child = f'<{outcome} type="{detail}" message="{detail}"/>' if outcome else ""
    return f'<testcase classname="legacy" name="{name}">{child}</testcase>'


class GateFixtures(unittest.TestCase):
    def compare(self, before, after):
        with tempfile.TemporaryDirectory() as tmp:
            a, b = Path(tmp) / "a.xml", Path(tmp) / "b.xml"
            a.write_text(before, encoding="utf-8"); b.write_text(after, encoding="utf-8")
            return subprocess.run([sys.executable, str(COMPARATOR), str(a), str(b)], capture_output=True, text=True)

    def test_known_baseline_unchanged_passes(self):
        self.assertEqual(self.compare(xml(case("ok")), xml(case("ok"))).returncode, 0)

    def test_passed_to_skipped_or_xfailed_fails(self):
        for status in ("skipped", "failure"):
            with self.subTest(status=status):
                self.assertNotEqual(self.compare(xml(case("ok")), xml(case("ok", status, "xfail"))).returncode, 0)

    def test_removed_legacy_case_fails(self):
        self.assertNotEqual(self.compare(xml(case("ok")), xml()).returncode, 0)

    def test_new_failure_fails(self):
        self.assertNotEqual(self.compare(xml(case("ok")), xml(case("ok"), case("new", "failure", "AssertionError"))).returncode, 0)

    def test_legacy_failure_type_or_message_change_fails(self):
        self.assertNotEqual(self.compare(xml(case("bad", "failure", "ValueError")), xml(case("bad", "failure", "TypeError"))).returncode, 0)

    def test_new_skipped_does_not_count_as_coverage(self):
        result = self.compare(xml(case("ok")), xml(case("ok"), case("extra", "skipped", "reason")))
        self.assertNotEqual(result.returncode, 0)

    def test_new_error_fails(self):
        self.assertNotEqual(self.compare(xml(case("ok")), xml(case("ok"), case("new", "error", "ImportError"))).returncode, 0)

    def test_duplicate_id_cannot_hide_failure(self):
        self.assertNotEqual(self.compare(xml(case("ok")), xml(case("ok", "failure", "AssertionError"), case("ok"))).returncode, 0)

    def test_empty_xml_fails(self):
        result = self.compare("", xml(case("ok")))
        self.assertNotEqual(result.returncode, 0)

    def test_pytest_exit_two_rejects_stale_xml_and_raw_one_can_pass_gate(self):
        with tempfile.TemporaryDirectory() as tmp:
            stale_xml = Path(tmp) / "stale-from-prior-run.xml"
            stale_xml.write_text(xml(case("ok")), encoding="utf-8")
            # Exercise the same production helper CLI invoked by the shell wrapper.
            def wrapper(raw, fresh_xml_valid, comparison_exit):
                return subprocess.run([sys.executable, str(COMPARATOR), "--wrapper-result", str(raw), str(int(fresh_xml_valid)), str(comparison_exit)], capture_output=True)
            self.assertNotEqual(wrapper(2, False, 1).returncode, 0)
            self.assertNotEqual(wrapper(2, True, 0).returncode, 0)
            self.assertEqual(wrapper(1, True, 0).returncode, 0)
            self.assertTrue(stale_xml.exists())  # stale evidence remains present but cannot authorize exit 2


if __name__ == "__main__": unittest.main()
