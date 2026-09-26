# Plano de Correção Estrutural: Eventos de Curtailment

> Objetivo: corrigir a semântica de eventos no CurtailIQ, separando linhas brutas de 30 minutos, intervalos ativos de restrição e eventos contínuos agregados, para melhorar métricas, financeiro, elegibilidade regulatória e dossiês.

## 1. Problema atual

Hoje o backend já filtra linhas COFF sem restrição ativa, mas ainda trata cada linha filtrada como se fosse um evento.

Fluxo atual simplificado:

```text
restricao_coff_* raw
  -> get_constrained_off()
  -> lista de linhas com cod_razaorestricao preenchido e energia_restringida_mwh > 0
  -> cada linha vira ConstrainedOffEvent
  -> len(eventos) vira total_eventos
```

Isso é melhor do que contar a tabela inteira, mas ainda não é semanticamente correto.

A granularidade das tabelas COFF é de 30 minutos. Portanto, uma restrição que dura 2 horas pode aparecer como 4 linhas. Hoje essas 4 linhas tendem a ser contadas como 4 eventos; o correto é 1 evento contínuo.

## 2. Evidência quantitativa da inflação

Agrupando intervalos consecutivos de 30 minutos por:

```text
tecnologia + id_ons + cod_razaorestricao + cod_origemrestricao
```

Resultado global observado:

```text
Eólica:
intervalos ativos: 6.718
eventos contínuos estimados: 488
linhas por evento: 13,77
inflação de contagem: ~13,77x

Fotovoltaica:
intervalos ativos: 383.235
eventos contínuos estimados: 42.054
linhas por evento: 9,11
inflação de contagem: ~9,11x
```

Conclusão:

```text
A métrica de total de eventos está inflada.
A métrica financeira não necessariamente está inflada pela contagem, mas depende da unidade da energia restringida.
```

## 3. Modelo conceitual correto

Precisamos separar quatro níveis:

```text
1. Raw row
   Linha original da tabela public.restricao_coff_*.

2. Restriction interval
   Linha temporal ativa, normalmente 30 min, com limitação positiva e metadado de restrição.

3. Curtailment event
   Sequência contínua de intervalos ativos para a mesma usina, razão e origem.

4. Financial/regulatory assessment
   Cálculo financeiro e elegibilidade sobre eventos agregados, mantendo rastreabilidade até os intervalos.
```

## 4. Definições de domínio propostas

### 4.1. `CurtailmentInterval`

Representa uma linha ativa de restrição.

Campos sugeridos:

```python
@dataclass(frozen=True)
class CurtailmentInterval:
    usina_id: str
    tecnologia: str | None
    timestamp_inicio: datetime
    timestamp_fim: datetime
    duracao_horas: float
    energia_restringida_mwh: float
    potencia_limitada_mw: float | None
    geracao_verificada_mwh: float | None
    geracao_referencia_mwh: float | None
    cod_razaorestricao: str | None
    cod_origemrestricao: str | None
    razao_normalizada: str
    origem_normalizada: str | None
    submercado: str
    source_table: str
    data_quality_status: str
```

Estados de qualidade sugeridos:

```text
SEM_RESTRICAO
RESTRICAO_CLASSIFICADA
RESTRICAO_INCOMPLETA
METADADO_SEM_ENERGIA
UNIDADE_ENERGIA_PENDENTE
```

### 4.2. `CurtailmentEvent`

Representa um evento contínuo agregado.

Campos sugeridos:

```python
@dataclass(frozen=True)
class CurtailmentEvent:
    event_id: str
    usina_id: str
    tecnologia: str | None
    inicio: datetime
    fim: datetime
    duracao_horas: float
    n_intervalos: int
    cod_razaorestricao: str | None
    cod_origemrestricao: str | None
    razao_normalizada: str
    origem_normalizada: str | None
    energia_restringida_mwh: float
    perda_total_reais: float
    perda_potencial_ressarcivel_reais: float
    perda_ressarcivel_pos_franquia_reais: float
    elegibilidade_status: str
    evidence_score: int
    source_interval_ids: list[str]
```

## 5. Regra de identificação de intervalos ativos

Para COFF, um intervalo ativo deve ser derivado preferencialmente por:

```text
val_geracaolimitada > 0
AND cod_razaorestricao preenchido
```

Mais robusto:

```text
is_restriction_interval =
    val_geracaolimitada > 0
    OR cod_razaorestricao preenchido
    OR cod_origemrestricao preenchido
```

Mas para cálculo financeiro auditável, priorizar:

```text
val_geracaolimitada > 0
```

Classificação recomendada:

```text
SEM_RESTRICAO:
  val_geracaolimitada <= 0 e razão/origem vazias

RESTRICAO_CLASSIFICADA:
  val_geracaolimitada > 0 e razão/origem preenchidas

RESTRICAO_INCOMPLETA:
  val_geracaolimitada > 0 e razão ou origem ausente

METADADO_SEM_ENERGIA:
  razão/origem preenchidas, mas val_geracaolimitada <= 0
```

## 6. Regra de eventização

Ordenar intervalos por usina, razão, origem e timestamp.

Criar um novo evento quando qualquer condição for verdadeira:

```text
primeiro intervalo da partição
OU timestamp_atual > timestamp_anterior + intervalo_esperado + tolerancia
OU razão mudou
OU origem mudou
OU usina mudou
OU tecnologia/fonte mudou
```

Para COFF atual:

```text
intervalo_esperado = 30 minutos
tolerancia inicial = 0 minutos ou até 30 minutos se houver buracos conhecidos
```

Partição recomendada:

```text
usina_id + tecnologia + cod_razaorestricao + cod_origemrestricao
```

Agregações por evento:

```text
inicio = min(timestamp_inicio)
fim = max(timestamp_fim)
duracao_horas = soma(duracao_horas)
n_intervalos = count(*)
energia_restringida_mwh = soma(energia_restringida_mwh)
perda_total_reais = soma(perda_intervalo_reais)
razão/origem = valores da partição
```

## 7. Cálculo financeiro correto

### 7.1. Fórmula base

```text
perda_intervalo_reais = energia_restringida_mwh * pld_reais_mwh
perda_evento_reais = soma(perda_intervalo_reais)
```

### 7.2. Ponto crítico: unidade de `val_geracaolimitada`

Antes de consolidar o cálculo, validar se `val_geracaolimitada` representa:

```text
A) MWh já integrado no intervalo; ou
B) MW/MWmed médio do intervalo.
```

Se for MWh:

```text
energia_restringida_mwh = val_geracaolimitada
```

Se for MW/MWmed em intervalo de 30 minutos:

```text
energia_restringida_mwh = val_geracaolimitada * 0,5
```

Regra de implementação recomendada:

```text
Criar um campo/constante explícita de interpretação da unidade, sem esconder a conversão.
```

Exemplo:

```python
COFF_INTERVAL_HOURS = 0.5
COFF_VAL_GERACAOLIMITADA_UNIT = "mwmed"  # ou "mwh"
```

Enquanto a unidade não estiver validada:

- expor metadata `energia_unidade_validada=false`;
- manter nota técnica nos endpoints;
- evitar afirmar valor final como definitivo.

## 8. Elegibilidade regulatória correta

A política atual não deve usar apenas razão. Deve usar razão + origem.

Regra recomendada para MVP:

```text
CNF + SIS -> elegível
REL + SIS -> elegível
ENE + SIS -> não elegível automático
CNF + LOC -> revisão humana / não autoelegível
REL + LOC -> revisão humana / não autoelegível
ENE + LOC -> não elegível automático
origem ausente -> revisão humana
razão ausente -> revisão humana
```

Estados sugeridos:

```text
ELEGIVEL
NAO_ELEGIVEL
REVISAO_HUMANA
SEM_EVIDENCIA_REGULATORIA
```

Importante: IA não deve decidir elegibilidade base. IA pode redigir dossiê/pleito a partir do pacote determinístico já calculado.

## 9. Mudanças de backend recomendadas

### 9.1. Preservar origem no contrato de domínio

Arquivo:

```text
backend/app/domain/contracts.py
```

Hoje `ConstrainedOffEvent` não carrega origem. Adicionar:

```python
cod_origemrestricao: str | None
origem_restricao: str | None
```

E atualizar `parse_constrained_off`.

### 9.2. Criar módulo de normalização/eventização

Novo arquivo sugerido:

```text
backend/app/domain/curtailment_events.py
```

Responsabilidades:

- normalizar razão (`CNF`, `REL`, `ENE`);
- normalizar origem (`SIS`, `LOC`);
- converter linhas em intervalos;
- agrupar intervalos em eventos;
- calcular duração e energia por evento;
- manter rastreabilidade.

Funções sugeridas:

```python
def normalize_reason(value: str | None) -> str | None: ...
def normalize_origin(value: str | None) -> str | None: ...
def interval_duration_hours(current_ts, next_ts=None) -> float: ...
def build_curtailment_intervals(rows: list[dict]) -> list[CurtailmentInterval]: ...
def group_intervals_into_events(intervals: list[CurtailmentInterval]) -> list[CurtailmentEvent]: ...
```

### 9.3. Separar endpoints de intervalos e eventos

Endpoints atuais podem continuar existindo por compatibilidade, mas devem deixar claro o nível semântico.

Sugestões:

```text
GET /api/usinas/{id}/curtailment/intervalos
GET /api/usinas/{id}/curtailment/eventos
GET /api/usinas/{id}/perda
GET /api/usinas/{id}/ressarcimento
```

`/perda` deve poder retornar:

```json
{
  "total_intervalos_restricao": 6718,
  "total_eventos_curtailment": 488,
  "total_energia_restringida_mwh": 123.45,
  "total_perda_reais": 67890.12,
  "qualidade_dados": {
    "pld_faltante_intervalos": 0,
    "eventos_sem_origem": 0,
    "energia_unidade_validada": false
  }
}
```

### 9.4. Unificar financeiro detalhado e resumido

Arquivos:

```text
backend/app/services/financeiro_service.py
backend/app/repositories/postgres_repo.py
backend/app/services/regulatorio_service.py
```

Problema atual:

- `calcular_perda()` usa COFF detalhado e prioriza `val_geracaolimitada`.
- `calcular_perda_resumida()` pode usar `get_perda_resumida()`, que calcula por `referencia - geracao`.
- Dossiê ainda pode usar o resumo e divergir do Financeiro/Resumo.

Mudança recomendada:

```text
Uma única fonte de verdade para energia/perda histórica.
```

Implementar:

```text
FinanceiroService.calcular_perda_eventizada()
```

E fazer:

```text
Resumo
Financeiro
Regulatório
Dossiê
Pleito
BESS histórico
```

usarem o mesmo pacote estruturado.

### 9.5. Corrigir franquia

Hoje a franquia pode estar sendo aplicada sobre cada linha/intervalo, não sobre evento ou duração correta.

Recomendação:

```text
franquia deve consumir horas elegíveis, não quantidade de linhas.
```

Se os intervalos forem de 30 minutos:

```text
cada intervalo elegível consome 0,5 hora
```

Se o cálculo for sobre evento:

```text
horas_elegiveis_evento = duração do evento em horas
```

## 10. Ordem de implementação recomendada

### Fase 1: Diagnóstico e contrato

1. Documentar unidade pendente de `val_geracaolimitada`.
2. Adicionar origem (`cod_origemrestricao`) ao contrato de domínio.
3. Criar testes unitários para normalização de razão/origem.
4. Criar testes unitários para agrupamento de intervalos consecutivos.

### Fase 2: Eventização

1. Criar `CurtailmentInterval`.
2. Criar `CurtailmentEvent`.
3. Implementar `group_intervals_into_events`.
4. Validar com casos:
   - 4 intervalos consecutivos viram 1 evento;
   - buraco temporal cria novo evento;
   - mudança de razão cria novo evento;
   - mudança de origem cria novo evento;
   - usina diferente cria novo evento.

### Fase 3: Financeiro unificado

1. Calcular perda por intervalo.
2. Agregar perda por evento.
3. Retornar contagem separada de intervalos e eventos.
4. Substituir `calcular_perda_resumida` por chamada ao cálculo unificado ou garantir paridade.
5. Atualizar dossiê para usar o pacote unificado.

### Fase 4: Elegibilidade razão + origem

1. Atualizar `RegulatorioPolicy` para aceitar razão + origem.
2. Marcar `LOC` como revisão/não autoelegível.
3. Aplicar `SIS` como requisito para autoelegibilidade CNF/REL.
4. Atualizar auditoria de regra:

```text
razao=CNF; origem=SIS; elegivel=true; regra=lei_15269_2025
```

### Fase 5: Frontend e UX

1. Trocar labels de “eventos” para “intervalos” quando aplicável.
2. Mostrar `Eventos de corte` usando eventos agregados.
3. Mostrar `Intervalos com restrição` como métrica técnica/diagnóstico.
4. Atualizar ticket médio para usar eventos agregados.
5. Mostrar qualidade de evidência e alertas de unidade/PLD/origem.

## 11. Testes obrigatórios

### 11.1. Testes de eventização

Cenários mínimos:

```text
1. intervalos 10:00, 10:30, 11:00 com mesma razão/origem -> 1 evento
2. intervalos 10:00 e 11:00 com buraco em 10:30 -> 2 eventos
3. intervalos 10:00 REL/SIS e 10:30 CNF/SIS -> 2 eventos
4. intervalos 10:00 REL/SIS e 10:30 REL/LOC -> 2 eventos
5. intervalos com usinas diferentes -> eventos separados
```

### 11.2. Testes financeiros

Cenários mínimos:

```text
1. perda por intervalo = energia * PLD
2. perda por evento = soma das perdas dos intervalos
3. PLD faltante gera perda 0 e contador de qualidade
4. unidade MWmed aplica fator 0,5 quando configurada
5. unidade MWh não aplica fator 0,5
```

### 11.3. Testes regulatórios

Cenários mínimos:

```text
CNF + SIS -> elegível
REL + SIS -> elegível
ENE + SIS -> não elegível
CNF + LOC -> revisão/não autoelegível
REL + LOC -> revisão/não autoelegível
razão ausente -> revisão
origem ausente -> revisão
```

## 12. Critérios de aceite

A correção estrutural estará pronta quando:

```text
- endpoints distinguirem intervalos de eventos;
- total_eventos_corte usar eventos agregados;
- total_intervalos_restricao continuar disponível para diagnóstico;
- perda financeira usar uma única fonte de verdade;
- dossiê, resumo e financeiro mostrarem números coerentes;
- origem SIS/LOC participar da elegibilidade;
- franquia consumir horas reais/duração, não quantidade de linhas;
- qualidade de dados expuser PLD faltante, origem ausente e unidade de energia;
- testes cobrirem eventização, financeiro e elegibilidade.
```

## 13. Riscos e decisões pendentes

### 13.1. Unidade de `val_geracaolimitada`

Decisão pendente mais importante.

Impacto:

```text
Se for MWh: cálculo atual de energia pode estar correto.
Se for MWmed/MW: perda histórica pode estar ~2x inflada.
```

Ação recomendada:

- validar com dicionário de dados ONS/CCEE;
- comparar contra somas oficiais, se houver;
- checar consistência com `val_geracaoreferencia`, `val_geracao` e `val_disponibilidade`.

### 13.2. Cobertura eólica recente

A tabela `restricao_coff_eolica_usi` termina em 2023, enquanto `restricao_coff_eolica_detail` vai até 2026.

Ação recomendada:

- investigar se existe outra tabela de COFF eólica agregada recente;
- verificar se a detail contém chaves para reconstruir restrição, mas sem razão/origem;
- evitar demo/produto eólico recente com promessa regulatória se razão/origem não estiver disponível.

### 13.3. PLD temporal

PLD horário precisa ser reconstruído corretamente a partir de campos CCEE.

Ação recomendada:

- manter normalização `NE`/`NORDESTE`;
- garantir timezone/timestamp sem deslocamento indevido;
- medir `pld_faltante_intervalos` por janela/usina.

## 14. Resultado esperado após a correção

Antes:

```text
Linha COFF ativa = evento
Total eventos inflado
Ticket médio artificialmente baixo
Elegibilidade ignora origem
Dossiê pode divergir do Financeiro
```

Depois:

```text
Linha COFF ativa = intervalo
Sequência contínua = evento
Eventos, intervalos, energia e perda separados
Elegibilidade = razão + origem
Financeiro/Resumo/Dossiê usam o mesmo pacote
Rastreabilidade preservada até a linha original
```

Essa mudança é estrutural para transformar o CurtailIQ de um MVP que calcula sobre linhas operacionais para um produto que entende eventos reais de curtailment.
