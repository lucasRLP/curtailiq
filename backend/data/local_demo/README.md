# CurtailIQ local demo samples

Generated from `backend/banco_mock/curtail_dw.sql.gz` by `backend/scripts/build_local_demo_samples.py`.
Catalog: 10 renewable plants with hourly COFF facts in 2026.
Focus plant: Praia Formosa (2026); it is sorted first in `usinas.csv` for demo navigation.
Curtailment intervals come from `dw.fato_restricao_coff_<year>` hourly/30-min facts, not from monthly marts.
Energy curtailed is computed as `max(val_geracaoreferencia - val_geracao, 0) * 0.5`.
Use with `DATA_BACKEND=mock` and `MOCK_DATA_DIR=data/local_demo`.
