# CurtailIQ — Data Warehouse (dump para importação)

Data warehouse dimensional (esquema **galaxy + floco**) do CurtailIQ, com dados
abertos ONS + ANEEL + CCEE. Recorte: **estados CE/BA/RN**, anos **2023–2026**,
amostra das **30 maiores usinas** por geração (banco reduzido para transporte).

Banco: `ons` · Schemas: `dw` (dimensões, 7 fatos, marts) e `stg_ccee` (staging).

## Arquivos

| arquivo | formato | como restaurar |
|---|---|---|
| `curtail_dw.dump` | pg_dump custom (`-Fc`, ~205 MB) | `pg_restore` (recomendado) |
| `curtail_dw.sql.gz` | SQL puro comprimido (~204 MB) | `psql` |

Requisito: **PostgreSQL 16+** (gerado no PG 18; usa tabelas particionadas por RANGE).

---

## Opção A — pg_restore (recomendado)

```bash
# 1. criar o banco de destino
createdb -U postgres ons

# 2. restaurar (schema + dados) em paralelo
pg_restore -U postgres -d ons --no-owner --no-privileges -j4 curtail_dw.dump
```

Restaurando direto num container Postgres:

```bash
docker exec -i <container> pg_restore -U <user> -d ons \
  --no-owner --no-privileges < curtail_dw.dump
```

## Opção B — psql (SQL puro)

```bash
createdb -U postgres ons
gunzip -c curtail_dw.sql.gz | psql -U postgres -d ons
```

---

## Conteúdo (linhas aproximadas)

- **Dimensões:** `dim_data` (1.461), `dim_hora` (48), `dim_usina` (29),
  `dim_geografia`, `dim_subsistema`, `dim_submercado`, `dim_fonte_tipo`.
- **Fatos (particionados por ano):** `fato_geracao` (~5,6 M), `fato_restricao_coff`
  (~7,0 M), `fato_fator_capacidade` (~4,5 M), `fato_restricao_detalhe` (~0,5 M),
  `fato_disponibilidade` (~0,5 M), `fato_balanco_dessem` (19 k),
  `fato_taxa_teif_teip` (1,3 k).
- **Marts (pré-agregados mensais):** `mart_geracao_mensal`, `mart_coff_mensal`,
  `mart_disponibilidade_mensal`, `mart_fatorcapacidade_mensal`.

> Os fatos são tabelas particionadas: consulte sempre a tabela-mãe
> (ex.: `dw.fato_geracao`), o Postgres roteia para as partições `_2023.._2026`.

## Verificação pós-restauração

```sql
SELECT schemaname, relname, n_live_tup
FROM pg_stat_user_tables
WHERE schemaname IN ('dw','stg_ccee')
ORDER BY 1,2;
```
