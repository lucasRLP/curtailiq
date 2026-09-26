"""Public reproducible scenario orchestrator, wholly synthetic and read-only."""
import hashlib
import json
from .models import DemoConfig
from .twin import DT_H, generate, export_power
from .scheduler import schedule, stopped_at
from .battery import dispatch

METHOD = 'synthetic-retrospective-coordinate-v2'


def build_demo(config: DemoConfig) -> dict:
    rows=generate(config)
    tasks,baseline,optimized,orders=schedule(rows,config)
    timeline=[]
    scada=[]
    alerts=[]
    # Dispatch first: simulated turbine meters must include energy sent to the BESS.
    for i,row in enumerate(rows):
        stopped=stopped_at(optimized,tasks,i)
        residual=sum(p for j,p in enumerate(row['available']) if j not in stopped)
        scheduled=export_power(row,stopped)
        timeline.append(dict(ts=row['ts'],available_mw=row['available_mw'],
                             export_limit_mw=row['export_limit_mw'],
                             baseline_mw=export_power(row,stopped_at(baseline,tasks,i)),
                             scheduled_mw=scheduled,curtailed_mw=max(0,residual-scheduled),
                             maintenance_unavailable_mw=row['available_mw']-residual,
                             wind_ms=row['wind_ms'],price_brl_mwh=row['price_brl_mwh']))
    dispatch(timeline,config)
    for i,row in enumerate(rows):
        stopped=stopped_at(optimized,tasks,i)
        residual=sum(p for j,p in enumerate(row['available']) if j not in stopped)
        generation=timeline[i]['scheduled_mw']+timeline[i]['battery_charge_mw']
        timeline[i]['wind_generation_mw']=generation
        timeline[i]['residual_curtailment_mw']=max(0,residual-generation)
        factor=generation/residual if residual else 0
        for j,p in enumerate(row['available']):
            power=0 if j in stopped else p*factor
            status='parada_manutencao' if j in stopped else ('limitada' if factor < 1-1e-9 else 'operando')
            turbine_id=f'DEMO_NE_WTG{j+1:02}'
            temperature=35+20*power/config.nominal_mw
            scada.append(dict(turbine_id=turbine_id,ts=row['ts'],vento_ms=row['wind_ms'],
                              potencia_kw=power*1000,potencia_disponivel_kw=p*1000,setpoint_kw=power*1000,
                              pitch_graus=90 if j in stopped else 2+25*(1-factor),
                              rotor_rpm=0 if j in stopped else 5+10*power/config.nominal_mw,
                              temp_nacele_c=30+5*power/config.nominal_mw,
                              temp_mancal_gerador_c=temperature,temp_mancal_caixa_c=temperature+2,
                              status=status,qualidade='ok',is_simulated=True,fonte_ingestao='twin'))
            if j in stopped and (i == 0 or j not in stopped_at(optimized,tasks,i-1)):
                alerts.append(dict(turbine_id=turbine_id,ts=row['ts'],severity='info',
                                   message='Parada planejada simulada. Não é diagnóstico de falha.'))
    energy=lambda key: sum(t[key]*DT_H for t in timeline)
    summary=dict(available_mwh=energy('available_mw'),baseline_export_mwh=energy('baseline_mw'),
                 scheduled_export_mwh=energy('scheduled_mw'),battery_export_mwh=energy('export_with_battery_mw'),
                 maintenance_saving_brl=sum((t['scheduled_mw']-t['baseline_mw'])*DT_H*t['price_brl_mwh'] for t in timeline),
                 battery_net_value_brl=sum(t['battery_discharge_mw']*DT_H*(t['price_brl_mwh']-config.degradation_brl_mwh) for t in timeline),
                 recovered_mwh=energy('battery_discharge_mw'),unallocated_tasks=len(tasks)-len(optimized),
                 final_soc_mwh=timeline[-1]['soc_mwh'],charged_mwh=energy('battery_charge_mw'),
                 battery_losses_mwh=energy('battery_charge_mw')-energy('battery_discharge_mw')-timeline[-1]['soc_mwh'])
    scenario_id=hashlib.sha256((METHOD+json.dumps(config.model_dump(),sort_keys=True)).encode()).hexdigest()[:16]
    return dict(is_simulated=True,scenario_id=scenario_id,method=METHOD,config=config.model_dump(),summary=summary,
                timeline=timeline,scada=scada,tasks=orders,alerts=alerts,
                turbines=[dict(turbine_id=f'DEMO_NE_WTG{j+1:02}',nominal_kw=config.nominal_mw*1000) for j in range(config.turbines)],
                assumptions=[
                    '100% sintético: não calibrado ONS/Kelmarsh, não representa parque real.',
                    'Informação perfeita retrospectiva; não é previsão ML nem backtest de ganho real.',
                    'Baseline sintético: primeira janela segura. Mesmas tarefas, vento, equipes e teto nos cenários.',
                    'Limite de vento é premissa, não autorização de segurança; raios, rajadas, OEM e logística não modelados.',
                    'Teto fixo e redistribuição entre turbinas; disponibilidade é contrafactual sem manutenção.',
                    'Ressarcimento não calculado; economia operacional bruta sem mobilização e custo de reagendamento.',
                    'Bateria sem energia inicial; carga apenas de excedente pós manutenção, descarga com folga no teto.',
                    'Eficiência informada é roundtrip; desgaste por MWh descarregado. SOC final não monetizado.',
                    'Valor BESS incremental líquido de desgaste, sem CAPEX/OPEX/tributos: não é VPL ou payback.',
                    'Tarefas não alocadas exigem revisão humana e são excluídas dos dois cenários.',
                    'Somente simulação. Nenhum comando enviado a SCADA ou bateria real.' ])
