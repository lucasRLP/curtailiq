import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Activity, ArrowRight, Pause, Play, SkipBack, Wind } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Slider } from "@/components/ui/slider"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { PageHeader } from "@/components/shared/PageHeader"
import { StatTile } from "@/components/shared/StatTile"
import { DataKindBadge } from "@/components/shared/Provenance"
import { ErrorState } from "@/components/shared/ErrorState"
import { useOperacaoContext } from "@/components/shell/OperacaoShell"
import { useOperacaoDemo, useScadaUltimo } from "@/hooks/useOperacao"
import { endpointIndisponivel } from "@/api/client"
import { fmtDiaHora, fmtInt, fmtNum } from "@/lib/formatters"
import { cn } from "@/lib/utils"
import type { OperationPoint, ScadaLeitura, ScadaSample, ScadaStatus } from "@/types/operacao"

/* ============================================================================
   SCADA operacional.

   Duas fontes, mesma tela:

   - **Ao vivo** (`/operacao/usinas/{id}/scada/ultimo`), quando a rota existir:
     o parque de verdade, atualizando sozinho.
   - **Gêmeo digital** (`/operacao/demo`), que já está no ar: 1728 amostras de
     10 em 10 minutos, seis turbinas, no mesmo formato canônico. Aqui a tela
     percorre o cenário com um cursor de tempo, que é o substituto honesto do
     tempo real enquanto o parque real não está conectado.

   O ponto da tela não é mostrar telemetria: é cruzar o estado das turbinas com
   a janela de corte para responder **se agora é hora de parar turbina**.
   ========================================================================= */

const ESTADOS: Record<ScadaStatus, { label: string; ponto: string; texto: string }> = {
  operando: { label: "Operando", ponto: "bg-good", texto: "text-good" },
  limitada: { label: "Limitada por corte", ponto: "bg-warning", texto: "text-warning" },
  parada_manutencao: { label: "Parada · manutenção", ponto: "bg-chart-1", texto: "text-chart-1" },
  parada_falha: { label: "Parada · falha", ponto: "bg-critical", texto: "text-critical" },
  parada_rede: { label: "Parada · rede", ponto: "bg-serious", texto: "text-serious" },
  desconhecido: { label: "Desconhecido", ponto: "bg-muted-foreground", texto: "text-muted-foreground" },
}

const QUALIDADE_AVISO: Record<string, string> = {
  interpolado: "Valor interpolado pelo adaptador.",
  ausente: "Sem leitura no intervalo.",
  suspeito: "Leitura fora da faixa esperada.",
}

/** Avanço do cursor no cenário: um passo de 10 min a cada 1,2 s. */
const INTERVALO_PASSO_MS = 1200

function CartaoTurbina({ leitura }: { leitura: ScadaLeitura }) {
  const estado = ESTADOS[leitura.status] ?? ESTADOS.desconhecido
  const potencia = Number(leitura.potencia_kw ?? 0)
  const disponivel = Number(leitura.potencia_disponivel_kw ?? 0)
  const aproveitamento = disponivel > 0 ? Math.max(0, Math.min(100, (potencia / disponivel) * 100)) : 0
  const cortado = disponivel - potencia
  const limitada = cortado > 1

  return (
    <article className="panel p-3.5">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold">{leitura.turbine_id}</p>
          <p className={cn("mt-0.5 flex items-center gap-1.5 text-[0.6875rem]", estado.texto)}>
            <span aria-hidden className={cn("inline-block h-1.5 w-1.5 rounded-full", estado.ponto)} />
            {estado.label}
          </p>
        </div>
        {leitura.qualidade !== "ok" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="shrink-0 cursor-default rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[0.625rem] font-medium text-warning">
                {leitura.qualidade}
              </span>
            </TooltipTrigger>
            <TooltipContent>{QUALIDADE_AVISO[leitura.qualidade] ?? "Qualidade do dado degradada."}</TooltipContent>
          </Tooltip>
        )}
      </header>

      <p className="tabular mt-2.5 text-xl font-bold leading-none">
        {fmtNum(potencia / 1000)} <span className="text-xs font-medium text-muted-foreground">MW</span>
      </p>

      {/* O vão até 100% é exatamente o que o corte está tirando desta turbina. */}
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted" title="Gerado sobre o disponível">
        <div
          className={cn("h-full rounded-full", limitada ? "bg-warning" : "bg-good")}
          style={{ width: `${aproveitamento}%` }}
        />
      </div>
      <p className="mt-1.5 text-[0.625rem] text-muted-foreground">
        {fmtNum(disponivel / 1000)} MW disponíveis
        {limitada && <span className="text-warning"> · {fmtNum(cortado / 1000)} MW cortados</span>}
      </p>

      <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border pt-2 text-[0.625rem]">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Vento</dt>
          <dd className="tabular">{leitura.vento_ms != null ? `${fmtNum(leitura.vento_ms)} m/s` : "—"}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Rotor</dt>
          <dd className="tabular">{leitura.rotor_rpm != null ? `${fmtNum(leitura.rotor_rpm)} rpm` : "—"}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Pitch</dt>
          <dd className="tabular">{leitura.pitch_graus != null ? `${fmtNum(leitura.pitch_graus)}°` : "—"}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Nacele</dt>
          <dd className="tabular">{leitura.temp_nacele_c != null ? `${fmtNum(leitura.temp_nacele_c)} °C` : "—"}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Mancal ger.</dt>
          <dd className="tabular">
            {leitura.temp_mancal_gerador_c != null ? `${fmtNum(leitura.temp_mancal_gerador_c)} °C` : "—"}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Setpoint</dt>
          <dd className="tabular">{leitura.setpoint_kw != null ? `${fmtNum(leitura.setpoint_kw / 1000)} MW` : "—"}</dd>
        </div>
      </dl>
    </article>
  )
}

export default function Scada() {
  const { plantId, usina } = useOperacaoContext()

  // Tenta o parque real; o cenário entra quando a rota ainda não existe.
  const aoVivo = useScadaUltimo(plantId, 10_000, Boolean(plantId))
  const usarCenario = endpointIndisponivel(aoVivo.error)
  const cenario = useOperacaoDemo()

  const [indice, setIndice] = useState(0)
  const [rodando, setRodando] = useState(false)

  /** Amostras SCADA indexadas pelo instante, para achar o corte do cursor. */
  const porInstante = useMemo(() => {
    const mapa = new Map<string, ScadaSample[]>()
    for (const amostra of cenario.data?.scada ?? []) {
      const lista = mapa.get(amostra.ts) ?? []
      lista.push(amostra)
      mapa.set(amostra.ts, lista)
    }
    return mapa
  }, [cenario.data])

  const timeline = useMemo(() => cenario.data?.timeline ?? [], [cenario.data])
  const passoAtual: OperationPoint | undefined = timeline[Math.min(indice, timeline.length - 1)]

  // Memorizado porque alimenta o agregado: sem isto, o recorte do instante
  // ganha identidade nova a cada render e o cálculo refaz sem necessidade.
  const leiturasCenario = useMemo(
    () => ((passoAtual ? porInstante.get(passoAtual.ts) ?? [] : []) as unknown as ScadaLeitura[]),
    [passoAtual, porInstante],
  )

  // Avanço automático: percorre o cenário como se fosse o relógio do turno.
  useEffect(() => {
    if (!rodando || timeline.length === 0) return
    const timer = window.setInterval(() => {
      setIndice((atual) => (atual + 1) % timeline.length)
    }, INTERVALO_PASSO_MS)
    return () => window.clearInterval(timer)
  }, [rodando, timeline.length])

  /* ---- estado do parque no instante do cursor ---------------------------- */

  const leituras = usarCenario ? leiturasCenario : aoVivo.data?.turbinas ?? []

  const agregado = useMemo(() => {
    if (!usarCenario) return aoVivo.data?.agregado
    if (leiturasCenario.length === 0) return undefined

    const gerado = leiturasCenario.reduce((acc, l) => acc + Number(l.potencia_kw ?? 0), 0)
    const disponivel = leiturasCenario.reduce((acc, l) => acc + Number(l.potencia_disponivel_kw ?? 0), 0)
    const vento = leiturasCenario.reduce((acc, l) => acc + Number(l.vento_ms ?? 0), 0) / leiturasCenario.length

    return {
      potencia_total_kw: gerado,
      potencia_disponivel_total_kw: disponivel,
      limitacao_kw: Math.max(0, disponivel - gerado),
      vento_medio_ms: vento,
      turbinas_operando: leiturasCenario.filter((l) => l.status === "operando").length,
      turbinas_limitadas: leiturasCenario.filter((l) => l.status === "limitada").length,
      turbinas_paradas: leiturasCenario.filter((l) => l.status.startsWith("parada")).length,
    }
  }, [usarCenario, aoVivo.data, leiturasCenario])

  const instante = usarCenario ? passoAtual?.ts : aoVivo.data?.ts
  const emCorte = (agregado?.limitacao_kw ?? 0) > 1
  const carregando = usarCenario ? cenario.isLoading : aoVivo.isLoading

  /* ---- erro de verdade (não é "rota ausente") ----------------------------- */
  const erroReal = usarCenario ? cenario.error : aoVivo.error && !usarCenario ? aoVivo.error : null

  return (
    <>
      <PageHeader
        eyebrow="SCADA"
        title="Turbina a turbina, agora"
        description={
          usarCenario
            ? "O parque real ainda não está conectado, então a tela roda sobre o gêmeo digital: mesmas amostras de 10 em 10 minutos, mesmo formato canônico. O cursor abaixo é o relógio do cenário."
            : `Última leitura de cada turbina de ${usina?.nome ?? "parque"}, no formato canônico de 10 minutos — independente de o dado ter vindo por CSV, OPC UA ou Modbus.`
        }
        meta={
          <>
            <DataKindBadge kind={usarCenario ? "simulado" : "historico"} />
            {instante && (
              <span className="tabular rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[0.6875rem] text-muted-foreground">
                {fmtDiaHora(instante)}
              </span>
            )}
            <span className="rounded-full border border-border bg-muted/60 px-2 py-0.5 font-mono text-[0.6875rem] text-muted-foreground">
              {usarCenario ? (cenario.data?.scada[0]?.fonte_ingestao ?? "twin") : aoVivo.data?.fonte_ingestao}
            </span>
          </>
        }
        actions={
          usarCenario && timeline.length > 0 ? (
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setIndice(0)}>
                <SkipBack className="h-3.5 w-3.5" />
                Início
              </Button>
              <Button size="sm" className="h-8 gap-1.5" onClick={() => setRodando((v) => !v)}>
                {rodando ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                {rodando ? "Pausar" : "Rodar cenário"}
              </Button>
            </div>
          ) : undefined
        }
      />

      {erroReal && <ErrorState error={erroReal} />}

      {/* ---- cursor de tempo do cenário ---------------------------------- */}
      {usarCenario && timeline.length > 0 && (
        <section className="panel p-4">
          <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-xs font-medium">
              Passo {fmtInt(indice + 1)} de {fmtInt(timeline.length)}
              <span className="ml-2 font-normal text-muted-foreground">
                {passoAtual ? fmtDiaHora(passoAtual.ts) : ""}
              </span>
            </p>
            <p className="text-[0.6875rem] text-muted-foreground">
              {fmtInt(timeline.filter((p) => p.curtailed_mw > 0).length)} dos {fmtInt(timeline.length)} intervalos do
              cenário têm corte ativo
            </p>
          </div>
          <Slider
            min={0}
            max={timeline.length - 1}
            step={1}
            value={[Math.min(indice, timeline.length - 1)]}
            onValueChange={([v]) => {
              setRodando(false)
              setIndice(v)
            }}
            aria-label="Instante do cenário"
          />
        </section>
      )}

      {carregando ? (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-52" />
            ))}
          </div>
        </>
      ) : agregado ? (
        <>
          {/* ---- a decisão, antes da telemetria --------------------------- */}
          <section
            className={cn(
              "panel flex flex-wrap items-center justify-between gap-4 p-4",
              emCorte ? "border-recoverable/40 bg-recoverable/[0.05]" : "border-border",
            )}
          >
            <div className="min-w-0">
              <p className={cn("text-sm font-semibold", emCorte ? "text-recoverable" : "text-foreground")}>
                {emCorte
                  ? `Janela de corte ativa: ${fmtNum(agregado.limitacao_kw / 1000)} MW sendo perdidos agora`
                  : "Sem limitação de escoamento neste momento"}
              </p>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
                {emCorte
                  ? "Esta energia já está perdida — é a hora mais barata de parar turbina para manutenção, teste ou inspeção. Se o corte for ressarcível, a parada reduz a disponibilidade e derruba parte do pleito; o agendador considera isso."
                  : "Qualquer parada agora custa geração cheia. Vale checar a previsão e esperar a próxima janela, se a tarefa puder aguardar."}
              </p>
            </div>
            <Button asChild size="sm" variant={emCorte ? "default" : "outline"} className="h-8 shrink-0 gap-1.5 text-xs">
              <Link to="/operacao/manutencao">
                {emCorte ? "Agendar parada nesta janela" : "Ver agendador"} <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </section>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatTile
              label="Potência gerada"
              value={`${fmtNum(agregado.potencia_total_kw / 1000)} MW`}
              accent="energy"
              size="lg"
              sub={`${fmtNum(agregado.potencia_disponivel_total_kw / 1000)} MW disponíveis no parque`}
            />
            <StatTile
              label="Sendo cortado"
              value={`${fmtNum(agregado.limitacao_kw / 1000)} MW`}
              accent={emCorte ? "loss" : "neutral"}
              size="lg"
              sub={
                passoAtual
                  ? `Teto de exportação: ${fmtNum(passoAtual.export_limit_mw)} MW`
                  : "Diferença entre disponível e gerado"
              }
            />
            <StatTile
              label="Vento médio"
              value={agregado.vento_medio_ms != null ? `${fmtNum(agregado.vento_medio_ms)} m/s` : "—"}
              accent="neutral"
              size="lg"
              icon={<Wind className="h-4 w-4" />}
              sub="Acima do limite operacional, tarefas com subida na nacele ficam bloqueadas."
            />
            <StatTile
              label="Turbinas"
              value={`${fmtInt(agregado.turbinas_operando)} operando`}
              accent="neutral"
              size="lg"
              sub={`${fmtInt(agregado.turbinas_limitadas)} limitadas · ${fmtInt(agregado.turbinas_paradas)} paradas`}
            />
          </div>

          <section>
            <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="panel-title flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                {fmtInt(leituras.length)} turbinas
              </h2>
              {passoAtual && (
                <span className="tabular text-[0.6875rem] text-muted-foreground">
                  PLD {fmtNum(passoAtual.price_brl_mwh)} R$/MWh · SOC da bateria {fmtNum(passoAtual.soc_mwh)} MWh
                </span>
              )}
            </header>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {leituras.map((leitura) => (
                <CartaoTurbina key={leitura.turbine_id} leitura={leitura} />
              ))}
            </div>
          </section>

          <p className="text-[0.6875rem] text-muted-foreground">
            Esta tela é somente leitura. O CurtailIQ não envia comando para nenhum equipamento.
            {usarCenario && " Os dados vêm do gêmeo digital e carregam is_simulated=true na origem."}
          </p>
        </>
      ) : null}
    </>
  )
}
