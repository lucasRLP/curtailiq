# Requisitos de dados para CurtailIQ (contrato lógico)

Status: **o contrato abaixo descreve requisitos lógicos, não uma API implementada**. Atualização: Juan informou que Databricks automatiza a pipeline para AWS Redshift; não confirmou uma API HTTP. Para o ingresso atual, alinhar views/tabelas e acesso read-only direto ao Redshift conforme `INTEGRACAO_REDSHIFT_JUAN.md`. O notebook `data/awsredshaft (1).ipynb` permitiu ler uma fonte associada a `datalake`, cuja `fato_geracao` observada cobre 2000–2011; ainda não sabemos se é o database/schema de publicação atual do Juan. Não ligar essa fonte histórica a COFF/forecast atual. Requisitos de grão/unidade/identidade/freshness abaixo seguem válidos para Redshift ou eventual API.

## 1. Fronteira de responsabilidades

Time de dados: ONS/CCEE/clima/cadastro → ingestão, normalização, deduplicação, qualidade básica, snapshots/revisões → tabelas/views curadas no Redshift AWS (Databricks). Uma API HTTP futura só se o responsável a confirmar.

Backend CurtailIQ: consumo defensivo read-only do Redshift, regras de domínio, cálculos identificados por método, previsão, cenários, recomendações, evidências e API para frontend. Não baixa novamente dados brutos para substituir o pipeline do colega.

Preservar os campos e a unidade originais para auditoria. O time de dados pode publicar derivados acordados, mas não introduzir segunda fórmula de negócio concorrente. Identificar método/versão de qualquer derivado.

## 2. Conjuntos de dados por prioridade

| Prioridade | Dataset lógico | Grão esperado | Necessidade |
|---|---|---|---|
| P0 | Cadastro e aliases | ativo + intervalo de vigência | IDs internos, id_ons, CEG, fonte, UF, subsistema, potência e tipo de ativo |
| P0 | Relação usina/conjunto | usina + conjunto + vigência | Não aplicar associação atual a todo histórico |
| P0 | Restrição COFF agregada | conjunto + intervalo + identidade/revisão de origem | geração, referência, teto, razão/origem, descrição e grandeza apurada com unidade |
| P0 | Detalhamento COFF | usina + intervalo + identidade/revisão | física individual e qualidade, sem atribuição artificial de razão |
| P0 | Geração e PLD | ativo/tempo e submercado/hora | Valoração auditável e cobertura temporal |
| P0 | Manifesto/capabilities | dataset + snapshot | cobertura, schema, proveniência, estado e revisões |
| P1 | DESSEM programado | subsistema + instante válido + emissão | Carga, renováveis, MMGD quando presente, térmicas e demais componentes identificados |
| P1 | Previsão meteorológica | localização + instante válido + emissão + modelo/membro | Backtest e decisão com vintages, não reanálise disfarçada |
| P1 | Balanço realizado | subsistema + intervalo + publicação | Diagnóstico e lags disponíveis, sem duplicar SIN + subsistemas |
| P2 | Rede/capacidade/descrições | equipamento + vigência/snapshot | Exposição histórica; não alegar estado elétrico real reconstruído |

Privados e separados: ordens de manutenção, disponibilidade operacional renovável, telemetria, mensagens SINapse exportadas, conexão/medição e contratos do cliente. Não esperar que ONS público forneça SCADA por turbina ou ordens de serviço.

## 3. Envelope mínimo de resposta

Nomes ilustrativos, sujeitos ao OpenAPI acordado:

```json
{
  "schema_version": "v1",
  "dataset_id": "identificador_do_dataset",
  "snapshot_id": "release_imutavel",
  "generated_at": "timestamp_com_offset",
  "source_updated_at": "timestamp_com_offset_ou_null",
  "coverage": {
    "interval_start": "timestamp_com_offset",
    "interval_end": "timestamp_com_offset",
    "is_complete": false,
    "missing_reason": "motivo_ou_null"
  },
  "next_cursor": null,
  "items": []
}
```

Esse JSON é uma especificação ilustrativa, não payload recebido. Timestamps ilustrativos acima não são valores ISO válidos para uso em testes: fixtures executáveis deverão ter datas reais de exemplo e selo sintético.

Exigir snapshot estável para todas as páginas. Se isso não for oferecido, negociar export imutável para estudos; não chamar de reproduzível uma consulta paginada cuja base muda durante leitura.

## 4. Temporalidade por registro

- `interval_start`, `interval_end`: intervalo físico `[início,fim)`, timezone explícito. Duração derivada ou verificada contra o intervalo.
- `issued_at`: emissão de uma previsão/programação; nulo quando não se aplica.
- `published_at`: publicação pela fonte, quando disponível.
- `available_at`: instante em que o dado estava efetivamente disponível ao consumidor, com definição e evidência. Não inventar a partir do horário físico.
- `ingested_at`: recepção pelo pipeline; não equivale necessariamente à publicação na origem.
- `revision_id` e `supersedes`: distinguir republicação de evento novo.
- `valid_from`, `valid_to`: vigência do cadastro/regra quando aplicável, distinta do momento de conhecimento dessa vigência.

Se a API só possui snapshot final, declarar `supports_point_in_time=false`. Isso permite relatório histórico, mas não prova backtest implementável de 6h. Para previsões futuras, preservar snapshots desde já.

Para replay, a versão escolhida precisa ter sido conhecida no instante da decisão. Um `as_of` que apenas filtra o timestamp físico não resolve revisões futuras.

## 5. Semântica e unidades

### COFF

Obrigatórios: identidade da linha/evento na origem, grão, ativo, intervalo, natureza da observação, qualidade e proveniência.

Campos físicos opcionais com nulo explícito: geração verificada, geração de referência, referência final, geração limitada, geração estimada, disponibilidade e campo apurado original. Cada um deve ter unidade documentada. Não chamar MW de MWh por alias.

Em especial, `val_geracaonaorealizadaapurada` precisa vir com dicionário, versão e amostra. Seu nome não prova unidade nem equivalência ao direito a ressarcimento.

Campo canônico `curtailed_energy_mwh`, se fornecido, exige:
- `calculation_method` e `method_version`;
- `value_nature`: publicado ou derivado;
- campos de origem e duração usada;
- critérios de identificação do intervalo de restrição;
- status de revisão/apuração, sem confundir com liquidação financeira.

O backend não deve coalescer referência bruta, final e apurada como se fossem substitutos silenciosos. Campo ausente não vira zero. Classificação desconhecida não exclui automaticamente a energia física.

Múltiplas razões/origens no mesmo patamar: fornecer subintervalos ou explicitar a impossibilidade de repartição. Não duplicar a energia integral por razão.

### PLD

Preço em BRL/MWh, submercado, hora/intervalo de validade e publicação. Documentar convenção HORA 0–23/1–24 e timezone na normalização upstream. Valor monetário de cada subintervalo usa a energia daquele trecho e preço válido. Se falta preço, informar cobertura insuficiente, não preço zero.

### Balanço e previsão

Separar verificado/programado/previsto, emissão e horizonte. Identificar componentes que incluem MMGD para evitar contagem dupla. Registrar se SIN já agrega subsistemas. Piso hidráulico deve apontar estudo, ano/cenário e vigência, não ser constante operacional inferida de OCR.

### Qualidade

Estados: válido, suspeito, ausente, interpolado, rejeitado; razão e responsável por transformação. Interpolação não vira medição real nem comprovação de adimplência ONS. Série de 10 minutos não comprova regra de congelamento de 6 minutos sem dados de resolução suficiente.

## 6. Identidade, escopo e autorização

- Usina, conjunto, turbina e ponto de conexão são tipos distintos.
- `id_ons` pode mudar; preservar alias e vigência. CEG é identificador complementar, não solução mágica para toda entidade.
- Join temporal único ou explicitamente ambíguo; não resolver ambiguidade só pelo nome aproximado.
- Escopo MVP NE para ativos atendidos, mas contexto sistêmico SIN permitido para modelagem ENE.
- Titularidade/SPE e grupo econômico não são sinônimos; cadastro público de SPE não comprova controlador.
- Se a API contiver dados privados, escopo autorizado deve ser enforced na origem e no backend. Cache separado por identidade/escopo. URLs fornecidas em payloads não devem redirecionar o cliente para hosts arbitrários.

## 7. Operação do consumidor HTTP

Acordar antes de produção:
- autenticação service-to-service por segredo em ambiente/secret store, TLS e política de rotação;
- timeout, paginação, tamanho máximo, rate limit, limites de intervalo e concorrência;
- retries limitados para falhas transitórias/idempotentes, backoff e respeito a Retry-After;
- erros distintos para 401/403, recurso ausente, 429, schema inválido, indisponibilidade e ausência de dados;
- nenhum fallback invisível para fixture/mock em modo real;
- cache por snapshot/versionamento, escopo autorizado e parâmetros exatos, sem arredondar intervalos e misturar resultados;
- capacidade de bulk/export para treino, evitando consulta por linha ou baixar toda a base na requisição frontend;
- readiness/capabilities informando quais features são suportadas. API no ar não significa dados prontos para previsão ou BESS.

Dados desatualizados podem servir para histórico com aviso. Recomendação operacional com insumo crítico vencido deve degradar de modo explícito ou ser bloqueada conforme política do módulo.

## 8. Amostras de aceitação a pedir ao colega

1. Eólica: intervalo com restrição e todos os campos físicos, com unidade comprovada.
2. Solar: razão/origem no agregado e detalhe da usina, separados.
3. Referência final nula e geração verificada zero válida.
4. Restrição parcial e múltiplas razões no mesmo patamar.
5. Revisão do mesmo registro e instante de disponibilização de cada versão.
6. Mudança histórica de conjunto/id_ons e alias não resolvido.
7. PLD faltante, mudança de hora e alinhamento timezone.
8. Previsão DESSEM/clima emitida antes do instante de validade, com publicação comprovada.
9. Página vazia legítima, paginação completa no mesmo snapshot e erro de permissão.

Para cada amostra: payload, dicionário, origem, versão e resultado esperado acordado. Não pedir credenciais em arquivo versionado.

## 9. Gates de liberação

- **Histórico:** grão/unidade/intervalo reconciliados, identidade, cobertura e método conhecidos.
- **Financeiro:** acima + PLD/contrato e regra elegível versionada; saídas estimadas claramente distintas de valores reconhecidos.
- **Previsão:** acima + vintages disponíveis na decisão e avaliação fora da amostra. Sem isso, somente exploração.
- **Manutenção:** ordens, recursos, restrições e agenda-base factíveis; autorização do responsável.
- **BESS:** topologia/medidores, SOC, limites, eficiência e regime econômico definidos. Sem hipótese regulatória validada, cenário físico/econômico não oficial.

Uma mesma release pode habilitar histórico e bloquear previsão. Não reduzir readiness a um único booleano global.
