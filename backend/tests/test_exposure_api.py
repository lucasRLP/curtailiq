from datetime import datetime, timezone
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app


class ExposureApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_observed_without_curated_provider_is_unavailable_not_demo(self):
        response = self.client.get(
            "/api/v1/exposure/plant/USI_NE_001/series?mode=observed"
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["mode"], "observed")
        self.assertEqual(payload["quality"]["status"], "unavailable")
        self.assertEqual(payload["points"], [])
        self.assertNotEqual(payload["source"]["name"], "local_fixture")

    def test_demo_series_is_explicitly_labeled_and_uses_utc_intervals(self):
        response = self.client.get(
            "/api/v1/exposure/plant/USI_NE_001/series?mode=demo&start=2026-05-01T00:00:00Z&end=2026-05-03T00:00:00Z"
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["schema_version"], "exposure.v1")
        self.assertEqual(payload["mode"], "demo")
        self.assertEqual(payload["source"]["name"], "local_fixture")
        self.assertIn("DEMONSTRACAO", " ".join(payload["quality"]["limitations"]))
        for point in payload["points"]:
            self.assertTrue(point["interval_start"].endswith("Z"))
            self.assertEqual(point["duration_h"], 1.0)
            self.assertEqual(point["evidence_kind"], "scenario")

    def test_unknown_entity_in_observed_mode_is_unavailable_without_claiming_empty(self):
        response = self.client.get("/api/v1/exposure/plant/NOT_A_REAL_ID/series?mode=observed")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["quality"]["status"], "unavailable")
        self.assertEqual(response.json()["source"]["name"], "not_configured")

    def test_invalid_id_and_naive_timezone_are_rejected(self):
        self.assertEqual(self.client.get("/api/v1/exposure/plant/../series").status_code, 404)
        response = self.client.get(
            "/api/v1/exposure/plant/USI_NE_001/series?start=2026-05-01T00:00:00&end=2026-05-02T00:00:00"
        )
        self.assertEqual(response.status_code, 422)

    def test_invalid_range_and_pagination_limits_are_rejected(self):
        bad_range = self.client.get(
            "/api/v1/exposure/plant/USI_NE_001/series?start=2026-05-03T00:00:00Z&end=2026-05-01T00:00:00Z"
        )
        bad_limit = self.client.get("/api/v1/exposure/entities?limit=1001")
        self.assertEqual(bad_range.status_code, 422)
        self.assertEqual(bad_limit.status_code, 422)

    def test_entity_catalog_defaults_to_northeast_and_has_stable_pagination(self):
        response = self.client.get("/api/v1/exposure/entities?mode=demo&limit=1&offset=0")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["metadata"]["mvp_scope"], "geradoras_renovaveis_submercado_ne")
        self.assertGreaterEqual(payload["pagination"]["total_count"], len(payload["items"]))
        self.assertLessEqual(len(payload["items"]), 1)

    def test_demo_is_fixture_only_when_configured_backend_is_postgres(self):
        from app.deps import get_repo

        class PostgresRepoSpy:
            calls = []

            def get_usina(self, *_args, **_kwargs):
                self.calls.append("get_usina")
                raise AssertionError("postgres get_usina accessed")

            def get_constrained_off(self, *_args, **_kwargs):
                self.calls.append("get_constrained_off")
                raise AssertionError("postgres get_constrained_off accessed")

        postgres_repo = PostgresRepoSpy()
        app.dependency_overrides[get_repo] = lambda: postgres_repo
        try:
            with patch.dict("os.environ", {"DATA_BACKEND": "postgres"}):
                response = self.client.get(
                    "/api/v1/exposure/plant/USI_NE_001/series?mode=demo&start=2026-05-01T00:00:00Z&end=2026-05-03T00:00:00Z"
                )
        finally:
            app.dependency_overrides.pop(get_repo, None)
        self.assertEqual(postgres_repo.calls, [])
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["source"]["name"], "local_fixture")
        self.assertTrue(response.json()["points"])

    def test_observed_entities_report_unavailable_capability(self):
        response = self.client.get("/api/v1/exposure/entities?mode=observed")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["availability"]["status"], "unavailable")
        self.assertEqual(payload["items"], [])
        self.assertEqual(payload["capabilities"]["observed"], "unavailable")

    def test_catalog_rejects_unsupported_submarket_and_series_validates_granularity(self):
        self.assertEqual(self.client.get("/api/v1/exposure/entities?submarket=SE").status_code, 422)
        self.assertEqual(self.client.get(
            "/api/v1/exposure/plant/USI_NE_001/series?mode=demo&granularity=PT30M"
        ).status_code, 422)

    def test_catalog_exposes_ne_default_and_series_declares_hourly_granularity(self):
        catalog = self.client.get("/api/v1/exposure/entities?mode=demo").json()
        self.assertEqual(catalog["metadata"]["submarket"], "NE")
        series = self.client.get(
            "/api/v1/exposure/plant/USI_NE_001/series?mode=demo&granularity=PT1H"
        ).json()
        self.assertEqual(series["metadata"]["granularity"], "PT1H")


if __name__ == "__main__":
    unittest.main()
