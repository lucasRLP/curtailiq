from fastapi import APIRouter

from app.services.maintenance_scenario_service import MaintenanceRankRequest, rank_windows

router = APIRouter(prefix="/api/v1/maintenance", tags=["maintenance-scenario-v1"])


@router.post("/rank")
def rank_maintenance_windows(request: MaintenanceRankRequest):
    return rank_windows(request)
