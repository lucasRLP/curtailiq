# Relatório de Análise de Granularidade e Curtailment por Usina

**Data Warehouse:** dw  
**Tabela Principal:** `fato_restricao_coff`  
**Fonte Oficial:** Dicionário de Dados - Restrição de Operação por Constrained-Off de Usinas Eólicas (ONS)  
**Data do Relatório:** 19 de Junho de 2026

---

## 1. Objetivo

Este relatório tem como objetivo fornecer um conjunto completo de queries para:

- Verificar a **granularidade temporal** dos dados por usina
- Analisar a **cobertura e qualidade** dos dados
- Calcular **curtailment** (corte de geração) por usina
- Identificar padrões, gaps e oportunidades de análise

---

## 2. Estrutura de Dados Identificada

### Tabela Principal Recomendada

| Tabela                  | Finalidade                          | Colunas Relevantes                              | Recomendada para Curtailment |
|-------------------------|-------------------------------------|--------------------------------------------------|------------------------------|
| `fato_restricao_coff`   | Restrições Constrained-Off         | `val_geracao`, `val_geracaoreferencia`, `val_disponibilidade`, `cod_razao`, `cod_origem`, `din_instante` | **Sim** |
| `fato_restricao_detalhe`| Dados detalhados + meteorologia    | `nom_conjuntousina`, `val_geracaoestimada`, `val_geracaoverificada`, `tipo_meteo` | Não (falta coluna de referência) |

**Observação importante:**  
A coluna `val_geracaoreferencialfinal` existe na documentação oficial do ONS, mas na tabela `fato_restricao_coff` do DW a coluna disponível é `val_geracaoreferencia`.

---

## 3. Queries de Diagnóstico Inicial

### 3.1 Verificar Existência de Dados

```sql
SET search_path = dw, public;

SELECT 
    COUNT(*) AS total_registros,
    MIN(din_instante) AS data_mais_antiga,
    MAX(din_instante) AS data_mais_recente,
    COUNT(DISTINCT sk_usina) AS qtd_usinas_distintas
FROM fato_restricao_coff;
```

### 3.2 Distribuição Temporal (por mês)

```sql
SET search_path = dw, public;

SELECT 
    DATE_TRUNC('month', din_instante) AS mes,
    COUNT(*) AS qtd_registros
FROM fato_restricao_coff
GROUP BY DATE_TRUNC('month', din_instante)
ORDER BY mes;
```

---

## 4. Queries de Granularidade por Usina

### 4.1 Perfil Geral por Usina

```sql
SET search_path = dw, public;

SELECT 
    f.sk_usina,
    COALESCE(u.nom_usina, 'Sem nome (sk=' || f.sk_usina || ')') AS nom_usina,
    COUNT(*) AS qtd_registros,
    MIN(f.din_instante) AS data_inicio,
    MAX(f.din_instante) AS data_fim,
    COUNT(DISTINCT DATE(f.din_instante)) AS dias_com_dado,
    ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT DATE(f.din_instante)), 0), 1) AS media_registros_por_dia
FROM fato_restricao_coff f
LEFT JOIN dim_usina u ON u.sk_usina = f.sk_usina
WHERE f.sk_usina <> 0
GROUP BY f.sk_usina, u.nom_usina
ORDER BY qtd_registros DESC
LIMIT 30;
```

### 4.2 Verificar Intervalo entre Registros (Granularidade)

```sql
SET search_path = dw, public;

WITH lags AS (
    SELECT 
        f.sk_usina,
        f.din_instante,
        f.din_instante - LAG(f.din_instante) OVER (PARTITION BY f.sk_usina ORDER BY f.din_instante) AS intervalo
    FROM fato_restricao_coff f
    WHERE f.sk_usina <> 0
)
SELECT 
    intervalo,
    COUNT(*) AS qtd_vezes
FROM lags
WHERE intervalo IS NOT NULL
GROUP BY intervalo
ORDER BY qtd_vezes DESC;
```

### 4.3 Registros por Dia (Validação de 48 registros/dia)

```sql
SET search_path = dw, public;

SELECT 
    DATE(f.din_instante) AS data,
    COUNT(*) AS registros_no_dia
FROM fato_restricao_coff f
WHERE f.sk_usina <> 0
GROUP BY DATE(f.din_instante)
ORDER BY data DESC
LIMIT 20;
```

### 4.4 Análise de Nulos nas Colunas Críticas

```sql
SET search_path = dw, public;

SELECT 
    COUNT(*) AS total_registros,
    COUNT(*) FILTER (WHERE val_geracao IS NULL) AS nulos_val_geracao,
    COUNT(*) FILTER (WHERE val_geracaoreferencia IS NULL) AS nulos_val_geracaoreferencia,
    COUNT(*) FILTER (WHERE val_disponibilidade IS NULL) AS nulos_val_disponibilidade,
    ROUND(100.0 * COUNT(*) FILTER (WHERE val_geracaoreferencia IS NULL) / COUNT(*), 2) AS pct_nulos_referencia
FROM fato_restricao_coff
WHERE sk_usina <> 0;
```

---

## 5. Queries de Análise de Curtailment

### 5.1 Curtailment por Usina (Top 15)

```sql
SET search_path = dw, public;

SELECT 
    u.nom_usina,
    u.tipo,
    g.id_estado AS uf,
    COUNT(*) AS n_restricoes,
    ROUND(SUM(f.val_geracaoreferencia - f.val_geracao)::numeric, 2) AS curtailment_total_mw,
    ROUND(
        (100.0 * SUM(f.val_geracaoreferencia - f.val_geracao) 
         / NULLIF(SUM(f.val_geracaoreferencia)::numeric, 0))::numeric, 
        2
    ) AS pct_curtailment
FROM fato_restricao_coff f
JOIN dim_usina u ON u.sk_usina = f.sk_usina
LEFT JOIN dim_geografia g ON g.sk_geografia = u.sk_geografia
WHERE f.sk_usina <> 0
  AND f.din_instante >= '2025-01-01'
  AND f.val_geracaoreferencia IS NOT NULL
GROUP BY u.nom_usina, u.tipo, g.id_estado
ORDER BY curtailment_total_mw DESC
LIMIT 15;
```

### 5.2 Curtailment por Razão de Restrição

```sql
SET search_path = dw, public;

SELECT 
    f.cod_razao,
    COUNT(*) AS qtd_eventos,
    ROUND(SUM(f.val_geracaoreferencia - f.val_geracao)::numeric, 2) AS curtailment_total_mw,
    ROUND(AVG(f.val_geracaoreferencia - f.val_geracao)::numeric, 2) AS curtailment_medio_mw
FROM fato_restricao_coff f
WHERE f.sk_usina <> 0
  AND f.din_instante >= '2025-01-01'
  AND f.val_geracaoreferencia IS NOT NULL
GROUP BY f.cod_razao
ORDER BY curtailment_total_mw DESC;
```

### 5.3 Curtailment por Estado

```sql
SET search_path = dw, public;

SELECT 
    f.id_estado,
    COUNT(DISTINCT f.sk_usina) AS qtd_usinas,
    COUNT(*) AS qtd_registros,
    ROUND(SUM(f.val_geracaoreferencia - f.val_geracao)::numeric, 2) AS curtailment_total_mw
FROM fato_restricao_coff f
WHERE f.sk_usina <> 0
  AND f.din_instante >= '2025-01-01'
GROUP BY f.id_estado
ORDER BY curtailment_total_mw DESC;
```

---

## 6. Ideias e Recomendações de Análise

### 6.1 Análises Recomendadas

| Análise | Descrição | Valor para o Negócio |
|---------|-----------|----------------------|
| **Curtailment por Razão** | Agrupar por `cod_razao` (REL, CNF, ENE, PAR) | Identificar principais causas de corte |
| **Curtailment vs Disponibilidade** | Comparar `val_geracaoreferencia` com `val_disponibilidade` | Verificar se o corte está dentro do esperado |
| **Tendência Temporal** | Curtailment mensal por usina/estado | Identificar sazonalidade ou piora ao longo do tempo |
| **Usinas com Maior Impacto** | Top 10 usinas por MW cortados | Priorizar ações operacionais |
| **Gap de Dados** | Usinas com poucos registros ou muitos nulos | Avaliar qualidade da telemedição |
| **Comparação por Fonte** | Eólica vs outras fontes (se houver) | Benchmarking interno |
| **Análise por Origem** | `cod_origem` (LOC vs SIS) | Entender se restrição é local ou sistêmica |

### 6.2 Próximos Passos Sugeridos

1. **Criar uma view materializada** com os principais indicadores de curtailment por usina/mês.
2. **Cruzar com `fato_disponibilidade`** para calcular % de curtailment sobre a disponibilidade real.
3. **Incluir dados meteorológicos** (`fato_restricao_detalhe`) para correlacionar curtailment com velocidade do vento.
4. **Criar alertas** para usinas com curtailment acima de X% da geração de referência por período.
5. **Análise de causa raiz** cruzando `cod_razao` + `cod_origem` + estado.

---

## 7. Observações Técnicas

- A granularidade esperada é **semi-horária** (intervalos de 30 minutos).
- Recomenda-se sempre filtrar `sk_usina <> 0` para evitar linhas de agregação/desconhecidas.
- O `ROUND()` no PostgreSQL exige cast explícito para `numeric` quando se usa duas casas decimais.
- Existem tabelas particionadas (`fato_restricao_coff_2025`, `fato_restricao_coff_2026`, etc.). Considere criar uma view ou usar particionamento para análises históricas.

---

**Elaborado com base no modelo de dados do DW e no Dicionário Oficial de Dados do ONS - Constrained-Off Usinas Eólicas.**

---

*Relatório gerado automaticamente para fins de análise técnica.*