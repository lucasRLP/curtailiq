# Backend de operação / SCADA / manutenção / BESS — contrato executável

## Estado e escopo

Implementação backend-only, sem modificar frontend nem executar comandos em ativos reais. GET e POST `/api/operacao/demo` registrados na aplicação FastAPI existente. Demo independente do catálogo real de usinas, do DW e de provedores ML/LLM. É uma simulação determinística e retrospectiva, com potência, energia e caixa reconciliados; NÃO é o fechamento de todos os workstreams do plano original.

Fonte de verdade: `backend/app/operation_demo/models.py` (entrada), `service.py` (orquestração), `twin.py`, `scheduler.py`, `battery.py`; testes `backend/tests/test_operation_demo.py`. Protocolo e CLI: `docs/SCADA_DEMO.md`.

## Para o agente frontend

- Base URL igual à API existente. GET `/api/operacao/demo` retorna cenário default. POST na mesma rota recalcula com JSON abaixo. Nenhuma seleção de usina real altera esse cenário: identificar o parque como DEMO_NE.
- Ambos retornam `Cache-Control: no-store` e o mesmo shape. Validação inválida retorna 422 FastAPI. Sem endpoint para escrever comandos, aceitar agenda ou controlar bateria.
- Dados sintéticos não devem ser misturados com valores históricos reais nem tratados como ML. Mostrar `is_simulated`, `method`, premissas e horizonte. Selo “Simulado • retrospectivo”.
- `scenario_id` identifica configuração + versão do método; não é ID de execução persistida.
- Exemplo completo gerado: `backend/data/operation_demo_run/scenario.json`. Exemplo obtido via HTTP real: `backend/data/operation_demo_run/http_response.json` (horizonte de um dia).
- Timestamps ISO 8601 UTC. Horário operacional é UTC−03 (07–17, segunda a sábado). Início fixo 05/01/2026 00h local: não fingir streaming da data atual.
- No máximo 7 dias × 20 turbinas: 20.160 leituras, JSON aproximado de 10 MB. Não consultar esse cenário a cada tick de replay; carregar uma vez e filtrar localmente.

## Entrada (todos opcionais)

```json
{
  "seed": 42,
  "days": 2,
  "turbines": 6,
  "nominal_mw": 3,
  "teams": 2,
  "max_wind_ms": 12,
  "battery_mwh": 12,
  "battery_mw": 3,
  "efficiency": 0.9,
  "degradation_brl_mwh": 30,
  "energy_price_brl_mwh": 250
}
```

Limites: days 1–7; turbines e teams 1–20; nominal_mw >0 até 20; max_wind_ms >0 até 25; battery_mwh 0–1000; battery_mw 0–500; efficiency >0 até 1 (roundtrip); preços/desgaste 0–10000; seed inteiro 0–2147483647. Campos desconhecidos e números não finitos rejeitados. Valores econômicos são premissas do cenário, não PLD observado nem contrato comercial.

## Resposta

- `is_simulated: true`, `scenario_id: string`, `method: string`, `config`, `assumptions: string[]`.
- `turbines: [{turbine_id, nominal_kw}]`.
- `tasks: [{task_id, turbine_id, duration_minutes, original_start, scheduled_start, status, reason}]`. AMBOS os starts podem ser null quando não existe alocação viável. `status` = `recomendada` ou `nao_alocada`. Não desenhar Gantt com data null; exibir revisão necessária. Tarefas não alocadas ficam fora dos dois cenários e não geram economia.
- `alerts: [{turbine_id,ts,severity,message}]`: nesta demo são avisos de início de manutenção, não modelo preditivo de falha.
- `scada`: leituras canônicas de 10 min por turbina. Potência em kW; vento m/s; pitch graus; rotor rpm; temperaturas °C. Status `operando|limitada|parada_manutencao`; `qualidade=ok`, `fonte_ingestao=twin`, `is_simulated=true`. Disponibilidade é contrafactual sem manutenção. Os sinais auxiliares são proxies sintéticos, não modelos OEM.

### Timeline (MW médios por intervalo de 10 min)

| Campo | Significado |
|---|---|
| available_mw | Disponibilidade contrafactual de todas as turbinas sem manutenção |
| export_limit_mw | Teto no ponto de conexão, comum aos cenários |
| baseline_mw | Exportação com agenda inicial sintética, sem BESS |
| scheduled_mw | Exportação eólica com agenda recomendada, SEM BESS |
| curtailed_mw | Excedente pós manutenção que seria cortado SEM BESS |
| battery_charge_mw | Excedente redirecionado à carga, lado AC |
| battery_discharge_mw | Descarga no ponto de conexão, lado AC |
| export_with_battery_mw | Exportação total: scheduled_mw + descarga |
| wind_generation_mw | Geração física nas turbinas: scheduled_mw + carga |
| residual_curtailment_mw | Corte que SOBRA após manutenção e BESS |
| maintenance_unavailable_mw | Disponibilidade removida pelas tarefas |
| soc_mwh | Estado de carga ao FINAL do intervalo |
| wind_ms | Vento comum usado na restrição de segurança demonstrativa |
| price_brl_mwh | Preço de cenário, constante neste horizonte |

**Correção importante frente ao contrato inicial:** a soma de potência SCADA não é scheduled_mw quando a bateria está carregando. É wind_generation_mw. A carga precisa aparecer na geração física; do contrário, a bateria receberia energia não produzida.

Invariantes:
- available = maintenance_unavailable + wind_generation + residual_curtailment.
- wind_generation + discharge = export_with_battery + charge.
- soma SCADA kW / 1000 = wind_generation_mw.
- SOC final = SOC inicial + carga × sqrt(efficiency) / 6 − descarga / sqrt(efficiency) / 6.
- Geração por turbina <= disponibilidade <= nominal. Turbina em manutenção gera zero.
- Sem carga/descarga simultânea; exportação nunca supera teto. BESS inicia vazio.

### Summary

- `available_mwh`, `baseline_export_mwh`, `scheduled_export_mwh`: integrais dos respectivos campos MW.
- `battery_export_mwh`: exportação TOTAL com bateria (não apenas descarga!).
- `recovered_mwh`: descarga acumulada, energia adicional efetivamente exportada.
- `maintenance_saving_brl`: exportação adicional agenda recomendada versus inicial × preço. É ganho operacional bruto, antes de mobilização/reagendamento e sem ressarcimento.
- `battery_net_value_brl`: descarga × (preço − desgaste). Não inclui CAPEX/OPEX/tributos, não é payback/VPL nem ganho regulatório.
- `charged_mwh`, `final_soc_mwh`, `battery_losses_mwh` fecham o balanço. Estoque final não gera receita.
- `unallocated_tasks`: número de ordens sem janela segura.

## Algoritmos e premissas

Geração: curva cúbica proxy com cut-in/rated/cut-out, vento correlacionado e esteira fixa; teto sintético no meio do dia. Não houve fit em dados ONS/Kelmarsh.

Manutenção: uma tarefa sintética por turbina (1 ou 2 horas), flexibilidade dentro do horizonte, equipes comuns, horário de trabalho e limite de vento. Baseline = primeiro intervalo seguro, sem consultar restrição. Busca coordenada determinística move uma tarefa por vez considerando as demais, preserva viabilidade e só aceita redução de custo. Não é ótimo global nem baseline de cliente. Sem corretiva urgente, peças, mobilização, rajadas/raios, calendário OEM ou persistência de aceite.

BESS: armazenamento atrás do medidor, somente excedente pós manutenção, teto da conexão respeitado. Não carrega se o custo de desgaste inviabiliza descarga. Eficiência roundtrip e desgaste por MWh descarregado são parâmetros. Não modela química, envelhecimento calendário, temperatura, reserva, serviços ancilares, conexão DC, energia de rede ou degradação não linear.

## Estudo sintético

`scripts/operation_study.py` executa até 30 sementes e sensibilidades de equipes, vento, bateria desligada e desgaste alto. Persiste JSON e Markdown com checksum. Sementes variam somente vento, não catálogo/ordens ou estrutura dos cortes. Dispersão não equivale a incerteza de generalização. O resultado pode ter variância zero no BESS quando todas as sementes enchem e esvaziam a mesma capacidade — não é bug nem prova de robustez real. Não anualizar estes valores.

## Não concluído no plano original

Calibração ONS com erro <1%, catálogo Kelmarsh real e licenciado, adaptador Modbus, banco ops remoto, ingestão de historiador de cliente, API CRUD de ordens reais, previsão ML point-in-time/walk-forward, diagnóstico de falhas validado, CP-SAT, exposição comercial, química da bateria e atualização regulatória oficial. M1 legado permanece com falhas conhecidas e não foi mascarado. A demo não depende dele nem calcula elegibilidade/ressarcimento.
