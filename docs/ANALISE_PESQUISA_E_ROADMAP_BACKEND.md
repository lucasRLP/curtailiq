# CurtailIQ — análise da pesquisa e novo roadmap backend

## 1. Decisão executiva

**Recomendação: continuar o produto como apoio à decisão operacional e evidência auditável, não como controlador do ONS nem como promessa automática de ressarcimento.**

Proposta: ajudar a geradora a decidir quando executar manutenção necessária, avaliar armazenamento e acompanhar suas perdas e evidências, sob restrições de segurança, disponibilidade de dados e incerteza. Consultorias podem operar carteiras; o responsável pela operação continua sendo o agente autorizado da usina.

O backend precisa compartilhar a mesma semântica física e econômica entre quatro módulos: operação, previsão, manutenção e bateria. Acrescentar modelos e endpoints sem resolver os contratos atuais ampliaria divergências que já existem.

Ordem revisada:
1. Contrato com a API de dados + reconciliação das grandezas e identidades.
2. Histórico real auditável, qualidade, eventos e evidências.
3. Motor comum de cenários e economia; manutenção e BESS fisicamente consistentes, ainda sem promessa preditiva.
4. Previsão point-in-time e validação por horizonte; depois integração com planejamento.
5. Planejamento conjunto em modo sombra, aprovação humana e medição do benefício incremental.
6. Simulação de investimento BESS, exposição contratual mais completa e escala comercial.

Enquanto a API externa não existe, contratos tipados, testes de contrato com fixtures declaradas, motores determinísticos e interfaces de previsão podem avançar. Não criar outra ingestão ONS/CCEE no backend. A API será o acesso à camada canônica do time de dados, não uma transferência do ETL para nós.

**Escopo desta entrega:** análise e planejamento. Nenhum código de runtime, modelo, banco ou frontend foi alterado nesta revisão. O plano original é preservado; este documento reorganiza os próximos passos, sem declarar concluído o que ainda é proposta.

## 2. Evidência e limites da revisão

Material principal: `docs/PESQUISA-PRODUTO-CURTAILMENT.pdf`, 44 páginas, lido integralmente por extração textual. SHA-256: `b2c57d9ee60eeda833ff90e25ce9a029a7ff33b345304bb6082945b1bb3235c9`.

Extração local: `docs/PESQUISA-PRODUTO-CURTAILMENT.extraido.md`. A página 25 foi também renderizada e conferida visualmente em `docs/PESQUISA-PRODUTO-CURTAILMENT.p25.png`: algumas equações estão ausentes no próprio PDF, não apenas no extrator. Não reconstruí essas equações como se estivessem disponíveis.

O PDF descreve outro contexto de implementação, com nomes CurtailLess, wikitica e MCP. As afirmações sobre aquela demo não comprovam o estado deste repositório. Foram confrontadas com os arquivos atuais e com `docs/CONTINUIDADE_OPERACAO_SCADA_BESS.md` e o plano original.

Classificação usada:
- **Código verificado:** leitura estática dos arquivos atuais; não equivale a teste com banco real.
- **Pesquisa reportada:** números/normas relatados pelo autor; não foram reproduzidos nos datasets nem revalidados em portais oficiais nesta revisão.
- **Análise metodológica:** implicações e contraexemplos explicitados aqui.
- **Decisão proposta:** orientação para desenvolvimento, ainda não implementada.

Não houve acesso ao banco em reconstrução ou à futura API. Não houve treino, avaliação do holdout, execução de notebook oficial ou nova suíte de backend nesta rodada documental. Os resultados de testes da continuidade pertencem à execução anterior, não a esta análise. Os 30 relatórios, JSONs de ML e corpus normativo citados no PDF precisam ser entregues pelo autor para reprodução; o PDF sozinho não substitui esses artefatos.

## 3. Modelo de negócio recomendado

### 3.1 Cliente, usuário e decisão

- **Primeiro comprador a validar:** geradora/gestora com carteira eólica no Nordeste, manutenção flexível e interesse em reduzir perda incremental. O&M, operação e gestão de ativos são usuários; a autoridade sobre parada e intervenção permanece no cliente.
- **Canal complementar:** consultoria com carteira, que precisa comparar exposição, organizar evidências e explicar decisões. Não assumir que ela pode autorizar a operação da usina.
- **ONS:** referência técnica e regulatória, não comprador presumido nem sistema cujo despacho será substituído.
- **BESS:** módulo de estudo e planejamento; não exigir que o cliente já possua bateria para que o produto central tenha valor.

### 3.2 Três entregas, três relógios

1. **Decisão:** horizontes de 6, 24 e 48 horas, conforme validação, mais diagnóstico recente quando houver fonte tempestiva. Manutenção exige antecedência, equipe e aprovação; nem toda tarefa pode ser movida em 24 horas.
2. **Apuração/evidência:** histórico, revisões, qualidade, classificação, memória de cálculo e fila de prazos. Não fixar uma única janela de 90 dias para todos os processos.
3. **Estrutural:** exposição histórica, sazonalidade, carteira e viabilidade BESS sobre séries temporais representativas. Dados mensais servem para resumo, não para despacho físico.

### 3.3 O que vender e como provar

Promessa defensável: **reduzir o custo incremental das decisões sob curtailment e tornar perdas e hipóteses auditáveis**.

Não vender: “escolhemos quem o ONS corta”, “recuperamos todo o corte”, “garantimos ressarcimento”, “SCADA ONS integrado” ou “bateria sempre se paga”.

Modelo comercial a testar, não preço validado: assinatura por carteira/ativos acompanhados, com módulos de planejamento e evidências; onboarding de dados privados separado. Cobrança por economia exige baseline contratual e atribuição aceitos pelo cliente. Não assumir disposição a pagar a partir de AUC ou MWh históricos.

Piloto mínimo:
- Uma carteira NE limitada, um conjunto e suas usinas com identidade reconciliada, e ordens reais de manutenção flexíveis.
- Registrar agenda-base antes da recomendação, aprovações, execução e razões de rejeição.
- Medir ganho líquido no mesmo conjunto de tarefas e restrições, horas de trabalho poupadas e qualidade/cobertura da evidência.
- Diferenciar economia simulada, recomendação aceita e economia observada atribuível. Atribuição causal não vem apenas de comparar antes/depois.
- Se o ganho não superar custo de integração e uso, reduzir a tese a diagnóstico/evidências ou reformular o público-alvo, não inflar o resultado.

## 4. O que a pesquisa muda — matriz de decisões

| Tema e páginas | Leitura crítica | Consequência para CurtailIQ |
|---|---|---|
| SCADA, pp. 8–9 | Telemetria interna, comunicação ao ONS e mensagem de restrição são superfícies distintas. OPC UA local não prova homologação ONS. | Adaptadores read-only; ordem recebida e observação física em entidades diferentes. Não implementar controle real. |
| Granularidade e donos, pp. 3–4, 9–11 | Conjunto é agrupamento elétrico; várias SPEs não significam necessariamente vários grupos concorrentes. Relações têm vigência. | IDs internos estáveis, aliases ONS/CEG e relacionamento temporal; autorização por ativo/carteira, nunca somente por conjunto. |
| Razão solar, pp. 10–11, 15–16 | O autor corrige “solar sem razão”: o dataset clássico pode ter razão, o detalhado tem outra taxonomia. | Verificar o payload real de cada fonte; não inferir razão a partir de modalidade nem manter ausência solar hardcoded. Solar fica compatível no contrato, eólica primeiro no piloto. |
| Energia apurada, pp. 15–16, 21 | A pesquisa diverge da fórmula anterior e cita campo apurado; unidade e filtro precisam ser provados. | Gate de reconciliação obrigatório antes de alterar fórmulas, alvos e cifras. Manter métodos separados e versionados. |
| PLD e contratação, pp. 11–12, 17–18 | PLD por hora não é receita contratual universal. ACR/ACL e beneficiário importam. | Integração temporal de energia, preço por submercado, regra contratual e beneficiário explícitos. |
| Franquia, pp. 12–14, 28 | O próprio texto não confirma 2026 e reconhece lacuna na versão consolidada solar. | Policy versionada por fonte/vigência; desconhecido não vira zero nem cópia silenciosa de ano anterior. |
| Margem ENE, pp. 17, 22, 32–35, 39–43 | Boa hipótese explicativa, mas não há antecedência usando realizado da própria hora. | Margem com insumos disponíveis na decisão; valores estruturais mensais não são comando operativo vivo. |
| ML a 6h, pp. 34–35, 37–44 | AUC reportada é resultado do autor, não validação do nosso pipeline; lag não garante disponibilidade. | Reproduzir dados/código e vintages; calendário/persistência/margem como baselines por horizonte. |
| Rede e PTDF, pp. 18–19, 34, 36 | Texto de restrição e exposição histórica não reconstruem o estado elétrico causal. | Parser auditável de `dsc_restricao`, cobertura e incerteza; nada de “gargalo previsto” com certeza ou culpabilização do agente. |
| BESS, pp. 19, 28–31 | A última rodada corrige generalização anterior: rotas regulatórias diferentes. | Cenários colocalizado/merchant e disponibilidade centralizada separados, com elegibilidade e receitas a validar. |
| Manutenção, pp. 27–30 | Deslocar manutenção necessária não é declarar indisponibilidade por conveniência para explorar corte. | Ordens existentes, risco, prazos, custos e disponibilidade; elegibilidade desconhecida tratada em cenários. |
| Evidência e compliance, pp. 20, 24, 28 | Relatório técnico é apoio, não decisão regulatória nem petição jurídica automática. | Revisões, autoria, hashes, origem e aprovação humana; calendário por procedimento e norma vigente. |
| China/Austrália/Chile, pp. 23, 31–32 | Comparações são referências de desenho, não parâmetros econômicos brasileiros. | Não importar tarifas, fatores de capacidade ou percentuais estrangeiros para o business case local. |

## 5. Ponderações que impedem implementação literal

### 5.1 Campo “apurada”: não trocar uma confusão por outra

A pesquisa afirma que `val_geracaonaorealizadaapurada` coincide com diferença entre grandezas de geração e fala em energia. Isso **não demonstra que a coluna está em MWh**: diferença entre potências médias pode precisar de integração por duração.

A decisão anterior do projeto usa `max(val_geracaoreferenciafinal - val_geracao, 0) * 0.5` em patamares homogêneos de 30 minutos. Esta revisão não revoga essa decisão com base apenas no PDF. O novo dado pode conter outra grandeza, outro estágio de apuração ou outro critério de publicação.

Separar no contrato:
- referência bruta e final, geração verificada e teto de geração, em MW/MWmed conforme fonte;
- valor bruto publicado de geração não realizada, com unidade original e dicionário;
- energia publicada pelo fornecedor, se realmente fornecida em MWh;
- energia derivada por um método identificado;
- energia elegível, pleiteada e efetivamente reconhecida/liquidada.

Reconciliação: amostras de eólica e solar, patamares completos/parciais, eventos sem razão, revisões, referências nulas e zeros válidos. Comparar cálculo e publicação sem usar `fillna(0)` para encobrir falta de referência. Condicionar fórmula a fonte, versão, unidade e duração. Não atribuir todo desvio geração–potencial a curtailment sem evidência de restrição. Ausência de razão não significa automaticamente ausência de evento.

### 5.2 Previsão: os vazamentos que continuam possíveis

- `shift(1)` só desloca a linha: se a apuração da hora anterior foi publicada em D+1, ela não existia quando a previsão foi emitida.
- Histórico meteorológico “de previsão” precisa preservar execução/emissão e disponibilização reais. Uma série histórica contínua costurada não garante vintage adequado.
- Geração realizada + corte realizado pode reconstruir potencial para diagnóstico/target, mas usar esse potencial contemporâneo como feature de previsão continua vazando o alvo.
- ERA5 pode servir para análise física e aprendizado auxiliar explicitamente separado; não substituir vintages de previsão no backtest operacional.
- Disponibilidade planejada conhecida antes da decisão pode ser válida; disponibilidade realizada futura não. A proibição não é pelo nome da coluna, e sim pelo instante de conhecimento.
- `dsc_restricao` do evento futuro não pode explicar antecipadamente esse mesmo evento. Histórico do texto precisa respeitar publicação/revisão.
- Emissão de ensemble não equivale a probabilidade calibrada de corte: dispersão meteorológica cobre só parte da incerteza operacional.

### 5.3 Erros estatísticos e extrapolações no PDF

A página 33 afirma que truncar uma variável com `max(0, x)` preserva exatamente a ROC/AUC por monotonicidade. Isso não é garantido: a transformação não é estritamente crescente e cria empates. Contraexemplo sintético executado nesta revisão: rótulos `[0,1]`, escores `[-2,-1]`, AUC 1,0; após truncar, escores `[0,0]`, AUC 0,5. Não é medição ONS e não permite recalcular o 0,3775 do autor; prova apenas que a justificativa precisa ser corrigida e reproduzida.

A página 37 chama 0,5 de mínimo da AUC. AUC pode ser menor que 0,5; é necessário verificar orientação do escore e capacidade de ordenar, não concluir automaticamente “sem informação”.

A passagem de taxa-base de 20,0% para 61,9% não explica, sozinha, queda de recall: recall depende da distribuição dos escores condicionada aos positivos. Investigar mudança de regime, covariáveis, definição de alvo e calibração; não prometer conserto só mudando limiar.

R²/correlação não prova causalidade nem que diferenças previsto–realizado expliquem todas as horas não detectadas. Tampouco uma diferença pequena de AUC prova empate estatístico sem intervalo de incerteza. Comparar por blocos temporais/episódios, não tratar todas as linhas como independentes.

O empate na mesma hora não demonstra que um modelo a uma hora nunca terá valor. Cada horizonte precisa de avaliação própria.

### 5.4 Bateria e instrução operativa

- “Qualquer PLD positivo paga desgaste” (p. 25) é falso em geral: o valor descarregado precisa superar perdas, desgaste e demais custos marginais.
- Com eficiência 0,85, `1/0.85 - 1 = 17,647...%` é apenas um equilíbrio energético simplificado de preços, não o spread universal que viabiliza BESS.
- Para absorver excedente durante corte, normalmente é preciso reservar espaço no SOC antes dele, não necessariamente carregar antes (p. 43). O objetivo e a sequência dependem da topologia e das obrigações.
- Não otimizar “acima do centro” de uma banda normativa a partir da p. 25. Tolerância não é licença de despacho. O teto/instrução e os limites OEM continuam restrições duras.
- Não assumir que toda energia não gerada poderia ser produzida e carregada localmente: restrição pode afetar geração bruta, conexão, equipamento ou disponibilidade. O modelo deve identificar topologia e medidores.
- Captura física, exportação posterior e efeito sobre apuração regulatória são resultados distintos. Não contabilizar simultaneamente recuperação por BESS e ressarcimento do mesmo MWh sem regra explicitamente validada.
- Conclusões econômicas nacionais, payback “invariante à escala” e exemplos estrangeiros não substituem estudo local com CAPEX/OPEX, sazonalidade, conexão e regime comercial.

### 5.5 Normas e linguagem jurídica

As rodadas se corrigem sobre solar, franquia, BESS, códigos de origem e disponibilidade de documentos. Tratar referências legais como fila de validação primária versionada, não como hardcodes.

A ausência de API pública não é, por si, uma proibição jurídica absoluta de integração autorizada. O produto atual permanece sem protocolo automático por escopo e ausência de integração/autorização verificadas. Não afirmar que qualquer automatização configura crime, nem certificar conformidade sem processo competente.

Separar códigos de razão COFF, origem da restrição, modalidade de operação, estado operativo e condição operativa. Não fundir taxonomias nem transformar rateio de referência em atribuição oficial de causa ou de recebível.

## 6. Estado do backend confrontado com a pesquisa

| Local atual | Constatação por inspeção | Ação necessária |
|---|---|---|
| `backend/app/config.py`, `deps.py`, `repositories/base.py` | Seleção mock/Postgres; interface de consultas sem contrato temporal completo da API externa. | Novo adaptador HTTP injetável; não substituir repositórios à força nem consultar ONS diretamente. |
| `backend/app/domain/contracts.py` | Contratos atuais sem envelope completo de emissão, disponibilidade, snapshot e duração. | Contratos aditivos e versionados; compatibilidade com endpoints existentes. |
| `backend/app/domain/curtailment_events.py` e `repositories/postgres_repo.py` | Caminhos usam referência final menos verificada e 0,5h; validação de unidade global não representa cada fonte nova. | Registro de método por fonte e reconciliação antes de promoção. |
| `backend/models_ml/data_ml/data_extraction.py` | Alias direto de referência final para energia restringida; diverge do domínio. | Não reutilizar esse caminho como verdade de treino. Unificar definição após gate semântico. |
| `backend/models_ml/build_training_dataset_from_postgres.py` | Outro alvo usa geração programada menos verificada. | Rotular como proxy, não COFF oficial; migrar consumo de dataset canônico sem duplicar ETL. |
| `backend/app/ml/features.py` | Features contemporâneas, rolling por linhas e imputação antes do split no fluxo de treino. | Temporalidade point-in-time, janelas por tempo e ajuste de transformação somente no treino. |
| `backend/app/ml/predictor.py` | Features faltantes podem virar zero. | Validar assinatura do modelo; degradação explícita, não previsão aparentemente normal. |
| `backend/app/services/forecasting_utils.py`, `curtailment_service.py` | Mais de uma cadeia de previsão; heurística também alimenta financeiro/BESS. | Serviço único de previsão e distinção ML/baseline/cenário, com horizonte e motivo de fallback. |
| `backend/app/services/bess_service.py` | `min(corte, potencia_mw, capacidade_mwh)`, sem trajetória SOC; `capex/receita_do_periodo` exposto como anos. | Não usar como viabilidade validada. Migrar para motor temporal comum e API versionada. |
| `backend/app/operation_demo/battery.py` | Já há trajetória SOC, eficiência, passo temporal e teto, em cenário sintético. | Reaproveitar lógica física mediante testes; não confundir demo com despacho produtivo. |
| `backend/app/operation_demo/service.py`, `scheduler.py` | Agendamento/dados sintéticos retrospectivos e informação perfeita. | Preservar como laboratório e benchmark-oráculo, não evidência de ganho preditivo. |
| `backend/app/engines/maintenance_cost.py` | Custo incremental e hipótese de ressarcimento explícitos; corte é profundidade condicional. | Reaproveitar; conectar a cenários coerentes e evitar multiplicar probabilidade duas vezes. |
| `backend/app/scada_demo/` | Replay, qualidade, CSV/SQLite e OPC UA read-only demonstrativos. | Isolar de telemetria real; amostragem de 10 min não comprova congelamento regulatório de 6 min. |

As falhas legadas anotadas em `CONTINUIDADE_OPERACAO_SCADA_BESS.md` não foram reexecutadas aqui. Devem ser triadas antes de usar cifras do M1 como saída validada. Preservar REDs fora do escopo; a próxima implementação deve reportar baseline e regressões separadamente.

## 7. Arquitetura alvo, sem infraestrutura desnecessária

```text
ONS / CCEE / clima / cadastros
           |
  time de dados: ingestão, normalização, revisões, snapshots
           |
       API canônica versionada
           |
  DataApiRepository + contratos/qualidade/proveniência
           |
  domínio comum de ativos, intervalos, eventos e evidências
           |
  +-------------------+-------------------+
  |                   |                   |
  histórico/M1     ForecastService     cenários físicos
  evidências       versionado          + economia
  |                   |                   |
  +-------------------+--------- planejamento M3/BESS
                                      |
                          proposta -> revisão -> modo sombra
```

Dado privado (ordens, telemetria, contrato, mensagem recebida) entra por upload/conector autorizado separado. Não requer pipeline ONS duplicado. Dados brutos/canônicos e histórico de publicação pertencem ao time de dados; estado de planos, decisões, aprovações e artefatos pertence ao backend da aplicação.

Não criar Kafka, microserviços ou solver sofisticado como pré-requisito. API modular e jobs locais/worker simples bastam inicialmente. Se necessário, adicionar tabela de runs e storage de artefatos; evitar usar memória de processo como registro permanente de decisões.

### 7.1 Entidades mínimas

- `Asset`, `AssetAlias`, `PlantGroupMembership`: usina/conjunto/turbina/conexão, tipo, vigência e identidade interna. CEG como identificador externo, sem presumir cobertura universal.
- `Observation`: intervalo, valor, unidade, qualidade, origem, publicação/revisão e natureza observada/sintética/estimada.
- `CurtailmentInterval` e `CurtailmentEvent`: linha/intervalo e episódio agregado distintos, com política versionada de agregação. Mais de uma razão ou revisão não pode duplicar duração/energia.
- `RestrictionInstruction`: limite, escopo físico, origem da evidência, recebimento/confirmação e vigência. Não inferir instrução oficial da queda de geração.
- `ForecastRun`: instante da decisão, vintage de entradas, alvos/horizontes, versão de modelo, calibração e cobertura.
- `MaintenanceTask` e `MaintenancePlan`: criticidade, janela, duração, recursos, dependências, indisponibilidade, agenda-base e aprovação.
- `BatteryAsset`, `BatteryState`, `DispatchScenario`: topologia, medidores, SOC/SOH, eficiência, limites, regime e política de horizonte final.
- `EconomicScenario`: preço marginal/contrato, beneficiário, custos, impostos/tarifas quando aplicáveis e ressarcimento condicionado.
- `EvidenceBundle`, `DecisionRun`, `DeadlineRule`: snapshot, método, hash, autor, versão normativa e ressalvas.

### 7.2 Estados e metadados

Separar `observed`, `published_apuration`, `derived`, `forecast`, `synthetic` e `mixed`. Um replay de dado real com turbinas inventadas é misto; um booleano global não basta.

Toda resposta analítica deve carregar: versão de contrato, `snapshot_id`, `as_of`, cobertura, granularidade, unidades, qualidade, método e limitações. `null` significa desconhecido/não aplicável com reason code; não zero automático.

Autorização: cliente/consultor é permissão server-side, não parâmetro visual de filtro. Dados públicos de conjunto podem ser exibidos como contexto; dados privados de outra SPE não. Cache inclui identidade autorizada, snapshot, intervalo, método e parâmetros.

## 8. Roadmap executável por fases

### F0 — contrato e saneamento de semântica (próximo trabalho)

**Pode começar sem API disponível.**

1. Alinhar com o colega o documento `CONTRATO_API_DADOS_CURTAILIQ.md` e obter amostras de payload/dicionário.
2. Criar contratos tipados, envelope de evidência, interface de capabilities e protocolo de leitura `as_of`/snapshot.
3. Testes RED para duração, MW/MWh, nulos, revisões, mudança de conjunto e isolamento; depois implementação GREEN.
4. Criar adaptador HTTP com transporte injetável e fixtures declaradas. Não inventar URL final, segredo ou rotas do fornecedor.
5. Inventariar todos os produtores/consumidores de `energia_restringida_mwh`, inclusive treino e caches locais; marcar método legado e proxy.
6. Reconciliar amostras reais antes de escolher campo/método canônico. Nenhuma troca silenciosa em M1.

Arquivos existentes prováveis: `app/domain/contracts.py`, `app/repositories/base.py`, `app/config.py`, `app/deps.py`. Novos propostos: `app/domain/data_contracts.py`, `app/repositories/data_api_repo.py`, `app/clients/data_api_client.py`, `tests/test_data_contracts.py`, `tests/test_data_api_repo.py` (todos sob `backend/`).

**Aceite:** contrato agreed ou pendências explícitas; testes locais de adapter passam; sem real fallback para mock oculto; campos/linhas inválidos rejeitados ou isolados com diagnóstico; falta de API aparece como indisponibilidade, não como sucesso.

### F1 — primeira fatia real: histórico, qualidade e evidência

1. Smoke test read-only na API após liberação, com período pequeno e snapshot fixo.
2. Catálogo NE com vigência conjunto/usina e disponibilidade de datasets, sem confundir cadastro de disponibilidade hídrica/térmica com disponibilidade renovável.
3. Reconciliar energia/geração/preço por duração e intervalo de validade. Relatórios com cobertura e razão desconhecida explícitas.
4. Agregar eventos por política, preservando intervalos brutos e revisões; não contar cada linha como episódio final.
5. Parser determinístico de `dsc_restricao`: texto original, equipamento citado, regra aplicada, ambiguidades e cobertura. Associação histórica, não causalidade elétrica comprovada.
6. Policies de elegibilidade/franquia/prazos versionadas; sanar pendências M1 necessárias à fatia, sem declarar cifras oficiais sem regra/dados.
7. Alertas factuais primeiro: dado novo, revisão, lacuna e prazo validado. Emitir por publicação real, não horário presumido fixo.

Arquivos: `domain/curtailment_events.py`, `services/financeiro_service.py`, `services/pleito_service.py`, `engine/franquia.py`, `engine/prazos.py`; novos `services/data_quality_service.py`, `services/restriction_evidence_service.py` e testes correspondentes.

**Aceite:** um caso real rastreável de ponta a ponta; alteração de snapshot reproduz e explica mudança; totais iguais com/sem paginação; nenhum falso zero por falta de PLD; separação energia/perda/recebível. Sem envio automático de pleito.

### F2 — cenários comuns de operação, manutenção e bateria

**Implementação em paralelo à F1 é possível usando cenários declarados.**

1. Extrair/reutilizar o núcleo físico de `operation_demo`, mantendo endpoint e selos da demo compatíveis.
2. Criar ordens reais/importáveis, agenda-base factível e objetivos de custo incremental. Não exigir detector de falhas para gerar a primeira agenda útil.
3. Modelar limites comuns: manutenção reduz disponibilidade, carga/descarga usa conexão, SOC evolui, corte residual permanece identificável.
4. Migrar o simulador BESS legado para engine temporal, sem renomear receita do período como receita anual.
5. Executar quatro cenários sobre as mesmas entradas: base, manutenção, BESS, conjunto. O ganho combinado não é soma automática dos ganhos isolados.
6. Expor resultados econômicos com preço marginal explícito e ressarcimento perdido como cenário condicionado, nunca presumido pelo classificador.

Arquivos propostos: `app/engines/operation_balance.py`, `battery_dispatch.py`, `operation_economics.py`; reaproveitar `maintenance_cost.py`. Orquestração em `app/services/operation_scenario_service.py`, `maintenance_service.py`; adaptar `bess_service.py`. Testes novos de energia, SOC, economia e agenda. Evitar criar outra família duplicada de fórmulas em `app/engine/` e `app/engines/`.

**Aceite:** conservação por intervalo, restrições factíveis, mesmo baseline, nenhum benefício de SOC inicial grátis ou estoque terminal monetizado sem política; relato “cenário/replay”, não previsão. Informação perfeita somente como teto retrospectivo.

### F3 — previsão causal compartilhada

1. Receber snapshots/vintages e validar `available_at <= decision_time` para todas as entradas, inclusive lags e insumos externos.
2. Definir alvos separados: ocorrência, magnitude e duração; ENE sistêmico como contexto e exposição CNF/REL por conjunto. Probabilidade sistêmica não vira probabilidade da usina por cópia.
3. Começar com baselines e um horizonte prioritário, 6h se os dados tempestivos permitirem; depois 24/48h conforme necessidade da manutenção. Diagnóstico 1h não fica proibido a priori.
4. Margem projetada com previsão de carga/geração e piso identificado por fonte/ano/cenário. Conferir MMGD já embutida para não subtrair duas vezes; contexto SIN mesmo com carteira NE.
5. Congelar split temporal, purge para alvos sobrepostos, embargo/publicação, transformação e calibrador antes de abrir holdout. Imputação e seleção apenas no treino.
6. Comparar LightGBM como candidato, não vencedor antecipado, com persistência disponível, calendário e regra física. Exibir disponibilidade de cada baseline.
7. Medir PR-AUC/ROC-AUC, calibração/Brier, erro e quantis de magnitude, cobertura dos intervalos, duração e lead time de episódios. Medir valor decisório fora da amostra.
8. Unificar consumo por financeiro, BESS e risco em `ForecastService`; fallback retorna método e bloqueios, não `prob_corte=0.5` fingindo calibração.

Arquivos existentes: `app/ml/features.py`, `predictor.py`, `services/forecasting_utils.py`, `curtailment_service.py`, `models_ml/train_curtailment_model.py`. Novos propostos: `app/ml/point_in_time.py`, `app/services/forecast_service.py`, `models_ml/evaluate_forecast.py`, testes de leakage/assinatura/calibração.

**Aceite:** benchmark por horizonte e mesma amostra, calibração em conjunto distinto do holdout, intervalos de incerteza por blocos e modelo registrado com hashes. Dados públicos atrasados podem bloquear promessa de 6h; sem vintage, marcar backtest exploratório. Nenhuma promoção baseada só em AUC do PDF.

Notebook oficial, se adotado, segue o checkpoint imutável/push pelo responsável, revisão READY e autorização explícita por SHA, com logs pré/pós separados. Esta etapa não autoriza commits ou abertura de holdout agora.

### F4 — planejamento integrado em modo sombra

1. Planejar a partir de distribuições/trajectórias conjuntas, não somente risco isolado por intervalo.
2. Restrições de equipes/competências, vento, jornada, deslocamento, precedência, peças, duração e prazo OEM.
3. Tarefas urgentes não adiadas para capturar economia. Plano registra não alocação e motivo.
4. BESS com espaço de carga antes do excedente, teto de conexão, SOC/SOH, rampas e política terminal; decisões recedentes usando só dados disponíveis.
5. Sensibilidades de compensação e topologia não resolvidas expostas ao usuário; se uma hipótese inverte decisão, pedir validação humana.
6. Estado de plano: rascunho -> proposto -> aprovado/rejeitado -> executado/expirado. Aprovar não envia comando.
7. Comparar baseline factível e políticas simples; previsão pior pode significar manter agenda-base. Oráculo é limite de oportunidade, não resultado vendido.

Arquivos: serviços criados na F2, `app/domain/maintenance.py`, `app/domain/decision_run.py`, `app/routers/operacao.py` e testes de replay/concorrência/aprovação. Rotas são propostas, não existentes.

**Aceite:** replay point-in-time, benefício líquido fora da amostra e limites respeitados; cada recomendação reproduzível e aprovada por responsável. Piloto prospectivo sem escrita em equipamentos.

### F5 — investimento e expansão comercial

- Estudo BESS com ano/série representativa, sazonalidade e cenários, custos e reposição, degradação de calendário/ciclagem, VPL/TIR/payback quando identificáveis.
- Capacidade, arbitragem e serviços ancilares são fluxos distintos: só habilitar os contratualmente acessíveis e compatíveis, sem dupla venda de potência/energia.
- Exposição contratual mínima já entra em F2; cobertura completa PPA/ACR/ACL, obrigações e contraparte cresce aqui.
- Carteiras consultor/cliente com autorização backend, permissões por ativo, vigência e auditoria; benchmark só com escopo autorizado e cobertura comparável.
- Detector de anomalias SCADA: prioridade posterior a ordens existentes, avaliação por eventos rotulados, sem diagnosticar falha física a partir de regra simples.
- Solar, química BESS detalhada, Kelmarsh, Modbus e estudos de rede avançados entram se houver ganho comprovável e dados/licenças. Não bloqueiam a primeira fatia.

**Aceite:** caso de uso específico justifica complexidade e custo. Controle em malha fechada, comandos a turbinas e bateria real continuam fora deste roadmap de liberação e exigem projeto de segurança separado.

## 9. Contratos de features para as APIs do produto

Nomes abaixo são propostas a congelar na implementação; não são endpoints já entregues:

| Operação | Entrada essencial | Saída essencial |
|---|---|---|
| Histórico de curtailment | ativo, intervalo, snapshot, escopo autorizado | intervalos/eventos, métodos, energia, cobertura, razão e revisão |
| Previsão | ativo/conjunto, instante de decisão, horizontes | probabilidade calibrada quando disponível, magnitude, quantis, duração, método/vintage e limitações |
| Simular operação | série/cenários, ordens, topologia, bateria, economia | trajetórias físicas, restrições, custos e comparação baseline |
| Propor manutenção | ordens, recursos, agenda-base, forecast_run_id | agenda, custo incremental, risco, tarefas não alocadas e motivos |
| Simular BESS | regime, medidores, potência/capacidade, SOC, tarifas, horizonte | carga/descarga, perdas, ciclos, receita por fluxo, corte físico residual, viabilidade condicional |
| Relatório/evidência | run_id/eventos, política e versão | pacote reproduzível, autoria, hash, fontes, pendências e ressalvas |

Não quebrar `/api/operacao/demo`. Os serviços existentes devem migrar por camada adaptadora e versão de contrato, com teste de compatibilidade para o frontend.

## 10. Contabilidade e testes inegociáveis

### Física

- Integrar MW pela duração real; 10/30/60 minutos não são intercambiáveis.
- Separar geração disponível contrafactual, manutenção indisponível, geração efetiva, exportação, importação, carga, descarga e corte residual.
- SOC seguinte = SOC atual + carga * eficiência_carga * duração - descarga / eficiência_descarga * duração, com convenção explícita dos medidores.
- Limites de SOC/potência/conexão e não simultaneidade respeitados; perdas e energia inicial/final reconciliadas.
- Intervalos ausentes não são zero; intervalos sobrepostos não duplicam energia; eventos em troca de hora de PLD repartem duração.

### Economia

- Benefício incremental = valor líquido do cenário - valor líquido do baseline, com mesmo horizonte, tarefas e dados.
- Não somar manutenção e BESS isolados se competem pelo mesmo excedente.
- Valor do MWh: preço marginal/contrato e beneficiário, não PPA inteiro por padrão nem PLD universal.
- Franquia cumulativa usa histórico anual adequado, política e estágio; filtro de tela não redefine franquia.
- Desgaste e custos fixos/marginais identificados; “economia operacional” não é payback.
- Não anualizar automaticamente poucos dias de corte intenso. Quando fluxo anual não é estimável, `payback_anos=null` com motivo.

### ML e dados

- Perturbar valores/publicações futuras não altera previsão passada.
- Revisão recebida depois da decisão não muda o replay daquela decisão.
- Treino/inferência com mesma assinatura e transformações; feature ausente não vira zero silencioso.
- Targets de usina, conjunto e SIN separados; probabilidades de razões sobrepostas não somadas sem modelo conjunto.
- Snapshot estável entre páginas, autorização em cache e rejeição de schema desconhecido.
- Resultado idêntico para reexecução com mesmos inputs/método/semente; hashes não comprovam veracidade da fonte, apenas identidade do artefato.

## 11. Perguntas que destravam o plano

### Para o colega de dados, agora

1. Qual OpenAPI, autenticação de serviço, paginação, limites e versionamento estarão disponíveis?
2. Quais datasets/colunas e granularidades realmente vêm na primeira entrega? Há o campo apurado citado no PDF e seu dicionário de unidade?
3. Há histórico de publicação/revisões ou apenas snapshot final? Dá para consultar as-of ou baixar releases imutáveis?
4. Como reconhecer restrição sem depender apenas de razão preenchida? Como vêm eventos parciais/múltiplas razões?
5. Catálogo temporal usina/conjunto/CEG e aliases está disponível? Como ficam IDs não resolvidos?
6. PLD por submercado e previsões DESSEM/clima vêm com horário de emissão e disponibilidade efetiva?
7. Quem captura e preserva os vintages meteorológicos/operacionais daqui em diante? Não deixar essa responsabilidade implícita.

### Para autor da pesquisa

Entregar scripts, JSONs de resultados, versão/consulta dos datasets, splits, transformações e corpus normativo. Esclarecer unidades do campo apurado, corrigir passagem sobre ROC com empates e exportar versão com equações legíveis. Informar exatamente quais publicações estavam disponíveis em cada decisão do teste de 6h.

### Para ONS/especialista e cliente-piloto

- Qual escopo físico do limite: geração bruta ou injeção, e quais medidores governam o tratamento BESS?
- Como manutenção planejada afeta disponibilidade, rateio e elegibilidade neste enquadramento concreto?
- Qual regra vigente por fonte/ano/procedimento, com canal e marco inicial de prazo?
- Quais tarefas são deslocáveis, com qual antecedência e quem aprova? Quais custos/restrições não podem ser relaxados?
- Quem captura o benefício econômico e quais dados privados pode compartilhar?

Não bloquear F0/F2 por questões jurídicas ainda abertas: modelar como cenários. Bloquear apenas afirmação oficial/receita garantida/uso operacional que depender da resposta.

## 12. Próxima sequência de execução

**Primeira entrega recomendada:** contratos da API e teste ponta a ponta com fixture declarada, acompanhado de uma matriz de reconciliação de energia. Assim o colega pode subir dados sem obrigar refactor de cada serviço.

**Segunda:** conectar um recorte real e publicar histórico auditável + alertas factuais; corrigir as divergências econômicas necessárias.

**Terceira:** unificar os motores de manutenção/BESS e testar cenário integrado com mesma contabilidade.

**Quarta:** montar dataset point-in-time e baseline de previsão, promover apenas o horizonte validado e conectar ao planejamento em modo sombra.

Não começar por mais um modelo treinado em CSV sem unidade/vintage, por outro protocolo SCADA, nem por um payback bonito sobre dados ainda não reconciliados. O diferencial comercial depende da decisão correta e do benefício líquido comprovável, não da quantidade de módulos.
