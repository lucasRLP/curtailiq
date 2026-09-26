# SCADA demonstrativo — CSV, OPC UA e armazenamento local

## O que existe

- `backend/app/scada_demo/codec.py`: contrato estrito, CSV com null/booleanos explícitos, timestamps UTC, rejeição de duplicatas e conflitos, SQLite append-only idempotente/transacional.
- `quality.py`: marca potência acima do nominal, lacunas e vento constante por mais de uma hora. Não é diagnóstico de falha nem validação OEM.
- `opcua.py`: servidor asyncua local com variáveis somente leitura, cliente e frame atômico.
- `backend/scripts/scada_demo.py`: export, serve e read.
- `backend/scripts/operation_study.py`: estudo de sensibilidades sintéticas.

Dados 100% simulados; o codec rejeita `is_simulated=false`. Isso é deliberadamente um adaptador da demo, NÃO um parser genérico para SCADA de cliente/Kelmarsh. Não usa Postgres nem altera pipeline de dados.

## Executar no PowerShell

Na raiz do backend:

```powershell
cd C:\Users\lucas\documents\energithon\backend
$env:DATA_BACKEND = 'mock'
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Em outro terminal:

```powershell
Invoke-RestMethod 'http://127.0.0.1:8000/api/operacao/demo'
$body = @{ days=2; seed=42; battery_mwh=12; battery_mw=3; teams=2 } | ConvertTo-Json
Invoke-RestMethod 'http://127.0.0.1:8000/api/operacao/demo' -Method Post -ContentType 'application/json' -Body $body
```

Exportar cenário e relatório:

```powershell
uv run python scripts/scada_demo.py export --days 2 --output data/operation_demo_run
uv run python scripts/operation_study.py --seeds 30 --days 2 --output data/operation_demo_study
```

Para alterar todos os parâmetros, criar JSON com campos de DemoConfig e passar `--config caminho.json` ao export. O JSON substitui days/seed da CLI. Export gera `scenario.json`, `scada.csv`, `report.md` e `manifest.json` com SHA256. Export novamente para o mesmo diretório substitui os artefatos; use diretórios diferentes para preservar execuções.

Servidor de replay (dependência asyncua opcional, não muda a instalação principal):

```powershell
uv run --with asyncua python scripts/scada_demo.py serve --csv data/operation_demo_run/scada.csv --endpoint opc.tcp://127.0.0.1:4845/demo/ --interval 1
```

Consumidor, em outro terminal:

```powershell
uv run --with asyncua python scripts/scada_demo.py read --endpoint opc.tcp://127.0.0.1:4845/demo/ --samples 60 --interval 1 --database data/operation_demo_run/readings.sqlite
```

Ctrl+C encerra replay. `--once` executa uma passagem e encerra. `interval` é tempo de parede entre frames de 10 minutos; não muda a duração física dos intervalos nem integra energia pelo relógio do replay.

## Semântica OPC UA

Namespace `urn:curtailiq:synthetic:scada:v1`; objeto `Plant_DEMO_NE`; cada turbina tem tags `WindSpeed`, `ActivePower`, `AvailablePower`, `Setpoint`, `Pitch`, `RotorSpeed`, `TempNacelle`, `TempGenBearing`, `TempGearBearing`, `Status` e metadados. NodeId string `<turbine_id>/<Tag>` no namespace da demo.

Variáveis não recebem `set_writable`; testes reais confirmam que escrita do cliente falha. Conexão restrita a localhost/127.0.0.1/::1. Sem TLS/autenticação industrial: não expor porta fora da máquina nem encaminhá-la à internet.

`Snapshot` contém frame JSON atômico com tags externas; o leitor aplica o mapeamento para campos canônicos. Isso evita misturar valores de frames diferentes durante atualização por campo. Tags individuais continuam disponíveis para browsing, mas leitura avulsa de várias tags não é atomicamente garantida. Sensores ausentes usam NaN nas tags numéricas para browsing e null + qualidade no frame/CSV.

`fonte_ingestao` preserva o produtor (`twin`) para roundtrip/proveniência; o transporte é conhecido pela execução do leitor OPC UA. Não confundir transporte com observação real.

## Limites do polling

É leitura de snapshots, não acesso ao historiador OPC UA. Se o consumidor for mais lento que o replay, haverá frames pulados. Isso ocorreu no smoke real e é esperado: SQLite preserva o timestamp da simulação e não preenche lacunas. Para histórico completo use importação CSV ou futura assinatura/buffer com confirmação; não declarar que polling recuperou todos os intervalos.

SQLite rejeita payload diferente para mesma turbina/timestamp, sem sobrescrever silenciosamente. Use um arquivo DB por cenário; mudar seed/config e reutilizar a mesma DB deve gerar conflito, não mesclar cenários. Retry idêntico retorna zero novas linhas.

## Testes

```powershell
$env:DATA_BACKEND = 'mock'
uv run --with pytest --with asyncua python -m pytest tests/test_operation_demo.py tests/test_scada_demo.py tests/test_maintenance_cost.py -q --basetemp=.pytest-scada-local
```

A dependência asyncua é necessária para não pular o teste de protocolo. O teste real abre uma porta loopback livre, faz replay, lê frame, tenta escrever (deve falhar), encerra e abre novamente na mesma porta. Testes CSV verificam booleanos/null, UTC, duplicatas, conflitos SQLite, status e limites de potência. O basetemp local evita problemas de permissão do tmp no Windows.

## Evidência desta implementação

- GET/POST exercitados por TestClient e POST por HTTP em uvicorn local; health OK.
- Replay CLI OPC UA real + cliente CLI: cinco snapshots, seis turbinas, trinta linhas confirmadas no SQLite.
- Teste de escala: 7 dias × 20 turbinas, 1.008 intervalos e 20.160 leituras, geração aproximadamente 0,35 s nesta máquina; JSON cerca de 10 MB. Não é SLA de produção.
- Artefatos reais em `backend/data/operation_demo_run/` e `backend/data/operation_demo_study/`.
