"""WS5 scenario economics; not an ONS calculation or a scheduling instruction.

Assumes an unchanged plant export ceiling and redistribution of generation to
remaining turbines. Cut depth is CONDITIONAL on the cut occurring, not an
unconditional ML mean and not automatically COFF regulatory frustration.
All operational/economic policy is supplied explicitly by the caller.
"""
from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
from numbers import Real
from typing import Literal


@dataclass(frozen=True)
class MaintenanceCost:
    energia_perdida_esperada_mwh: float
    ressarcimento_perdido_esperado_brl: float
    custo_com_corte_brl: float
    custo_sem_corte_brl: float
    custo_esperado_brl: float
    hipotese_ressarcimento_aplicada: bool
    natureza: Literal["estimativa_cenario"] = "estimativa_cenario"


def _nonnegative(name: str, value: float) -> float:
    if isinstance(value, bool) or not isinstance(value, Real):
        raise ValueError(f"{name} deve ser um numero finito nao negativo")
    try:
        number = float(value)
    except (OverflowError, ValueError) as exc:
        raise ValueError(f"{name} fora do dominio numerico") from exc
    if not isfinite(number) or number < 0:
        raise ValueError(f"{name} deve ser um numero finito nao negativo")
    return number


def calcular_custo_intervalo(
    *,
    potencia_disponivel_mw: float,
    potencia_manutencao_mw: float,
    reducao_corte_mw: float,
    duracao_h: float,
    preco_energia_brl_mwh: float,
    valor_ressarcimento_brl_mwh: float,
    probabilidade_corte: float,
    ressarcivel: bool | None,
    penalizar_ressarcimento: bool,
) -> MaintenanceCost:
    """Evaluate total simultaneous maintenance in one homogeneous interval.

    Availability is the counterfactual without these maintenance tasks. Prices
    are marginal scenario values, not proof of contractual loss or entitlement.
    Eligibility must come from M1, never inferred here from predicted reason.
    Unknown eligibility blocks the penalty scenario. Ignoring the annual
    franchise is an external sensitivity assumption, not regulatory compliance.
    Prices below zero are outside this v1's supported domain (rejected).
    """
    a = _nonnegative("potencia_disponivel_mw", potencia_disponivel_mw)
    s = _nonnegative("potencia_manutencao_mw", potencia_manutencao_mw)
    c = _nonnegative("reducao_corte_mw", reducao_corte_mw)
    dt = _nonnegative("duracao_h", duracao_h)
    price = _nonnegative("preco_energia_brl_mwh", preco_energia_brl_mwh)
    compensation = _nonnegative("valor_ressarcimento_brl_mwh", valor_ressarcimento_brl_mwh)
    p = _nonnegative("probabilidade_corte", probabilidade_corte)
    if dt == 0 or p > 1 or s > a or c > a:
        raise ValueError("duracao_h > 0, probabilidade <= 1 e potencias <= disponibilidade exigidas")
    if type(penalizar_ressarcimento) is not bool:
        raise ValueError("penalizar_ressarcimento deve ser bool")
    if ressarcivel is not None and type(ressarcivel) is not bool:
        raise ValueError("ressarcivel deve ser bool ou None")
    if ressarcivel is None and penalizar_ressarcimento:
        raise ValueError("ressarcivel desconhecido: revisar elegibilidade ou explicitar cenario sem penalidade")

    energy_cut = max(s - c, 0.0) * dt
    energy_no_cut = s * dt
    apply_penalty = penalizar_ressarcimento and ressarcivel is True
    penalty_cut = min(s, c) * dt * compensation if apply_penalty else 0.0
    cost_cut = energy_cut * price + penalty_cut
    cost_no_cut = energy_no_cut * price
    expected_energy = p * energy_cut + (1 - p) * energy_no_cut
    expected_penalty = p * penalty_cut
    expected_cost = p * cost_cut + (1 - p) * cost_no_cut
    if not all(isfinite(v) for v in (cost_cut, cost_no_cut, expected_energy,
                                     expected_penalty, expected_cost)):
        raise ValueError("Resultado fora do dominio numerico finito")
    return MaintenanceCost(
        energia_perdida_esperada_mwh=expected_energy,
        ressarcimento_perdido_esperado_brl=expected_penalty,
        custo_com_corte_brl=cost_cut,
        custo_sem_corte_brl=cost_no_cut,
        custo_esperado_brl=expected_cost,
        hipotese_ressarcimento_aplicada=apply_penalty,
    )


def calcular_custo_marginal(
    *, potencia_ja_alocada_mw: float, potencia_tarefa_mw: float, **cenario
) -> float:
    """Incremental portfolio cost; do not reuse the same cut for every task."""
    allocated = _nonnegative("potencia_ja_alocada_mw", potencia_ja_alocada_mw)
    added = _nonnegative("potencia_tarefa_mw", potencia_tarefa_mw)
    before = calcular_custo_intervalo(potencia_manutencao_mw=allocated, **cenario)
    after = calcular_custo_intervalo(potencia_manutencao_mw=allocated + added, **cenario)
    return after.custo_esperado_brl - before.custo_esperado_brl
