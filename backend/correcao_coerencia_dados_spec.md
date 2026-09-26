# Correção de Coerência de Dados — CurtailIQ (Spec para o Agente de Código)

> **Para o agente de código:** este documento lista correções **cirúrgicas** no pipeline de dados e nos engines do CurtailIQ. O objetivo NÃO é refazer arquitetura nem alterar o agente LLM de pleito (prompt, fluxo e telas ficam como estão). O objetivo é que **números coerentes apareçam no front** — é um MVP, não precisa de exatidão regulatória perfeita, mas não pode ter incoerência visível (eólicas só do Piauí, ENE contado como ressarcível, energia dobrada por erro de unidade, canal jurídico errado para a data do evento).
>
> **Janela de exibição padrão do produto: hoje − 12 meses até hoje.** Todos os defaults de UI e de query usam essa janela. A franquia, porém, acumula por ano civil (ver Fix 6).
>
> Execute na ordem: primeiro a FASE 0 (diagnóstico, só leitura), registre os resultados num comentário/issue, depois aplique os fixes na ordem listada. Cada fix tem critério de aceite.

---

## FASE 0 — Diagnóstico (rodar ANTES de qualquer mudança; só leitura)

Rode as 5 queries abaixo nas tabelas `public.restricao_coff_eolica_usi` e `public.restricao_coff_fotovoltaica` (ajuste nomes de colunas se divergirem) e **registre o output**. Os fixes seguintes dependem do que sair aqui.

```sql
-- D1. Janela temporal e volume por tabela (a assimetria eólica/solar provavelmente nasce aqui)
SELECT 'eolica' AS fonte, MIN(din_instante), MAX(din_instante), COUNT(*),
       COUNT(DISTINCT id_ons) AS usinas_distintas
FROM public.restricao_coff_eolica_usi
UNION ALL
SELECT 'solar', MIN(din_instante), MAX(din_instante), COUNT(*),
       COUNT(DISTINCT id_ons)
FROM public.restricao_coff_fotovoltaica;

-- D2. Distribuição de razões por fonte (ENE vazando? valores não mapeados?)
SELECT cod_razaorestricao, COUNT(*) FROM public.restricao_coff_eolica_usi GROUP BY 1 ORDER BY 2 DESC;
SELECT cod_razaorestricao, COUNT(*) FROM public.restricao_coff_fotovoltaica GROUP BY 1 ORDER BY 2 DESC;

-- D3. Granularidade: registros por usina por dia (≈24 = horário; ≈48 = semi-horário)
SELECT id_ons, DATE(din_instante) AS dia, COUNT(*) AS regs
FROM public.restricao_coff_fotovoltaica
GROUP BY 1, 2 ORDER BY regs DESC LIMIT 20;
-- repetir para a eólica

-- D4. Semântica de val_geracaolimitada: qual identidade fecha?
-- Se delta_a ≈ 0 → 'geracaolimitada' É o corte (pode usar direto).
-- Se delta_b ≈ 0 → 'geracaolimitada' é o TETO autorizado (NÃO usar como corte).
SELECT
  AVG(ABS(val_geracaolimitada - (val_geracaoreferenciafinal - val_geracao))) AS delta_a,
  AVG(ABS(val_geracaolimitada - val_geracao)) AS delta_b,
  COUNT(*)
FROM public.restricao_coff_fotovoltaica
WHERE val_geracaolimitada IS NOT NULL
  AND val_geracaoreferenciafinal IS NOT NULL AND val_geracao IS NOT NULL;

-- D5. Cobertura do join eólico (cadê o RN?): usinas na tabela bruta vs. usinas que
-- sobrevivem ao join com o cadastro
SELECT COUNT(DISTINCT c.id_ons) AS brutas,
       COUNT(DISTINCT u.usina_id) AS casadas
FROM public.restricao_coff_eolica_usi c
LEFT JOIN gold.usinas u ON u.sigla_ons = c.id_ons;  -- ajustar chave real do join
-- E listar as 20 maiores eólicas brutas que NÃO casam:
SELECT c.id_ons, SUM(...) FROM ... WHERE u.usina_id IS NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 20;
```

---

## FIX 1 — Fórmula da energia restringida (semântica de `val_geracaolimitada`)

**Problema:** o código usa `val_geracaolimitada` preferencialmente e `referencia − verificada` como fallback, tratando como intercambiáveis dois campos de semântica possivelmente distinta ("geração limitada" pode ser o TETO autorizado, não o corte).

**Correção (condicional ao D4):**
- Se **delta_a ≈ 0** (geracaolimitada = corte): manter, mas remover o fallback intercambiável — uma fórmula só.
- Se **delta_b ≈ 0** ou inconclusivo: trocar para a fórmula segura única:

```python
energia_restringida_mwh = max(
    (val_geracaoreferenciafinal or val_geracaoreferencia) - val_geracao, 0.0
)
```

- Preferir **`val_geracaoreferenciafinal`** (já desconta disponibilidade e tolerância); usar `val_geracaoreferencia` só se a final for nula.
- Clamp em zero sempre (nada de corte negativo).
- **Nunca** criar evento por diferença quando não há registro COFF — sem linha na tabela, não há evento de pleito. Remover/garantir que esse fallback de "evento calculado" não alimenta o fluxo de pleito.

**Aceite:** uma única fórmula no código, documentada com o resultado do D4 em comentário; espot-check de 10 eventos contra os valores brutos.

---

## FIX 2 — Unidade e granularidade (MWmed × duração do patamar)

**Problema:** os valores `val_*` do ONS são **MWmed** (potência média no intervalo). Se os registros forem semi-horários (D3 ≈ 48/dia) e estiverem sendo somados como MWh, **toda energia exibida está dobrada**.

**Correção:**
```python
DURACAO_PATAMAR_H = 0.5 if registros_por_dia ≈ 48 else 1.0  # decidir pelo D3, fixar como constante comentada
energia_mwh = val_mwmed * DURACAO_PATAMAR_H
```
Aplicar no ponto único de ingestão/normalização (repositório), nunca espalhado pelos engines.

**Aceite:** a perda mensal de uma usina-caso bate em ordem de grandeza com referência externa (ex.: % de corte resultante entre ~10% e ~60% — ver guardrails no Fix 8). Documentar a decisão (0.5 ou 1.0) com o output do D3.

---

## FIX 3 — Cobertura eólica (red flag das "eólicas só do Piauí")

**Problema:** todas as 13 eólicas ressarcíveis são do PI; zero do RN/BA/CE — incompatível com a realidade (RN é o epicentro do curtailment). Causa provável: tabela eólica carregada parcialmente OU join `id_ons` × cadastro derrubando as demais.

**Correção (condicional ao D1/D5):**
- Se **D1 mostrar janela menor** na eólica → recarregar a tabela eólica para a mesma janela da solar (12 meses). Acionar quem cuida do pipeline; este fix pode ser só um aviso no código.
- Se **D5 mostrar usinas brutas que não casam** → corrigir a chave de join (trim/upper, prefixo `CJU_`, variações de sigla). Criar normalização única de sigla no repositório.
- **Se não der para corrigir a tempo (regra MVP):** esconder as eólicas do ranking/lista padrão e exibir badge "recorte parcial — em expansão" onde eólicas aparecerem. **É melhor não mostrar do que mostrar incoerente.**

**Aceite:** ou a lista eólica passa a conter usinas do RN/BA/CE, ou eólicas saem do default com o badge de recorte. Nunca a lista atual como está.

---

## FIX 4 — Normalização de razão (ENE não pode vazar para "ressarcível")

**Problema:** os volumes solares "ressarcíveis" estão altos demais (centenas de GWh/usina), sugerindo que ENE (não ressarcível) pode estar entrando como elegível — ou que valores de `cod_razaorestricao` fora do mapa estão caindo num default permissivo.

**Correção:**
1. Com o **D2**, mapear TODOS os valores distintos reais de `cod_razaorestricao` das duas tabelas no `normalizar_razao_pleito()`.
2. Valor não reconhecido → `INDEFINIDO`, e **INDEFINIDO nunca é ressarcível** (vai para "revisão humana"). Default permissivo é proibido.
3. Adicionar teste unitário: para cada valor distinto encontrado no D2, asserta o mapeamento esperado; um valor novo no futuro quebra o teste em vez de vazar.
4. No front, o gráfico "perda por razão" deve somar REL + CNF + ENE + INDEFINIDO = perda total (invariante; ver Fix 8).

**Aceite:** consulta de conferência: `% da energia ressarcível / energia restringida total` por usina solar. Se continuar > ~70% para a maioria, investigar de novo — no mundo real ENE domina o corte solar e não é ressarcível, então o ressarcível deve ser **minoria** do total na maior parte dos casos.

---

## FIX 5 — Regras de data nos canais (mudança pequena, furo grande)

**Problema:** todo CNF+SIS vai para o canal `TERMO_COMPROMISSO_LEI_15269`, mas o regime do Termo cobre **somente eventos de 01/09/2023 a 25/11/2025**. Com a janela de exibição de 12 meses (jun/2025–jun/2026), metade dos eventos CNF é posterior ao corte da lei. E REL via `PROTOCOLO_ONS` tem janela de **90 dias corridos da ocorrência** — eventos mais antigos não podem ir por esse canal.

**Correção (só dois `if` no `classificar_elegibilidade()` / engine de prazos):**
```python
TERMO_INICIO = date(2023, 9, 1)
TERMO_FIM    = date(2025, 11, 25)
PRAZO_PROTOCOLO_DIAS = 90

# CNF + SIS:
if TERMO_INICIO <= data_evento <= TERMO_FIM:
    canal = "TERMO_COMPROMISSO_LEI_15269"
else:
    canal = "REVISAO_HUMANA"   # elegibilidade condicionada à regulamentação prospectiva
    rotulo_front = "Condicionado à regulamentação (Lei 15.269)"

# REL + SIS:
if (hoje - data_evento).days <= PRAZO_PROTOCOLO_DIAS:
    canal = "PROTOCOLO_ONS"; dias_restantes = 90 - (hoje - data_evento).days
else:
    canal = "FORA_DE_PRAZO"    # exibir, mas sem botão de gerar pleito
    rotulo_front = "Prazo de contestação expirado"
```
Constantes em config, não hardcoded inline. O front mostra os novos rótulos nos badges já existentes — **sem tela nova**.

**Aceite:** nenhum evento de 2026 com canal TERMO; nenhum evento REL com >90 dias oferecendo botão de pleito.

---

## FIX 6 — Franquia: acumular o ano civil, com valores parametrizados

**Problema:** se a franquia (82h/41h) está sendo descontada apenas dentro do período filtrado na tela, o resultado é errado nas duas direções. A franquia é **anual por usina (ano civil)**.

**Correção:**
1. `franquia.py` passa a receber as horas REL acumuladas da usina **desde 01/jan do ano do evento até o evento**, independente do filtro de tela (uma query agregada simples; cachear por usina+ano).
2. Valores saem do código e vão para a tabela `gold.franquia_anual` (já especificada) ou, na falta dela, um dict em config com fonte comentada: `{"eolica": 82.0, "solar": 41.0}  # divulgação de mercado 2025; norma cita 78h/30,5h — confirmar antes de produção`.
3. O front já mostra o status de franquia por evento — sem mudança de UI.

**Aceite:** dois eventos REL idênticos em meses diferentes do mesmo ano têm status de franquia coerente com o acumulado (o de dezembro tende a estar acima da franquia; o de janeiro, dentro).

---

## FIX 7 — Joins silenciosos (submercado e timezone)

**Problema potencial:** (a) a CCEE entrega submercado **por extenso** (`NORDESTE`); se as usinas usam `NE`, o join do PLD falha silencioso e o valor vira nulo/zero; (b) `din_instante` do ONS é hora de **Brasília**; se algum lado for tratado como UTC, o PLD casado fica deslocado 3h.

**Correção:**
- De-para único de submercado no repositório: `{"NORDESTE": "NE", "NORTE": "N", "SUDESTE": "SE_CO", "SUL": "S"}` (e inverso), aplicado em TODO join com PLD.
- Padronizar: timestamps armazenados naive em hora de Brasília OU tz-aware em UTC com conversão única no repositório — escolher um e documentar; nunca misturar.
- Adicionar um teste: pegar 5 eventos com PLD e conferir manualmente que a hora do PLD casada é a hora do evento.

**Aceite:** zero eventos com `pld = null` na janela padrão (ou, se houver lacuna real de PLD, o evento mostra "sem PLD" explícito em vez de R$ 0 silencioso).

---

## FIX 8 — Guardrails de coerência na API (a rede de segurança do MVP)

Como é MVP e a exatidão perfeita não é a meta, a meta é **nunca exibir número absurdo**. Adicionar uma camada fina de validação no service (não no front), que anexa `avisos[]` na resposta e, nos casos graves, suprime o número:

**Invariantes (violar = bug, logar e suprimir o card):**
- `energia_ressarcivel ≤ energia_restringida` (por evento e no agregado).
- `Σ perda_por_razao (REL+CNF+ENE+INDEFINIDO) = perda_total` (tolerância 1%).
- `valor_pleitavel ≥ 0`; `pld_usado` dentro dos limites regulatórios do ano (ex.: 2025: R$ 58,60–1.542,23/MWh) — fora disso, flag.

**Plausibilidades (violar = exibir com aviso "verificar dado"):**
- `% de corte da usina no período = energia_restringida / (potencia_mw × horas × FC_típico)` esperado entre ~5% e ~60%; acima de 80%, aviso.
- `% ressarcível / restringido` acima de 70% → aviso (ENE deveria dominar).
- Usina com potência cadastrada nula/zero → excluir do ranking.

**Aceite:** endpoint de resumo devolve `data_quality: {avisos: [...], suprimidos: [...]}` e o front (já preparado para avisos? se não, basta ignorar — o campo é aditivo) nunca mostra card violando invariante.

---

## O QUE NÃO MUDAR (explícito)

- **O agente LLM de pleito**: prompt, fluxo de redação, estrutura do dossiê — intocados. Os fixes acima acontecem ANTES do pacote estruturado chegar à LLM; o agente só passa a receber dados coerentes.
- **Telas e fluxos do front**: nenhuma tela nova. Apenas rótulos novos nos badges (Fix 5) e o campo aditivo `data_quality` (Fix 8), que o front pode ignorar nesta fase.
- **Arquitetura** (routers → services → engines → repo): mantida.
- **Janela padrão**: hoje − 12 meses, em todos os defaults de UI e API.

## Ordem de execução e esforço estimado

1. FASE 0 (diagnóstico) — ~30 min, só leitura. **Bloqueia o resto.**
2. FIX 1 + FIX 2 (fórmula e unidade) — pequenos, no repositório; afetam todos os números.
3. FIX 4 (normalização de razão) — pequeno; afeta o "ressarcível" (o número verde).
4. FIX 5 (datas dos canais) — dois `if`; afeta o dossiê.
5. FIX 7 (joins) — pequeno; previne zeros silenciosos.
6. FIX 6 (franquia anual) — uma query agregada + ajuste no engine.
7. FIX 3 (cobertura eólica) — depende do diagnóstico; se não resolver, aplicar o fallback de esconder com badge.
8. FIX 8 (guardrails) — camada fina por último, valida tudo que veio antes.
