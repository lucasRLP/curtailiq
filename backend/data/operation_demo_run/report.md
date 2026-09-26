# CurtailIQ — cenário SIMULADO

Scenario: 3fee60f8a5d10967
Método: synthetic-retrospective-coordinate-v2

## Premissas
- 100% sintético: não calibrado ONS/Kelmarsh, não representa parque real.
- Informação perfeita retrospectiva; não é previsão ML nem backtest de ganho real.
- Baseline sintético: primeira janela segura. Mesmas tarefas, vento, equipes e teto nos cenários.
- Limite de vento é premissa, não autorização de segurança; raios, rajadas, OEM e logística não modelados.
- Teto fixo e redistribuição entre turbinas; disponibilidade é contrafactual sem manutenção.
- Ressarcimento não calculado; economia operacional bruta sem mobilização e custo de reagendamento.
- Bateria sem energia inicial; carga apenas de excedente pós manutenção, descarga com folga no teto.
- Eficiência informada é roundtrip; desgaste por MWh descarregado. SOC final não monetizado.
- Valor BESS incremental líquido de desgaste, sem CAPEX/OPEX/tributos: não é VPL ou payback.
- Tarefas não alocadas exigem revisão humana e são excluídas dos dois cenários.
- Somente simulação. Nenhum comando enviado a SCADA ou bateria real.

## Resultado do horizonte (não anualizado)
- available_mwh: 331.1779049292762
- baseline_export_mwh: 238.12451167799716
- scheduled_export_mwh: 246.03756197660655
- battery_export_mwh: 268.80596112981897
- maintenance_saving_brl: 1978.262574652376
- battery_net_value_brl: 5009.047813706715
- recovered_mwh: 22.768399153212336
- unallocated_tasks: 0
- final_soc_mwh: 0
- charged_mwh: 25.298221281347033
- battery_losses_mwh: 2.529822128134697

## Configuração
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
