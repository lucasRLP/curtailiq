# Avaliação do plano de operação e da hipótese comercial CurtailIQ

## Parecer

Aprovar a direção M1 + M3 como hipótese de produto; NÃO aprovar ainda promessa de ganho financeiro, conformidade regulatória atualizada ou execução integral dos nove workstreams. Implementar uma prova de valor pequena antes da infraestrutura demonstrativa.

Escopo desta revisão: plano integral, especificação backend, modelo de negócio anterior, histórico recuperado e inspeção de domínio, elegibilidade, pleito, financeiro, ML e gerador local. Não houve consulta ao Postgres remoto, validação normativa atual em fonte oficial, entrevistas, reprodução de treino nem backtest de cliente. Afirmações de mercado, concorrentes, Portaria MME 140/2026, REN 1.162/2026 e prazos do edital permanecem informações do documento fornecido, não verificadas nesta revisão.

O plano original e os contratos da seção 4 foram preservados. As propostas abaixo precisam de aprovação antes de migrações/integrações. Nenhum commit, branch, tag ou PR foi criado.

## 1. O modelo de negócio que vale testar

### Posicionamento recomendado

“CurtailIQ ajuda geradoras eólicas a reduzir o custo das paradas planejadas em períodos de restrição e a conferir perdas e oportunidades de ressarcimento, com evidência auditável.”

Evitar “recupera o que o corte tirou”: nem toda perda é evitável, ressarcível ou recebível. Separar três livros de valor: energia adicional preservada pela decisão operacional; ressarcimento incremental comprovado; produtividade da equipe. Não somar valores brutos sobrepostos.

### Cliente, usuário e comprador (hipóteses para validar)

- Cliente inicial: geradora/gestora de ativos eólicos do Nordeste com corte recorrente, histórico de ordens de serviço e autonomia para reagendar parte da manutenção.
- Usuário: planejamento de O&M/PCM e engenharia de desempenho.
- Patrocinador/comprador provável: gestão de ativos ou diretoria de operações, com comercial/regulatório no módulo M1.
- OEM/prestador de manutenção: aprovador ou bloqueador do reagendamento; eventualmente canal, não presumir concorrente nem acesso irrestrito.
- ONS: interlocutor técnico para metodologia e dados, não cliente e não certificador de segurança de manutenção.

O cliente ideal não é simplesmente a usina com mais MWh cortados: é aquela com sobreposição entre corte previsível, manutenção flexível, janela de trabalho segura, ganho marginal relevante e autoridade de execução.

### Oferta inicial e cobrança

1. Diagnóstico/piloto de escopo fechado, preferencialmente pago: um parque, dados de exportação, reconciliação, baseline e teste retrospectivo.
2. Piloto prospectivo em modo recomendação: registrar recomendação, aceite/rejeição e execução; nenhuma escrita no controle.
3. Assinatura anual por parque/portfólio, com faixas de MW ou turbinas e implantação/integracão precificadas à parte.
4. Remuneração variável apenas se houver acordo prévio de medição e atribuição; para M1, sobre valor incremental efetivamente recebido, não sobre todo valor elegível estimado.

Não existe ticket validado nesta revisão. Não inventar preço para preencher pitch. O teto de disposição a pagar depende do benefício líquido conservador validado e o piso depende do custo de implantação/suporte. Se não houver intervalo economicamente viável entre os dois, o produto precisa mudar.

### Métrica econômica correta

Benefício incremental = custo do planejamento atual executável − custo da recomendação executável − custos adicionais de reagendamento, mobilização, horas extras, risco e eventual perda de compensação.

Corte ENE pode absorver custo energético da parada; isso não torna mão de obra, mobilização, risco ou trabalho em vento forte gratuitos. PLD é proxy de cenário, não automaticamente margem do gerador, preço de PPA ou valor de ressarcimento. O contrato comercial e quem recebe a compensação importam.

## 2. Correções conceituais prioritárias do plano

### 2.1 Referência regulatória não é comando de corte

A seção 0.3 simplifica a referência final como min(referência, disponibilidade). O próprio código documenta ajustes de tolerância e geração limitada versus verificada em `backend/app/domain/curtailment_events.py:151–170`. Não substituir essa metodologia pela simplificação.

A interação manutenção → referência → compensação é hipótese até validação aplicável ao ativo/regime. A penalidade `min(S,C) * duração * valor` é uma aproximação de cenário, não nova regra oficial. Não confundir frustração regulatória com folga operacional para desligar turbinas.

### 2.2 Condição física da fórmula de custo

`max(S-C,0)` mede perda incremental se o teto de exportação do parque não mudar e as turbinas remanescentes puderem produzir até esse teto. Comparar geração contrafactual sem manutenção com geração com manutenção sob o MESMO comando. Se cada turbina conservar limite proporcional fixo, se o operador recalcular o teto ou se houver restrição interna, a absorção pode ser menor.

Não usar automaticamente potência nominal da turbina como S: usar potência que estaria disponível no intervalo sem a tarefa. Tampouco usar diretamente referência final menos geração como C sem reconciliação operacional.

### 2.3 Previsão e causalidade

- `dsc_restricao` pode sustentar “equipamento mencionado no evento”, não prova isoladamente topologia, causalidade nem que todos os conjuntos estão fisicamente atrás do mesmo gargalo.
- Texto contendo vários equipamentos exige evitar dupla contagem de MWh; totais por menção não são necessariamente aditivos.
- Razão prevista não equivale à classificação ONS. Sobreoferta prevista não autoriza preencher elegibilidade oficial como ENE/false.
- Profundidade de corte deve ser definida como condicional à ocorrência se houver mistura p*custo_com_corte + (1-p)*custo_sem_corte. Multiplicar probabilidade outra vez numa magnitude incondicional subestima o corte.
- Um valor médio por janela não substitui curva por intervalo para checar sobreposição, duração e segurança.

### 2.4 Backtest

- Baseline deve incluir planejamento histórico real ou heurística realista de O&M/baixa geração. Comparar apenas com horário comercial arbitrário pode fabricar diferenciação.
- Mesmo período, mesmas tarefas, restrições e custos para todos os cenários.
- Walk-forward exige data/hora de emissão e disponibilidade dos dados; treino, imputação e calibração ficam no passado. Dados publicados/revisados posteriormente não podem aparecer retroativamente em D−1.
- Decidir com previsões disponíveis na época; avaliar todos os cronogramas com o mesmo cenário observado. Não comparar custo previsto de C contra custo realizado de A.
- Oráculo guloso não é teto matemático garantido. Rotular “heurística com informação perfeita”; preservar baseline como candidato/fallback se viável. Nem a gulosa garante B<=A sem essa proteção, nem B é ótimo global certificado.
- Trinta sementes medem variabilidade das ordens sintéticas, não incerteza de generalização entre parques ou anos. Reportar separadamente incerteza temporal, de previsão e das premissas.
- Não anualizar janela curta como receita anual comprovada. Não reportar (A-C)/(A-B) quando denominador não é positivo.
- Segurança e corretivas críticas são restrições duras; não mover corretiva urgente para obter economia.

### 2.5 Gêmeo digital e Kelmarsh

Kelmarsh serve para desenvolver leitores e estudar padrões, não prova transferibilidade de frequência/duração para OEMs e condições brasileiras. Evento de parada não necessariamente revela a tarefa, criticidade ou flexibilidade. Não inventar três classes se as mensagens não as suportarem. Validar a fonte e os arquivos antes de parser/download volumoso.

Reescalar um gêmeo para ONS é calibração, não validação independente. Não usar um gêmeo gerado com informação futura para provar previsão D−1. Distribuição sintética por turbina não é evidência de falha de turbina real.

## 3. Estado encontrado no código

| Área | Evidência | Consequência |
|---|---|---|
| Fórmula/eventização | `domain/curtailment_events.py` usa diferença referência final − geração, com fallback identificado e agregação em eventos | Reaproveitar, sem reimplementar COFF no M3 |
| CNF | `engine/elegibilidade.py:75–113` recebe data mas não a aplica | Canal do Termo não está temporalmente protegido |
| Origem ausente | `services/pleito_service.py:109` e `engine/elegibilidade.py:77` assumem SIS | Pode promover dado incompleto a elegível |
| Franquia | `services/pleito_service.py:67,80–81,144` calcula sobre janela consultada | Necessário acumulado correto por ano e escopo normativo |
| Dossiê | `services/pleito_service.py:128–130` preenche gerações com zero | Evidência inconsistente mesmo quando há energia no evento |
| Financeiro | `services/financeiro_service.py:134` chama `FinanceiroPolicy.is_elegivel`, inexistente | 17 falhas reproduzidas na suíte legada |
| ML | `ml/features.py:29–33,45–49,65–69,98–145` usa variáveis contemporâneas no treino, medianas globais e outro fallback na inferência | Não sustenta por si só previsão operacional D−1; rolling conta linhas, não horas |
| Demo | `scripts/build_local_demo_samples.py:197–224` usa referência simples e marca oficial | Corrigir procedência antes de apresentar valores como oficiais |
| Demo monetária/clima | `scripts/build_local_demo_samples.py` gera `pld_demo` e clima por fórmulas | Resultados monetários locais são cenários, não prova de perda real |

O histórico anterior traz números de demonstração; eles não foram promovidos a evidência financeira nesta avaliação. A ausência de consultas remotas impede afirmar disponibilidade ou frescor atual do DW.

## 4. Contratos que precisam ser discutidos antes de congelar

Sem alteração aplicada nesta entrega:

- Identidade: `plant_id` ONS não corresponde automaticamente aos IDs `dw_*`/`sk_usina` atuais. Precisamos bridge explícita conjunto ↔ usina ↔ turbina e vigência, sem match silencioso por nome.
- Previsões: emissão (`issued_at`), dados disponíveis até (`as_of`), versão e natureza condicional da magnitude; separar observação de revisão posterior.
- Elegibilidade: estado desconhecido/revisão não cabe com segurança em bool obrigatório sem metadados; bloquear decisão ou representar os cenários explicitamente.
- Proveniência: `is_simulated` deve acompanhar dados derivados, preços e outputs, não apenas SCADA. O motor puro desta entrega não grava dados nem atribui proveniência; a futura camada de serviço deverá fazê-lo.
- `schedule_run` não tem contrato detalhado no plano: faltam versão de política, instantâneo de inputs, baseline, status de viabilidade e ordens não alocadas.
- TimescaleDB e escrita em ops não são requisitos da primeira prova econômica.
- Segurança: limites OEM por tarefa, rajadas, acesso, raios e disponibilidade de equipes precisam ser fornecidos; um único limite de vento provisório não autoriza manutenção.
- Pacotes: existe `app/config.py`; evitar criar `app/config/__init__.py` que possa sombrear o módulo. `app/engine` legado é singular, mas WS5 especifica `app/engines`; nenhuma migração automática foi feita.

## 5. Sequência recomendada e critérios de decisão

### Primeiro: rigor e validação comercial em paralelo

1. Corrigir falhas legadas de execução e pendências de M1 em workstream próprio, com validação normativa oficial antes de alterar regime/prazos.
2. Separar claramente demo híbrida de cálculo oficial; nenhum CSV simulado entra como prova comercial.
3. Antecipar entrevistas O&M/OEM e acesso a ordens de serviço. Não esperar terminar SCADA para descobrir que não se pode mover tarefas.
4. Levantar quem já agenda por baixa produção e qual parte do problema sobra para CurtailIQ.

### Depois: menor prova de valor

1. Motor de custo por intervalo (iniciado nesta entrega).
2. Ordens + séries via CSV, validação dos contratos e política de segurança; sem OPC UA no caminho crítico.
3. Agendador determinístico com tarefas simultâneas, candidato baseline e explicação da decisão; nenhuma execução automática.
4. Replay/backtest com baseline justo, oráculo rotulado corretamente e cenário de previsão point-in-time. Sem previsão historicamente disponível, publicar só estudo retrospectivo de oportunidade, não “ganho realista do produto”.
5. Tela simples de original versus recomendado e premissas. OPC UA/gêmeo como demonstração complementar; detector de falhas e BESS depois.

### Gates comerciais a preencher ANTES de ver a economia

- Responsável de O&M confirma tarefas realmente flexíveis e autoridade de reagendamento.
- Cliente disponibiliza os dados mínimos e aceita protocolo de medição.
- Time define economia líquida mínima, custo máximo de implantação, orçamento do piloto e preço-alvo de assinatura.
- Ganho incremental supera o planejamento por baixa geração e os custos adicionais em cenários conservadores, não apenas no oráculo.
- Há aceite/rejeição rastreável no piloto e evidência de disposição a pagar.

Se não houver flexibilidade, M3 não é núcleo. Se houver flexibilidade mas benefício líquido pequeno, M3 vira complemento. Isso não justifica automaticamente migrar para BESS: bateria tem outra compra, integração e economia, que também precisam ser validadas.

## 6. Entrega técnica e limites

Implementado `backend/app/engines/maintenance_cost.py`:

- custo de energia incremental por intervalo;
- penalidade hipotética de ressarcimento separada;
- mistura probabilística de cenários;
- custo marginal considerando tarefas já alocadas;
- rejeição de dados ausentes/não finitos, limites físicos inválidos e elegibilidade desconhecida no cenário com penalidade;
- resultado marcado como `estimativa_cenario`.

Todos os parâmetros econômicos/operacionais são entradas explícitas, sem defaults regulatórios fixados no motor. O loader YAML, elegibilidade M1, agenda, API, banco, interface e backtest não foram implementados nesta etapa. Não há economia de cliente medida.

TDD executado: 34 falhas esperadas por módulo ausente antes da implementação; depois 34 testes novos passaram. Um erro inicial de localização do arquivo foi corrigido antes do RED válido, sem apagar a árvore duplicada preexistente.

Regressão: suíte completa resultou em 78 passed, 17 failed, 1 skipped, 15 subtests passed; removendo apenas os novos testes da coleta, 44 passed, as mesmas 17 failed, 1 skipped e 15 subtests passed. As falhas são `AttributeError: FinanceiroPolicy has no attribute is_elegivel`; há também warning de depreciação do TestClient/httpx. Permanecem registradas, não mascaradas nem corrigidas incidentalmente no WS5.
