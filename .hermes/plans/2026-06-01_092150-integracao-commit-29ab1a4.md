# Plano de Integração — Commit 29ab1a4 (modelos de deep learning)

> Para execução posterior: seguir backend-first, validar banco real antes de expor novas capacidades no frontend/API.

## Goal
Integrar com segurança o conteúdo do commit `29ab1a4` (pipeline `data_ml`) ao backend MVP existente, sem quebrar o contrato atual de endpoints e sem duplicar ingestão que deve ficar no pipeline de dados.

## Contexto validado
- Status remoto/local: havia 1 commit novo em `origin/main`; pull realizado com sucesso.
- HEAD atual: `29ab1a4` (`implementacao dos modelos de deep learning`).
- Arquivos adicionados no commit:
  - `backend/models_ml/data_ml/README_data_ml.md`
  - `backend/models_ml/data_ml/data_extraction.py`
  - `backend/models_ml/data_ml/models.py`
  - `backend/models_ml/data_ml/dashboard.py`

## O que foi implementado no commit
1. `data_extraction.py`
   - Extrai dados de tabelas `public.restricao_coff_*` e `public.ccee_pld_horario_submercado`.
   - Gera caches CSV em `backend/models_ml/data_ml/temp_cache/`.
2. `models.py`
   - Implementa `AdvancedCurtailmentPredictor` com API rica (`predict_detailed`, métricas, alertas, decomposição).
3. `dashboard.py`
   - Dashboard Streamlit para exploração analítica e debug de predições.
4. README operacional do mini-pipeline ML local.

## Gaps de integração (o que falta)

### Gap A — Não integrado ao backend FastAPI
- Hoje o backend em produção usa `app/services/curtailment_service.py` + `app/ml/predictor.py` (modelo base).
- O novo `AdvancedCurtailmentPredictor` não está plugado em service/routers/schemas.
- Resultado: commit agrega código novo, mas sem efeito nos endpoints atuais.

### Gap B — Violação de boundary de dados (ingestão no app)
- `data_extraction.py` faz extração direta do banco e criação de cache local.
- Para o MVP definido, ingestão externa deve ficar no pipeline de dados (camada data), e backend deve consumir camada pronta (gold/public fallback).
- Resultado: risco de duplicação de pipeline, divergência e acoplamento indevido.

### Gap C — Credenciais hardcoded
- `data_extraction.py` e `dashboard.py` têm `DATABASE_URL/DB_URL` literal com host/usuário.
- Resultado: risco de segurança + fricção para deploy/ambientes.

### Gap D — Dependências não explicitadas
- Novos módulos usam `streamlit`, `plotly`, `sqlalchemy`, potencialmente `catboost/prophet/shap` (pela proposta do arquivo), mas sem evidência de amarração de dependências para execução reproducível do fluxo.
- Resultado: ambiente pode quebrar ao tentar rodar dashboard/modelos avançados.

### Gap E — Contrato de resposta ainda no modo “base”
- `curtailment_service` retorna payload simples e `modelo: ml_base_random_forest`.
- Sem schema para resumo/alertas/explicabilidade de `predict_detailed`.

### Gap F — Ausência de trilha de validação automatizada
- Não há testes visíveis cobrindo:
  - fallback entre modelo base x avançado,
  - consistência de features,
  - contrato dos novos campos analíticos.

## Estratégia proposta (sem implementar agora)

### Fase 1 — Higiene e boundary (pré-integração)
1. Isolar `data_ml` como ferramenta offline/analítica (não acoplada ao runtime da API).
2. Remover credenciais hardcoded e migrar para `.env` + `app/config.py`.
3. Documentar explicitamente: extração é utilitário de dados; backend de API não deve depender de CSV local para servir endpoints.

### Fase 2 — Integração de modelo avançado no backend
1. Criar adaptador em `app/ml/` para carregar `AdvancedCurtailmentPredictor` de forma opcional.
2. Manter fallback para `CurtailmentPredictor` atual.
3. No `CurtailmentService`, introduzir flag/config para escolher modo:
   - `base` (payload atual),
   - `advanced` (payload detalhado com resumo/alertas).

### Fase 3 — Contratos de API e frontend
1. Definir schemas Pydantic para payload detalhado (previsões + resumo + alertas).
2. Expor endpoint versionado (ex.: `/curtailment/previsao/detalhada`) sem quebrar endpoint legado.
3. Mapear consumo no frontend apenas após contrato fechado (aba/rota real em uso).

### Fase 4 — Validação técnica
1. Testes unitários:
   - normalização/prepare de features,
   - comportamento com modelo ausente,
   - serialização de timestamps e campos numéricos.
2. Testes de integração:
   - endpoint base preservado,
   - endpoint detalhado entregando esquema esperado.
3. Smoke manual:
   - subir backend,
   - consultar endpoint base e detalhado na mesma usina.

## Arquivos que provavelmente mudarão na integração
- `backend/app/services/curtailment_service.py`
- `backend/app/ml/predictor.py` (ou novo `backend/app/ml/advanced_predictor_adapter.py`)
- `backend/app/schemas/curtailment.py`
- `backend/app/routers/*` (onde expõe predição)
- `backend/app/config.py`
- `backend/.env.example`
- Documentação operacional em `backend/models_ml/data_ml/README_data_ml.md`

## Comandos de verificação (quando entrar em execução)
1. Estado git
   - `git status -sb`
2. Subir backend
   - comando do projeto para API (a confirmar no repo)
3. Testes
   - suíte backend existente + novos testes de predição
4. Smoke API
   - chamada endpoint base
   - chamada endpoint detalhado
   - comparação de contrato e latência

## Riscos e trade-offs
- Integrar tudo direto no endpoint atual aumenta risco de regressão no frontend.
- Manter dashboard Streamlit dentro do repo é útil para análise, mas deve ficar explicitamente fora do caminho crítico da API.
- Modelo avançado pode exigir libs pesadas; precisa estratégia de dependências para não inflar runtime do backend sem necessidade.

## Open questions
1. O endpoint detalhado deve ser novo (versionado) ou expansão opcional do endpoint atual por query param?
2. O dashboard `data_ml/dashboard.py` ficará como artefato de ciência de dados (não-prod) ou terá caminho de produto?
3. As features de Prophet/CatBoost já existem nos bundles `.pkl` versionados para eólica/solar no ambiente alvo?
