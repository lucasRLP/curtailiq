from fastapi import APIRouter, Response
from app.operation_demo.models import DemoConfig
from app.operation_demo.service import build_demo

router = APIRouter(prefix='/api/operacao', tags=['Operação simulada'])


@router.get('/demo')
def get_demo(response: Response):
    response.headers['Cache-Control']='no-store'
    return build_demo(DemoConfig())


@router.post('/demo')
def post_demo(config: DemoConfig, response: Response):
    response.headers['Cache-Control']='no-store'
    return build_demo(config)
