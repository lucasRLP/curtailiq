"""Explicitly synthetic fixtures: no ONS/Kelmarsh observations or calibration."""
import asyncio
import csv
import socket
import sqlite3
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def sample():
    return dict(turbine_id="SYNTH-01", ts="2026-01-05T00:00:00Z", vento_ms=8.5,
                potencia_kw=1200.0, potencia_disponivel_kw=1500.0, setpoint_kw=1200.0,
                pitch_graus=2.0, rotor_rpm=12.0, temp_nacele_c=30.0,
                temp_mancal_gerador_c=None, temp_mancal_caixa_c=45.0,
                status="operando", qualidade="suspeito", is_simulated=True,
                fonte_ingestao="fixture_sintetica_sem_calibracao")


def test_csv_roundtrip_and_sqlite_idempotence(tmp_path):
    from app.scada_demo import export_csv, import_csv, store_readings
    row = sample()
    path = tmp_path / "scada.csv"
    assert export_csv([row], path) == 1
    assert import_csv(path) == [row]
    assert import_csv(path)[0]["is_simulated"] is True
    assert import_csv(path)[0]["temp_mancal_gerador_c"] is None
    db = tmp_path / "readings.sqlite"
    assert store_readings([row], db) == 1
    assert store_readings([row], db) == 0
    with sqlite3.connect(db) as conn:
        assert conn.execute("select count(*) from readings").fetchone()[0] == 1
    changed = dict(row, potencia_kw=1100.0)
    with pytest.raises(ValueError, match="conflit"):
        store_readings([changed], db)


@pytest.mark.parametrize("change", [
    {"is_simulated": False}, {"is_simulated": "true"}, {"vento_ms": -1},
    {"potencia_kw": 1600}, {"rotor_rpm": float("nan")},
    {"ts": "2026-01-05T00:00:00"}, {"status": "parada", "potencia_kw": 1},
    {"qualidade": "boa"}, {"potencia_kw": True}, {"extra": 42},
])
def test_invalid_rows(change):
    from app.scada_demo import validate_rows
    with pytest.raises(ValueError):
        validate_rows([dict(sample(), **change)])


def test_duplicates_normalize_timestamp():
    from app.scada_demo import validate_rows
    with pytest.raises(ValueError, match="duplic"):
        validate_rows([sample(), dict(sample(), ts="2026-01-04T21:00:00-03:00")])


def test_csv_rejects_bad_header_and_untyped_bool(tmp_path):
    from app.scada_demo import export_csv, import_csv
    path = tmp_path / "bad.csv"
    path.write_text("unknown\nvalue\n", encoding="utf-8")
    with pytest.raises(ValueError):
        import_csv(path)
    export_csv([sample()], path)
    with path.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.reader(handle))
    rows[1][rows[0].index("is_simulated")] = '"true"'
    with path.open("w", newline="", encoding="utf-8") as handle:
        csv.writer(handle).writerows(rows)
    with pytest.raises(ValueError):
        import_csv(path)


def test_localhost_only():
    from app.scada_demo.opcua import check_endpoint
    for endpoint in ["opc.tcp://0.0.0.0:4840/demo/", "opc.tcp://example.com:4840/", "https://localhost:4840/"]:
        with pytest.raises(ValueError):
            check_endpoint(endpoint)
    check_endpoint("opc.tcp://127.0.0.1:4840/demo/")


def test_real_opcua_loopback_readonly_and_replay():
    pytest.importorskip("asyncua")
    from asyncua import Client, ua
    from app.scada_demo.opcua import DemoServer, read_snapshot, NAMESPACE, TAGS

    async def exercise():
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        endpoint = f"opc.tcp://127.0.0.1:{port}/demo/"
        first = sample()
        second = dict(first, ts="2026-01-05T00:10:00Z", potencia_kw=900.0,
                      temp_mancal_gerador_c=48.0, qualidade="ok")
        async with DemoServer([first, second], endpoint=endpoint, interval=0.1, loop=False) as server:
            async with Client(endpoint) as client:
                idx = await client.get_namespace_index(NAMESPACE)
                node = client.get_node(ua.NodeId(f"SYNTH-01/{TAGS['potencia_kw']}", idx))
                with pytest.raises(ua.UaStatusCodeError) as error:
                    await node.write_value(1.0)
                assert error.value.code == ua.StatusCodes.BadUserAccessDenied or error.value.code == ua.StatusCodes.BadNotWritable
                await asyncio.wait_for(server.replay_done.wait(), 5)
                assert await read_snapshot(client) == [second]
        # Listener really stopped: same port can be used by another server.
        async with DemoServer([first], endpoint=endpoint, interval=1):
            async with Client(endpoint) as client:
                assert await read_snapshot(client) == [first]
    asyncio.run(exercise())


def test_quality_checks_and_canonical_stops():
    from app.scada_demo import validate_rows
    from app.scada_demo.quality import assess_quality
    good = dict(sample(), temp_mancal_gerador_c=48, qualidade='ok')
    assert validate_rows([dict(good, setpoint_kw=None)])[0]['qualidade'] == 'ok'
    for status in ['parada_manutencao','parada_falha','parada_rede','unknown']:
        with pytest.raises(ValueError):
            validate_rows([dict(good,status=status)])
    with pytest.raises(ValueError):
        validate_rows([dict(good,setpoint_kw=500)])
    with pytest.raises(ValueError):
        validate_rows([dict(good,temp_mancal_gerador_c=None)])
    from datetime import datetime,timedelta,timezone
    start=datetime(2026,1,5,tzinfo=timezone.utc)
    rows=[dict(good,ts=(start+timedelta(minutes=10*i)).isoformat()) for i in range(9)]
    result=assess_quality(rows,nominal_kw=1000)
    assert {'acima_nominal','vento_travado'} <= {a['code'] for a in result['alerts']}
    result=assess_quality([rows[0],rows[2]],nominal_kw=3000)
    assert any(a['code']=='lacuna' for a in result['alerts'])


def test_cli_export_and_report(tmp_path):
    import subprocess
    root=Path(__file__).resolve().parents[1]
    out=tmp_path/'demo'
    run=subprocess.run([sys.executable,str(root/'scripts'/'scada_demo.py'),'export','--days','1','--output',str(out)],cwd=root,capture_output=True,text=True)
    assert run.returncode == 0, run.stderr
    import json
    from app.scada_demo import import_csv
    payload=json.loads((out/'scenario.json').read_text(encoding='utf-8'))
    assert len(import_csv(out/'scada.csv')) == len(payload['scada'])
    assert (out/'report.md').exists()
    manifest=json.loads((out/'manifest.json').read_text(encoding='utf-8'))
    import hashlib
    assert manifest['files']['scenario.json'] == hashlib.sha256((out/'scenario.json').read_bytes()).hexdigest()
    assert manifest['is_simulated'] is True


def test_replay_orders_fractional_timestamps_chronologically():
    from app.scada_demo.opcua import DemoServer
    first=sample()
    later=dict(first,ts='2026-01-05T00:00:00.500000Z')
    server=DemoServer([later,first])
    assert server.frames[0][0]['ts'] == first['ts']


@pytest.mark.parametrize('quality',['ausente','interpolado'])
def test_quality_preserves_missingness_and_interpolation(quality):
    from app.scada_demo.quality import assess_quality
    row=dict(sample(),qualidade=quality)
    result=assess_quality([row],nominal_kw=1000)
    assert result['alerts'][0]['code'] == 'acima_nominal'
    assert result['rows'][0]['qualidade'] == quality


