# Plano — Próximos passos do backend CurtailIQ (MVP)

## Objetivo
Evoluir o backend por etapas, priorizando:
1) pipeline de consumo do PostgreSQL (camada gold),
2) consolidação dos elos 2 (financeiro) e 3 (regulatório),
3) deixando o elo 1 (ML preditivo) para a fase final.

## Contexto e premissas
- O projeto já possui estrutura base de backend em `backend/` e endpoints iniciais.
- O MVP deve focar usinas renováveis do Nordeste (`submercado=NE`) por padrão.
- A arquitetura-alvo é em camadas: `routers -> services -> repositories`.
- O pipeline de dados (bronze/silver/gold) é responsabilidade de outro fluxo/time; o backend deve consumir a `gold`.
- Regra de separação:
  - limpeza/normalização pesada de dados no banco/pipeline (gold),
  - regras de negócio no backend (services).

## Diretriz de negócio para a pipeline (decisão)
Para o MVP, manter a pipeline do backend “fina” e estável:
- No PostgreSQL/gold:
  - padronização de colunas e tipos,
  - deduplicação,
  - timezone canônico,
  - normalização de categorias (`razao_restricao`, `submercado`, `fonte`),
  - cálculo derivado básico de dados (`energia_restringida_mwh`, quando aplicável).
- No backend/services:
  - cálculo de perda e exposição,
  - elegibilidade regulatória parametrizável,
  - simulação BESS,
  - composição de respostas para frontend.

Resumo: a pipeline no banco prepara “dados confiáveis”; o backend aplica “decisão de negócio”.

## Abordagem proposta (ordem de execução)
1. Fortalecer contrato de dados do repositório Postgres (gold).
2. Consolidar Elo 2 com testes de cálculo e cenários de borda.
3. Consolidar Elo 3 com cache, parametrização regulatória e rastreabilidade.
4. Fechar observabilidade, validação e prontidão de integração.
5. Só então iniciar Elo 1 (em fase separada).

## Plano passo a passo

### Fase A — Pipeline de consumo PostgreSQL (prioridade máxima)
1. Formalizar contrato de leitura da camada `gold` no repositório:
   - tabelas: `gold.usinas`, `gold.constrained_off`, `gold.pld_horario`, `gold.geracao_horaria`, `gold.clima_horario`.
2. Implementar/ajustar consultas com filtros obrigatórios:
   - `submercado=NE` por padrão do MVP,
   - período (`inicio`, `fim`) e `usina_id`.
3. Garantir consistência temporal:
   - parse robusto de datas,
   - normalização para UTC interno,
   - conversão para exibição posterior (quando necessário).
4. Criar validações defensivas no repositório:
   - ausência de usina,
   - ausência de PLD para intervalo,
   - lacunas de dados para eventos.
5. Definir fallback controlado:
   - `DATA_BACKEND=mock` para desenvolvimento sem banco.

### Fase B — Elo 2 (financeiro + BESS)
1. `calcular_perda`:
   - junção por `timestamp + submercado`,
   - cálculo `perda_reais = energia_restringida_mwh * pld_reais_mwh`,
   - agregações: total, série temporal, quebra por razão.
2. `projetar_exposicao`:
   - usar risco esperado (stub do elo 1 por enquanto) + PLD médio recente,
   - manter interface pronta para receber previsão real depois.
3. `simular_bess`:
   - limites físicos simples (potência, energia, eficiência),
   - retorno: energia recuperada, receita recuperada, % mitigado,
   - sem otimização complexa no MVP.
4. Endpoints do Elo 2:
   - revisar contratos de resposta, unidades e arredondamentos.

### Fase C — Elo 3 (regulatório com IA)
1. Centralizar regra de elegibilidade em configuração parametrizável:
   - elegível: `confiabilidade`, `indisponibilidade_externa`,
   - não elegível: `energetico` (com possibilidade de mudança futura por config).
2. `classificar_eventos`:
   - usar valor da gold quando confiável,
   - acionar classificador IA só em casos ambíguos/ausentes,
   - registrar confiança e justificativa.
3. `gerar_dossie`:
   - consumir eventos elegíveis + valoração Elo 2,
   - produzir rascunho em markdown (humano no loop).
4. `consultar_regra` (RAG leve):
   - base em `app/knowledge/`,
   - recuperação por keyword/BM25 (MVP),
   - resposta com citação de fonte.
5. Cache e performance:
   - TTL por chave (`usina+periodo`) em classificação e dossiê.

### Fase D — Qualidade, observabilidade e prontidão de integração
1. Erros de API padronizados (`code`, `detail`) em todo o fluxo.
2. Revisar paginação e filtros de usinas.
3. Manter `/health` e `/readiness` com checks de dependência.
4. Logging estruturado (requisição + tempo + status).
5. Preparar checklist para futura integração com frontend (sem implementar front agora).

## Arquivos provavelmente impactados
- `backend/app/repositories/postgres_repo.py`
- `backend/app/repositories/base.py`
- `backend/app/repositories/mock_repo.py`
- `backend/app/services/financeiro_service.py`
- `backend/app/services/bess_service.py`
- `backend/app/services/regulatorio_service.py`
- `backend/app/agents/anthropic_client.py`
- `backend/app/agents/classifier_agent.py`
- `backend/app/agents/dossier_agent.py`
- `backend/app/agents/rag_agent.py`
- `backend/app/routers/financeiro.py`
- `backend/app/routers/regulatorio.py`
- `backend/app/schemas/financeiro.py`
- `backend/app/schemas/regulatorio.py`
- `backend/app/config.py`
- `backend/tests/test_repositories.py`
- `backend/tests/test_financeiro.py`
- `backend/tests/test_endpoints.py`

## Testes e validação sugeridos
1. Repositório:
   - leitura de usina NE válida,
   - erro para `usina_id` inexistente,
   - período sem dados.
2. Financeiro:
   - caso determinístico de perda com PLD fixo,
   - consistência entre total e soma da série.
3. BESS:
   - limites de potência/energia respeitados,
   - eficiência aplicada corretamente.
4. Regulatório:
   - regra de elegibilidade por razão,
   - fallback/classificação IA em caso ambíguo,
   - geração de dossiê com campos mínimos.
5. API:
   - smoke `/health` e `/readiness`,
   - contratos 404/422,
   - payloads com unidade explícita.

## Riscos, trade-offs e pontos de atenção
- Dependência da qualidade da camada gold: lacunas de PLD/timestamps podem distorcer perdas.
- Custo/latência de IA no Elo 3: mitigado com cache e uso seletivo.
- Mudança regulatória: elegibilidade precisa ficar parametrizada (não hardcode espalhado).
- Escopo do MVP: evitar antecipar complexidade de otimização (BESS/hedge) nesta fase.

## Perguntas em aberto (para alinhar antes da execução)
1. O filtro `NE` deve ser obrigatório em toda API do MVP ou apenas default com opção de override?
2. Em caso de ausência parcial de PLD, preferimos bloquear cálculo (erro) ou calcular parcial com flag de qualidade?
3. Para o Elo 3, quais modelos Anthropic serão fixados inicialmente (rápido vs inteligente) no ambiente de desenvolvimento?
4. No endpoint de resumo, qual nível de detalhe mínimo o frontend vai precisar na primeira integração?

## Entregáveis desta etapa (antes do Elo 1)
- Pipeline de consumo Postgres robusta para `gold` (NE-first).
- Elo 2 consolidado e testado (perda, exposição, BESS).
- Elo 3 consolidado e testado (elegibilidade, dossiê, consulta regulatória).
- Backend pronto para integração do frontend em etapa posterior, com contrato estável.
