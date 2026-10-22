"""Validate freshly executed baseline rather than accepting arbitrary red suites."""
import sys
import xml.etree.ElementTree as ET
root = ET.parse(sys.argv[1]).getroot()
cases = list(root.iter('testcase'))
assert len(cases) == 146, f'Baseline drift: {len(cases)} cases, expected 146'
assert sum(case.find('failure') is not None for case in cases) == 17, 'Expected exactly 17 legacy failures'
assert not list(root.iter('error')), 'Baseline errors are not acceptable'
# Legacy skips are preserved by the comparator; only NEW skips fail its gate.
print('Fresh baseline: 146 cases; raw 17 failures, NOT green')
