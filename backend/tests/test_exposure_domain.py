from datetime import datetime, timezone

import unittest
from pydantic import ValidationError

from app.domain.exposure import AssetExposure, ExposurePoint


def point(hour: int) -> ExposurePoint:
    return ExposurePoint(
        timestamp=datetime(2026, 1, 1, hour, tzinfo=timezone.utc),
        expected_generation_mwh=10,
        expected_curtailed_mwh=2,
        probability=0.4,
        evidence_status="demonstrative",
    )


class TestExposureDomain(unittest.TestCase):
    def test_exposure_requires_provenance_and_uses_explicit_units(self):
        exposure = AssetExposure(
            asset_id="CEG-001",
            source="public_demo",
            as_of=datetime(2026, 1, 1, tzinfo=timezone.utc),
            points=[point(1)],
        )
        self.assertEqual(exposure.points[0].expected_curtailed_mwh, 2)
        self.assertEqual(exposure.points[0].evidence_status, "demonstrative")

    def test_exposure_rejects_duplicate_or_unsorted_timestamps(self):
        with self.assertRaisesRegex(ValidationError, "unique and ascending"):
            AssetExposure(
                asset_id="CEG-001",
                source="public_demo",
                as_of=datetime(2026, 1, 1, tzinfo=timezone.utc),
                points=[point(2), point(1)],
            )

    def test_exposure_rejects_invalid_probability(self):
        with self.assertRaises(ValidationError):
            ExposurePoint(
                timestamp=datetime(2026, 1, 1, tzinfo=timezone.utc),
                expected_generation_mwh=10,
                expected_curtailed_mwh=2,
                probability=1.2,
                evidence_status="forecast",
            )


if __name__ == "__main__":
    unittest.main()
