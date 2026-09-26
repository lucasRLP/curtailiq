# Carga L — fonte histórica de `awsredshaft (1).ipynb` (quarentena)

> **Não usar este reader como integração de produto ou deploy.** Foi validado contra uma fonte Redshift associada ao notebook, cuja fato observada vai apenas até 2011. Juan informou que o pipeline atual automatizado por Databricks publica no Redshift AWS, mas ainda falta provar que database/schema/objetos do notebook correspondem a essa publicação. Status e solicitação para identificar as tabelas corretas: `INTEGRACAO_REDSHIFT_JUAN.md`.

## Estado

Foi criado `app/data_load/redshift.py`, consumidor **somente leitura por código**, separado dos repositories usados pelas rotas atuais. Ele carrega linhas sem joins, agregação, limpeza, unit conversion, COFF classification ou gravação de volta.

Datasets permitidos (allowlist fixa, `datalake.public`): `dim_data`, `dim_subsistema`, `dim_usina`, `fato_geracao`, `fato_taxa_teif_teip`. Os cinco foram conferidos no catálogo informado pelo notebook. Tabelas de fatos obrigam intervalo half-open (`start <= coluna < end`); tabela dimensional não aceita filtro temporal improvisado. Nomes de tabela/coluna e `ORDER BY` não vêm do usuário. Limite por página: 1.000; máximo por chamada: 100.000 linhas. Ao ultrapassar o limite, falha sem devolver um conjunto parcial.

Preserva nulos, zeros, string vazia e tipos nativos; o código não rotula geração como curtailment. A carga produz um `load_id` local, não uma release/snapshot imutável do fornecedor (`single_connection_read_transaction_not_immutable_release`). O resultado não deve ser comparado entre extrações como se tivesse consistência histórica ou as-of.

## Verificação contra a fonte

- Conexão ao cluster: `SELECT current_database(), 1` confirmou que a conexão abre no database `datalake`. Não executei células do notebook.
- Catálogo: as cinco tabelas esperadas existem em `public`.
- Carga completa da dimensão `dim_usina`: **6.803 linhas**, 13 colunas; CEG nulo em 730 registros. Nenhuma linha foi gravada no disco.
- Perfil de cobertura de `fato_geracao`: `din_instante` mínimo `2000-01-01 02:00:00`, máximo `2011-01-01 01:00:00`.
- Carga por este backend: **248 linhas** de `fato_geracao` em `[2011-01-01 01:00, 02:00)`, 1 página, 17 colunas. Não é dado COFF nem período operacional recente. A primeira janela tentada em 2025 voltou vazia; não foi convertida em zeros.
- Garantia de autenticação em produção: usar principal do banco dedicado com permissão SELECT-only. O código envia apenas `SELECT`; permissões no Redshift precisam ser de fato restritas também.

Esta leitura valida conectividade/carga bounded **somente para a fonte histórica associada ao notebook**. Não valida query/metrics do notebook, a publicação atual do Juan nem o atual COFF. Não há API HTTP confirmada; identificar primeiro o database/schema/view efetivamente atualizado no Redshift pelo Databricks.

## Credenciais e segurança

O notebook tem valores de conexão/credencial em código-fonte em texto claro. Não copiar valores para este repositório, arquivo `.env`, shell history, scripts, relatório ou logs. Retirar a credencial do notebook compartilhado e **rotacionar/revogar a que foi exposta**; configurar uma credencial de leitura nova em secret manager ou variáveis de ambiente depois da rotação. A validação pontual leu os parâmetros do notebook diretamente em memória e não os imprimiu.

Configuração reconhecida via `RedshiftSettings`:
- `REDSHIFT_HOST`
- `REDSHIFT_PORT` (default 5439)
- `REDSHIFT_DATABASE` (tem de ser `datalake`)
- `REDSHIFT_USER`
- `REDSHIFT_PASSWORD`
- `REDSHIFT_TIMEOUT_SECONDS` (1–60)
- `REDSHIFT_SSL` (default true)

Não injete as credenciais do notebook novamente. Depois de provisionado um principal SELECT-only, em PowerShell local (os segredos não devem ser salvos no Git):

```powershell
$env:REDSHIFT_HOST = '<host fornecido pelo responsável>'
$env:REDSHIFT_PORT = '5439'
$env:REDSHIFT_DATABASE = 'datalake'
$env:REDSHIFT_USER = '<principal somente leitura>'
$env:REDSHIFT_PASSWORD = '<senha nova após rotação>'
```

Essas variáveis apenas configuram o leitor; por padrão as rotas financeiras/operacionais continuam usando os repositories já configurados. Não existe endpoint público para baixar as tabelas brutas. O futuro consumidor da API de dados Databricks/AWS deve ser outro adapter atrás do mesmo limite de leitura quando o OpenAPI/credencial de serviço for entregue. Não expor esta conexão no browser.

## Uso em código Python

```python
from datetime import datetime
from app.data_load.redshift import RedshiftReadOnlyLoader
from app.data_load.settings import RedshiftSettings

loader = RedshiftReadOnlyLoader(RedshiftSettings())
rows = loader.load_table(
    "fato_geracao",
    start=datetime(2011, 1, 1, 1),
    end=datetime(2011, 1, 1, 2),  # exclusivo
    page_size=500,
    max_rows=10_000,
)
```

O trecho ilustra interface; não representa um endpoint nem uma recomendação de período para análise. A API futura pode substituir o transporte, sem autorizar lógica ETL nesta camada.

## Arquivos

- `backend/app/data_load/settings.py` — variáveis e segredo mascarado em representação.
- `backend/app/data_load/models.py` — resultado de carga com proveniência/local run.
- `backend/app/data_load/redshift.py` — allowlist, intervalos, paginação limitada, erro sanitizado, SELECT somente.
- `backend/tests/test_redshift_load.py` — tests offline com connector injetado; não usam senha real.
- `backend/pyproject.toml`, `backend/uv.lock` — dependência `redshift-connector` para carga runtime.

Testes: `uv run --with pytest python -m pytest tests/test_redshift_load.py -q --basetemp=.pytest-load-final` (a partir de `backend`).
