# Agente de Pleito de Ressarcimento por Evento — Spec Completo (CurtailIQ)

> **Para o agente de código:** este documento especifica a evolução do módulo de pleito do CurtailIQ. Hoje a aplicação tem uma aba que gera um "dossiê genérico do período". Isso muda. A nova arquitetura é **um pleito por evento de corte elegível**, com seleção pelo usuário do que reivindicar. O backend é FastAPI/Python sobre Postgres (camada gold) e o frontend é React. Leia o §0 antes de tudo — ele define o porquê de cada decisão. Onde houver instrução normativa, **confirme na fonte oficial** antes de fixar valores; a regulação muda.

---

## 0. Por que esta arquitetura (princípios não negociáveis)

A pesquisa de fundamentação revelou três coisas que governam todo o design:

**Primeiro: "pleito de ressarcimento" não é um documento único.** São três canais distintos, com prazo, destinatário e formato diferentes — (a) consistência rotineira no SAGER, em 3 dias úteis; (b) **pleito de revisão fora do mês**, via Protocolo ONS no SINtegre, em até 90 dias corridos da ocorrência, endereçado ao Gerente Executivo de Apuração, Análise e Custo da Operação do ONS; (c) **dossiê de adesão/impugnação ao Termo de Compromisso** da Lei 15.269/2025 (regime retroativo set/2023–nov/2025). O agente **prioriza os canais (b) e (c)** — são os de maior valor jurídico, onde a redação importa, e onde há lacuna de mercado real (Way2/ePowerBay/Volt fazem (a) bem). O canal (a) entra como aviso/alerta, não como produto principal.

**Segundo: pleito por evento, não por período.** A aplicação hoje gera "um dossiê do mês". Isso é menos defensável juridicamente e operacionalmente fraco. Cada evento de corte tem características próprias (data, motivo, magnitude, dados probatórios) e o usuário precisa decidir caso a caso o que vale a pena pleitear — porque cada pleito custa esforço probatório, e nem todo evento é elegível ou compensa. O agente lista eventos, classifica elegibilidade, calcula valor potencial e o usuário **seleciona** quais entram no pleito. O agente então redige o documento agregando os selecionados, mas mantendo a granularidade evento a evento dentro dele.

**Terceiro: minimizar o "pensar" da LLM.** A elegibilidade (REL ressarcível, CNF com ressalvas, ENE nunca), o cálculo (energia frustrada × PLD, com franquia de horas) e o enquadramento normativo são **regras determinísticas** que rodam em código Python, não no prompt. A LLM só faz o que ela faz melhor: redigir o documento em linguagem técnica/jurídica correta, dado um pacote de dados já classificado e calculado. Isso reduz custo, latência, erro e aumenta auditabilidade. **Tudo que é regra vai em código; só a redação vai pra LLM.**

---

## 1. Arquitetura geral

```
┌─────────────────────────────────────────────────────────────┐
│ FRONTEND (React)                                            │
│  Aba "Eventos de Pleito" → lista por evento, ações por linha│
│  Aba "Dossiê" → seleção, ranking, geração e download        │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP (REST)
┌────────────────────────▼────────────────────────────────────┐
│ BACKEND FastAPI                                             │
│                                                             │
│  routers/pleito.py      ─── endpoints públicos              │
│         │                                                   │
│         ▼                                                   │
│  services/pleito_service.py  ── orquestra o caso de uso     │
│         │                                                   │
│         ├─► engine/elegibilidade.py  (REL/CNF/ENE + franquia)│
│         ├─► engine/valoracao.py      (× PLD, contratos)     │
│         ├─► engine/reconciliacao.py  (SAGER × SMF)          │
│         ├─► engine/franquia.py       (acúmulo anual)        │
│         ├─► templates/                (Jinja2 .md)          │
│         └─► agents/redator_pleito.py (LLM Anthropic)        │
│                                                             │
│  repositories/pleito_repo.py ── leitura da camada gold      │
└─────────────────────────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│ POSTGRES (camada gold, populada pelo pipeline medalhão)     │
│  gold.usinas, gold.constrained_off, gold.pld_horario, ...   │
│  + tabelas novas: gold.contratos_usina (opcional/manual),   │
│    gold.franquia_anual (parametrização normativa)           │
└─────────────────────────────────────────────────────────────┘
```

**A regra de ouro de camadas:** routers chamam services; services chamam engines (puro código, sem rede) e o repo; o agente LLM é chamado **só no fim**, recebendo um pacote já pronto. Engines são puras e testáveis sem FastAPI/LLM/banco — é onde mora a lógica que precisa ser correta.

---

## 2. Dados necessários (o que precisa estar no banco / na camada gold)

A maior parte já existe do spec anterior. O que muda são **complementos críticos** para o pleito.

### 2.1 Tabelas que já devem existir (reuso)
- `gold.usinas` — incluindo agora `ceg` (Código Único de Empreendimento de Geração, obrigatório para identificar a usina no documento), `sigla_ons` (sigla usada nos sistemas ONS).
- `gold.constrained_off` — com `razao_restricao` ∈ {REL, CNF, ENE}, `energia_restringida_mwh`, `geracao_referencia_mwh`, `geracao_verificada_mwh`, `timestamp` (em UTC; converter para America/Sao_Paulo / hora de Brasília UTC−3 na exibição e no documento). Adicionar:
  - `origem_restricao` — {SIS, LOC} se disponível (sistêmica vs. local).
  - `patamar_semi_horario` — identificador do patamar de 30 min do ONS.
  - `evento_id` — chave estável por evento (compor a partir de usina_id + timestamp_inicio + razao).
- `gold.pld_horario` — já existe.
- `gold.clima_horario` — observado e/ou previsto, por usina (vento m/s, irradiância W/m²).

### 2.2 Tabelas novas (criar)

**`gold.franquia_anual`** — parametrização normativa, atualizável anualmente sem mexer no código:
| coluna | tipo | descrição |
|---|---|---|
| `ano` | int | ano civil |
| `fonte` | text | `eolica` ou `solar` |
| `franquia_horas` | float | horas/ano abaixo das quais não há ressarcimento |
| `fonte_normativa` | text | ex.: "REN 1.030/2022 art. 16 §2º" |
| `observacao` | text | nota livre |

Default para 2025 (com a ressalva de honestidade técnica: confirmar com ONS antes do go-live; o limite é atualizado anualmente): eólica ≈ 78–82h, solar ≈ 30,5–41h. Como há divergência entre fontes (norma vs. divulgação Way2), o agente NÃO hardcoda — lê desta tabela. O frontend mostra o valor usado e a fonte.

**`gold.contratos_usina`** *(opcional, manual)* — para a parcela contratada do ACR/ACL:
| coluna | tipo | descrição |
|---|---|---|
| `usina_id` | text (FK) | |
| `tipo_contrato` | text | `CCEAR_DISPONIBILIDADE`, `CER`, `ACL`, `NAO_CONTRATADO` |
| `volume_mwm` | float | volume contratado em MW médios |
| `preco_reais_mwh` | float | preço do contrato |
| `vigencia_inicio` / `vigencia_fim` | date | |

Isto define se o ressarcimento vai ao **agente gerador** (parcela não contratada, valorada ao PLD), à **distribuidora compradora** (CCEAR por Disponibilidade) ou à **CONER** (CER). O agente declara o destinatário do ressarcimento no documento. Sem esta tabela, o agente assume "parcela não contratada" como default e declara essa assunção no rascunho.

**`gold.dados_proprios_climatologia`** *(opcional, manual)* — dados anemométricos/solarimétricos do gerador (das torres AMA, do SMF, do SCADA) usados em substituição/contestação aos do ONS, conforme Ofício 61/2025-SGM/ANEEL:
| coluna | tipo | descrição |
|---|---|---|
| `usina_id` | text (FK) | |
| `timestamp` | timestamp | |
| `vento_ms_proprio` | float | |
| `irradiancia_wm2_proprio` | float | |
| `disponibilidade_eletromecanica` | float | 0–1 |
| `fonte_dado` | text | ex.: "torre AMA-1", "SMF" |

Quando esta tabela tem dado para o evento, o agente compara com `gold.clima_horario` (ONS) e **a divergência vira o argumento central da contestação**. Esta é a parte mais valiosa do agente.

### 2.3 Tabela operacional (não-gold)

**`pleitos`** — estado dos pleitos gerados pelo usuário, no schema da aplicação (não gold):
| coluna | tipo | descrição |
|---|---|---|
| `id` | uuid (PK) | |
| `usina_id` | text | |
| `canal` | text | `PROTOCOLO_ONS` ou `TERMO_COMPROMISSO_LEI_15269` |
| `eventos_ids` | jsonb (array) | eventos selecionados |
| `status` | text | `RASCUNHO`, `REVISADO`, `EXPORTADO` |
| `markdown_gerado` | text | corpo do documento |
| `metadados_json` | jsonb | snapshot dos parâmetros (franquia usada, PLD, etc.) |
| `criado_em`, `atualizado_em` | timestamp | |
| `usuario_id` | text | (placeholder, se houver auth) |

---

## 3. Engines (lógica determinística — onde mora a correção)

Cada engine é um módulo Python puro, sem dependência de FastAPI, banco ou LLM. Testável isoladamente. Esta é a parte que **não pode errar**, então é onde reside a regra, não no prompt.

### 3.1 `engine/elegibilidade.py`

```python
def classificar_elegibilidade(evento: EventoCorte, regras: RegrasElegibilidade) -> Elegibilidade
```

Regras (parametrizáveis num dict de config):
- `REL` → elegível para ressarcimento via ESS (REN 1.030/2022). Aplica franquia.
- `CNF` → **elegível com ressalvas** após Lei 15.269/2025 (regime retroativo set/2023–nov/2025 no canal Termo; demais casos checar regulamentação vigente). Não aplica franquia em CNF (confirmar na regulamentação do Termo).
- `ENE` → **nunca elegível** (vetado na Lei 15.269; agente recusa de plano).
- Casos especiais a flagar: motivo `LOC` (origem local) tende a não ser ressarcível (origem nas instalações do próprio agente); marcar para revisão humana.

Output:
```python
@dataclass
class Elegibilidade:
    elegivel: bool
    canal_recomendado: str  # PROTOCOLO_ONS | TERMO_COMPROMISSO_LEI_15269 | NENHUM
    motivo_inelegibilidade: str | None
    fonte_normativa: str    # ex.: "REN 1.030/2022 art. 16; Lei 15.269/2025 art. 1º-B"
    confianca: float        # 1.0 quando regra determinística aplica direto; < 1 em casos limítrofes
```

### 3.2 `engine/franquia.py`

```python
def aplicar_franquia(eventos_ano: list[EventoCorte], fonte: str, ano: int, franquia_horas: float) -> ResultadoFranquia
```

Lógica:
1. Filtrar só eventos REL (a franquia se aplica a REL, conforme leitura predominante; CNF no regime do Termo segue regra própria — parametrizar).
2. Ordenar por timestamp.
3. Acumular horas (cada evento contribui com `duracao_horas`).
4. Marcar cada evento como `dentro_franquia` enquanto o acumulado ≤ franquia; `parcialmente_franquia` no evento de cruzamento; `acima_franquia` depois.
5. Para `parcialmente_franquia`, calcular a fração acima e proporcionalmente a `energia_acima_franquia_mwh`.

Output por evento: `horas_acumuladas_antes`, `horas_acumuladas_depois`, `status_franquia`, `energia_ressarcivel_mwh`.

**Importante:** a franquia é por ano civil e por usina (ou conjunto, conforme outorga). Resetar em 01/jan.

### 3.3 `engine/valoracao.py`

```python
def valorar(evento: EventoCorte, energia_ressarcivel_mwh: float, pld_horario: float,
            contratos: list[Contrato] | None) -> Valoracao
```

Regras:
- Sem contrato carregado → `valor_pleitavel = energia_ressarcivel_mwh × PLD` no submercado e hora do evento. Destinatário do ressarcimento: agente gerador (parcela não contratada).
- Com contrato `CCEAR_DISPONIBILIDADE` → parte vinculada ao contrato é paga à distribuidora compradora; **na minuta atual** o agente expõe ambos os valores e marca o destinatário.
- Com contrato `CER` → destinatário CONER.
- Sempre registrar `pld_usado`, `submercado`, `unidade` (R$/MWh) e `fonte` (CCEE).

### 3.4 `engine/reconciliacao.py`

```python
def reconciliar(evento: EventoCorte, dados_ons: DadosClimaONS,
                dados_proprios: DadosProprios | None) -> Reconciliacao
```

Quando há `dados_proprios` para o evento:
- Comparar `vento_ms` (ONS) vs. `vento_ms_proprio` — calcular delta e desvio relativo.
- Comparar `irradiancia_wm2` idem.
- Comparar `disponibilidade_eletromecanica`.
- Recalcular geração de referência **com os dados próprios** e comparar com a `geracao_referencia_mwh` do ONS — esta diferença é o **núcleo do argumento de contestação** (Submódulo 5.13/RO-AO.BR.13 e Ofício 61/2025-SGM).
- Output: `divergencia_significativa: bool`, `delta_geracao_referencia_mwh`, `argumento_tecnico` (texto curto auto-gerado, vai como contexto para a LLM redigir).

Sem `dados_proprios`: a reconciliação é "não realizada" — o pleito segue com os dados do ONS, mas o documento deve declarar que o agente reserva o direito de revisão quando os dados próprios estiverem disponíveis.

### 3.5 `engine/prazos.py`

```python
def janela_pleito(evento: EventoCorte, hoje: date) -> JanelaPleito
```

- **Protocolo ONS**: até 90 dias corridos após a ocorrência do evento. Output: `dias_restantes`, `pode_pleitear`.
- **Termo de Compromisso (Lei 15.269)**: aplicável a eventos entre 01/09/2023 e 25/11/2025. Output: `elegivel_termo`, `janela_adesao` (segue a regulamentação MME/CCEE — manter parametrizável; hoje em consulta pública).
- **Consistência SAGER (informativo)**: 3 dias úteis após disponibilização — se aplicável e ainda dentro da janela, o agente avisa "considere também a contestação rotineira no SAGER".

---

## 4. Repositório e Service

### `repositories/pleito_repo.py`

Métodos mínimos:
- `listar_eventos(usina_id, inicio, fim, apenas_elegivel: bool = False)` — joga já com `pld_horario`, `clima_horario` e (se houver) `dados_proprios_climatologia`, devolvendo eventos enriquecidos.
- `obter_franquia(ano, fonte)` — lê `gold.franquia_anual`.
- `obter_contratos_vigentes(usina_id, data)` — opcional.
- `obter_usina(usina_id)` — com CEG, sigla ONS, submercado, fonte.
- `salvar_pleito(pleito)` / `obter_pleito(id)` — para a tabela operacional.

### `services/pleito_service.py`

Orquestração do caso de uso, sem tocar HTTP nem LLM diretamente.

```python
def listar_eventos_para_pleito(usina_id, inicio, fim) -> list[EventoEnriquecido]:
    """
    Para a aba 'Eventos de Pleito'.
    Para cada evento:
      1. Carrega evento + PLD + clima + dados próprios.
      2. Classifica elegibilidade.
      3. Aplica franquia (no contexto do ano).
      4. Valora (energia ressarcível × PLD).
      5. Reconcilia (se houver dados próprios).
      6. Calcula janela de prazo.
      7. Calcula 'potencial_financeiro' = energia_ressarcivel_mwh × pld.
      8. Devolve struct com tudo, ordenado por potencial_financeiro DESC.
    """
```

```python
def gerar_pleito(usina_id, eventos_ids: list[str], canal: str) -> Pleito:
    """
    Para a aba 'Dossiê'.
    1. Carrega os eventos selecionados (todos do mesmo canal e usina; validar).
    2. Monta o 'pacote estruturado' (ver §5.2).
    3. Renderiza o template Jinja2 do canal escolhido (Protocolo ONS ou Termo).
    4. Chama o agente LLM para refinar a redação (introdução, fundamentação,
       conclusão) — NUNCA recalcular números.
    5. Persiste em 'pleitos' com status RASCUNHO.
    6. Retorna o markdown.
    """
```

A separação template Jinja2 + refinamento LLM é deliberada: **o template garante que todos os campos obrigatórios estão lá e corretos; a LLM só polir a redação.** Se a LLM falhar, o template sozinho já produz um documento válido. Auditabilidade e resiliência.

---

## 5. O agente LLM (`agents/redator_pleito.py`)

### 5.1 Modelo e provider

Usar **Anthropic API** com o SDK oficial `anthropic`. Escolha de modelo (confirmar nomes vigentes na doc oficial):
- **Sonnet 4.x ou Opus** para o redator de pleito (qualidade textual importa; volume baixo — um pleito tem 1 chamada).
- **Haiku** se for fazer pré-classificação ambígua em volume.

API key só no backend. Wrapper único em `agents/anthropic_client.py` com retry e timeout.

### 5.2 O "pacote estruturado" (input do agente)

A LLM recebe um JSON pronto, validado, com tudo já calculado. **Ela não calcula nada.**

```json
{
  "canal": "PROTOCOLO_ONS",
  "usina": {
    "razao_social": "Geradora XYZ S.A.",
    "ceg": "EOL.CV.RN.012345-6.01",
    "sigla_ons": "EOL_NORDESTE_1",
    "fonte": "eolica",
    "submercado": "NE",
    "outorga": "Resolução Autorizativa ANEEL nº ..."
  },
  "destinatario": {
    "orgao": "Operador Nacional do Sistema Elétrico (ONS)",
    "cargo": "Gerente Executivo de Apuração, Análise e Custo da Operação",
    "canal_envio": "Protocolo ONS via SINtegre"
  },
  "fundamentacao_normativa": [
    "Submódulo 5.13 dos Procedimentos de Rede (RO-AO.BR.13 Rev.08, vigência 01/08/2025)",
    "Resolução Normativa ANEEL nº 1.030/2022, com alterações da REN 1.073/2023",
    "Ofício 61/2025-SGM/ANEEL, de 03/04/2025"
  ],
  "janela_prazo": {
    "data_referencia_hoje": "2026-06-15",
    "dias_restantes_menor": 42,
    "observacao": "Pleito apresentado dentro do prazo de 90 dias corridos da ocorrência do evento mais recente."
  },
  "franquia": {
    "ano": 2026,
    "fonte": "eolica",
    "horas_definidas": 80.0,
    "fonte_normativa": "Comunicado ONS de jan/2026 — confirmar valor vigente"
  },
  "eventos": [
    {
      "evento_id": "EOL_NORDESTE_1__2026-04-12T13:00__REL",
      "data_inicio": "2026-04-12T13:00:00-03:00",
      "data_fim":    "2026-04-12T15:30:00-03:00",
      "duracao_horas": 2.5,
      "razao_classificada_ons": "REL",
      "origem": "SIS",
      "geracao_verificada_mwh": 12.3,
      "geracao_referencia_ons_mwh": 87.1,
      "energia_restringida_mwh": 74.8,
      "pld_reais_mwh": 312.45,
      "submercado": "NE",
      "franquia_status": "acima_franquia",
      "energia_ressarcivel_mwh": 74.8,
      "valor_pleitavel_reais": 23371.26,
      "reconciliacao": {
        "houve_comparacao": true,
        "vento_ons_ms": 8.1,
        "vento_proprio_ms": 9.6,
        "delta_vento_relativo": 0.185,
        "geracao_referencia_recalculada_mwh": 102.4,
        "delta_geracao_referencia_mwh": 15.3,
        "argumento_tecnico": "A velocidade de vento medida em torre AMA do agente foi 18,5% superior à utilizada pelo ONS no SAGER no patamar, indicando subestimação da geração de referência em 15,3 MWh.",
        "fonte_dados_proprios": "Torre AMA-1, dados SMF"
      },
      "anexos_recomendados": ["Boletim operativo ONS do dia", "Registro de despacho",
        "Dados anemométricos torre AMA-1", "Comprovação disponibilidade SCADA"]
    }
  ],
  "totais": {
    "n_eventos": 1,
    "energia_total_restringida_mwh": 74.8,
    "energia_ressarcivel_total_mwh": 74.8,
    "valor_total_pleitavel_reais": 23371.26,
    "destinatario_do_ressarcimento": "Agente gerador (parcela não contratada — assumido; confirmar com situação contratual)"
  }
}
```

### 5.3 System prompt (cole assim)

```
Você é um redator técnico-regulatório especializado em pleitos de ressarcimento de
constrained-off de usinas eólicas e fotovoltaicas no setor elétrico brasileiro. Seu
papel é redigir um documento formal a partir de um pacote estruturado de dados já
classificado, calculado e validado.

REGRAS INVIOLÁVEIS:
1. NUNCA recalcule valores, horas, energia ou elegibilidade. Os números vêm prontos
   no pacote — use-os exatamente como estão. Se algum campo estiver ausente,
   escreva "[campo ausente — preencher]" e siga.
2. NUNCA invente normas, artigos, números de resolução, prazos ou cargos. Use
   somente o que estiver em `fundamentacao_normativa` e `destinatario` do pacote.
3. NUNCA submeta nada a lugar nenhum. Seu output é um RASCUNHO para revisão humana.
   Termine o documento com "— Documento gerado como rascunho. Revisão humana
   obrigatória antes de protocolo."
4. Escreva em português formal brasileiro, em primeira pessoa do plural ("Vimos por
   meio deste...", "Solicitamos..."), objetivo, sem floreio.
5. Não use markdown decorativo (sem emojis, sem ênfase exagerada). Use estrutura
   clara: cabeçalho, seções numeradas, tabela de eventos, conclusão, anexos.
6. Para cada evento listado, NUNCA omita o `evento_id` — ele rastreia o registro
   no SAGER/sistemas do ONS.
7. Se houver `reconciliacao.houve_comparacao = true` para algum evento, o
   `argumento_tecnico` é o NÚCLEO da contestação — destaque-o na fundamentação.
8. Se o pacote indicar `destinatario_do_ressarcimento` diferente do agente
   gerador (ex.: distribuidora, CONER), declare isso explicitamente no documento.
9. Não emita opinião jurídica nem juízo de mérito sobre disputas em curso (STJ,
   Congresso, vetos). Atenha-se aos fatos técnicos e à norma citada no pacote.

ESTRUTURA OBRIGATÓRIA DO DOCUMENTO (canal Protocolo ONS):
  CABEÇALHO (data, identificação do agente, CEG, usina, destinatário formal)
  1. OBJETO  — frase curta declarando o pedido de revisão de apuração de
                constrained-off.
  2. EVENTOS — tabela com colunas: evento_id, data/hora (Brasília UTC-3), duração,
                razão classificada pelo ONS, energia restringida (MWh), energia
                ressarcível (MWh), valor pleitável (R$).
  3. FUNDAMENTAÇÃO NORMATIVA — citar as normas do pacote, brevemente.
  4. CONTESTAÇÃO TÉCNICA — para cada evento com reconciliação, expor o
     argumento_tecnico e o delta da geração de referência.
  5. DEMONSTRATIVO DE CÁLCULO — totais do pacote (energia ressarcível total e
     valor pleitável total), com a metodologia: "energia ressarcível × PLD
     horário do submercado, descontada a franquia anual de X horas vigente para
     a fonte conforme item `franquia` do pacote".
  6. DESTINATÁRIO DO RESSARCIMENTO — declarar conforme o pacote.
  7. PEDIDO — solicitar a revisão da apuração e o consequente ressarcimento,
     a ser operacionalizado pela CCEE via Encargo de Serviço do Sistema (ESS).
  8. ANEXOS — listar os anexos_recomendados consolidados (deduplicar).
  ENCERRAMENTO + assinatura placeholder.

ESTRUTURA OBRIGATÓRIA DO DOCUMENTO (canal Termo de Compromisso da Lei 15.269/2025):
  CABEÇALHO (idem)
  1. OBJETO — declarar adesão ao regime do Termo de Compromisso, com renúncia/
     desistência de ações judiciais e renúncia a honorários de sucumbência,
     conforme Lei 15.269/2025.
  2. PERÍODO ABRANGIDO — 01/09/2023 a 25/11/2025 (ou subconjunto).
  3. EVENTOS — tabela conforme acima.
  4. FUNDAMENTAÇÃO NORMATIVA — Lei 15.269/2025 (art. 1º-B) e regulamentação MME/CCEE
     vigente (Portaria MME 890/2025 e atos correlatos, conforme pacote).
  5. CONTESTAÇÃO TÉCNICA (se houver reconciliação).
  6. DEMONSTRATIVO DE CÁLCULO — destacar correção pelo IPCA desde a data do
     evento (conforme regulamentação).
  7. DECLARAÇÃO DE DESISTÊNCIA / RENÚNCIA — texto formal.
  8. PEDIDO — adesão e processamento.
  9. ANEXOS.
  ENCERRAMENTO + assinatura placeholder.

TOM E QUALIDADE: o documento será lido por engenheiros e advogados do ONS/CCEE.
Precisão técnica e clareza valem mais que volume. Não invente jurisprudência.
Não cite a Volt Robotics, Way2, ePowerBay ou qualquer concorrente.
```

### 5.4 Parâmetros da chamada
- `temperature`: 0.2 (queremos consistência, não criatividade).
- `max_tokens`: 4000 (suficiente para dossiês de até ~20 eventos).
- Passar o `pacote_estruturado` como JSON dentro do `user` message, precedido de "Eis o pacote de dados: ```json\n{...}\n```\nGere o documento conforme as regras."
- Salvar prompt + resposta + hash do pacote em log de auditoria.

### 5.5 O que a LLM NÃO faz (importante reforçar)
- Não classifica eventos (já vem classificado).
- Não aplica franquia (já aplicada).
- Não calcula valor (já calculado).
- Não decide elegibilidade.
- Não submete o documento.
- Não busca normas na internet.

Isso elimina ~95% das fontes de erro de LLM nesse domínio e mantém o sistema auditável.

---

## 6. Frontend — telas e fluxo

### 6.1 Mudança principal vs. aplicação atual

A aba "Dossiê" atual gera um documento genérico do período. Substitui-se por **duas abas distintas**, com responsabilidades separadas:

- **Aba "Eventos de Pleito"** — lista evento a evento, com elegibilidade calculada, valor potencial e ação por linha.
- **Aba "Dossiê"** — seleção dos eventos pleiteáveis, ranking por potencial financeiro, geração do documento, revisão e exportação.

### 6.2 Aba "Eventos de Pleito"

**Cabeçalho:** usina, seletor de período, filtros (motivo REL/CNF/ENE, status de elegibilidade, status de franquia).

**Tabela principal (uma linha por evento):**

| Coluna | Conteúdo |
|---|---|
| Data/hora | DD/MM/AAAA HH:mm (Brasília) |
| Duração | horas |
| Motivo | badge colorido REL (verde-amarelo) / CNF (azul) / ENE (cinza, sinaliza não elegível) |
| Origem | SIS / LOC |
| Energia restringida | MWh |
| Franquia | dentro / acima / parcial (com tooltip explicando) |
| Energia ressarcível | MWh (zero se dentro da franquia ou inelegível) |
| PLD | R$/MWh |
| **Valor pleitável** | R$ — destaque visual |
| Reconciliação | ícone: ✓ se houve comparação com dados próprios; — caso contrário |
| Prazo | dias restantes para Protocolo ONS (90d); badge "Termo" se elegível ao regime retroativo |
| Ação | botão "Gerar pleito deste evento" (canal sugerido) |

**Ações da tabela:**
- Por linha: "Gerar pleito deste evento" → cria pleito de UM evento (caso de uso simples).
- Em lote: "Selecionar todos elegíveis" + "Adicionar à seleção do dossiê" (manda para a aba Dossiê).

**Filtros úteis para a demo:** "só elegíveis", "só com valor pleitável > R$ X", "prazo expirando em < 7 dias" (cria urgência).

**Endpoint:** `GET /api/usinas/{usina_id}/eventos-pleito?inicio=&fim=&filtros=...` → devolve a lista enriquecida descrita em §4 (Service).

### 6.3 Aba "Dossiê"

**Header:** "Pleitos selecionados (N eventos · R$ X total potencial)".

**Coluna esquerda — seleção e ranking:**
- Lista os eventos adicionados, **ordenada por valor pleitável decrescente**.
- Checkbox por linha (todos marcados por default).
- Agrupamento por canal sugerido (Protocolo ONS / Termo de Compromisso). **Um dossiê = um canal**, então se há eventos de canais diferentes, a UI cria dois pleitos em paralelo, não força um único.
- Resumo: total de energia ressarcível, valor pleitável total, prazo mais curto.

**Coluna direita — geração e preview:**
- Botão grande "Gerar dossiê dos eventos selecionados".
- Loading com mensagem honesta ("Compilando o pacote, classificando eventos e redigindo...").
- Preview do markdown renderizado.
- Ações: **Copiar** (markdown), **Exportar** (.md, e idealmente .pdf), **Regerar** (refaz a chamada LLM com o mesmo pacote), **Editar** (entra em modo de edição textual — humano no loop).
- **Aviso fixo**: "Documento gerado como rascunho. Revisão humana e jurídica obrigatória antes do protocolo."

**Endpoints:**
- `POST /api/usinas/{usina_id}/pleitos` body `{eventos_ids, canal}` → cria e retorna `{pleito_id, markdown}`.
- `GET /api/pleitos/{pleito_id}` → recupera.
- `PATCH /api/pleitos/{pleito_id}` → salva edição.
- `GET /api/pleitos/{pleito_id}/export?formato=md|pdf` → download.

### 6.4 Comunicação visual recomendada
- **Cor com significado** (mantém a régua do front): vermelho = perda; verde = ressarcível; âmbar = atenção (prazo curto / dentro da franquia); cinza = inelegível.
- **Destaque do "valor pleitável total"** no header da aba Dossiê em fonte grande — esse é o número que vende o produto.
- **Tooltip educativo** em cada termo regulatório (REL, CNF, ENE, franquia, ESS, PLD) — público inclui jurados e potenciais clientes que não dominam o jargão.

---

## 7. Endpoints completos do módulo de pleito

| Método | Rota | Função |
|---|---|---|
| GET | `/api/usinas/{usina_id}/eventos-pleito` | Lista eventos enriquecidos para a aba Eventos de Pleito |
| POST | `/api/usinas/{usina_id}/pleitos` | Gera novo pleito a partir de `{eventos_ids, canal}` |
| GET | `/api/pleitos/{pleito_id}` | Recupera pleito (markdown + metadados) |
| PATCH | `/api/pleitos/{pleito_id}` | Atualiza (edição humana, mudança de status) |
| GET | `/api/pleitos/{pleito_id}/export` | Download `.md` (e `.pdf` se implementado) |
| GET | `/api/usinas/{usina_id}/franquia-status?ano=` | Horas acumuladas no ano e franquia vigente (informativo no header) |

Todos os endpoints devolvem JSON Pydantic; documentação automática em `/docs`.

---

## 8. Ordem de implementação sugerida

1. **Migrations das tabelas novas** (`gold.franquia_anual`, `gold.contratos_usina`, `gold.dados_proprios_climatologia` opcionais; `pleitos` operacional). Popular `gold.franquia_anual` com valores conhecidos e a fonte normativa.
2. **Engines** (`elegibilidade`, `franquia`, `valoracao`, `reconciliacao`, `prazos`) — com testes unitários cobrindo: REL elegível, CNF com ressalvas, ENE recusado, franquia atravessada no meio do evento, evento sem dados próprios, evento com divergência climatológica significativa.
3. **Repo + Service** — `listar_eventos_para_pleito` retornando o struct enriquecido.
4. **Endpoint** `GET /eventos-pleito` + frontend da **aba Eventos de Pleito**. Já dá demo: o usuário vê a lista classificada, ordenada por valor pleitável.
5. **Templates Jinja2** dos dois canais (Protocolo ONS, Termo de Compromisso).
6. **Agente LLM** com o system prompt — primeiro rodando sem LLM, devolvendo o template puro. Depois plugar a LLM para refinamento.
7. **Endpoint** `POST /pleitos` + frontend da **aba Dossiê** (seleção, ranking, gerar, preview, exportar).
8. **Polimento**: tooltips educativos, export PDF, edição inline, salvamento de rascunhos.

Entregar cada etapa com endpoint testável em `/docs` antes de avançar. Para a semifinal: as etapas 1–4 já entregam a melhoria visível mais importante (pleito por evento, ranking por valor). Etapas 5–7 fecham o "momento mágico" da demo.

---

## 9. O que muda na demo (e por que isso vence o pitch)

Hoje a demo mostra "gerar dossiê" e aparece um documento genérico. A nova demo mostra:

1. A aba **Eventos de Pleito** com cada corte da usina-caso classificado, valorado, com prazo. O jurado vê *uma lista acionável de oportunidades de dinheiro a recuperar*.
2. O usuário **filtra "só elegíveis"** e ordena por valor — narrativa: "vamos atacar os de maior potencial".
3. **Seleciona os top 5** e clica "Adicionar ao dossiê".
4. Na aba **Dossiê**, vê o resumo (N eventos, R$ X total), clica "Gerar".
5. A LLM produz o documento formal, endereçado ao destinatário correto, com fundamentação normativa real (RO-AO.BR.13, REN 1.030, Lei 15.269 conforme o canal), tabela de eventos, contestação técnica baseada na divergência climatológica, demonstrativo de cálculo, pedido e anexos.
6. O usuário **exporta**.

A diferença vs. concorrentes (Way2, ePowerBay, Volt) fica explícita: eles mostram o tamanho do problema; **o CurtailIQ faz o trabalho**. É exatamente a narrativa que responde ao feedback da banca ("fortalecer a conexão problema-solução-impacto") e ao seu requisito de "agente que transforma dados em decisão e ação".

---

## 10. Honestidade técnica (para não furar)

- A franquia tem divergência de fontes (norma vs. divulgação Way2); o agente lê de `gold.franquia_anual`, e o documento declara o valor usado e a fonte. Confirmar com ONS antes do go-live.
- O Termo de Compromisso da Lei 15.269/2025 ainda está em consulta pública (junho/2026); os prazos exatos do canal "TERMO" devem ser parametrizáveis, e o documento deve referenciar a regulamentação vigente, não cravar prazo que pode mudar.
- A CCEE suspendeu lançamentos do regime retroativo até a regulação definitiva — o agente avisa, mas continua gerando o rascunho (preparação é valor).
- Documento gerado é **sempre rascunho**. O agente nunca submete. Humano no loop na revisão e no protocolo.
- O canal "Consistência SAGER em 3 dias úteis" não é atendido por este agente (é território da Way2 e similares). O agente apenas avisa quando o evento ainda está nessa janela.
- Os números do pacote são **a fonte da verdade**; a LLM os reproduz. Se o pipeline de dados estiver errado, o pleito estará errado — testar engines com cuidado é mais importante que afinar o prompt.
