# Instruções de coerência frontend/backend — CurtailIQ

## Escopo e confiança da revisão

Revisão estática, somente leitura do código, com escrita exclusiva deste documento. Nenhuma alteração em `front/` ou backend, instalação, build, teste de runtime ou commit. Outro agente está editando o frontend: caminhos/linhas abaixo representam o conteúdo encontrado durante esta leitura, não um snapshot atômico. Revalidar cada trecho antes de corrigir; não reaplicar algo já resolvido.

Fontes principais: `docs/ANALISE_PESQUISA_E_ROADMAP_BACKEND.md` e `docs/API_OPERACAO_BACKEND.md`; leitura de `front/src/api/*`, `types/*`, hooks de operação/usinas/financeiro/regulatório, router e páginas Operacao, Simulador, Resumo/ForecastPanel, Financeiro, Dossie e Portfolio, incluindo componentes compartilhados pertinentes. Conferência pontual adicional do serviço BESS legado.

Uma tentativa de leitura em lote via terminal foi bloqueada; não foi reexecutada. A inspeção prosseguiu pelas ferramentas específicas de leitura. Buscas que não retornaram arquivos não foram tratadas como prova de ausência: por exemplo, `pages/Risco/index.tsx`, importado no router, foi localizado por leitura direta. Não há achado de import quebrado para essa página.

### Decisões que não podem ser invertidas pela UI

- O novo backend do roadmap ainda não foi implementado. Tipos e wrappers antecipados NÃO comprovam endpoints entregues.
- Integração de dados solicitada: somente **L (consumo/carregamento da API canônica Databricks/AWS)**. Extração e transformação de fontes pertencem à camada/time de dados. Não criar ETL, scraping ONS/CCEE, conexão direta do browser ao DW ou segredos AWS/Databricks no frontend. Não inventar URL, autenticação ou payload do fornecedor.
- O frontend consome a API da aplicação. O backend futuro fará leitura da API de dados e cálculos de domínio; os cálculos do produto não autorizam duplicar o E/T da camada canônica.
- `/api/operacao/demo` é laboratório sintético, retrospectivo, separado da seleção de usina real. Sem controle de equipamentos e sem protocolo automático de pleitos.
- Economia de cenário, economia observada atribuível, receita, elegibilidade e payback são grandezas diferentes.

Prioridades: **P0** antes de apresentar resultado como evidência/benefício operacional ou investimento; **P1** antes da integração/uso analítico; **P2** clareza e robustez complementar. Prioridade não significa que se deva implementar o backend futuro nesta tarefa.

## 1. Correções sob responsabilidade do frontend

### F01 — P0 — Demo exibe conceitos físicos diferentes como se fossem iguais

**Evidências:** `front/src/pages/Operacao/Cenario.tsx:44-50,259-282,294-318`; `front/src/types/operacao.ts:33-46,82-91`. Contrato publicado: `docs/API_OPERACAO_BACKEND.md:47-83`.

- `scheduled_mw` aparece como “Gerado com agenda”, mas é exportação eólica SEM BESS; geração física é `wind_generation_mw`.
- `curtailed_mw` aparece apenas como “Cortado”, mas é excedente antes da bateria; corte residual é `residual_curtailment_mw`.
- `battery_export_mwh` aparece como “exportados via bateria”; é exportação TOTAL com bateria. A descarga adicional é `recovered_mwh` (o valor principal deste cartão está correto).
- A frase “área entre o disponível e o exportado é o que a rede não deixou escoar” ignora manutenção, carga/descarga e estoque.
- Tooltip chama `price_brl_mwh` de PLD, embora seja preço constante assumido no cenário.
- Os tipos omitem `wind_generation_mw`, `maintenance_unavailable_mw`, `residual_curtailment_mw`, `charged_mwh`, `final_soc_mwh` e `battery_losses_mwh`. Omissão de campos adicionais não quebra JSON por si só, mas impede mostrar a reconciliação publicada.

**Ação:** corrigir rótulos, incluir campos canônicos de balanço e chamar preço de “preço assumido”. Economia de manutenção deve ser “ganho operacional bruto simulado”, antes de mobilização/reagendamento/ressarcimento; conservar ressalva atual de que bateria não é VPL/payback.

**Aceite:** cenário com carga positiva distingue geração física de exportação; cenário com manutenção não atribui indisponibilidade a corte de rede; exportação total nunca é rotulada descarga; balanço apresenta carga, perdas e estoque final sem monetizar estoque.

### F02 — P1 — Data original pode ser nula; timezone da demo não é fixado

**Evidências:** `types/operacao.ts:66-73` declara `original_start: string`; `pages/Operacao/Cenario.tsx:103-105` formata original sem guarda; `lib/formatters.ts:34-43` usa timezone do navegador. Contrato: `API_OPERACAO_BACKEND.md:16,43` permite AMBOS os starts nulos e fixa horário operacional UTC−03.

**Ação:** `original_start: string | null`, renderizar “Sem janela / revisão necessária” para ambos os nulos; datas da demo com zona operacional explícita. Não converter null em data. Em manutenção futura, negociar nulabilidade do baseline antes de reutilizar Gantt (`GanttManutencao.tsx:39-44,193-204`).

**Aceite:** tarefa não alocada não mostra data artificial; a mesma demo mostra a mesma hora operacional em browsers com fusos diferentes. Não confundir o tipo futuro `inicio_baseline` com o contrato já publicado da demo.

### F03 — P1 — Seletor real aparenta governar cenário independente

**Evidências:** `components/shell/OperacaoShell.tsx:46-52,65-79` oferece seleção real em todas as abas; `pages/Operacao/Cenario.tsx:118-120,185-192` chama demo sem ID. `API_OPERACAO_BACKEND.md:11` exige identificar DEMO_NE.

**Ação:** na visão da demo, substituir/esconder seletor real e identificar “DEMO_NE · simulado · retrospectivo”, intervalo fixo e método. Remover comentário de que primeira usina do catálogo é a do gêmeo digital. Manter separação de contexto nas demais abas.

**Aceite:** trocar usina não sugere recalibrar ou operar o gêmeo; usuário consegue identificar que cenário não representa ativo selecionado.

### F04 — P0 — Simulador BESS legado é apresentado como recuperação medida e investimento estimável

**Evidências:** `pages/Simulador/index.tsx:143-145,250-282,322-326`; `components/shared/Provenance.tsx:19-24`; `backend/app/services/bess_service.py:48-61,75-86`.

- Receita contrafactual usa selo “Histórico medido”. Não é receita efetivamente recuperada.
- UI apresenta `payback_anos` em anos; backend divide CAPEX pela receita DA JANELA, sem anualizar fluxo representativo.
- Receita zero é explicada categoricamente por ausência de corte/PLD suficiente; o backend também substitui PLD faltante por zero.
- “O caso de investimento aqui está na projeção à frente” excede evidência do motor legado.

**Ação frontend imediata:** rotular “estimativa contrafactual legada”, mostrar limitações físicas/econômicas e indisponibilizar payback para esse método, sem recalculá-lo no browser. Não inferir causa de receita zero. Separar dado histórico de entrada e saída simulada; não classificar todo contrafactual como sintético puro se usa observações reais.

**Aceite:** resposta legado com payback numérico não vira indicador de anos validado; falta de preço não vira conclusão de inviabilidade; nenhum resultado simulado aparece como receita medida. Correção do motor é B01, não responsabilidade do frontend.

### F05 — P0 — Ausência de observações é transformada em zero/corte

**Evidências:** `pages/Operacao/Scada.tsx:38-41,65-79,119-120,201-208`; `types/operacao.ts:142-146`; `lib/series.ts:23-54`; `pages/Resumo/index.tsx:56-58,167-174,283-290`; `pages/Financeiro/index.tsx:44-51,68-71,122-123,144-149`; `pages/Resumo/ForecastPanel.tsx:43-58,90-100`.

- SCADA admite potência nullable, mas transforma null em zero. Diferença disponível−gerado recebe rótulo de corte mesmo com manutenção/falha/medição ausente. `atraso_segundos` ausente vira zero e dado não é sinalizado como idade desconhecida.
- Série diária preenche todo dia ausente com zero sem metadado de cobertura; só é válido quando há garantia de cobertura e de ausência real de evento.
- Resumo não exibe `perda.error` e pode mostrar “nenhum evento” após falha dessa consulta. Financeiro mostra erro, mas ainda pode exibir simultaneamente “nenhum corte”.
- PLD zero legítimo aparece como indisponível em Financeiro por teste de truthiness; preço não calculável vira zero em Resumo.
- ForecastPanel converte nulos em zero e injeta último realizado na série prevista para conectar linhas; isso é ponto gráfico artificial, não previsão emitida.

**Ação:** distinguir loading/erro/indisponível/lacuna/zero observado; manter null em cálculos e gráficos; preencher zeros somente com cobertura comprovada. Rotular desvio de potência como “diferença não atribuída” sem evidência explícita de restrição; separar manutenção/falha. Não inferir “agora” de primeiro ponto previsto; usar emissão recebida ou “início da projeção”.

**Aceite:** testar leitura ausente, zero válido, PLD ausente, lacuna, manutenção, erro HTTP e histórico atrasado. Nenhum vira automaticamente “sem perda”, “sem corte”, “MW cortados” ou previsão zero confiável. Sem metadados novos, UI declara limitação em vez de inventar certeza.

### F06 — P0 — Linguagem econômica/regulatória mais forte que a evidência

**Evidências:** `pages/Resumo/index.tsx:108-129,163-166`; `pages/Financeiro/index.tsx:81,90,110-118,175-176`; `pages/Dossie/index.tsx:230-232,255-262`; roadmap §§5.5, 7.2, F1 e §10.

**Problema:** valuation por PLD aparece como “receita que a usina deixou de faturar”/“perda realizada”; “a razão define se o corte é ressarcível” reduz elegibilidade a uma categoria. Dossiê afirma “dados reais” e conformidade normativa sem verificar proveniência/policy; durante carregamento já mostra “Eventos e franquia validados”/“Canal regulatório definido”.

**Ação:** “perda de oportunidade estimada a PLD”, salvo comprovação contratual específica; “potencialmente elegível, sujeito a enquadramento, franquia, prazo e revisão”. Exibir fonte normativa/beneficiário já disponíveis (`types/regulatorio.ts:88,96,105,144`) e pendências. Indicadores de progresso descrevem processamento, não validação concluída. Sem confirmação de origem, não afirmar dados reais.

**Aceite:** cenários mock, estimativa, norma pendente e contrato desconhecido não recebem selo de apuração/ressarcimento oficial. Revisão humana continua obrigatória e não implica garantia.

### F07 — P1 — Dossiê: franquia definida rotulada usada; edição não vai à exportação

**Evidências:** `pages/Dossie/index.tsx:95-108,129,183-188,219-222,244-267`; `types/regulatorio.ts:105,139-147`; `hooks/useRegulatorio.ts:67-74`.

- “Franquia usada” usa `franquia.horas_definidas` (limite normativo), não `horas_rel_acumuladas`.
- Editar altera apenas draft local; exportar baixa `pleito_id` do servidor sem usar `useAtualizarPleito`. O documento exportado pode divergir do revisado.
- Troca de período apaga draft/seleção, mas `criarPleito.data` permanece e `draft || criarPleito.data.markdown_gerado` recupera pleito anterior. A chave não inclui usina. Resposta atrasada pode recolocar documento de contexto anterior.

**Ação:** separar limite, consumo anual e saldo, com ano/cobertura; salvar revisão antes de exportar ou tornar explicitamente exportação do original. Associar draft/mutation ao ID+período+eventos e invalidar resposta incompatível. Preservar vazio editado sem fallback silencioso.

**Aceite:** mudar período/usina impede exportar pleito antigo como atual; PDF/DOCX corresponde à revisão apresentada (ou diferença declarada); limite de franquia não é apresentado como consumo.

### F08 — P0 antes de habilitar endpoints futuros — Planejamento/backtest ignora selo de simulação e presume valor comprovado

**Evidências:** `types/operacao.ts:202-215,261-282,310-328` possui `is_simulated`; `pages/Operacao/Manutencao.tsx:82-86,115-118,131-134,211-245,328-360`; `pages/Operacao/Valor.tsx:18-32,55-59,79-83,101-120` não exibe esse selo nos resultados.

**Problema:** contratos futuros podem trazer ordens/cenários sintéticos sem identificação visível. “O que o produto entrega”, “prova o valor”, previsão D−1 e ganhos anuais são presumidos. Desvio padrão em BRL é colocado junto de BRL/MW/ano sem garantia de mesma normalização. Defaults hardcoded são atribuídos a YAML sem leitura dele. Corte não garante parada grátis nem elimina urgência, custo e restrição.

**Ação:** usar natureza/método/horizonte/limitações recebidos; marcar tela como proposta antes da disponibilidade. Não anualizar poucos dias, não tratar sementes como incerteza de generalização; orçamento anual somente quando validado. Alterar copy para recomendação sujeita a aprovação, nunca execução. Não ocultar economia negativa/zero como “—” (`Manutencao.tsx:52-60`).

**Aceite:** fixture `is_simulated=true` é inequivocamente simulação; nenhum ganho observado é declarado a partir de oráculo; valores e dispersão têm mesma unidade e base temporal; tarefas urgentes não são sugeridas como livremente deslocáveis. Há aceite humano, sem comando a ativos.

### F09 — P1 — Gargalos comunica causalidade/topologia não demonstradas

**Evidências:** `pages/Operacao/Gargalos.tsx:51-52,71,84,161-164,291-294`; `types/operacao.ts:377-385` chama lista de `conjuntos_afetados` com `plant_id`.

**Ação:** “equipamentos citados nas restrições / exposição histórica associada”; texto original, regra, cobertura e ambiguidades, sem afirmar estado elétrico causal, previsão de gargalo ou usinas fisicamente atrás do equipamento. Negociar identidade/tipo de ativo na lista futura; não rebatizar conjunto como usina.

**Aceite:** parser com texto ambíguo mantém desconhecido; ranking não é apresentado como prova causal ou recebível atribuído a agente. Cobertura atual exibida é boa prática a preservar.

### F10 — P1 — Rotas pendentes não podem ser detectadas apenas por 404; 422 não é string

**Evidências:** `api/client.ts:23-38`; `types/regulatorio.ts:216-219`; `hooks/useOperacao.ts:26-28,54-62`; contrato demo prevê 422 FastAPI (`API_OPERACAO_BACKEND.md:12`).

**Ação:** distinguir capability ausente de ativo inexistente, método incorreto e recurso oculto por autorização. 404/405/501 genéricos não provam “ainda não publicado”. Normalizar `detail` string/lista/objeto para mensagens seguras, inclusive erros de campo em 422. Não persistir polling da rota conhecida como indisponível: retry=false não desliga refetchInterval.

**Aceite:** 422 informa campo inválido; 404 de usina não vira promessa de futura API; 401/403/500 permanecem erros adequados. Indisponibilidade não aciona mock disfarçado. Preferir capabilities publicadas; enquanto não existem, rótulo conservador.

### F11 — P1 — Portfólio preserva null individual, mas soma parcial parece total

**Evidências:** `pages/Portfolio/index.tsx:69,82-95,145-172,317-326`; `hooks/useUsinas.ts:19-34`; `types/usinas.ts:13-22`.

**Ação:** preservar os acertos atuais (null individual como “—”, sem inventar perda zero); acompanhar quantidade/cobertura de valores conhecidos, período e método. Soma com apenas parte dos ativos deve ser “subtotal conhecido”. Percentual ressarcível só usa universos compatíveis. Ordenar desconhecidos separadamente de zeros. Informar se resumo inclui busca textual ou apenas filtros: hoje totais usam `usinas`, tabela usa `filtradas`.

**Aceite:** carteira com valores ausentes não parece integralmente apurada; comparar/rankear só períodos compatíveis ou sinalizar diferença. Paginação futura usa snapshot estável fornecido pelo backend; não inventar snapshot no browser.

### F12 — P1 — Resultado de simulação pode ficar associado a configuração/contexto diferente

**Evidências:** `pages/Simulador/index.tsx:83-100,114-138,277-282,305-307,369-371`; `hooks/useFinanceiro.ts:26-29`; `pages/Operacao/Manutencao.tsx:80,90-95`; `pages/Operacao/Valor.tsx:37-42`.

**Ação:** associar mutation ao ID, intervalo e configuração enviados, não aos sliders/seleção atuais. Comparação de presets deve incluir ID da usina, não só datas; limpar/invalidar contexto e ignorar respostas antigas. Mostrar “resultado anterior/recalculando” quando houver discrepância. Presets sem CAPEX não são paybacks comparáveis ao cenário com CAPEX.

**Aceite:** mudança rápida de usina, datas ou potência com requisição pendente nunca mostra resultado antigo sob novo rótulo. A mesma proteção vale ao alternar usina em Manutenção/Valor.

### F13 — P1 — Proveniência e método não podem ser inferidos por rótulo genérico

**Evidências:** `components/shared/Provenance.tsx:16-48,93-115`; `pages/Resumo/index.tsx:139-149`; `types/usinas.ts:49-54`; `types/financeiro.ts:90-97,109-122`.

**Ação:** separar observado, apurado, derivado, previsão, sintético e misto conforme contrato futuro. Manter método original auditável; não chamar heurística de ML nem apresentar Random Forest como treinado especificamente na usina sem metadado que comprove. Mostrar `observacao` já prevista no resumo; evoluir tipos para metadados/limitações emitidos pelo backend em vez de descartá-los. Hoje métodos desconhecidos são humanizados, não automaticamente chamados ML — isso está correto; falta classificar limitações de forma explícita.

**Aceite:** sazonalidade/média móvel é baseline/heurística; ML só recebe atributos de treino/horizonte/calibração efetivamente comprovados. Previsão não se torna valor realizado nem material de pleito. Não inventar benchmark/AUC.

## 2. Lacunas do backend/contrato — não corrigir com fórmulas ou mocks no frontend

### B01 — P0 — Motor BESS legado precisa de substituição/reconciliação

`backend/app/services/bess_service.py:48-61` mistura corte em MWh, potência MW e capacidade MWh no mesmo `min`, assume PLD faltante zero e expõe razão CAPEX/receita da janela como anos. `:75-77` usa limite de capacidade agregado na projeção sem trajetória SOC. Confirmado por leitura, não por execução nesta revisão. Roadmap F2/F5 prevê motor temporal e estudo representativo. Backend deve entregar conservação, duração, medidores, SOC, perdas, estoque terminal, custos e payback nullable com motivo; até lá frontend deve limitar afirmações (F04), não implementar engine concorrente.

### B02 — P1 — Contratos prospectivos de operação não são APIs atuais

`api/operacao.ts:24-76` prepara SCADA, janelas, ordens, agendamento, backtest e gargalos. `types/operacao.ts:99-386` deriva do plano anterior. `hooks/useOperacao.ts:20-24` admite que rotas foram antecipadas. `API_OPERACAO_BACKEND.md:5-17,98-100` garante demo, não todos esses endpoints; roadmap §9 diz que nomes propostos precisam ser congelados.

Não classificar wrapper antecipado como bug de rota entregue; mantê-lo experimental/pendente até contrato acordado. Rever semântica antes de implementar: desvio disponível−gerado não é automaticamente corte (`types/operacao.ts:145`), `ressarcivel: boolean` não representa desconhecido (`:181`), números anuais obrigatórios não representam estudo inconclusivo (`:319-324`), e previsto não implica point-in-time validado (`:234`). Preservar `/api/operacao/demo` e migrar de forma aditiva/versionada.

### B03 — P0 antes de decisão real — Metadados canônicos, qualidade, econômico e regulatório

Roadmap §§5.1, 7.2, F0/F1/F3 e §10 requer unidade/duração por fonte, método, cobertura, snapshot, as-of, publicação, revisão, naturezas e reason codes. Tipos legados de usinas/perdas/pleitos não oferecem envelope completo; `number` obrigatório não pode representar desconhecido. Não é suficiente corrigir TypeScript para fingir que metadados existem.

Backend deve definir: perda de oportunidade versus receita contratual/recebível; elegibilidade/policy normativa por fonte/ano; franquia anual independente do filtro; previsão única com baseline/fallback e vintage; nulos com motivo, inclusive PLD e payback. Aplicação consome somente L da API canônica Databricks/AWS, preservando proveniência sem duplicar E/T. Testes de contrato com fixtures declaradas podem preceder API real; não equivalem a integração concluída.

### B04 — P0 antes de dados privados — Autorização pertence ao servidor

`pages/Portfolio/index.tsx:35-59` e `components/shell/OperacaoShell.tsx:46-52` são filtros/seletores, não controle de acesso. `router.tsx:43-69` expõe navegação; `api/client.ts:27-38` é transporte genérico; query keys em `hooks/useUsinas.ts:22,39,46` e `hooks/useOperacao.ts:56,83,94,118` não incluem identidade autorizada/snapshot.

Não foi realizado teste de segurança e não há base para afirmar vazamento atual apenas por isso. Antes de uso multi-cliente, backend deve autenticar/autorizar ativo/carteira/run/evento/export e isolar cache; conjunto público não autoriza acesso à SPE privada. Frontend deve refletir permissões, lidar com 401/403, invalidar cache na troca de sessão e evitar seleção persistida não autorizada. Não transportar segredo do fornecedor para o navegador.

**Aceite conjunto:** alterar URL/ID/filtro não obtém dado privado alheio; troca de usuário não reutiliza cache/draft anterior; exportação aplica mesma autorização. Filtro NE/eólica não é teste de isolamento.

## 3. O que já está coerente e deve ser preservado

- Demo tem aviso explícito de sintético, nenhum dado real e nenhum comando (`Cenario.tsx:203-207`), exibe método/seed (`:216-219`) e premissas (`:521-530`). Não foi identificada afirmação de ML nos alertas desta demo.
- Bateria da demo já declara “sem CAPEX — não é VPL nem payback” (`Cenario.tsx:269-274`).
- MW/MWh estão separados nos controles, fluxo da bateria e SOC (`Cenario.tsx:52-64,230-234,334-360`); Simulador calcula capacidade como potência × duração (`Simulador/index.tsx:191-203`). Não há motivo para converter esses campos novamente.
- `energia_kwh` em `Cenario.tsx:161-169` é nome interno incorreto para soma de potências, mas o uso em `:432` divide por número de amostras e por 1000 para mostrar potência média em MW. Não registrar como energia integrada errada: renomear a variável é melhoria P2, não alterar a média por duração indevidamente.
- `useOperacaoDemo` não faz polling por tick (`hooks/useOperacao.ts:35-45`); preservar carga única, sem transformar cenário em streaming atual.
- SCADA declara somente leitura (`Scada.tsx:247-250`), exibe selo quando sintético e diferencia status/qualidade. Nenhuma rota de comando a equipamento foi identificada nos wrappers lidos.
- Manutenção protege data recomendada nula e exibe sem janela; Gantt não desenha recomendação nula (`Manutencao.tsx:39-45`, `GanttManutencao.tsx:194-206`).
- Interfaces pendentes têm estado explícito e não inventam payload para substituir API ausente (`PendingEndpoint.tsx:25-68`). Ajustar detecção, não trocar por demo oculta.
- Resumo/ForecastPanel distingue linhas histórico/projeção e mostra método; Financeiro usa `DataQualityBanner` e evidence_score sem multiplicar novamente; Portfolio preserva nulos individuais.
- Dossiê pede revisão humana/jurídica, separa canais e só gera/exporta documentos, sem botão de protocolo automático (`Dossie/index.tsx:202,232,363-379`).
- Router separa área `/operacao` da área `/usinas/:id`; não há razão para declarar que esse desenho implementa autorização ou que há import inexistente apenas por busca sem resultados.

## 4. Ordem de ação e critérios de liberação

1. **Frontend, sem backend novo:** corrigir F01/F02/F03/F04/F05/F06/F07; rotular explicitamente recursos futuros e revisar copy F08/F09. Coordenar com o agente ativo: esta revisão não aplica patches.
2. **Congelamento de contrato:** resolver B02/B03 com tipos aditivos e fixtures declaradas; incluir resposta 422, nulos, origem/método, timezone, capabilities e snapshot. Não inventar endpoints de dados Databricks/AWS.
3. **Estado e robustez frontend:** F10/F11/F12/F13, revisão de autorização/cache conjunta B04.
4. **Validação futura após alterações:** testes de componentes/contrato e smoke read-only autorizados; nenhuma instalação/build foi feita por esta revisão.

Matriz mínima de aceite a executar pelo responsável pela implementação:

| Caso | Resultado exigido |
|---|---|
| Demo com carga e manutenção | Geração física, exportação, corte pré/pós BESS e indisponibilidade distintos |
| Starts nulos / timezone diferente | Sem data falsa; UTC−03 operacional consistente |
| API futura ausente / 404 recurso / 422 / 500 | Pendência, não encontrado e erro distinguidos; sem mock silencioso |
| PLD nulo / zero legítimo / lacuna | Desconhecido não vira zero; zero válido continua zero |
| SCADA em manutenção / sem leitura | Diferença não é automaticamente atribuída a restrição |
| BESS legado com payback numérico | Não apresenta viabilidade anual validada |
| Heurística / ML sem validação / replay | Método e limites explícitos, sem promessa de precisão/ganho observado |
| Troca usina/período durante mutation | Sem resultado/draft/export anterior sob novo contexto |
| Editar e exportar pleito | Artefato corresponde ao texto revisado, versão rastreável |
| Carteira parcialmente preenchida | Subtotal/cobertura/intervalo identificados |
| Acesso direto a ativo/export privado | Backend rejeita acesso não autorizado, independentemente do filtro |

**Conclusão:** o frontend já tem boas barreiras de simulação e indisponibilidade, mas ainda há incoerências concretas de rótulo físico, payback legado, nulos, proveniência/regulação e estado de documentos. Isso não demonstra que o backend futuro foi entregue nem que a aplicação controla ativos. A correção imediata é limitar e identificar corretamente as afirmações; os cálculos, qualidade canônica e autorização exigem os gates do roadmap.
