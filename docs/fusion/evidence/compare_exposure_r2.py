#!/usr/bin/env python
"""Strict JUnit baseline comparator; testcase IDs retain every repeated outcome."""
import json
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

SEVERITY = {"passed": 0, "skipped": 1, "failure": 2, "error": 3}


def parse_junit(path):
    path = Path(path)
    if not path.is_file() or path.stat().st_size == 0:
        raise ValueError(f"JUnit missing or empty: {path}")
    root = ET.parse(path).getroot()
    grouped = defaultdict(list)
    for c in root.iter("testcase"):
        ident = "::".join(x for x in (c.get("classname", ""), c.get("name", "")) if x)
        if not ident:
            raise ValueError("JUnit testcase has no identity")
        outcome = next((x for x in c if x.tag in ("failure", "error", "skipped")), None)
        state = outcome.tag if outcome is not None else "passed"
        if state == "failure" and ((outcome.get("type") or "").lower().find("xfail") >= 0 or "xfail" in (outcome.get("message") or "").lower()):
            state = "xfail"
        detail = "" if outcome is None else ((outcome.get("type") or "") + " " + (outcome.get("message") or "")).strip()
        grouped[ident].append((state, detail))
    if not grouped:
        raise ValueError("JUnit contains no testcase records")
    # Keep all executions: any adverse repeated outcome dominates a pass.
    return {key: sorted(values, key=lambda x: (-SEVERITY.get(x[0], 1), x[1])) for key, values in grouped.items()}


def compare_cases(before, after):
    missing = sorted(set(before) - set(after))
    added = sorted(set(after) - set(before))
    regressions, changed = [], []
    for ident in sorted(set(before) & set(after)):
        old, new = before[ident], after[ident]
        if old != new:
            # A previously passing case must remain exactly one passing execution.
            if all(s == "passed" for s, _ in old) and not (len(new) == 1 and new[0][0] == "passed"):
                regressions.append(ident)
            # Existing failures/skips are acceptable only byte-for-byte as an outcome multiset.
            elif any(s in ("failure", "error", "skipped", "xfail") for s, _ in old) and old != new:
                changed.append(ident)
            elif any(s in ("failure", "error", "skipped", "xfail") for s, _ in new):
                regressions.append(ident)
    new_failed = sorted(k for k in added if any(s in ("failure", "error") for s, _ in after[k]))
    new_skipped = sorted(k for k in added if any(s in ("skipped", "xfail") for s, _ in after[k]))
    errors = sorted(k for k, vals in after.items() if any(s == "error" for s, _ in vals))
    result = {"baseline_cases": len(before), "current_cases": len(after), "missing_legacy_ids": missing,
              "added_ids": added, "new_failed_ids": new_failed, "new_skipped_ids_not_coverage": new_skipped,
              "errors": errors, "regressed_state_ids": regressions, "changed_legacy_outcomes": changed,
              "legacy_failures_or_skips_identical_only": True}
    result["comparison_pass"] = not (missing or new_failed or new_skipped or errors or regressions or changed)
    return result


def compare_files(before, after):
    return compare_cases(parse_junit(before), parse_junit(after))


def wrapper_result(raw_exit, junit_valid, comparison_pass):
    return raw_exit in (0, 1) and junit_valid and comparison_pass


def main(argv):
    if len(argv) == 5 and argv[1] == "--wrapper-result":
        return 0 if wrapper_result(int(argv[2]), argv[3] == "1", argv[4] == "0") else 1
    try:
        result = compare_files(argv[1], argv[2])
    except (OSError, ET.ParseError, ValueError, IndexError) as exc:
        print(json.dumps({"comparison_pass": False, "error": str(exc)}, indent=2))
        return 1
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0 if result["comparison_pass"] else 1

if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
