from datetime import datetime, timezone
import unittest
from unittest.mock import patch
from pydantic import ValidationError
from fastapi.testclient import TestClient
from app.main import app
from app.domain.exposure_contracts import ExposureSeriesV1
from app.routers import exposure

class ExposureR2Tests(unittest.TestCase):
    def setUp(self): self.client = TestClient(app)

    def test_series_response_json_roundtrips_through_typed_contract(self):
        payload = self.client.get('/api/v1/exposure/plant/USI_NE_001/series?mode=demo').json()
        parsed = ExposureSeriesV1.model_validate(payload)
        self.assertEqual(ExposureSeriesV1.model_validate_json(parsed.model_dump_json()), parsed)

    def test_period_extras_are_structured_validation_errors(self):
        payload = self.client.get('/api/v1/exposure/plant/USI_NE_001/series?mode=demo').json()
        payload['period']['unexpected'] = 'x'
        with self.assertRaises(ValidationError): ExposureSeriesV1.model_validate(payload)

    def test_direct_series_denies_known_plant_outside_ne(self):
        class Repo:
            def get_usina(self, eid): return {'usina_id':eid, 'submercado':'SE'}
            def get_constrained_off(self, *args): raise AssertionError('out-of-scope data queried')
        app.dependency_overrides[exposure._fixture_repo] = lambda: Repo()
        try:
            r = self.client.get('/api/v1/exposure/plant/OUTSIDE/series?mode=demo')
        finally: app.dependency_overrides.pop(exposure._fixture_repo, None)
        self.assertIn(r.status_code, (404, 422))

    def test_ons_group_capability_is_unavailable_consistently(self):
        catalog = self.client.get('/api/v1/exposure/entities?mode=demo&level=ons_group').json()
        r = self.client.get('/api/v1/exposure/ons_group/NO_MAPPING/series?mode=demo')
        self.assertEqual(r.status_code, 200)
        p = r.json()
        self.assertEqual(p['quality']['status'], 'unavailable')
        self.assertEqual(p['points'], [])
        self.assertEqual(p['source']['name'], 'not_configured')
        self.assertFalse(p['metadata']['mvp_scope_applied'])
        self.assertEqual(catalog['items'], [])
        self.assertEqual(catalog['availability']['status'], 'unavailable')

if __name__ == '__main__': unittest.main()
