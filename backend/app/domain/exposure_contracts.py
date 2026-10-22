from __future__ import annotations
from datetime import datetime, timezone
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


def _utc(value: datetime) -> bool:
    return value.tzinfo is not None and value.utcoffset() is not None and value.utcoffset().total_seconds() == 0

class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid')

class ExposurePeriod(StrictModel):
    start: datetime
    end: datetime
    timezone: Literal['UTC'] = 'UTC'
    @model_validator(mode='after')
    def valid_range(self):
        if not _utc(self.start) or not _utc(self.end): raise ValueError('period timestamps must be timezone-aware UTC')
        if self.end <= self.start: raise ValueError('period.end must be after period.start')
        return self

class ExposureEntity(StrictModel):
    level: Literal['ons_group', 'plant']
    id: str = Field(min_length=1, max_length=128, pattern=r'^[A-Za-z0-9_.:-]+$')
    ceg: str | None = None
    ons_group_id: str | None = None

class ExposurePointV1(StrictModel):
    interval_start: datetime
    interval_end: datetime
    duration_h: float = Field(gt=0, le=24)
    expected_generation_mwh: float | None = Field(default=None, ge=0)
    curtailed_energy_mwh: float | None = Field(default=None, ge=0)
    reference_final_mw: float | None = Field(default=None, ge=0)
    generation_mw: float | None = Field(default=None, ge=0)
    reason_code: str | None = None
    evidence_kind: Literal['measured', 'allocated_estimate', 'scenario', 'forecast']
    probability: float | None = Field(default=None, ge=0, le=1)
    @model_validator(mode='after')
    def valid_interval(self):
        if not _utc(self.interval_start) or not _utc(self.interval_end): raise ValueError('interval timestamps must be timezone-aware UTC')
        if self.interval_end <= self.interval_start: raise ValueError('interval_end must be after interval_start')
        if abs((self.interval_end-self.interval_start).total_seconds()/3600-self.duration_h)>1e-6: raise ValueError('duration_h must match interval')
        return self

class ExposureSeriesV1(StrictModel):
    schema_version: Literal['exposure.v1'] = 'exposure.v1'
    entity: ExposureEntity
    mode: Literal['observed', 'demo']
    period: ExposurePeriod
    source: dict
    as_of: datetime
    quality: dict
    points: list[ExposurePointV1]
    pagination: dict
    metadata: dict
    @model_validator(mode='after')
    def ordered_points_in_period(self):
        if not _utc(self.as_of): raise ValueError('as_of must be timezone-aware UTC')
        starts = [p.interval_start for p in self.points]
        if starts != sorted(set(starts)): raise ValueError('points must be unique and ascending')
        if any(p.interval_start < self.period.start or p.interval_end > self.period.end for p in self.points): raise ValueError('point outside requested period')
        return self
