# Plano: restaurar usinas individuais, remover gráfico diário e validar métricas financeiras

## Objetivo

Antes de executar código, alinhar o diagnóstico e a sequência segura para:

1. Remover do Resumo o gráfico de perda financeira diária.
2. Garantir que o mapa/listagem exibam usinas individuais, não conjunto de usinas.
3. Confirmar se o backend atual já está preparado para usar a granularidade por usina individual nos marts `dw.mart_restricao_*_2026` ou se ainda está usando nível de conjunto.
4. Auditar por que a quantidade de eventos e o valor financeiro ressarcível parecem baixos.

## Diagnóstico atual

### 1. Estado git após rollback

A `main` está em:

```text
99b3615 ci: restore VPS SSH deploy timeout
24b10e1 revert: restore solution before teste merge
```

O progresso antes do rollback está salvo em branch remota:

```text
backup/main-quebrada-antes-rollback-20260624-032039
```

A branch/commit de implementação DW que já tínhamos feito aparece no histórico:

```text
9e2a813 feat: use plant-level DW curtailment views
```

E o arquivo atual `backend/app/repositories/postgres_repo.py` ainda contém a lógica DW/mart com IDs `dw_*`, então o rollback não apagou totalmente essa implementação.

### 2. Backend atual: não parece ser só frontend/mapa

O backend atual lista usinas a partir de:

```sql
dw.mart_restricao_solar_2026
dw.mart_restricao_eolica_2026
```

A query atual agrupa por:

```text
nom_usina
id_ons
ceg
fonte
id_estado
nom_conjuntousina
nom_usina_conjunto
```

Isso é promissor, porque `nom_usina`, `id_ons` e `ceg` dos marts novos parecem representar usina individual.

Amostras reais do banco confirmam granularidade individual:

```text
Sol do Sertão VIII -> Conj. Sol do Sertão -> id_ons BASS08 -> CEG UFV...
Panorama 02        -> Conj. Ribeiro Gonçalves 500 kV -> id_ons PIPAN2
Caetité D          -> Conj. Caetité Norte -> id_ons BAECTD
Brejinhos B        -> Conj. Caetité Norte -> id_ons BAEBJB
```

Então a tabela nova `dw.mart_restricao_*_2026` está, sim, preparada para usina individual. Não é apenas a tabela antiga `dw.mart_solar`/`dw.mart_eolica` de conjunto.

### 3. Por que pode estar aparecendo conjunto no mapa

Há três hipóteses prováveis:

#### Hipótese A — deploy ainda não aplicou a main restaurada

O GitHub Actions fez build com sucesso, mas o deploy falhou por timeout de conexão SSH:

```text
dial tcp ***:22: connect: connection timed out
```

Logo, produção pode estar rodando imagem anterior, ainda com estado misturado/quebrado. Se o usuário está olhando `energython.cognati.tech`, pode não refletir o código atual da `main`.

#### Hipótese B — frontend mostra explicitamente o campo de conjunto no popup

Em `front/src/pages/Portfolio/PlantMap.tsx`, o popup mostra:

```tsx
{u.nom_conjuntousina && <div>Conjunto: {u.nom_conjuntousina}</div>}
```

Mesmo quando a usina é individual, o popup exibe o conjunto regulatório associado. Isso pode dar a impressão de que o ponto é conjunto, especialmente se o nome principal ou dados estiverem inconsistentes.

#### Hipótese C — backend usa `LIMIT 50` e ordena por perda financeira, não por todas as usinas individuais

A listagem atual do DW termina com:

```sql
ORDER BY total_perda_reais DESC, total_corte_mwh DESC
LIMIT 50
```

Isso pode restringir o mapa às top 50, não a todas as usinas individuais do NE. Além disso, a query exige:

```sql
COALESCE(total_perda_reais, 0) > 0
```

Se faltar PLD para parte do período, muitas usinas com energia cortada podem sumir da listagem por terem perda financeira zero.

### 4. Por que eventos/valor financeiro ressarcível podem parecer baixos

Pontos prováveis:

1. A listagem usa apenas uma janela de 2 meses relativa ao `MAX(din_instante)` dos marts.
2. O filtro `total_perda_reais > 0` depende de PLD disponível.
3. A query de listagem usa `public.ccee_pld_horario`, mas em análise anterior vimos que o PLD pode ter cobertura menor do que os marts.
4. O backend pode estar usando `total_perda_reais` para escolher usinas, mas isso mistura problema financeiro com disponibilidade de PLD.
5. Para ressarcível, os marts novos já têm colunas oficiais/pré-calculadas:

```text
corte_mwh
corte_ressarcivel_mwh
corte_ene_mwh
corte_revisao_mwh
```

Se o backend ainda recalcula ressarcível por regra antiga/heurística, ou usa apenas percentual agregado, pode divergir do mart.

## Proposta de implementação

### Fase 1 — remover gráfico de perda financeira diária no Resumo

Arquivo provável:

```text
front/src/pages/Resumo/index.tsx
```

Mudanças:

1. Remover import:

```tsx
import { FinancialLossDailyLineChart } from "@/components/charts/FinancialLossDailyLineChart"
```

2. Remover hook usado só para o gráfico:

```tsx
const perda = usePerda(...)
```

3. Remover o bloco visual linhas 136-151 atualmente:

```tsx
<div ...>
  <p>Perda financeira diária</p>
  ...
  <FinancialLossDailyLineChart ... />
</div>
```

4. Manter os KPIs principais do resumo.

Validação:

```text
npm run build
```

### Fase 2 — separar conceitualmente no backend: usina individual vs conjunto regulatório

Arquivo principal:

```text
backend/app/repositories/postgres_repo.py
```

Ajuste de contrato/semântica:

1. `nome` deve ser sempre a usina individual:

```text
nom_usina
```

2. `nom_conjuntousina` e `nom_usina_conjunto` devem ser metadados secundários.

3. `nivel_granularidade` deve ser algo explícito:

```text
usina_individual_mart_restricao_dw
```

4. O frontend deve destacar `nome` e mostrar conjunto só como subtítulo/metadado, não como entidade principal.

### Fase 3 — ajustar mapa/listagem para não parecer conjunto

Arquivo provável:

```text
front/src/pages/Portfolio/PlantMap.tsx
```

Mudanças propostas:

1. Título: trocar para algo como:

```text
Mapa das usinas individuais do Nordeste
```

2. Popup:

- primeira linha: `u.nome`, usina individual.
- conjunto: mostrar como “Conjunto regulatório associado”, menor/segundo plano.
- potência: trocar label atual `Capacidade/conjunto` para `Potência da usina` quando `nivel_granularidade` for individual.

3. Se o backend enviar `nivel_granularidade`, exibir badge:

```text
Usina individual
```

4. Evitar agrupar/filtrar por conjunto no front. O front deve renderizar cada item retornado pela API.

### Fase 4 — corrigir listagem para não depender de PLD/perda financeira

Problema atual:

```sql
AND COALESCE(total_perda_reais, 0) > 0
LIMIT 50
```

Isso pode fazer sumir usinas com curtailment físico mas sem PLD.

Proposta:

1. Para catálogo/mapa, filtrar por energia física:

```sql
COALESCE(total_corte_mwh, 0) > 0
```

2. Manter `total_perda_reais` como métrica opcional, não filtro de existência.

3. Se PLD faltar, retornar:

```text
total_perda_reais = 0 ou null
pld_status = parcial/indisponivel
pld_faltante_intervalos
```

4. Remover ou aumentar o `LIMIT 50` para o mapa/listagem, ou paginar corretamente:

- Mapa: usar todos os pontos filtrados ou pelo menos um limite maior.
- Tabela: pode continuar paginada/top N.

### Fase 5 — usar colunas oficiais dos marts novos para ressarcível

Os marts novos têm:

```text
corte_mwh
corte_ressarcivel_mwh
corte_ene_mwh
corte_revisao_mwh
cod_razaorestricao
cod_origemrestricao
```

Para endpoints financeiros/regulatórios de IDs `dw_*`, preferir:

1. Energia total cortada:

```sql
SUM(corte_mwh)
```

2. Energia ressarcível:

```sql
SUM(corte_ressarcivel_mwh)
```

3. Energia por ENE/revisão:

```sql
SUM(corte_ene_mwh), SUM(corte_revisao_mwh)
```

4. Perda financeira total:

```sql
SUM(corte_mwh * pld)
```

5. Perda ressarcível:

```sql
SUM(corte_ressarcivel_mwh * pld)
```

Isso reduz risco de erro por regra duplicada no backend.

### Fase 6 — auditoria comparativa antes de mexer em deploy

Rodar consultas de validação contra o banco:

1. Quantas usinas individuais com corte no mart:

```sql
COUNT(DISTINCT id_ons), COUNT(DISTINCT ceg), COUNT(DISTINCT nom_usina)
```

2. Quantos conjuntos associados:

```sql
COUNT(DISTINCT nom_conjuntousina), COUNT(DISTINCT nom_usina_conjunto)
```

3. Total físico vs ressarcível:

```sql
SUM(corte_mwh), SUM(corte_ressarcivel_mwh)
```

4. Cobertura PLD:

```sql
COUNT(*) intervalos,
COUNT(pld) intervalos_com_pld,
COUNT(*) - COUNT(pld) intervalos_sem_pld
```

5. Comparar top usinas por:

- `corte_mwh`
- `corte_ressarcivel_mwh`
- `perda_reais`

Isso responde objetivamente se “poucos eventos/ressarcível baixo” é dado real, falta de PLD, filtro errado, ou erro de agregação.

## Arquivos provavelmente alterados

```text
front/src/pages/Resumo/index.tsx
front/src/pages/Portfolio/PlantMap.tsx
front/src/pages/Portfolio/index.tsx
front/src/types/usinas.ts
backend/app/repositories/postgres_repo.py
backend/app/schemas/usinas.py
backend/app/schemas/financeiro.py
backend/app/services/financeiro_service.py
```

Nem todos necessariamente serão alterados; primeiro devemos validar contratos atuais.

## Testes e validação

### Backend

1. Testar listagem:

```text
GET /api/usinas?fonte=solar&submercado=NE
GET /api/usinas?fonte=eolica&submercado=NE
```

Critérios:

- `nome` deve vir como usina individual, ex.: `Sol do Sertão VIII`, `Caetité D`.
- `nom_conjuntousina` deve vir apenas como metadado.
- `usina_id` deve ser estável e individual.
- contagem não deve ser artificialmente baixa por falta de PLD.

2. Testar detalhe:

```text
GET /api/usinas/{dw_id}
```

3. Testar perda/financeiro:

```text
GET /api/usinas/{dw_id}/perda?inicio=...&fim=...
```

Critérios:

- `total_corte_mwh` bate com mart.
- `total_ressarcivel_mwh` usa `corte_ressarcivel_mwh` quando disponível.
- status PLD fica claro.

### Frontend

```text
npm run build
```

Validação visual:

1. `/usinas` mostra mapa claro e usinas individuais.
2. Popup mostra nome individual como principal.
3. Resumo não mostra gráfico de perda financeira diária.
4. Métricas principais continuam aparecendo.

## Riscos

1. Produção pode continuar mostrando estado antigo enquanto o SSH deploy estiver falhando.
2. Se usarmos `corte_ressarcivel_mwh` oficial do mart, números podem mudar bastante em relação ao cálculo antigo do backend. Isso é desejável se a fonte DW for mais oficial, mas deve ser comunicado.
3. PLD incompleto pode derrubar valores financeiros se a janela default cair em período sem PLD.
4. `LIMIT 50` pode ocultar usinas no mapa; precisamos decidir se o mapa deve mostrar todas, top N ou respeitar paginação.

## Decisão recomendada

Não é só “mudar o mapa de conjunto para usina”.

O backend já tem parte da preparação para usina individual via `dw.mart_restricao_*_2026`, e os dados dessas tabelas realmente vêm por usina individual. Mas há ajustes necessários no backend e frontend para:

1. Não filtrar catálogo por perda financeira/PLD.
2. Usar `corte_ressarcivel_mwh` oficial do mart para ressarcível.
3. Deixar claro que `nom_conjuntousina` é metadado regulatório, não a entidade principal.
4. Remover o gráfico diário no Resumo.
5. Validar contagens e totais contra o banco antes de novo deploy.
