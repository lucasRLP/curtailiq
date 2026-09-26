# Correção da Fórmula de Energia Restringida — Base no Dicionário Oficial do ONS (CurtailIQ)

> **Para o agente de código:** esta correção ajusta o cálculo da energia restringida, que hoje usa o campo errado. A fonte é o **dicionário de dados oficial do ONS** (Restrição de Operação por Constrained-off — versão 1.2, 26/09/2025), citado literalmente abaixo. NÃO desfaça a eventização já implementada — ela está correta. Mude apenas: (1) a fórmula da energia restringida, (2) o mapeamento de razões (falta PAR), (3) carregar dois campos novos. Cada item tem critério de aceite.

---

## 0. Por que esta correção

A implementação atual calcula `energia_mwh = val_geracaolimitada * 0.5`. A conversão `× 0,5` (MWmed → MWh num intervalo de 30 min) está **correta**. O campo `val_geracaolimitada`, porém, está **errado** — ele não é a energia cortada.

Confirmação pelo dicionário oficial do ONS (definições literais, todas em MWmed):

| Campo | Definição oficial do ONS |
|---|---|
| `val_geracao` | "Valor da Geração, em MWmed" — o que a usina **efetivamente gerou** |
| `val_geracaolimitada` | "Valor da **Geração Limitada por alguma Restrição**, em MWmed" — a geração sob o teto da restrição (**NÃO é o corte**) |
| `val_disponibilidade` | "Valor da Disponibilidade Verificada no Tempo Real, em MWmed" |
| `val_geracaoreferencia` | "Valor da Geração de Referência (ou estimada), em MWmed" — o que **teria gerado** sem restrição |
| `val_geracaoreferenciafinal` | "Valor da Geração de Referência Final, em MWmed" — referência **oficial de apuração** (preenchida para REL) |

A energia frustrada (cortada) é a **diferença** entre o que a usina teria gerado e o que gerou — não a geração limitada. Usar `val_geracaolimitada` como energia restringida mede a grandeza errada. Isso explica a divergência de 15% (eólica) e 42% (solar) entre `val_geracaolimitada` e `referência − geração` observada antes: são grandezas distintas por definição, não erro de unidade.

---

## 1. FIX — Fórmula da energia restringida

**Trocar** (no ponto único de normalização do COFF, ex.: `parse_constrained_off` / repositório):

```python
# ERRADO (atual):
energia_mwh = val_geracaolimitada * 0.5

# CORRETO:
referencia = val_geracaoreferenciafinal if val_geracaoreferenciafinal is not None else val_geracaoreferencia
energia_frustrada_mwmed = max((referencia or 0.0) - (val_geracao or 0.0), 0.0)
energia_mwh = energia_frustrada_mwmed * 0.5   # 0.5 = intervalo de 30 min (MWmed -> MWh)
```

Notas:
- Preferir `val_geracaoreferenciafinal`; usar `val_geracaoreferencia` como fallback só quando a final for nula. **Atenção:** a referência final é preenchida prioritariamente para **REL**; para CNF/ENE pode vir nula — nesse caso o fallback para `val_geracaoreferencia` mantém o cálculo, mas marque que é estimativa não-oficial (ver §4).
- Clamp em zero sempre (`max(..., 0)`): se geração ≥ referência, não há corte.
- `val_geracaolimitada` **sai** do cálculo de energia restringida. Pode ser mantido como campo informativo/diagnóstico, nunca como energia cortada.
- A conversão `× 0,5` permanece (intervalo confirmado de 30 min).

**Aceite:** spot-check de 10 eventos REL — `(val_geracaoreferenciafinal − val_geracao) × 0,5` deve bater com a energia restringida exibida; `val_geracaolimitada` não deve mais aparecer no cálculo financeiro.

---

## 2. FIX — Mapear a razão `PAR` (falta no normalizador)

O dicionário oficial lista **quatro** valores de `cod_razaorestricao`, não três:
- `REL` — Razão de indisponibilidade externa (elétrica)
- `CNF` — Razão de atendimento a requisitos de confiabilidade
- `ENE` — Razão energética
- `PAR` — **Restrição indicada no parecer de acesso**

`PAR` é restrição prevista no parecer de acesso da própria usina — limitação que o empreendimento aceitou contratualmente ao se conectar. Portanto **não é ressarcível** (a usina conhecia a limitação de antemão; não foi imposição externa superveniente).

**Correção em `normalizar_razao_pleito()` / `classificar_elegibilidade()`:**
```python
# PAR: nunca elegível (restrição contratual de parecer de acesso)
if razao == "PAR":
    -> status = "NAO_ELEGIVEL"; motivo = "Restrição prevista no parecer de acesso (PAR)"

# Qualquer valor de razão não reconhecido (não-REL/CNF/ENE/PAR):
#   -> INDEFINIDO -> REVISAO_HUMANA (nunca default permissivo)
```

**Aceite:** eventos PAR aparecem como não-elegíveis; nenhum valor de razão cai em default permissivo. Teste unitário com os quatro valores + um valor desconhecido.

---

## 3. FIX — Carregar dois campos novos do ONS

**`dsc_restricao`** (tabela agregada, adicionado em set/2025): "Detalhamento do motivo da restrição de geração" — texto livre até 600 caracteres, descrição do ONS sobre por que o corte ocorreu. Valor direto para o agente de pleito (fundamentação do dossiê e argumento de contestação). Adicionar à query, ao contrato de domínio e passar ao pacote estruturado da LLM.

**`flg_dadoventoinvalido`** (tabela *detail* eólica): flag = 1 quando a medição de vento do ONS falhou por mais de 6 min na semi-hora. Relevante porque (a) sinaliza menor confiabilidade da geração estimada e (b) é exatamente o gancho do Ofício 61/2025-SGM para o gerador substituir os dados do ONS pelos próprios — argumento central de contestação. Carregar quando a detail for usada.

**Aceite:** `dsc_restricao` disponível no pacote do agente de pleito; `flg_dadoventoinvalido` disponível no fluxo da detail.

---

## 4. Consistência com a elegibilidade (lembrete, não muda nada novo)

A referência final ser preenchida só para REL reforça a postura já definida na adenda regulatória:
- **REL**: apuração oficial existe (`val_geracaoreferenciafinal`). Cálculo é oficial.
- **CNF / ENE / PAR**: a referência final pode vir nula; qualquer energia frustrada calculada para esses casos é **estimativa não-oficial** (fallback para `val_geracaoreferencia`). Marcar com flag `referencia_oficial = (val_geracaoreferenciafinal is not None)` no evento, e expor como assunção no dossiê.

Mantém-se a regra de elegibilidade da adenda: REL+SIS (Protocolo, com franquia), CNF+SIS na janela do Termo, ENE/PAR não elegíveis, LOC/origem ausente → revisão humana.

---

## 5. Resumo do que muda e do que não muda

**Muda:**
- Fórmula da energia restringida → `(referência final ou referência) − geração`, com `× 0,5`.
- `val_geracaolimitada` deixa de ser fonte de energia cortada.
- `PAR` mapeado como não-elegível.
- `dsc_restricao` e `flg_dadoventoinvalido` carregados.
- Flag `referencia_oficial` por evento.

**Não muda:**
- Eventização (intervalos → eventos contínuos) — está correta.
- Conversão `× 0,5` — está correta.
- Agente LLM de redação.
- Arquitetura de camadas.

**Impacto esperado nos números:** a energia frustrada real (referência − geração) tende a diferir do que `val_geracaolimitada` produzia (maior na solar, menor na eólica, conforme observado). Os valores podem mudar — mas passam a estar corretos pela **definição oficial do ONS** (dicionário v1.2) e pela metodologia do Submódulo 5.13, o que é defensável diante de qualquer avaliador técnico.
