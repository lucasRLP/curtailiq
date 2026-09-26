import { useMemo, useState } from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { AlertTriangle, TriangleAlert } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/shared/PageHeader"
import { StatTile } from "@/components/shared/StatTile"
import { ErrorState } from "@/components/shared/ErrorState"
import { DataKindBadge, MetodoBadge } from "@/components/shared/Provenance"
import { ChartEmpty, ChartPanel, ChartTooltip, axisProps, gridProps, type SeriesConfig } from "@/components/charts/chart-kit"
import { usePlantContext } from "@/components/shell/PlantShell"
import { JanelasRecomendadas } from "@/pages/Risco/JanelasRecomendadas"
import { usePrevisaoDetalhada } from "@/hooks/useUsinas"
import { fmtDiaHora, fmtInt, fmtMWh, fmtNum } from "@/lib/formatters"
import { cn } from "@/lib/utils"

/** Acima disso o backend já classifica o intervalo como alerta. */
const LIMIAR_ALERTA = 0.7

const config: SeriesConfig = {
  prob_pct: { label: "Probabilidade de corte", color: "var(--forecast)", dashed: true, format: (v) => `${fmtNum(v)}%` },
}

const HORIZONTES = [24, 48, 72, 168]

export default function Risco() {
  const { id, usina } = usePlantContext()
  const [horizonte, setHorizonte] = useState(72)
  const { data, isLoading, error } = usePrevisaoDetalhada(id, horizonte)

  const serie = useMemo(
    () =>
      (data?.previsoes ?? []).map((item) => ({
        timestamp: item.timestamp,
        prob_pct: Number(item.prob_corte ?? 0) * 100,
        magnitude_estimada_mwh: Number(item.magnitude_estimada_mwh ?? 0),
      })),
    [data],
  )

  const alertas = useMemo(() => data?.alertas ?? [], [data])
  const energiaEmRisco = useMemo(
    () => alertas.reduce((acc, item) => acc + Number(item.magnitude_estimada_mwh ?? 0), 0),
    [alertas],
  )
  const probMaxima = useMemo(() => Math.max(0, ...serie.map((p) => p.prob_pct)), [serie])
  const primeiroAlerta = alertas[0]

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Risco de corte"
        title="Quando a usina deve ser cortada"
        description={
          usina
            ? `Probabilidade de restrição hora a hora para ${usina.nome}, com os intervalos que o modelo classifica como alerta. É a entrada do agendador de manutenção.`
            : "Probabilidade de restrição hora a hora, com os intervalos classificados como alerta."
        }
        meta={
          data && (
            <>
              <DataKindBadge kind="previsao" />
              <MetodoBadge metodo={data.modelo} />
            </>
          )
        }
        actions={
          <div className="flex items-center rounded-md border border-border p-0.5" role="group" aria-label="Horizonte">
            {HORIZONTES.map((valor) => (
              <button
                key={valor}
                type="button"
                onClick={() => setHorizonte(valor)}
                aria-pressed={horizonte === valor}
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                  horizonte === valor ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {valor} h
              </button>
            ))}
          </div>
        }
      />

      {error && <ErrorState error={error} />}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Intervalos em alerta"
          value={data ? fmtInt(alertas.length) : "—"}
          accent={alertas.length > 0 ? "loss" : "neutral"}
          size="lg"
          isLoading={isLoading}
          sub={`de ${fmtInt(serie.length)} intervalos no horizonte de ${horizonte} h`}
        />
        <StatTile
          label="Energia em risco nos alertas"
          value={data ? fmtMWh(energiaEmRisco) : "—"}
          accent="forecast"
          size="lg"
          isLoading={isLoading}
          sub="Magnitude estimada somada nos intervalos acima do limiar."
        />
        <StatTile
          label="Probabilidade máxima"
          value={data ? `${fmtNum(probMaxima)}%` : "—"}
          accent="forecast"
          size="lg"
          isLoading={isLoading}
        />
        <StatTile
          label="Próximo alerta"
          value={primeiroAlerta ? fmtDiaHora(primeiroAlerta.timestamp) : "—"}
          accent="neutral"
          size="lg"
          isLoading={isLoading}
          sub={
            primeiroAlerta
              ? `${fmtNum(Number(primeiroAlerta.prob_corte) * 100)}% de probabilidade`
              : "Nenhum intervalo acima do limiar no horizonte."
          }
        />
      </div>

      <ChartPanel
        title="Probabilidade de corte no horizonte"
        description={`A faixa acima de ${LIMIAR_ALERTA * 100}% é o que o modelo trata como alerta — e o que o agendador de manutenção procura.`}
        empty={
          isLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : serie.length === 0 ? (
            <ChartEmpty title="Sem previsão disponível para este horizonte" />
          ) : undefined
        }
      >
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={serie} margin={{ top: 4, right: 12, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="gradRisco" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--forecast)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--forecast)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="timestamp" {...axisProps} tickFormatter={fmtDiaHora} minTickGap={56} />
            <YAxis {...axisProps} width={44} domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
            <Tooltip
              cursor={{ stroke: "var(--axis)", strokeWidth: 1 }}
              content={
                <ChartTooltip
                  config={config}
                  labelFormatter={(label) => fmtDiaHora(String(label))}
                  footer={(row) => `${fmtMWh(Number(row.magnitude_estimada_mwh ?? 0))} de magnitude estimada`}
                />
              }
            />
            <ReferenceLine
              y={LIMIAR_ALERTA * 100}
              stroke="var(--loss)"
              strokeDasharray="4 4"
              label={{ value: "limiar de alerta", position: "insideTopRight", fill: "var(--loss)", fontSize: 10 }}
            />
            <Area
              type="monotone"
              dataKey="prob_pct"
              stroke="var(--forecast)"
              strokeWidth={2}
              strokeDasharray="5 4"
              fill="url(#gradRisco)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartPanel>

      <JanelasRecomendadas previsoes={data?.previsoes ?? []} limiar={LIMIAR_ALERTA} horizonte={horizonte} />

      <section className="panel overflow-hidden">
        <header className="border-b border-border p-4">
          <h2 className="flex items-center gap-2 panel-title">
            <TriangleAlert className="h-4 w-4 text-muted-foreground" />
            Intervalos em alerta
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Previsão, não apuração: serve para planejar operação e manutenção, nunca como base de pleito.
          </p>
        </header>

        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : alertas.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <AlertTriangle className="h-5 w-5 text-muted-foreground/50" aria-hidden />
            <p className="mt-3 text-sm font-medium text-muted-foreground">
              Nenhum intervalo acima do limiar no horizonte de {horizonte} h
            </p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Aumente o horizonte para alcançar janelas mais distantes.
            </p>
          </div>
        ) : (
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Início do intervalo</th>
                  <th className="px-4 py-2.5 text-right font-medium">Probabilidade</th>
                  <th className="px-4 py-2.5 text-right font-medium">Magnitude estimada</th>
                </tr>
              </thead>
              <tbody>
                {alertas.map((alerta) => (
                  <tr key={alerta.timestamp} className="border-b border-border/60 last:border-0 hover:bg-accent/40">
                    <td className="tabular px-4 py-2.5 text-xs">{fmtDiaHora(alerta.timestamp)}</td>
                    <td className="tabular px-4 py-2.5 text-right text-xs font-semibold text-forecast">
                      {fmtNum(Number(alerta.prob_corte) * 100)}%
                    </td>
                    <td className="tabular px-4 py-2.5 text-right text-xs">
                      {fmtMWh(Number(alerta.magnitude_estimada_mwh ?? 0))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {data?.resumo?.metodo && (
        <p className="text-[0.6875rem] text-muted-foreground">
          Método do resumo: <span className="font-mono">{String(data.resumo.metodo)}</span>
          {data.knn_insights && Object.keys(data.knn_insights).length > 0 && " · com insights de vizinhos (kNN)"}
        </p>
      )}
    </div>
  )
}
