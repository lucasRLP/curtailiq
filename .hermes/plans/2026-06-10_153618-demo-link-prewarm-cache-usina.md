# Plano — Link de apresentação que abre a aplicação com cache pré-aquecido por usina

Data: 2026-06-10 15:36

## Objetivo

Permitir que, no meio de uma apresentação, o apresentador clique em um link do slide e abra a aplicação já em uma usina específica com os dados principais pré-carregados/cacheados, reduzindo risco de espera visível durante a demo.

Exemplo desejado:

```text
https://app.exemplo.com/demo/PISDP1?tab=resumo&warm=1
```

Esse link deveria:

1. abrir direto a aplicação na usina escolhida;
2. pré-aquecer os endpoints pesados dessa usina;
3. levar o usuário para a aba alvo, por exemplo Resumo, Financeiro, Simulador ou Dossiê;
4. deixar as demais abas já rápidas se o apresentador navegar depois;
5. exibir uma tela elegante de preparação enquanto o prewarm roda;
6. em ambiente cacheado, demorar poucos segundos.

## Contexto atual

Já existem caches backend para:

- lista de usinas;
- detalhe da usina;
- financeiro;
- regulatório;
- BESS;
- pleito IA;
- headers HTTP de `GET /api/*`.

O cache atual é in-memory no backend. Isso é suficiente para MVP/demo, mas ele só esquenta depois que alguém chama o endpoint.

Hoje, se o primeiro clique da demo for em uma usina fria, a aplicação ainda precisa fazer as chamadas iniciais naquele momento. A solução é criar um fluxo explícito de prewarm por link.

## Melhor abordagem para apresentação

A melhor solução é combinar duas camadas:

1. Link especial de demo no front
2. Endpoint backend de prewarm por usina

### Link especial

Criar uma rota dedicada:

```text
/demo/:usinaId
```

Com query params opcionais:

```text
/demo/PISDP1?tab=resumo
/demo/PISDP1?tab=financeiro
/demo/PISDP1?tab=bess
/demo/PISDP1?tab=dossie
```

Ao abrir, essa página:

1. mostra uma tela de carregamento de demo;
2. chama um endpoint backend de prewarm;
3. em paralelo, pré-carrega queries do React Query no browser;
4. redireciona para a aba final:

```text
/usinas/PISDP1/resumo
/usinas/PISDP1/financeiro
/usinas/PISDP1/bess
/usinas/PISDP1/dossie
```

### Endpoint backend de prewarm

Criar endpoint:

```http
POST /api/demo/prewarm/{usina_id}
```

ou, para ser clicável/testável sem corpo:

```http
GET /api/demo/prewarm/{usina_id}?profile=pitch
```

Eu prefiro `POST` tecnicamente, mas para demo/slides `GET` é mais prático. Podemos aceitar ambos.

Esse endpoint chamaria internamente os serviços já cacheados:

- detalhe da usina;
- resumo executivo últimos 90 dias;
- financeiro últimos 90 dias;
- exposição/previsão financeira 30 dias;
- simulação BESS com parâmetros padrão da demo;
- eventos regulatórios/pleito elegível;
- opcionalmente geração de pleito IA, se já houver evento padrão selecionável.

Retorno sugerido:

```json
{
  "usina_id": "PISDP1",
  "profile": "pitch",
  "status": "ok",
  "elapsed_ms": 2430,
  "warmed": {
    "usina_detail": true,
    "resumo": true,
    "financeiro": true,
    "bess": true,
    "regulatorio": true,
    "pleito_ia": false
  },
  "redirect_to": "/usinas/PISDP1/resumo"
}
```

## Fluxo ideal durante a apresentação

### Antes da apresentação

Abrir uma URL de warmup geral, por exemplo:

```text
https://app.exemplo.com/demo/PISDP1?tab=resumo&warm=1
```

Ou deixar uma aba escondida aberta 1 minuto antes.

Isso já aquece:

- cache do backend;
- cache HTTP/CDN/browser;
- cache do React Query no navegador da máquina da apresentação.

### Durante a apresentação

No slide, colocar o link final:

```text
https://app.exemplo.com/demo/PISDP1?tab=resumo
```

Ao clicar:

1. aparece uma tela tipo “Preparando contexto da Sol do Piauí…”;
2. o app chama `/api/demo/prewarm/PISDP1?profile=pitch`;
3. se os dados já estiverem cacheados, a resposta deve vir rápido;
4. após sucesso ou timeout curto, redireciona para `/usinas/PISDP1/resumo`.

## Timeout recomendado

Para demo, eu não deixaria o prewarm prender a apresentação por muito tempo.

Regras sugeridas no front:

- loading mínimo visual: 800ms;
- timeout máximo para cache/prewarm: 5s;
- se passar de 5s, segue para a tela mesmo assim com os loaders normais das abas;
- se o endpoint retornar erro, segue para a tela e mostra aviso discreto, não bloqueante.

Isso evita travar a apresentação.

## O que pré-aquecer para uma usina

Para a demo da Sol do Piauí (`PISDP1`), prewarm recomendado:

### Essencial

1. `GET /api/usinas/PISDP1`
2. `GET /api/usinas/PISDP1/resumo?inicio=<default_90d>&fim=<max_solar>`
3. `GET /api/usinas/PISDP1/perda?inicio=<default_90d>&fim=<max_solar>`
4. `GET /api/usinas/PISDP1/bess/simular?...params padrão...`

### Desejável

5. `GET /api/usinas/PISDP1/eventos-pleito?inicio=<default_90d>&fim=<max_solar>` ou endpoint equivalente regulatório atual
6. `GET /api/cache/status`, só para diagnóstico

### Opcional / com cuidado

7. Gerar pleito IA automaticamente.

Eu não faria geração automática do pleito IA em todo prewarm por padrão, porque:

- pode consumir custo/token;
- pode demorar se ainda não estiver cacheado;
- pode criar expectativa de documento pronto sem seleção humana de eventos.

Melhor opção:

- `profile=pitch` aquece dados principais sem IA;
- `profile=pitch-full` também gera pleito IA para um conjunto padrão de eventos elegíveis.

Exemplo:

```text
/demo/PISDP1?tab=dossie&profile=pitch-full
```

## Como escolher datas no prewarm

Usar as mesmas janelas do front para não aquecer cache errado.

Atualmente o front usa:

- solar max: `2026-05-29T23:30:00`
- eólica max: `2023-02-28T23:30:00`
- histórico padrão: 90 dias

O backend de prewarm deve replicar essa regra ou expor um helper compartilhado equivalente.

Para Sol do Piauí:

```text
fim = 2026-05-29T23:30:00
inicio = 2026-02-28T23:30:00
```

## Melhorias de carregamento da aplicação

Além do prewarm, eu faria:

### 1. Prefetch no hover/click do botão

Quando o usuário passar o mouse ou clicar em “Simular BESS”, “Financeiro”, “Dossiê”, o front já chama `queryClient.prefetchQuery()` para a aba destino.

Isso ajuda dentro da navegação normal da app.

### 2. Rota `/demo/:usinaId` com tela de preparação

Tela visual com etapas:

```text
Preparando contexto da usina
✓ Dados cadastrais
✓ Histórico financeiro
✓ Simulação BESS
✓ Eventos regulatórios
```

Mesmo se tudo já estiver cacheado, mostrar por ~800ms para parecer intencional e evitar flash.

### 3. Prefetch de chunks do front

Como as rotas agora são lazy-loaded, o link de demo pode forçar import dos chunks necessários antes do redirect:

- se `tab=resumo`, importar Resumo;
- se `tab=financeiro`, importar Financeiro;
- se `tab=bess`, importar Simulador;
- se `tab=dossie`, importar Dossie.

Isso evita atraso do bundle no primeiro clique.

### 4. Warmup remoto antes da apresentação

Opcionalmente criar uma URL ou comando simples:

```text
https://app.exemplo.com/api/demo/prewarm/PISDP1?profile=pitch
```

Assim o apresentador pode abrir esse link antes da reunião para aquecer cache no backend, mesmo sem abrir a tela final.

## Arquivos que provavelmente mudariam

### Backend

- `backend/app/routers/demo.py`
  - novo router `/api/demo/prewarm/{usina_id}`

- `backend/app/main.py`
  - incluir router de demo

- `backend/app/services/demo_prewarm_service.py`
  - orquestrar chamadas de prewarm por perfil

- `backend/app/config.py`
  - opcional: habilitar/desabilitar endpoints de demo
  - exemplo: `DEMO_PREWARM_ENABLED=true`

- `backend/app/deps.py`
  - dependency do serviço de prewarm

### Frontend

- `front/src/router.tsx`
  - adicionar rota `/demo/:id`

- `front/src/pages/DemoPrewarm/index.tsx`
  - tela de preparação e redirect

- `front/src/api/demo.ts`
  - cliente para `/api/demo/prewarm/:id`

- `front/src/hooks/useDemoPrewarm.ts`
  - hook React Query opcional

- Opcional:
  - `front/src/lib/demoProfiles.ts`
  - mapear `tab` para rota final e chunks

## Pseudofluxo frontend

```tsx
const startedAt = Date.now()
await Promise.race([
  prewarm(usinaId, profile),
  sleep(5000),
])

await Promise.all([
  sleep(Math.max(0, 800 - (Date.now() - startedAt))),
  preloadRouteChunk(tab),
])

navigate(`/usinas/${usinaId}/${tab}`)
```

## Pseudofluxo backend

```python
def prewarm_usina(usina_id: str, profile: str):
    usina = repo.get_usina(usina_id)
    inicio, fim = default_range_for_fonte(usina["fonte"])

    financeiro.calcular_perda(usina_id, inicio, fim)
    financeiro.projetar_exposicao(usina_id, horizonte_horas=24 * 30)
    bess.simular(usina_id, default_bess_params, inicio, fim)
    regulatorio.listar_eventos_pleito(usina_id, inicio, fim)

    if profile == "pitch-full":
        eventos = selecionar_top_eventos_elegiveis(...)
        pleito.gerar_pleito(usina_id, eventos, canal_default)
```

## Riscos e tradeoffs

### Cache in-memory

Funciona bem se houver uma única instância backend. Se houver múltiplas réplicas, o prewarm pode cair em uma instância e o clique posterior em outra.

Mitigação MVP:

- manter uma réplica só;
- ou usar sticky session/proxy;
- ou aceitar que pode haver miss ocasional.

Solução futura:

- Redis.

### Endpoint de prewarm pesado

Se chamar muita coisa ao mesmo tempo, pode demorar ou sobrecarregar banco.

Mitigação:

- profile `pitch` só aquece essencial;
- timeout interno por etapa;
- não falhar tudo se uma etapa falhar;
- retornar status parcial.

### Pleito IA automático

Pode ser caro/lento.

Mitigação:

- não incluir IA no profile padrão;
- criar `pitch-full` só para demo preparada;
- limitar a poucos eventos elegíveis.

## Recomendação para MVP

Implementar em duas fases.

### Fase 1 — suficiente para a apresentação

1. Criar `/api/demo/prewarm/{usina_id}?profile=pitch`.
2. Criar `/demo/:usinaId?tab=resumo` no front.
3. Prewarm apenas:
   - detalhe da usina;
   - resumo;
   - financeiro;
   - BESS default;
   - regulatório/eventos.
4. Timeout máximo de 5s no front.
5. Tela de loading bonita e redirect.

### Fase 2 — se quiser demo de pleito já pronta

1. Adicionar `profile=pitch-full`.
2. Selecionar automaticamente top eventos elegíveis.
3. Gerar/cachear pleito IA antes da apresentação.
4. Na tela de Dossiê, mostrar loading curto e renderizar pleito cacheado.

## Verificação esperada

Testes manuais:

1. Abrir:

```text
/demo/PISDP1?tab=resumo
```

2. Conferir que redireciona para:

```text
/usinas/PISDP1/resumo
```

3. Conferir `/api/cache/status`:

- `usina_detail.entries > 0`
- `financeiro.entries > 0`
- `bess.entries > 0`
- `regulatorio.entries > 0`

4. Abrir Financeiro e BESS depois do Resumo e confirmar carregamento rápido.

5. Reabrir o mesmo link do slide e confirmar tempo perceptível abaixo de 5s.

## Resposta curta à pergunta

Para a apresentação, eu faria um link de slide apontando para uma rota especial `/demo/PISDP1?tab=resumo`. Essa rota primeiro chama um endpoint de prewarm da usina, aquece backend/browser/chunks do front, mostra uma tela de preparação por no mínimo ~800ms e no máximo 5s, e redireciona para a aba final. Para MVP, não precisa Redis; o cache in-memory atual já serve se o deploy tiver uma instância backend.
