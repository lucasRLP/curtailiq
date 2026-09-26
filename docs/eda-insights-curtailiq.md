# Insights da EDA do CurtailIQ

Data da análise: 2026-06-14

Arquivos de referência gerados pela EDA:

- `eda_outputs/20260614_164241_tables_inventory.csv`
- `eda_outputs/20260614_164241_product_table_map.csv`
- `eda_outputs/20260614_164241_table_quality_score.csv`
- `eda_outputs/20260614_164241_temporal_coverage.csv`
- `eda_outputs/20260614_164241_reason_distribution.csv`
- `eda_outputs/20260614_164241_relationship_candidates.csv`
- `eda_outputs/20260614_164241_product_readiness_matrix.csv`

## 1. Resumo executivo

A EDA mostrou que o banco atual tem material suficiente para sustentar um MVP real de curtailment, perda financeira, BESS e ressarcimento, mas os dados ainda estão em tabelas `public` e não em uma camada `gold` consolidada.

O ponto mais importante da análise é semântico: as tabelas `restricao_coff_*` não devem ser tratadas como uma tabela final de eventos de curtailment. Elas parecem ser séries temporais operacionais com granularidade de 30 minutos, nas quais cada linha representa uma usina/unidade em um instante, podendo ou não haver restrição ativa.

Portanto:

```text
1 linha em restricao_coff_* != 1 evento de curtailment
1 linha em restricao_coff_* = 1 intervalo temporal operacional
```

A solução precisa derivar eventos a partir dessas linhas, filtrando intervalos ativos e agrupando sequências contínuas.

## 2. Tabelas mais importantes para o produto

### 2.1. Restrição/curtailment

Tabelas centrais:

- `public.restricao_coff_eolica_usi`
- `public.restricao_coff_fotovoltaica`
- `public.restricao_coff_eolica_detail`
- `public.restricao_coff_fotovoltaica_detail`

Uso esperado:

- `restricao_coff_eolica_usi` e `restricao_coff_fotovoltaica`: fonte principal para eventos regulatórios, pois têm `cod_razaorestricao`, `cod_origemrestricao` e `val_geracaolimitada`.
- `restricao_coff_eolica_detail` e `restricao_coff_fotovoltaica_detail`: fonte de validação/modelagem técnica, com grande volume e variáveis de recurso/geração, mas não necessariamente com razão/origem regulatória.

Cobertura temporal observada:

```text
restricao_coff_eolica_usi:
2021-10-01 00:00:00 até 2023-02-28 23:30:00
linhas: 319.680

restricao_coff_fotovoltaica:
2024-04-01 00:00:00+00 até 2026-05-29 23:30:00+00
linhas: 1.675.248

restricao_coff_eolica_detail:
2021-10-01 00:00:00 até 2026-05-29 23:30:00
linhas estimadas: ~68,9M

restricao_coff_fotovoltaica_detail:
2024-04-01 00:00:00+00 até 2026-05-29 23:30:00+00
linhas: 9.362.688
```

Ponto de atenção: a tabela eólica agregada com razão (`restricao_coff_eolica_usi`) termina em 2023, enquanto a detail eólica vai até 2026. Isso sugere que a cobertura regulatória eólica recente pode estar incompleta nessa tabela específica, ou que existe outra fonte agregada não identificada ainda.

### 2.2. Geração, disponibilidade e fator de capacidade

Tabelas centrais:

- `public.geracao_usina_2`
- `public.fator_capacidade_2`
- `public.disponibilidade_usina`

Cobertura temporal:

```text
geracao_usina_2:
2003-01-01 00:00:00 até 2026-05-28 23:00:00
linhas estimadas: ~15,4M

fator_capacidade_2:
2014-06-18 00:00:00 até 2026-05-28 23:00:00
linhas: 13.779.859

disponibilidade_usina:
2019-01-01 00:00:00 até 2026-05-28 23:00:00
linhas: 3.376.941
```

Uso esperado:

- Cadastro operacional e fallback de metadados de usina.
- Validação de geração observada.
- Estimativa econômica quando não há COFF.
- Feature engineering para previsão/BESS.

Importante: quando a perda vier de `fator_capacidade_2` por diferença entre geração programada e verificada, ela deve ser tratada como estimativa operacional/econômica, não como prova regulatória de ressarcimento.

### 2.3. PLD e precificação

Tabelas principais:

- `public.ccee_pld_horario`
- `public.ccee_pld_horario_submercado`
- `public.ccee_pld_sombra`
- `public.ccee_pld_media_diaria`
- `public.ccee_pld_media_mensal`

A tabela `ccee_pld_horario` tem 50.502 linhas e campos como:

- `mes_referencia`
- `dia`
- `hora`
- `periodo_comercializacao`
- `submercado`
- `pld_hora`

Ponto de atenção: parte dos dados CCEE usa `periodo_comercializacao` de 1 a 744, não timestamp direto. Para cruzar com restrição, é necessário reconstruir timestamp corretamente a partir de `mes_referencia`, `dia` e `hora`, e normalizar submercado (`NE` vs `NORDESTE`).

## 3. Insight principal sobre razão de restrição nula

A primeira leitura da EDA assustou porque a distribuição de razão na eólica mostrou:

```text
restricao_coff_eolica_usi:
razão vazia: 312.872 linhas (97,87%)
REL: 5.316 linhas (1,66%)
ENE: 1.323 linhas (0,41%)
CNF: 169 linhas (0,05%)
```

Essa leitura bruta parecia indicar um problema grave de qualidade: quase todas as linhas sem razão.

Depois cruzamos com geração limitada e a interpretação mudou:

```text
Eólica:
total de linhas: 319.680
linhas com razão vazia: 312.872
linhas com val_geracaolimitada > 0: 6.718
linhas com val_geracaolimitada > 0 e razão vazia: 0

Fotovoltaica:
total de linhas: 1.675.248
linhas com razão vazia: 1.250.511
linhas com val_geracaolimitada > 0: 383.257
linhas com val_geracaolimitada > 0 e razão vazia: 22
```

Conclusão:

```text
razão vazia não significa necessariamente evento de curtailment sem razão.
razão vazia geralmente significa intervalo operacional sem restrição ativa.
```

Somando eólica + fotovoltaica:

```text
linhas com limitação positiva: 389.975
linhas com limitação positiva e razão vazia: 22
percentual de limitação positiva sem razão: ~0,006%
```

Portanto, o problema não é necessariamente baixa cobertura de razão nos eventos; o problema é que a tabela bruta contém muitos intervalos sem evento.

Regra semântica recomendada:

```text
razão vazia + geração limitada zero/nula = SEM_RESTRICAO
razão preenchida + geração limitada positiva = RESTRICAO_CLASSIFICADA
razão vazia + geração limitada positiva = RESTRICAO_INCOMPLETA
razão preenchida + geração limitada zero/nula = METADADO_SEM_ENERGIA / investigar
```

## 4. Estado atual do produto segundo a matriz de prontidão

A EDA classificou as principais funcionalidades assim:

```text
Identificar eventos de restrição/curtailment: suportado/parcial
Classificar razão e elegibilidade regulatória: suportado/parcial
Calcular perda financeira: suportado/parcial
Ranking e seleção de usinas: suportado/parcial
Forecast de perda/corte: suportado como MVP
Simulador BESS: suportado como simulação
Dossiê/pleito regulatório: parcial/depende de evidências
```

Leitura de produto:

- O MVP pode usar dados reais de restrição/constrained-off, especialmente nas tabelas COFF.
- O cálculo financeiro pode ser feito com energia restringida e PLD.
- A elegibilidade regulatória precisa ser determinística e auditável, baseada em razão + origem.
- IA deve entrar apenas para redação de pleito/dossiê quando solicitada, não para decidir elegibilidade base.

## 5. Pontos de atenção identificados

### 5.1. Não confundir tabela COFF com tabela de eventos

As tabelas COFF têm granularidade temporal. Não são, por si só, uma tabela de eventos agregados.

Risco:

```text
contar cada linha de 30 minutos como um evento de curtailment
```

Impacto:

- Infla `total_eventos_corte`.
- Reduz artificialmente ticket médio por evento.
- Pode distorcer franquia/hora elegível.
- Gera dossiês com contagem de eventos maior que a realidade operacional.

### 5.2. Necessidade de eventização

O produto precisa transformar:

```text
linhas brutas de 30 min -> intervalos ativos -> eventos contínuos agregados
```

Critério sugerido de agregação:

```text
mesma usina
mesma tecnologia
mesma razão
mesma origem
intervalos consecutivos de 30 minutos
```

Exemplo:

```text
10:00 REL SIS
10:30 REL SIS
11:00 REL SIS
11:30 REL SIS
```

Hoje isso tende a ser contado como 4 eventos. O correto é 1 evento contínuo de 2 horas.

### 5.3. Risco de unidade em `val_geracaolimitada`

A solução atual trata `val_geracaolimitada` como MWh.

Mas como a granularidade COFF é de 30 minutos, precisamos confirmar se o campo representa:

```text
A) energia do intervalo em MWh; ou
B) potência média/geração limitada em MWmed/MW.
```

Se for potência média de intervalo, a energia correta deve ser:

```text
energia_restringida_mwh = val_geracaolimitada * 0,5
```

Se o código usa o valor bruto sem multiplicar por 0,5, a perda financeira pode ficar aproximadamente 2x inflada.

Conta global de sensibilidade:

```text
Eólica:
soma bruta val_geracaolimitada: 750.346,31
se for intervalo de 30 min: 375.173,15 MWh

Fotovoltaica:
soma bruta val_geracaolimitada: 40.856.690,17
se for intervalo de 30 min: 20.428.345,08 MWh
```

### 5.4. Diferença entre `val_geracaolimitada` e referência menos geração

Na query detalhada atual, o backend prioriza `val_geracaolimitada`.

Na query resumida (`get_perda_resumida`), há um caminho que calcula energia por:

```text
geracao_referencia_final - geracao
```

Comparação global nos intervalos ativos:

```text
Eólica:
soma val_geracaolimitada: 750.346,31
soma ref - geração: 116.901,01
ref-ger / limitada: 15,58%

Fotovoltaica:
soma val_geracaolimitada: 40.856.690,17
soma ref - geração: 17.097.898,17
ref-ger / limitada: 41,85%
```

Conclusão: caminhos diferentes podem produzir perdas financeiras muito diferentes. O produto precisa unificar a fonte de verdade de energia restringida.

### 5.5. Origem da restrição ainda é indispensável

Razão sozinha não basta. A origem (`SIS` vs `LOC`) muda a interpretação regulatória.

Combinações observadas relevantes:

```text
Eólica:
REL + LOC: 5.057 linhas
REL + SIS: 259 linhas
ENE + SIS: 1.323 linhas
CNF + SIS: 169 linhas

Fotovoltaica:
ENE + SIS: 256.150 linhas
CNF + SIS: 92.690 linhas
CNF + LOC: 46.284 linhas
REL + SIS: 23.471 linhas
REL + LOC: 6.142 linhas
```

Regra de produto recomendada:

```text
CNF + SIS -> elegível / candidato forte a ressarcimento
REL + SIS -> elegível / candidato forte a ressarcimento
ENE + SIS -> não elegível automaticamente / depende da regra
CNF + LOC -> revisão humana / não autoelegível
REL + LOC -> revisão humana / não autoelegível
origem ausente -> revisão humana
```

## 6. Estado atual observado no backend

Arquivos relevantes:

- `backend/app/repositories/postgres_repo.py`
- `backend/app/services/financeiro_service.py`
- `backend/app/services/regulatorio_service.py`
- `backend/app/domain/contracts.py`
- `backend/app/domain/policies.py`
- `backend/app/routers/usinas.py`
- `backend/app/routers/financeiro.py`

### 6.1. Como o backend determina intervalos hoje

O fallback COFF em `get_constrained_off` filtra por:

```sql
WHERE timestamp BETWEEN :inicio AND :fim
  AND cod_razaorestricao IS NOT NULL
  AND energia_restringida_mwh > 0
```

Ou seja: o backend não está contando as linhas em branco sem restrição como evento.

Ponto correto:

```text
linhas vazias sem geração limitada ficam fora do cálculo principal
```

Ponto frágil:

```text
cada linha filtrada ainda é tratada como um evento
```

### 6.2. Como a perda financeira é calculada hoje

Em `FinanceiroService.calcular_perda`:

```text
energia = e.energia_restringida_mwh
preco = PLD do timestamp exato ou da hora
perda = energia * preco
```

Conceitualmente a fórmula está correta:

```text
perda financeira = energia restringida MWh * PLD R$/MWh
```

Mas depende da unidade correta de `energia_restringida_mwh`.

### 6.3. O que está inflado hoje

Mais claramente inflado:

```text
contagem de eventos
```

Estimativa global via agrupamento de intervalos consecutivos:

```text
Eólica:
intervalos ativos: 6.718
eventos contínuos estimados: 488
inflação: ~13,77x

Fotovoltaica:
intervalos ativos: 383.235
eventos contínuos estimados: 42.054
inflação: ~9,11x
```

Possivelmente inflado:

```text
perda financeira total
```

A perda só estará inflada se `val_geracaolimitada` for potência média/MWmed de intervalo e não MWh do intervalo.

Provavelmente inflado:

```text
valor potencialmente ressarcível
```

Motivo: a política atual usa razão, mas ainda não preserva/aplica origem `SIS` vs `LOC` de forma robusta no domínio. Isso pode classificar como elegível um evento `REL` ou `CNF` de origem local (`LOC`), que deveria ir para revisão ou não ser autoelegível.

## 7. Oportunidades de produto

### 7.1. Criar camada de domínio de eventos

O produto deve assumir explicitamente esta cadeia:

```text
raw COFF
  -> intervalos de restrição
  -> eventos de curtailment agregados
  -> perdas financeiras
  -> elegibilidade regulatória
  -> dossiê/pleito
```

### 7.2. Criar score de evidência

Sugestão:

```text
Nível 0: sem restrição
Nível 1: restrição por estimativa operacional sem razão/origem
Nível 2: COFF com limitação positiva e razão
Nível 3: COFF com limitação positiva, razão e origem
Nível 4: COFF + PLD + disponibilidade/geração consistente
Nível 5: COFF + dados próprios/SCADA/documento operacional validado
```

Isso ajuda a separar:

- perda econômica estimada;
- curtailment identificado;
- evento com evidência regulatória;
- pleito pronto para revisão humana.

### 7.3. Separar perda econômica de ressarcível

O produto deve sempre separar:

```text
perda econômica total
perda por curtailment identificado
perda potencialmente ressarcível
perda ressarcível pós-franquia
perda em revisão humana
```

Não vender toda perda econômica como ressarcível.

## 8. Decisões recomendadas

1. Não usar `COUNT(*)` de linhas COFF como número de eventos.
2. Criar uma camada `CurtailmentInterval` para linhas ativas.
3. Criar uma camada `CurtailmentEvent` para sequências contínuas.
4. Validar unidade de `val_geracaolimitada` antes de congelar cálculo financeiro.
5. Preservar `cod_origemrestricao` no contrato de domínio.
6. Aplicar elegibilidade por razão + origem.
7. Unificar cálculo financeiro detalhado/resumido/dossiê.
8. Expor diagnóstico de dados nos endpoints para evitar interpretações erradas.
9. Tratar fallback por `fator_capacidade_2` como estimativa econômica, não como prova regulatória.
10. Manter IA apenas para redação/explicação quando o usuário solicitar pleito/dossiê.
