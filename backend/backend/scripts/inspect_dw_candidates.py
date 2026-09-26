from sqlalchemy import create_engine, text
from app.config import get_settings

engine = create_engine(get_settings().database_url, pool_pre_ping=True)

TABLES = [
    'mart_restricao_eolica','mart_restricao_solar',
    'mart_eolica_usina_mensal','mart_solar_usina_mensal',
    'mart_eolica_mensal','mart_solar_mensal',
    'fato_restricao_coff','fato_geracao',
]

with engine.connect() as conn:
    print('== Candidate tables summary ==')
    for t in TABLES:
        exists = conn.execute(text("""
            select exists(select 1 from information_schema.tables where table_schema='dw' and table_name=:t)
        """), {'t': t}).scalar()
        if not exists:
            print(f'{t}: MISSING')
            continue
        cols = [r[0] for r in conn.execute(text("""
            select column_name from information_schema.columns
            where table_schema='dw' and table_name=:t order by ordinal_position
        """), {'t': t}).all()]
        print(f'\n[{t}]')
        print('columns=' + ', '.join(cols))
        date_col = 'din_instante' if 'din_instante' in cols else None
        if 'ano' in cols and 'mes' in cols:
            minmax = conn.execute(text(f'select min(ano*100+mes), max(ano*100+mes), count(*) from dw."{t}"')).one()
            print(f'period_yyyymm={minmax[0]}..{minmax[1]} rows={minmax[2]}')
        elif date_col:
            minmax = conn.execute(text(f'select min({date_col}), max({date_col}), count(*) from dw."{t}"')).one()
            print(f'period={minmax[0]}..{minmax[1]} rows={minmax[2]}')
        else:
            cnt = conn.execute(text(f'select count(*) from dw."{t}"')).scalar()
            print(f'rows={cnt}')
        for col in ['nom_usina','sk_usina','ceg','id_ons','nom_conjuntousina','nom_usina_conjunto']:
            if col in cols:
                val = conn.execute(text(f'select count(distinct "{col}") from dw."{t}"')).scalar()
                nn = conn.execute(text(f'select count(*) from dw."{t}" where "{col}" is not null')).scalar()
                print(f'distinct {col}={val} non_null_rows={nn}')
        if 'id_subsistema' in cols:
            subs = conn.execute(text(f"select id_subsistema, count(*) from dw.\"{t}\" group by 1 order by 2 desc nulls last")).all()
            print('subsistema=' + ', '.join(f'{a}:{b}' for a,b in subs[:8]))
        if 'fonte' in cols:
            fontes = conn.execute(text(f"select fonte, count(*) from dw.\"{t}\" group by 1 order by 2 desc nulls last")).all()
            print('fonte=' + ', '.join(f'{a}:{b}' for a,b in fontes[:8]))
        # sample rows focused on identification/measures
        sample_cols = [c for c in ['ano','mes','din_instante','id_subsistema','id_estado','fonte','nom_conjuntousina','nom_usina_conjunto','nom_usina','id_ons','ceg','sk_usina','potencia_mw','val_geracao','val_geracaoreferenciafinal','corte_mwh','perda_reais','n_intervalos'] if c in cols]
        if sample_cols:
            rows = conn.execute(text(f'select {", ".join(sample_cols)} from dw."{t}" limit 3')).mappings().all()
            print('sample=')
            for r in rows:
                print('  ' + str(dict(r)))

    print('\n== Dimensions health ==')
    for t in ['dim_usina','dim_usina_potencia','dim_geografia','dim_subsistema','dim_submercado','dim_data','dim_hora','dim_fonte_tipo']:
        cols = [r[0] for r in conn.execute(text("""
            select column_name from information_schema.columns
            where table_schema='dw' and table_name=:t order by ordinal_position
        """), {'t': t}).all()]
        cnt = conn.execute(text(f'select count(*) from dw."{t}"')).scalar()
        print(f'\n[{t}] rows={cnt} columns={", ".join(cols)}')
        for col in ['sk_usina','ceg_core','nom_usina','id_ons','lat','lon','potencia_mw','sk_geografia','id_estado','fonte']:
            if col in cols:
                nonnull = conn.execute(text(f'select count(*) from dw."{t}" where "{col}" is not null')).scalar()
                distinct = conn.execute(text(f'select count(distinct "{col}") from dw."{t}"')).scalar()
                print(f'  {col}: non_null={nonnull}, distinct={distinct}')
        if t == 'dim_usina':
            # NE renewable subset via geografia join
            q = text("""
                select coalesce(g.id_estado,'?') as uf, count(*) as n,
                       count(*) filter (where u.lat is not null and u.lon is not null) as com_coord
                from dw.dim_usina u left join dw.dim_geografia g on g.sk_geografia=u.sk_geografia
                where g."***" = 2 or g.id_estado in ('BA','CE','RN','PI','PE','PB','AL','SE','MA')
                group by 1 order by n desc limit 20
            """)
            for row in conn.execute(q):
                print(f'  NE uf {row[0]}: usinas={row[1]}, com_coord={row[2]}')
