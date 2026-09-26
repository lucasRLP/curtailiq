"""Bounded, versioned inputs for an explicitly synthetic offline simulation."""
from pydantic import BaseModel, ConfigDict, Field


class DemoConfig(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    seed: int = Field(default=42, ge=0, le=2147483647)
    days: int = Field(default=2, ge=1, le=7)
    turbines: int = Field(default=6, ge=1, le=20)
    nominal_mw: float = Field(default=3, gt=0, le=20)
    teams: int = Field(default=2, ge=1, le=20)
    max_wind_ms: float = Field(default=12, gt=0, le=25)
    battery_mwh: float = Field(default=12, ge=0, le=1000)
    battery_mw: float = Field(default=3, ge=0, le=500)
    efficiency: float = Field(default=.9, gt=0, le=1)
    degradation_brl_mwh: float = Field(default=30, ge=0, le=10000)
    energy_price_brl_mwh: float = Field(default=250, ge=0, le=10000)
