# Motor de custo operacional (WS5, primeira entrega)

Este módulo calcula cenários; não agenda tarefas, não controla equipamentos e não determina direito regulatório.

## Executar os testes (PowerShell)

```powershell
cd C:\Users\lucas\documents\energithon\backend
$env:DATA_BACKEND = 'mock'
uv run --with pytest python -m pytest tests/test_maintenance_cost.py -q
```

## Uso

```python
from app.engines.maintenance_cost import calcular_custo_intervalo

resultado = calcular_custo_intervalo(
    potencia_disponivel_mw=10,
    potencia_manutencao_mw=4,
    reducao_corte_mw=6,
    duracao_h=0.5,
    preco_energia_brl_mwh=100,
    valor_ressarcimento_brl_mwh=80,
    probabilidade_corte=0.25,
    ressarcivel=True,
    penalizar_ressarcimento=True,
)
print(resultado)
```

Números acima são fixtures sintéticas de aritmética, não dados de uma usina. A função não salva séries, não produz SCADA e não transforma inputs em dados oficiais.

## Condições de validade

- MW disponíveis no contrafactual sem a manutenção; duração explícita em horas.
- Teto de exportação inalterado e capacidade de redistribuir produção nas turbinas remanescentes.
- Corte condicional à ocorrência; não fornecer magnitude já ponderada pela probabilidade.
- Intervalo homogêneo. Quem chama deve cortar a série nas mudanças de preço, tarefa, previsão e comando.
- Elegibilidade é entrada do motor M1, não inferência de razão prevista. `None` bloqueia o cenário com penalidade; cenário sem penalidade exige escolha explícita.
- Preços marginais de cenário; não calcula exposição contratual nem franquia anual. Valores negativos não são suportados nesta v1.
- A perda de ressarcimento é hipótese simplificada do plano, pendente de validação. Comparar sensibilidades com/sem a hipótese.
- Nenhum parâmetro operacional é fixado no código: futura camada de serviço deve carregá-los da política configurada, registrar versão/proveniência e `is_simulated` no resultado persistido.
- Para tarefas simultâneas usar `calcular_custo_marginal`, ou comparar custos TOTAIS dos cronogramas; não reutilizar todo o corte para cada turbina.
- Viabilidade e segurança da tarefa ficam fora deste motor. Não usar como autorização de execução.

Não há integração com API, DW, SCADA, solver ou modelo ML nesta entrega. As restrições e gates comerciais estão em `docs/avaliacao_plano_operacao.md` na raiz do projeto.
