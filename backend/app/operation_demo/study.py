"""Synthetic sensitivity study, deliberately NOT a predictive backtest."""
from statistics import mean, pstdev
from .models import DemoConfig
from .service import build_demo


def run_study(config: DemoConfig, seeds=30):
    if type(seeds) is not int or not 1 <= seeds <= 30:
        raise ValueError('seeds deve estar entre 1 e 30')
    runs=[]
    for seed in range(seeds):
        values=config.model_dump() | {'seed':seed}
        result=build_demo(DemoConfig(**values))
        runs.append(dict(scenario_id=result['scenario_id'],seed=seed,summary=result['summary']))
    stats={}
    for metric in ['maintenance_saving_brl','battery_net_value_brl','recovered_mwh','unallocated_tasks']:
        values=[r['summary'][metric] for r in runs]
        stats[metric]=dict(mean=mean(values),std=pstdev(values),min=min(values),max=max(values))
    sensitivities=[]
    for label,update in [('sem_bateria',{'battery_mwh':0,'battery_mw':0}),
                          ('uma_equipe',{'teams':1}),('vento_10',{'max_wind_ms':10}),
                          ('vento_12',{'max_wind_ms':12}),('desgaste_alto',{'degradation_brl_mwh':10000})]:
        c=DemoConfig(**(config.model_dump()|update))
        result=build_demo(c)
        sensitivities.append(dict(label=label,config=c.model_dump(),summary=result['summary'],scenario_id=result['scenario_id']))
    return dict(is_simulated=True,method='synthetic-sensitivity-v1',config=config.model_dump(),runs=runs,
                statistics=stats,sensitivities=sensitivities,
                warnings=['Sementes variam somente vento sintético; ordens e padrão de restrição são fixos.',
                          'Dispersão não mede generalização entre parques/anos nem incerteza de ML.',
                          'Agenda usa informação perfeita retrospectiva e não é ótimo global certificado.',
                          'Valores do horizonte, não anualizados; sem comprovação de economia de cliente.'])
