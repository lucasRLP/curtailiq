## Página 1
PESQUISA-PRODUTO-CURTAILMENT
Li a wikitica e o projeto do hackathon ( hackaton-coppe-ia-11092026 , com o brainstorm do
CurtailLess, o wireframe e o app em curtailless-frontend ). Respondo com o que temos, e separo
o que é dúvida.
Estado atual, verificado agora
1. SCADA e integração de dados da usina com o ONS
Não está coberto em lugar nenhum. A palavra SCADA aparece zero vezes na wikitica inteira e nas
cinco transcrições das lives. Não há página, não há fonte, não há hipótese registrada. É a maior
lacuna da sua lista.
O que existe de âncora e serve de base, em vez de SCADA:
O que existe
Onde está
Consequência
val_geracao vem do sistema de 
supervisão do ONS, não do medidor da 
usina
RO-AO.BR.13 §3, em 
topics/data/apuracao-de-
constrained-off-pelo-ons
existe supervisão, 
mas o dado é do 
ONS
A usina envia disponibilidade e 
vento/irradiância ao ONS, e quem não 
envia sai do rateio
itens 4.12, 5.2.2.5, 5.2.2.11
existe um canal 
usina → ONS, e ele 
é regulatório
Dado congelado por 6 min ou fora do SM 
2.12 é inválido; substituição pelo SAGER 
exige valor "fidedigno, sem manipulação"
itens 3.18, 4.4, 5.2.2.6
existe regra de 
qualidade, e ela é 
auditável
flg_dadoventoinvalido na base de 
detalhamento
base eólica detail
a qualidade do dado 
do cliente é dado 
público
"usinas não supervisionadas, tipo 3"
fala do ONS no dia 2
existe eixo formal 
supervisionada / não 
supervisionada
O produto desenhado é o CurtailLess, evolução do CurtailIQ do EnergINNthon. Duas camadas de
tempo longas na demo (estrutural de 12 meses, operacional de 7 a 30 dias), carteira de clientes
como porta de entrada, ranking de criticidade, mapa, grafo de cinco nós e simulador BESS.
A demo lê o MCP do ONS de verdade, não fixture inventada. Granularidade de tudo que está na
tela é conjunto, não usina.
Três camadas de tempo já nomeadas no brainstorm: decisão (24 a 48 h), apuração (90 dias),
estrutural (12 meses). A de decisão é a única ausente.
Páginas que sustentam isto: topics/data/apuracao-de-constrained-off-pelo-ons,
topics/data/constrained-off-classificacao-e-ressarcimento, topics/data/dados-tratados-de-
constrained-off-do-hackathon, topics/ml/previsao-de-risco-de-curtailment, topics/stats/economia-
de-bess-para-curtailment.


## Página 2
Leitura para o produto: a "integração com o ONS" que existe hoje é um canal regulado de envio de
disponibilidade e vento, com validação e prazo, e não uma API que a usina possa chamar para
alimentar um SaaS. Tratar SCADA como feature de hackathon é vender o que não se prova em três
dias. O caminho honesto é o que o brainstorm já declara: dado privado entra por upload e conector, e
a demonstração usa perfil sintético declarado. Ver topics/data/dados-abertos-ons para o que é público
de fato.
2. Simular dados da usina
Sim, e melhor do que você imagina: não precisa inventar.
A base de detalhamento traz, por usina individual, vento verificado e sua qualidade na eólica,
irradiância verificada e sua qualidade na fotovoltaica, mais geração estimada e verificada, em 30
minutos, de 01/2023 ou 04/2024 até 31/08/2026. São 1.060 IDs na eólica e 560 na fotovoltaica
(topics/data/dados-tratados-de-constrained-off-do-hackathon).
Ou seja: dá para montar um "gêmeo sintético" de uma usina real com a forma semi-horária
verdadeira dela, e declarar que os campos que faltam (PLD horário, contrato, garantia física,
parâmetros de BESS, tags de comando do SCADA) são premissas. É muito mais forte na banca do
que um dataset inventado, e atende à quarta condição do caderno, que exige limitação declarada.
O que você teria de declarar como sintético, campo por campo: PLD, disponibilidade contratual,
comandos de teto, estado de bateria.
3. Uma view para o consultor e outra para o cliente
Já existe a metade disso. A demo tem SeletorCliente no topo, a página Carteira como porta de
entrada, comparação entre clientes e o selo de isolamento. O estado já vive na URL, então
acrescentar perfil=consultor|cliente é barato.
O ponto que decide, e que você deve resolver antes de construir: se as duas views só filtram, não
são duas personas, são um filtro. A distinção que se sustenta:
Consultor
Cliente (usina)
Escopo
carteira inteira, comparação
as minhas usinas
Janela padrão
12 meses
90 dias mais as próximas 48 h
Pergunta
quem é outlier, o que vendo 
ao cliente
o que eu perdi, o que ainda dá 
tempo, o que faço
Métrica que decide
fatia pleiteável e preço da 
plataforma
fatia pleiteável, franquia e canal da 
minha usina
O que ele não consegue 
fazer sozinho
comparar clientes na mesma 
janela
enxergar a razão regulatória e o 
prazo


## Página 3
Dois cuidados. Primeiro, a demo hoje não tem código de razão na base solar publicada: uma view
de cliente solar mostraria "em aberto" na fatia pleiteável, o que enfraquece justamente a tela que o
cliente vê. Segundo, o brainstorm já registra que multi-tenant de verdade é pós-evento, e a tela
declara isso.
4. Estrutural e operacional, curto e longo prazo
Você está certo, e o desenho já tem os nomes: são três relógios, não dois. O erro a evitar está
escrito no brainstorm §14.3 e é exatamente misturá-los num número só.
Camada
Prazo
Pergunta
Existe?
Decisão
24 a 48 h
o que fazer antes do corte
não
Apuração
90 dias
quanto é devido, como provar
sim, no modo operacional
Estrutural
12 meses
onde investir
sim, no modo estrutural
O seu "operacional de curto e longo prazo" é a camada de decisão mais a de apuração dentro da
mesma view. Concordo que sirva aos dois, mas com cronômetros separados na tela: uma tira
"próximas 48 h" (risco, despacho, bateria) e uma fila "apuração e pleito" (evento, canal, prazo,
franquia). O que não muda entre as duas views é base, fórmula e critério.
A observação que vale levar ao time: hoje a camada de decisão é a única ausente, e ela depende de
dado privado, então "curto prazo" e "dado da usina" são um item só de prioridade, não dois.
5. Conjunto com várias empresas, usina individual, mais granular
Esta é a mais concreta, e a wiki tem o caminho.
Fato verificado na demo: a base chamada "por usina" ( restricao_coff_eolica_usi ) é, na prática,
por conjunto. O id_ons vem CJU_BABAB , o nom_usina vem "CONJ. ARAÇÁS" e o ceg vem "-".
São 180 IDs na eólica, 87 na solar, 265 na integrada. O dado por usina individual mora na base de
detalhamento: id_ons = MAEDT1 , nom_usina = "Delta 3 I", nom_conjuntousina = "Conj. Paulino
Neves".
Então a granularidade que você quer existe e é maior do que o produto supõe. Faltam duas peças:
E o seu ponto, "o conjunto pode ser de várias empresas", levanta uma pergunta que a wiki não
responde. O que ela sabe é que há dois donos em camadas: a subestação onde o conjunto se
conecta costuma ser da SPE do próprio gerador, e as linhas de 500 kV que saem dela são de
1. usina_conjunto é o cadastro que liga usina a conjunto, com CEG e vigência. É estático e pode
não casar com o snapshot, que é o risco declarado na tabela de dependências.
2. A razão é do conjunto, não da usina. cod_razaorestricao e cod_origemrestricao existem
só no agregado por conjunto (e só na eólica). O detalhamento por usina tem física e nada de
classificação.


## Página 4
transmissoras (Gilbués II tem linha da JALAPÃO com 3.375 MVA e da ARGO VII com 3.420 MVA). Se
um mesmo conjunto agrega usinas de SPEs diferentes, a alocação da razão deixa de ser só
estimativa técnica e vira problema comercial: não se entrega a razão de um dono para o outro.
O caminho defensável para alocar: proporcional à capacidade instalada, que é o próprio critério da
norma para ratear a Geração de Referência Final entre usinas adimplentes (item 5.2.2.11). Alocar
assim tem âncora normativa, e a tela diz "alocação estimada declarada", nunca "classificação oficial".
6. Prever risco de curtailment e decidir quando desligar
A wiki tem o erro exato a evitar, e ele é o maior ativo de credibilidade do time. O artefato do CurtailIQ
tinha AUC 0,9804 em 151.606 linhas, e não é capacidade de previsão: geracao_mwh e
fator_capacidade do mesmo intervalo entravam como features, e a geração verificada cai porque
houve corte. O modelo aprendeu a consequência do evento. Só mm_corte_3h e mm_corte_24h
estavam defasadas. E o MAE de 4,27 MWh contra um limiar de 1 MWh erra a magnitude, que é o que
dimensiona bateria. Ver topics/ml/previsao-de-risco-de-curtailment.
Regras que ficam escritas, se você for prever:
Sobre "entender quando desligar a geração da usina": isto precisa de cuidado, e eu marco como
inferência minha. Sob constrained-off quem manda reduzir é o ONS, a usina não escolhe cortar. As
decisões que são de fato da usina são outras: (a) agendar manutenção e indisponibilidade nas
janelas de corte provável, porque é onde o custo de oportunidade é menor; (b) carregar ou
descarregar bateria em torno da janela; (c) contestar no SAGER dentro de 3 dias úteis; (d) com PLD
negativo, não gerar é a decisão correta. Enquadrar o produto como "quando custa menos estar
indisponível" é defensável; "escolher cortar" não é. Confirme com o especialista temático.
7. Simulador financeiro e BESS por usina
Existe na demo, e não por usina: as escalas são frota eólica nacional, frota do RN e Conj. Serra do
Mel A, com granularidade mensal. O próprio código declara que a série semi-horária da usina é o
dado privado que falta.
Três coisas que mudam a sua decisão, todas do que já está medido:
Entradas permitidas: previsão aberta de vento e irradiância, hora, dia da semana, subsistema,
geração programada do DESSEM ( programacao_x_previsao ), histórico de corte com
shift(1) , fator-capacidade-2 .
Entradas proibidas: geração verificada, disponibilidade e fator de capacidade do intervalo a
prever.
Rótulo: vem de max(G_ref_Final − geração verificada, 0) × 0,5 , que só existe depois
do fato, chega até 15h do dia seguinte e é revisável por 90 dias. O pipeline de treino não pode ler
o rótulo de hoje.
Avaliação: separação temporal, horizonte declarado ao lado do número, comparação obrigatória
com um baseline burro. Se o baseline empatar, isso é resultado e o valor migra para a explicação.


## Página 5
E o que você propôs como alternativa, inferir pelo potencial de geração, funciona e é direto:
val_geracaoreferencia existe por usina, e o "% do potencial restringido" é a medida honesta de
"quais usinas precisam ser cortadas", alinhada ao critério da própria norma. A ressalva é que
val_geracaoreferenciafinal é nulo em 66,7% dos registros, então a referência bruta é o caminho.
As três perguntas que decidem, nesta ordem, e que têm de ser respondidas por usina: quanto do
corte é ressarcível, se cruza a franquia anual, e qual é a distribuição temporal. Se a primeira falhar, o
resto é irrelevante.
8. Notificação a partir da previsão e reports
Separe em dois, porque um é seguro e o outro não.
Notificação factual, dá para fazer hoje: evento novo publicado, prazo de 3 dias úteis vencendo, 90
dias de revisão se aproximando, franquia do ano estourando, usina com razão não caracterizada que
precisa de revisão humana. Nada disso depende de modelo, e é o que o cliente realmente quer no
celular.
Notificação preditiva, só depois da validação defasada. Enquanto a previsão não passar pela
regra da seção 6, notificar a partir dela é prometer o que não se sustenta, e o MAE de 4,27 MWh
contra limiar de 1 MWh mostra o tamanho do problema.
Report diário tem cadência natural na norma: o ONS publica o dado do dia anterior até 15h. Um
diário às 15h não é invenção de produto, é o relógio do ONS. Semanal e mensal já estão desenhados,
em três níveis (frase, cartão de cinco linhas, aba com SQL, premissas, franquia usada, norma citada e
limitações). O piso determinístico funciona com a chave do agente desligada.
9. O que a usina precisa saber num relatório
Na ordem em que o cliente lê:
1. Por usina é a granularidade certa, e o estudo medido é co-localizado por usina. Ir para o nível da
usina não fura a conclusão, ele a torna atribuível.
2. A conta não vai fechar melhor por usina. O achado do módulo é que o payback é invariante à
escala, porque depende de capex e ciclos, e não do tamanho do corte. Co-localizado dá 40 anos
só com capital e 70 com manutenção, contra 10 de vida útil. O critério mais generoso, dimensionar
para não perder nada, pede 3.138 GWh de bateria e R$ 339 bilhões. Ver topics/stats/economia-
de-bess-para-curtailment.
3. Para dimensionar de verdade, mensal não basta. Precisa da semi-horária da usina, e ela é
pública para as 1.060 usinas da base eólica de detalhamento. Isso é uma descoberta que vale
explorar antes de dizer que o dado é privado.
1. Quanto perdi, em GWh, e em qual janela.
2. Por qual razão (REL, CNF, ENE, PAR) e com que origem (LOC, SIS), junto com a cobertura
dessa classificação. Sem a cobertura, o número parece certo e não é: a base não caracteriza a


## Página 6
Dúvidas que precisam ser pesquisadas
A) Pesquisa externa, que dá resultado sozinha
B) Perguntar à organização ou ao Elias, não é web
razão em 19% da energia eólica da janela, chegando a 26% em junho de 2026.
3. Quanto disso é pleiteável, em faixa de valor pelo PLD, com as premissas à vista.
4. A franquia anual: consumida contra restante. Sem isso o pleito é um número sem piso.
5. Canal, prazo e quem assina: 3 dias úteis no SAGER, 90 dias para revisão por Protocolo ONS no
SINtegre, Celebra para CNF dentro da janela da Lei 15.269/2025. E, quando não existe canal,
dizer que não existe.
6. O que ainda dá tempo e o que já venceu.
7. Se a usina está adimplente no envio de dados. Se não estiver, ela está fora do rateio da
referência final, e nenhum pleito anda antes de regularizar. Este item é pré-requisito e costuma
faltar.
8. Tendência: está piorando ou melhorando.
9. O que não é acionável: ENE não tem canal, MMGD não é restringível, mais linha não resolve o
excedente, o valor pode ser republicado por 90 dias.
10. Comparação com a frota. Esta é a parte que só o consultor entrega, e é o que justifica assinatura
de plataforma: uma usina sozinha não sabe se é outlier.
1. SCADA de usina eólica e solar no Brasil: quais tags e protocolos (IEC 61850, DNP3, Modbus,
OPC-UA), e se existe padrão de entrega ao ONS. É o buraco maior.
2. Como o ONS recebe dado do agente hoje: SAGER, formato, prazos, e se há endpoint. E o que é
formalmente "usina não supervisionada tipo 3".
3. usina_conjunto : se um conjunto pode agregar usinas de SPEs diferentes. É a sua observação,
e a wiki não cobre.
4. Se a base tratada do evento tem cod_razaorestricao na fotovoltaica, e se usina_conjunto
casa com os cinco Parquet.
5. PLD horário da CCEE: acesso, formato, licença, e a regra de de-para semi-hora para hora.
6. Previsão aberta de vento e irradiância (Open-Meteo, ERA5) por coordenada de usina: resolução
e latência.
7. Franquia anual vigente de 2026 por fonte: as fontes divergem entre 70 h e 78 a 82 h eólica, 30,5
a 41 h solar.
8. Rate limit do MCP para o volume de um painel, e licença Apache 2.0 para reusar os contratos
ODCS.
1. Se a razão é por usina ou por conjunto. É a divergência registrada no brainstorm §2.5 e é a
decisão que mais afeta o produto inteiro.
2. Os nomes e IDs das seis bases de apuração.
3. A pergunta de solar com armazenamento que ficou sem resposta na live.
4. Se existe dado de tempo real ou telemetria acessível ao time.


## Página 7
C) Inferências minhas que precisam do especialista temático
Um alerta de posicionamento, porque você está mexendo na persona: a decisão do brainstorm §11.5
foi consultoria como usuária e compradora, ONS como referência de correção, gerador e
transmissor como clientes finais. Se você sobe a usina a "cliente", mantenha o ONS declarado
como referência de correção. A regra geral da ANEEL segue não publicada e 65,5% dos cortes do
primeiro semestre de 2026 não eram compensáveis, então um produto que só promete pleito vive no
fio, e o valor real dele está em prevenção, operação e decisão estrutural.
Resultados da pesquisa externa — rodada 1 (16/09/2026)
Oito investigações paralelas, uma por item da lista A acima, cada uma com fonte primária obrigatória e
com a instrução explícita de declarar o que não conseguiu confirmar. Depois eu reproduzi por conta
própria os quatro pontos que mais mexem em decisão, e dois deles corrigiram afirmações deste
próprio documento.
Os oito relatórios
#
Relatório
Cobre
1
pesquisa/01-scada-usina-eolica-
solar.md
SCADA, protocolos, tags obrigatórios e a 
interface normativa com o ONS
2
pesquisa/02-ons-recepcao-dados-
agente.md
Supervisão e SAGER, prazos, sanção 
silenciosa, Tipo III
3
pesquisa/03-usina-conjunto-
granularidade.md
usina_conjunto , cardinalidade e titularidade 
dos conjuntos
4
pesquisa/04-razao-fotovoltaica-e-
snapshot.md
Razão de restrição na solar e a armadilha do 
catálogo do MCP
5
pesquisa/05-pld-ccee.md
PLD horário, licença, latência e a regra oficial 
de conversão
6
pesquisa/06-previsao-vento-
irradiancia-aberta.md
Fontes abertas de previsão, e o que é reanálise
7
pesquisa/07-franquia-anual-
horas.md
Franquia anual de horas indisponíveis, piso 
legal e valor vigente
8
pesquisa/08-mcp-ons-limites-
licenca.md
Licença, limites operacionais e contribuição no 
MCP do ONS
Verificações que eu reproduzi
1. "Quando desligar" = minimizar o custo de estar indisponível (manutenção planejada na janela
de corte provável), e não escolher cortar.
2. Alocação da razão do conjunto para a usina proporcional à capacidade instalada, ancorada
no item 5.2.2.11.


## Página 8
Não vale como fato o que só o subagente afirmou. Estes quatro eu rodei:
Verificação
Resultado
A solar publica 
cod_razaorestricao ?
Sim. ENE 502.037, CNF 168.285, REL 50.539 linhas em 
restricao_coff_fotovoltaica_tm , sobre 2,9 milhões de linhas
Fronteira de tamanho do 
corpo no MCP
8.188 B e 8.190 B → HTTP 200; 8.192 B e 8.200 B → HTTP 403 do 
CloudFront. Limite exato
Conjunto com vários 
donos é exceção?
Não, é regra. 241 conjuntos ativos, 195 (80,9%) com mais de um 
agente proprietário, máximo de 40. Conj. Campo Largo 230kV 
tem 40, Curral Novo do Piauí II tem 31, Janaúba tem 27
A solar é publicada por 
usina?
Não. 2.914.128 linhas, 94,1% com prefixo CJU e ceg ausente 
(amostra `CJU_BABJL
1. SCADA e a interface normativa com o ONS
O ONS só admite dois protocolos de telemetria de usina: IEC 60870-5-104 e DNP3 V3.0 sobre
TCP/IP (RO-SC.BR.02 Rev.04). Entre centros vale ICCP-TASE.2 e, para WAMS, IEEE C37.118.2.
Legados: CONITEL 3200, IEC 60870-5-101 e DNP3 seriais.
IEC 61850 não está no elenco do ONS. Ele vive dentro da instalação, com os IEDs da subestação
coletora, e é a base do IEC 61400-25 na eólica, cujos mapeamentos convergem para 104 ou DNP3.
No campo, Modbus TCP predomina nos inversores fotovoltaicos. O que o integrador usa dentro
da planta não é o que o ONS aceita na saída.
O SM 2.12 seção 8 fixa os tags obrigatórios:
Fonte
Tags
Eólica
velocidade e direção do vento, pressão atmosférica, temperatura
Fotovoltaica
GHI, irradiância no plano frontal (acompanhando seguidores), irradiância traseira em 
bifaciais, temperatura de módulo e do ar
Ambas
disponibilidade em MW por grupo de máquinas
E fixa requisitos duros de cadência e qualidade: 2 s de aquisição no CAG, 4 s (às vezes 6 s) na
supervisão tradicional, idade do dado menor que varredura mais 2 ou 4 s, transmissão por exceção
com idade menor que 8 s, banda morta inicial de 0,1% do fundo de escala, integridade de até 30 min,
exatidão de 1% em tensão e 2% nas demais, e DRSC/QRSC de no mínimo 97,5% mensal. Os dados
devem chegar crus, sem filtragem, cálculo, estimador de estado ou entrada manual, e a única
exceção explícita é a disponibilidade.
Dois achados que mudam o produto:
O comando de curtailment não chega como setpoint SCADA. O Gerdin calcula e o limite é
entregue ao agente por mensagem da aplicação SINapse, e o relógio da apuração é "o horário de
confirmação de recebimento da mensagem no SINapse pelo Agente Operador" (NT-ONS DOP


## Página 9
0022/2025, item 7.1). Ou seja, o evento tem um instante oficial de notificação, e ele não é a queda da
geração.
Seis minutos congelados dentro do patamar semi-horário zeram a geração de referência da
usina e a excluem do rateio do conjunto (NT DOP 0022/2025, item 7.2). Um problema de CLP vira
perda de receita.
Não existe API pública de telemetria de usina. O mais próximo é geracao-usina-2 (horária) e os
restricao_coff_*_intrasemihora (semi-horária por usina). disponibilidade_usina cobre
apenas hidráulicas e térmicas.
2. Como o ONS recebe dados do agente
São dois canais, e só um é do agente.
Canal 1, tempo real. O sistema de supervisão do ONS. E aqui o dicionário oficial diz literalmente que
val_disponibilidade "é recebido pelo ONS pelo sistema SCADA e pode ser alterado pelo agente
em ambiente de pós-operação".
Canal 2, pós-operação. O SAGER, módulo de Apuração de Renováveis (RO-AO.BR.13 item 4.16),
onde o agente consiste ou contesta em 3 dias úteis e pede substituição de dado. Não existe API,
esquema de payload, manual ou portal público desse módulo: o acesso é por
sintegre.ons.org.br , com SSO corporativo, restrito a agente credenciado. Os únicos manuais
públicos de apuração são do SAMUG-WEB e do SAGIC-WEB, e o SAGIC é de térmicas.
A sanção por descumprimento é silenciosa e financeira. O item 3.18 define dado inválido como
congelado por 6 minutos consecutivos no mesmo patamar ou fora dos critérios do SM 2.12; a
tolerância de envio está no item 5.2.2.4 (até 6 minutos corridos por semi-hora); e o efeito vem em
cascata: o 4.12 tira do rateio as inadimplentes, o 5.2.2.1 só calcula a referência final para adimplentes,
o 5.2.2.5 desconsidera a parcela da usina que falhou acima da tolerância, e o 5.2.2.11 rateia por
capacidade instalada só entre adimplentes. Nada avisa a usina: ela simplesmente deixa de
receber.
Duas correções ao material interno: o encadeamento normativo correto é 5.2.2.4 → 5.2.2.5 (a
tolerância define o que é falha), e flg_dadoventoinvalido existe só no detalhamento eólico, não
no fotovoltaico.
Sobre "usina não supervisionada tipo 3", a linguagem do nosso material está errada. A REN
ANEEL 1.030/2022 tem zero ocorrências de "Tipo III", "tipo 3", "modalidade de operação" e "não
supervisionada". A categoria formal é Tipo III, do SM 7.2, item 1.2.5: usinas conectadas fora da Rede
Básica que não causam impactos eletroenergéticos ao SIN, sem programação e sem despacho
centralizados, e portanto sem relacionamento operacional com o ONS. Eólica e fotovoltaica são
enquadradas como Tipo II-B pelo item 1.2.4.1(b)(2). O termo "não supervisionada" não tem definição
regulatória em fonte nenhuma; a categoria equivalente nos Procedimentos de Rede é Rede de
Supervisão (SM 2.1, item 3.3.1).
3. usina_conjunto e a granularidade
A resposta à sua pergunta é sim, e é a regra. 195 dos 241 conjuntos ativos (80,9%) agregam mais
de um agente proprietário, com média de 5,68 e máximo de 40. Caso com grupos econômicos


## Página 10
distintos comprovados: CJU_RN5ESMA ( Conj. Serra do Mel A ) reúne SPEs da Copel e da Voltalia.
A ressalva importa e o subagente não a fez. A medição é por SPE ( nom_agenteproprietario no
cadastro capacidade-geracao ), e o cadastro nunca nomeia o grupo controlador. Janaúba I a
XX mais Irapuru são 27 SPEs que provavelmente são do mesmo grupo. A frase defensável no pitch
é "o conjunto agrega múltiplas SPEs em 80,9% dos casos, com caso confirmado de grupos
econômicos distintos", e não "o conjunto agrega concorrentes". O cruzamento com SIGA/CNPJ da
ANEEL é o que falta.
A definição do ONS fecha o porquê: conjunto é definido por injeção de potência significativa em
uma determinada subestação do SIN ou em um ponto de conexão compartilhado, critério
elétrico, não societário, e o SM 26.2 §6.1.3 exige que o grupo de usinas eleja um representante
perante o ONS.
Estrutura exata do cadastro (confirmada por mim):
Campo
Nota
id_subsistema , nom_subsistema , estad_id , 
nom_estado , id_tipousina , nom_tipousina
contexto
id_conjuntousina , id_ons_conjunto , 
id_ons_usina , nom_conjunto , nom_usina
chaves do relacionamento
ceg
preenchido em 2.142 de 2.143 linhas, 
contra - em 92,5% das linhas de 
constrained-off eólico
dat_iniciorelacionamento , 
dat_fimrelacionamento
vigência, com 402 relacionamentos já 
encerrados
Números: 304 conjuntos, 1.749 usinas, 2.143 linhas, e 299 usinas aparecem em mais de um
conjunto ( Campo Largo I em cinco).
Três armadilhas do cadastro de rede, todas medidas:
4. A razão na solar existe, e a demo leu o dataset errado
Este é o achado de maior impacto no produto. O dataset clássico restricao_coff_fotovoltaica
(fonte real restricao_coff_fotovoltaica_tm/ ) publica cod_razaorestricao e
cod_origemrestricao , exatamente como o eólico. A consequência:
O que este documento afirmava
O que é de fato
A base solar não traz código de razão
Traz: ENE, CNF e REL
A capacidade operativa das linhas está em ampère, não em MVA. São 14 colunas
val_capacoper* . Tratar como MVA erra por ordem de grandeza.
subestacao é grão por barra, então precisa deduplicar por id_subestacao , e não traz MVA.
id_ons não é chave estável: BACLAX , BACLA2X e CJU_BA4ECLA são três ids distintos para o
mesmo Conj. Campo Largo .


## Página 11
O que este documento afirmava
O que é de fato
Por isso o ponto solar é quadrado no mapa
O quadrado era artefato de ler o dataset errado
A fatia pleiteável do cliente solar fica "em aberto"
É calculável, como na eólica
A causa do erro está localizada: o contrato ODCS do MCP projeta restricao_coff_fotovoltaica
para restricao_coff_fotovoltaica_detail_tm , que só tem nom_modalidadeoperacao . Quem
consulta pelo catálogo do MCP vê modalidade; quem lê o Parquet _tm vê razão. Divisão real das
duas taxonomias:
Isso vale para eólica e para solar. E não existe mapeamento oficial entre as duas taxonomias:
nenhum dicionário ou contrato dá o cruzamento.
Razão e origem vêm nulas quando não há limitação no patamar, o que é cerca de 78% das linhas
eólicas e 75% das fotovoltaicas. Na solar são duas representações distintas de vazio: nulo verdadeiro
em 55,2% e string vazia em 20,0%.
Armadilha nova, encontrada na minha verificação: os Parquet mensais da base solar têm schema
inconsistente entre arquivos ( nom_pontoconexao existe em 2024_04 e não em 2024_05). O glob
ingênuo quebra com schema mismatch ; é preciso union_by_name=true no DuckDB.
5. O de-para semi-hora para hora não é escolha nossa, é norma
Este documento tratava a conversão como "escolha de negócio, não um join neutro". Existe regra
oficial. As Regras de Comercialização da CCEE, Caderno 00, Preço de Liquidação das Diferenças,
v2026.1.0 (REN ANEEL 1.146/2025), item 10, definem que o CMO na base horária é obtido pela
média horária dos CMOs semi-horários dos decks do DESSEM:
Como as duas janelas têm 30 minutos cada, média simples e média ponderada pelo tempo coincidem.
O PLD deriva do CMO horário, logo a ponte com o semi-horário se faz no CMO.
E o precedente de valoração é claro: o Módulo 09, Encargos, calcula o encargo por restrição de
operação por constrained-off "para cada período de comercialização" (a hora), valorado pelo PLD
horário; e a metodologia provisória do constrained-off solar (Despacho ANEEL 1.668/2022) calcula
energia como potência vezes horas de restrição, reconhecendo literalmente que a restrição "pode ser
menor que um período de comercialização de uma hora". Agregue energia pela duração e valorize
a energia horária pelo PLD da hora.
Obtenção: dadosabertos.ccee.org.br/dataset/pld_horario , CSV com separador ; , colunas
MES_REFERENCIA;SUBMERCADO;PERIODO_COMERCIALIZACAO;DIA;HORA;PLD_HORA , histórico horário de
2021 em diante mais a série pré-horária de 2001 a 2020. Latência: o PLD de D+1 já está publicado em
D. Licença CC-BY-4.0, com uma tensão registrada e não reconciliada: os Termos de Uso da CCEE
restringem reprodução a uso "sem fins lucrativos", o que conflita com um produto comercial.
Restrição operacional que afeta a arquitetura: o WAF da CCEE bloqueia requisições de IP de
datacenter (dá "acesso bloqueado" em www.ccee.org.br , dadosabertos.ccee.org.br e pda-
_tm (clássico): razão e origem. Sem modalidade.
_detail_tm : nom_modalidadeoperacao (Tipo I, II-B, II-C). Sem razão.


## Página 12
download.ccee.org.br ). O bucket do ONS não bloqueia. Um painel hospedado não consegue
buscar PLD do servidor; precisa de coleta em outra rede ou de ingesta periódica.
6. Previsão aberta: o que é previsão e o que é reanálise
ERA5 é reanálise, não previsão. É atualizado diariamente com latência de cerca de 5 dias (ERA5T
preliminar, versão final em 2 a 3 meses). Usá-lo como feature de decisão de 24 a 48 h é look-ahead
bias puro e destrói a validade do modelo. O mesmo vale para NASA POWER (latência de 2 dias),
Global Solar Atlas (climatologia) e INMET (observação de estação).
Previsão de fato: Open-Meteo Forecast e Ensemble API, ECMWF Open Data e Solcast.
Não existe endpoint de energia na Open-Meteo. /en/docs/energy-api , /solar-and-wind-
energy-api e /solar-radiation-api retornam 404, e energy-api.open-meteo.com não resolve.
A capacidade está embutida em /v1/forecast , que entrega vento em 80, 100, 120 e 180 m, ou seja
na altura de rotor, e GHI/DNI/DHI/GTI, em base horária, com até 16 dias, 10.000 chamadas por dia
sem chave, sob CC BY 4.0 non-commercial.
E o achado que resolve a nossa exigência de validação: a Historical Forecast API arquiva as
previsões desde cerca de 2022 com "same models, same parameters, same response format", e há
Single Runs e Previous Model Runs. Isso permite backtest sem vazamento no tier gratuito, que é
exatamente o que a seção 6 deste documento exigia e não sabia como obter. Complemento: a
Ensemble API traz 51 membros do ECMWF IFS a 0,25°, o que permite entregar P(corte) em vez de
ponto.
Uso recomendado: Forecast como primária, Ensemble para probabilidade, Historical Forecast para
backtest, INMET só como verdade de campo, ERA5 só como baseline histórico.
7. Franquia: a divergência está reconciliada, e o simulador está
subestimado
A franquia é fixada em duas camadas pela REN ANEEL 1.030/2022:
Ano
Eólica
Solar
2023
61 h
30 h30
2024
70 h
35 h
2025
83 h
41 h30
2026
não publicado
não publicado
O valor solar é, por regulamento, sempre a metade do eólico. O "70 h" do paper de 2024 é
exatamente a franquia eólica aplicada em 2024. E o intervalo "78 a 82 h / 30,5 a 41 h" que circulava
não é um par oficial: mistura o piso legal com o último valor atualizado, com o 82 sendo
arredondamento de 83.
piso legal: 78 h/ano para eólica (art. 16, §2º) e 30 h30/ano para solar (art. 20-D, §2º);
atualização anual pelo ONS, por média móvel de 5 anos civis da indisponibilidade das Funções
de Transmissão de 230 a 500 kV (art. 16, §3º, redação da REN 1.109/2024).


## Página 13
Consequência direta para a demo: o simulador usa 82 h como parâmetro. O valor confirmado é 83
h, e para solar seria 41 h30, não 82. A franquia é um dedutível anual acumulado desde 1º de janeiro,
por usina ou conjunto, e só se aplica a eventos de razão de indisponibilidade externa.
8. MCP do ONS: licença, teto de 8 KB e concorrência
Licença. Código e contratos ODCS são Apache-2.0 (LICENSE, pyproject , PyPI, CITATION, e os
contracts/ons/*.odcs.yaml entram no wheel publicado), então reuso comercial sem copyleft,
bastando manter LICENSE e NOTICE. Os dados são licença separada, CC-BY, com atribuição
obrigatória. E o detalhe que evita processo: TIAGO é marca do ONS e não é licenciado (Apache-2.0
§6 mais NOTICE), então o produto precisa de nome próprio.
Acesso. Endpoint público e sem autenticação, declarado na própria página oficial. Testes reais:
initialize em 0,977 s, tools/list em 1,531 s, executar_sql em 2,030 s. Nenhuma credencial
necessária.
O teto de 8 KB é o achado mais operacional. O CloudFront bloqueia com HTTP 403 qualquer corpo
de requisição a partir de 8.192 bytes. Reproduzi: 8.190 B passa, 8.192 B é bloqueado. Consequência:
o MCP_MAX_SQL_CHARS de 65.536 do projeto é inalcançável pela via hospedada. Qualquer SQL
grande, como uma lista IN com muitas usinas ou muitas datas, morre com 403 antes de chegar ao
servidor. Alternativa: rodar o pacote localmente em --stdio , onde o teto é 64 KB.
Concorrência é o segundo risco. 25 tools/list em paralelo levaram de 13,8 a 14,1 s, com 4
falhas HTTP 400 do runtime ("Member must not be null") e a mediana de latência saltando de 1,5 s
para 6,20 s. O erro é do Bedrock AgentCore, não do rate limiter do ONS.
Outros pontos: limit=5000 é clampado para 1000 linhas; as rotas auxiliares /health , / e
/datasets retornam 405 no host gerenciado, então sondagem de saúde tem que ser tools/list ; a
resposta traz structuredContent com result-schema (query_id, tier, unidade, aditividade) e
tiago-dados-abertos-sources , o que permite ao painel consumir sem parsear markdown; o
catálogo hospedado tem 76 datasets contra 78 contratos no repositório; e as versões divergem entre
superfícies (o MCP Registry diz 1.0.0, PyPI e o servidor dizem 1.0.1).
Contribuir com tool de domínio é improvável pelo caminho formal. O CONTRIBUTING.md existe
para código e contratos (fork, branch curta, Conventional Commits, squash merge, CI verde, teste que
falha sem o conserto, sem CLA), mas traz duas regras que batem de frente com o nosso plano:
"mudança no servidor precisa valer para todos os datasets, não para o seu caso" e "o que não entra:
chamada a modelo de linguagem no servidor". O caminho é abrir issue pelo template de ideia antes de
escrever PR.
O que isso muda na prática
#
Correção
Onde dói
1
A solar tem código de razão
Destrava a view do cliente solar, hoje o ponto 
fraco da demo
2
A solar também é por conjunto (94,1% 
das linhas FV)
A alocação por usina é estimativa nos dois 
casos, sem atalho


## Página 14
#
Correção
Onde dói
3
A demo consultava o dataset errado 
por causa da projeção do catálogo do 
MCP
Ganho imediato, custo zero
4
O de-para do PLD é norma, não 
escolha
Item de auditoria resolvido de graça, com 
citação
5
A franquia é 83 h e 41 h30, e solar é 
sempre metade
O parâmetro 82 h da demo está subestimado e 
errado para solar
6
SCADA não é IEC 61850 para o ONS, e 
o comando não é setpoint
Reposiciona o que o produto pode prometer 
sobre integração
7
A sanção por dado ruim é silenciosa
Vira funcionalidade: alerta de adimplência antes 
que a usina saia do rateio
8
Teto de 8 KB e concorrência no MCP
A arquitetura não pode consultar o MCP a cada 
requisição: precisa materializar
9
WAF da CCEE bloqueia IP de 
datacenter
Define onde o painel pode rodar e como coleta 
o PLD
10
Schema inconsistente nos Parquet 
mensais da solar
union_by_name=true ou a ingestão quebra
11
A Historical Forecast API existe desde 
2022
O backtest sem vazamento, que era o maior 
obstáculo metodológico, agora tem caminho
12
Tipo III é a categoria formal, "não 
supervisionada" não existe na norma
Corrige vocabulário do material interno
Resultados da pesquisa externa — rodada 2 (16/09/2026)
Seis investigações novas, respondendo às perguntas de operação, carga, ambiente de contratação,
atribuição de sobrecarga, bateria e compliance. E, desta vez, uma contradição séria com a rodada 1
que só a medição resolveu.
Os seis relatórios
#
Relatório
Cobre
9
pesquisa/09-seguranca-operacional-
ligar-desligar-geracao.md
Segurança ao ligar e desligar geração, 
mecanismo do zeramento e execução do 
comando
10
pesquisa/10-carga-previsao-carga-
risco-ene.md
Carga de consumo e previsão de carga como 
antecedente do corte por razão energética
11
pesquisa/11-acr-acl-curtailment-
gerador.md
ACR contra ACL e quem paga a conta do corte
12
pesquisa/12-previsao-sobrecarga-
atribuicao-curtailment.md
Sobrecarga, atribuição e ranking de 
contribuição


## Página 15
#
Relatório
Cobre
13
pesquisa/13-bess-operacional-e-
china.md
BESS operacional no Brasil e a solução 
chinesa, em nível de mapa
14
pesquisa/14-compliance-auditoria-
ons.md
O que o agente precisa provar ao ONS e aos 
reguladores, e o limite do produto
Verificações que eu reproduzi (rodada 2)
Todos contra o dataset eólico ao vivo, s3://ons-aws-prod-
opendata/dataset/restricao_coff_eolica_tm/*.parquet , 13.037.808 linhas, de 01/10/2021 a
15/09/2026.
Verificação
Resultado
Qual coluna é a energia 
restringida?
val_geracaonaorealizadaapurada , idêntica a 
max(val_geracaoreferencia − val_geracao, 0) em 
100,0% das linhas, e à versão com referência final em apenas 
23,4%
Corte fantasma sem filtro de 
restrição
21.931,0 GWh, exatamente o +38% medido pelo subagente, 
contra 57.321,3 GWh apurados
val_geracaoreferenciafinal 
nula
98,1% do dataset, e apenas 9% das linhas restringidas a têm. 
O contraste é 7.548,1 GWh apurados contra 5.910,1 GWh pela 
referência final no mesmo conjunto de linhas, ou seja 21,7% 
menor
Tipo das métricas
DOUBLE em 13.037.808 de 13.037.808 linhas, contra o 
contrato, que ainda descreve VARCHAR "por bug de 
exportação Parquet"
Fatia por razão é válida?
Sim: só 1,8% dos intervalos restringidos têm mais de uma 
razão, e 90,5% são patamares de 30 minutos cheios
Reconciliação dos números que divergiam
Grandeza
Rodada 1
Rodada 2
Ver
Fórmula da energia
max(G_Ref_Final 
− geração, 0) × 
0,5
val_geracaonaorealizadaapurada
A co
refe
nula
ond
Total eólico
26.532 GWh 
(proxy, 1S/2026)
57.321 GWh (10/2021 a 09/2026)
Esc
prox
com
Nulos de 
val_geracaoreferenciafinal
66,7%
98,1%
O s
está
con
Fatia de ENE
75,1% (proxy)
58,9% (apurada, 1S/2026)
O p
dis
ger


## Página 16
Grandeza
Rodada 1
Rodada 2
Ver
val
dão
núm
58,9
Razão na solar
Existe (rodada 1)
"Não existe" (relatório 10)
Exis
168
REL
rela
proj
MC
CMO negativo
Risco a considerar
Nunca negativo em 2026, mínimo 
exato de 0,00 R$/MWh em 12.240 
patamares
Hoje
ope
Três dos seis relatórios desta rodada usaram o prefixo 09 no nome do arquivo. Renomeei para 11 ,
12 e 13 , e a numeração agora é sequencial de 01 a 14.
9. Segurança operacional ao ligar e desligar geração
O zeramento não é discricionário, é aritmética de rateio. A NT-ONS DOP 0022/2025 (§5.1.2-IV e
§6.1) define a ordem de mérito da mitigação: esgotados hidro-sem-vertimento, térmica fora do mérito e
hidro-com-vertimento, reduz-se a geração eólica e fotovoltaica proporcional às disponibilidades, em
todas as usinas do SIN, por rateio em tempo real aplicado a todos os conjuntos. Com déficit grande,
o rateio empurra cada usina a aproximadamente zero ao mesmo tempo, e é isso que "toda a frota a
zero" significa. A restrição vinculante é o piso hidráulico Req_UHE_Mín_SIN , que o ONS descreve
como "essencial para garantir a segurança da operação e manter o controle da frequência".
O apagão de 15/08/2023 está documentado no RAP-ONS 00012/2023 (572 páginas): atuação
acidental da proteção de fechamento sob falta (SOTF) na LT 500 kV Quixadá–Fortaleza II, com
"atuação incorreta do esquema de religamento automático" (conclusão 7.1), colapso de tensão e
23.368 MW de carga interrompida. O ONS registra que a resposta de potência reativa das eólicas e
fotovoltaicas em campo ficou "muito aquém" dos modelos, o que forçou recalibração e gerou a REN
ANEEL 1.112/2025. O ONS descartou inércia e curto-circuito como causas.
O achado comercial mais útil da rodada: desviar do comando custa caro nos dois sentidos. O
item 4.13 da RO-AO.BR.13 fixa tolerância de 5% ou 5 MW, o que for menor, entre geração verificada
e geração limitada. Se a usina reduz além do comandado, o item 5.2.2.10 derruba a referência:
e ela recebe menos. Se reduz de menos, a energia restringida apurada cai e ela também recebe
menos. Nos dois casos há perda financeira, e o item 4.13 dá ao produto um número normativo para
alertar em tempo real.
O relógio é a confirmação de recebimento no SINapse, pelo Agente Operador (RO-AO.BR.13
§5.1.4 e §5.1.5, e NT 7.1), não a queda da geração. O descumprimento é enquadrável no Módulo 19,
Submódulo 19.1: não-conformidade definida como "ação ou omissão dos Agentes de Operação", com
Relatório de Não-Conformidade, defesa em 15 dias e multa.


## Página 17
Não existe prazo em minutos público para executar a redução após a mensagem. Não foi
encontrado na NT, na RO-AO.BR.13 nem nos Submódulos 2.10 e 2.11, e provavelmente está em
Instrução de Operação segmentada por agente.
10. Carga de consumo: o critério de corte é publicado e
reproduzível
O achado que mais serve ao produto. O critério de corte por razão energética está publicado e é
calculável só com dado aberto (RT DGL-ONS 0189/2025 §5.1 e PAR/PEL 2025, cap. 6.1.3.1):
e há sobreoferta quando esse residual cai abaixo de
com o piso agora variável mês a mês. O subagente verificou que a equação fecha no dataset
balanco-energia-subsistema com erro abaixo de 1%, e mediu margem de apenas cerca de 3,5
GW no meio-dia em agosto e setembro de 2026 (residual mínimo médio de 28.624 MWmed contra
piso de 25.267 MWmed).
Detalhe que engana: a coluna val_gersolar do balanço empacota MMGD mais UFV centralizada
(39.825 MWmed às 11h em setembro de 2026, sendo cerca de 29 GW de MMGD e 9,5 GW de UFV
do DESSEM). Somar isso como "solar centralizada" infla a frota.
Existe previsão oficial de carga aberta em três camadas, e a primeira contém a própria equação
do gatilho um dia antes:
Camada
Fonte
Granularidade
Horizonte
Dia à frente
balanco_dessem_detalhe , perspectiva 
programado, com val_demanda , 
val_ger_mmgd , val_ger_eolica , 
val_ger_fotovoltaica
30 min por 
subsistema
D+1, 
defasagem de 
cerca de 2 dias
Semanal
PMO, Tabela 5 (carga global do SIN) e Tabela 
4 (limites de intercâmbio por patamar)
semanal por 
subsistema
semanas
Quadrimestral
PLAN, EPE mais ONS mais CCEE
mensal por 
subsistema
5 anos
E o "escoamento limitado" que faltava ao nosso raciocínio aparece em número no PMO, Tabela 4:
exportação do Nordeste de 16.200 MWmed no patamar pesado, RNE de 11.000, FNNE entre 6.304 e
7.800.
A curva-carga não tem componente programada, só verificado de D-1. Quem quiser o futuro usa
o DESSEM ou o PMO.
11. ACR contra ACL: a assimetria é texto de norma
A diferença está na norma, não na doutrina. O art. 20-H da REN 1.030/2022, incluído pela REN
1.073/2023, determina que o constrained-off nas parcelas de garantia física de UFV "destinadas ou
disponíveis para contratação no ACL" não será reconhecido antes de 01/04/2024. E os arts. 16 e 20-
D definem quem recebe o ESS: distribuidoras compradoras com CCEAR por Disponibilidade, a
CONER, e apenas a parcela da garantia física não contratada vai ao agente gerador. Os arts. 17 e


## Página 18
20-E mandam a CCEE compensar as "obrigações internas aos CCEAR por Disponibilidade e CER", e
não existe obrigação interna a compensar no ACL.
Quem paga é o consumo, não o gerador. O Módulo 6 das Regras de Comercialização da CCEE diz
que o ESS "é pago por todos os Agentes com medição de consumo registrada na CCEE, na
proporção do consumo sujeito ao pagamento desse encargo, contratado ou não". A socialização cai no
consumidor cativo e no livre, e é exatamente por isso que a ANEEL recusa socializar o corte de usinas
do ACL, por subsídio cruzado. A posição histórica da ANEEL na Consulta Pública 008/2018 é que o
risco no ACL é bilateral, atribuindo "basicamente o risco da restrição operativa ao agente gerador". Em
24/08/2026 o MME abriu consulta (Portarias 930 e 931/2026) para rediscutir a alocação dos ESS,
então o desenho está em revisão.
E a valoração é feita no pior horário possível. O ressarcimento é valorado pelo PLD horário do
submercado (§5º dos arts. 16 e 20-D), e o corte renovável coincide com o pico de geração, quando o
PLD está no piso. Em 16/09/2026 o PLD horário estava em R$ 57,31/MWh nos quatro submercados
contra PPAs novos de R$ 130 a 260/MWh. A perda residual é de ordem de R$ 100 a 200/MWh
mesmo quando o ressarcimento é concedido. Na composição dos eventos, razão energética é
cerca de 46% e confiabilidade cerca de 41%, e a regra ordinária só paga indisponibilidade externa,
cerca de 13%: é o que sustenta os dois terços sem direito e mostra que a Lei 15.269/2025 ataca
justamente a fatia de confiabilidade.
12. Atribuição: o ONS já usa PTDF, e a regra está publicada
Este é o melhor achado da rodada, e dispensa engenharia reversa. A NT-ONS DOP 0022/2025
§6.2.1 diz que o GERDIN agrupa conjuntos por "sensibilidade equivalente", que é o PTDF
arredondado calculado pelo SACI a partir do estimador de estado, ordena decrescente, esgota a
geração nessa ordem, e apenas o último grupo empatado recebe rateio pro-rata. Para razão
energética (§5.1.2 e §6.1) o rateio é pro-rata por ponto de partida sobre todas as usinas eólicas e
fotovoltaicas do SIN, sem componente geográfica.
Dentro do conjunto, a CCEE distribui pro-rata pela geração de referência de cada usina, mediana
dos últimos 30 dias no mesmo horário, e não pela capacidade instalada. O RT DGL-ONS 0189/2025
reconhece a injustiça e recomenda, na recomendação 8.e, "ajustar a regulamentação para um rateio
comercial mais equitativo", na terceira fase da Consulta Pública ANEEL 45/2019. Nada disso está
nos dados abertos: só em PDF.
A concentração, medida:
Recorte
Concentração
Conjuntos 
eólicos
36 de 200 (18%) respondem por 50% do volume; 20 conjuntos por 50% do REL
Pontos de 
conexão
11 de 72 respondem por 50%, e Açu III 500 kV sozinho responde por 5.216 
GWh, 9,1% de todo o curtailment eólico do SIN
Usinas
282 de 1.059 eólicas e 165 de 561 fotovoltaicas respondem por 50%
E confirma-se com número que concentração não é gargalo: a razão REL sobre total é ortogonal ao
tamanho. Gentio Ouro II tem 29% de REL, enquanto Açu III tem 3,6% de REL com o dobro do volume


## Página 19
total.
O melhor proxy é o campo textual dsc_restricao , que nomeia a linha ou o transformador exato e
a Instrução de Operação, por exemplo "LIMITACAO DA TRANSMISSAO NA LT 500 KV ACU III /
JAGUARUANA II - C1(V7) - IO-ON.NE.5NE", 2.991 GWh. Mas ele falta em 56,7% dos GWh de REL
mais CNF.
Reconstruir o limite de escoamento é possível pela metade. A conversão de ampère para MVA
valida por ordem de grandeza (500 kV com 2.788 A dá 2.414 MVA), mas só 1.618 de 2.337 linhas
(69,2%) têm capacidade preenchida, e a parede é conceitual: a restrição do ONS não é limite por
linha, é inequação sobre soma ponderada de fluxos, do tipo
ççç
Essas inequações vivem no Submódulo 5.12 do MPO e nas MOPs, como texto, e as Instruções de
Operação não são abertas. Além disso, subestacao começa em 69 kV e linha-transmissao em
230 kV, deixando pontos de conexão de 69 e 138 kV, que respondem por milhares de GWh, sem dado
de linha algum.
13. Bateria: o achado que reposiciona a tese
No leilão de armazenamento brasileiro, quem decide carga e descarga é o ONS, não o dono. A
Portaria Normativa MME 136/2026 exige CVU zero, despacho centralizado obrigatório, grid-forming
e teto de 366 ciclos por ano, com remuneração por receita fixa de 15 anos e suprimento a partir de
01/08/2028. A energia é liquidada ao PLD com resultado destinado à CONCAP, ou seja, o dono não
captura o spread de arbitragem. Mitigar curtailment deixa de ser receita merchant e vira serviço de
sistema pago por disponibilidade.
Consequência direta para o produto: o valor não está em "quanto a bateria economiza", e sim em
onde e quando o corte ocorre, que é o que decide o posicionamento no Anexo II do leilão.
A China valida o diagnóstico e dá a métrica que faltava. O mandato de co-localização obrigatória
(配储, pei chu) derrubou o curtailment eólico de mais de 17% em 2016 para menos de 5% entre 2022
e 2024, e foi extinto em fevereiro de 2025 pelo Documento 136 do NDRC e da NEA, que proíbe usar
armazenamento como pré-requisito de aprovação ou conexão. O achado do Ember, de 16/07/2026:
BESS co-localizado roda 199 ciclos por ano contra 299 dos sistemas autônomos, uma lacuna de
cerca de 100 ciclos que é a medida direta da ociosidade estrutural. É o mesmo diagnóstico do estudo
da ICCEP, agora em escala de país. O RMI (2025) confirma que os spreads intradiários do spot chinês
ainda são pequenos demais para viabilizar armazenamento, e a estratégia dominante é um ciclo por
dia no pico da tarde.
Números: 150 GW instalados no primeiro trimestre de 2026 na China, 9,5 TWh que poderiam ser
deslocados só igualando a utilização, e 23 TWh se a frota rodasse a 350 ciclos por ano. No Brasil
existe base ancilar (REN 1.030/2022 alterada pela REN 1.062/2023, reativos remunerados a R$ 9,02
por Mvar-hora, sandbox da ANEEL), mas nenhum produto de mitigação de curtailment.
14. Compliance: os dois prazos e o limite do produto
O "protocolo de 90 dias" não é protocolo de dados. A página oficial do Protocolo ONS diz que ele
recebe "documentos institucionais, tais como ofícios, cartas e convites", com fluxo de preenchimento


## Página 20
de campos, inclusão de documento e complementares, termo de aceite e número de protocolo por e-
mail. A revisão de evento de constrained-off é uma petição com anexos dentro do SINtegre (SM 6.5-
RS Rev. 2025.06, Quadro 1, atividade 2, aprovado pelo Despacho ANEEL 1.700/2025).
E existe uma segunda etapa recursiva, que a rodada 1 não tinha: a "solicitação de pedido de
impugnação da apuração técnica de eventos" (Quadro 1, atividade 3), cabível após a decisão do ONS,
com prazo remetido ao Submódulo 1.3 e âncora na REN 1.017/2022, alterada pela REN 1.107/2024.
O ciclo de defesa do gerador tem dois prazos, não um.
A ANEEL fiscaliza o gerador pela REN 846/2019, não pela REN 1.011/2022, que é obrigação do
ONS e trata de auditoria de medição de distribuição:
Dispositivo
Obrigação
Sanção
Art. 9º, VII
Registrar e analisar as ocorrências nos sistemas de 
geração
Grupo I, até 
0,125%
Art. 9º, VI e art. 10, 
XX
Não deixar de enviar ou disponibilizar informações e 
documentos
Grupo II, até 
0,25%
Art. 10, XIX
Operar com medidores e equipamentos de medição
Art. 3º, parágrafo 
único
Autoriza a ANEEL a acessar remotamente dados do 
agente
Art. 45-P
Defesa em 20 dias do auto de infração
O requisito de evidência do ressarcimento é literalmente uma exigência de trilha de dados. A
Portaria Normativa MME 140/2026, art. 5º, caput e §§1º a 3º, exige apresentar ao ONS "registros
atualizados de medição, geração verificada e disponibilidade", com valor "fidedigno" do instante do
evento "devidamente registrado no sistema de medição da usina". O art. 4º §1º II exige registros
solarimétricos da janela de 01/09/2023 a 31/03/2024 em 20 dias, e os arts. 4º §2º e 5º §6º dão 10 dias
para contestar cada divulgação. O paralelo na CCEE é o SM 2.1, item 3.18: valor, justificativa técnica
e metodologia, até MS mais 7 dias úteis.
Retenção tem prazo normativo: o SM 12.4 do ONS (itens 4.1(d), 4.2(d), 4.4(e) e Quadro 1) exige
retenção mínima de 5 anos dos dados de energia e de qualidade. E a evidência primária do
comando é o export da mensagem SINapse com status de entrega, leitura e confirmação (NT-ONS
DOP 0022/2025, item 7.1).
A linha que o produto não pode cruzar. O relatório serve como anexo técnico: memória de cálculo,
dados, premissas, critério reproduzível, calendário de prazos e export versionado com autor e versão
de dados. E não pode protocolar, não pode opinar juridicamente, não pode afirmar
conformidade regulatória e não pode atestar integridade que não controla, sob risco de o
documento virar prova contra o cliente que o assinar, lido sob o art. 9º, VI e o art. 10, XX da REN
846/2019.
O que a rodada 2 muda


## Página 21
#
Correção
Onde dói
1
A energia restringida é lida, não calculada: 
val_geracaonaorealizadaapurada
Sem isso, o produto superestima o 
corte em 38%
2
A G_Ref_Final é 98,1% nula e o contrato está 
desatualizado
O caminho alternativo que a 
rodada 1 propunha não existe na 
prática
3
A fatia de ENE é 58,9%, não 75,1%
Número que vai para o slide
4
O critério do corte energético é publicado e cabe 
numa equação de 5 termos
Vira funcionalidade de previsão, 
não só de constatação
5
Existe previsão de carga aberta com a equação do 
gatilho em D+1
A camada de decisão de 24 a 48 h 
deixa de depender só de clima
6
O ONS já usa PTDF e a regra de quem é cortado é 
pública
Dispensa engenharia reversa e dá 
tese de produto sobre equidade
7
Açu III 500 kV sozinho é 9,1% do curtailment 
eólico do SIN
Ranking de contribuição com uma 
linha de SQL
8
No leilão, quem opera a bateria é o ONS
Reposiciona o simulador de 
economia para posicionamento
9
A China mede a ociosidade: 199 contra 299 ciclos 
por ano
Métrica de escala para comparar 
com o Brasil
10
O ciclo de defesa tem dois prazos, não um
O relógio do produto estava 
incompleto
11
A fiscalização do gerador é a REN 846/2019
Define o risco real do cliente e o 
limite do anexo técnico
12
O CMO não ficou negativo em 2026
A regra de produto calibrada em 
PLD negativo não tem caso
Resultados da pesquisa externa — rodada 3 (aprofundada,
16 e 17/09/2026)
Quatro investigações de profundidade: a solução chinesa, o desenho do anexo técnico, o cálculo da
redução ótima e o teste da hipótese de balanço energético. Esta rodada corrige uma afirmação da
rodada 2 e refina uma conclusão que eu mesmo tinha tirado.
Os quatro relatórios
#
Relatório
Cobre
15
pesquisa/15-china-
regulacao-bess-
curtailment.md
Arco regulatório chinês, por que o mandato de 
armazenamento foi extinto, BESS em detalhe, 
províncias, e o que é portável
16
pesquisa/16-anexo-tecnico-
compliance-cliente.md
O anexo técnico seção por seção, o compliance que 
decide receita, e as quatro vedações com fundamento


## Página 22
#
Relatório
Cobre
17
pesquisa/17-reducao-otima-
producao.md
As duas formulações da redução ótima, e a política 
ótima com bateria
18
pesquisa/18-formula-
curtailment-validacao.md
Como o curtailment se calcula, e o teto medido da 
hipótese de balanço puro
A reconciliação da hipótese, e uma correção minha
O relatório 18 mede a hipótese e o resultado depende de duas escolhas metodológicas: a
granularidade e a série usada para o residual. Ele usa base diária (258 dias de 2026) e reconstrói a
série potencial, somando o curtailment de volta à geração verificada. Eu, na rodada 2, medi em base
mensal com a série verificada, e por isso afirmei que não reproduzia os números dele. A explicação é
essa, e as duas medições estão certas para perguntas diferentes:
Medição
Granularidade
Série
corr(ENE, 
margem)
corr(ENE, 
carga)
R² do 
ENE
Relatório 18
diária
potencial (curtailment 
somado de volta)
+0,741
−0,621
0,51 a 
0,55
Minha, 
rodada 2
mensal
verificada (do balanço)
+0,578
+0,265
0,33
A escolha que decide é a série potencial. Se você usa a geração verificada como insumo do
residual, o próprio corte contamina o regressor, porque a geração cai justamente porque houve corte.
É a mesma classe de erro do AUC 0,9804 da rodada 1, e agora aparece do lado da previsão: o
insumo do modelo não pode ser medido depois do evento que ele quer prever. A correção é
somar o curtailment de volta para reconstruir o que a usina teria gerado.
E a minha medição mensal, que continua válida, mostra a armadilha que a versão "estimativas por
ano" da hipótese cria:
Na média mensal o déficit é negativo nos doze meses, inclusive nos dois maiores meses de corte
da série. Um modelo com insumo mensal ou anual responde "nunca haverá curtailment" o ano inteiro.
O gatilho é sub-horário, e o insumo tem que nascer em 30 minutos ou em hora.
Verificações da rodada 3 que eu reproduzi
Verificação
Resultado
Fatia de ENE, jan–
set/2026
60,5% (10.715,1 GWh de 17.719,4), com CNF 26,3% e REL 13,3%. O 
68,6% do relatório 18 e o 67% do 17 não se reproduzem; o 68,6% vem do 
recorte renovável e o 58,9% do recorte eólico do 1S
2026-02  carga 85.684 MW   déficit -33.080 MW   ENE   372,8 GWh
2026-07  carga 76.145 MW   déficit -17.389 MW   ENE 2.196,7 GWh
2026-08  carga 80.189 MW   déficit -18.054 MW   ENE 2.294,3 GWh


## Página 23
Verificação
Resultado
Concentração por 
subsistema, 
1S/2026
Nordeste 98,0% (8.909,2 GWh de 9.094,7). Reproduz exatamente
Concentração por 
estado, 1S/2026
BA 43,7% mais RN 34,3% = 78,0%; o relatório diz 76,4%, que sai do 
recorte eólico com outro denominador. Ambos corretos para o seu recorte
Caminho do balanço
balanco_energia_subsistema_ho (horário, id_subsistema incluindo 
SIN , métricas em VARCHAR exigindo TRY_CAST )
15. A solução chinesa, e o que ela realmente ensina
O mandato de armazenamento não foi extinto por ideologia, foi extinto por medição. O 配储 (pei
chu) derrubou o curtailment eólico de mais de 17% em 2016 para menos de 5% entre 2022 e 2024, e
foi cancelado em fevereiro de 2025 pelo Documento 136 (发改价格〔2025〕136号) porque a
utilização dos sistemas era de 17% em 2023, 6,1% da produção máxima potencial em 2022 e 3,74
horas por dia em junho de 2024.
E o curtailment voltou. Em 2026, a estatística oficial traz 8,6% solar e 9,1% eólico, contra 26,1%
estimados pela GEM/CREA, com 360 TWh no primeiro semestre e alta de 49% ano a ano. A NEA
parou de publicar curtailment provincial em março de 2026.
O que substituiu o mandato é pagamento por disponibilidade. O 发改价格〔2026〕114号, de
30/01/2026, criou preço de capacidade nacional para armazenamento independente, ancorado no
preço de capacidade do carvão, CNY 330 por kW por ano, com fator de conversão igual à duração de
descarga dividida pelo pico líquido mais longo do ano, limitado a 1, e custo rateado aos usuários
industriais e comerciais. Onze províncias têm regra própria, de Gansu a CNY 330 até Hebei a CNY
100 por kW por ano.
A evidência que sustenta o pitch é o paper do LBNL e UC Berkeley (Liu et al., SSRN 7261328,
agosto de 2026): capex anualizado de BESS em US$ 68,06 por kW-ano, receita de energia sozinha
cobre em 4 de 9 casos, somando capacidade (US$ 8,96 por kW-ano) fecha 7 de 9, e tarifa de
regulação de duas partes fecha 9 de 9. O mercado de energia é o determinante, e o pagamento de
capacidade é complemento limitado. É exatamente o que o LRCAP brasileiro não resolve, porque
manda o spread para a CONCAP.
Horas equivalentes de armazenamento na China: 611 em 2023, 911 em 2024, 1.195 em 2025. Escala:
136 GW e 351 GWh no fim de 2025, 155,2 GW e 400,8 GWh no primeiro trimestre de 2026, com
51,2% independente.
E o achado que eu levaria para a banca: a opacidade é o mercado. O ONS publica o critério e o
método de rateio, e não publica a atribuição por agente. A China parou de publicar o dado
provincial exatamente quando ele subiu, e a distância entre 8,6% oficial e 26,1% independente é o
tamanho do problema. Atribuição auditável por barramento é a funcionalidade-âncora do CurtailLess.
16. O anexo técnico: um relatório de reprodução de critério
O anexo é um relatório técnico de reprodução de critério, no sentido da ABNT NBR 10719:2011, e
não um laudo de conformidade nem um parecer jurídico. Ele faz três coisas: reproduz o critério


## Página 24
normativo com os insumos do SM 6.5, item 1.4.4.1, organiza a evidência que o cliente apresentará
por outro canal, e carrega o relógio de prazos. É no relógio, e não no cálculo, que o produto muda o
resultado financeiro.
A disciplina de relato vem da NBR ISO/IEC 17025 §7.8: identificação unívoca de cada item, coluna de
método, ressalva explícita para dado de terceiro, e emenda somente por documento novo. E o limite
de asseguração vem da ISAE 3000, A29(ii): quem mede e avalia não pode atestar o próprio objeto,
por ameaça de autorrevisão. É daí que sai, tecnicamente, a vedação de "não atestar integridade que
não controla".
As quatro vedações, com o fundamento de cada uma:
Vedação
Fundamento
Não protocolar
Não existe API pública de SAGER, Protocolo ou SCDE. Afirmar 
envio é falsidade ideológica, CP art. 299
Não opinar juridicamente
Lei 8.906/1994, arts. 1º II e 4º, e DL 3.688/1941 art. 47. Atos de 
não inscrito na OAB são nulos
Não afirmar conformidade 
regulatória
A adimplência só existe após deferimento do ONS (RO-AO.BR.13, 
item 5.2.2.6); e Lei 12.846/2013 art. 5º V
Não atestar integridade que 
não controla
ISAE 3000 e NBR ISO/IEC 17025 §7.8.2.2
O acoplamento é por referência cruzada: a petição, ato do advogado, invoca "Anexo Técnico nº X,
seção Y"; o anexo, assinado por engenheiro com ART (Lei 6.496/1977 e Resolução CONFEA
1.137/2023), declara que não é petição e que não gera efeito de recontabilização. Se impugnado,
atinge o meio de prova, não o ato de postular.
Correção que o relatório faz na minha própria instrução: eu escrevi Lei 8.906/1990 no pedido de
pesquisa. O Estatuto da Advocacia é de 1994.
17. Redução ótima: as duas formulações, e por que só uma tem
espaço
Formulação A, para o sistema. O resultado mais elegante da rodada: a inequação de rede do ONS
é ela mesma um vetor de sensibilidade. Se a restrição é e em corrente contínua, ela vira
e a "sensibilidade equivalente" do GERDIN é exatamente . Para razão elétrica o ONS já é
praticamente ótimo: ordenar por sensibilidade e esgotar é a solução gulosa exata do problema linear
com uma inequação ativa. O ganho está na equidade, não na eficiência.
Para razão energética, "minimizar energia cortada" é degenerado: o total a cortar é fixo pelo piso,
então
e qualquer rateio entrega a mesma energia. O objetivo útil seria valorar por PLD, e o ganho é pequeno
porque o spread entre submercados é baixo.


## Página 25
Formulação B, para a usina, e é aqui que existe decisão real. Com , a energia não realizada
apurada é
Ou seja, fora da banda o crédito é exatamente o corte nominal, independente de quanto a usina
gerou: a tolerância é a única região em que o crédito acompanha a geração. A faixa ótima é , com
alvo acima do centro, e nunca abaixo. O ponto de virada é MW, acima do qual manda o teto absoluto
de 5 MW, ou seja cerca de 2,5%, e não os 5% nominais.
Extensão com bateria, onde a pergunta muda de natureza. A decisão deixa de ser "quanto reduzir"
e vira onde colocar o MWh: armazenar se, e somente se,
Com round-trip de 0,85 e evento compensável, exige-se 18% de spread só para empatar. Se o
evento não é compensável, que é o caso de ENE, qualquer PLD positivo à tarde paga o desgaste.
Uma pergunta que precisa ser feita ao ONS no presencial, porque ela inverte o sinal da
formulação: com bateria, a Geração Verificada é medida na saída das turbinas ou na injeção no
ponto de conexão?
O que a rodada 3 muda
#
Correção
Onde dói
1
Corrigi minha própria conclusão da rodada 2: as 
correlações do relatório 18 são válidas em base diária 
com série potencial; as minhas valem em base 
mensal com série verificada
As duas entram no doc, com o 
escopo de cada uma
2
A série do residual tem que somar o curtailment 
de volta
Usar a geração verificada 
contamina o regressor. É a 
armadilha do AUC 0,98 do lado da 
previsão
3
Na média mensal o gatilho nunca dispara
Mata a versão anual da hipótese 
de balanço; o insumo tem que ser 
sub-horário
4
A fatia de ENE em jan–set/2026 é 60,5%, não 68,6% 
nem 67%
Fecha a terceira divergência de 
ENE entre relatórios
5
O mandato chinês foi extinto por medição, com 
17% de utilização
A tese de BESS do produto não 
pode ser "recuperar a energia 
cortada"
6
O LBNL mostra que energia sozinha cobre 4 de 9 
casos; com capacidade, 7 de 9; com tarifa de 
regulação, 9 de 9
O relatório do cliente precisa 
valorar a pilha inteira, não só o 
PLD
7
A opacidade chinesa é o argumento de mercado
Atribuição auditável por 
barramento é a funcionalidade-
âncora
8
O anexo é relatório de reprodução de critério 
(NBR 10719), com autorrevisão vedada pela ISAE 
3000
Dá a moldura técnica que faltava à 
proposta
9
A reserva legal é a Lei 8.906/1994, não 1990
Corrige erro meu


## Página 26
#
Correção
Onde dói
10
Fora da banda de tolerância, o crédito é o corte 
nominal
Muda o alvo operacional da usina, 
e a faixa ótima é acima do centro
11
Com bateria, exige-se 18% de spread para empatar
Enquadra quando a bateria ajuda 
e quando não ajuda
12
A pergunta de gate de medição com bateria tem 
que ir ao ONS
Inverte o sinal da formulação da 
usina
Corpus normativo local e a REN 1.030 confirmada
(17/09/2026)
Um dos subagentes da rodada 4 falhou por truncamento de resposta, e no processo deixou em /tmp
um cache de documentos primários baixados. Preservei o cache em referencias/normas/ , 22
arquivos e 2,9 MB:
Arquivo
Documento
ren1030.md
REN ANEEL 1.030/2022, texto integral do DOU
ro04.txt
RO-AO.BR.04 Rev. 47, vigência 25/06/2026, no Módulo 5, Submódulo 
5.13, apuração das mudanças de estados operativos
ro13.txt
RO-AO.BR.13 Rev.09, a rotina de apuração do constrained-off
mod191.txt
Módulo 19, Submódulo 19.1, não conformidades
sm65pr.txt , 
sm65rs.txt
Submódulo 6.5, apuração e revisão de eventos
sm42pr.txt , 
sm42rs.txt
Submódulo 4.2
sm13pr.txt , 
sm13rs.txt
Submódulo 1.3
sm52op.txt
Submódulo 5.2, operação
A legenda do RO-AO.BR.04, e um erro meu que ela corrige
Eu havia escrito neste documento uma lista de códigos de origem, GIP, GIF, GEX, GIM, GRE, GCI,
GCB, GCC, GIS e GUM, que veio do subagente que falhou na rodada 4. O redespacho corrigiu, e eu
conferi no texto primário que está no disco: GIP, GIF e GEX não existem no RO-AO.BR.04 Rev. 47, e
"GCC = programado" era artefato de coluna embaralhada na extração do PDF, em que o rótulo da
coluna esquerda cai no meio da frase da direita.
A legenda real é o Anexo 2, Códigos para Classificação de Eventos, e ela separa três eixos, o que
importa muito para o produto:
ORIGEM, que é o motivo:


## Página 27
Código
Significado
Efeito nas taxas
GUM
Responsabilidade do empreendimento 
de geração
Considerada em TEIFa e TEIP
GAC
Ativos de conexão
GCB
Falta de combustível
Considerada nas taxas e na penalidade
GCC
Falta de combustível
Considerada nas taxas, 
desconsiderada na penalidade
GCI
Falta de combustível
Desconsiderada nas taxas e na 
penalidade
GIS
Responsabilidade do empreendimento 
de geração
Desconsiderada em TEIFa e TEIP
GIC
Início de operação comercial
GIM
Melhorias com ganho operativo para o 
SIN
GMT
Limpeza do mexilhão dourado
GHN, GRE, 
GRH
Hidráulica: navegação, energética, 
perda de carga
GRB
Elétrica: Rede Básica e outros sistemas 
de transmissão
ESTADO OPERATIVO, que é o que a usina está fazendo: LCS, LCC, LIG, DEM (desligado em
emergência), DUR (desligado em urgência), DAU (desligado automático), DCO (desligado por
conveniência operativa), DPR (desligado programado, manutenção e intervenções para testes),
DCA (desligado por necessidade do agente), DES (desativação), EOC (entrada em operação
comercial).
CONDIÇÃO OPERATIVA: NOR (operação normal), RPR (restrição programada), RFO (restrição
forçada), NOT (início da comprovação de disponibilidade), TST (aguardando comprovação).
O ponto que a confusão esconde e que vale para o produto: "programado" é estado operativo
(DPR), não origem. E o GUM é o código que pega a indisponibilidade declarada por
conveniência do agente, com dois itens explícitos: "desligamentos para testes ou treinamento de
interesse do agente durante o período de operação comercial" e "não realização da comprovação de
disponibilidade por conveniência do agente". Ou seja, a rota de se declarar indisponível de propósito
não é neutra: ela entra na taxa como responsabilidade do empreendimento.
O que a REN 1.030 resolve, agora lido na fonte
Esta era a maior dívida de verificação do projeto: nas rodadas 1 a 3, quatro subagentes tentaram
ler a REN 1.030 e todos falharam, porque o cedoc da ANEEL bloqueia por Cloudflare mesmo com --
stealth . O texto foi obtido pelo DOU em in.gov.br , que é a rota que funciona. Confirmado na
fonte, REN ANEEL nº 1.030, de 26/07/2022:


## Página 28
Dispositivo
Texto e o que resolve
Art. 16, 
caput
Os pagamentos de constrained-off de usinas ou conjunto de usinas eolioelétricas, 
por razão de indisponibilidade externa (inciso I do art. 14), são feitos por ESS pela 
CCEE
Art. 16, §2º
O ESS é devido só quando a soma dos tempos, acumulados desde o início do 
ano civil, superar 78 h. Confirma o piso, o marco temporal anual e o fato de ser um 
relógio acumulado, não um limiar por evento
Art. 16, §3º
Autoriza o ONS a atualizar as 78 h pela indisponibilidade média em média móvel 
de cinco anos civis das Funções de Transmissão de 230 kV a 500 kV. É 
exatamente o que as rodadas 2 e 3 deduziram
Art. 16, §5º
A valoração do ESS é pelo PLD do submercado no respectivo período de 
comercialização, o que confirma normativamente a valoração horária
Art. 17
As Regras de Comercialização devem prever a compensação sobre as obrigações 
internas aos CCEAR por Disponibilidade e CER. É a base normativa da 
assimetria ACR e ACL: no ACL não há obrigação interna a compensar
O que a REN 1.030 não resolve
Os arts. 20-D e 20-H têm zero ocorrências na Rev.00 de 26/07/2022. Isso é esperado e importante:
o piso solar de 30 h30 e a exclusão do ACL (art. 20-H) vêm de alterações posteriores, a REN
1.073/2023 e a REN 1.109/2024. Portanto o texto do Título das UFV continua dependendo de
versão consolidada que eu não tenho, e é a única peça da moldura de ressarcimento ainda apoiada
em fonte secundária.
Duas notas laterais que o texto revelou: o Art. 3º mostra que o programa de Resposta da Demanda
desta REN tinha vigência até 27/06/2022, então a contratação de 344 MW de RD em 15/07/2026 é
instrumento posterior e não este; e o Art. 9º §1º traz o mecanismo de remuneração da RD contra o
PLD, rateado no ESS.
Situação da rodada 4
Doze lacunas despachadas. A de indisponibilidade proativa falhou por truncamento sem escrever o
arquivo, e foi redespachada com escrita incremental obrigatória, entregando o relatório 28. As
duas últimas, 29 e 30, estão entregues. Os relatórios 19 a 27 ainda não voltaram e a consolidação
completa da rodada 4 espera por eles.
A inversão da tese de BESS, verificada por mim
Este é o achado que muda decisão e que contradiz o que as rodadas 2 e 3 concluíram. Eu havia
registrado que, no Brasil, "quem decide carga e descarga é o ONS e o dono não captura o spread".
Isso vale para uma rota específica, o leilão de armazenamento, e não para a outra.
Rota
Quem opera a bateria
Quem fica com o 
resultado
Base
LRCAP, leilão de 
armazenamento
ONS, despacho 
centralizado 
obrigatório
CONCAP: o dono 
recebe só a receita fixa
Portaria MME 
136/2026


## Página 29
Rota
Quem opera a bateria
Quem fica com o 
resultado
Base
SAE colocalizado a 
central geradora
O agente
O agente, energia 
liquidada ao PLD em seu 
nome
REN ANEEL 
1.161 e 
1.162/2026
Confirmado por mim, no texto do DOU da REN ANEEL nº 1.162, de 2 de junho de 2026, que
"estabelece tratamento regulatório para a implantação de Armazenamento de Energia Elétrica" e
altera, entre outras, a REN 1.029/2022:
A lacuna que sobra, e é a mais importante para o produto: o tratamento do constrained-off com
bateria não tem regra publicada. A RO-AO.BR.13 Rev.09 não menciona armazenamento, verificado
no corpus local. A pergunta de gate de medição do relatório 17, se a Geração Verificada é medida na
saída das turbinas ou na injeção no ponto de conexão, só será resolvida pela atualização dos
Procedimentos de Rede que está no prazo de 180 dias do art. 17. Se o ONS medir na injeção, a
energia que a bateria absorve durante um corte não conta como geração e o corte não seria
"evitado".
O primeiro caso brasileiro existe, e eu confirmei a parte que o DOU sustenta: os Despachos nº
3.601 a 3.604, de 15 de setembro de 2026, autorizam o início da operação comercial da UFV Sol de
Brotas 7 (CEG UFV.RS.BA.047047-3.01 ), de titularidade da Sol de Brotas 7 S.A., em Uibaí, Bahia, a
partir de 16 de setembro de 2026, com 102 unidades geradoras de 318,63 kW somando 32.500 kW.
A bateria colocalizada, de 1.250 kW e 5.016 kWh, com medição e faturamento compartilhados com a
usina, está confirmada por fontes setoriais (MegaWhat e Eixos) e pela página de SAE da ANEEL. A
ressalva: os despachos que li tratam das unidades geradoras da UFV, e não do SAE, então a data de
operação da bateria em si não está nesses quatro despachos e depende da imprensa setorial.
O valor de deslocar manutenção, quantificado
O relatório 29 fecha uma intuição que estava declarada sem número desde a rodada 2. A formulação é
e o achado é que o valor do deslocamento é a energia cortada, não a potencial, e só a parcela
não ressarcível. Como cerca de 87% do corte é ENE mais CNF, que não geram ressarcimento, o
ganho se aproxima do corte cheio. Se fosse REL, a usina abriria mão do ressarcimento ao se declarar
indisponível, e é aí que a conta vira. No exemplo do relatório, uma janela de 3 dias com 25% de corte
esperado vale R$ 104 mil ao PLD de R$ 150/MWh, e continua positivo no piso, com R$ 38 mil.
Art. 2º, V (na redação alterada): "operação comercial: situação operacional em que a energia
produzida pela unidade geradora ou a unidade armazenadora do SAE está disponibilizada ao
sistema, podendo atender aos compromissos mercantis do agente ou para o seu uso
exclusivo". É esta frase que sustenta a captura da arbitragem pelo dono.
Art. 17: o ONS deve encaminhar à ANEEL, em 180 dias da publicação, proposta de alteração nos
Procedimentos de Rede. Prazo que vence por volta de dezembro de 2026.
Art. 18: a CCEE deve encaminhar, no mesmo prazo de 180 dias, alteração nas Regras e
Procedimentos de Comercialização, com operacionalização admitida por Mecanismo Auxiliar de
Cálculo enquanto o SCL não for adaptado.


## Página 30
E o custo de O&M quase não decide: o Brasil tem a eólica mais barata do mundo em O&M, de US$
20 a 29 por kW-ano pela IRENA 2025, o que dá cerca de R$ 27 a 40 por MWh. O que decide é
receita e risco. O custo escondido é o GUM, porque a manutenção própria entra nas taxas TEIFa e
TEIP e 72 horas já representam 0,82% do ano, acima da indisponibilidade média declarada de 0,47%.
E o valor da banda de tolerância do item 4.13, que é a única região em que o crédito acompanha a
geração, fica entre R$ 143 e R$ 750 por patamar de 30 minutos, idêntico para 100 MW e para 300
MW porque o teto absoluto de 5 MW domina acima de 100 MW. Isso é argumento para alerta em
tempo real, não para relatório.
Resultados da pesquisa externa — rodada 4 (as doze
lacunas, 17/09/2026)
Doze investigações, uma por lacuna aberta nas rodadas 2 e 3. Duas falharam por truncamento de
resposta e foram redespachadas com escrita incremental, e as duas entregaram. Ao final, o material
acumulado é 30 relatórios e cerca de 2,9 MB de corpus normativo primário.
Os doze relatórios
#
Relatório
Lacuna
19
pesquisa/19-lrcap-edital-receita-fixa.md
Edital do LRCAP, receita fixa e Anexo II
20
pesquisa/20-brasil-tarifa-regulacao-
armazenamento.md
A terceira perna de receita no Brasil
21
pesquisa/21-china-precos-capacidade-
provinciais.md
Preços de capacidade chineses, 
província a província
22
pesquisa/22-australia-chile-
armazenamento-curtailment.md
Austrália e Chile: quem paga e quem 
publica atribuição
23
pesquisa/23-feature-horaria-validacao.md
Feature de margem em granularidade 
horária
24
pesquisa/24-piso-hidraulico-mensal-
ocr.md
OCR dos 12 pisos hidráulicos mensais
25
pesquisa/25-saci-gerdin-
sensibilidades.md
O PTDF do SACI é acessível?
26
pesquisa/26-corrida-de-modelos-
curtailment.md
Corrida de modelos com validação 
temporal
27
pesquisa/27-sinapse-lead-time.md
O prazo real entre comando e 
execução
28
pesquisa/28-indisponibilidade-proativa-
penalidade.md
Indisponibilidade proativa: permitido, 
proibido ou cinza
29
pesquisa/29-valor-manutencao-
deslocada.md
Valor de deslocar a janela de 
manutenção
30
pesquisa/30-lrcap-hibrido-arbitragem.md
Hibridização: quem opera e quem 
recebe


## Página 31
19. O edital do LRCAP não foi publicado
Até 16/09/2026 o portal oficial dos Leilões 05 e 06/2026-ANEEL lista apenas a Portaria 136/2026, o
Ofício 40/2026 e a nota técnica de requisitos. Não há edital, anexos nem CRCAP, e o campo de
data do edital está vazio na API do portal. A consulta pública fechou em 14/09 e o edital homologado é
esperado para outubro ou novembro, com os leilões mantidos em 2 e 4 de dezembro.
A Receita Fixa não tem valor fixo, ela é a variável do lance, em R$ por ano, com preço-teto a ser
definido pelo MME no edital. A indexação é pelo IPCA com base em maio de 2026, com reajuste
anual. Estimativas de mercado apontam R$ 1,2 a 1,7 milhão por MW-ano, pela ABSAE.
O Anexo II é o β de 0,9 aplicado a 129 barramentos (BA 42, CE 39, MG 18, PI 17, PE 6, AL 3, PB 2,
RN 2), com a fórmula , o que dá até 11,1% de folga de receita. Este é o instrumento que o nosso
produto teria de saber ler: o posicionamento do projeto na rede entra na pontuação.
Comparação com a China: CNY 330 por kW-ano equivalem a cerca de R$ 253 por kW-ano, o que é
aproximadamente cinco vezes menor que a faixa esperada do LRCAP. A diferença é de natureza: lá
é pagamento suplementar sobre um mercado de energia que existe, aqui é a receita principal de um
ativo cujo spread vai para a CONCAP.
20. A terceira perna brasileira não existe como produto
O Brasil tem a base ancilar fechada pela REN 1.030/2022, art. 24, com cinco serviços, e já executou
um sandbox competitivo de reativos (REA 16.539/2025, certame de dezembro de 2025: 338 Mvar-
hora efetivos em Minas Gerais, deságio de 21%, preços de R$ 23,28 a R$ 100 por Mvar-hora), que
abre explicitamente a porta para baterias. Mas não existe tarifa de regulação de duas partes nem
preço de capacidade para bateria fora do leilão. O equivalente brasileiro do 发改价格〔2026〕114
号 não existe.
Correção de dado que eu havia propagado: o R$ 9,02 por Mvar-hora não é vigente, é de maio de
2023. A TSA foi reajustada para R$ 9,48 em 2024, R$ 9,90 em 2025 e R$ 10,41 em 2026, pelo
Despacho ANEEL 3.850/2025. Quem paga é o ESS, rateado aos agentes de consumo.
E uma limpeza de escopo: a Lei 15.042/2024 é o mercado de carbono, não trata de
armazenamento. Quem trata é a Lei 15.269/2025.
21. O instrumento chinês mais transferível é o fator de duração
O 发改价格〔2026〕114号 define o fator como "duração de descarga dividida pelo pico de carga
líquida mais longo do ano, limitado a 1", mas o denominador varia por província: 6 h em Gansu,
Xinjiang, Shaanxi, Ningxia e Anhui; 8 h em Jilin e Qinghai; 10 h em Hubei; 4 h em Guangdong. A
consequência para o desenho é direta: um BESS de 2 horas recebe 33% do teto onde o pico é 6 h,
25% onde é 8 h e 20% onde é 10 h. É esse mecanismo, e não o valor absoluto, que vale copiar.
Os valores: o teto real é CNY 370 por kW-ano (Liaoning, em minuta) e não 330; o piso é CNY 100
(Hebei). Gansu e Jilin a 330, Zhejiang degressivo de 200 para 170, e duas províncias pagam por
energia (Shandong a 0,0705 yuan por kWh rateado por capacidade efetiva, e Inner Mongolia a 0,28
yuan por kWh com padrão fixo de 10 anos).


## Página 32
E a lacuna que a própria análise chinesa reconhece: não há padrão único para "capacidade
efetiva". O 114号 define formalmente só a 可靠容量, capacidade confiável, e a 有效容量, capacidade
efetiva, é termo operacional provincial. É exatamente o espaço do CurtailLess.
22. Austrália e Chile já publicam a atribuição que o Brasil não
publica
Este achado sustenta a tese central do produto. O AEMO publica, a cada 5 minutos e de graça,
qual restrição vinculou, o RHS, o valor marginal e o ativo afetado ( DISPATCHCONSTRAINT no
NEMWEB). O Coordinador chileno publica planilha mensal por usina, hora a hora, com cerca de
duas semanas de atraso. O Brasil publica o resultado agregado e não o instrumento causal.
E nenhum dos dois compensa o gerador cortado. O DCCEEW documenta que a cláusula de
deemed generation do Capacity Investment Scheme foi consultada e nunca executada, ou seja, o
risco de curtailment fica integralmente no gerador mesmo com contrato de capacidade. O Brasil é o
único dos três com arcabouço de ressarcimento, o que dá ao produto um caso de uso de pleito que
não existe nesses mercados.
Uma lição de metodologia que vale ouro para não errar número: na Austrália a definição de
curtailment muda o total por um fator de cinco. O AEMO separa curtailment de rede, imposto por
restrição (0,95 TWh no primeiro semestre de 2026), de economic offloading, voluntário por preço
negativo. O total de 2025 foi 7,2 TWh, somando 1,5 de rede e 5,7 econômico. O número de 2,93 TWh
que circula na imprensa usa a definição ampla. Citar sem qualificar erra por cinco vezes, e o nosso
produto tem o mesmo risco com val_geracaolimitada contra val_geracaonaorealizadaapurada .
23. A validação horária, e o veredito sobre o ganho
Esta é a medição que fecha a questão da feature, e ela é dura. Tudo abaixo é SQL executado, sobre
6.192 horas, de 01/01 a 15/09/2026, no subsistema SIN.
As correlações horárias confirmam o teste diário em magnitude. corr(ENE, margem) de
−0,7506 e corr(total, margem) de −0,8216, com R² de 0,563 para o ENE e 0,675 para o corte
total. O diário havia dado 0,741 e R² de 0,51 a 0,55. O sinal é negativo por construção, porque
margem negativa é sobreoferta, que é o gatilho.
E o achado central: o ganho sobre a persistência é pequeno.
Classificador
AUC
Margem, deficit cru
0,8966
Persistência, ENE da hora anterior
0,8893
Ganho
+0,0073
E no ponto de operação físico, margem ≤ 0 , a persistência é melhor: recall de 0,894 contra 0,451 da
margem, com precisão quase igual, 0,894 contra 0,905. Traduzindo: saber que houve corte na hora
anterior é quase tão bom quanto o balanço hidráulico completo, porque o corte ENE vem em
blocos longos de horas seguidas. A margem, no limiar físico, dispara 994 vezes e acerta 90%, mas


## Página 33
metade dos 1.994 eventos reais acontece com margem positiva, ou seja, o balanço não vê o
corte.
E o lead time é zero. Dos 211 inícios de bloco de corte, todos tinham margem positiva na hora
anterior, e:
Métrica
Valor
Lead time mediano
0 h
Lead time médio
0,22 h
Máximo
4 h
Blocos com 1 h de antecedência
16 de 211, 7,6%
O sinal chega junto com o evento, não antes, e isso é estrutural e não acidental: margem(h) usa a
carga e a geração da própria hora h. Ela não pode ser antecedente por construção. Para ter lead
time é preciso alimentá-la com previsão de carga e de renovável, D-1 ou intradiária, e não com o
realizado.
A dobradiça é artefato, e usar a margem crua. A versão max(0, Req_Min − Res) deu AUC de
0,3775, mas isso é viés de rank com empates: a dobradiça zera 5.198 das 6.192 horas e elas
colapsam num único rank médio. Como ela é monótona não-decrescente no deficit, preserva
exatamente a mesma curva ROC, e o AUC verdadeiro segue 0,8966. Confirmei a leitura do agente
anterior.
O veredito, pela nossa própria disciplina. Um modelo que não bate um baseline burro tem o
resultado declarado e o valor migra para a explicação. É o caso aqui: a margem horária não bate a
persistência de forma significativa. O que ela entrega é explicação e diagnóstico, com R² de 0,56
do ENE, e ela serve como alvo intermediário de um modelo de previsão de carga e renovável. O que
ela não é, é um preditor cru de curtailment.
24. Os doze pisos mensais, extraídos por OCR
A Tabela 6.3 do PAR/PEL 2025 é imagem, e foi extraída por pdfimages mais tesseract , com
conferência por duas leituras independentes que concordam valor a valor:
Mês
UHE mínimo
Part. da carga
Jan
24.448 MW
36%
Fev
26.033 MW
35%
Mar
26.969 MW
37%
Abr
25.593 MW
37%
Mai
22.802 MW
34%
Jun
22.675 MW
35%
Jul
20.289 MW
27%
Ago
19.339 MW
28%
Set
18.803 MW
28%


## Página 34
Mês
UHE mínimo
Part. da carga
Out
20.382 MW
28%
Nov
22.542 MW
31%
Dez
25.553 MW
36%
O piso mensal explica o corte por razão energética muito melhor que o anual: F1 de 0,71 contra
0,56, e recall de 55,1% contra 39,0%, com precisão igual nos dois. E o erro de usar o anual é de 8.662
GWh de corte mal explicado, 20,1% de todo o corte ENE eólico, com o anual subestimando o
risco justamente nos meses de maior corte, de janeiro a junho e novembro e dezembro, onde a fração
vai de 34% a 37% contra os 29,6% do valor anual.
25. O PTDF do ONS não é público, e a alternativa honesta está em
outro órgão
Testado ao vivo: o histórico de sensibilidades SACI/GERDIN redireciona o anônimo para o SSO do
ONS e trava, e até a página inicial do SINtegre exige login. Não há publicação em nenhuma
superfície: buscas por sensibilidade e estimador no catálogo retornam zero resultados, e o repositório
github.com/ONSBR tem apenas software e parsers. O caminho legítimo existe, com conta de agente
e o webhook ons-sintegre-webhook , mas é fechado.
Existe um proxy público, de outra instituição e de planejamento: a EPE publica o caso ANAREDE
do PDE 2035 e a base TUST-RB em formato Nodal, com barras DBAR do SIN, que é o modelo
usado para calcular a TUST, que é ele mesmo baseado em PTDF. Serve para ordenar sensibilidade
relativa, não para afirmar violação.
Recomendação, e eu concordo com ela: reconstruir PTDF por conta própria é caro, assimétrico e
fatal para a tese, porque a topologia pública é planejada e não a observada em tempo real que o
SACI usa. A alternativa honesta é exposição histórica por conjunto mais dsc_restricao , que é
100% dado aberto e é o ativo mais defensável, com o caso da EPE apenas como apoio para inferir
ordem relativa.
26. A corrida de modelos foi executada, e resolve uma tensão
Sete modelos, dois alvos, holdout temporal estrito, sobre o painel horário do SIN montado com
DuckDB sobre os parquet públicos. O vencedor é LightGBM nos dois alvos:
Alvo
AUC
Precisão
Recall
F1
ENE, sistema, horizonte de 6 h
0,821
0,924
0,482
0,634
CNF+REL, por conjunto, 30 conjuntos
0,844
0,600
0,611
0,605
E a ablação mostra que o modelo não está apenas redescobrindo o calendário: só calendário dá
0,606 e 0,649; só margem dá 0,729 e 0,659; e o modelo completo chega a 0,821 e 0,844. Os
baselines obrigatórios ficam bem atrás: burro por hora do dia em 0,636 e 0,694, persistência em 0,627
e 0,604, e a regra física margem ≤ 0 em 0,601 e 0,405, ou seja, quase inútil para o alvo de rede.


## Página 35
Conferi os números contra o JSON bruto preservado em referencias/ml/res_part1.json e
res_part2.json , e batem casa decimal a casa decimal.
A tensão entre as duas medições, e a explicação. O relatório 23 mede a persistência em 0,8893,
praticamente empatada com a margem em 0,8966, o que sugeria que a feature quase não ganha do
baseline burro. O relatório 26 mede persistência de apenas 0,627. A diferença é o horizonte, e isso é
o achado:
Horizonte
Persistência
Margem
Modelo aprendido
Mesma hora, nowcast
0,8893
0,8966
não medido
6 horas à frente
0,627
0,601
0,821
No nowcast a persistência empata com a feature. A 6 horas a persistência desmorona e o
modelo aprendido vale 0,2 de AUC. Mas a explicação mais profunda está no lead time do relatório
23: a margem tem mediana de 0 hora de antecedência, porque usa carga e geração da própria
hora. Ela não antecipa nada por construção. O ganho a 6 horas, portanto, não vem de a margem
prever o futuro, e sim de o LightGBM combinar o nível da margem, que é lento, com a persistência e
o calendário, o que o próprio relatório confirma ao apontar ene_lag1 e cnf_lag1 como os sinais
dominantes.
A consequência de produto é uma tarefa, não um número. A camada de decisão de 6 a 48 horas
só terá antecedência real se a margem for reconstruída com insumos previstos, a carga do DESSEM
D-1 e o vento e a irradiância da Open-Meteo, em vez do realizado. É isso que transforma um
diagnóstico em alerta, e é a peça que ainda não está construída.
A ressalva honesta que tem de ir para o slide: o ENE sofreu mudança de regime de 4 vezes entre
treino e teste, de 758 para 3.076 MWh por hora, e a taxa-base saltou de 20,0% no treino para 61,9%
no teste. O ponto de operação calibrado no treino entrega precisão de 0,92 com recall de 0,48, ou
seja, é um detector de alta precisão e baixo recall, e precisa de retreino contínuo e calibração
por janela móvel.
O código e os painéis estão preservados em referencias/ml/ , com os scripts build_panel.py ,
race1_ene.py e race2_cnfrel.py .
27. O prazo do SINapse não tem número, mas tem um indício forte
Não existe prazo numérico em minutos publicado. A exigência é qualitativa: a RO-AO.BR.13, item
4.5, diz "atender de imediato", e o ajustamento operativo real repete "com a maior brevidade possível".
O relógio da apuração é a confirmação de recebimento no SINapse, não a execução física.
Mas há um número, e ele não é norma. O próprio ONS, em blog de arquitetura de dados na AWS,
afirma uma redução de 98% no tempo de execução de comandos, de até 40 minutos por telefone
para menos de 1 minuto com a plataforma. Não é dispositivo, é resultado operacional relatado, e é o
que existe de mais próximo de um lead time.
Também não há valor numérico público de rampa de tomada de carga ou de redução: o SM 2.10
delega ao ONS. Os únicos prazos numéricos são de resposta dinâmica, de 1 a 30 segundos em
frequência, de 0,2 a 20 segundos em tensão e 30 milissegundos em reativo.


## Página 36
E um achado de infraestrutura que vale muito para o time: todo o MPO do ONS, cerca de 350
arquivos, é público por API REST do SharePoint. Foi assim que o subagente baixou as Instruções
de Operação e a Referência Técnica de Ajustamentos Operativos. Isso significa que muitas das
lacunas que pareciam fechadas por não haver documento público, como as inequações de rede e as
Instruções de Operação, podem estar acessíveis por essa via, e vale explorar antes do presencial.
O que a rodada 4 muda
#
Correção
Onde dói
1
O edital do LRCAP não existe e a receita fixa é 
variável de lance
Não citar valor de receita fixa como se 
fosse definido
2
O Anexo II tem 129 barramentos com β de 0,9 
e vale até 11,1%
É o instrumento de pontuação que o 
produto pode ler
3
A TSA é R$ 10,41 por Mvar-hora, não R$ 9,02
Corrige dado que eu havia propagado
4
A Lei 15.042/2024 é de carbono, não de 
armazenamento
Limpa escopo
5
O fator de duração chinês tem denominador 
provincial, de 4 a 10 horas
É o mecanismo transferível, não o valor
6
Austrália e Chile publicam atribuição, o Brasil 
não
Sustenta a tese central do produto
7
A definição de curtailment muda o número 
por 5 vezes
Risco idêntico no nosso 
val_geracaolimitada
8
Os 12 pisos mensais estão extraídos, e o 
anual erra 8.662 GWh
Melhora a feature e mede o erro do 
atalho
9
LightGBM faz 0,821 e 0,844 no holdout, contra 
0,6 dos baselines
Número para a banca, verificado no 
JSON bruto
10
O horizonte decide tudo: no nowcast a 
persistência domina, a 6 h ela desmorona
A camada de decisão tem de ser 6 
horas à frente
11
A regra física crua é fraca: margem ≤ 0 dá 
0,601 e 0,405
Não vender a margem como preditor, 
vender o modelo
12
PTDF é inacessível, e a EPE é o proxy honesto
Define o que a camada de rede pode 
prometer
13
O MPO inteiro é público por API do 
SharePoint
Reabre lacunas que pareciam fechadas
14
O SINapse não tem prazo em minutos, mas o 
ONS relata menos de 1 minuto
O tempo de reposicionar bateria vira 
parâmetro por usina
15
No híbrido o dono captura a arbitragem, ao 
contrário do LRCAP
Inverte a tese de BESS das rodadas 2 e 
3
16
O constrained-off com bateria não tem regra, 
e o prazo é 180 dias
É a lacuna de maior valor e vence em 
dezembro
17
A margem horária bate a persistência por só 
+0,0073 de AUC, e tem lead time mediano de 0 
horas
Ela é explicação, não predição, e não 
pode ser vendida como alerta


## Página 37
#
Correção
Onde dói
18
No limiar físico a margem perde metade dos 
eventos, recall de 0,451 contra 0,894 da 
persistência
O ponto de operação tem de ser 
calibrado, não herdado da física
19
A dobradiça é artefato de empate, e a margem 
crua preserva a mesma ROC
Usar a margem crua, e não escrever a 
dobradiça à mão
20
O caminho para ter lead time é alimentar a 
margem com previsão de carga e de renovável
É a peça de engenharia que falta e o 
maior ganho disponível
O modelo de previsão: resultados, definições, justificativas e
plano
Esta seção reúne o que foi medido, o significado de cada medida, a razão de os números serem o que
são, a justificativa das escolhas feitas e o que construir a seguir.
1. O que foi medido, e o que cada medida significa
Sem as definições, os números não significam nada. As leituras abaixo estão em duas colunas: a
definição técnica e a consequência prática para quem opera a usina.
Medida
Definição técnica
Leitura prática
AUC
Probabilidade de que, sorteando ao acaso uma 
hora com corte e uma hora sem corte, o 
indicador atribua risco maior à hora com corte. 
Mínimo 0,5, quando o indicador não tem 
informação, e máximo 1,0, quando ordena 
perfeitamente
Mede a capacidade de ordenar 
as horas por risco, e não se o 
número reportado está 
calibrado. Serve para comparar 
indicadores entre si
Precisão
Fração das horas apontadas como corte que 
realmente tiveram corte
Quando a ferramenta avisa, ela 
acerta? Precisão baixa significa 
alarme falso e cliente 
incomodado
Recall
Fração das horas que tiveram corte que foram 
apontadas
De tudo que aconteceu, quanto 
a ferramenta pegou? Recall 
baixo significa cliente 
surpreendido
Limiar, ou 
ponto de 
operação
Valor a partir do qual a decisão vira sim. Um 
indicador contínuo precisa de um limiar para 
virar decisão
Precisão e recall são uma 
troca: baixar o limiar aumenta o 
recall e reduz a precisão. A 
escolha depende de qual erro 
custa mais
Correlação
Força da relação linear entre duas séries, de 
menos 1 a mais 1
Mede se as duas séries andam 
juntas, e em que direção
R²
Fração da variação hora a hora do alvo que o 
indicador acompanha
R² de 0,563 significa que a 
margem hidráulica acompanha 


## Página 38
Medida
Definição técnica
Leitura prática
56,3% da variação horária do 
corte por razão energética
Lead time
Quantas horas antes do início de um episódio 
de corte o indicador cruza o limiar
Mediana de zero hora significa 
que, em metade dos episódios, 
o cruzamento e o início caem 
na mesma hora
Taxa-base
Fração das horas do período que tiveram corte
Foi 20,0% no treino e 61,9% no 
teste. Uma mudança desse 
tamanho invalida limiares 
calibrados no período anterior
Ablação
Retirar partes dos insumos, treinar de novo e 
comparar
Mostra quanto cada grupo de 
insumos contribui, e evita 
atribuir a um insumo o que vem 
de outro
Holdout 
temporal
Treinar em um período e testar em outro, 
posterior, sem misturar
É a única medição válida 
quando o alvo muda de nível 
ao longo do tempo
2. Os resultados
Todos medidos por SQL no MCP do ONS, sobre os parquet públicos, no subsistema SIN, de 01/01 a
15/09/2026, em 6.192 horas, das quais 1.994 tiveram corte.
Na mesma hora:
Medida
Margem hidráulica
Persistência, corte da hora anterior
AUC
0,8966
0,8893
Precisão no limiar natural
0,9054
0,8942
Recall no limiar natural
0,4514
0,8942
Horas apontadas
994
1.994
Eventos perdidos
1.094, ou 54,9%
211, ou 10,6%
Ganho da margem sobre a persistência: 0,0073 de AUC.
A seis horas de antecedência, em holdout temporal:
Modelo
AUC no ENE
AUC no CNF+REL
LightGBM, conjunto completo
0,821
0,844
Só a margem
0,729
0,659
Só o calendário
0,606
0,649
Regra física margem ≤ 0
0,601
0,405
Persistência
0,627
0,604


## Página 39
Modelo
AUC no ENE
AUC no CNF+REL
Burro por hora do dia
0,636
0,694
Poder explicativo da margem: correlação de menos 0,7506 com o ENE e de menos 0,8216 com o
corte total, com R² de 0,563 e de 0,675.
Lead time: mediana de 0 hora, média de 0,22 hora, máximo de 4 horas, e 16 dos 211 episódios com 1
hora de antecedência, ou 7,6%.
Mudança de regime: o corte médio por hora no ENE passou de 758 para 3.076 MWh por hora entre
treino e teste, e a taxa-base passou de 20,0% para 61,9%.
3. Por que os números saem assim
3.1 A persistência é forte porque os episódios duram cerca de nove horas
Houve 1.994 horas com corte em 211 episódios, o que dá 9,45 horas por episódio. Em um episódio
dessa duração, uma hora vizinha de uma hora com corte pertence ao mesmo episódio na maior parte
dos casos. Isso explica precisão e recall de 0,8942 para o indicador que apenas repete a hora anterior,
sem usar informação sobre carga, rede ou reservatórios. A força da persistência vem da duração
medida dos episódios.
3.2 O lead time de zero hora decorre da própria definição da margem
A margem da hora h é calculada com a carga e a geração da hora h. No instante em que ela fica
negativa, o evento já está ocorrendo naquela hora. Não há, na fórmula, informação sobre horas
futuras, então a mediana de zero hora é o que qualquer medição encontraria. A média de 0,22 hora
vem dos episódios em que o cruzamento aconteceu uma hora antes de a apuração registrar o corte.
Para obter antecedência é necessário calcular a margem com carga e geração previstas.
3.3 Por que a margem e a persistência empatam na mesma hora
As duas leem o estado atual do sistema. A persistência lê o estado pelo resultado da hora anterior, e a
margem lê o estado pelo nível de sobreoferta da hora corrente. Quando o episódio médio dura nove
horas, as duas leituras carregam a mesma informação sobre estar dentro ou fora do episódio, e a
diferença de 0,0073 de AUC é o que sobra.
3.4 Por que a margem perde 54,9% dos eventos, e por que isso importa
No limiar margem ≤ 0 , a margem aponta corte em 994 horas e acerta 900, com precisão de 0,9054 e
recall de 0,4514. A persistência aponta 1.994 horas e acerta 1.783, com precisão e recall de 0,8942.
As 1.094 horas que a margem perde têm uma explicação concreta. O ONS decide o corte com base
no balanço previsto do DESSEM, e a apuração registra o balanço realizado. Quando a previsão
indicava rompimento do piso e a realização ficou acima dele, o corte ocorreu igualmente, e a margem
realizada aparece positiva em uma hora com corte. A margem realizada, portanto, não é a mesma
variável que o operador usou para decidir. Um modelo treinado sobre a margem realizada aprende
uma variável diferente da variável de decisão do ONS. É essa a razão pela qual substituir os insumos
realizados pelos previstos não é apenas um ganho de acurácia, mas uma correção do alvo do modelo.


## Página 40
3.5 Por que o modelo ganha a seis horas
A seis horas, a persistência carrega o valor da hora atual para uma hora na qual o episódio pode ter
terminado, e não tem como representar a duração restante nem a profundidade do déficit. A margem
informa o nível do déficit e a direção em que ele se move, e essas duas quantidades se relacionam
com o tempo restante do episódio. Daí o ganho medido de 0,627 para 0,821 de AUC, uma diferença
de 0,194. A ablação mostra a divisão de trabalho: só a margem dá 0,729, só o calendário dá 0,606, e o
conjunto dá 0,821.
3.6 Por que o corte de rede exige outro modelo
CNF e REL são cortes por restrição de rede. Ocorrem quando um equipamento, uma linha ou um
transformador atinge o limite e o ONS reduz geração a jusante para aliviar a carga. O piso hidráulico
não participa dessa decisão. Aplicada ao CNF+REL, a regra margem ≤ 0 dá AUC de 0,405, abaixo de
0,5, o que significa que ela ordena pior que um sorteio e não carrega informação sobre esse alvo. O
que carrega informação é a exposição de rede do conjunto, medida pela fração histórica de CNF e
REL e pelo dsc_restricao .
3.7 Por que o recall do modelo caiu para 0,48
A taxa-base passou de 20,0% no treino para 61,9% no teste. O limiar foi escolhido no período de
treino, quando o objetivo era manter precisão alta em um regime de corte pouco frequente. No período
de teste, com corte frequente, o mesmo limiar exclui horas que passariam a ser aceitáveis incluir. O
resultado é precisão de 0,92 com recall de 0,48. O ajuste é recalibrar o limiar em janela móvel, usando
a taxa-base recente.
4. As escolhas feitas, e a justificativa de cada uma
Escolha 1: comparar a margem com um baseline burro, em vez de apenas reportar o
desempenho da margem. Um AUC de 0,8966 parece bom isoladamente. Sem comparação, não se
sabe se o valor vem da física da margem ou da persistência do fenômeno. A comparação foi o que
revelou que a margem e a persistência empatam, e essa informação decide o posicionamento do
produto.
Escolha 2: usar AUC como métrica principal. O trabalho é ordenar horas por risco, porque a
decisão é priorizar atenção e preparação. AUC mede exatamente a capacidade de ordenar, e não
depende do limiar escolhido. Precisão e recall dependem do limiar, então foram reportados depois,
com o limiar declarado.
Escolha 3: usar o limiar físico margem ≤ 0 como ponto de operação da margem. É o limiar que o
próprio critério publicado usa, o que torna a comparação defensável: não se escolheu um limiar
conveniente para a margem, usou-se o dela.
Escolha 4: separar ENE de CNF e REL em dois modelos. A seção 3.6 mostra que os dois têm
causas diferentes. Um modelo único misturaria dois fenômenos e não aprenderia nenhum, e a média
esconderia que um deles é imprevisível pelas variáveis disponíveis.
Escolha 5: usar árvores com reforço por gradiente, na prática o LightGBM. A decisão vem da
forma da relação, não da moda. O gatilho só existe abaixo de um nível, e só importa quando várias
condições ocorrem juntas, com renovável alta, carga baixa e horário de meio-dia. Árvores de decisão


## Página 41
dividem o espaço em faixas e combinam condições, o que representa limiar e interação sem que
ninguém precise escrever a interação à mão, e o reforço por gradiente ajusta muitas árvores
pequenas em sequência, cada uma corrigindo o erro da anterior, o que costuma ganhar de uma
floresta aleatória em alvos raros e estruturados.
Escolha 6: medir a seis horas, e não apenas na hora corrente. A medição na hora corrente
responde se o estado atual é suficiente, e a resposta foi que ele é, porque a persistência empata. A
medição a seis horas responde à pergunta que o produto precisa responder, que é se há tempo hábil
para agir. As duas medições juntas produzem a conclusão útil: o estado atual basta para descrever,
mas não para antecipar.
Escolha 7: não usar rede neural de sequência. A base tem cerca de 6.192 horas no recorte de
validação e cerca de 200 episódios de corte. Redes de sequência precisam de muito mais dados para
superar árvores em dados tabulares, não há medição que mostre ganho neste caso, e há um custo
adicional relevante: um modelo cuja decisão não se explica é difícil de defender em um produto que
também serve para instruir pedido de ressarcimento.
Escolha 8: concluir por explicação e propor a reconstrução com previsão. Como o ganho sobre o
baseline é de 0,0073 na hora corrente, apresentar a margem como preditor seria frágil, e a banca
encontraria a inconsistência. Como a margem é o critério do próprio operador e pode ser calculada
com insumos previstos, ela é o caminho para a camada de 6 a 48 horas. A conclusão preserva o valor
e mantém a honestidade do resultado.
5. O modelo a construir
Alvo duplo. Um classificador para "haverá corte acima de X MWh nesta janela" e um regressor para a
magnitude esperada. As duas perguntas são diferentes e as duas têm uso: a primeira decide se vale
preparar, e a segunda, que dimensiona a bateria e define quanto reduzir dentro da banda de tolerância
do item 4.13.
Saída probabilística. A usina precisa de risco, não de um número único. Como a entrada
meteorológica é um conjunto de 51 membros, o caminho é aplicar o modelo a cada membro e reportar
a probabilidade de corte, a probabilidade de corte acima de um limiar e a faixa esperada em MWh,
usando a dispersão como medida de incerteza.
Calibração. A probabilidade reportada precisa corresponder à frequência real. Se o modelo diz 70%, a
expectativa é que ocorra em 70% dos casos. Isso se obtém com calibração isotônica ou de Platt,
refeita em janela móvel, pela razão da seção 3.7.
Um modelo por horizonte, de 1, 6, 24 e 48 horas. Os fatores que dominam mudam com o prazo: na
hora corrente domina o estado atual, e em 48 horas dominam a trajetória dos reservatórios e a carga
prevista.
Baselines publicados junto. Todo relatório de acurácia deve trazer, na mesma tabela, a persistência
e o calendário, para que o ganho do modelo apareça e para que o empate na hora corrente seja
declarado em vez de descoberto.
6. A feature a adicionar: a margem calculada com insumos
previstos


## Página 42
A troca é substituir cada insumo realizado pelo seu valor previsto:
O requisito mínimo usa o piso mensal já extraído nesta rodada, que reduz o erro em 8.662 GWh
quando comparado ao valor anual.
Os insumos do residual, e de onde vem cada previsão
Insumo
Fonte primária
Alternativa ou reforço
Observação
Carga
Balanço do DESSEM 
em D-1, no dado 
aberto do ONS
Relatório diário de previsão 
de carga do ONS, as 
revisões semanais, e o 
PMO para o mensal
É o insumo de menor erro, 
e serve de âncora para os 
demais
Térmica
Despacho térmico 
por patamar no 
DESSEM em D-1
Programação diária da 
operação do ONS
Separar a parcela inflexível, 
que é praticamente 
constante
Geração 
distribuída
Não entra no 
DESSEM no mesmo 
formato
Extrapolação de tendência 
do registro da ANEEL, ou 
proxy por irradiância vezes 
capacidade instalada, ou 
modelo sazonal com 
tendência sobre a série 
observada
É o insumo de maior risco: 
ele é subtraído do residual, 
então o erro entra direto na 
margem
Eólica
Conjunto de 51 
membros da Open-
Meteo a 100 m, 
convertido por curva 
de potência por 
complexo
Ensembles do ECMWF e do 
GEFS, ambos abertos, e as 
previsões do CPTEC e do 
INMET
A geração eólica do 
Nordeste é muito 
correlacionada entre 
complexos, então poucos 
pontos representativos com 
uma curva agregada já 
bastam
Solar
Irradiância global da 
Open-Meteo por 
agrupamento de 
usinas, convertida 
por taxa de 
desempenho
Ensemble do ECMWF e os 
modelos do INPE
O erro é dominado por 
nebulosidade, que o 
ensemble representa
Piso 
mensal
PAR/PEL, Tabela 6.3, 
extraída nesta rodada
RT DGL-ONS 0189/2025 e 
as notas do GT Curtailment
O valor mensal corrige a 
subestimação do anual nos 
meses de janeiro a junho e 
novembro a dezembro
Insumos adicionais, além do DESSEM e da Open-Meteo
Energia natural afluente prevista, do ONS. Define a trajetória do nível dos reservatórios, que é o
que dá alcance de semanas à margem.
PMO, Programa Mensal de Operação. Traz o despacho mensal previsto e a expectativa de
afluência, e é documento que o consultor já usa.
Limites de intercâmbio e das interfaces, em especial a Nordeste-Sudeste. Parte relevante do
corte do Nordeste decorre de limite de exportação, e não do piso hidráulico. Isso pertence ao


## Página 43
7. A camada de decisão de 6 a 48 horas
A promessa de produto que resulta disso é planejamento de 6 a 48 horas combinado com diagnóstico
em tempo real. A camada de 1 hora não supera a persistência, conforme a seção 3.3, e essa
informação deve acompanhar o material em vez de ser omitida.
8. Como isso realimenta as decisões de produto
Decisão
Horizonte que a 
serve
O que a alimenta
Deslocar janela de 
manutenção
24 a 48 h
Probabilidade e duração esperada, 
comparadas ao custo de O&M
Posicionar a carga da bateria
6 h, que é o prazo 
restritivo
Probabilidade, porque o carregamento 
precisa ocorrer antes do evento
Provisionar a franquia e 
preparar o pedido
mensal
Volume esperado por razão, e não apenas a 
ocorrência
modelo de rede.
Limites de operação e restrições elétricas do PMO, e as Instruções de Operação, acessíveis
pela API do SharePoint do MPO.
ERA5, reanálise, para o treino histórico. Mantém a mesma base meteorológica ao longo da
série, evitando mudança de modelo no meio dela.
Registro da ANEEL, SIGA e SIGEL, para a capacidade instalada de geração distribuída e para
identificar as usinas por conjunto.
Histórico de curtailment do ONS, com dsc_restricao e razão, e a fração histórica de CNF e
REL por conjunto, para o modelo de rede.
Caso ANAREDE da EPE e base TUST-RB em formato Nodal, usados para ordenar sensibilidade
relativa entre conjuntos, e não para afirmar violação.
Telemetria e torre anemométrica do próprio cliente. É o único insumo que melhora a curva de
potência do complexo específico, e é também um elemento comercial, porque o dado privado do
cliente melhora o modelo dele.
1. Entrada em dois a quatro ciclos por dia, no 00Z e no 12Z, alinhados à publicação do DESSEM
e da Open-Meteo.
2. Montar a margem projetada por horizonte, de 1, 6, 24 e 48 horas, substituindo os insumos
realizados pelos previstos e aplicando o modelo aos 51 membros, para obter distribuição em vez
de valor único.
3. Dois modelos por horizonte, o classificador de probabilidade e o regressor de magnitude.
4. Calibrar as probabilidades em janela móvel e reancorar o limiar à taxa-base recente, conforme
a seção 3.7.
5. Entregar três informações: probabilidade de corte, volume esperado em MWh e duração
esperada do episódio, acompanhadas da faixa de incerteza vinda da dispersão do ensemble.
6. Publicar os baselines na mesma tabela em que se reporta o desempenho do modelo.
7. Retreinar mensalmente em janela móvel, com um monitor que avisa quando a taxa-base muda
o suficiente para invalidar a calibração.


## Página 44
Decisão
Horizonte que a 
serve
O que a alimenta
Definir a profundidade da 
redução
1 a 6 h
Magnitude prevista, porque fora da banda o 
crédito é o corte nominal
Dimensionar a bateria
projeto
Volume e duração da cauda dos episódios
9. As sugestões para a próxima sessão
Primeiro, reconstruir a margem com insumos previstos. É a única alteração que muda a promessa
de produto. Na hora corrente, a feature empata com a persistência; com insumos previstos, a camada
de 6 a 48 horas passa a ter base física, e o alvo do modelo deixa de ser uma variável diferente da que
o ONS usa para decidir, conforme a seção 3.4.
Segundo, explorar o MPO pela API do SharePoint. Cerca de 350 arquivos do manual do ONS são
públicos por essa via, e foi assim que se obteve a Referência Técnica de Ajustamentos Operativos. É
o caminho para as inequações de rede e as Instruções de Operação.
Terceiro, acompanhar os 180 dias da REN 1.162/2026. A regra de constrained-off com bateria não
está publicada, o prazo vence em dezembro de 2026, e é o dispositivo que decide se a energia
absorvida pela bateria durante um corte conta como geração.
