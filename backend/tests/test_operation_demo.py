"""Physical and economic invariants for explicitly synthetic operational scenarios."""
from collections import defaultdict
from datetime import datetime
import pytest


def build(**kw):
    from app.operation_demo.models import DemoConfig
    from app.operation_demo.service import build_demo
    return build_demo(DemoConfig(**kw))


def test_deterministic_and_simulated():
    a = build(days=1)
    assert a == build(days=1)
    assert a['is_simulated'] is True
    assert len(a['timeline']) == 144
    assert len(a['scada']) == 144 * 6
    assert a['scenario_id'] != build(days=1, seed=9)['scenario_id']


@pytest.mark.parametrize('seed', [1, 42, 99])
def test_physics_and_economic_reconciliation(seed):
    d = build(seed=seed)
    totals = defaultdict(float)
    for r in d['scada']:
        assert r['is_simulated'] is True
        assert 0 <= r['potencia_kw'] <= r['potencia_disponivel_kw'] + 1e-7
        assert r['potencia_disponivel_kw'] <= 3000 + 1e-7
        assert r['potencia_kw'] <= r['setpoint_kw'] + 1e-7
        if r['status'].startswith('parada'):
            assert r['potencia_kw'] == 0
        totals[r['ts']] += r['potencia_kw'] / 1000
    soc = 0
    eta = d['config']['efficiency'] ** .5
    for t in d['timeline']:
        assert totals[t['ts']] == pytest.approx(t['scheduled_mw'] + t['battery_charge_mw'])
        assert t['available_mw'] == pytest.approx(t['maintenance_unavailable_mw'] + t['wind_generation_mw'] + t['residual_curtailment_mw'])
        assert t['wind_generation_mw'] + t['battery_discharge_mw'] == pytest.approx(t['export_with_battery_mw'] + t['battery_charge_mw'])
        assert 0 <= t['export_with_battery_mw'] <= t['export_limit_mw'] + 1e-7
        assert t['battery_charge_mw'] * t['battery_discharge_mw'] == 0
        assert t['battery_charge_mw'] <= t['curtailed_mw'] + 1e-7
        soc += (t['battery_charge_mw'] * eta - t['battery_discharge_mw'] / eta) / 6
        assert t['soc_mwh'] == pytest.approx(soc)
        assert -1e-7 <= soc <= d['config']['battery_mwh'] + 1e-7
    s = d['summary']
    assert s['scheduled_export_mwh'] >= s['baseline_export_mwh'] - 1e-7
    assert s['maintenance_saving_brl'] >= -1e-7
    assert s['recovered_mwh'] == pytest.approx(sum(t['battery_discharge_mw']/6 for t in d['timeline']))
    assert s['battery_net_value_brl'] == pytest.approx(sum(t['battery_discharge_mw']/6*(t['price_brl_mwh']-d['config']['degradation_brl_mwh']) for t in d['timeline']))


def test_scheduler_constraints():
    d = build(teams=1, max_wind_ms=10)
    concurrent = defaultdict(list)
    wind = {t['ts']: t['wind_ms'] for t in d['timeline']}
    from datetime import timedelta, timezone
    for task in d['tasks']:
        if task['scheduled_start'] is None:
            assert task['status'] == 'nao_alocada'
            continue
        start = datetime.fromisoformat(task['scheduled_start'])
        for i in range(task['duration_minutes']//10):
            ts = start + timedelta(minutes=10*i)
            local = ts.astimezone(timezone(timedelta(hours=-3)))
            assert 7 <= local.hour < 17 and local.weekday() < 6
            assert wind[ts.isoformat()] <= 10
            concurrent[ts].append(task['turbine_id'])
    assert all(len(v) <= 1 for v in concurrent.values())


def test_zero_battery_and_unfavourable_dispatch():
    for cfg in [dict(battery_mwh=0, battery_mw=0), dict(degradation_brl_mwh=300, energy_price_brl_mwh=200)]:
        d = build(days=1, **cfg)
        assert d['summary']['recovered_mwh'] == 0
        assert all(t['soc_mwh'] == 0 for t in d['timeline'])


@pytest.mark.parametrize('kw', [dict(days=0),dict(days=8),dict(turbines=21),dict(teams=0),dict(efficiency=0),dict(efficiency=1.1),dict(nominal_mw=float('nan')),dict(battery_mwh=-1),dict(unknown=1)])
def test_invalid_config(kw):
    from app.operation_demo.models import DemoConfig
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        DemoConfig(**kw)


def test_api():
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as client:
        response = client.post('/api/operacao/demo', json={'days': 1})
        assert response.status_code == 200
        assert response.json()['is_simulated'] is True
        assert client.post('/api/operacao/demo',json={'days':8}).status_code == 422
        assert client.get('/api/operacao/demo').status_code == 200


def test_infeasible_tasks_not_counted_as_saving():
    d=build(max_wind_ms=1,days=1)
    assert d['summary']['unallocated_tasks'] == d['config']['turbines']
    assert d['summary']['maintenance_saving_brl'] == 0
    assert all(t['scheduled_start'] is None and t['original_start'] is None for t in d['tasks'])


def test_synthetic_study():
    from app.operation_demo.study import run_study
    from app.operation_demo.models import DemoConfig
    result=run_study(DemoConfig(days=1),seeds=3)
    assert result['is_simulated'] is True
    assert len(result['runs']) == 3
    assert result['statistics']['maintenance_saving_brl']['mean'] >= 0
    assert len(result['sensitivities']) >= 4
    assert all(s['config'] and s['summary'] for s in result['sensitivities'])
    with pytest.raises(ValueError):
        run_study(DemoConfig(),seeds=0)

