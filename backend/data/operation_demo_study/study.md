# Estudo sintético CurtailIQ

- Sementes variam somente vento sintético; ordens e padrão de restrição são fixos.
- Dispersão não mede generalização entre parques/anos nem incerteza de ML.
- Agenda usa informação perfeita retrospectiva e não é ótimo global certificado.
- Valores do horizonte, não anualizados; sem comprovação de economia de cliente.

## Estatísticas do horizonte
```json
{
  "maintenance_saving_brl": {
    "mean": 2031.3734816499111,
    "std": 36.477628586049434,
    "min": 1964.1182884041634,
    "max": 2113.8671133933117
  },
  "battery_net_value_brl": {
    "mean": 5009.047813706715,
    "std": 0.0,
    "min": 5009.047813706715,
    "max": 5009.047813706715
  },
  "recovered_mwh": {
    "mean": 22.768399153212336,
    "std": 0.0,
    "min": 22.768399153212336,
    "max": 22.768399153212336
  },
  "unallocated_tasks": {
    "mean": 0,
    "std": 0.0,
    "min": 0,
    "max": 0
  }
}
```

## Sensibilidades
```json
[
  {
    "label": "sem_bateria",
    "config": {
      "seed": 42,
      "days": 2,
      "turbines": 6,
      "nominal_mw": 3.0,
      "teams": 2,
      "max_wind_ms": 12.0,
      "battery_mwh": 0.0,
      "battery_mw": 0.0,
      "efficiency": 0.9,
      "degradation_brl_mwh": 30.0,
      "energy_price_brl_mwh": 250.0
    },
    "summary": {
      "available_mwh": 331.1779049292762,
      "baseline_export_mwh": 238.12451167799716,
      "scheduled_export_mwh": 246.03756197660655,
      "battery_export_mwh": 246.03756197660655,
      "maintenance_saving_brl": 1978.262574652376,
      "battery_net_value_brl": 0.0,
      "recovered_mwh": 0.0,
      "unallocated_tasks": 0,
      "final_soc_mwh": 0,
      "charged_mwh": 0.0,
      "battery_losses_mwh": 0.0
    },
    "scenario_id": "33535a338d4c59a7"
  },
  {
    "label": "uma_equipe",
    "config": {
      "seed": 42,
      "days": 2,
      "turbines": 6,
      "nominal_mw": 3.0,
      "teams": 1,
      "max_wind_ms": 12.0,
      "battery_mwh": 12.0,
      "battery_mw": 3.0,
      "efficiency": 0.9,
      "degradation_brl_mwh": 30.0,
      "energy_price_brl_mwh": 250.0
    },
    "summary": {
      "available_mwh": 331.1779049292762,
      "baseline_export_mwh": 240.39411489764072,
      "scheduled_export_mwh": 246.03756197660655,
      "battery_export_mwh": 268.80596112981897,
      "maintenance_saving_brl": 1410.8617697414552,
      "battery_net_value_brl": 5009.047813706715,
      "recovered_mwh": 22.768399153212336,
      "unallocated_tasks": 0,
      "final_soc_mwh": 0,
      "charged_mwh": 25.298221281347033,
      "battery_losses_mwh": 2.529822128134697
    },
    "scenario_id": "a8d6df2dc88d321e"
  },
  {
    "label": "vento_10",
    "config": {
      "seed": 42,
      "days": 2,
      "turbines": 6,
      "nominal_mw": 3.0,
      "teams": 2,
      "max_wind_ms": 10.0,
      "battery_mwh": 12.0,
      "battery_mw": 3.0,
      "efficiency": 0.9,
      "degradation_brl_mwh": 30.0,
      "energy_price_brl_mwh": 250.0
    },
    "summary": {
      "available_mwh": 331.1779049292762,
      "baseline_export_mwh": 234.84066909483155,
      "scheduled_export_mwh": 234.84066909483155,
      "battery_export_mwh": 257.6090682480439,
      "maintenance_saving_brl": 0.0,
      "battery_net_value_brl": 5009.047813706715,
      "recovered_mwh": 22.768399153212336,
      "unallocated_tasks": 0,
      "final_soc_mwh": 0,
      "charged_mwh": 25.298221281347033,
      "battery_losses_mwh": 2.529822128134697
    },
    "scenario_id": "a0eb9daa75eb112a"
  },
  {
    "label": "vento_12",
    "config": {
      "seed": 42,
      "days": 2,
      "turbines": 6,
      "nominal_mw": 3.0,
      "teams": 2,
      "max_wind_ms": 12.0,
      "battery_mwh": 12.0,
      "battery_mw": 3.0,
      "efficiency": 0.9,
      "degradation_brl_mwh": 30.0,
      "energy_price_brl_mwh": 250.0
    },
    "summary": {
      "available_mwh": 331.1779049292762,
      "baseline_export_mwh": 238.12451167799716,
      "scheduled_export_mwh": 246.03756197660655,
      "battery_export_mwh": 268.80596112981897,
      "maintenance_saving_brl": 1978.262574652376,
      "battery_net_value_brl": 5009.047813706715,
      "recovered_mwh": 22.768399153212336,
      "unallocated_tasks": 0,
      "final_soc_mwh": 0,
      "charged_mwh": 25.298221281347033,
      "battery_losses_mwh": 2.529822128134697
    },
    "scenario_id": "22925cb2d820ab57"
  },
  {
    "label": "desgaste_alto",
    "config": {
      "seed": 42,
      "days": 2,
      "turbines": 6,
      "nominal_mw": 3.0,
      "teams": 2,
      "max_wind_ms": 12.0,
      "battery_mwh": 12.0,
      "battery_mw": 3.0,
      "efficiency": 0.9,
      "degradation_brl_mwh": 10000.0,
      "energy_price_brl_mwh": 250.0
    },
    "summary": {
      "available_mwh": 331.1779049292762,
      "baseline_export_mwh": 238.12451167799716,
      "scheduled_export_mwh": 246.03756197660655,
      "battery_export_mwh": 246.03756197660655,
      "maintenance_saving_brl": 1978.262574652376,
      "battery_net_value_brl": 0.0,
      "recovered_mwh": 0.0,
      "unallocated_tasks": 0,
      "final_soc_mwh": 0,
      "charged_mwh": 0.0,
      "battery_losses_mwh": 0.0
    },
    "scenario_id": "06c271eb949568fa"
  }
]
```

SHA256 study.json: feb7601edb6895e515ecb7b96ece1bf1863133d206098d859fe7cc9f319cf213
