"""Strict canonical interchange for explicitly simulated SCADA only."""
import csv
import json
import math
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

FIELDS = ('turbine_id', 'ts', 'vento_ms', 'potencia_kw', 'potencia_disponivel_kw',
          'setpoint_kw', 'pitch_graus', 'rotor_rpm', 'temp_nacele_c',
          'temp_mancal_gerador_c', 'temp_mancal_caixa_c', 'status', 'qualidade',
          'is_simulated', 'fonte_ingestao')
NUMERIC = FIELDS[2:11]
TEXT = ('turbine_id', 'ts', 'status', 'qualidade', 'fonte_ingestao')


def validate_rows(rows):
    """Return canonical UTC rows; reject coercion, duplicates and lost quality."""
    result, seen = [], set()
    for original in rows:
        if not isinstance(original, dict) or set(original) != set(FIELDS):
            raise ValueError('Campos SCADA divergentes do contrato v1')
        row = dict(original)
        if row['is_simulated'] is not True:
            raise ValueError('Somente is_simulated=true booleano')
        for field in TEXT:
            if not isinstance(row[field], str) or not row[field].strip():
                raise ValueError(f'{field}: texto obrigatorio')
        if not re.fullmatch(r'[A-Za-z0-9_.-]{1,80}', row['turbine_id']):
            raise ValueError('turbine_id invalido')
        try:
            stamp = datetime.fromisoformat(row['ts'].replace('Z', '+00:00'))
            if stamp.tzinfo is None or stamp.utcoffset() is None:
                raise ValueError('timezone ausente')
            row['ts'] = stamp.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')
        except (ValueError, OverflowError) as exc:
            raise ValueError('ts deve ser ISO 8601 com timezone') from exc
        if row['qualidade'] not in {'ok', 'suspeito', 'ausente', 'interpolado'}:
            raise ValueError('qualidade desconhecida')
        for field in NUMERIC:
            value = row[field]
            if value is None:
                if row['qualidade'] == 'ok' and field != 'setpoint_kw':
                    raise ValueError('qualidade boa nao permite sensor null')
                continue
            if type(value) not in (int, float) or not math.isfinite(value):
                raise ValueError(f'{field}: numero finito ou null esperado')
            if field in NUMERIC[:4] + ('rotor_rpm',) and value < 0:
                raise ValueError(f'{field}: negativo')
            row[field] = float(value)
        power, available = row['potencia_kw'], row['potencia_disponivel_kw']
        if power is not None and available is not None and power > available + 1e-6:
            raise ValueError('potencia excede disponibilidade')
        if row['status'] not in {'operando', 'limitada', 'parada_manutencao', 'parada_falha', 'parada_rede', 'desconhecido'}:
            raise ValueError('status desconhecido')
        if row['status'].startswith('parada_') and power not in (None, 0):
            raise ValueError('parada deve produzir zero')
        if power is not None and row['setpoint_kw'] is not None and power > row['setpoint_kw'] + 1e-6:
            raise ValueError('potencia excede setpoint')
        key = (row['turbine_id'], row['ts'])
        if key in seen:
            raise ValueError('Leitura duplicada turbine_id/ts')
        seen.add(key)
        result.append(row)
    return result


def export_csv(rows, path):
    rows = validate_rows(rows)
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', newline='', encoding='utf-8') as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: value if key in TEXT else json.dumps(value, allow_nan=False)
                             for key, value in row.items()})
    return len(rows)


def import_csv(path):
    with Path(path).open(newline='', encoding='utf-8-sig') as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != list(FIELDS):
            raise ValueError('Cabecalho CSV divergente do contrato v1')
        rows = []
        for line in reader:
            if None in line or any(value is None for value in line.values()):
                raise ValueError('Numero de colunas CSV incorreto')
            rows.append({key: value if key in TEXT else json.loads(value)
                         for key, value in line.items()})
    return validate_rows(rows)


def store_readings(rows, path):
    """Append-only local SQLite. Identical retries are no-ops; conflicts rollback."""
    rows = validate_rows(rows)
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(path) as conn:
        conn.execute('CREATE TABLE IF NOT EXISTS readings ('
                     'turbine_id TEXT NOT NULL, ts TEXT NOT NULL, payload TEXT NOT NULL, '
                     'PRIMARY KEY(turbine_id, ts))')
        conn.execute('BEGIN IMMEDIATE')
        inserted = 0
        for row in rows:
            key = (row['turbine_id'], row['ts'])
            payload = json.dumps(row, sort_keys=True, ensure_ascii=False, allow_nan=False)
            old = conn.execute('SELECT payload FROM readings WHERE turbine_id=? AND ts=?', key).fetchone()
            if old:
                if old[0] != payload:
                    raise ValueError(f'Leitura conflitante: {key}')
            else:
                conn.execute('INSERT INTO readings VALUES (?, ?, ?)', (*key, payload))
                inserted += 1
    return inserted
