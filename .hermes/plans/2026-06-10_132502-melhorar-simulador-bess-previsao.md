# Plano — Melhorar Simulador BESS com previsão coerente por médias móveis

Data: 2026-06-10 13:25

## Objetivo

Melhorar apenas o simulador BESS para o MVP, sem mexer agora na correção ampla de dados do pipeline.

Foco específico:
- Trocar a previsão futura de curtailment do simulador para uma metodologia mais coerente com a realidade.
- Evitar números futuros muito acima do histórico recente.
- Ajustar o front para explicar corretamente que é uma projeção heurística / médias móveis, não “ML”.
- Manter as demais correções do arquivo `backend/correcao_coerencia_dados_spec.md` fora do escopo imediato.

## Validação feita antes do plano

### Cache de pleito IA

Teste service-level executado com repositório fake e agente fake:

```text
fake_ia_calls 1
first_cache_hit False
second_cache_hit True
same_markdown True
new_draft_ids True
cache_entries 1
```

Conclusão:
- O cache do pleito IA está funcionando na lógica central.
- A primeira chamada gera texto.
- A segunda chamada idêntica reaproveita cache.
- Mesmo vindo do cache, cria um novo `pleito_id`, então o fluxo de exportação continua válido.

### Build do front

Executado:

```bash
npm run build --prefix ../front
```

Resultado:
- Build passou.
- Apenas warning de bundle grande do Vite, sem quebrar.

### Diagnóstico rápido da previsão atual do simulador

Com cache local demo habilitado, a previsão atual para algumas usinas ficou acima do histórico recente:

```text
demo_cache_enabled True
demo_cache_usinas 76

CJU_BA3FIRE hist30_mwh 6030.15 pred30_mwh 11178.0362 ratio 1.85
CJU_BA4FBBC hist30_mwh 2112.73 pred30_mwh 4123.7186 ratio 1.95
CJU_BA4FBBS hist30_mwh 931.57 pred30_mwh 1818.8234 ratio 1.95
CJU_BA4FJZD hist30_mwh 11216.65 pred30_mwh 21869.6364 ratio 1.95
CJU_BABJL hist30_mwh 1604.77 pred30_mwh 2618.3494 ratio 1.63
CJU_BABJU hist30_mwh 2231.06 pred30_mwh 3633.5169 ratio 1.63
CJU_BABRD hist30_mwh 16563.22 pred30_mwh 26380.3902 ratio 1.59
```

Hipótese técnica:
- A função atual `_build_energy_seasonal_forecast()` calcula médias apenas sobre horas com eventos de curtailment.
- Horas sem evento não entram como zero.
- Isso superestima a frequência futura de corte: o futuro fica como se houvesse curtailment recorrente nas horas típicas, sem respeitar a taxa real de ocorrência.

## Avaliação do arquivo `backend/correcao_coerencia_dados_spec.md`

O arquivo é útil como diagnóstico e roadmap de coerência regulatória/dados, mas é amplo demais para agora.

### O que NÃO vale implementar agora no MVP

Não implementar neste momento:
- Fase 0 SQL completa no banco.
- Fix 1 — fórmula definitiva da energia restringida COFF.
- Fix 2 — granularidade MWmed / duração do patamar.
- Fix 3 — cobertura eólica RN/BA/CE.
- Fix 4 — normalização ampla de razão para todo o fluxo regulatório.
- Fix 5 — regras jurídicas completas por data/canal.
- Fix 6 — franquia anual completa por query acumulada.
- Fix 7 — joins timezone/submercado completos.
- Fix 8 — guardrails gerais em todas APIs.

Motivo:
- Essas mudanças mexem em base regulatória/dados/pipeline e podem desestabilizar a demo.
- O usuário explicitou que a correção ampla de dados não é necessária agora para o MVP.
- O problema urgente é a previsão do simulador estar muito acima do normal.

### O que vale aproveitar agora

Aproveitar do `.md` somente a filosofia de guardrail de coerência:
- Não exibir número absurdo.
- Não deixar previsão futura muito maior que histórico recente sem aviso.
- Ser explícito no front sobre método e limitações.
- Não chamar de ML quando o método real é heurístico/médias móveis.

## Proposta técnica

### Backend

Arquivo principal:
- `backend/app/services/forecasting_utils.py`

Arquivos possivelmente afetados:
- `backend/app/services/bess_service.py`
- `backend/app/schemas/bess.py`
- `front/src/types/financeiro.ts`
- `front/src/pages/PlantDetail/BessSimulator.tsx`

### Problema atual

Hoje a previsão usa médias por hora/weekday calculadas só com eventos existentes:

- Se houve corte em poucas horas, a média dessas horas fica alta.
- A série futura replica esses valores para muitas horas do horizonte.
- Resultado: previsão futura de 30 dias pode ficar 1.6x a 2.0x o histórico de 30 dias, mesmo sem evidência suficiente.

### Melhor abordagem para MVP

Implementar previsão determinística por médias móveis com densificação horária:

1. Montar uma série horária completa dos últimos `N` dias.
2. Para cada hora sem evento, preencher energia restringida como `0.0`.
3. Calcular:
   - média móvel curta: últimos 7 dias;
   - média móvel longa: últimos 30 dias;
   - média por hora do dia, mas incluindo zeros;
   - média por weekday+hora, mas incluindo zeros quando houver amostra suficiente.
4. Combinar de forma conservadora:
   - `baseline = 0.65 * media_30d_horaria + 0.35 * media_7d_horaria`
   - opcionalmente ajustar por perfil de hora do dia com peso pequeno.
5. Aplicar guardrail de teto:
   - previsão total de 30 dias não pode passar de algo como `1.10x` a `1.20x` do total histórico dos últimos 30 dias, salvo se houver aumento recente claro nos últimos 7 dias.
6. Se histórico recente for quase zero, previsão deve ser zero ou muito baixa, nunca criar curtailment artificial.

Método sugerido para o campo:

```text
media_movel_7_30d_com_zeros_guardrail
```

### Fórmula MVP sugerida

Para cada hora futura:

```python
pred_hora = (
    0.60 * media_30d_mesma_hora_com_zeros
    + 0.25 * media_7d_mesma_hora_com_zeros
    + 0.15 * media_30d_global_com_zeros
)
```

Depois do total do horizonte:

```python
teto_base = historico_30d_total * 1.15
if historico_7d_total > historico_30d_total * (7/30) * 1.5:
    teto_base = historico_30d_total * 1.30

total_previsto = min(total_previsto, teto_base)
```

Se o total for reduzido pelo teto, reescalar a série proporcionalmente.

### Por que isso é melhor para o MVP

- É explicável para pitch/demo.
- Não depende de ML nem de clima futuro.
- Respeita o histórico real recente.
- Evita previsão absurda em usina com poucos eventos concentrados.
- Mantém performance boa e compatível com cache.

## Mudanças de backend planejadas

### 1. Criar helper de série horária densa

Em `backend/app/services/forecasting_utils.py`:

Adicionar função interna:

```python
def _build_dense_hourly_energy_series(eventos_hist, start: datetime, end: datetime) -> list[tuple[datetime, float]]:
    ...
```

Comportamento:
- Criar todas as horas entre `start` e `end`.
- Somar energia dos eventos naquela hora.
- Preencher zero onde não houver evento.

### 2. Substituir ou complementar `_build_energy_seasonal_forecast()`

Criar nova função:

```python
def _build_energy_moving_average_forecast(eventos_hist, horizon_hours: int, now: datetime) -> tuple[list[dict], dict]:
    ...
```

Retornar:
- série futura;
- metadados/resumo, por exemplo:

```python
{
  "historico_30d_mwh": ...,
  "historico_7d_mwh": ...,
  "previsao_bruta_mwh": ...,
  "previsao_ajustada_mwh": ...,
  "guardrail_aplicado": True/False,
  "teto_multiplicador": 1.15,
}
```

### 3. Atualizar `forecast_future_losses()`

Quando `use_ml=False`, usar o novo método de médias móveis.

Manter fallback sazonal antigo apenas como fallback secundário se algo faltar.

Atualizar `metodo_previsao` para algo honesto:

```python
method = "media_movel_7_30d_com_zeros_guardrail"
```

Se usar cache local demo:

```python
method = "media_movel_7_30d_com_zeros_guardrail+demo_cache_local"
```

### 4. Expor metadados da previsão no BESS

Em `backend/app/services/bess_service.py`, dentro de `dimensionamento_com_previsao`, adicionar campos opcionais:

```python
"historico_base_30d_mwh": ...,
"historico_base_7d_mwh": ...,
"guardrail_aplicado": ...,
"previsao_bruta_mwh": ...,
"previsao_ajustada_mwh": ...,
"observacao": "Projeção por médias móveis com horas sem curtailment tratadas como zero."
```

Se quiser evitar alterar schema fortemente, manter como dict é compatível hoje.

## Mudanças de front planejadas

Arquivo:
- `front/src/pages/PlantDetail/BessSimulator.tsx`

### 1. Remover menções a ML

Trocar:

```text
Previsão futura com ML
Projeção financeira com ML
```

Por:

```text
Média móvel 7/30 dias com guardrail
Projeção conservadora baseada no histórico recente
```

### 2. Melhorar explicação visual

Adicionar uma pequena caixa abaixo dos KPIs de previsão:

Conteúdo sugerido:

```text
Previsão calculada por médias móveis sobre o histórico recente da usina. Horas sem curtailment entram como zero para evitar superestimação. Valores são indicativos para dimensionamento do BESS, não previsão regulatória.
```

Se `guardrail_aplicado` vier true:

```text
Guardrail aplicado: projeção limitada para manter coerência com os últimos 30 dias.
```

### 3. Ajustar títulos dos cards

Atuais:
- `Perda energética futura`
- `Energia recuperável futura`
- `Perda evitável futura`

Manter, mas subtítulos devem ficar claros:
- `Projeção 30 dias por média móvel`
- `Limitada pela potência/duração do BESS simulado`
- `PLD médio projetado + energia recuperável`

### 4. Opcional: mostrar comparativo histórico vs previsto

Se backend expuser `historico_base_30d_mwh`, adicionar uma linha simples:

```text
Histórico 30d: X MWh · Previsto 30d: Y MWh
```

Isso ajuda a demonstrar coerência.

## Testes e validação

### Backend unit/smoke

Criar ou rodar script equivalente para validar:

1. Série com 30 dias e poucos eventos:
   - previsão deve ser menor do que o método antigo;
   - horas sem evento entram como zero.
2. Série com histórico 30d = 0:
   - previsão deve ser 0.
3. Série com aumento forte nos últimos 7 dias:
   - teto pode subir para `1.30x`, mas não explode.
4. Para as usinas demo já testadas:
   - ratio `pred30_mwh / hist30_mwh` deve ficar próximo de `<= 1.15` em cenário normal.

Comando de validação esperado:

```bash
uv run python -m compileall app
uv run python <script_smoke_previsao_bess>
npm run build --prefix ../front
```

### Critério de aceite numérico

Para as usinas demo com histórico positivo:

Antes:
- ratios observados entre `1.59` e `1.95`.

Depois esperado:
- ratio normal `<= 1.15`.
- ratio máximo com aumento recente `<= 1.30`.
- nenhuma usina com histórico 30d zero deve ter previsão relevante positiva.

### Critério de aceite de UX

No simulador:
- Nada deve dizer “ML” se a previsão for média móvel.
- O usuário deve entender que é projeção indicativa para dimensionamento BESS.
- Se guardrail foi aplicado, isso deve aparecer de forma discreta.

## Riscos / tradeoffs

- Médias móveis são simples e conservadoras; podem subestimar eventos futuros excepcionais.
- Isso é aceitável para MVP/demo porque o problema atual é superestimação visível.
- Não resolve inconsistências de origem dos dados do `.md`; apenas evita que o simulador amplifique o problema.
- A previsão continua não sendo prova regulatória; deve ser copy de dimensionamento operacional/financeiro.

## Fora do escopo agora

- Corrigir pipeline COFF.
- Reprocessar `val_geracaolimitada` / MWmed.
- Corrigir elegibilidade jurídica completa.
- Ajustar pleito IA.
- Mudar ranking/listagem de usinas.
- Refatorar arquitetura.

## Ordem de implementação sugerida

1. Backend: implementar série horária densa + previsão por médias móveis em `forecasting_utils.py`.
2. Backend: retornar metadados de guardrail no objeto de previsão.
3. Backend: ajustar `BessService` para repassar metadados em `dimensionamento_com_previsao`.
4. Front: alterar textos do simulador para remover “ML” e explicar média móvel.
5. Front: exibir histórico 30d vs previsto 30d e aviso de guardrail quando aplicável.
6. Validação: rodar smoke nas mesmas usinas demo usadas no diagnóstico.
7. Build: `npm run build`.
8. Se aprovado, commit/push.
