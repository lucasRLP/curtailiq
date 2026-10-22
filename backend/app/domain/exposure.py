"""Shared, explicit contract for asset-level curtailment exposure.

This is an integration boundary for CurtaiLess-style exposure views; it does
not turn forecasts into official regulatory or financial determinations.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ExposurePoint(BaseModel):
    model_config = ConfigDict(extra="forbid")

    timestamp: datetime
    expected_generation_mwh: float = Field(ge=0)
    expected_curtailed_mwh: float = Field(ge=0)
    probability: float = Field(ge=0, le=1)
    evidence_status: Literal["observed", "demonstrative", "forecast"]


class AssetExposure(BaseModel):
    """Exposure series for a single asset, with provenance made explicit."""

    model_config = ConfigDict(extra="forbid")

    asset_id: str = Field(min_length=1)
    source: str = Field(min_length=1)
    as_of: datetime
    points: list[ExposurePoint]

    @model_validator(mode="after")
    def timestamps_are_unique_and_ordered(self) -> "AssetExposure":
        timestamps = [point.timestamp for point in self.points]
        if timestamps != sorted(set(timestamps)):
            raise ValueError("exposure timestamps must be unique and ascending")
        return self
