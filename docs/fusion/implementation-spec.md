# Especificação executável de integração CurtaiLess → CurtailIQ

Data: 2026-10-21. Documento de planejamento consolidado a partir de `docs/curtailess-integration.md`, `docs/fusion/audit-backend.md`, `audit-frontend.md`, `audit-economics-infra.md`, respectivas evidências e handoffs dos pais `t_fb3dbb9b`, `t_88d28f1b`, `t_c3f7e127`, `t_8c7d093c`. Não implementa nem altera código de aplicação. Alvo: uma fatia local backend-first, sem segundo backend/frontend e sem duplicação de ETL.

## 1. Decisão e estatuto das afirmações

CurtailIQ permanece aplicação e fonte de verdade para cálculos financeiros/regulatórios. CurtaiLess fornece padrões e capacidades candidatas, não uma integração de runtime existente. A primeira entrega funcional deve expor histórico observado e exposição claramente demonstrativa por um adapter no repositório CurtailIQ, usando dados locais controlados. Forecast validado, manutenção acionável, BESS físico integrado e IA ficam fora da primeira fatia.

Convenções usadas neste documento:
- **Inspecionado**: observado nos arquivos de código/testes das auditorias; não implica integração produtiva.
- **Novo**: contrato/arquivo/rota propostos, inexistentes no checkout descrito.
- **Requer validação**: depende de contrato de dados, decisão de domínio, revisão jurídica/segurança ou evidência ainda ausente.

Não há impedimento jurídico identificado para escrever código de integração: CurtaiLess declara licença MIT e os pais relatam que nenhum código/dado CurtaiLess foi copiado. MIT permite reuso de código sujeito à preservação do aviso de copyright/permissão. Isso não cobre automaticamente dados, artefatos, marcas ou licença do CurtailIQ; confirmar a licença do destino e direitos/licenças das fontes antes de copiar código ou dados. Não copiar bundles, Parquet, modelo nem infraestrutura CurtaiLess na fatia inicial.

## 2. Estado efetivamente inspecionado e lacunas

### CurtailIQ (implementado no checkout; limitações preservadas)
- FastAPI em `backend/app/main.py`; DI em `deps.py` seleciona `MockRepository` ou `PostgresRepository`; `BaseRepository` já abstrai catálogo, COFF, PLD, geração, clima e algumas séries. Mock lê CSV local. Postgres contém consultas candidatas DW/public, mas não houve consulta a banco nem confirmação de schema/freshness produtiva.
- Rotas existentes incluem `/api/usinas`, detalhe/resumo/risco, `/api/usinas/{id}/perda`, `/exposicao`, `/previsao-perdas` e `/bess/simular`; estão em `routers/usinas.py` e `routers/financeiro.py`. A existência de rota não prova operação íntegra: baseline registrou falhas em `FinanceiroPolicy.is_elegivel` e erros de temp Windows (detalhes em `audit-backend.md`). Resolver/retestar esses problemas em escopo próprio, não ocultá-los nesta integração.
- `backend/app/domain/exposure.py` define `AssetExposure`/`ExposurePoint`, mas é contrato isolado sem rota, fonte ou adapter conectado. Seus campos atuais não bastam para wire contract: faltam escopo entidade/conjunto, intervalo/duração, UTC obrigatório, semântica observed vs proxy, publication/event time, revisão e lineage. O campo `probability` obrigatório em qualquer ponto conflita com observação e demo sem probabilidade válida. O contrato proposto abaixo corrige essas insuficiências; migrar com testes e não presumir compatibilidade do modelo atual.
- NE é escopo padrão do MVP. Preferir chave canônica confirmada por dados (UF `MA, PI, CE, RN, PB, PE, AL, SE, BA` e/ou submercado Nordeste conforme contrato oficial). Identificadores não são intercambiáveis: `id_ons`, CEG, `id_ons_conjunto`, `id_ons_usina` e IDs mock exigem mapeamento com vigência; CEG pode ser fallback se `id_ons` faltar, nunca inferência cega.
- `backend/app/engines/maintenance_cost.py` é cenário determinístico intervalar, não API observada. `operation_demo` é simulação sintética. `BessService` legado não modela SOC/dispatch cronológico consistente; não o apresentar como dimensionamento físico. `FinanceiroPolicy`/`RegulatorioPolicy` e motores econômicos não equivalem automaticamente a cálculo oficial.

### CurtaiLess (origem somente leitura no SHA e33efc3c9e5b3c5e4cccd87fdb892b9edacda13a)
- API FastAPI tem rotas `/v1/...`; exposure view combina bundle demonstrativo e eventualmente histórico/identidade DynamoDB. O forecast servido é artefato bundle e `demonstrative_simulation`; não equivale a previsão operacional validada.
- DuckDB é usado em processamento offline Parquet/materialização, não como repository da API. Runtime API usa repository DynamoDB configurável e arquivos bundle em alguns caminhos. Não portar essa camada como backend paralelo nem tratar conexão produtiva como comprovada.
- Histórico por usina inclui estimativa/alocação de valores do conjunto; não é medição regulatória independente por usina. Conjunto ONS continua unidade primária regulatória/financeira e usina é drill-down técnico, com alocação explicitamente marcada como estimativa.
- Front CurtaiLess inclui fetch real de endpoints e também fixtures/simuladores locais; fetch HTTP bem-sucedido não certifica origem dos números. Manutenção/BESS frontend são, em parte, cálculos/fixtures demonstrativos.

## 3. Modelo canônico proposto e grão

Novo modelo versionado `ExposureSeriesV1` (Pydantic extra=forbid) independente do nome legado `AssetExposure`; resposta sempre identifica uma entidade e sua unidade de observação. Valores de energia são MWh no intervalo; potência é MW. `interval_start` é inclusivo, `interval_end` exclusivo, ambos RFC3339 UTC; `duration_h` deve concordar com diferença temporal dentro de tolerância declarada. Não misturar total do conjunto com soma de usinas no mesmo total.

Campos de série/metadata mínimos:
- `schema_version: "exposure.v1"`; `mode: "observed" | "demo" | "forecast"`.
- `entity: {level: "ons_group" | "plant", id: string, ceg?: string, ons_group_id?: string}`. O grupo ONS é obrigatório para afirmações regulatórias; campo ausente impede afirmação regulatória, mas pode permitir drill-down explicitamente não conciliado.
- `period: {start, end, timezone: "UTC"}`, `source: {name, version, revision?, license_ref?}`, `as_of`, `published_at?`, `input_digest?`, `lineage[]`.
- `quality: {status: "ok"|"partial"|"stale"|"unavailable", coverage_ratio?, missing_intervals?, duplicate_count, limitations[]}`. Não inventar `coverage_ratio` se denominador não é conhecido.
- `points[]`: `{interval_start, interval_end, duration_h, expected_generation_mwh?, curtailed_mwh?, reference_final_mw?, generation_mw?, curtailed_energy_mwh?, reason_code?, evidence_kind: "measured"|"allocated_estimate"|"scenario"|"forecast", probability?: number, lower_mwh?: number, upper_mwh?: number}`. Campos nullable ficam omitidos quando não aplicáveis. `probability` só existe para evento probabilístico de forecast validado; não usar 0/0.5 como default.
- Eventos COFF são outra entidade/modelo: intervalos brutos não são eventos finais. Para medição baseada nos campos disponíveis: `max(referenciafinal_mw - geracao_mw, 0) * duration_h`; `val_geracaolimitada` é metadado operacional/entrada indireta à referência final, nunca energia cortada diretamente. Agrupar intervalos em evento apenas com regra/identificador temporal de continuidade documentado; sem somar linha como evento final. Distinguir total do conjunto de alocação individual.

### Resolução de identidade
Adapter mantém/consulta um mapeamento efetivo-datado (`source_system`, `source_id`, `entity_level`, `ceg`, `ons_group_id`, `valid_from`, `valid_to`, `mapping_status`, `evidence_ref`). `id_ons` é preferido somente na semântica confirmada do dataset; CEG é fallback quando `id_ons` não existe e há correspondência inequívoca vigente. Nome/UF apenas gera candidato a revisão, não merge automático. Relações muitos-para-muitos ou sem vigência retornam qualidade `partial`/`unavailable`, não duplicam nem somam registros.

## 4. API proposta (novo namespace; rotas atuais não renomeadas)

Não mudar contratos `/api/...` existentes na primeira entrega. Criar prefixo explícito `/api/v1/exposure` para rotas novas; `schema_version` em todo envelope e `api_contract_version: "v1"` no metadata. Erro padrão segue formato existente `api_error` se compatível; formalizar `{error:{code,detail,context?}, metadata:{api_contract_version:"v1"}}` e testar antes de frontend. Endpoints novos são **propostos, não implementados**.

1. `GET /api/v1/exposure/entities?submarket=NE&level=ons_group|plant&limit=50&offset=0&mode=observed|demo`
   Retorna `items` com identidade, tecnologia/UF, grupo ONS, `available_modes`, qualidade/cobertura; mais `total_count,limit,offset,metadata`. NE é default server-side; override somente configuração explícita autorizada. Totais contam dataset inteiro antes da paginação. Não duplicar `/api/usinas` como catálogo concorrente: reutilizar repository/catálogo atual e enriquecer capabilities.
2. `GET /api/v1/exposure/{level}/{entity_id}/series?mode=observed&start=RFC3339&end=RFC3339&granularity=PT30M&limit=500&offset=0`
   Resposta concreta:
   ```json
   {
     "schema_version":"exposure.v1",
     "entity":{"level":"ons_group","id":"<id-confirmado>"},
     "mode":"observed",
     "period":{"start":"2026-01-01T00:00:00Z","end":"2026-01-02T00:00:00Z","timezone":"UTC"},
     "source":{"name":"curated_view","version":"unconfirmed","revision":null},
     "as_of":"2026-01-03T00:00:00Z",
     "quality":{"status":"partial","limitations":["Exemplo estrutural; fonte e valores não são reais"]},
     "points":[{"interval_start":"2026-01-01T00:00:00Z","interval_end":"2026-01-01T00:30:00Z","duration_h":0.5,"reference_final_mw":10,"generation_mw":6,"curtailed_energy_mwh":2,"evidence_kind":"measured"}],
     "pagination":{"total_count":1,"limit":500,"offset":0},
     "metadata":{"api_contract_version":"v1","mvp_scope_applied":true,"mvp_scope":"geradoras_renovaveis_submercado_ne"}
   }
   ```
   O exemplo é schema ilustrativo, não observação de produção. Evento bruto/exposição por usina usa rota ou parâmetro explícito de nível e nunca se confunde com conjunto.
3. `GET /api/v1/exposure/{level}/{entity_id}/forecast?issued_before=...&start=...&end=...`
   **Fase futura, bloqueada por validação**. Só servir forecast se existir modelo/artefato com emissão, cutoff, lineage e validação temporal holdout. Sem tais gates responder capability unavailable (HTTP 501 ou envelope padronizado, decidir no contrato) em vez de rotular média/fallback como forecast validado. `mode=demo` nunca usa rota forecast.
4. `POST /api/v1/maintenance/rank` e `POST /api/v1/bess/screen` são endpoints futuros opcionais, sem imitar nomes CurtaiLess semântica/compatibilidade. Seus requests/responses precisam versão, baseline, modo, premissas, custos separados, limitações e evidência. Não acionam decisão operacional; manutenção persistida exige autorização/idempotência separada.
5. IA/narrativa: sem endpoint na primeira fatia. Fase posterior pode `POST /api/v1/exposure/{level}/{entity_id}/explanation` sobre fatos/IDs calculados, retornando referências, versão e aviso. Desligada por default, fallback determinístico; modelo não altera números, elegibilidade ou status de fonte.

### Modos e envelope de demo
- `observed`: apenas dado publicado/apurado com fonte, revisão, timestamp de publicação/as-of e unidade validados. Valores ausentes permanecem ausentes; qualidade incompleta visível.
- `demo`: fixtures locais identificadas por `source.name="local_fixture"`, `evidence_kind="scenario"`, `quality.limitations` e aviso `"DEMONSTRACAO — não é previsão validada, economia realizada ou direito a ressarcimento"`. Sem probabilidade calibrada.
- `forecast`: não habilitar nesta fase. Futuro requer model ID/version, `issued_at`, `available_at`/cutoff, `valid_time`, source revisions, baseline, janela de treino/holdout e métricas independentes. Ponto publicado depois do cutoff nunca entra como feature daquele forecast. Split cronológico sozinho não elimina leakage; features/joins precisam respeitar disponibilidade point-in-time. Não reutilizar estimativas CurtaiLess como previsão oficial.

## 5. Repository/adapter e fontes sem leakage

Estender a fronteira `BaseRepository` ou criar protocolo complementar `ExposureRepository` injetável pelo `get_repo`; não criar conexão paralela de serving. Métodos propostos: `list_exposure_entities(scope, level, mode, limit, offset)`, `get_exposure_series(entity, level, mode, start, end, as_of, granularity)`, `get_identity_mapping(...)`, e `get_capabilities()`. Retornar records normalizados tipados, não SQL cru. Adapter é responsável por parsing de timestamp/timezone, unidade, dedup por chave e revisão e preservação da proveniência; serviços aplicam regras de domínio. Ingestão, ETL, consolidação de Parquet, materialização, scheduler e acesso ONS ficam fora do backend, sob equipe de dados.

Ordem do provider: primeiro mock/fixtures reprodutíveis locais para demo e testes; provider Postgres só quando o owner confirmar views/schema read-only e `as_of`/revision; não consultar DB/AWS durante implementação sem nova autorização. Não habilitar leitura CurtaiLess DynamoDB, bundle ou DuckDB em produção. Um provider ausente ou sem capability retorna status indisponível, nunca fallback silencioso para dados demonstrativos na rota observed.

Sem leakage: toda observação/feature precisa `event_time`, `published_at` (ou `available_at` confiável), source revision e `as_of`. Query `as_of` exclui publicação posterior; revisões não sobrescrevem silenciosamente snapshots já avaliados. Guardar manifest/digest dos inputs e model version. Holdout é cronológico e separado de seleção/calibração; registrar baseline simples e métricas (erro de energia, Brier/calibração somente quando probabilidade pertinente) por horizonte e coorte. Ausência de publication vintage impede chamar resultado forecast backtest point-in-time.

## 6. Precedência de motores: manutenção, BESS e regulação

1. Cálculo oficial de COFF/financeiro é isolado, determinístico e independente de cenário/manutenção/BESS/LLM. Consolidar primeiro os intervalos e aplicar fórmula normativa conforme contrato e fonte oficial; não inferir elegibilidade de razão prevista. Gate de `FinanceiroPolicy.is_elegivel` em baseline deve ser resolvido separadamente.
2. `observed` agregado do conjunto ONS governa totals regulatórios/financeiros quando a fonte é set-level. Valores individuais alocados ficam `allocated_estimate`, apenas drill-down; jamais somar agregado + filhos.
3. `maintenance_cost.py` é candidato a cenário, hoje função de domínio sem rota. Reusar somente como scenario engine identificável (`estimativa_cenario`), com carteira inteira e custo marginal antes/depois; elegibilidade desconhecida bloqueia penalidade. Franquia, causalidade e valor oficial não estão implementados por esse motor. Ranking sazonal CurtaiLess é port/experimento futuro, não substituir motor de custo sem fixtures de paridade e validação O&M.
4. BESS: manter `/api/usinas/{id}/bess/simular` como API legada, mas rotular outputs/limites e não o usar como simulação física validada. `operation_demo` é laboratório sintético com balanço/SOC por passos. Screening anual CurtaiLess ignora potência e não modela dispatch; não promover a sizing/ROI. Para motor único futuro, preferir série temporal física com potência, energia, SOC inicial/final, eficiência de carga/descarga, disponibilidade, conexão e preços; comparar ambas engines em fixtures idênticas antes de decisão. Respeitar balanceamento no ponto de medição para não contar duas vezes COFF evitado, descarga, geração/exportação, manutenção e ressarcimento.
5. Economia de manutenção, valor de energia deslocada e ressarcimento são linhas de benefício/custo distintas, com reconciliação de MWh e período; nunca somar o mesmo MWh em mais de um motor. `R$` depende de preço/fonte/horizonte explicitamente declarado. `payback` não é publicável sem CAPEX e denominador anual coerente; não chamar margem/receita de economia realizada.
6. Precedência de evidência: dado observado validado > cenário demonstrativo rotulado. Forecast só ganha status próprio após gates; nenhum score, narrativa, IA ou fixture sobrescreve observação/valor regulatório.

## 7. Frontend: migração incremental, uma shell

Manter `front/` CurtailIQ, router, API client central (`/api`), TanStack Query, tema/tokens existentes e contexto `PlantShell`/`useUsina`. Não importar a app, providers, CSS global, fetch absoluto nem mock API do CurtaiLess. Não copiar fixtures de dados sem licença/proveniência. Depois que endpoint v1 e testes estiverem estáveis, adicionar aba Exposição na página de usina, filtro global de período/nível/mode, aviso qualidade/proveniência e estado `loading/empty/unavailable/error/stale/demo`. Reutilizar componentes CurtailIQ (chart-kit, Provenance/DataQualityBanner, tokens semânticos); páginas manutenção continuam na operação atual; BESS fica na rota já existente e separa claramente legado, screening e simulação física. Usar `schema_version` e estados discriminados, sem converter 404 em série vazia.

Arquivos candidatos de frontend (fase própria; não mexer nesta especificação): `front/src/router.tsx`, `front/src/api/*` (novo client/hooks exposure no client central), página/componente em `front/src/pages`/`components`, tipos Zod/TS correspondentes. Confirmar estrutura real e build antes de fixar paths de implementação. Evidência anterior: `npm run build`/`lint` não executaram por ausência de `front/node_modules` (`tsc`/`eslint` indisponíveis); sem validação visual.

## 8. Arquivos e fases executáveis

Cada fase mantém TDD RED → GREEN → regressão; grava saída dos comandos em arquivos separados `docs/fusion/evidence/<fase>-red.log`, `...-green.log`, `...-regression.log`. Não executar esses passos por este documento.

### F0 — contratos e baseline limpo (pré-requisito)
- Confirmar estado dos arquivos locais preexistentes; preservar `backend/data/eda_report.md`, `backend/app/domain/exposure.py`, `backend/tests/test_exposure_domain.py` e `docs/curtailess-integration.md`.
- Resolver testes/baseline prévio apenas no escopo próprio; obter Python suportado CurtaiLess somente se auditoria adicional requerer. Não corrigir funcionalidade alheia dentro da integração.
- Arquivos prováveis: novos `backend/app/domain/exposure_contracts.py` (ou extensão versionada explícita), `backend/tests/test_exposure_contracts.py`, evidências. Evitar breaking change silencioso em `exposure.py`.
- Aceite: schemas rejeitam extras, timestamp sem timezone, duração inconsistente, ponto fora do período, identidade ambígua; probabilidade ausente aceita em observed/demo e só valida intervalo [0,1] no forecast elegível; teste confirma conjunto não soma filhos.

### F1 — vertical slice backend local observed/demo
- Expandir repository via métodos de exposure e adapters Mock; fixtures mínimas determinísticas, sem dados reais novos. Postgres permanece capability indisponível até contrato confirmado.
- Arquivos prováveis: `backend/app/repositories/base.py`, `mock_repo.py`, novo `repositories/exposure_adapter.py` se fronteira separada for necessária, `deps.py`, domain contracts/service, routers novos `routers/exposure.py`, `main.py` para registro, schemas e testes repository/service/API. Nenhum ETL/DB migration.
- Aceite: listagem NE default e pagination totals estáveis; filtro explícito level; missing/stale/ambiguous reportados; `observed` nunca cai para demo; demo claramente rotulada; response `exposure.v1`; UTC/duração/unidades e hashes/proveniência validados; eventos COFF no grão correto; sem endpoint forecast habilitado.

### F2 — manutenção e BESS como cenários (após validação de domínio)
- Fixtures de auditoria de paridade (COFF 30m, limite capacidade simultânea, manutenção compartilhada, custo/ressarcimento esperado, sazonal) viram testes de motores; comparar, não afirmar equivalência antes dos resultados.
- Prováveis arquivos: services de cenário novos/claramente isolados, schemas/routers opt-in, testes de paridade. Não reescrever BESS legado no primeiro incremento.
- Aceite: baseline e alternativa em mesmas entradas; custos e energia em componentes separados; limite de SOC/potência/energia testado para alegação física; resultados são cenário; desconhecido não é convertido em elegibilidade; benefício incremental reconciliado sem duplicidade; payback bloqueado sem anualização e custos coerentes.
- Gate: aprovação de responsável O&M/domínio e fonte de preço, perfil temporal, restrições, franquia/regra aplicável. Sem gate, manter apenas fixture/rotulagem demo.

### F3 — forecast (adiado)
- Só com vintages point-in-time e dataset/manifest autorizado. Prováveis arquivos de pipeline NÃO ficam no backend (são do time de dados); backend recebe versão e registros curados. Fase pode incluir serviço de avaliação e schemas/model registry, não ETL duplicado.
- Aceite: cut-off/publication time verificável, holdout temporal sem uso em seleção, baseline, métricas por horizonte/coorte, calibração independente se probabilidade exibida, revisão das limitações e versionamento reprodutível. Senão permaneça demo/unavailable.

### F4 — frontend integrado (depois de F1)
- Arquivos candidatos listados na seção 7, além de testes UI e contrato. Aceite: uma seleção compartilhada, sem origem absoluta, paginação consistente, badges e qualidade visíveis, conjunto e planta não somados, estados 404/501/stale distintos; build/lint e smoke no navegador executados com dependências autorizadas.

### F5 — narrativa IA opcional (último)
- Novo adapter isolado/desligado por padrão, não acoplar a `ExposureRepository`. Contexto de entrada somente JSON calculado e IDs de fontes; saída validada e referências obrigatórias. Sem chamada IA quando indisponível.
- Aceite: teste de que números/elegibilidade vêm do backend e permanecem invariantes; narrativa não adiciona métricas nem afirma direito/economia; log de versão/modelo, limites e fallback determinístico. Security/custo/privacy gate antes de ligar qualquer provider.

## 9. Atribuição, dados e operação

Qualquer código CurtaiLess posteriormente copiado/adaptado deve preservar `Copyright (c) Hackathon-IA-COPPE-2026` e texto MIT em notices aplicáveis, registrar path/SHA/origem e indicar arquivos/trechos alterados; reimplementação de conceito sem copiar expressão de código deve ser documentada como tal. Não redistribuir artefatos/datasets sem confirmar licença separada. SAM, S3/DynamoDB, Lambda, Bedrock e stack CurtailIQ CDK/GHCR/Compose/Amplify são configurações versionadas distintas; nenhuma prova deployment ativo. Não selecionar/migrar infraestrutura com base apenas nessas auditorias, e não instalar/deploy nesta sequência.

## Adendo de contrato aplicado — R1 exposição

Este adendo complementa a especificação; não remove nem rebaixa seus gates. As rotas implementadas aceitam `submarket=NE` por padrão e rejeitam outro submarket com HTTP 422 enquanto a fixture local só cobre NE. A série aceita `granularity=PT1H` (grão horário da fixture); outros valores são rejeitados com 422. A fixture demo usa provider local explícito baseado em `MockRepository`, sem depender do repositório selecionado por `DATA_BACKEND`.

Sem provider observed aprovado, `GET /entities?mode=observed` retorna `items=[]`, `availability.status=unavailable`, capabilities `observed=unavailable`, `forecast=unavailable`; não significa catálogo realmente vazio. Série observed sinaliza `quality.status=unavailable`, `source.name=not_configured`, `version=unavailable`, sem pontos, e nunca afirma `curated_view`. Dados demo declaram `source=local_fixture`, versão `curtailiq-sample-csv-v1` e `freshness=local_static_fixture`; isso é proveniência da amostra local, não freshness de mercado. Estes estados são operacionais e não alteram gates para provider real, COFF ou forecast.


- Um único backend CurtailIQ e um frontend `front/`; upstream continua proprietário da ingestão/ETL.
- Contrato versionado, grão/identidade/unidade/timezone/revisão/as-of explícitos; conjunto ONS primário; drill-down sem dupla contagem.
- Separação inviolável observed/demo/forecast e ausência de fallback silencioso; IA só explica fatos computados.
- Cálculos regulatórios determinísticos independentes de heurísticas e BESS; não alegar previsão validada, probabilidade calibrada, economia realizada ou direito a ressarcimento com dados demonstrativos.
- TDD e evidências reais RED/GREEN/regressão arquivadas separadamente; retornar testes focados e regressão total, listar bloqueios preexistentes sem maquiar baseline.
- Nenhuma conexão real a DB/AWS, leitura de credenciais ou edição do repositório CurtaiLess durante a especificação. O estado/freshness/schema da fonte curada e mapping CEG/ONS seguem não confirmados. Auditorias frontend/backend são estáticas; builds front falharam antes de compilar por dependências ausentes; baselines Python tiveram limitações Windows/Python descritas na auditoria backend. Nenhum teste de integração foi executado nesta tarefa.
- Preservar integralmente `backend/data/eda_report.md` e o documento original `docs/curtailess-integration.md`; esta especificação corrige/documenta o contrato de exposição insuficiente sem sobrescrever a referência.
