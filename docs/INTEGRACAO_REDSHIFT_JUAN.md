# Requisitos da mart CurtailIQ para Juan — contrato, cobertura e stress test

Revisão estática do backend e frontend atual. Não é validação da publicação Redshift atual nem resultado de teste de carga.

As afirmações sobre o código foram conferidas linha a linha em `app/repositories/postgres_repo.py`, `app/config.py`, `app/routers/usinas.py` e `front/src/lib/dateWindows.ts` na revisão de 25/09/2026.

## Mensagem curta para encaminhar ao Juan

> Juan, revisei as consultas reais do CurtailIQ e o que as telas consomem. Para o primeiro corte funcional, preciso de uma mart COFF para **todo o Brasil**, com a janela contínua mais recente e uma tabela/views com o contrato abaixo. O front abre por padrão 188 dias e permite selecionar até 365 dias; por isso, proponho entregar pelo menos **13 meses completos** no mart (o período de 30 dias serve para o teste inicial, mas não cobre toda a janela do produto).
>
> Para o stress test, por favor rode a pipeline e consulte a mart no recorte dos **últimos 30 dias completos de todos os submercados/UFs**, sem filtro Nordeste e sem `LIMIT` que esconda o total. Envie: tempo de extração/transformação/carga, linhas e usinas por fonte/submercado/UF, `MIN/MAX(din_instante)`, duplicatas pela chave do grão, cobertura de CEG/`id_ons`, cobertura da junção do PLD, códigos de razão/origem ausentes e tempos de query frio/quente. Depois, faça o mesmo para a janela de 13 meses, se couber. Se a ONS não tiver 13 meses de COFF, informe a cobertura real; cadastro histórico da ANEEL não deve ser contado como histórico de COFF.
>
> **Separação importante:** preciso do COFF por conjunto ONS para razão/origem e total regulatório/financeiro, e do detalhe por usina apenas para drill-down técnico. Não replique o total do conjunto em cada usina. Se a energia por usina for alocada/estimada, inclua o método e marque como estimativa. Preserve CEG, `id_ons`, os valores-fonte e a versão da regra/cálculo. Não misture `val_geracaoestimada` com `val_geracaoreferenciafinal` nem converta dado ausente em zero.
>
> Como compatibilidade imediata, o código procura hoje treze objetos em dois caminhos. O principal usa `dw.mart_restricao_solar_2026`, `dw.mart_restricao_eolica_2026`, `dw.mart_solar`, `dw.mart_eolica`, `dw.dim_usina`, `dw.dim_usina_potencia`, `public.ccee_pld_horario` e `public.aneel_siga`. O de contingência lê `public.restricao_coff_eolica_usi`, `public.restricao_coff_fotovoltaica`, `public.fator_capacidade_2`, `public.geracao_usina_2` e `public.disponibilidade_usina` — as duas primeiras são a série COFF por usina que alimenta perda, resumo, previsão e dossiê. **Publicar só as oito primeiras quebra essas rotas.** Se sua publicação usar nomes/schema diferentes, mande o mapeamento e o dicionário de dados.
>
> Um alerta operacional: esse caminho de contingência é acionado por erro de SQL, não por ausência de dado. Na prática, **renomear ou deixar de publicar uma view `dw.*` não gera erro — gera número diferente**, porque as duas fontes aplicam regras distintas de referência. Se for mudar nome de objeto, avise antes.
>
> A credencial deve ser de leitura e chegar por secret manager/canal seguro, não por chat ou código.

## O que a implementação atual realmente consome

### Backend

- `Settings` aceita hoje `DATA_BACKEND=mock|postgres`, com validador que rejeita qualquer outro valor; o padrão **no código** é `mock`, mas o `.env` versionado define `DATA_BACKEND=postgres` apontando para o host remoto — essa é a verdade do ambiente implantado. Nesse host, cada consulta do produto leva cerca de 130 s, o que por si só já justifica o stress test. Não há `DATA_BACKEND=redshift`, e o loader experimental em `app/data_load/` não é importado por nenhum módulo fora dele: está órfão.
- `MVP_ONLY_NORDESTE` é verdadeiro por padrão. O repositório PostgreSQL contém consultas para as views `dw.*` citadas acima, a dimensão de usinas/capacidade da ANEEL e a série de PLD da CCEE. Há ainda uma inconsistência no código: a listagem lê `mart_restricao_*_2026`, enquanto o detalhe resolve `mart_restricao_*` sem sufixo. Recomendo publicar uma view estável e sem ano no nome; se for preciso compatibilidade imediata, criar aliases para ambos os nomes ou ajustar o repository junto com a nova conexão.
- A consulta atual de lista de usinas lê fatos de restrição apenas até `MAX(din_instante) - 2 months`, ranqueia no máximo 30 unidades por fonte e corta em `LIMIT 60`. Isso é mais do que "não serve de teste de carga": como a rota devolve `total_count = len(data)` sobre um conjunto já truncado, e o frontend usa esse `total_count` para decidir quantas páginas buscar, **o produto hoje não consegue exibir mais de 60 usinas no país inteiro, com qualquer filtro** — e o contador "N usinas" na tela é o número truncado, não o real. É teto de produto, não só de benchmark. Precisa de contagem/paginação nacional de verdade, ou consulta de benchmark direto à mart.
- O repositório usa uma tabela de detalhe por fonte (`mart_restricao_solar/eolica`) e outra de conjunto (`mart_solar/eolica`). O vínculo atual é por timestamp e `nom_usina`/nome do conjunto. É frágil se nome não for único ou variar; peço uma chave estável de conjunto/evento na publicação.
- A projeção atual do resumo usa `corte_mwh` e `corte_ressarcivel_mwh`, agrega valor por PLD e contabiliza `pld_faltante_intervalos`. Para a UI e para auditoria, faltas de PLD devem continuar como faltas, não virar perda zero silenciosamente. **Isso já está sendo violado do nosso lado**: a consulta de lista soma `corte_mwh * COALESCE(pld_reais_mwh, 0)`, ou seja, intervalo sem PLD entra como perda zero no total do portfólio. É correção nossa, não pedido ao Juan.
- **Inversão de prioridade entre referência oficial e estimativa.** No caminho `dw` do detalhe, a referência é resolvida como `COALESCE(val_geracaoestimada, val_geracaoreferenciafinal_conjunto, val_geracaoreferencia_conjunto, 0)` — a **estimativa vem primeiro**. Pior: a mesma consulta marca `referencia_oficial = true` quando `val_geracaoreferenciafinal_conjunto IS NOT NULL OR corte_mwh IS NOT NULL`, condição que pode ser verdadeira enquanto o valor efetivamente usado veio da estimativa. É um selo de "oficial" sobre um número que não é. Os demais caminhos do repositório fazem a ordem correta (`referenciafinal` e depois `referencia`), então é inconsistência interna, não convenção adotada. Precisa ser corrigido antes de qualquer saída ser chamada de apuração.

### Frontend e janelas

- `front/src/lib/dateWindows.ts`: janela inicial de **188 dias**, máximo selecionável de **365 dias**. Sem `availableFim` vindo da API, usa fallback fixo `2026-05-29 23:30`, que já está defasado. O `data_fim` **por usina** não é item de qualidade, é requisito funcional: é ele que ancora a janela de datas e os atalhos do seletor de período. Sem ele, toda usina abre no fallback de maio/2026.
- Portfólio/mapa precisam de ID estável, nome, fonte, capacidade, submercado/UF, coordenadas, CEG/`id_ons`, totais com período e cobertura. O frontend pagina e busca em lotes de 200, mas o backend devolve no máximo 60 linhas no total (ver acima), então a paginação hoje percorre um universo truncado.
- Resumo/financeiro/BESS usam série temporal de energia restringida e PLD; resumo e risco também recebem método, cobertura, observações e data disponível. Os rótulos não podem chamar estimativa a PLD de “receita perdida”/“ressarcível” sem método e status de apuração.
- Regulação/dossiê/franquia precisam de razão/origem e histórico temporal para agregar intervalos em eventos. Cada linha COFF de 30 minutos é um **intervalo**, não um evento regulatório independente. A unidade regulatória/financeira principal é o conjunto ONS; usina individual é drill-down técnico.
- `front/src/api/operacao.ts` também prepara SCADA, janelas previstas, ordens, agendamento, backtest e gargalos; atualmente só `/api/operacao/demo` está publicado. ONS COFF/ANEEL não substitui SCADA, previsão meteorológica nem ordens de serviço. Não incluir esses dados no escopo desta primeira mart.

## Contrato lógico solicitado

Nomes abaixo são compatibilidade com o repositório atual. Se o pipeline já usa outros nomes, basta fornecer views equivalentes e o mapeamento. Preferência por views estáveis, sem obrigar o backend a ler bronze/raw.

### 1. COFF oficial por conjunto ONS — grão primário regulatório/financeiro

Nome compatível: `dw.mart_solar` e `dw.mart_eolica` (ou uma view equivalente por conjunto/fonte).

Uma linha por conjunto ONS × intervalo × versão/publicação, com:

- chave estável do conjunto/registro/evento ONS; identificador da fonte (solar/eólica) e chave para a usina/detalhe quando houver;
- `din_instante` e limite/fim do intervalo ou `duracao_minutos`; timezone declarado (não inferir pelo host);
- `nom_usina`/identificador do conjunto, `id_estado`, `nom_estado`, `id_subsistema`, `nom_subsistema`;
- `cod_razaorestricao` e `cod_origemrestricao` nos valores originais ONS, descrição/categorização se já curada, mantendo o código bruto;
- valores de referência/geração originais e suas unidades: em particular `val_geracaoreferenciafinal` distinto de referência estimada/bruta, `val_geracaoverificada`, `val_geracaolimitada`;
- `corte_mwh` do intervalo apenas se a definição/unidade/fórmula estiver documentada; para intervalos de 30 min, identificar se a entrada é MW médio e como a conversão para MWh foi feita;
- status ou grandeza ressarcível apenas com regra/fonte/versão explícita; não assumir que razão isolada prova elegibilidade.

Não preencher `val_geracaoreferenciafinal` com `val_geracaoestimada` nem colapsar ambos num campo “referência”. Não é só um risco teórico: um caminho da implementação atual dá **prioridade** à estimativa sobre a referência final e ainda assim marca o registro como referência oficial. A publicação precisa manter os dois campos distintos e nomeados, para que a correção do nosso lado seja possível.

### 2. Detalhe por usina — drill-down técnico, sem duplicar o conjunto

Nomes compatíveis: `dw.mart_restricao_solar_2026` e `dw.mart_restricao_eolica_2026`.

Colunas atualmente lidas pelo repositório: `nom_usina`, `id_ons`, `ceg`, `fonte`, `id_estado`, `nom_estado`, `id_subsistema`, `nom_subsistema`, `nom_conjuntousina`, `nom_usina_conjunto`, `potencia_mw_conjunto`, `din_instante`, `corte_mwh`, `corte_ressarcivel_mwh`, `val_geracaoverificada`, `val_geracaoestimada`, `val_geracaoreferenciafinal_conjunto`, `val_geracaoreferencia_conjunto`, `val_corte_mwmed`, `cod_razaorestricao`, `cod_origemrestricao`.

Solicito também:

- grão/chave única confirmados; `id_ons` e CEG sem perda de zeros/formatos relevantes;
- capacidade da própria usina separada da capacidade do conjunto;
- indicar se o corte/ressarcimento é realmente publicado por usina ou foi alocado do conjunto. Se for alocação, incluir `metodo_alocacao`, nível de granularidade e flag de estimativa. Não replicar valor do conjunto em cada unidade, o que inflaria os totais;
- razão/origem oficial pode continuar no nível do conjunto; publicar a chave para ligação e deixar claro quando não existe razão oficial por unidade.

### 3. Cadastro, potência e geolocalização

Nomes compatíveis: `dw.dim_usina`, `dw.dim_usina_potencia` e, se aplicável, uma view curada de `public.aneel_siga`.

Campos: chave estável CurtailIQ, `id_ons`, CEG, nome oficial, fonte, UF, subsistema/submercado, latitude/longitude, status e datas de vigência, potência fiscalizada e outorgada em MW com unidade/origem. `id_ons` ausente deve preservar CEG como chave de fallback; não usar nome como identidade principal. Coordenadas e potência ausentes ficam nulas, não zero. Potência do conjunto não é potência de cada usina.

A ANEEL pode completar cadastro, capacidade e vigência. Para “outros anos”, indicar exatamente qual série e tabela: não tratar histórico cadastral ANEEL como histórico operacional de curtailment/COFF sem fonte e semântica comprovadas.

### 4. PLD CCEE por hora e submercado

Compatibilidade atual: `public.ccee_pld_horario`; alternativa: view curada com os mesmos campos lógicos.

- timestamp/hora de referência, código original do submercado (incluindo `SE/CO` quando assim vier da CCEE) e código normalizado compatível com a aplicação (`N`, `NE`, `SE`, `S`), `pld_reais_mwh`, moeda/unidade, fonte, publicação/revisão; documentar a regra de conversão, sem perder o original;
- explicar a interpretação de `mes_referencia`, `dia`, `hora` e timezone. Uma hora PLD pode valorar intervalos COFF de 30 min; preservar alinhamento documentado;
- cobertura e faltas por hora/submercado. Não preencher falta com zero; o backend deve expor cobertura/missing.

### 5. Proveniência e qualidade em todas as views

Incluir ou fornecer metadados do lote: `source_system`, dataset/arquivo ONS, `pipeline_run_id`/snapshot, `published_at`/`loaded_at`, revisão/as-of, `is_current` ou regra de seleção, data/hora máxima e estado de completude. Informar política para atualização retroativa. Chave mínima sem duplicatas no grão e ligação estável entre conjunto, unidade, CEG e `id_ons`.

## Janela para operação e janela para performance

- **Entrega funcional:** pelo menos 13 meses completos de COFF e PLD de todo o país, se a fonte ONS permitir. O front permite até 365 dias; a folga adicional dá margem para limites inclusivos e virada do ano/franquia. Reportar exatamente a primeira/última data e lacunas. Não preencher lacunas com zeros.
- **Primeiro stress:** últimos 30 dias completos disponíveis, todos os estados e submercados, solar + eólica, sem filtro NE e sem top-N/LIMIT na extração de medição. Reportar atraso entre o intervalo mais recente e a atualização da mart.
- **Backfill/limite real:** ampliar para 13 meses nacionais e executar as mesmas métricas. Se COFF histórico não existir, separar o que é ONS, o que é ANEEL e o que continua indisponível; não “estender” série COFF com cadastro.

## Plano do teste de stress e saída solicitada

1. Medir separadamente tempo de coleta ONS, transformação Databricks e publicação/refresh Redshift; reportar início/fim, linhas lidas/escritas e tamanho aproximado.
2. Para 30 dias e 13 meses, fornecer contagens por fonte, mês/dia, UF e submercado; número de usinas/conjuntos únicos; `MIN/MAX(din_instante)`; razão/origem nula; CEG/`id_ons` não mapeados; duplicatas pela chave de grão; cobertura da junção do PLD.
3. Medir a consulta filtrada por janela e submercado no Redshift, fria e aquecida. Reportar duração, linhas retornadas/lidas, spill/bytes se disponível; sem retornar payload bruto desnecessário.
4. Depois de ligar o repository, repetir no caminho HTTP realmente usado pelo front: portfólio nacional paginado, resumo por usina em 188 dias e em 365 dias, eventos/franquia e perda com PLD. Medir p50/p95 e erro sob concorrência; anotar cache frio/quente. O endpoint atual limitado a 60 resultados não é evidência de que todo o país foi entregue.
5. Registrar baseline antes de otimizar. O pedido agora é descobrir se ainda há demora; nenhum tempo/SLO é declarado medido neste documento.

## Critérios de aceite do primeiro mart

- Último intervalo recente confirmado e atualizado; cobertura nacional explicitamente quantificada, inclusive UFs/submercados sem linhas.
- Grão e chave estáveis, sem duplicatas indevidas; valores, duração e timezone documentados.
- COFF do conjunto separado de drill-down da usina; nenhum total regulatório duplicado por junção.
- CEG/`id_ons`/cadastro conciliáveis; capacidade e coordenadas com origem/unidade; nulos preservados.
- PLD alinhável, faltas quantificadas; razão/origem preservadas nos códigos originais.
- Campo oficial de referência final distinto de geração estimada; cálculo de energia e política ressarcível/versionamento auditáveis.
- Métricas de carga de 30 dias e 13 meses entregues; latências observadas no mart e, depois, na API do produto.
- Acesso somente leitura e segredo fora do Git, dos logs e do navegador.

## Bloqueios/implementação subsequente

Mesmo com a mart pronta, é necessário adaptar o repositório do backend para o endpoint/driver Redshift, expor `DATA_BACKEND=redshift`, manter a visão NE como escopo comercial do MVP se essa for a decisão e retornar cobertura/freshness para o frontend. As rotas de SCADA/agendamento/backtest são outro produto de dados e não ficam resolvidas por COFF+ANEEL.

Correções do nosso lado que **não dependem do Juan** e deveriam entrar junto, em ordem de impacto:

1. Remover o `LIMIT 60` / `fonte_rank <= 30` do caminho nacional e paginar de verdade, devolvendo `total_count` real. Hoje é teto de produto.
2. Inverter a precedência de `val_geracaoestimada` para depois de `val_geracaoreferenciafinal_conjunto`, e corrigir o selo `referencia_oficial` para refletir a coluna efetivamente usada, não a existência dela.
3. Parar de somar `COALESCE(pld_reais_mwh, 0)` na lista: intervalo sem PLD tem que ficar como falta e aparecer na cobertura, não virar perda zero.
4. Unificar o nome das views de restrição (`mart_restricao_*` com e sem sufixo de ano) entre listagem e detalhe.
5. Fazer o caminho de contingência `public.restricao_coff_*` ser explícito e observável — hoje ele é acionado por exceção de SQL e troca a semântica de referência sem que a resposta diga qual fonte respondeu.
