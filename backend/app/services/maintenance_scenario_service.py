from __future__ import annotations

from datetime import date, datetime, time, timedelta
from math import isfinite
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

TZ = ZoneInfo("America/Sao_Paulo")
WARNING = "DEMONSTRACAO — cenário determinístico; não é previsão validada, economia realizada nem direito a ressarcimento."


class MonthlyProfile(BaseModel):
    model_config = ConfigDict(extra="forbid")
    month: int = Field(ge=1, le=12)
    potential_mw: float = Field(ge=0, allow_inf_nan=False)
    curtailment_ratio: float = Field(ge=0, le=1, allow_inf_nan=False)
    record_count: int = Field(ge=1, le=100000)


class UnavailablePeriod(BaseModel):
    model_config = ConfigDict(extra="forbid")
    start: date
    end: date

    @model_validator(mode="after")
    def ordered(self):
        if self.end < self.start:
            raise ValueError("unavailable period end must not precede start")
        return self


class MaintenanceRankRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    asset_id: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_.:-]+$")
    planning_start: date
    planning_end: date
    duration_days: int = Field(ge=1, le=30)
    minimum_notice_hours: int = Field(ge=0, le=720)
    weekdays_only: bool
    unavailable_periods: list[UnavailablePeriod] = Field(max_length=64)
    as_of: datetime
    capacity_mw: float = Field(gt=0, allow_inf_nan=False)
    maintenance_mw: float = Field(gt=0, allow_inf_nan=False)
    energy_price_brl_mwh: float = Field(ge=0, allow_inf_nan=False)
    historical_monthly: list[MonthlyProfile] = Field(max_length=12)

    @field_validator("as_of")
    @classmethod
    def aware(cls, value):
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("as_of must include timezone")
        return value

    @model_validator(mode="after")
    def valid_request(self):
        if self.planning_end < self.planning_start:
            raise ValueError("planning_end must not precede planning_start")
        if self.maintenance_mw > self.capacity_mw:
            raise ValueError("maintenance_mw cannot exceed capacity_mw")
        if len({row.month for row in self.historical_monthly}) != len(self.historical_monthly):
            raise ValueError("historical_monthly months must be unique")
        return self


def rank_windows(request: MaintenanceRankRequest) -> dict:
    profiles = {row.month: row for row in request.historical_monthly}
    current = request.planning_start
    latest_start = request.planning_end - timedelta(days=request.duration_days - 1)
    eligible, rejected = [], []
    notice = request.as_of.astimezone(TZ) + timedelta(hours=request.minimum_notice_hours)
    while current <= latest_start:
        start = datetime.combine(current, time.min, tzinfo=TZ)
        end = start + timedelta(days=request.duration_days)
        reasons = []
        if start < notice:
            reasons.append("MINIMUM_NOTICE_NOT_MET")
        if request.weekdays_only and any((current + timedelta(days=i)).weekday() >= 5 for i in range(request.duration_days)):
            reasons.append("NON_BUSINESS_DAY")
        if any(current <= period.end and period.start < current + timedelta(days=request.duration_days) for period in request.unavailable_periods):
            reasons.append("UNAVAILABLE_PERIOD_OVERLAP")
        daily = [profiles.get((current + timedelta(days=i)).month) for i in range(request.duration_days)]
        if any(profile is None for profile in daily):
            reasons.append("MISSING_HISTORICAL_DISTRIBUTION")
        if reasons:
            rejected.append({"start": start.isoformat(), "end": end.isoformat(), "eligible": False, "rejection_reasons": sorted(set(reasons))})
            current += timedelta(days=1)
            continue
        baseline_generation_mwh = scenario_generation_mwh = 0.0
        baseline_available_mwh = scenario_available_mwh = 0.0
        baseline_curtailed_mwh = scenario_curtailed_mwh = 0.0
        for profile in daily:
            baseline_power = min(request.capacity_mw, profile.potential_mw)
            curtailed_power = baseline_power * profile.curtailment_ratio
            scenario_capacity = max(request.capacity_mw - request.maintenance_mw, 0.0)
            scenario_power = min(scenario_capacity, profile.potential_mw)
            baseline_generation_power = max(baseline_power - curtailed_power, 0.0)
            scenario_generation_power = min(scenario_power, baseline_generation_power)
            scenario_curtailed_power = scenario_power - scenario_generation_power
            baseline_available_mwh += baseline_power * 24
            scenario_available_mwh += scenario_power * 24
            baseline_curtailed_mwh += curtailed_power * 24
            scenario_curtailed_mwh += scenario_curtailed_power * 24
            baseline_generation_mwh += baseline_generation_power * 24
            scenario_generation_mwh += scenario_generation_power * 24
        generation_delta_mwh = max(0.0, baseline_generation_mwh - scenario_generation_mwh)
        baseline_cost_brl = 0.0
        scenario_cost_brl = generation_delta_mwh * request.energy_price_brl_mwh
        incremental_cost_brl = scenario_cost_brl - baseline_cost_brl
        residual_saleable = scenario_generation_mwh
        eligible.append({
            "start": start.isoformat(), "end": end.isoformat(), "eligible": True,
            "baseline_available_mwh": round(baseline_available_mwh, 6),
            "scenario_available_mwh": round(scenario_available_mwh, 6),
            "baseline_generation_mwh": round(baseline_generation_mwh, 6),
            "scenario_generation_mwh": round(scenario_generation_mwh, 6),
            "baseline_curtailment_proxy_mwh": round(baseline_curtailed_mwh, 6),
            "scenario_curtailment_proxy_mwh": round(scenario_curtailed_mwh, 6),
            "generation_delta_mwh": round(generation_delta_mwh, 6),
            "residual_saleable_mwh": round(residual_saleable, 6),
            "marginal_cost_brl_mwh": round(request.energy_price_brl_mwh, 6),
            "baseline_cost_brl": round(baseline_cost_brl, 2),
            "scenario_cost_brl": round(scenario_cost_brl, 2),
            "incremental_cost_brl": round(incremental_cost_brl, 2),
        })
        current += timedelta(days=1)
    eligible.sort(key=lambda item: (item["residual_saleable_mwh"], item["incremental_cost_brl"], item["start"]))
    for rank, item in enumerate(eligible, 1):
        item["rank"] = rank
    return {
        "schema_version": "maintenance.scenario.v1", "asset_id": request.asset_id, "mode": "demo",
        "status": "RANKED" if eligible else "NO_ELIGIBLE_WINDOW",
        "method_version": "curtailiq_maintenance_energy_balance_v2",
        "premises": {
            "profile_interpretation": "uniform_daily_scenario",
            "capacity_rule": "potential and available capacity are bounded by min(capacity_mw, potential_mw); maintenance subtracts maintenance_mw from capacity, floored at zero",
            "curtailment_rule": "fixed baseline export ceiling: scenario generation is min(scenario available, baseline generation); scenario curtailment is scenario available minus scenario generation",
            "energy_balance": "available_mwh = generation_mwh + curtailment_proxy_mwh in baseline and scenario",
            "cost_rule": "baseline opportunity cost is zero; scenario opportunity cost = lost generation MWh x request energy_price_brl_mwh",
            "price_assumption": "request price is a constant marginal proxy across all days in each ranked window",
            "ranking_rule": "lowest scenario_generation_mwh, then lowest incremental_cost_brl, then earliest start date",
        },
        "cost_capability": {"status": "available", "basis": "deterministic_scenario_only"},
        "windows": eligible, "rejected_windows": rejected,
        "operational_schedule_written": False,
        "limitations": [WARNING, "Perfil mensal é informado/sintético; disponibilidade e corte não são previsão operacional.", "Economia incremental não inclui ressarcimento, CAPEX ou elegibilidade regulatória."],
    }
