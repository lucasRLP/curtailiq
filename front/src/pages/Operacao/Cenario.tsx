import { useMemo, useState } from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { AlertTriangle, CircleCheck, Info, Play, Wrench } from "lucide-react"
import { PageHeader } from "@/components/shared/PageHeader"
import { StatTile } from "@/components/shared/StatTile"
import { SimulationNotice } from "@/components/shared/Provenance"
import { ErrorState } from "@/components/shared/ErrorState"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Slider } from "@/components/ui/slider"
import {
  ChartEmpty,
  ChartLegend,
  ChartPanel,
  ChartTooltip,
  axisProps,
  gridProps,
  type SeriesConfig,
} from "@/components/charts/chart-kit"
import { useOperacaoDemo, useSimularOperacao } from "@/hooks/useOperacao"
import { fmtBRL, fmtBRLCompacto, fmtDiaHora, fmtInt, fmtMW, fmtMWh, fmtNum } from "@/lib/formatters"
import { cn } from "@/lib/utils"
import type { OperationDemo, OperationTask } from "@/types/operacao"

/* ---------------------------------------------------------------------------
   Operação: manutenção e bateria sobre dado SCADA sintético.

   Tudo nesta tela é cenário simulado — é uma demonstração de continuidade
   operacional, não apuração. O selo "Simulado" é obrigatório e nunca some.
   ------------------------------------------------------------------------ */

const potenciaConfig: SeriesConfig = {
  available_mw: { label: "Disponível (sem manutenção)", color: "var(--chart-6)", dashed: true, format: fmtMW },
  export_limit_mw: { label: "Limite de exportação", color: "var(--loss)", dashed: true, format: fmtMW },
  scheduled_mw: { label: "Gerado com agenda", color: "var(--chart-1)", format: fmtMW },
  export_with_battery_mw: { label: "Exportado com bateria", color: "var(--recoverable)", format: fmtMW },
  curtailed_mw: { label: "Cortado", color: "var(--chart-2)", format: fmtMW },
}

const socConfig: SeriesConfig = {
  soc_mwh: { label: "Estado de carga", color: "var(--recoverable)", format: fmtMWh },
}

/**
 * Carga e descarga compartilham a unidade (MW) e nunca acontecem juntas, então
 * cabem no mesmo eixo: a descarga é espelhada para baixo do zero, o que torna a
 * alternância entre guardar e devolver energia legível de relance.
 */
const fluxoConfig: SeriesConfig = {
  carga: { label: "Carga (guardando)", color: "var(--chart-1)", format: (v) => fmtMW(Math.abs(v)) },
  descarga: { label: "Descarga (devolvendo)", color: "var(--recoverable)", format: (v) => fmtMW(Math.abs(v)) },
}

/**
 * O agendador emite os estados em português ("recomendada"); o contrato de API
 * também prevê os equivalentes em inglês. Os dois vocabulários estão mapeados
 * para a tela não estampar o identificador cru quando um dos lados mudar.
 */
const statusTarefa: Record<string, { label: string; className: string; Icon: typeof CircleCheck }> = {
  recomendada: { label: "Reagendada", className: "text-good", Icon: CircleCheck },
  rescheduled: { label: "Reagendada", className: "text-good", Icon: CircleCheck },
  mantida: { label: "Mantida", className: "text-muted-foreground", Icon: CircleCheck },
  scheduled: { label: "Mantida", className: "text-muted-foreground", Icon: CircleCheck },
  nao_alocada: { label: "Sem janela", className: "text-critical", Icon: AlertTriangle },
  unallocated: { label: "Sem janela", className: "text-critical", Icon: AlertTriangle },
}

/** Severidade do alerta: ícone e cor acompanham o rótulo, nunca a cor sozinha. */
const severidadeAlerta: Record<string, { className: string; Icon: typeof Info }> = {
  info: { className: "text-muted-foreground", Icon: Info },
  aviso: { className: "text-warning", Icon: AlertTriangle },
  alerta: { className: "text-warning", Icon: AlertTriangle },
  warning: { className: "text-warning", Icon: AlertTriangle },
  critico: { className: "text-critical", Icon: AlertTriangle },
  critica: { className: "text-critical", Icon: AlertTriangle },
  critical: { className: "text-critical", Icon: AlertTriangle },
}

function TaskRow({ tarefa }: { tarefa: OperationTask }) {
  const spec = statusTarefa[tarefa.status] ?? {
    label: tarefa.status,
    className: "text-muted-foreground",
    Icon: Info,
  }
  const { Icon } = spec
  return (
    <tr className="border-b border-border/60 last:border-0">
      <td className="px-4 py-2.5 font-mono text-[0.6875rem]">{tarefa.task_id}</td>
      <td className="px-4 py-2.5 text-xs">{tarefa.turbine_id}</td>
      <td className="tabular px-4 py-2.5 text-right text-xs text-muted-foreground">{tarefa.duration_minutes} min</td>
      <td className="tabular px-4 py-2.5 text-xs text-muted-foreground">{fmtDiaHora(tarefa.original_start)}</td>
      <td className="tabular px-4 py-2.5 text-xs">
        {tarefa.scheduled_start ? fmtDiaHora(tarefa.scheduled_start) : "—"}
      </td>
      <td className="px-4 py-2.5">
        <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", spec.className)}>
          <Icon className="h-3.5 w-3.5" aria-hidden />
          {spec.label}
        </span>
      </td>
      <td className="px-4 py-2.5 text-xs text-muted-foreground">{tarefa.reason}</td>
    </tr>
  )
}

export default function Cenario() {
  const inicial = useOperacaoDemo()
  const simulacao = useSimularOperacao()

  const [dias, setDias] = useState(2)
  const [turbinas, setTurbinas] = useState(6)
  const [equipes, setEquipes] = useState(2)
  const [bateriaMwh, setBateriaMwh] = useState(12)
  const [bateriaMw, setBateriaMw] = useState(3)

  // O cenário padrão do servidor define a posição inicial dos controles. É um
  // ajuste de estado em render (padrão do React para derivar de dado que
  // acabou de chegar), e não um efeito — roda uma vez só, sem render em cascata.
  const config = inicial.data?.config
  const [sincronizado, setSincronizado] = useState(false)
  if (config && !sincronizado) {
    setSincronizado(true)
    setDias(config.days)
    setTurbinas(config.turbines)
    setEquipes(config.teams)
    setBateriaMwh(config.battery_mwh)
    setBateriaMw(config.battery_mw)
  }

  const dados: OperationDemo | undefined = simulacao.data ?? inicial.data
  const erro = simulacao.error ?? inicial.error
  const carregando = inicial.isLoading || simulacao.isPending

  const timeline = useMemo(() => dados?.timeline ?? [], [dados])
  const resumo = dados?.summary

  const fluxoBateria = useMemo(
    () =>
      timeline.map((ponto) => ({
        ts: ponto.ts,
        carga: Number(ponto.battery_charge_mw || 0),
        descarga: -Number(ponto.battery_discharge_mw || 0),
      })),
    [timeline],
  )

  const porTurbina = useMemo(() => {
    if (!dados) return []
    const mapa = new Map<string, { turbine_id: string; nominal_kw: number; amostras: number; parada: number; energia_kwh: number }>()
    for (const turbina of dados.turbines) {
      mapa.set(turbina.turbine_id, { ...turbina, amostras: 0, parada: 0, energia_kwh: 0 })
    }
    for (const amostra of dados.scada) {
      const atual = mapa.get(amostra.turbine_id)
      if (!atual) continue
      atual.amostras += 1
      atual.energia_kwh += Number(amostra.potencia_kw || 0)
      if (Number(amostra.potencia_kw || 0) <= 0) atual.parada += 1
    }
    return [...mapa.values()]
  }, [dados])

  const alertasPorTurbina = useMemo(() => {
    const mapa = new Map<string, number>()
    for (const alerta of dados?.alerts ?? []) {
      mapa.set(alerta.turbine_id, (mapa.get(alerta.turbine_id) ?? 0) + 1)
    }
    return mapa
  }, [dados])

  const tarefasSemJanela = dados?.tasks.filter((tarefa) => !tarefa.scheduled_start) ?? []

  const rodar = () => {
    simulacao.mutate({
      days: dias,
      turbines: turbinas,
      teams: equipes,
      battery_mwh: bateriaMwh,
      battery_mw: bateriaMw,
    })
  }

  return (
    <>
        <PageHeader
          eyebrow="Operação"
          title="Manutenção e bateria sob restrição de exportação"
          description="Quando a rede limita o escoamento, parar uma turbina para manutenção pode custar nada — e o excedente que seria cortado pode ir para a bateria. Este cenário quantifica as duas coisas juntas."
        />

        <SimulationNotice>
          <span className="font-medium text-foreground">Cenário sintético.</span> Todos os números desta tela vêm de um
          gerador determinístico de SCADA — nenhum dado real de equipamento, nenhuma apuração regulatória e nenhum comando
          é enviado a qualquer ativo. Serve para demonstrar a mecânica de decisão, não para embasar pleito.
        </SimulationNotice>

        {erro && <ErrorState error={erro} />}

        {/* ---- controles do cenário ---------------------------------------- */}
        <section className="panel p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="panel-title">Parâmetros do cenário</h2>
              {dados && (
                <p className="mt-0.5 font-mono text-[0.6875rem] text-muted-foreground">
                  {dados.scenario_id} · seed {dados.config.seed} · {dados.method}
                </p>
              )}
            </div>
            <Button size="sm" className="h-8 gap-1.5" onClick={rodar} disabled={carregando}>
              <Play className="h-3.5 w-3.5" />
              {simulacao.isPending ? "Simulando…" : "Rodar cenário"}
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-5">
            {[
              { id: "dias", label: "Dias simulados", value: dias, set: setDias, min: 1, max: 7, step: 1, unidade: "d" },
              { id: "turbinas", label: "Turbinas", value: turbinas, set: setTurbinas, min: 1, max: 20, step: 1, unidade: "" },
              { id: "equipes", label: "Equipes de manutenção", value: equipes, set: setEquipes, min: 1, max: 6, step: 1, unidade: "" },
              { id: "bateriaMwh", label: "Capacidade da bateria", value: bateriaMwh, set: setBateriaMwh, min: 2, max: 60, step: 2, unidade: "MWh" },
              { id: "bateriaMw", label: "Potência da bateria", value: bateriaMw, set: setBateriaMw, min: 1, max: 20, step: 1, unidade: "MW" },
            ].map((controle) => (
              <div key={controle.id} className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <Label htmlFor={controle.id} className="text-xs">
                    {controle.label}
                  </Label>
                  <span className="tabular text-sm font-semibold">
                    {controle.value} {controle.unidade}
                  </span>
                </div>
                <Slider
                  id={controle.id}
                  min={controle.min}
                  max={controle.max}
                  step={controle.step}
                  value={[controle.value]}
                  onValueChange={([valor]) => controle.set(valor)}
                />
              </div>
            ))}
          </div>
        </section>

        {/* ---- resultado ---------------------------------------------------- */}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatTile
            label="Energia recuperada pela bateria"
            value={resumo ? fmtMWh(resumo.recovered_mwh) : "—"}
            accent="recoverable"
            size="lg"
            isLoading={carregando && !resumo}
            sub={resumo ? `${fmtMWh(resumo.battery_export_mwh)} exportados via bateria` : undefined}
          />
          <StatTile
            label="Valor líquido da bateria"
            value={resumo ? fmtBRLCompacto(resumo.battery_net_value_brl) : "—"}
            accent="recoverable"
            size="lg"
            isLoading={carregando && !resumo}
            sub="Já descontada a degradação; sem CAPEX — não é VPL nem payback."
          />
          <StatTile
            label="Economia na manutenção"
            value={resumo ? fmtBRLCompacto(resumo.maintenance_saving_brl) : "—"}
            accent="recoverable"
            size="lg"
            isLoading={carregando && !resumo}
            sub="Ganho de parar turbina na hora em que a geração seria cortada de qualquer jeito."
          />
          <StatTile
            label="Tarefas sem janela"
            value={resumo ? fmtInt(resumo.unallocated_tasks) : "—"}
            accent={resumo && resumo.unallocated_tasks > 0 ? "loss" : "neutral"}
            size="lg"
            isLoading={carregando && !resumo}
            sub={resumo ? `de ${fmtInt(dados?.tasks.length ?? 0)} tarefas no período` : undefined}
          />
        </div>

        {/* ---- potência ao longo do tempo ----------------------------------- */}
        <ChartPanel
          title="Geração, limite de exportação e corte"
          description="Todas as séries em MW, na mesma escala. A área entre o disponível e o exportado é o que a rede não deixou escoar."
          legend={<ChartLegend config={potenciaConfig} />}
          empty={
            carregando && !timeline.length ? (
              <Skeleton className="h-64 w-full" />
            ) : !timeline.length ? (
              <ChartEmpty title="Rode um cenário para ver a linha do tempo" />
            ) : undefined
          }
        >
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={timeline} margin={{ top: 4, right: 12, bottom: 0, left: 4 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="ts" {...axisProps} tickFormatter={fmtDiaHora} minTickGap={64} />
              <YAxis {...axisProps} width={52} tickFormatter={(v: number) => `${fmtNum(v)}`} />
              <Tooltip
                cursor={{ stroke: "var(--axis)", strokeWidth: 1 }}
                content={
                  <ChartTooltip
                    config={potenciaConfig}
                    labelFormatter={(label) => fmtDiaHora(String(label))}
                    footer={(row) => `Vento ${fmtNum(Number(row.wind_ms ?? 0))} m/s · PLD ${fmtBRL(Number(row.price_brl_mwh ?? 0))}/MWh`}
                  />
                }
              />
              <Line type="monotone" dataKey="available_mw" stroke="var(--chart-6)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
              <Line type="stepAfter" dataKey="export_limit_mw" stroke="var(--loss)" strokeWidth={1.5} strokeDasharray="6 3" dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="scheduled_mw" stroke="var(--chart-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="export_with_battery_mw" stroke="var(--recoverable)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="curtailed_mw" stroke="var(--chart-2)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>

        {/* ---- bateria ------------------------------------------------------ */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <ChartPanel
            title="Estado de carga da bateria"
            description="Energia armazenada ao longo do cenário, em MWh."
            empty={!timeline.length ? <ChartEmpty title="Sem dados de bateria" /> : undefined}
          >
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={timeline} margin={{ top: 4, right: 12, bottom: 0, left: 4 }}>
                <defs>
                  <linearGradient id="gradSoc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--recoverable)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--recoverable)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="ts" {...axisProps} tickFormatter={fmtDiaHora} minTickGap={64} />
                <YAxis {...axisProps} width={46} />
                <Tooltip
                  cursor={{ stroke: "var(--axis)", strokeWidth: 1 }}
                  content={<ChartTooltip config={socConfig} labelFormatter={(label) => fmtDiaHora(String(label))} />}
                />
                <Area type="monotone" dataKey="soc_mwh" stroke="var(--recoverable)" strokeWidth={2} fill="url(#gradSoc)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartPanel>

          <ChartPanel
            title="Carga e descarga"
            description="Potência movimentada pela bateria, em MW. Nunca as duas ao mesmo tempo."
            legend={<ChartLegend config={fluxoConfig} />}
            empty={!timeline.length ? <ChartEmpty title="Sem dados de bateria" /> : undefined}
          >
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={fluxoBateria} margin={{ top: 4, right: 12, bottom: 0, left: 4 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="ts" {...axisProps} tickFormatter={fmtDiaHora} minTickGap={64} />
                <YAxis {...axisProps} width={46} tickFormatter={(v: number) => String(Math.abs(v))} />
                <ReferenceLine y={0} stroke="var(--axis)" />
                <Tooltip
                  cursor={{ stroke: "var(--axis)", strokeWidth: 1 }}
                  content={<ChartTooltip config={fluxoConfig} labelFormatter={(label) => fmtDiaHora(String(label))} />}
                />
                <Area
                  type="stepAfter"
                  dataKey="carga"
                  stroke="var(--chart-1)"
                  strokeWidth={1.5}
                  fill="var(--chart-1)"
                  fillOpacity={0.25}
                  isAnimationActive={false}
                />
                <Area
                  type="stepAfter"
                  dataKey="descarga"
                  stroke="var(--recoverable)"
                  strokeWidth={1.5}
                  fill="var(--recoverable)"
                  fillOpacity={0.25}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartPanel>
        </div>

        {/* ---- turbinas ------------------------------------------------------ */}
        {porTurbina.length > 0 && (
          <section className="panel overflow-hidden">
            <header className="border-b border-border p-4">
              <h2 className="panel-title">Turbinas no cenário</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Agregado das amostras SCADA de 10 em 10 minutos ({fmtInt(dados?.scada.length ?? 0)} amostras no total).
              </p>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Turbina</th>
                    <th className="px-4 py-2.5 text-right font-medium">Nominal</th>
                    <th className="px-4 py-2.5 text-right font-medium">Amostras</th>
                    <th className="px-4 py-2.5 text-right font-medium">Intervalos parada</th>
                    <th className="px-4 py-2.5 text-right font-medium">Potência média</th>
                    <th className="px-4 py-2.5 text-right font-medium">Alertas</th>
                  </tr>
                </thead>
                <tbody>
                  {porTurbina.map((turbina) => {
                    const alertas = alertasPorTurbina.get(turbina.turbine_id) ?? 0
                    return (
                      <tr key={turbina.turbine_id} className="border-b border-border/60 last:border-0 hover:bg-accent/40">
                        <td className="px-4 py-2.5 text-xs font-medium">{turbina.turbine_id}</td>
                        <td className="tabular px-4 py-2.5 text-right text-xs text-muted-foreground">
                          {fmtNum(turbina.nominal_kw / 1000)} MW
                        </td>
                        <td className="tabular px-4 py-2.5 text-right text-xs text-muted-foreground">
                          {fmtInt(turbina.amostras)}
                        </td>
                        <td className="tabular px-4 py-2.5 text-right text-xs">{fmtInt(turbina.parada)}</td>
                        <td className="tabular px-4 py-2.5 text-right text-xs">
                          {turbina.amostras ? `${fmtNum(turbina.energia_kwh / turbina.amostras / 1000)} MW` : "—"}
                        </td>
                        <td className="tabular px-4 py-2.5 text-right text-xs">
                          {alertas > 0 ? (
                            <span className="inline-flex items-center gap-1 font-medium text-warning">
                              <AlertTriangle className="h-3 w-3" aria-hidden />
                              {alertas}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ---- manutenção ---------------------------------------------------- */}
        {dados && dados.tasks.length > 0 && (
          <section className="panel overflow-hidden">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
              <div>
                <h2 className="flex items-center gap-2 panel-title">
                  <Wrench className="h-4 w-4 text-muted-foreground" />
                  Agenda de manutenção
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  O agendador desloca a parada para a janela de menor custo de oportunidade, respeitando equipes, vento
                  máximo e o teto de exportação.
                </p>
              </div>
              <span className="text-xs text-muted-foreground">
                {tarefasSemJanela.length > 0
                  ? `${fmtInt(tarefasSemJanela.length)} tarefa(s) sem janela viável`
                  : "Todas as tarefas couberam na janela do cenário"}
              </span>
            </header>
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Tarefa</th>
                    <th className="px-4 py-2.5 font-medium">Turbina</th>
                    <th className="px-4 py-2.5 text-right font-medium">Duração</th>
                    <th className="px-4 py-2.5 font-medium">Previsto</th>
                    <th className="px-4 py-2.5 font-medium">Agendado</th>
                    <th className="px-4 py-2.5 font-medium">Situação</th>
                    <th className="px-4 py-2.5 font-medium">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.tasks.map((tarefa) => (
                    <TaskRow key={tarefa.task_id} tarefa={tarefa} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ---- alertas e premissas -------------------------------------------- */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {dados && dados.alerts.length > 0 && (
            <section className="panel p-4">
              <h2 className="panel-title mb-3">Alertas do período</h2>
              <ul className="max-h-72 space-y-2 overflow-auto">
                {dados.alerts.map((alerta, indice) => {
                  const nivel = severidadeAlerta[alerta.severity.toLowerCase()] ?? severidadeAlerta.info
                  const IconeAlerta = nivel.Icon
                  return (
                    <li key={`${alerta.turbine_id}-${alerta.ts}-${indice}`} className="flex items-start gap-2.5 text-xs">
                      <IconeAlerta className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", nivel.className)} aria-hidden />
                      <div>
                        <p className="text-foreground">{alerta.message}</p>
                        <p className="tabular mt-0.5 text-[0.6875rem] text-muted-foreground">
                          {alerta.turbine_id} · {fmtDiaHora(alerta.ts)} · {alerta.severity}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {dados && dados.assumptions.length > 0 && (
            <section className="panel p-4">
              <h2 className="panel-title mb-3">Premissas do modelo</h2>
              <ul className="space-y-1.5">
                {dados.assumptions.map((premissa) => (
                  <li key={premissa} className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
                    {premissa}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
    </>
  )
}
