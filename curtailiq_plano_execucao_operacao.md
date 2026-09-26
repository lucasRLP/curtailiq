# CurtailIQ: Plano de Execução Imediata

## Operação sob corte, SCADA e ressarcimento

> **Para os agentes de código:** este documento é a especificação do que precisa ser construído agora no CurtailIQ. Ele complementa (não substitui) o `backend_spec_curtailiq.md`, o `agente_pleito_evento_spec.md`, a `adenda_elegibilidade_regulatoria.md` e a `correcao_formula_energia_restringida.md`. Leia a seção 0 e a seção 5 inteiras antes de escrever qualquer linha. Cada agente trabalha em **um** workstream (seção 5) e só toca os arquivos daquele workstream.
>
> **Para o Lucas:** a seção 0 é o resumo, a seção 2 é o plano até o fim de semana, a seção 3 é o roteiro da conversa com o ONS.

Data de referência: 22 de setembro de 2026.

---

## 0. Resumo executivo

### 0.1 O que mudou no produto

O CurtailIQ nasceu para prever cortes, quantificar a perda e montar a contestação. A pesquisa de mercado de setembro de 2026 mostrou duas coisas:

1. **Informar que vai haver corte não basta.** A usina precisa saber **o que fazer** com cada corte.
2. **A usina não controla o corte, mas controla o que faz dentro dele.** O corte é uma janela em que a energia já está perdida. Tudo que custa energia (manutenção, parada, desgaste) fica mais barato ali.

O posicionamento novo:

> **CurtailIQ recupera o que o corte tirou e transforma cada corte em oportunidade de operação.**

### 0.2 Módulos

| Módulo | Função | Estado | Prioridade |
|---|---|---|---|
| **M1 Ressarcimento** | Classificação, elegibilidade, dossiê de contestação | Pronto, com pendências | P0 (corrigir) |
| **M2 Previsão e gargalos** | Quando, quanto e **por qual gargalo** a usina será cortada | Modelo existe, gargalos é novo | P0 |
| **M3 Agendador de manutenção no corte** | Recomenda quando fazer cada manutenção para perder menos energia | Novo, é o núcleo | P0 (v1 heurística) |
| **M4 Detector de falha básico** | Gera a lista do que precisa de manutenção | Novo | P1 |
| **M5 Bateria** | Carga e descarga com custo de desgaste; simulador por química | Simulador existe | P2 |
| **M6 Exposição comercial** | Quanto o corte deixa a usina descoberta em contrato | Futuro | P3 |
| **M7 Divisão do corte entre turbinas** | Quem reduz, para poupar desgaste | Futuro, exige escrita no controle | P3 |

Infraestrutura comum, também P0:

* **Gêmeo digital eólico:** usina brasileira real (dados ONS) com SCADA sintético por turbina e padrão de manutenção real (dados abertos de Kelmarsh).
* **Camada SCADA:** adaptadores que leem CSV, OPC UA e Modbus TCP, com um **simulador OPC UA** que serve o gêmeo digital como se fosse uma usina real.

### 0.3 A regra que conecta M1 e M3 (ler com atenção)

Pela fórmula já implementada no M1 (`correcao_formula_energia_restringida.md`), a referência final do ONS é o menor valor entre a referência e a **disponibilidade** da usina. Se uma turbina está parada para manutenção durante um corte, a disponibilidade cai, a referência final cai, e **a energia ressarcível daquele corte diminui**.

Consequência para o agendador:

* Corte por **razão energética (ENE)**: não é ressarcível. Manutenção ali é praticamente gratuita.
* Corte **ressarcível (REL, e CNF quando elegível)**: manutenção ali pode reduzir o ressarcimento. O custo precisa entrar no modelo.

Essa interação ainda precisa ser **confirmada com o ONS** (seção 3). Até lá, o agendador trata como hipótese parametrizada (`penalizar_ressarcimento=true` por padrão).

### 0.4 O que NÃO fazer agora

* Não enviar comandos para turbina nenhuma. Todo o produto é **somente leitura** nesta fase. M7 fica para depois de validar acesso ao controle.
* Não construir despacho de bateria em produção (M5 fica no simulador).
* Não estender para solar ainda. Eólica primeiro: é a fonte mais cortada e onde não existe janela natural gratuita de manutenção (o vento sopra à noite).
* Não apresentar nada simulado como real. Todo dado sintético carrega `is_simulated=true` no banco e selo "Simulado" na tela.

---

## 1. Tese e evidências (para o time entender o porquê)

| Evidência | Implicação |
|---|---|
| Delfos já vende ressarcimento com SCADA, alertas de prazo e dossiê | M1 sozinho não diferencia. Diferencial é M1 + M3 com os mesmos dados |
| Controladores de parque costumam dividir o corte de forma proporcional, e a literatura mostra ganho em dividir pensando em fadiga | M7 tem valor, mas depende de acesso ao controle |
| Literatura de O&M trata "baixa produção prevista" como janela de manutenção oportunista | M3 tem base técnica; nossa novidade é usar **corte previsto** como janela |
| Eólica foi a fonte mais cortada no 1º quadrimestre de 2026 | Começar por eólica |
| Primeira solar com bateria colocalizada entrou em operação comercial em set/2026 | Bateria é fase 2, acompanhando a frota |
| Kelmarsh publica SCADA de 10 min e eventos por turbina (6 Senvion MM92, 12,3 MW, 2016 a 2024, licença CC BY 4.0) | Temos padrão real de manutenção sem precisar de cliente |

---

## 2. Plano até o fim de semana (P0)

Hoje é terça, 22/09. Encontro com pessoas do ONS no fim de semana (26 e 27/09). Depois disso, o próximo prazo duro é a **submissão da fase 2 do Centelha, até 22/10/2026 às 18h**.

### 2.1 O que precisa estar de pé até sexta à noite

| # | Entrega | Workstream | Por que importa para o ONS |
|---|---|---|---|
| 1 | Análise de gargalos a partir do `dsc_restricao` | WS4 | É o dado deles, transformado em algo útil. Abre conversa técnica |
| 2 | Correções de conformidade do M1 | WS6 | Mostra rigor com as regras deles |
| 3 | Gêmeo digital de um conjunto eólico do Nordeste + simulador OPC UA | WS2, WS3 | Prova que o sistema lê SCADA como uma usina real |
| 4 | Catálogo de manutenção de Kelmarsh | WS1 | Base do valor do M3 |
| 5 | Agendador v1 (heurística gulosa) + backtest de valor | WS5 | O número: R$ por turbina por ano |
| 6 | Aba "Operação" no front com Gantt de manutenção sobre janelas de corte | WS7 | O que se mostra na tela |

### 2.2 Cronograma dia a dia

| Dia | Manhã | Tarde e noite |
|---|---|---|
| **Ter 22/09** | Contratos de dados e schemas (seção 4) congelados; fixtures criadas | WS1 baixa Kelmarsh; WS4 amostra textos de `dsc_restricao` |
| **Qua 23/09** | WS1 catálogo; WS2 gêmeo digital; WS6 correções M1 | WS3 adaptadores + simulador OPC UA; WS4 extração de gargalos |
| **Qui 24/09** | WS5 agendador v1; WS7 aba Operação com mocks | Integração: gêmeo digital → OPC UA → ingestão → banco |
| **Sex 25/09** | WS5 backtest; WS7 ligado na API real | Ensaio da demo, correção de bugs, congelar versão (tag `demo-ons-2026-09`) |

### 2.3 Roteiro da demonstração (10 minutos)

1. **O problema em um número** (1 min): quanto o conjunto escolhido perdeu com corte no último ano, separado por razão (ENE, REL, CNF).
2. **Gargalos** (2 min): "estes são os equipamentos de rede que mais cortaram este conjunto, e estas outras usinas estão atrás do mesmo gargalo". Mostrar que veio do `dsc_restricao`.
3. **Ressarcimento** (1 min): um evento, a regra aplicada, o dossiê. Rápido, porque é o que eles já conhecem.
4. **SCADA ao vivo** (2 min): o simulador OPC UA transmitindo; o CurtailIQ lendo turbina por turbina. Dizer claramente: "simulado, calibrado com dados reais do ONS, na estrutura de um SCADA real".
5. **Manutenção no corte** (3 min): o Gantt. A mesma manutenção em horário comum contra dentro de uma janela de corte por razão energética. O valor por turbina por ano do backtest.
6. **Pergunta aberta** (1 min): a interação entre manutenção e referência final (seção 0.3). Deixar o ONS responder.

---

## 3. Conversa com o ONS

### 3.1 Enquadramento

O ONS **não é cliente**. É o dono das regras e dos dados. O objetivo da conversa é: validar premissas, entender dados disponíveis e construir relação.

Cuidado de linguagem: o M1 contesta a apuração do próprio ONS. Apresentar como **"qualidade e consistência de dados entre usina e operador"**, não como "brigar com o ONS". Dado ruim da usina (lacunas de vento no envio, curvas desatualizadas) prejudica os dois lados.

### 3.2 Perguntas para levar

**Sobre a regra que conecta M1 e M3:**
1. Se uma turbina está em manutenção durante um corte, isso reduz a disponibilidade usada no cálculo da referência final? Há algum tratamento para manutenção programada?
2. A usina precisa informar ao ONS manutenções de turbinas individuais? Com qual antecedência? Isso afeta programação?

**Sobre gargalos e dados:**
3. O campo `dsc_restricao` segue algum padrão de redação? Existe tabela de equipamentos ou códigos por trás dele?
4. Existe plano de publicar a razão e a origem do corte também na granularidade por usina individual (hoje só nas tabelas por conjunto)?
5. Quais usinas estão atrás de cada gargalo: o ONS publica essa associação em algum lugar?

**Sobre o futuro:**
6. Como está a adaptação dos Procedimentos de Rede para armazenamento (prazo de 180 dias da REN 1.162/2026)?
7. O Plano de Gestão de Excedentes na distribuição deve virar rotina ou continua emergencial?
8. Do ponto de vista do operador, uma usina que concentra manutenção nas janelas de corte ajuda ou atrapalha a operação do sistema?

### 3.3 O que registrar

Tudo que for dito vira uma nota em `docs/validacao/ons_2026_09.md`, com a pergunta, a resposta e o impacto no código (qual parâmetro muda). As respostas das perguntas 1 e 2 mudam o modelo de custo do M3 diretamente.

---

## 4. Contratos de dados (congelar na terça de manhã)

### 4.1 Onde ficam

* Dados do pipeline continuam em `dw.*` e `stg_ccee.*` (já existem: `dw.mart_eolica`, `dw.mart_solar`, `dw.dim_usina_potencia`, `stg_ccee.pld_horario_submercado`).
* Dados novos de operação ficam num schema novo, `ops`, controlado pelo backend.
* Se TimescaleDB estiver disponível, `ops.scada_10min` vira hypertable. Se não, índice composto `(turbine_id, ts)`.

### 4.2 Tabelas novas

**`ops.plant_asset`**: a usina do ponto de vista operacional.

| Coluna | Tipo | Descrição |
|---|---|---|
| `plant_id` | text PK | Mesmo identificador do conjunto no ONS (ex.: `CJU_...`) |
| `nome` | text | |
| `fonte` | text | `eolica` |
| `potencia_mw` | numeric | |
| `n_turbinas` | int | |
| `turbina_nominal_kw` | numeric | |
| `origem_dados` | text | `real`, `simulado`, `hibrido` |
| `is_simulated` | bool | |

**`ops.turbine`**

| Coluna | Tipo | Descrição |
|---|---|---|
| `turbine_id` | text PK | `{plant_id}_WTG{nn}` |
| `plant_id` | text FK | |
| `nominal_kw` | numeric | |
| `fator_esteira` | numeric | Fator multiplicativo de posição no parque (simulação) |
| `is_simulated` | bool | |

**`ops.scada_10min`**: formato canônico. Todo adaptador converte para isto.

| Coluna | Tipo | Unidade |
|---|---|---|
| `turbine_id` | text | |
| `ts` | timestamptz | início do intervalo de 10 min, UTC |
| `vento_ms` | numeric | m/s |
| `potencia_kw` | numeric | kW médio no intervalo |
| `potencia_disponivel_kw` | numeric | kW que geraria sem limitação |
| `setpoint_kw` | numeric | limite imposto (corte), nulo se sem limite |
| `pitch_graus` | numeric | |
| `rotor_rpm` | numeric | |
| `temp_nacele_c` | numeric | |
| `temp_mancal_gerador_c` | numeric | |
| `temp_mancal_caixa_c` | numeric | |
| `status` | text | `operando`, `limitada`, `parada_manutencao`, `parada_falha`, `parada_rede`, `desconhecido` |
| `qualidade` | text | `ok`, `interpolado`, `ausente`, `suspeito` |
| `is_simulated` | bool | |
| `fonte_ingestao` | text | `csv`, `opcua`, `modbus`, `twin` |

**`ops.turbine_event`**

| Coluna | Tipo | Descrição |
|---|---|---|
| `event_id` | text PK | |
| `turbine_id` | text | |
| `ts_inicio`, `ts_fim` | timestamptz | |
| `codigo`, `mensagem` | text | como vieram da origem |
| `categoria` | text | `planejada`, `nao_planejada`, `rede`, `limitacao`, `desconhecida` |
| `origem` | text | `kelmarsh`, `twin`, `cliente` |
| `is_simulated` | bool | |

**`ops.maintenance_task_catalog`**

| Coluna | Tipo | Descrição |
|---|---|---|
| `tipo_tarefa` | text PK | |
| `duracao_media_h`, `duracao_p90_h` | numeric | |
| `freq_por_turbina_ano` | numeric | |
| `exige_subida` | bool | se exige trabalho na nacele (restrição de vento) |
| `tolerancia_dias_padrao` | int | flexibilidade de data padrão |
| `origem` | text | `kelmarsh` |

**`ops.work_order`**: a ordem de serviço, como viria do sistema de manutenção do cliente.

| Coluna | Tipo | Descrição |
|---|---|---|
| `wo_id` | text PK | |
| `plant_id`, `turbine_id` | text | |
| `tipo_tarefa` | text FK catálogo | |
| `duracao_h` | numeric | |
| `inicio_mais_cedo`, `inicio_mais_tarde` | timestamptz | janela de flexibilidade |
| `inicio_planejado_original` | timestamptz | o que seria feito sem o CurtailIQ |
| `exige_subida` | bool | |
| `equipe` | text | |
| `status` | text | `aberta`, `agendada`, `concluida` |
| `is_simulated` | bool | |

**`ops.curtailment_window`**

| Coluna | Tipo | Descrição |
|---|---|---|
| `window_id` | text PK | |
| `plant_id` | text | |
| `ts_inicio`, `ts_fim` | timestamptz | |
| `tipo` | text | `observada`, `prevista` |
| `razao` | text | `ENE`, `REL`, `CNF`, `PAR`, `desconhecida` |
| `origem` | text | `SIS`, `LOC`, `desconhecida` |
| `profundidade_mw` | numeric | redução exigida média |
| `probabilidade` | numeric | 1.0 para observadas |
| `ressarcivel` | bool | vem do motor de elegibilidade do M1 |
| `gargalo_id` | text | FK para `ops.bottleneck`, quando identificado |
| `modelo_versao` | text | para previstas |

**`ops.bottleneck`** e **`ops.bottleneck_event`**

| `ops.bottleneck` | Descrição |
|---|---|
| `gargalo_id` | PK |
| `rotulo_normalizado` | ex.: `LT 500 kV Xingó Messias` |
| `tipo_equipamento` | `linha`, `transformador`, `subestacao`, `sistemico`, `outro` |
| `tensao_kv` | |
| `subestacao` | |
| `exemplos_texto` | jsonb com até 5 textos originais |
| `primeira_ocorrencia`, `ultima_ocorrencia` | |

| `ops.bottleneck_event` | Descrição |
|---|---|
| `gargalo_id`, `plant_id`, `ts` | |
| `energia_restringida_mwh` | |

**`ops.schedule_run`** e **`ops.schedule_recommendation`**

| `ops.schedule_recommendation` | Descrição |
|---|---|
| `run_id`, `wo_id`, `turbine_id` | |
| `inicio_recomendado` | |
| `inicio_baseline` | |
| `perda_esperada_mwh`, `perda_esperada_brl` | na data recomendada |
| `perda_baseline_brl` | na data original |
| `ressarcimento_perdido_brl` | efeito da seção 0.3 |
| `economia_brl` | baseline menos recomendada |
| `justificativa` | texto curto, gerado a partir dos números (template ou LLM, ver 6.5) |
| `confianca` | `alta`, `media`, `baixa` |

**`ops.backtest_result`**: uma linha por cenário, por usina, por semente.

### 4.3 Fixtures

Na terça, cada tabela ganha um CSV pequeno em `backend/data/samples/ops/` (formato idêntico ao contrato). Todo workstream desenvolve contra as fixtures e troca para o banco no final, como já é o padrão do projeto (`DATA_BACKEND=mock|postgres`).

---

## 5. Workstreams para os agentes

### 5.0 Regras para todos os agentes

1. Leia este documento e o `backend_spec_curtailiq.md` antes de começar.
2. Respeite a regra de camadas: `routers` chamam `services`, que chamam `repositories`, `engines`, `ml`, `agents`. Router nunca toca SQL nem SDK.
3. Toque **somente** os arquivos do seu workstream. Mudança em contrato (seção 4) só com aprovação do Lucas.
4. Todo dado sintético sai com `is_simulated=true`.
5. Todo parâmetro regulatório ou operacional fica em `app/config/parametros_operacao.yaml`, nunca fixo no código.
6. Todo motor determinístico tem teste. A LLM nunca calcula número, só redige texto a partir de números já calculados.
7. Commits pequenos, branch `ws{n}/descricao`, PR com descrição do que foi testado.
8. Se um nome de coluna de fonte externa (ONS, Kelmarsh) divergir do que está aqui, **confira no dado real**, registre no PR e ajuste só a camada de leitura.

### 5.1 Prompt padrão para iniciar cada agente

```
Você é o agente do workstream WS{n} do CurtailIQ.
Leia docs/curtailiq_plano_execucao_operacao.md (seções 0, 4, 5.0 e 5.{n})
e docs/backend_spec_curtailiq.md (seções 1 e 3).
Trabalhe somente nos arquivos listados em 5.{n}.
Desenvolva contra as fixtures de backend/data/samples/ops/.
Entregue: código, testes passando, e um README curto na pasta do módulo
explicando como rodar. Pare e pergunte se precisar mudar um contrato da seção 4.
```

### 5.2 Mapa de dependências

```
WS1 Kelmarsh ──────────────┐
                           ├──> WS5 Agendador + backtest ──> WS7 Front Operação
WS2 Gêmeo digital ──> WS3 SCADA ──┘                               ▲
WS4 Gargalos ─────────────────────────────────────────────────────┤
WS6 Ressarcimento (M1) ── fornece `ressarcivel` para WS5 ─────────┘
WS8 Detector de falha (P1) usa WS1 e WS3
WS9 Bateria (P2) usa WS2
```

WS1, WS2, WS4 e WS6 começam em paralelo na terça. WS3 começa quando WS2 tiver a primeira série. WS5 começa com fixtures e liga nos dados reais na quinta.

---

## 6. Especificação por workstream

### WS1: Ingestão de Kelmarsh e catálogo de manutenção (P0)

**Objetivo:** extrair de um SCADA real o padrão de manutenção de um parque eólico.

**Fonte:** Kelmarsh wind farm data, Zenodo, DOI `10.5281/zenodo.16807551` (versão v4, dados de 2016 ao fim de 2024). Arquivos relevantes: `Kelmarsh_SCADA_{ano}_*.zip`, `Kelmarsh_WT_static.csv`, `Kelmarsh_WT_dataSignalMapping.csv`. Licença CC BY 4.0: **citar a fonte** na interface e na documentação. Os zips anuais têm entre 100 MB e 700 MB; começar por 2 ou 3 anos recentes.

**Arquivos:**
```
pipelines/kelmarsh/
  download.py          # baixa e verifica md5
  parse_scada.py       # dados de turbina 10 min -> ops.scada_10min (is_simulated=false, origem kelmarsh)
  parse_events.py      # arquivos de status/eventos -> ops.turbine_event
  classify_events.py   # regra de categorização
  build_catalog.py     # -> ops.maintenance_task_catalog
  README.md
tests/pipelines/test_kelmarsh_*.py
```

**Passos:**
1. Abrir um zip, **listar os arquivos e as colunas reais** antes de escrever o parser. Registrar no README a estrutura encontrada. Os arquivos de status costumam trazer início, fim, duração, código, mensagem e alguma categoria; confirmar.
2. Mapear os sinais para o formato canônico (vento, potência, pitch, rotação, temperaturas) usando o `dataSignalMapping`.
3. Classificar eventos em `planejada`, `nao_planejada`, `rede`, `limitacao`, `desconhecida`:
   * primeiro pela categoria que vier no arquivo (se houver categoria de contrato de serviço ou padrão IEC, usar);
   * depois por palavras na mensagem (ex.: service, maintenance, scheduled para planejada; fault, error, alarm para não planejada; grid para rede; curtail, derate para limitação);
   * registrar a taxa de `desconhecida`. Se passar de 20%, parar e pedir revisão.
4. Agrupar paradas planejadas em tipos de tarefa por faixa de duração (ex.: até 4 h, 4 a 12 h, mais de 12 h) e, se a mensagem permitir, por natureza (inspeção, troca de óleo, revisão anual).
5. Calcular por tipo: duração média, p90, frequência por turbina por ano.
6. Marcar `exige_subida=true` para tarefas longas e de revisão; deixar configurável.

**Critérios de aceite:**
* Catálogo com pelo menos 3 tipos de tarefa e estatísticas por tipo.
* Relatório `pipelines/kelmarsh/relatorio_catalogo.md` com: horas de parada planejada por turbina por ano, distribuição por hora do dia e dia da semana, taxa de eventos não classificados.
* Testes de parser com um arquivo de amostra.

---

### WS2: Gêmeo digital eólico (P0)

**Objetivo:** criar uma usina brasileira com SCADA por turbina, a partir de dados reais do ONS, para desenvolver e demonstrar sem cliente.

**Arquivos:**
```
backend/app/twin/
  plant_model.py        # PlantModel: turbinas, posições, fatores
  power_curve.py        # curva empírica da usina a partir do ONS
  synthetic_scada.py    # gera ops.scada_10min simulado
  event_sampler.py      # sorteia manutenções e falhas a partir do catálogo do WS1
  work_orders.py        # gera ops.work_order simulado
  README.md
backend/app/config/twin_default.yaml
tests/twin/
```

**Escolha da usina:** um conjunto eólico do Nordeste com corte alto e dados completos no período. Sugestão: o conjunto eólico já validado no projeto (os testes de coerência usaram CJU_BAFFUT, CJU_RNSDMC, CJU_PI5FGID). Escolher o que tiver mais horas de corte ENE e REL no último ano.

**Passos:**
1. **Dados de entrada (reais):** para o conjunto, série de 30 min com geração verificada, geração de referência e referência final, razão e origem do corte (tabela agregada). Para as usinas do conjunto, das tabelas `_detail`: `val_geracaoestimada`, `val_geracaoverificada`, `val_ventoverificado`, `flg_dadoventoinvalido`. Relação conjunto e usina via dataset `usina_conjunto` (atenção ao alerta já registrado: `id_ons_conjunto` com 32 posições contra `id_ons` com 6).
2. **Curva de potência empírica:** a partir de vento verificado contra geração estimada (por usina), ajustar curva por método de bins (IEC 61400-12 simplificado): bins de 0,5 m/s, mediana por bin, descartar intervalos com `flg_dadoventoinvalido` ou com corte.
3. **Turbinas virtuais:** `n = potencia_mw / nominal_mw` (usar 2 a 4 MW nominal, configurável; para demo usar potência de turbinas típicas do Nordeste, registrando como premissa). Para cada turbina: fator de esteira entre 0,92 e 1,0; ruído de vento por turbina com correlação alta entre turbinas (ex.: 0,9).
4. **Reamostragem para 10 min:** interpolar vento de 30 para 10 min com ruído de turbulência pequeno; potência disponível pela curva; somar turbinas e **reescalar para bater a referência do ONS no intervalo de 30 min** (o gêmeo não pode inventar energia que o ONS não viu).
5. **Corte:** quando houver restrição no intervalo, calcular a redução exigida como referência menos verificada, distribuir entre turbinas de forma proporcional (é o comportamento comum; o M7 no futuro melhora isso) e preencher `setpoint_kw` e `status=limitada`.
6. **Eventos:** sortear manutenções planejadas e falhas a partir do catálogo do WS1 (frequência e duração), gravar em `ops.turbine_event` e zerar a potência da turbina durante o evento.
7. **Ordens de serviço:** para cada manutenção planejada futura, gerar `ops.work_order` com `inicio_planejado_original` em horário comercial e janela de flexibilidade de ±7 dias (configurável).

**Critérios de aceite:**
* A soma da energia do gêmeo por intervalo de 30 min bate com a verificada do ONS com erro abaixo de 1% nos intervalos sem evento.
* Um ano de SCADA simulado gerado em menos de 5 minutos.
* Tudo com `is_simulated=true`.
* Gráfico de validação salvo em `app/twin/validacao/` (gêmeo contra ONS).

---

### WS3: Camada SCADA e simulador OPC UA (P0)

**Objetivo:** provar que o CurtailIQ lê SCADA como uma usina real lê, com um caminho de integração que serve para o primeiro cliente.

**Arquivos:**
```
backend/app/scada/
  base.py               # interface ScadaSource
  csv_source.py         # exportações de historiador / SCADA em CSV
  opcua_source.py       # cliente OPC UA (biblioteca asyncua)
  modbus_source.py      # cliente Modbus TCP (biblioteca pymodbus), P1
  tag_mapping.py        # mapeia tags do cliente -> formato canônico
  quality.py            # checagens de qualidade
  ingest_service.py     # agenda leitura, grava ops.scada_10min
  README.md
backend/app/config/tag_mappings/
  kelmarsh.yaml
  twin.yaml
  exemplo_cliente.yaml
tools/scada_simulator/
  server.py             # servidor OPC UA que publica o gêmeo digital
  config.yaml
  README.md
tests/scada/
```

**Interface:**
```python
class ScadaSource(ABC):
    def list_tags(self) -> list[TagInfo]: ...
    def read_window(self, start: datetime, end: datetime) -> pd.DataFrame: ...
    def read_latest(self) -> pd.DataFrame: ...
```
Toda fonte devolve DataFrame já no formato canônico da seção 4.2, via `tag_mapping`.

**Simulador OPC UA (`tools/scada_simulator/server.py`):**
* Um nó por turbina: `Plant/{plant_id}/WTG{nn}/` com variáveis `WindSpeed`, `ActivePower`, `AvailablePower`, `Setpoint`, `Pitch`, `RotorSpeed`, `TempNacelle`, `TempGenBearing`, `TempGearBearing`, `Status`.
* Nomes de tag **diferentes** do formato canônico, de propósito, para exercitar o `tag_mapping` como aconteceria num cliente.
* Replay do SCADA simulado do WS2 com velocidade configurável (1x tempo real ou acelerado, ex.: 1 dia em 1 minuto para a demo).
* Somente leitura. O servidor não aceita escrita.

**Qualidade (`quality.py`):** detectar lacunas, valores fora de faixa física, vento travado (mesmo valor por mais de 1 h), potência acima do nominal, relógio fora de sincronia. Marcar `qualidade` na linha. Isso também alimenta o M1 (lacunas de vento que prejudicam a apuração).

**Critérios de aceite:**
* `csv_source` lê Kelmarsh e o gêmeo.
* `opcua_source` lê o simulador ao vivo e grava no banco.
* Trocar de fonte é só trocar o YAML de configuração.
* Teste de ponta a ponta: sobe o simulador, roda a ingestão por 60 s, confere linhas gravadas.

**Nota de honestidade:** num cliente real, o acesso mais comum para terceiros é exportação do historiador ou API do sistema secundário, não conexão direta no SCADA de controle. OPC UA é o padrão de mercado para quando há conexão. O adaptador CSV não é um plano B, é provavelmente o caminho do primeiro piloto.

---

### WS4: Gargalos a partir do `dsc_restricao` (P0)

**Objetivo:** transformar o texto livre do ONS numa lista de equipamentos de rede que causam corte, com as usinas atrás de cada um.

**Arquivos:**
```
backend/app/engines/bottleneck_analysis.py
backend/app/agents/bottleneck_extractor_agent.py
backend/app/services/gargalos_service.py
backend/app/routers/gargalos.py
backend/app/schemas/gargalos.py
tests/engines/test_bottleneck_analysis.py
```

**Passos:**
1. **Exploração primeiro:** extrair os textos distintos de `dsc_restricao` (preenchido a partir de set/2025, até 600 caracteres, nas tabelas agregadas por conjunto). Salvar uma amostra de 200 textos em `docs/validacao/amostra_dsc_restricao.md` e **olhar antes de codar**. Não sabemos o padrão de redação.
2. **Normalização:** minúsculas, remover acentos, colapsar espaços, padronizar abreviações (`lt`, `se`, `tr`, `kv`).
3. **Extração por regra:** expressões regulares para padrões óbvios (linha de transmissão com tensão e nomes de subestação, transformador, subestação).
4. **Extração por LLM para o que sobrar:** agente com saída JSON validada por Pydantic:
   ```json
   {"equipamentos": [{"tipo": "linha|transformador|subestacao|sistemico|outro",
                      "nome": "...", "tensao_kv": 500, "subestacao": "..."}],
    "motivo": "...", "contingencia": true}
   ```
   Cache por hash do texto normalizado (cada texto distinto é processado uma vez). Temperatura zero.
5. **Agrupamento:** unificar variações do mesmo equipamento (distância de edição sobre o rótulo normalizado + revisão manual de uma lista de sinônimos em YAML).
6. **Associação:** para cada gargalo, os conjuntos afetados, horas de corte, energia restringida, período.

**Saídas (endpoints):**
* `GET /gargalos?periodo=` : ranking de gargalos por energia restringida.
* `GET /gargalos/{id}` : detalhe, conjuntos afetados, série temporal.
* `GET /usinas/{id}/gargalos` : o que corta esta usina.

**Critérios de aceite:**
* Pelo menos 80% dos textos com ao menos um equipamento extraído, ou relatório explicando por que não.
* Ranking para o conjunto da demo.
* Custo de LLM registrado (número de chamadas e tokens).

**Nota de honestidade:** se o texto for genérico demais (ex.: só "razão energética"), o resultado mostra isso. Não inventar gargalo.

---

### WS5: Agendador de manutenção no corte e backtest de valor (P0 v1, P1 v2)

**Objetivo:** o núcleo do produto novo, e o número que prova o valor.

**Arquivos:**
```
backend/app/engines/curtailment_windows.py
backend/app/engines/maintenance_cost.py
backend/app/engines/maintenance_scheduler.py
backend/app/engines/value_backtest.py
backend/app/services/operacao_service.py
backend/app/routers/operacao.py
backend/app/schemas/operacao.py
backend/app/config/parametros_operacao.yaml
tests/engines/test_maintenance_*.py
tests/engines/test_value_backtest.py
```

#### 6.5.1 Janelas de corte (`curtailment_windows.py`)

* **Observadas:** a partir dos intervalos com restrição (eventização já existente em `curtailment_events.py`). Cada janela herda razão, origem e `ressarcivel` (chamar o motor de elegibilidade do M1, não reimplementar).
* **Previstas:** a partir da saída do modelo de previsão (probabilidade e magnitude por intervalo). Janela prevista = sequência de intervalos com probabilidade acima de um limiar configurável, com a probabilidade média e profundidade esperada.
* Razão prevista: por enquanto, classificar a janela prevista como ENE quando o modelo indicar sobreoferta sistêmica e como `desconhecida` caso contrário. Melhorar depois com os gargalos do WS4.

#### 6.5.2 Modelo de custo (`maintenance_cost.py`)

Para um intervalo `t` de duração `Δt` (1/6 h no SCADA de 10 min), numa usina com potência disponível `A_t` e redução exigida pelo corte `C_t` (zero se não há corte):

Seja `S_t` a soma da potência disponível das turbinas que estariam paradas para manutenção em `t`.

1. **Energia perdida pela manutenção:**
   `E_perdida_t = max(0, S_t − C_t) × Δt`
   Se o corte exigido já é maior que o que a manutenção tira, a parada não custa energia.
2. **Ressarcimento perdido** (só se a janela é ressarcível e `penalizar_ressarcimento=true`):
   `R_perdido_t = min(S_t, C_t) × Δt × valor_ressarcimento_t`
   Justificativa: a parada reduz a disponibilidade, que limita a referência final (seção 0.3).
3. **Custo no intervalo:**
   `custo_t = E_perdida_t × preco_t + R_perdido_t`
   com `preco_t` = PLD horário do submercado (padrão) ou preço de contrato (parâmetro).
4. **Custo esperado com previsão:**
   `E[custo_t] = p_t × custo_t(com corte previsto) + (1 − p_t) × custo_t(sem corte)`

Para o valor de ressarcimento, usar o mesmo cálculo do M1 (PLD horário do evento, regras de franquia). Na v1, aproximar ignorando a franquia anual e registrar essa simplificação.

#### 6.5.3 Restrições do agendador

Todas em `parametros_operacao.yaml`:

| Restrição | Padrão | Observação |
|---|---|---|
| Janela de flexibilidade | da ordem de serviço | ±7 dias quando simulado |
| Horário de trabalho | 07:00 a 17:00 | |
| Dias de trabalho | segunda a sábado | domingo tem mais corte ENE; testar com e sem |
| Limite de vento para subir na turbina | **12 m/s, provisório** | **confirmar com O&M**; só vale para tarefas com `exige_subida` |
| Equipes simultâneas | 2 | |
| Uma tarefa por turbina por vez | sim | |
| Tarefa não pode ser interrompida | sim | |

#### 6.5.4 Algoritmo

* **v1 (P0, até sexta):** heurística gulosa. Ordenar tarefas por duração decrescente. Para cada tarefa, enumerar inícios viáveis em passos de 30 min dentro da janela de flexibilidade, calcular o custo esperado considerando as tarefas já alocadas (o `S_t` muda), escolher o menor. Determinística e explicável.
* **v2 (P1):** programação por restrições com OR Tools (solver CP SAT), tarefas como intervalos, custo discretizado por intervalo, restrição de capacidade de equipes. Comparar com a v1 no backtest.

#### 6.5.5 Justificativa das recomendações

Cada recomendação traz uma frase curta. Na v1, **template** preenchido com números:
> "Mover de 14/10 09:00 para 16/10 10:00: janela de corte por razão energética prevista (prob. 0,82, 38 MW de redução). Perda esperada cai de R$ 4.120 para R$ 310."

LLM só entra na v2, e só para reescrever o template em linguagem mais natural, sem alterar número.

#### 6.5.6 Backtest de valor (`value_backtest.py`)

Três cenários sobre o mesmo período e a mesma usina do gêmeo digital, com as mesmas ordens de serviço:

| Cenário | Janelas usadas | O que mede |
|---|---|---|
| **A. Baseline** | nenhuma; cada tarefa no `inicio_planejado_original` | como é hoje |
| **B. Oráculo** | janelas observadas (probabilidade 1) | teto teórico do ganho |
| **C. Realista** | janelas previstas pelo modelo, **em modo walk forward** (só com informação disponível em D menos 1) | o que o produto entregaria |

Rodar com pelo menos 30 sementes de sorteio de ordens de serviço e reportar média e desvio.

**Métricas de saída:**
* Economia em R$ por turbina por ano e por MW por ano (C contra A).
* Percentual do teto capturado: (A − C) / (A − B).
* Percentual de tarefas movidas.
* Horas de manutenção dentro de corte ENE, dentro de corte ressarcível e fora de corte.
* Sensibilidade: flexibilidade de 3, 7 e 14 dias; limite de vento de 10, 12 e 15 m/s; com e sem domingo; com e sem penalidade de ressarcimento.

**Relatório:** `docs/resultados/backtest_valor_{plant_id}.md` gerado automaticamente, com tabelas e gráficos. Este é o documento que vai para o Centelha e para as conversas com usinas.

**Critérios de aceite:**
* Testes unitários do modelo de custo com casos à mão (corte maior que a parada, menor que a parada, sem corte, ressarcível).
* Cenário B sempre com custo menor ou igual ao A (se não, há bug).
* Relatório gerado de ponta a ponta com um comando.

**Nota de honestidade:** o ganho depende de premissas que ainda não validamos com O&M (flexibilidade real das datas, limite de vento, quem decide a data). O relatório precisa listar as premissas no topo e mostrar a sensibilidade a cada uma. Um número só, sem faixa, não sai deste módulo.

---

### WS6: Ressarcimento, correções e regime atual (P0)

**Objetivo:** fechar as pendências conhecidas do M1 e atualizar para o regime de 2026, antes de mostrar ao ONS.

**Arquivos:** os do M1 existentes (`curtailment_events.py`, motor de elegibilidade, `dossier_agent.py`, schemas do pleito). Não criar módulo novo.

**Pendências já mapeadas (do histórico do projeto):**
1. Filtro temporal do CNF: evento fora da janela do Termo não pode ir para o canal do Termo.
2. PAR mapeado explicitamente como não elegível no normalizador.
3. Origem ausente vai para revisão humana, não para comportamento antigo.
4. Franquia anual acumulada por ano civil, não pela janela da tela.
5. Carregar `dsc_restricao` e `flg_dadoventoinvalido` nas consultas.
6. Flag `referencia_oficial` por evento (referência final do ONS contra estimativa própria).
7. Corrigir `geracao_verificada_mwh` e `geracao_referencia_mwh` zerados no payload do dossiê.
8. Limpar o diretório duplicado `backend/backend/`.

**Atualizações de regime:**
* Parâmetros da Portaria MME 140/2026 em `parametros_operacao.yaml` (ou no YAML regulatório existente): janela de eventos elegíveis ao Termo de 01/09/2023 a 25/11/2025, razões cobertas (confiabilidade e indisponibilidade externa), e o cronograma de reapuração pelo ONS e recontabilização pela CCEE.
* Revisar os prazos de contestação usados nos alertas contra a regra vigente, **conferindo na fonte oficial** (há materiais de mercado citando prazos diferentes; não copiar de concorrente).
* O dossiê passa a citar o gargalo do WS4 quando houver.

**Integração nova com o SCADA (P1):** quando houver dado de usina (WS3), o dossiê usa vento e disponibilidade medidos localmente como evidência, e o módulo de qualidade aponta lacunas que prejudicariam a apuração.

**Critérios de aceite:**
* Os 56 testes atuais continuam passando, mais um teste por pendência corrigida.
* Um dossiê de exemplo do conjunto da demo gerado sem campo zerado.

---

### WS7: Front, aba "Operação" (P0)

**Arquivos:** `front/src/pages/Operacao/` (ou equivalente na estrutura atual), componentes em `front/src/components/operacao/`.

**Telas:**
1. **SCADA ao vivo:** grade de turbinas (cartão por turbina com potência, vento, status por cor), atualizando a cada poucos segundos a partir da API. Selo "Simulado" visível quando `is_simulated`.
2. **Calendário de manutenção:** Gantt com uma linha por turbina; faixas de fundo com as janelas de corte (cor por razão: ENE numa cor, ressarcível em outra); barras das tarefas na data original (contorno) e na recomendada (preenchida); ao clicar, a justificativa e os números.
3. **Valor:** cartões com economia por turbina por ano, percentual do teto capturado, tabela de sensibilidade do backtest.
4. **Gargalos:** ranking e, ao clicar, os conjuntos afetados.

**Critério de aceite:** funciona com mocks na quarta e com a API real na sexta; roda no ambiente de demo atual.

---

### WS8: Detector de falha básico (P1, depois do fim de semana)

**Objetivo:** gerar a lista do que precisa de manutenção, para o agendador ter o que agendar num cliente real.

**Abordagem v1:**
* **Resíduo da curva de potência:** potência real contra a esperada pela curva de cada turbina, em condições sem corte. Queda persistente sinaliza problema.
* **Temperaturas:** modelo de temperatura esperada do mancal e do gerador em função de potência e temperatura ambiente; resíduo crescente sinaliza desgaste.
* **Validação:** treinar em Kelmarsh e medir se os alertas antecedem as paradas não planejadas registradas nos eventos (antecedência e taxa de falso alarme).

**Saída:** alertas viram ordens de serviço sugeridas com janela de flexibilidade estimada pela gravidade.

**Nota:** detecção de falha é o centro do produto da Delfos. Não competir em sofisticação. O detector existe para alimentar o agendador, que é o nosso diferencial.

---

### WS9: Bateria no gêmeo digital (P2)

* Parametrizar o simulador BESS existente por química (eficiência de ida e volta, ciclos, degradação por ciclo e por calendário, custo), com valores de referência documentados e fonte citada.
* Corrigir o erro conceitual já registrado no `simulador_bess_v2_spec.md` (divisão 70/30 que conta ciclos duas vezes; a versão correta é despacho diário, com dia de corte carregando de graça e dia sem corte fazendo arbitragem, um ciclo por dia).
* Acoplar ao gêmeo digital: a bateria absorve parte do `C_t` e o custo de desgaste entra na decisão.
* Mesmo formato de backtest do WS5 (sem bateria, com bateria e regra simples, com bateria e otimização).

---

## 7. Novos endpoints (resumo)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/operacao/usinas/{id}/scada/ultimo` | último valor por turbina |
| GET | `/operacao/usinas/{id}/scada?inicio=&fim=` | série |
| GET | `/operacao/usinas/{id}/janelas-corte?tipo=` | observadas ou previstas |
| GET | `/operacao/usinas/{id}/ordens-servico` | |
| POST | `/operacao/usinas/{id}/agendar` | roda o agendador, devolve `run_id` e recomendações |
| GET | `/operacao/agendamentos/{run_id}` | |
| POST | `/operacao/usinas/{id}/backtest` | roda o backtest com parâmetros |
| GET | `/operacao/usinas/{id}/backtest/ultimo` | |
| GET | `/gargalos` | ver WS4 |
| GET | `/usinas/{id}/gargalos` | ver WS4 |

---

## 8. Estrutura final de pastas (adições)

```
backend/app/
  scada/           # WS3
  twin/            # WS2
  engines/
    bottleneck_analysis.py      # WS4
    curtailment_windows.py      # WS5
    maintenance_cost.py         # WS5
    maintenance_scheduler.py    # WS5
    value_backtest.py           # WS5
  agents/
    bottleneck_extractor_agent.py  # WS4
  config/
    parametros_operacao.yaml
    twin_default.yaml
    tag_mappings/
pipelines/kelmarsh/        # WS1
tools/scada_simulator/     # WS3
docs/
  validacao/               # notas de entrevistas e da conversa com o ONS
  resultados/              # relatórios de backtest
```

---

## 9. Qualidade e honestidade (vale para o código e para a fala)

1. **Real, simulado e híbrido sempre separados.** No banco (`is_simulated`), na tela (selo) e na fala ("gêmeo digital calibrado com dados reais do ONS e com o padrão de manutenção de um parque real").
2. **Premissas no topo de todo relatório.** Especialmente limite de vento, flexibilidade de datas e a regra da seção 0.3.
3. **Faixas, não números únicos**, em qualquer valor de negócio.
4. **Citar Kelmarsh** (Cubico, CC BY 4.0) onde o dado aparece.
5. **Não dizer que operamos a usina.** Nesta fase, o CurtailIQ **recomenda**; a equipe da usina decide e executa.
6. **Reprodutibilidade:** todo relatório registra versão do código, versão do modelo, período dos dados e sementes.

---

## 10. Depois do fim de semana: até a fase 2 do Centelha (22/10)

| Semana | Foco |
|---|---|
| 28/09 a 04/10 | Incorporar respostas do ONS nos parâmetros; agendador v2; WS8 começa |
| 05/10 a 11/10 | Roteiro e início das 10 entrevistas com O&M e engenheiros de fabricante; contato Axia via COPPE |
| 12/10 a 18/10 | Backtest final com premissas das entrevistas; relatório de valor; cronograma e orçamento da proposta |
| 19/10 a 22/10 | Redação e submissão da fase 2 (envio até 18h do dia 22) |

### Perguntas das entrevistas com O&M (a validação que decide o M3)

1. Que percentual da manutenção planejada tem data flexível, e com quantos dias de tolerância?
2. Quem define a data: a geradora ou o fabricante, pelo contrato de serviço?
3. Qual o limite de vento para trabalho na nacele?
4. Hoje alguém considera o corte ao planejar manutenção?
5. Como as ordens de serviço são registradas? Dá para exportar?
6. Quando o ONS manda reduzir, como o controlador divide o corte entre turbinas? Dá para mudar?

### Critérios para mudar de rumo

* Datas de manutenção fixadas pelo fabricante e sem flexibilidade real: M3 vira funcionalidade secundária; foco em M1 com M5.
* Ganho do backtest abaixo do que justificaria cobrança (definir o piso com o time antes de ver o número): M3 vira funcionalidade dentro do M1.
* Nenhuma usina libera dado nem para o M1: prioridade passa a ser o P&D com a Axia.

---

## 11. Checklist de sexta à noite

* [ ] Contratos da seção 4 congelados e fixtures no repositório
* [ ] Catálogo de Kelmarsh com relatório
* [ ] Gêmeo digital do conjunto escolhido, validado contra o ONS
* [ ] Simulador OPC UA transmitindo e ingestão gravando no banco
* [ ] Ranking de gargalos do conjunto
* [ ] Pendências 1 a 7 do M1 corrigidas, testes passando
* [ ] Agendador v1 e relatório de backtest com sensibilidade
* [ ] Aba Operação ligada na API real
* [ ] Tag `demo-ons-2026-09` criada
* [ ] Roteiro da demo ensaiado duas vezes
* [ ] Perguntas da seção 3.2 impressas ou no celular
