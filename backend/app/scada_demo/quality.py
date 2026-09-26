"""Deterministic quality flags; not a turbine fault diagnosis."""
from collections import defaultdict
from datetime import datetime
from math import isfinite
from .codec import validate_rows


def assess_quality(rows, nominal_kw):
    if not isfinite(nominal_kw) or nominal_kw <= 0:
        raise ValueError('nominal_kw deve ser positivo')
    rows=validate_rows(rows)
    groups=defaultdict(list)
    alerts=[]
    for row in rows:
        groups[row['turbine_id']].append(row)
    for turbine, samples in groups.items():
        samples.sort(key=lambda r:datetime.fromisoformat(r['ts'].replace('Z','+00:00')))
        previous=None
        same_since=None
        for row in samples:
            ts=datetime.fromisoformat(row['ts'].replace('Z','+00:00'))
            codes=[]
            if row['potencia_kw'] is not None and row['potencia_kw'] > nominal_kw:
                codes.append('acima_nominal')
            if previous:
                last, last_ts=previous
                if (ts-last_ts).total_seconds() != 600:
                    codes.append('lacuna')
                    same_since=ts
                elif row['vento_ms'] is not None and row['vento_ms'] == last['vento_ms']:
                    if same_since is None:
                        same_since=last_ts
                    if (ts-same_since).total_seconds() > 3600:
                        codes.append('vento_travado')
                else:
                    same_since=ts
            for code in codes:
                alerts.append(dict(turbine_id=turbine,ts=row['ts'],code=code,severity='warning',
                                   message='Sinal de qualidade; requer revisão, não confirma falha.'))
            if codes and row['qualidade'] == 'ok':
                row['qualidade']='suspeito'
            previous=(row,ts)
    return dict(rows=rows,alerts=alerts,is_simulated=True)
