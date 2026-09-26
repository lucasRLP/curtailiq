# Continuidade — operação, SCADA, manutenção e baterias

## Consumo L — Redshift histórico do notebook e publicação do Juan

Foi implementado `backend/app/data_load/` e validada leitura read-only de uma fonte associada ao notebook `data/awsredshaft (1).ipynb`: 6.803 linhas de `dim_usina` e 248 de `fato_geracao` em 2011. Os testes do leitor tiveram 12 passed; a regressão focada, 83 passed e 1 skipped.

O usuário confirmou que Juan automatiza a pipeline via Databricks para AWS Redshift e pediu alinhamento direto de tabelas/acesso. **Ainda não comprovamos que o database/schema do notebook seja essa publicação atual.** A `fato_geracao` observada no notebook só cobre 2000–2011; leitor isolado, não ligado ao repository, rotas ou readiness. Não configurar para produção nem declarar integração. Detalhes e pedido para Juan: `docs/INTEGRACAO_REDSHIFT_JUAN.md`. Leitor histórico: `docs/BACKEND_DATA_LOAD_REDSHIFT.md`.

A credencial do notebook estava em texto claro; rotacionar e não movê-la para `.env`/deploy. Para o banco atual, obter principal SELECT-only novo e contrato real pelo responsável.

Coerência do frontend revisada sem editar front: `docs/INSTRUCOES_FRONTEND_COERENCIA_BACKEND.md`.

## Planejamento posterior à pesquisa de produto

A revisão de `docs/PESQUISA-PRODUTO-CURTAILMENT.pdf` está em `docs/ANALISE_PESQUISA_E_ROADMAP_BACKEND.md`. Esse é o roteiro recomendado para os próximos incrementos, preservando o plano original e a entrega sintética abaixo.

O time de dados está automatizando ingestão/normalização via Databricks e publicando no Redshift AWS. O backend deve consumir a camada curada do Redshift por acesso read-only; nenhuma API HTTP foi confirmada. Ver requisitos lógicos em `docs/CONTRATO_API_DADOS_CURTAILIQ.md` e handoff do schema/access em `docs/INTEGRACAO_REDSHIFT_JUAN.md`. Não duplicar ONS/CCEE ETL nem assumir que o database histórico do notebook corresponde à nova publicação.

Sequência: F0 contratos e reconciliação de grandezas → F1 histórico real/evidência → F2 núcleo físico/econômico comum → F3 previsão point-in-time → F4 planejamento em modo sombra → F5 investimento/expansão. F2 pode avançar com cenários declarados enquanto a integração real fica pendente.

Bloqueios de afirmação, não de toda implementação: unidade e semântica do campo apurado citado na pesquisa; vintages/publicação para previsão; medição e tratamento regulatório de BESS; regras vigentes por fonte/ano. Não trocar a fórmula do projeto só com base no PDF. O BessService legado não tem a mesma modelagem física da demo e precisa migrar antes de sustentar viabilidade financeira.

Esta atualização é documental: não reexecuta nem renova os resultados de teste abaixo, não promove modelo e não altera código de runtime ou frontend.

## Pedido e limites
Implementar demo integrada executável, não apenas proposta. Preservar alterações preexistentes e não fazer commits. Somente simulação/read-only, nunca comandos em equipamentos reais. Todo output sintético is_simulated=true. Não alegar calibração ONS/Kelmarsh sem prova. Avaliação anterior: docs/avaliacao_plano_operacao.md. Plano amplo: curtailiq_plano_execucao_operacao.md. Financeiro legado possui 17 falhas conhecidas, não confundir com regressão nova.

## Arquitetura desta entrega
Módulo independente backend/app/operation_demo/ com modelos Pydantic, geração SCADA determinística 10min, agendador com restrições e BESS conservativo. API /api/operacao/demo (GET defaults e POST configuração). Front /operacao acessível pela navegação. CSV e OPC UA local somente leitura como integração demonstrativa. Sem novas ingestões externas no backend nem migração remota.

## Contrato compartilhado v1
POST /api/operacao/demo body (todos opcionais): seed=42, days=2 (1..7), turbines=6 (1..20), nominal_mw=3, teams=2, max_wind_ms=12, battery_mwh=12, battery_mw=3, efficiency=0.9, degradation_brl_mwh=30, energy_price_brl_mwh=250. Validação finita, limites físicos e orçamento de execução. Usar início fixo timezone-aware em segunda-feira. GET mesmo output defaults.
Output JSON:
- is_simulated: true; scenario_id: string; method: string; assumptions: string[]
- config: parâmetros usados
- summary: available_mwh, baseline_export_mwh, scheduled_export_mwh, battery_export_mwh, maintenance_saving_brl, battery_net_value_brl, recovered_mwh, unallocated_tasks (number)
- timeline: [{ts (ISO UTC), available_mw, export_limit_mw, baseline_mw, scheduled_mw, export_with_battery_mw, curtailed_mw, wind_ms, price_brl_mwh, battery_charge_mw, battery_discharge_mw, soc_mwh}]
- turbines: [{turbine_id, nominal_kw}]
- scada: [{turbine_id, ts, vento_ms, potencia_kw, potencia_disponivel_kw, setpoint_kw, pitch_graus, rotor_rpm, temp_nacele_c, temp_mancal_gerador_c, temp_mancal_caixa_c, status, qualidade, is_simulated, fonte_ingestao}]
- tasks: [{task_id,turbine_id,duration_minutes,original_start,scheduled_start (ISO|null),status,reason}]
- alerts: [{turbine_id,ts,severity,message}]

## Coerência obrigatória
Potência turbina <= disponível <= nominal; parada produz zero. ATUALIZAÇÃO física v2: agregação SCADA = wind_generation_mw = scheduled_mw + battery_charge_mw (os medidores das turbinas incluem energia enviada à bateria). scheduled_mw é exportação eólica sem BESS, não geração bruta. Disponibilidade é contrafactual sem manutenção. Corte e manutenção avaliados no mesmo teto de exportação. Baseline e agenda sob mesmas restrições; se baseline inviável, não fabricar economia. BESS carrega apenas excedente que seria cortado após manutenção; descarga respeita folga de exportação; nunca carga/descarga simultânea; SOC e perdas conservados, sem monetizar estoque final nem energia inicial grátis. Economia líquida com degradação explícita e sem CAPEX: não é VPL/payback. Comparação retrospectiva sintética com informação perfeita, não previsão ML validada nem apuração regulatória.

## Estado atual — backend-only
Usuário reservou frontend para outro agente. Nenhuma implementação frontend nesta retomada.

Concluído e exercitado:
- `backend/app/operation_demo/`: SCADA, busca de agenda com restrições, BESS, estudo sintético.
- GET/POST `/api/operacao/demo` registrado em `backend/app/main.py`.
- `backend/app/scada_demo/`: CSV, qualidade, SQLite idempotente, OPC UA read-only.
- CLIs `backend/scripts/scada_demo.py` e `backend/scripts/operation_study.py`.
- Contrato detalhado para frontend: `docs/API_OPERACAO_BACKEND.md` (prevalece sobre o rascunho acima).
- Execução PowerShell, tags e limitações: `docs/SCADA_DEMO.md`.
- Artefatos executados: `backend/data/operation_demo_run/{scenario.json,scada.csv,report.md,manifest.json,http_response.json,readings.sqlite}` e `backend/data/operation_demo_study/{study.json,study.md}`.

ATENÇÃO: original_start também pode ser null em tarefa não alocada. Campos aditivos de timeline: wind_generation_mw, maintenance_unavailable_mw, residual_curtailment_mw. Método atualizado para synthetic-retrospective-coordinate-v2 para contabilizar carga do BESS na geração medida do SCADA.

Evidência: TDD com RED dos módulos/endpoints inexistentes e GREEN; protocolo real rejeita escrita e lê replay; HTTP real health e POST OK; 30 linhas confirmadas no SQLite via CLI. Estudo com 30 sementes executado, sem anualização nem alegação de ganho de cliente. Limite 7 dias/20 turbinas gerou 20.160 leituras em cerca de 0,35 s nesta máquina.

A revisão continua distinguindo pendências M1 preexistentes dos módulos novos. Sem commits, sem migração remota e sem ingestão duplicada do time de dados.

## Última verificação concluída
- Suíte focada: **72 passed**, incluindo OPC UA real (sem skip), CSV/SQLite, CLI, energia, agenda, BESS e estudo.
- Suíte completa: **116 passed, 17 failed, 1 skipped, 15 subtests passed**. Mesmos testes legados financeiro/regulatório falhando; warning de depreciação TestClient/httpx já existente.
- Revisão estática independente apontou ordenação lexical de timestamps fracionários e perda de qualidade ausente/interpolada. Ambos foram reproduzidos em testes RED, corrigidos e passaram na suíte final.
- Não afirmar que todo o plano original foi implementado: a entrega atual é a demo backend integrada. Próximos módulos reais exigem contratos de ordens/ativos, dados observados e validação normativa.


## Fora da afirmação de pronto
Plano original inclui validação regulatória oficial, catálogo Kelmarsh comprovado, calibração ONS, DW ops remoto, Modbus, ML walk-forward e solver avançado. Esses itens não podem ser declarados concluídos por uma demo sintética. Registrar explicitamente o estado final.
