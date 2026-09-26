"""Deterministic synthetic wind farm. NOT an ONS-calibrated digital twin."""
import math
import random
from datetime import datetime, timedelta, timezone

LOCAL = timezone(timedelta(hours=-3))
DT_H = 1 / 6


def generate(config):
    rng = random.Random(config.seed)
    start = datetime(2026, 1, 5, 3, tzinfo=timezone.utc)  # Monday midnight NE
    rows = []
    for i in range(config.days * 144):
        ts = start + timedelta(minutes=10*i)
        hour = ts.astimezone(LOCAL).hour + ts.minute/60
        wind = max(0, 8.8 + 1.7*math.sin((hour-7)*math.pi/12) + rng.uniform(-.35,.35))
        # Shared weather + fixed wake factors; cubic engineering proxy, not fitted.
        available = []
        for j in range(config.turbines):
            speed = wind * (1 - .04*j/max(config.turbines-1,1))
            fraction = 0 if speed < 3 or speed >= 25 else min(1, (speed**3-3**3)/(12**3-3**3))
            available.append(config.nominal_mw * fraction)
        total = sum(available)
        # Synthetic daily export restriction; exact replay is not an ML forecast.
        ceiling = config.turbines * config.nominal_mw * (.13 if 10 <= hour < 15 else 1)
        rows.append(dict(ts=ts.isoformat(), available=available, available_mw=total,
                         export_limit_mw=ceiling, wind_ms=wind,
                         price_brl_mwh=config.energy_price_brl_mwh))
    return rows


def export_power(row, stopped):
    residual = sum(p for j,p in enumerate(row['available']) if j not in stopped)
    return min(residual, row['export_limit_mw'])
