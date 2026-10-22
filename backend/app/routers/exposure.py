from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query

from app.config import Settings, get_settings
from app.domain.exposure_contracts import ExposureSeriesV1
from app.repositories.exposure_adapter import LocalExposureRepository
from app.repositories.mock_repo import MockRepository

router = APIRouter(prefix="/api/v1/exposure", tags=["exposure-v1"])
_DEMO_WARNING = "DEMONSTRACAO — não é previsão validada, economia realizada ou direito a ressarcimento"


def _utc_range(start: datetime | None, end: datetime | None) -> tuple[datetime, datetime]:
    if (start is None) != (end is None):
        raise HTTPException(status_code=422, detail="start and end must be supplied together")
    if start is None:
        end = datetime.now(timezone.utc)
        start = end - timedelta(days=30)
    assert end is not None
    for value in (start, end):
        if value.tzinfo is None or value.utcoffset() is None:
            raise HTTPException(status_code=422, detail="timestamps must include timezone")
    start, end = start.astimezone(timezone.utc), end.astimezone(timezone.utc)
    if end <= start:
        raise HTTPException(status_code=422, detail="end must be after start")
    if (end - start).days > 366:
        raise HTTPException(status_code=422, detail="requested period cannot exceed 366 days")
    return start, end


def _fixture_repo(settings: Settings = Depends(get_settings)) -> MockRepository:
    """Explicit local-only provider; independent of DATA_BACKEND/get_repo."""
    return MockRepository(mvp_only_nordeste=True, data_dir=settings.mock_data_dir)


def _adapter(repository) -> LocalExposureRepository:
    return LocalExposureRepository(repository)


@router.get("/entities")
def list_entities(
    level: Literal["plant", "ons_group"] = "ons_group",
    mode: Literal["observed", "demo"] = "observed",
    submarket: Literal["NE"] = "NE",
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    repo: MockRepository = Depends(_fixture_repo),
):
    items = _adapter(repo).entities(level) if mode == "demo" else []
    return {
        "items": items[offset:offset + limit],
        "pagination": {"total_count": len(items), "limit": limit, "offset": offset},
        "availability": {"status": "available" if mode == "demo" and level == "plant" else "unavailable"},
        "capabilities": {"demo": "available", "observed": "unavailable", "forecast": "unavailable"},
        "metadata": {"api_contract_version": "v1", "mvp_scope_applied": True,
                     "mvp_scope": "geradoras_renovaveis_submercado_ne", "submarket": submarket,
                     "source": "local_fixture" if mode == "demo" else "not_configured",
                     "version": "curtailiq-sample-csv-v1" if mode == "demo" else None,
                     "freshness": "local_static_fixture" if mode == "demo" else "unavailable"},
    }


@router.get("/{level}/{entity_id}/series", response_model=ExposureSeriesV1)
def get_series(
    level: Literal["plant", "ons_group"],
    entity_id: str,
    mode: Literal["observed", "demo"] = "observed",
    start: datetime | None = None,
    end: datetime | None = None,
    granularity: Literal["PT1H"] = "PT1H",
    submarket: Literal["NE"] = "NE",
    limit: int = Query(500, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    repo: MockRepository = Depends(_fixture_repo),
):
    if not entity_id or len(entity_id) > 128 or not all(c.isalnum() or c in "_.:-" for c in entity_id):
        raise HTTPException(status_code=422, detail="invalid entity_id")
    begin, finish = _utc_range(start, end)
    entity = {"level": level, "id": entity_id}
    plant = repo.get_usina(entity_id) if mode == "demo" and level == "plant" else None
    if mode == "demo" and level == "plant" and plant is None:
        raise HTTPException(status_code=404, detail="unknown exposure entity")
    if plant is not None and plant.get("submercado") != submarket:
        raise HTTPException(status_code=404, detail="entity outside requested submarket scope")
    points = _adapter(repo).series(entity_id, begin, finish) if level == "plant" and mode == "demo" else []
    total_count = len(points)
    selected = points[offset:offset + limit]
    unavailable = mode == "observed" or level == "ons_group"
    source = "not_configured" if unavailable else "local_fixture"
    version = "unavailable" if unavailable else "curtailiq-sample-csv-v1"
    return {
        "schema_version": "exposure.v1", "entity": entity, "mode": mode,
        "period": {"start": begin, "end": finish, "timezone": "UTC"},
        "source": {"name": source, "version": version,
                   "revision": None, "license_ref": "local-project-fixture"},
        "as_of": datetime.now(timezone.utc),
        "quality": {"status": "unavailable" if unavailable else "partial",
                    "duplicate_count": 0,
                    "limitations": (["Provider observed aprovado não configurado; sem fallback demonstrativo"]
                                    if mode == "observed" else (["Provider de grupo ONS indisponível: não há mapeamento defensável"]
                                    if level == "ons_group" else ([_DEMO_WARNING,
                                    "Fixture CSV local estática; horários sem timezone na origem interpretados como UTC",
                                    "MWh da fixture não são apuração regulatória"] if selected else [_DEMO_WARNING, "Nenhum ponto na fixture para o período solicitado"])))},
        "points": [] if unavailable else [point.model_dump(mode="json") for point in selected],
        "pagination": {"total_count": 0 if unavailable else total_count, "limit": limit, "offset": offset},
        "metadata": {"api_contract_version": "v1", "mvp_scope_applied": not unavailable,
                     "mvp_scope": "geradoras_renovaveis_submercado_ne", "submarket": submarket,
                     "granularity": granularity, "source": source, "version": version,
                     "freshness": "unavailable" if unavailable else "local_static_fixture"},
    }
