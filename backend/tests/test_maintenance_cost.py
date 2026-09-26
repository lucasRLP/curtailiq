"""Synthetic arithmetic fixtures, not evidence of savings at a real plant."""
import importlib

import pytest


def calculate(**overrides):
    module = importlib.import_module("app.engines.maintenance_cost")
    inputs = dict(
        potencia_disponivel_mw=10.0,
        potencia_manutencao_mw=4.0,
        reducao_corte_mw=6.0,
        duracao_h=0.5,
        preco_energia_brl_mwh=100.0,
        valor_ressarcimento_brl_mwh=80.0,
        probabilidade_corte=1.0,
        ressarcivel=False,
        penalizar_ressarcimento=True,
    )
    inputs.update(overrides)
    return module.calcular_custo_intervalo(**inputs)


def test_cut_larger_than_maintenance_has_no_incremental_generation_loss():
    result = calculate()
    assert result.energia_perdida_esperada_mwh == 0
    assert result.custo_esperado_brl == 0
    assert result.natureza == "estimativa_cenario"


def test_partial_cut_only_offsets_part_of_maintenance():
    result = calculate(reducao_corte_mw=2)
    assert result.energia_perdida_esperada_mwh == 1
    assert result.custo_esperado_brl == 100


def test_no_cut_costs_all_unavailable_generation():
    result = calculate(reducao_corte_mw=0)
    assert result.energia_perdida_esperada_mwh == 2
    assert result.custo_esperado_brl == 200


def test_compensation_is_a_separate_hypothetical_cost():
    result = calculate(ressarcivel=True)
    assert result.energia_perdida_esperada_mwh == 0
    assert result.ressarcimento_perdido_esperado_brl == 160
    assert result.custo_esperado_brl == 160
    assert result.hipotese_ressarcimento_aplicada is True


def test_probability_weights_scenarios_not_cut_depth():
    result = calculate(probabilidade_corte=0.25)
    assert result.custo_com_corte_brl == 0
    assert result.custo_sem_corte_brl == 200
    assert result.energia_perdida_esperada_mwh == 1.5
    assert result.custo_esperado_brl == 150


def test_probability_also_weights_compensation():
    result = calculate(probabilidade_corte=0.25, ressarcivel=True)
    assert result.ressarcimento_perdido_esperado_brl == 40
    assert result.custo_esperado_brl == 190


def test_zero_probability_is_the_no_cut_scenario():
    assert calculate(probabilidade_corte=0).custo_esperado_brl == 200


def test_penalty_can_be_disabled_explicitly_for_sensitivity():
    result = calculate(ressarcivel=True, penalizar_ressarcimento=False)
    assert result.custo_esperado_brl == 0
    assert result.hipotese_ressarcimento_aplicada is False


def test_unknown_eligibility_cannot_silently_become_free_maintenance():
    with pytest.raises(ValueError, match="ressarcivel"):
        calculate(ressarcivel=None)


def test_unknown_eligibility_allowed_only_in_explicit_no_penalty_scenario():
    assert calculate(ressarcivel=None, penalizar_ressarcimento=False).custo_esperado_brl == 0


def test_ten_minute_duration_is_not_hardcoded_as_half_hour():
    assert calculate(reducao_corte_mw=0, potencia_manutencao_mw=6, duracao_h=1 / 6).custo_esperado_brl == 100


def test_no_maintenance_costs_nothing():
    assert calculate(potencia_manutencao_mw=0, ressarcivel=True).custo_esperado_brl == 0


def test_partial_cut_compensation_does_not_double_count_energy():
    result = calculate(reducao_corte_mw=2, ressarcivel=True)
    assert result.energia_perdida_esperada_mwh == 1
    assert result.ressarcimento_perdido_esperado_brl == 80
    assert result.custo_esperado_brl == 180


def test_shared_cut_budget_requires_marginal_portfolio_cost():
    # Existing 4 MW maintenance consumes most of a 6 MW cut. A second
    # 4 MW task costs 100 BRL, although either task alone would cost zero.
    module = importlib.import_module("app.engines.maintenance_cost")
    kwargs = dict(potencia_disponivel_mw=10, reducao_corte_mw=6,
                  duracao_h=0.5, preco_energia_brl_mwh=100,
                  valor_ressarcimento_brl_mwh=80, probabilidade_corte=1,
                  ressarcivel=False, penalizar_ressarcimento=True)
    marginal = module.calcular_custo_marginal(
        potencia_ja_alocada_mw=4, potencia_tarefa_mw=4, **kwargs)
    assert marginal == 100


@pytest.mark.parametrize("field,value", [
    ("potencia_disponivel_mw", -1), ("potencia_disponivel_mw", float("inf")),
    ("potencia_manutencao_mw", -1), ("potencia_manutencao_mw", 11),
    ("reducao_corte_mw", -1), ("reducao_corte_mw", 11),
    ("duracao_h", 0), ("duracao_h", -1),
    ("preco_energia_brl_mwh", -1), ("preco_energia_brl_mwh", None),
    ("valor_ressarcimento_brl_mwh", -1),
    ("probabilidade_corte", -0.1), ("probabilidade_corte", 1.1),
    ("probabilidade_corte", float("nan")), ("probabilidade_corte", True),
    ("ressarcivel", "false"), ("penalizar_ressarcimento", "false"),
])
def test_invalid_inputs_fail_closed(field, value):
    with pytest.raises(ValueError):
        calculate(**{field: value})


def test_zero_price_is_valid_and_not_missing():
    assert calculate(reducao_corte_mw=0, preco_energia_brl_mwh=0).custo_esperado_brl == 0


def test_missing_compensation_price_is_not_assumed_zero():
    with pytest.raises(ValueError):
        calculate(ressarcivel=True, valor_ressarcimento_brl_mwh=None)


def test_overflow_is_not_returned_as_a_financial_result():
    with pytest.raises(ValueError):
        calculate(reducao_corte_mw=0, preco_energia_brl_mwh=1e308)
