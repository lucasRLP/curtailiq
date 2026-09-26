# Arquitetura do Data Warehouse e Guia de Implementação (Backend & Frontend)

**Projeto:** CurtailIQ — Hacka-Energinn  
**Data:** Junho de 2026  
**Banco de Dados:** `hacka-energinn` (PostgreSQL 17.10)

Este documento detalha a arquitetura completa do banco de dados analítico (Data Warehouse) e especifica como as equipes de **Backend** e **Frontend** devem consumir e apresentar esses dados, com foco no cálculo de *curtailment* (restrição de geração) por usina.

---

## 1. A Arquitetura do Data Warehouse (DW)

A infraestrutura foi construída sob o *schema* principal `dw` usando um modelo híbrido (**Galaxy** + **Snowflake** + **Marts Particionados**). Esse desenho foca na velocidade de consulta (*Dashboard-ready*) e escalabilidade.

### 1.1 Modelo Galaxy & Snowflake (Floco)
- O centro do ecossistema possui **7 Tabelas de Fatos** (ex: `fato_geracao`, `fato_restricao_coff`).
- Existem **6 Dimensões Conformadas** compartilhadas. A arquitetura *Snowflake* (floco de neve) é aplicada em hierarquias como geografia e mercado (`id_estado` → `nom_estado` → `id_subsistema` → `nom_subsistema`).

### 1.2 Os Marts Principais (`mart_eolica` e `mart_solar`)
Para evitar junções pesadas nas consultas de uso diário, foram criados os **Marts**.
- **Denormalização:** Eles "achatam" os metadados de geografia e mercado na mesma linha para leitura rápida.
- **Granularidade:** Semi-horária (intervalos de 30 minutos), respeitando de forma rigorosa o agrupamento **por usina** (`nom_usina`).
- **Particionamento:** Utiliza partições anuais por tabela filha (*Partition Pruning* via `din_instante`), reduzindo o I/O ao filtrar anos específicos.
- **Camada de Enriquecimento:** Trabalha em conjunto com a dimensão nova `dw.dim_usina_potencia`, que faz a correspondência mágica entre o agrupamento global do ONS ("CONJ. X") e as outorgas unitárias da ANEEL ("X I", "X II").

### 1.3 Staging (`stg_ccee`)
Possui a tabela `stg_ccee.pld_horario_submercado`, servindo os valores brutos do Preço de Liquidação das Diferenças (PLD) por hora, abrangendo todos os 4 submercados nacionais.

---

## 2. Implementação no Backend

O ETL propositalmente não calcula o *curtailment*, ele entrega os dados puros (crus). É responsabilidade do **Backend** aplicar as equações e regras de negócio no momento da consulta (*on-the-fly*).

### 2.1 A Equação Oficial de Curtailment
De acordo com o MPO 5.13, para apurar a "Energia Restringida" (em MWh) em um intervalo semi-horário (30 minutos), aplica-se a seguinte fórmula sobre as colunas entregues pelo DW:

```sql
energia_restringida_mwh = MAX(
    COALESCE(val_geracaoreferenciafinal, val_geracaoreferencia) - val_geracao,
    0
) * 0.5
```
*Observação importante:* O fator de **`* 0.5`** é vital, pois converte Potência (MWmed) em Energia (MWh) para um bloco de 30 minutos.

### 2.2 Classificação de Elegibilidade (Regras de Negócio)
O Backend deve interpretar o tipo de restrição utilizando as colunas `cod_razaorestricao` e `cod_origemrestricao` (conforme REN 1.030/2022 e Lei 15.269/2025):

- **Ressarcível:** Quando `cod_razaorestricao` IN ('CNF', 'REL') E `cod_origemrestricao` = 'SIS'.
- **Não Ressarcível:** Quando `cod_razaorestricao` = 'ENE' (significando excesso/sobreoferta no sistema).
- **Revisão Humana Necessária:** Quando for 'LOC' (local) ou quando as razões vierem nulas/inconsistentes.

### 2.3 Exemplo de Consulta Padrão para API (Backend)
O *endpoint* que responde pela análise das usinas executará algo nestes moldes:

```sql
SELECT 
    m.nom_usina,
    -- Volume total cortado (MWh)
    SUM(GREATEST(COALESCE(m.val_geracaoreferenciafinal, m.val_geracaoreferencia) - m.val_geracao, 0) * 0.5) AS corte_total_mwh,
    
    -- Volume elegível a ressarcimento
    SUM(
        CASE WHEN m.cod_razaorestricao IN ('CNF','REL') AND m.cod_origemrestricao = 'SIS'
        THEN GREATEST(COALESCE(m.val_geracaoreferenciafinal, m.val_geracaoreferencia) - m.val_geracao, 0) * 0.5 
        ELSE 0 END
    ) AS corte_ressarcivel_mwh,
    
    -- Traz a potência da ANEEL consolidada
    MAX(p.potencia_mw) AS potencia_instalada_mw
    
FROM dw.mart_solar m
LEFT JOIN dw.dim_usina_potencia p
       ON p.nom_usina = m.nom_usina AND p.fonte = m.fonte
WHERE m.din_instante >= '2025-01-01' AND m.din_instante < '2025-02-01'
GROUP BY m.nom_usina;
```
*(Para cálculo da Perda Financeira, o Backend deve engatar um JOIN com `stg_ccee.pld_horario_submercado` fazendo o de-para de hora/submercado).*

---

## 3. Implementação no Frontend

O **Frontend** consumirá os dados estruturados pelo Backend para prover visualizações granulares. 

### 3.1 Exibição na Interface
- **Granularidade Respeitada:** As tabelas e gráficos primários devem listar as entidades **Por Usina** (`nom_usina`). Como o nome da usina consolida as métricas unitárias da ANEEL, os cards de cada usina podem demonstrar sua "Potência Instalada (ANEEL)".
- **Classificação de Curtailment:** 
  Utilizando os dados classificados pelo backend, o front deve segregar as áreas do gráfico (como *Stacked Bar Charts* ou *Donuts*) em:
  - 🟢 **Ressarcível (Perda Financeira Válida)**: Foca o usuário no montante que a usina deve buscar reparação financeira via CCEE. 
  - 🔴 **Não Ressarcível (Over-supply/ENE)**: Corte esperado do sistema que não gera crédito.
  - 🟡 **Revisão/Indefinido**: Requer atenção do time regulatório.

### 3.2 O que não fazer
- O front **não deve** confundir ou usar a coluna `val_geracaolimitada` como métrica de corte. Esse campo é apenas um teto ou metadado; o corte real advém estritamente da equação baseada na diferença de referência e geração.
- Não agregar o dado em nível de subsistema de imediato sem permitir o *Drill-down* (mergulho) para ver individualmente os parques eólicos e solares, pois o impacto das restrições (principalmente 'LOC') afeta usinas específicas de forma distinta.
