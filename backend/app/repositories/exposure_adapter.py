from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from app.domain.exposure_contracts import ExposurePointV1


class LocalExposureRepository:
    """Read-only adapter over CurtailIQ's existing local mock repository.

    The sample CSV is scenario/demo material, not curated observed production data.
    """

    def __init__(self, repository):
        self.repository = repository

    def entities(self, level: str) -> list[dict[str, Any]]:
        if level != "plant":
            return []  # No defensible group mapping in these local fixtures.
        return [
            {"level": "plant", "id": str(item["usina_id"]), "name": item.get("nome"),
             "technology": item.get("fonte"), "submarket": item.get("submercado"),
             "available_modes": ["demo"], "quality_status": "partial"}
            for item in self.repository.list_usinas(submercado="NE")
        ]

    def series(self, entity_id: str, start: datetime, end: datetime) -> list[ExposurePointV1]:
        if self.repository.get_usina(entity_id) is None:
            return []
        rows = self.repository.get_constrained_off(entity_id, start.replace(tzinfo=None), end.replace(tzinfo=None))
        points = []
        for row in rows:
            raw = row.get("timestamp")
            if raw is None:
                continue
            stamp = raw.replace(tzinfo=timezone.utc) if raw.tzinfo is None else raw.astimezone(timezone.utc)
            stop = stamp + timedelta(hours=1)
            if stamp < start or stop > end:
                continue
            value = row.get("energia_restringida_mwh")
            if value is None:
                continue
            points.append(ExposurePointV1(
                interval_start=stamp, interval_end=stop, duration_h=1.0,
                curtailed_energy_mwh=float(value),
                reason_code=str(row.get("razao_restricao") or "unknown"),
                evidence_kind="scenario",
            ))
        # Deterministic dedup: retain first CSV row for each interval.
        by_start = {}
        for point in points:
            by_start.setdefault(point.interval_start, point)
        return sorted(by_start.values(), key=lambda point: point.interval_start)
