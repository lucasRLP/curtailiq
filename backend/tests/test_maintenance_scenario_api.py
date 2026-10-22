from datetime import date, datetime, timezone

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def payload(**overrides):
    request = {
        "asset_id": "USI_NE_001",
        "planning_start": "2026-06-01",
        "planning_end": "2026-06-03",
        "duration_days": 1,
        "minimum_notice_hours": 0,
        "weekdays_only": False,
        "unavailable_periods": [],
        "as_of": "2026-01-01T00:00:00Z",
        "capacity_mw": 10,
        "maintenance_mw": 4,
        "energy_price_brl_mwh": 100,
        "historical_monthly": [
            {"month": 6, "potential_mw": 8, "curtailment_ratio": 0.75, "record_count": 3}
        ],
    }
    request.update(overrides)
    return request


def test_rank_returns_demo_scenarios_with_incremental_cost_and_no_operational_persistence():
    response = client.post("/api/v1/maintenance/rank", json=payload())
    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "demo"
    assert body["method_version"] == "curtailiq_maintenance_energy_balance_v2"
    assert body["cost_capability"]["status"] == "available"
    assert "premises" in body
    assert "probability" not in str(body).lower()
    assert body["windows"][0]["baseline_cost_brl"] == 0
    assert body["windows"][0]["scenario_cost_brl"] == body["windows"][0]["incremental_cost_brl"]
    assert body["operational_schedule_written"] is False
    assert "DEMONSTRACAO" in body["limitations"][0]
    window = body["windows"][0]
    assert "uncertainty_penalty_mwh" not in window
    assert "risk" not in window
    assert "risk_label" not in window


def test_rank_order_and_components_are_independent_of_record_count():
    low_count = payload(historical_monthly=[{"month": 6, "potential_mw": 8, "curtailment_ratio": 0.75, "record_count": 1}])
    high_count = payload(historical_monthly=[{"month": 6, "potential_mw": 8, "curtailment_ratio": 0.75, "record_count": 300}])
    low = client.post("/api/v1/maintenance/rank", json=low_count).json()
    high = client.post("/api/v1/maintenance/rank", json=high_count).json()
    assert low["windows"] == high["windows"]


def test_rank_empty_history_returns_no_eligible_windows_not_fake_zero_cost():
    response = client.post("/api/v1/maintenance/rank", json=payload(historical_monthly=[]))
    assert response.status_code == 200
    assert response.json()["status"] == "NO_ELIGIBLE_WINDOW"
    assert response.json()["windows"] == []


def test_rank_excludes_unavailable_boundary_and_minimum_notice_windows():
    response = client.post("/api/v1/maintenance/rank", json=payload(
        planning_start="2026-06-01", planning_end="2026-06-02",
        as_of="2026-06-01T06:00:00Z", minimum_notice_hours=12,
        unavailable_periods=[{"start": "2026-06-02", "end": "2026-06-02"}],
    ))
    assert response.status_code == 200
    assert response.json()["windows"] == []
    assert len(response.json()["rejected_windows"]) == 2


def test_rank_rejects_naive_as_of_invalid_capacity_and_extra_contract_fields():
    assert client.post("/api/v1/maintenance/rank", json=payload(as_of="2026-01-01T00:00:00")).status_code == 422
    assert client.post("/api/v1/maintenance/rank", json=payload(maintenance_mw=11)).status_code == 422
    assert client.post("/api/v1/maintenance/rank", json=payload(unexpected=True)).status_code == 422


def test_rank_reconciles_uniform_daily_energy_and_marginal_price():
    body = client.post("/api/v1/maintenance/rank", json=payload(
        planning_start="2026-06-01", planning_end="2026-06-01", maintenance_mw=4,
        historical_monthly=[{"month": 6, "potential_mw": 8, "curtailment_ratio": 0.25, "record_count": 1}],
    )).json()
    window = body["windows"][0]
    assert window["baseline_generation_mwh"] == 144
    assert window["scenario_generation_mwh"] == 144
    assert window["generation_delta_mwh"] == 0
    assert window["baseline_cost_brl"] == 0
    assert window["scenario_cost_brl"] == 0
    assert window["incremental_cost_brl"] == 0
    assert window["baseline_available_mwh"] == window["baseline_generation_mwh"] + window["baseline_curtailment_proxy_mwh"]
    assert window["scenario_available_mwh"] == window["scenario_generation_mwh"] + window["scenario_curtailment_proxy_mwh"]


def test_rank_fixed_export_ceiling_absorbs_maintenance_until_baseline_ceiling():
    def rank(maintenance_mw):
        return client.post("/api/v1/maintenance/rank", json=payload(
            planning_start="2026-06-01", planning_end="2026-06-01",
            capacity_mw=10, maintenance_mw=maintenance_mw,
            historical_monthly=[{"month": 6, "potential_mw": 10, "curtailment_ratio": 0.3, "record_count": 1}],
        )).json()["windows"][0]

    absorbed = rank(2)
    constrained = rank(4)
    assert absorbed["baseline_generation_mwh"] == 168
    assert absorbed["scenario_generation_mwh"] == 168
    assert absorbed["generation_delta_mwh"] == absorbed["incremental_cost_brl"] == 0
    assert constrained["scenario_generation_mwh"] == 144
    assert constrained["generation_delta_mwh"] == 24
    assert constrained["incremental_cost_brl"] == 2400


def test_rank_capacity_headroom_absorbs_maintenance_when_potential_is_low():
    body = client.post("/api/v1/maintenance/rank", json=payload(
        planning_start="2026-06-01", planning_end="2026-06-01", maintenance_mw=2,
        historical_monthly=[{"month": 6, "potential_mw": 5, "curtailment_ratio": 0, "record_count": 1}],
    )).json()
    window = body["windows"][0]
    assert window["baseline_generation_mwh"] == window["scenario_generation_mwh"] == 120
    assert window["generation_delta_mwh"] == window["incremental_cost_brl"] == 0


def test_rank_no_cut_and_high_cut_have_explicit_balanced_energy():
    no_cut = client.post("/api/v1/maintenance/rank", json=payload(
        planning_start="2026-06-01", planning_end="2026-06-01", maintenance_mw=4,
        historical_monthly=[{"month": 6, "potential_mw": 8, "curtailment_ratio": 0, "record_count": 2}],
    )).json()["windows"][0]
    high_cut = client.post("/api/v1/maintenance/rank", json=payload(
        planning_start="2026-06-01", planning_end="2026-06-01", maintenance_mw=4,
        historical_monthly=[{"month": 6, "potential_mw": 8, "curtailment_ratio": 0.75, "record_count": 2}],
    )).json()["windows"][0]
    assert no_cut["baseline_generation_mwh"] == 192
    assert no_cut["scenario_generation_mwh"] == 144
    assert no_cut["incremental_cost_brl"] == 4800
    assert high_cut["baseline_generation_mwh"] == 48
    assert high_cut["scenario_generation_mwh"] == 48
    assert high_cut["incremental_cost_brl"] == 0


def test_rank_total_maintenance_and_zero_potential_reconcile_to_zero():
    total = client.post("/api/v1/maintenance/rank", json=payload(
        planning_start="2026-06-01", planning_end="2026-06-01", maintenance_mw=10,
        historical_monthly=[{"month": 6, "potential_mw": 8, "curtailment_ratio": 0, "record_count": 1}],
    )).json()["windows"][0]
    zero = client.post("/api/v1/maintenance/rank", json=payload(
        planning_start="2026-06-01", planning_end="2026-06-01", maintenance_mw=4,
        historical_monthly=[{"month": 6, "potential_mw": 0, "curtailment_ratio": 0, "record_count": 1}],
    )).json()["windows"][0]
    assert total["scenario_generation_mwh"] == 0
    assert total["incremental_cost_brl"] == 19200
    assert zero["baseline_generation_mwh"] == zero["scenario_generation_mwh"] == zero["incremental_cost_brl"] == 0


def test_rank_sort_uses_scenario_generation_then_incremental_cost_then_start():
    body = client.post("/api/v1/maintenance/rank", json=payload(
        planning_start="2026-06-30", planning_end="2026-07-02", duration_days=1,
        maintenance_mw=4,
        historical_monthly=[
            {"month": 6, "potential_mw": 8, "curtailment_ratio": 0.25, "record_count": 1},
            {"month": 7, "potential_mw": 5, "curtailment_ratio": 0, "record_count": 1},
        ],
    )).json()
    ranked = body["windows"]
    assert [w["rank"] for w in ranked] == list(range(1, len(ranked) + 1))
    assert [(w["scenario_generation_mwh"], w["incremental_cost_brl"], w["start"]) for w in ranked] == sorted(
        (w["scenario_generation_mwh"], w["incremental_cost_brl"], w["start"]) for w in ranked
    )


def test_rank_multimonth_scenario_is_uniform_per_day_and_record_count_invariant():
    base = payload(
        planning_start="2026-06-30", planning_end="2026-07-01", duration_days=2,
        maintenance_mw=4,
        historical_monthly=[
            {"month": 6, "potential_mw": 8, "curtailment_ratio": 0.25, "record_count": 1},
            {"month": 7, "potential_mw": 4, "curtailment_ratio": 0, "record_count": 1},
        ],
    )
    first = client.post("/api/v1/maintenance/rank", json=base).json()
    base["historical_monthly"][0]["record_count"] = 300
    base["historical_monthly"][1]["record_count"] = 999
    second = client.post("/api/v1/maintenance/rank", json=base).json()
    window = first["windows"][0]
    assert window == second["windows"][0]
    assert window["baseline_generation_mwh"] == 240
    assert window["scenario_generation_mwh"] == 240
    assert window["generation_delta_mwh"] == 0
    assert first["premises"]["profile_interpretation"] == "uniform_daily_scenario"
