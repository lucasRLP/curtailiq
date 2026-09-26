# Contrato de dados — o que o front consome em Operação

Documento de quem consome (front) para quem produz (backend). Lista **exatamente**
quais rotas as telas de Operação esperam, com que formato, e o que cada tela faz
com cada campo.

As telas já estão escritas e no ar. Enquanto uma rota não existe, a tela mostra
"aguardando backend" com a rota que falta — nenhuma quebra, nenhum erro vermelho.
Assim que a rota responder 200 no formato abaixo, a tela acende sozinha, sem
mudança no front.

Fonte da verdade dos tipos: `front/src/types/operacao.ts`. Se o formato mudar,
os dois arquivos mudam juntos.

---

## 1. Convenções válidas para tudo

| Assunto | Regra |
|---|---|
| Datas | ISO-8601 **com timezone** (`2026-01-05T13:00:00+00:00` ou `-03:00`). Sem timezone o front assume horário local do navegador e a linha do tempo desloca. |
| Potência | MW nos agregados e nas séries de operação. **kW só no SCADA** (é o que vem do equipamento). O front converte. |
| Energia | MWh. |
| Dinheiro | BRL, número puro (`742455.01`), nunca string formatada. |
| Percentual | Número em **pontos percentuais** (`42.5` = 42,5%), exceto `probabilidade` e `prob_corte`, que são **fração 0–1**. Essa inconsistência existe no backend hoje; está documentada para não virar bug silencioso. |
| Dado sintético | `is_simulated: true` em todo objeto que não é medição real. O front carimba o selo "Simulado" na tela. |
| Listas vazias | Devolver `[]` e 200, nunca 404. 404 significa "rota não existe" para o front. |
| Erros | Formato atual (`{"code": "...", "detail": "..."}`) com o status HTTP correto. **404/405/501 = "ainda não publicado"** (tela mostra estado de espera); **4xx restante e 5xx = erro de verdade** (tela mostra erro vermelho). |
| Campos opcionais | Podem vir `null` ou ausentes. Toda tela trata ausência com "—". Não invente valor para preencher. |

---

## 2. Ordem de prioridade

A ordem abaixo é a que o front usa nas abas e a que sugerimos para a fila do
backend. Cada linha diz qual tela destrava.

| # | Tela | Rota que destrava | Estado hoje |
|---|---|---|---|
| 0 | `/operacao` · Visão geral | `GET/POST /api/operacao/demo` | ✅ **funcionando** |
| 1 | `/operacao/manutencao` · Manutenção no corte | `POST /api/operacao/usinas/{id}/agendar` | ⏳ aguardando |
| 2 | `/operacao/manutencao` · lista de OS | `GET /api/operacao/usinas/{id}/ordens-servico` | ⏳ aguardando |
| 3 | `/operacao/manutencao` · faixas do Gantt | `GET /api/operacao/usinas/{id}/janelas-corte` | ⏳ aguardando |
| 4 | `/operacao/scada` · SCADA | `GET /api/operacao/usinas/{id}/scada/ultimo` | ✅ **funcionando sobre o gêmeo digital**; a rota ao vivo é o próximo passo |
| 5 | `/operacao/gargalos` · o que corta esta usina | `GET /api/usinas/{id}/gargalos` | ⏳ aguardando |
| 6 | `/operacao/gargalos` · ranking do sistema | `GET /api/gargalos` | ⏳ aguardando |
| 7 | `/operacao/gargalos` · detalhe | `GET /api/gargalos/{gargalo_id}` | ⏳ aguardando |
| 8 | `/operacao/valor` · backtest | `GET /api/operacao/usinas/{id}/backtest/ultimo` | ⏳ aguardando |
| 9 | `/usinas/{id}/risco` · risco de corte | `GET /api/usinas/{id}/curtailment/previsao-detalhada` | ✅ **funcionando** (devolve vazio no dataset local) |
| 10 | `/usinas/{id}/bess` · memorando de investimento | `POST /api/usinas/{id}/documentos/memorando-bess` | ⏳ aguardando (§7.1) |
| 11 | `/operacao/manutencao` · justificativa da reprogramação | `POST /api/operacao/agendamentos/{run_id}/justificativa` | ⏳ aguardando (§7.2) |

**Se der para entregar só uma:** a 1 (`/agendar`). É a tela que prova a tese do
produto — a que mostra a manutenção saindo de uma data cara para dentro da janela
de corte. As outras a apoiam.

**Nota sobre `{id}`.** O front passa o mesmo `usina_id` que já usa em
`/api/usinas/{id}` (hoje `"1"` no dataset local). Se Operação for indexada por
`plant_id` do conjunto ONS, o backend precisa aceitar os dois ou expor o
mapeamento — hoje o front não tem como traduzir.

---

## 3. Manutenção no corte (prioridade 1 a 3)

### 3.1 `POST /api/operacao/usinas/{id}/agendar`

Roda o agendador e devolve a recomendação por ordem de serviço.

**Corpo (todos opcionais; a tela envia os cinco primeiros):**

```json
{
  "flexibilidade_dias": 7,
  "limite_vento_ms": 12,
  "equipes": 2,
  "penalizar_ressarcimento": true,
  "incluir_domingo": true,
  "tipo_janela": "prevista",
  "wo_ids": ["OS-001"],
  "inicio": "2026-01-01T00:00:00-03:00",
  "fim": "2026-01-31T23:59:59-03:00"
}
```

**Resposta:**

```json
{
  "run_id": "sched_20260105_a91f",
  "plant_id": "1",
  "criado_em": "2026-01-05T12:00:00-03:00",
  "is_simulated": true,
  "parametros": { "flexibilidade_dias": 7, "limite_vento_ms": 12, "equipes": 2 },
  "resumo": {
    "tarefas_total": 12,
    "tarefas_movidas": 9,
    "tarefas_sem_janela": 1,
    "economia_total_brl": 48210.55,
    "perda_baseline_total_brl": 61400.00,
    "perda_recomendada_total_brl": 13189.45,
    "ressarcimento_perdido_total_brl": 2100.00,
    "horas_em_corte_ene": 34.5,
    "horas_em_corte_ressarcivel": 6.0,
    "horas_fora_de_corte": 12.0
  },
  "recomendacoes": [
    {
      "wo_id": "OS-001",
      "turbine_id": "USI_NE_001_WTG03",
      "tipo_tarefa": "troca_de_oleo_multiplicadora",
      "duracao_h": 6.0,
      "inicio_baseline": "2026-01-14T09:00:00-03:00",
      "inicio_recomendado": "2026-01-16T10:00:00-03:00",
      "perda_esperada_mwh": 1.24,
      "perda_esperada_brl": 310.00,
      "perda_baseline_brl": 4120.00,
      "ressarcimento_perdido_brl": 0.0,
      "economia_brl": 3810.00,
      "justificativa": "Mover de 14/01 09:00 para 16/01 10:00: janela de corte por razão energética prevista (prob. 0,82, 38 MW de redução). Perda esperada cai de R$ 4.120 para R$ 310.",
      "confianca": "alta",
      "window_id": "win_2026011610_ene",
      "razao_janela": "ENE"
    }
  ],
  "janelas": [ /* mesmo formato da seção 3.3 */ ],
  "premissas": [
    "Franquia anual de ressarcimento ignorada nesta versão.",
    "Limite de vento de 12 m/s provisório, não validado com O&M."
  ]
}
```

**O que a tela faz com cada campo:**

- `resumo.economia_total_brl` → número de manchete, em teal de "recuperável".
- `resumo.perda_baseline_total_brl` e `perda_recomendada_total_brl` → aparecem
  juntos ("de X para Y"). Se vierem iguais, a tela diz que não houve ganho.
- `resumo.tarefas_sem_janela` → se > 0, vira aviso; se 0, vira confirmação.
- `resumo.horas_em_corte_ene` → tile próprio, com a explicação de que corte ENE
  não é ressarcível e por isso é a parada mais barata.
- `resumo.ressarcimento_perdido_total_brl` → tile em vermelho de "perda", porque
  é o custo regulatório da decisão (§0.3 do plano).
- `recomendacoes[].inicio_baseline` × `inicio_recomendado` → as duas barras do
  Gantt: vazada na data original, cheia na recomendada.
  **`inicio_recomendado: null` é esperado** e desenha "Sem janela viável".
- `recomendacoes[].justificativa` → texto exibido como veio. O front **não**
  formata nem reescreve; o template com números já resolve.
- `recomendacoes[].confianca` → `alta` | `media` | `baixa`, vira selo colorido.
  Outro valor cai no estilo neutro.
- `janelas[]` → faixas de fundo do Gantt. Se vier `[]`, o Gantt funciona sem o
  fundo (perde contexto, não quebra).
- `premissas[]` → lista no rodapé. Vazio esconde a seção.

**Ordenação:** o front não reordena `recomendacoes`; manda na ordem que vier.
Sugestão: maior economia primeiro.

### 3.2 `GET /api/operacao/usinas/{id}/ordens-servico`

```json
{
  "plant_id": "1",
  "total": 12,
  "ordens": [
    {
      "wo_id": "OS-001",
      "plant_id": "1",
      "turbine_id": "USI_NE_001_WTG03",
      "tipo_tarefa": "troca_de_oleo_multiplicadora",
      "duracao_h": 6.0,
      "inicio_mais_cedo": "2026-01-10T07:00:00-03:00",
      "inicio_mais_tarde": "2026-01-24T17:00:00-03:00",
      "inicio_planejado_original": "2026-01-14T09:00:00-03:00",
      "exige_subida": true,
      "equipe": "EQ-1",
      "status": "aberta",
      "is_simulated": true
    }
  ]
}
```

`exige_subida` aparece como "Sobe na nacele: Sim/Não" — é o que liga a restrição
de vento. `status` é exibido como veio.

### 3.3 `GET /api/operacao/usinas/{id}/janelas-corte?tipo=prevista`

`tipo` é `observada` ou `prevista` (a tela de manutenção pede `prevista`).
Aceitar `inicio` e `fim` opcionais.

```json
{
  "plant_id": "1",
  "tipo": "prevista",
  "inicio": "2026-01-10T00:00:00-03:00",
  "fim": "2026-01-24T23:59:59-03:00",
  "modelo_versao": "rf_v0_2026_01",
  "janelas": [
    {
      "window_id": "win_2026011610_ene",
      "plant_id": "1",
      "ts_inicio": "2026-01-16T09:00:00-03:00",
      "ts_fim": "2026-01-16T17:00:00-03:00",
      "tipo": "prevista",
      "razao": "ENE",
      "origem": "SIS",
      "profundidade_mw": 38.0,
      "probabilidade": 0.82,
      "ressarcivel": false,
      "gargalo_id": null,
      "modelo_versao": "rf_v0_2026_01"
    }
  ]
}
```

**Como a cor da faixa é decidida** (nesta ordem, no front):

1. `ressarcivel: true` → vermelho de perda ("parar aqui custa pleito");
2. `razao: "ENE"` → teal de recuperável ("parada barata");
3. resto → cinza neutro.

Ou seja: **`ressarcivel` manda mais que `razao`.** Se esse campo vier errado, a
leitura da tela inverte de sentido.

`probabilidade` é fração 0–1 (o front multiplica por 100).
`gargalo_id` é o que liga esta janela à aba Gargalos; `null` é aceito.

---

## 4. SCADA (prioridade 4)

### 4.0 A tela já funciona — com o gêmeo digital

A tela de SCADA **não está esperando o backend**. Ela roda hoje sobre
`GET /api/operacao/demo`, que já serve 1728 amostras de 10 em 10 minutos, seis
turbinas, no formato canônico de `ops.scada_10min` — com transições reais de
estado (`operando`, `limitada`, `parada_manutencao`) e 60 dos 288 intervalos com
corte ativo.

O cursor de tempo na tela percorre o cenário e é o substituto honesto do tempo
real enquanto o parque não está conectado. A cada instante a tela cruza o estado
das turbinas com o teto de exportação e responde a pergunta operacional:
**agora é hora de parar turbina?**

A rota abaixo é o upgrade: quando ela existir, a tela troca de fonte sozinha
(detecta 404 e cai no cenário; com 200, usa o parque real e passa a atualizar a
cada 10 s). Nada muda no resto da tela.

### 4.1 `GET /api/operacao/usinas/{id}/scada/ultimo`

Última leitura de cada turbina. O front chama **a cada 10 s** enquanto a aba
estiver aberta e visível (pausável pelo usuário). Se a rota for cara, avisar:
o intervalo é uma constante no front e sobe sem dificuldade.

```json
{
  "plant_id": "1",
  "ts": "2026-01-05T13:10:00+00:00",
  "is_simulated": true,
  "fonte_ingestao": "twin",
  "atraso_segundos": 42,
  "agregado": {
    "potencia_total_kw": 18420.0,
    "potencia_disponivel_total_kw": 24100.0,
    "limitacao_kw": 5680.0,
    "vento_medio_ms": 9.3,
    "turbinas_operando": 4,
    "turbinas_limitadas": 2,
    "turbinas_paradas": 0
  },
  "turbinas": [
    {
      "turbine_id": "USI_NE_001_WTG01",
      "ts": "2026-01-05T13:10:00+00:00",
      "vento_ms": 9.1,
      "potencia_kw": 2900.0,
      "potencia_disponivel_kw": 3000.0,
      "setpoint_kw": 2900.0,
      "pitch_graus": 3.2,
      "rotor_rpm": 12.4,
      "temp_nacele_c": 31.5,
      "temp_mancal_gerador_c": 62.1,
      "temp_mancal_caixa_c": 58.7,
      "status": "limitada",
      "qualidade": "ok",
      "is_simulated": true,
      "fonte_ingestao": "twin"
    }
  ]
}
```

**Campos que mudam a leitura da tela:**

- `status` — vocabulário fechado de `ops.scada_10min`: `operando`, `limitada`,
  `parada_manutencao`, `parada_falha`, `parada_rede`, `desconhecido`. Cada um tem
  cor e rótulo próprios. **Valor fora da lista cai em "Desconhecido"** — numa tela
  de operação, confundir "limitada por corte" com "parada por falha" é a diferença
  entre não fazer nada e mandar equipe a campo.
- `potencia_kw` × `potencia_disponivel_kw` — a barra de cada cartão é a razão
  entre os dois, e o vão até 100% é rotulado como "X MW cortados".
- `agregado.limitacao_kw` — tile "Sendo cortado agora". Quando > 0 a tela diz que
  é a hora mais barata de parar turbina (é a ponte para a aba Manutenção).
- `qualidade` — `ok` não mostra nada; `interpolado`, `ausente` e `suspeito` viram
  selo âmbar no cartão. Não silenciar dado ruim mandando `ok`.
- `atraso_segundos` — acima de 120 s a tela avisa "dado atrasado". Se não vier, o
  front usa `ts` e não acusa atraso.

### 4.2 `GET /api/operacao/usinas/{id}/scada?inicio=&fim=&turbine_id=`

Série histórica, mesmo formato de `turbinas[]` dentro de `{ plant_id, inicio,
fim, is_simulated, leituras: [...] }`. **Ainda não tem tela**; está tipada para o
drill-down de uma turbina. Prioridade menor que as demais.

---

## 5. Gargalos (prioridade 5 a 7)

### 5.1 `GET /api/usinas/{id}/gargalos` — o que corta esta usina

É a pergunta que o dono do ativo faz primeiro, por isso vem antes do ranking.

```json
{
  "plant_id": "1",
  "inicio": "2026-01-01T00:00:00-03:00",
  "fim": "2026-07-08T23:59:59-03:00",
  "gargalos": [
    {
      "gargalo_id": "lt_500_xingo_messias",
      "rotulo_normalizado": "LT 500 kV Xingó – Messias",
      "tipo_equipamento": "linha",
      "tensao_kv": 500,
      "subestacao": "Messias",
      "energia_restringida_mwh": 12840.5,
      "perda_estimada_reais": 1920000.0,
      "horas_corte": 318.5,
      "usinas_afetadas": 27,
      "primeira_ocorrencia": "2026-01-03T04:00:00-03:00",
      "ultima_ocorrencia": "2026-07-02T18:30:00-03:00",
      "confianca_extracao": 0.91,
      "participacao_na_perda_pct": 42.1
    }
  ]
}
```

`participacao_na_perda_pct` só existe nesta rota (é relativo à usina) e é o que
ordena a lista.

### 5.2 `GET /api/gargalos?inicio=&fim=` — ranking do sistema

Mesmos objetos, **sem** `participacao_na_perda_pct`, mais os campos de
honestidade do extrator:

```json
{
  "inicio": "2026-01-01T00:00:00-03:00",
  "fim": "2026-07-08T23:59:59-03:00",
  "cobertura_extracao_pct": 83.4,
  "total_textos_analisados": 1204,
  "gargalos": [ /* ... */ ]
}
```

`cobertura_extracao_pct` aparece como selo no topo da tela. É o compromisso de
honestidade do WS4: **se o `dsc_restricao` for genérico demais, a tela mostra a
cobertura baixa em vez de fingir precisão.** Não mandar 100 para "ficar bonito".

`tipo_equipamento` tem cor fixa por categoria (`linha`, `transformador`,
`subestacao`, `sistemico`, `outro`). Valor fora da lista quebra a legenda —
preferir `outro`.

### 5.3 `GET /api/gargalos/{gargalo_id}` — detalhe

Tudo do objeto base, mais:

```json
{
  "exemplos_texto": [
    "RESTRICAO POR LIMITE DE CARREGAMENTO NA LT 500KV XINGO / MESSIAS C1"
  ],
  "conjuntos_afetados": [
    { "plant_id": "2", "nome": "Rei dos Ventos 1", "energia_restringida_mwh": 3120.4, "horas_corte": 88.0 }
  ],
  "serie": [
    { "ts": "2026-01-03T04:00:00-03:00", "energia_restringida_mwh": 42.1 }
  ]
}
```

`exemplos_texto` é mostrado **entre aspas, como veio do ONS** — é a evidência de
que o agrupamento não foi inventado.

---

## 6. Valor / backtest (prioridade 8)

### `GET /api/operacao/usinas/{id}/backtest/ultimo` e `POST .../backtest`

O POST recebe overrides de parâmetro (a tela manda `{}` hoje) e devolve o mesmo
formato do GET.

```json
{
  "plant_id": "1",
  "run_id": "bt_20260108_77c2",
  "criado_em": "2026-01-08T10:00:00-03:00",
  "is_simulated": true,
  "sementes": 30,
  "periodo": { "inicio": "2025-07-01T00:00:00-03:00", "fim": "2026-06-30T23:59:59-03:00" },
  "premissas": [
    "Flexibilidade de data assumida em ±7 dias; não validada com O&M.",
    "Franquia anual de ressarcimento ignorada."
  ],
  "resumo": {
    "economia_brl_por_turbina_ano": 18400.0,
    "economia_brl_por_mw_ano": 6130.0,
    "teto_capturado_pct": 71.2,
    "desvio_padrao_economia_brl": 2410.0,
    "tarefas_movidas_pct": 64.0
  },
  "cenarios": [
    { "cenario": "baseline", "custo_total_brl": 142000.0, "economia_vs_baseline_brl": 0.0,
      "tarefas_movidas_pct": 0.0, "horas_em_corte_ene": 4.0, "horas_em_corte_ressarcivel": 2.0, "horas_fora_de_corte": 180.0 },
    { "cenario": "oraculo",  "custo_total_brl": 58000.0,  "economia_vs_baseline_brl": 84000.0,
      "tarefas_movidas_pct": 82.0, "horas_em_corte_ene": 140.0, "horas_em_corte_ressarcivel": 8.0, "horas_fora_de_corte": 38.0 },
    { "cenario": "realista", "custo_total_brl": 82200.0,  "economia_vs_baseline_brl": 59800.0,
      "tarefas_movidas_pct": 64.0, "horas_em_corte_ene": 112.0, "horas_em_corte_ressarcivel": 9.0, "horas_fora_de_corte": 65.0 }
  ],
  "sensibilidade": [
    { "parametro": "flexibilidade_dias", "valor": 3,  "economia_brl_por_mw_ano": 3100.0, "teto_capturado_pct": 41.0 },
    { "parametro": "flexibilidade_dias", "valor": 14, "economia_brl_por_mw_ano": 7800.0, "teto_capturado_pct": 84.0 }
  ]
}
```

**Regras que a tela assume:**

- `cenarios[].cenario` só aceita `baseline`, `oraculo`, `realista` — cada um tem
  rótulo e explicação fixos na tela ("Como é hoje", "Teto teórico", "O que o
  produto entrega"). Valor diferente aparece cru.
- Os três cenários precisam existir para o gráfico comparativo fazer sentido.
- `sementes` e `desvio_padrao_economia_brl` aparecem **juntos com a economia**
  ("± X entre N sementes"). É o compromisso do plano: um número só, sem faixa,
  não sai deste módulo. Se vier 1 semente e desvio 0, a tela mostra assim mesmo,
  e fica evidente que o backtest não foi repetido.
- `premissas[]` é o que separa um resultado honesto de um número solto. Lista
  vazia esconde a seção — e enfraquece a tela.

---

## 7. Documentos redigidos por IA

O módulo de ressarcimento já provou o padrão certo de usar IA aqui, e ele vale
para operação também:

> **O backend calcula os números de forma determinística. A IA escreve o
> documento que destrava a decisão. A IA nunca produz um número.**

Não é chat. É um botão que gera um artefato revisável, editável e exportável,
com a base numérica exibida ao lado do texto para qualquer pessoa conferir se a
redação bate com a conta.

**Regras que valem para as duas rotas abaixo:**

1. O front mostra na tela os mesmos valores que envia. Se o backend recalcular e
   chegar a outro número, ele deve devolver o recalculado em `base_numerica` —
   a tela passa a exibir esse, e a divergência aparece em vez de ficar escondida.
2. O modelo **não pode inventar nem arredondar valor**. Se um campo vier `null`,
   o texto diz que o dado não está disponível; não estima.
3. `modelo` volta preenchido e aparece junto ao documento. Quem lê precisa saber
   que aquilo foi redigido por IA.
4. Resposta longa é esperada: a tela mostra estado de "redigindo" sem timeout
   agressivo.

### 7.1 `POST /api/usinas/{id}/documentos/memorando-bess`

Memorando de decisão de investimento em bateria — o documento que acompanha o
pedido de CAPEX.

**Corpo:**

```json
{
  "periodo": { "inicio": "2026-01-01T00:00:00-03:00", "fim": "2026-07-08T23:59:59-03:00" },
  "cenario": { "potencia_mw": 50, "duracao_horas": 4, "eficiencia": 0.85, "capex": 200000000 },
  "resultado": {
    "energia_recuperada_mwh": 8120.4,
    "receita_recuperada_reais": 1310000.0,
    "percentual_mitigado": 27.6,
    "payback_anos": 9.4,
    "perda_financeira_evitavel_prevista_reais": 184000.0,
    "metodo_previsao": "media_movel_7_30d_com_zeros_guardrail"
  },
  "curva": [
    { "potencia_mw": 25, "receita_recuperada_reais": 820000.0, "percentual_mitigado": 17.1, "payback_anos": 7.2 },
    { "potencia_mw": 50, "receita_recuperada_reais": 1310000.0, "percentual_mitigado": 27.6, "payback_anos": 9.4 }
  ]
}
```

`curva` é opcional e só vai quando o usuário levantou a varredura de
dimensionamentos na tela. Quando existe, o memorando deve justificar **por que
aquele tamanho** e não outro.

**Resposta (igual para as duas rotas):**

```json
{
  "documento_id": "memo_20260923_7f1c",
  "criado_em": "2026-09-23T14:05:00-03:00",
  "modelo": "claude-sonnet-4-5",
  "markdown": "## Memorando — investimento em armazenamento

...",
  "base_numerica": { "receita_recuperada_reais": 1310000.0, "payback_anos": 9.4 },
  "aviso_revisao": "Revisão técnica e financeira obrigatória."
}
```

**O que o memorando precisa cobrir:** cenário recomendado e por quê; o que a
bateria recupera no histórico apurado *versus* o que projeta para frente
(separados, nunca somados); premissas de CAPEX e eficiência; e o que ainda não
foi validado. Sem inventar preço de bateria, vida útil ou taxa de desconto que
não tenham vindo no corpo.

### 7.2 `POST /api/operacao/agendamentos/{run_id}/justificativa`

Justificativa da reprogramação de manutenção — o texto que entra na ordem de
serviço e sustenta o pedido de mover a parada.

**Corpo:**

```json
{ "wo_ids": ["OS-001", "OS-004"], "destinatario": "supervisor_om" }
```

`wo_ids` ausente significa "todas as ordens da rodada". `destinatario`
(`supervisor_om` | `planejador` | `diretoria`) muda **o tom e o nível de
detalhe, nunca os números**.

O `run_id` já identifica a rodada no servidor, então o corpo não repete os
valores: o backend lê a recomendação que ele mesmo produziu. É o formato mais
seguro dos dois, e o preferido quando a rota tiver estado próprio.

**O que a justificativa precisa cobrir:** data original e recomendada de cada
ordem; por que a nova janela custa menos (razão e probabilidade do corte); o
ressarcimento abdicado quando a parada cai em janela ressarcível (§0.3 do
plano); e as restrições que foram respeitadas — equipe, vento, prazo.

O plano já previa isto em WS5 §6.5.5: template na v1, LLM na v2 **"para
reescrever o template em linguagem mais natural, sem alterar número"**. Esta
rota é exatamente essa v2.

### 7.3 Extensão natural (ainda sem tela)

`POST /api/operacao/usinas/{id}/documentos/briefing-turno` — o briefing do turno
para o operador, sobre a previsão das próximas 72 h e as janelas recomendadas.
Mesmo formato de resposta. Só vale construir depois que o SCADA ao vivo e as
janelas estiverem publicados; antes disso o briefing não teria o que dizer.

---

## 8. O que já está pronto e sendo consumido

Estas rotas o front **já usa hoje**; a lista serve para não quebrá-las sem aviso.

| Rota | Onde aparece |
|---|---|
| `GET /api/usinas` | Portfólio, mapa, busca ⌘K, seletor de usina em Operação |
| `GET /api/usinas/{id}` | Cabeçalho da usina, janela de datas padrão (`data_fim`) |
| `GET /api/usinas/{id}/resumo` | Painel da usina (4 tiles) e base do simulador de bateria |
| `GET /api/usinas/{id}/perda` | Painel, análise financeira, perfil horário, eventos |
| `GET /api/usinas/{id}/previsao-perdas` | Painel · "Realizado × projetado" |
| `GET /api/usinas/{id}/curtailment/previsao-detalhada` | Aba Risco |
| `POST /api/usinas/{id}/bess/simular` | Simulador de bateria |
| `GET /api/usinas/{id}/eventos-pleito` | Ressarcimento |
| `GET /api/usinas/{id}/franquia-status` | Ressarcimento |
| `POST /api/usinas/{id}/pleitos`, `GET /api/pleitos/{id}/export` | Ressarcimento |
| `POST /api/regulatorio/consulta` | Curtail AI |
| `GET/POST /api/operacao/demo` | Operação · Visão geral |
| `GET /api/build-info` | Rodapé |

### Pendências que o front detectou nos dados atuais

1. **`GET /api/usinas` não traz valor financeiro** no dataset local
   (`total_perda_reais: null`). O portfólio mostra "—" e explica; se a demo for
   com esse dataset, vale preencher.
2. **`/api/usinas/{id}/previsao-perdas` é ancorado em `datetime.now()`**, não no
   período selecionado. Com base terminando antes de hoje, `serie_historico` vem
   vazia e a projeção zerada. A tela já explica isso ao usuário, mas o
   comportamento provavelmente não é o desejado.
3. **`evidence_score` vem em 0–100** enquanto `percentual_ressarcivel` e
   `prob_corte` usam escalas diferentes. Documentado na seção 1; unificar seria
   melhor.
4. **Vocabulário misto** em `razao_normalizada` (`CNF`/`REL`/`ENE`/`INDEFINIDO`)
   e em `por_razao` (`confiabilidade`, `energetico`…). O front traduz os dois,
   mas são a mesma informação em duas línguas.
5. **Latência.** Com `DATA_BACKEND=postgres` apontando para o banco remoto, cada
   consulta leva ~130 s — inviável para demonstrar. Com
   `DATA_BACKEND=mock MOCK_DATA_DIR=data/local_demo`, cai para ~3 s.
6. **`canal_recomendado` contradiz `janela_prazo.elegivel_termo`.** Em
   `/api/usinas/{id}/eventos-pleito`, os mesmos eventos vêm com
   `canal_recomendado: "TERMO_COMPROMISSO_LEI_15269"` e
   `janela_prazo.elegivel_termo: false`. Um dos dois está errado, e a tela de
   ressarcimento hoje precisa mostrar a contradição ao usuário em vez de
   escolher um lado.
7. **`dias_restantes_protocolo_ons` fica negativo** quando a janela fechou (o
   dataset local devolve −162). O front traduz para "Vencido"; vale confirmar se
   o negativo é intencional ou se deveria ser zero com um booleano à parte.

---

## 9. Como testar sem esperar o front

Qualquer rota desta lista pode ser validada com `curl` contra o formato dos
exemplos. O front não exige nada além do que está aqui: sem header especial, sem
autenticação, mesmo prefixo `/api`.

Fixtures em `backend/data/samples/ops/` no formato do contrato (§4.3 do plano)
servem para as duas pontas — o backend desenvolve contra elas e o front ganha
dado real para conferir a tela antes de o motor estar pronto.

---

## 10. Fora deste contrato

- **Nenhuma rota de escrita em equipamento.** O produto é somente leitura nesta
  fase; o front não tem e não vai ter botão de comando (M7 do plano).
- Bateria por química (M5/WS9) e exposição comercial (M6) ainda não têm tela.
- `GET /api/operacao/usinas/{id}/scada` (série) está tipado mas sem tela.
