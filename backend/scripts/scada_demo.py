"""Offline scenario export and read-only OPC UA replay/polling CLI."""
import argparse
import asyncio
import hashlib
import json
import math
import sys
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app.operation_demo.models import DemoConfig
from app.operation_demo.service import build_demo
from app.scada_demo import export_csv, import_csv, store_readings


def export_scenario(config, output):
    output=Path(output)
    output.mkdir(parents=True,exist_ok=True)
    result=build_demo(config)
    (output/'scenario.json').write_text(json.dumps(result,ensure_ascii=False,indent=2,allow_nan=False),encoding='utf-8')
    export_csv(result['scada'],output/'scada.csv')
    lines=['# CurtailIQ — cenário SIMULADO', '',f"Scenario: {result['scenario_id']}", f"Método: {result['method']}", '',
           '## Premissas', *['- '+x for x in result['assumptions']], '', '## Resultado do horizonte (não anualizado)',
           *[f'- {k}: {v}' for k,v in result['summary'].items()], '', '## Configuração',
           '```json',json.dumps(result['config'],ensure_ascii=False,indent=2),'```']
    (output/'report.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    manifest=dict(is_simulated=True,scenario_id=result['scenario_id'],method=result['method'],
                  files={name:hashlib.sha256((output/name).read_bytes()).hexdigest()
                         for name in ['scenario.json','scada.csv','report.md']})
    (output/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    return manifest


async def serve(args):
    from app.scada_demo.opcua import DemoServer
    rows=import_csv(args.csv)
    async with DemoServer(rows,endpoint=args.endpoint,interval=args.interval,loop=not args.once) as server:
        print('SCADA SIMULADO read-only pronto: '+args.endpoint,flush=True)
        if args.once:
            await server.replay_done.wait()
        else:
            await asyncio.Event().wait()


async def read(args):
    from asyncua import Client
    from app.scada_demo.opcua import check_endpoint, read_snapshot
    check_endpoint(args.endpoint)
    count=0
    async with Client(args.endpoint) as client:
        for _ in range(args.samples):
            rows=await read_snapshot(client)
            count+=store_readings(rows,args.database)
            print(json.dumps(dict(is_simulated=True,rows=len(rows),inserted_total=count,ts=rows[0]['ts']),ensure_ascii=False),flush=True)
            await asyncio.sleep(args.interval)
    return count


def main():
    parser=argparse.ArgumentParser(description='CurtailIQ SCADA sintético. Nunca controla equipamento.')
    sub=parser.add_subparsers(dest='command',required=True)
    exp=sub.add_parser('export')
    exp.add_argument('--output',required=True)
    exp.add_argument('--days',type=int,default=2)
    exp.add_argument('--seed',type=int,default=42)
    exp.add_argument('--config',help='JSON DemoConfig; substitui days/seed')
    srv=sub.add_parser('serve')
    srv.add_argument('--csv',required=True)
    srv.add_argument('--once',action='store_true')
    reader=sub.add_parser('read')
    reader.add_argument('--database',required=True)
    reader.add_argument('--samples',type=int,default=10)
    for p in (srv,reader):
        p.add_argument('--endpoint',default='opc.tcp://127.0.0.1:4840/demo/')
        p.add_argument('--interval',type=float,default=1)
    args=parser.parse_args()
    if args.command=='export':
        config=DemoConfig.model_validate_json(Path(args.config).read_text(encoding='utf-8')) if args.config else DemoConfig(days=args.days,seed=args.seed)
        print(json.dumps(export_scenario(config,args.output),indent=2))
    else:
        if not math.isfinite(args.interval) or args.interval <= 0:
            parser.error('interval deve ser finito e positivo')
        if args.command=='read' and not 1 <= args.samples <= 100000:
            parser.error('samples deve estar entre 1 e 100000')
        try:
            asyncio.run(serve(args) if args.command=='serve' else read(args))
        except KeyboardInterrupt:
            pass


if __name__=='__main__':
    main()
