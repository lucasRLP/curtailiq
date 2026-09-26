"""Loopback-only OPC UA replay. No equipment command or writable variable."""
import asyncio
import contextlib
import json
import math
from datetime import datetime
from urllib.parse import urlparse
from .codec import FIELDS, validate_rows

NAMESPACE = 'urn:curtailiq:synthetic:scada:v1'
TAGS = dict(zip(FIELDS, ['TurbineId','Timestamp','WindSpeed','ActivePower','AvailablePower',
                       'Setpoint','Pitch','RotorSpeed','TempNacelle','TempGenBearing',
                       'TempGearBearing','Status','Quality','IsSimulated','Source']))


def check_endpoint(endpoint):
    p=urlparse(endpoint)
    if p.scheme != 'opc.tcp' or p.hostname not in {'localhost','127.0.0.1','::1'} or not p.port or p.username or p.password:
        raise ValueError('Servidor demo limitado a opc.tcp loopback com porta explicita')


class DemoServer:
    def __init__(self, rows, endpoint='opc.tcp://127.0.0.1:4840/demo/', interval=1.0, loop=True):
        check_endpoint(endpoint)
        if not math.isfinite(interval) or interval <= 0:
            raise ValueError('interval deve ser positivo e finito')
        self.rows=validate_rows(rows)
        if not self.rows:
            raise ValueError('SCADA vazio')
        self.endpoint,self.interval,self.loop=endpoint,interval,loop
        grouped={}
        for row in self.rows:
            grouped.setdefault(row['ts'],[]).append(row)
        self.frames=[grouped[ts] for ts in sorted(grouped,key=lambda ts:datetime.fromisoformat(ts.replace('Z','+00:00')))]
        ids={r['turbine_id'] for r in self.frames[0]}
        if any({r['turbine_id'] for r in frame} != ids for frame in self.frames):
            raise ValueError('Cada frame deve conter o mesmo conjunto de turbinas')
        self.replay_done=asyncio.Event()
        self.nodes={}

    async def __aenter__(self):
        from asyncua import Server, ua
        self.ua=ua
        self.server=Server()
        await self.server.init()
        self.server.set_endpoint(self.endpoint)
        self.server.set_server_name('CurtailIQ SIMULADO read-only')
        self.idx=await self.server.register_namespace(NAMESPACE)
        plant=await self.server.nodes.objects.add_object(self.idx,'Plant_DEMO_NE')
        self.frame_node=await plant.add_variable(ua.NodeId('Snapshot',self.idx),'Snapshot','[]')
        for row in self.frames[0]:
            turbine=await plant.add_object(self.idx,row['turbine_id'])
            for field,tag in TAGS.items():
                value=row[field]
                # Numeric missingness is represented as NaN in browsable tags, null in atomic frame.
                if field in FIELDS[2:11]:
                    value=float('nan') if value is None else float(value)
                node=await turbine.add_variable(ua.NodeId(f"{row['turbine_id']}/{tag}",self.idx),tag,value)
                self.nodes[(row['turbine_id'],field)]=node
        await self._publish(self.frames[0])
        await self.server.start()
        self.task=asyncio.create_task(self._replay())
        return self

    async def _publish(self,frame):
        for row in frame:
            for field in FIELDS:
                value=row[field]
                if field in FIELDS[2:11]:
                    value=float('nan') if value is None else float(value)
                await self.nodes[(row['turbine_id'],field)].write_value(value)
        # Atomic application snapshot avoids torn turbine/field reads during replay.
        payload=[{TAGS[k]:v for k,v in row.items()} for row in frame]
        await self.frame_node.write_value(json.dumps(payload,allow_nan=False))

    async def _replay(self):
        while True:
            for frame in self.frames[1:]:
                await asyncio.sleep(self.interval)
                await self._publish(frame)
            self.replay_done.set()
            if not self.loop:
                return
            await asyncio.sleep(self.interval)
            await self._publish(self.frames[0])

    async def __aexit__(self,*args):
        self.task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await self.task
        await self.server.stop()


async def read_snapshot(client):
    from asyncua import ua
    idx=await client.get_namespace_index(NAMESPACE)
    payload=json.loads(await client.get_node(ua.NodeId('Snapshot',idx)).read_value())
    reverse={v:k for k,v in TAGS.items()}
    try:
        return validate_rows([{reverse[k]:v for k,v in row.items()} for row in payload])
    except (KeyError,TypeError) as exc:
        raise ValueError('Snapshot/tag mapping invalido') from exc
