"""Conservative behind-the-meter surplus dispatch; no real control commands."""
from math import sqrt
from .twin import DT_H


def dispatch(rows, config):
    soc = 0.0
    eta = sqrt(config.efficiency)  # roundtrip efficiency split symmetrically
    for row in rows:
        charge=discharge=0.0
        # Skip uneconomic cycling, including charging energy that cannot earn margin.
        if row['price_brl_mwh'] > config.degradation_brl_mwh:
            if row['curtailed_mw'] > 1e-9:
                charge=max(0,min(config.battery_mw,row['curtailed_mw'],
                                 (config.battery_mwh-soc)/(eta*DT_H)))
            else:
                discharge=max(0,min(config.battery_mw,
                                    row['export_limit_mw']-row['scheduled_mw'], soc*eta/DT_H))
        soc += charge*eta*DT_H-discharge/eta*DT_H
        row.update(battery_charge_mw=charge,battery_discharge_mw=discharge,
                   soc_mwh=max(0,soc), export_with_battery_mw=row['scheduled_mw']+discharge)
