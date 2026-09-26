from __future__ import annotations

import csv
import gzip
import os
import re
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DUMP = ROOT / "banco_mock" / "curtail_dw.sql.gz"
DEFAULT_OUT = ROOT / "data" / "local_demo"
DEFAULT_FOCUS_USINA = "Praia Formosa"
DEFAULT_YEAR = 2026

COPY_RE = re.compile(r"COPY ([\w.]+) \((.*)\) FROM stdin;")


def _parse_value(value: str):
    return None if value == r"\N" else value


def _coerce_float(value, default=0.0) -> float:
    if value is None or value == "":
        return default
    try:
        return float(str(value).replace(",", "."))
    except Exception:
        return default


def fonte_to_key(value: str | None) -> str:
    raw = (value or "").strip().upper()
    if "EOL" in raw:
        return "eolica"
    if "SOL" in raw or "UFV" in raw or "FOTO" in raw:
        return "solar"
    return raw.lower() or "desconhecida"


def reason_to_label(cod: str | None) -> str:
    token = (cod or "").strip().upper()
    if token.startswith("CNF") or token.startswith("CF"):
        return "confiabilidade"
    if token.startswith("REL") or token.startswith("IE"):
        return "indisponibilidade_externa"
    if token.startswith("ENE") or token.startswith("EN"):
        return "energetico"
    return "indefinido"


def is_ressarcivel(cod_razao: str | None, cod_origem: str | None) -> bool:
    razao = (cod_razao or "").strip().upper()
    origem = (cod_origem or "").strip().upper()
    if origem == "LOC":
        return False
    return razao.startswith("CNF") or razao.startswith("REL")


def parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace(" ", "T"))
    except ValueError:
        return None


def iter_copy_rows(dump_path: Path, target_tables: set[str]):
    current_table: str | None = None
    current_cols: list[str] = []
    with gzip.open(dump_path, "rt", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            line = line.rstrip("\n")
            if current_table:
                if line == r"\.":
                    current_table = None
                    current_cols = []
                    continue
                values = line.split("\t")
                if len(values) == len(current_cols):
                    yield current_table, {col: _parse_value(val) for col, val in zip(current_cols, values)}
                continue
            match = COPY_RE.match(line)
            if match and match.group(1) in target_tables:
                current_table = match.group(1)
                current_cols = [c.strip() for c in match.group(2).split(",")]


def write_csv(path: Path, fieldnames: list[str], rows: Iterable[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def pld_demo(ts: datetime, fonte: str, razao: str | None) -> float:
    """PLD plausível e variável para demo local; o dump não traz tabela PLD."""
    hour = ts.hour + ts.minute / 60.0
    month_factor = (ts.month - 1) * 2.7
    weekend_factor = 8.0 if ts.weekday() >= 5 else 0.0
    if fonte == "solar":
        duck_curve = max(0.0, 1.0 - abs(hour - 18.0) / 6.0) * 70.0
        midday_discount = max(0.0, 1.0 - abs(hour - 12.0) / 3.0) * 28.0
        val = 135.0 + month_factor + weekend_factor + duck_curve - midday_discount
    else:
        val = 150.0 + month_factor + weekend_factor + max(0.0, 1.0 - abs(hour - 19.0) / 8.0) * 42.0
    if (razao or "").upper().startswith("CNF"):
        val += 18.0
    return round(max(val, 60.0), 2)


def solar_ramp(ts: datetime) -> float:
    hour = ts.hour + ts.minute / 60.0
    if hour < 5.5 or hour > 18.0:
        return 0.0
    if hour <= 12.0:
        return (hour - 5.5) / 6.5
    return max(0.0, (18.0 - hour) / 6.0)


def build_samples(dump_path: Path = DEFAULT_DUMP, out_dir: Path = DEFAULT_OUT) -> None:
    focus_name = os.environ.get("LOCAL_DEMO_USINA", DEFAULT_FOCUS_USINA).strip()
    year = int(os.environ.get("LOCAL_DEMO_YEAR", str(DEFAULT_YEAR)))
    target_tables = {
        "dw.dim_usina",
        f"dw.fato_restricao_coff_{year}",
        f"dw.fato_geracao_{year}",
        f"dw.fato_fator_capacidade_{year}",
    }

    dim_by_sk: dict[str, dict] = {}
    renewable_sks: set[str] = set()
    capacity_by_sk: dict[str, float] = defaultdict(float)
    generation_by_sk_ts: dict[tuple[str, str], float] = {}
    restriction_rows_by_sk: dict[str, list[dict]] = defaultdict(list)

    # `dim_usina` appears before the fact tables in the dump. We still keep the
    # code defensive and filter facts after each dim row has been seen.
    for table, row in iter_copy_rows(dump_path, target_tables):
        if table == "dw.dim_usina":
            sk = str(row.get("sk_usina"))
            dim_by_sk[sk] = row
            nome = (row.get("nom_usina") or "").strip().lower()
            fonte = fonte_to_key(row.get("fonte") or row.get("tipo"))
            if fonte in {"eolica", "solar"} and nome and "identificada" not in nome:
                renewable_sks.add(sk)
            continue

        sk = str(row.get("sk_usina"))
        if sk not in renewable_sks:
            continue
        ts_dt = parse_dt(row.get("din_instante"))
        if ts_dt is None:
            continue
        ts = ts_dt.isoformat()

        if table == f"dw.fato_fator_capacidade_{year}":
            cap = _coerce_float(row.get("val_capacidadeinstalada"))
            if cap > 0:
                capacity_by_sk[sk] = max(capacity_by_sk.get(sk, 0.0), cap)
        elif table == f"dw.fato_geracao_{year}":
            generation_by_sk_ts[(sk, ts)] = _coerce_float(row.get("val_geracao")) * 0.5
        elif table == f"dw.fato_restricao_coff_{year}":
            restriction_rows_by_sk[sk].append(row)

    focus_sk = next((sk for sk, row in dim_by_sk.items() if (row.get("nom_usina") or "").strip().lower() == focus_name.lower()), None)
    if not focus_sk:
        available = sorted((row.get("nom_usina") or "") for sk, row in dim_by_sk.items() if sk in renewable_sks)
        raise SystemExit(f"Usina foco não encontrada: {focus_name!r}. Disponíveis: {available}")

    constrained_rows: list[dict] = []
    ger_rows: dict[tuple[str, str], dict] = {}
    clima_rows: dict[tuple[str, str], dict] = {}
    pld_rows: dict[str, dict] = {}
    stats: dict[str, dict] = defaultdict(lambda: {"corte": 0.0, "ress": 0.0, "min_ts": None, "max_ts": None})

    for sk in sorted(renewable_sks, key=lambda x: int(x)):
        dim = dim_by_sk[sk]
        fonte = fonte_to_key(dim.get("fonte") or dim.get("tipo"))
        potencia = _coerce_float(dim.get("potencia_mw")) or capacity_by_sk.get(sk, 0.0)
        cap_half_hour = max(potencia * 0.5, 1.0)
        rows = restriction_rows_by_sk.get(sk, [])
        rows.sort(key=lambda r: str(r.get("din_instante") or ""))

        for row in rows:
            ts_dt = parse_dt(row.get("din_instante"))
            if ts_dt is None:
                continue
            ts = ts_dt.isoformat()
            cod_razao = row.get("cod_razao")
            cod_origem = row.get("cod_origem")
            ger_mwmed = _coerce_float(row.get("val_geracao"))
            ref_mwmed = _coerce_float(row.get("val_geracaoreferencia"))
            energia = max(ref_mwmed - ger_mwmed, 0.0) * 0.5
            if energia <= 0:
                continue
            ress = energia if is_ressarcivel(cod_razao, cod_origem) else 0.0
            preco = pld_demo(ts_dt, fonte, cod_razao)

            st = stats[sk]
            st["corte"] += energia
            st["ress"] += ress
            st["min_ts"] = ts if st["min_ts"] is None else min(st["min_ts"], ts)
            st["max_ts"] = ts if st["max_ts"] is None else max(st["max_ts"], ts)

            constrained_rows.append(
                {
                    "usina_id": sk,
                    "timestamp": ts,
                    "fonte": fonte,
                    "geracao_verificada_mwh": round(ger_mwmed * 0.5, 4),
                    "geracao_referencia_mwh": round(ref_mwmed * 0.5, 4),
                    "energia_restringida_mwh": round(energia, 4),
                    "energia_ressarcivel_mwh": round(ress, 4),
                    "razao_restricao": reason_to_label(cod_razao),
                    "cod_razaorestricao": cod_razao,
                    "cod_origemrestricao": cod_origem,
                    "origem_restricao": cod_origem,
                    "referencia_oficial": "true",
                    "referencia_calculo_curtailment": "mock_dw_fato_restricao_coff_horario",
                    "submercado": "NE",
                }
            )
            pld_rows[ts] = {"timestamp": ts, "submercado": "NE", "pld_reais_mwh": preco}

            ger_mwh = generation_by_sk_ts.get((sk, ts), ger_mwmed * 0.5)
            ger_rows[(sk, ts)] = {
                "usina_id": sk,
                "timestamp": ts,
                "geracao_mwh": round(ger_mwh, 4),
                "fator_capacidade": round(min(max(ger_mwh / cap_half_hour, 0.0), 1.0), 4),
            }
            ramp = solar_ramp(ts_dt)
            clima_rows[(sk, ts)] = {
                "usina_id": sk,
                "timestamp": ts,
                "irradiancia_wm2": round(980 * ramp, 2) if fonte == "solar" else 120,
                "vento_ms": 4.0 if fonte == "solar" else round(5.5 + 4.0 * min(max(ger_mwh / cap_half_hour, 0.0), 1.0), 2),
                "temperatura_c": round(25.0 + 7.5 * ramp + (1.0 if ts_dt.weekday() >= 5 else 0.0), 2),
                "is_forecast": "false",
            }

        # Add generation-only rows inside each plant's data window. This keeps
        # financial/BESS charts from looking like a flat sparse event-only series.
        st = stats[sk]
        if st["min_ts"] and st["max_ts"]:
            cursor = datetime.fromisoformat(st["min_ts"])
            end = datetime.fromisoformat(st["max_ts"])
            while cursor <= end:
                ts = cursor.isoformat()
                key = (sk, ts)
                if key in generation_by_sk_ts and key not in ger_rows:
                    ger_mwh = generation_by_sk_ts[key]
                    ger_rows[key] = {
                        "usina_id": sk,
                        "timestamp": ts,
                        "geracao_mwh": round(ger_mwh, 4),
                        "fator_capacidade": round(min(max(ger_mwh / cap_half_hour, 0.0), 1.0), 4),
                    }
                    ramp = solar_ramp(cursor)
                    clima_rows.setdefault(
                        key,
                        {
                            "usina_id": sk,
                            "timestamp": ts,
                            "irradiancia_wm2": round(980 * ramp, 2) if fonte == "solar" else 120,
                            "vento_ms": 4.0 if fonte == "solar" else round(5.5 + 4.0 * min(max(ger_mwh / cap_half_hour, 0.0), 1.0), 2),
                            "temperatura_c": round(25.0 + 7.5 * ramp, 2),
                            "is_forecast": "false",
                        },
                    )
                cursor += timedelta(minutes=30)

    usina_rows: list[dict] = []
    for sk, st in stats.items():
        corte = st["corte"]
        if corte <= 0:
            continue
        dim = dim_by_sk[sk]
        fonte = fonte_to_key(dim.get("fonte") or dim.get("tipo"))
        potencia = _coerce_float(dim.get("potencia_mw")) or capacity_by_sk.get(sk, 0.0)
        ress = st["ress"]
        pct = ress / corte * 100.0 if corte else 0.0
        usina_rows.append(
            {
                "usina_id": sk,
                "nome": dim.get("nom_usina") or f"Usina {sk}",
                "fonte": fonte,
                "potencia_mw": round(potencia, 3),
                "submercado": "NE",
                "latitude": dim.get("lat"),
                "longitude": dim.get("lon"),
                "id_ons": dim.get("id_ons"),
                "ceg": dim.get("ceg_core"),
                "garantia_fisica_mwm": round(potencia * 0.55, 3) if potencia else None,
                "total_corte_mwh": round(corte, 3),
                "total_ressarcivel_mwh": round(ress, 3),
                "percentual_ressarcivel": round(pct, 2),
                "data_inicio": st["min_ts"],
                "data_fim": st["max_ts"],
                "nivel_granularidade": "mock_dw_fato_restricao_coff_horario",
            }
        )

    usina_rows.sort(key=lambda r: (0 if r["nome"].lower() == focus_name.lower() else 1, r["fonte"], -float(r["total_corte_mwh"])))
    rank_by_fonte: dict[str, int] = defaultdict(int)
    for row in usina_rows:
        rank_by_fonte[row["fonte"]] += 1
        row["fonte_rank"] = rank_by_fonte[row["fonte"]]

    selected_ids = {row["usina_id"] for row in usina_rows}
    constrained_rows = [row for row in constrained_rows if row["usina_id"] in selected_ids]
    ger_rows_out = [ger_rows[key] for key in sorted(ger_rows, key=lambda k: (int(k[0]), k[1])) if key[0] in selected_ids]
    clima_rows_out = [clima_rows[key] for key in sorted(clima_rows, key=lambda k: (int(k[0]), k[1])) if key[0] in selected_ids]
    pld_needed = {row["timestamp"] for row in constrained_rows}
    pld_rows_out = [pld_rows[ts] for ts in sorted(pld_rows) if ts in pld_needed]

    write_csv(
        out_dir / "usinas.csv",
        [
            "usina_id", "nome", "fonte", "potencia_mw", "submercado", "latitude", "longitude",
            "id_ons", "ceg", "garantia_fisica_mwm", "total_corte_mwh", "total_ressarcivel_mwh",
            "percentual_ressarcivel", "fonte_rank", "data_inicio", "data_fim", "nivel_granularidade",
        ],
        usina_rows,
    )
    write_csv(
        out_dir / "constrained_off.csv",
        [
            "usina_id", "timestamp", "fonte", "geracao_verificada_mwh", "geracao_referencia_mwh",
            "energia_restringida_mwh", "energia_ressarcivel_mwh", "razao_restricao", "cod_razaorestricao",
            "cod_origemrestricao", "origem_restricao", "referencia_oficial", "referencia_calculo_curtailment", "submercado",
        ],
        constrained_rows,
    )
    write_csv(out_dir / "pld_horario.csv", ["timestamp", "submercado", "pld_reais_mwh"], pld_rows_out)
    write_csv(out_dir / "geracao_horaria.csv", ["usina_id", "timestamp", "geracao_mwh", "fator_capacidade"], ger_rows_out)
    write_csv(
        out_dir / "clima_horario.csv",
        ["usina_id", "timestamp", "irradiancia_wm2", "vento_ms", "temperatura_c", "is_forecast"],
        clima_rows_out,
    )
    (out_dir / "README.md").write_text(
        "# CurtailIQ local demo samples\n\n"
        "Generated from `backend/banco_mock/curtail_dw.sql.gz` by `backend/scripts/build_local_demo_samples.py`.\n"
        f"Catalog: {len(usina_rows)} renewable plants with hourly COFF facts in {year}.\n"
        f"Focus plant: {focus_name} ({year}); it is sorted first in `usinas.csv` for demo navigation.\n"
        "Curtailment intervals come from `dw.fato_restricao_coff_<year>` hourly/30-min facts, not from monthly marts.\n"
        "Energy curtailed is computed as `max(val_geracaoreferencia - val_geracao, 0) * 0.5`.\n"
        "Use with `DATA_BACKEND=mock` and `MOCK_DATA_DIR=data/local_demo`.\n",
        encoding="utf-8",
    )
    print(
        f"Generated plants={len(usina_rows)} focus={focus_name} rows={len(constrained_rows)} "
        f"geracao_rows={len(ger_rows_out)} pld_rows={len(pld_rows_out)} out={out_dir}"
    )


if __name__ == "__main__":
    build_samples()
