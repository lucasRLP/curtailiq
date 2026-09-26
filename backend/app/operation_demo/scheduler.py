"""Feasible baseline plus monotone coordinate search, not a global optimizer."""
from datetime import datetime
from .twin import LOCAL, DT_H, export_power


def stopped_at(assignments, tasks, i, exclude=None):
    return {tasks[k]['turbine'] for k,start in assignments.items()
            if k != exclude and start <= i < start + tasks[k]['steps']}


def schedule(rows, config):
    tasks = [dict(task_id=f'OS-{j+1:03}', turbine=j, steps=6 if j%2 == 0 else 12)
             for j in range(config.turbines)]
    candidates = {}
    for k,task in enumerate(tasks):
        candidates[k] = [start for start in range(0,len(rows)-task['steps']+1,3)
                         if all(7 <= datetime.fromisoformat(r['ts']).astimezone(LOCAL).hour < 17
                                and datetime.fromisoformat(r['ts']).astimezone(LOCAL).weekday() < 6
                                and r['wind_ms'] <= config.max_wind_ms
                                for r in rows[start:start+task['steps']])]

    def feasible(k,start,assignments):
        for i in range(start,start+tasks[k]['steps']):
            active = [other for other,pos in assignments.items() if other != k
                      and pos <= i < pos+tasks[other]['steps']]
            if len(active) >= config.teams or any(tasks[o]['turbine']==tasks[k]['turbine'] for o in active):
                return False
        return True

    baseline = {}
    # Synthetic baseline: earliest safe working interval, no knowledge of restriction.
    for k in range(len(tasks)):
        possible = [s for s in candidates[k] if feasible(k,s,baseline)]
        if possible:
            baseline[k] = possible[0]
    optimized = dict(baseline)
    # Moving one job at a time preserves all allocated jobs and all hard constraints.
    # Local marginal energy cost includes other tasks (no reuse of curtailment slack).
    def marginal(k,start):
        value = 0
        for i in range(start,start+tasks[k]['steps']):
            others = stopped_at(optimized,tasks,i,exclude=k)
            value += (export_power(rows[i],others)-export_power(rows[i],others|{tasks[k]['turbine']}))*DT_H*rows[i]['price_brl_mwh']
        return value
    for k in sorted(baseline,key=lambda k: (-tasks[k]['steps'], k)):
        current = optimized[k]
        best, cost = current, marginal(k,current)
        for start in candidates[k]:
            if feasible(k,start,optimized):
                value = marginal(k,start)
                if value < cost-1e-9:
                    best,cost = start,value
        optimized[k] = best
    result=[]
    for k,t in enumerate(tasks):
        original = rows[baseline[k]]['ts'] if k in baseline else None
        chosen = rows[optimized[k]]['ts'] if k in optimized else None
        result.append(dict(task_id=t['task_id'], turbine_id=f'DEMO_NE_WTG{k+1:02}',
                           duration_minutes=t['steps']*10, original_start=original,
                           scheduled_start=chosen, status='nao_alocada' if chosen is None else 'recomendada',
                           reason='Sem janela segura no horizonte; não incluída na economia.' if chosen is None else
                           'Comparação retrospectiva sintética; mesmas equipes, vento e tarefas. Requer aprovação O&M.'))
    return tasks,baseline,optimized,result
