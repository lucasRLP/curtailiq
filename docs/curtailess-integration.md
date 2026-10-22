# CurtaiLess → CurtailIQ integration boundary

This first integration increment establishes a backend contract, not a claim
that the CurtaiLess forecasting or maintenance pipeline is already connected.
It is designed to let the existing CurtailIQ API/services remain the system of
record for regulatory and financial calculations while exposure-oriented
capabilities are added behind explicit data and provenance boundaries.

## Product boundaries

- Curtailment exposure and forecasts are operational decision support. Each
  point carries an explicit evidence status (`observed`, `demonstrative`, or
  `forecast`), source, and as-of timestamp.
- Regulatory/financial outcomes continue to use CurtailIQ's deterministic
  domain services and official calculation inputs. An exposure forecast is
  never itself an entitlement or reimbursement amount.
- Asset-level exposure is a drill-down. It does not replace the ONS set as the
  primary regulatory/financial unit where the source data is set-level.
- DuckDB is a candidate local/demo adapter; the production source remains the
  curated data contract owned by the data pipeline. Do not add duplicate ONS
  ingestion to the application as part of this integration.

## Contract added

`backend/app/domain/exposure.py` defines validated `AssetExposure` and
`ExposurePoint` records. Energy quantities are named in MWh, probability is
bounded to [0, 1], timestamps must be unique and ascending, and provenance is
required. This is a domain boundary only; no API route, source adapter, or
forecast is wired by this change.

## Next increments

1. Map CurtaiLess historical exposure/quality outputs to this contract using
   fixtures, and document source grain, units, revisions, freshness, and keys.
2. Implement a repository interface with DuckDB for local/demo and the
   approved curated production source; contract-test missing/stale data.
3. Add read-only exposure endpoints and frontend screens consuming the same
   versioned response contract. Mark demo/forecast content visibly.
4. Integrate maintenance scheduling as a scenario service; validate its
   objective and assumptions before presenting savings as realized value.
5. Compare both BESS implementations on identical inputs and expected outputs
   before consolidating; retain one implementation only after parity tests.
6. Integrate Bedrock behind an optional narrative adapter. It may explain
   backend-computed facts but cannot invent values or decide eligibility.
7. Evaluate SAM/serverless components against CurtailIQ's current deployment
   before selecting infrastructure; avoid running duplicate backends.

## Correção R1 do contrato de exposição

A API implementada está em `/api/v1/exposure/entities` e `/{level}/{entity_id}/series`. O `mode=demo` usa exclusivamente `MockRepository` via provider local explícito, independente de `DATA_BACKEND` e de `get_repo`; dados de Postgres não são usados nem rotulados como fixture. `mode=observed` permanece sem provider aprovado: listagem retorna `availability.status=unavailable`, capability observed indisponível e série `source.name=not_configured`, sem pontos/fallback.

`submarket` tem default `NE` e aceita somente `NE` no escopo desta fixture (outro valor recebe 422). Série aceita `granularity=PT1H`; granularidades não suportadas recebem 422. Metadados de demo identificam `local_fixture`, versão `curtailiq-sample-csv-v1` e frescor `local_static_fixture`; observado não declara `curated_view` nem freshness confirmada. A evidência e detalhes da correção ficam em `docs/fusion/exposure-r1-handoff.md`; a especificação original permanece preservada e é complementada por adendo em `docs/fusion/implementation-spec.md`.


## Validation gate

Before connecting real sources, data owners must confirm asset identifiers,
time-zone convention, interval duration, source version/revisions, published
time versus event time, and freshness semantics. Forecast evaluation requires
point-in-time availability and leakage-safe chronological holdout. Demonstrative
fixtures must remain labeled as such in both API responses and UI.