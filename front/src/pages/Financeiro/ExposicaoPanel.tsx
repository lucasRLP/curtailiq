import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/shared/ErrorState"
import { DataKindBadge, MetodoBadge } from "@/components/shared/Provenance"
import {
  ChartEmpty,
  ChartPanel,
  ChartTooltip,
  axisProps,
  gridProps,
  type SeriesConfig,
} from "@/components/charts/chart-kit"
import { useExposicao } from "@/hooks/useFinanceiro"
import { fmtBRL, fmtBRLCompacto, fmtDiaHora, fmtMWh } from "@/lib/formatters"
import { cn } from "@/lib/utils"

const config: SeriesConfig = {
  perda_prevista_reais: { label: "Perda projetada", color: "var(--forecast)", dashed: true, format: fmtBRL },
}

/** O endpoint aceita no máximo 168 h; pedir mais devolve 422. */
const HORIZONTES = [
  { horas: 24, label: "24 h" },
  { horas: 48, label: "48 h" },
  { horas: 168, label: "7 dias" },
]

/**
 * Exposição futura — item 4 do contrato de front.
 *
 * A tela financeira respondia só "quanto já perdi". Este painel responde
 * "quanto ainda vou perder se nada mudar", que é o número que justifica
 * investir em bateria ou em mudança de operação. Por isso ele termina num
 * caminho para o simulador, e não num gráfico solto.
 */
export function ExposicaoPanel({ id }: { id: string }) {
  const [horizonte, setHorizonte] = useState(168)
  const { data, isLoading, error } = useExposicao(id, horizonte)

  const serie = useMemo(
    () =>
      (data?.serie_previsao ?? []).map((item) => ({
        timestamp: item.timestamp,
        perda_prevista_reais: Number(item.perda_prevista_reais || 0),
        energia_prevista_mwh: Number(item.energia_prevista_mwh || 0),
      })),
    [data],
  )

  const historico = data?.premissas?.historico_ultimos_30d
  const previsao = data?.premissas?.previsao_futura
  const tudoZero = serie.length > 0 && serie.every((ponto) => ponto.perda_prevista_reais === 0)

  return (
    <ChartPanel
      title="Exposição financeira à frente"
      description="Quanto esta usina ainda deve perder no horizonte selecionado, se nada mudar na operação."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-md border border-border p-0.5" role="group" aria-label="Horizonte">
            {HORIZONTES.map((opcao) => (
              <button
                key={opcao.horas}
                type="button"
                onClick={() => setHorizonte(opcao.horas)}
                aria-pressed={horizonte === opcao.horas}
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                  horizonte === opcao.horas ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {opcao.label}
              </button>
            ))}
          </div>
          <DataKindBadge kind="previsao" />
          <MetodoBadge metodo={previsao?.metodo} />
        </div>
      }
      empty={
        isLoading ? (
          <Skeleton className="h-52 w-full" />
        ) : error ? (
          <ErrorState error={error} />
        ) : serie.length === 0 ? (
          <ChartEmpty
            title="Sem projeção para este horizonte"
            hint="O modelo precisa de histórico recente contíguo para projetar as próximas horas."
          />
        ) : tudoZero ? (
          <ChartEmpty
            title="Modelo projeta exposição zero no horizonte"
            hint="Nenhum corte esperado nas próximas horas. A janela da projeção é ancorada na data de hoje, não no período selecionado acima."
          />
        ) : undefined
      }
    >
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={serie} margin={{ top: 4, right: 12, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="gradExposicao" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--forecast)" stopOpacity={0.32} />
              <stop offset="100%" stopColor="var(--forecast)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="timestamp" {...axisProps} tickFormatter={fmtDiaHora} minTickGap={56} />
          <YAxis {...axisProps} width={62} tickFormatter={(v: number) => fmtBRLCompacto(v)} />
          <Tooltip
            cursor={{ stroke: "var(--axis)", strokeWidth: 1 }}
            content={
              <ChartTooltip
                config={config}
                labelFormatter={(label) => fmtDiaHora(String(label))}
                footer={(row) => `${fmtMWh(Number(row.energia_prevista_mwh ?? 0))} de energia projetada no intervalo`}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="perda_prevista_reais"
            stroke="var(--forecast)"
            strokeWidth={2}
            strokeDasharray="5 4"
            fill="url(#gradExposicao)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>

      {data && (
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4 border-t border-border pt-3">
          <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-4">
            <div>
              <dt className="text-[0.6875rem] text-muted-foreground">Exposição no horizonte</dt>
              <dd className="tabular mt-0.5 text-sm font-semibold text-forecast">
                {fmtBRL(data.exposicao_estimada_reais)}
              </dd>
            </div>
            <div>
              <dt className="text-[0.6875rem] text-muted-foreground">Energia projetada</dt>
              <dd className="tabular mt-0.5 text-sm font-semibold">
                {previsao ? fmtMWh(previsao.energia_total_prevista_mwh) : "—"}
              </dd>
            </div>
            {/* As duas premissas abaixo são histórico, não previsão: é a base que
                calibra o modelo, e mostrá-las evita que a projeção pareça mágica. */}
            <div>
              <dt className="text-[0.6875rem] text-muted-foreground">Base: corte médio por hora</dt>
              <dd className="tabular mt-0.5 text-sm font-semibold text-historic">
                {historico ? fmtMWh(historico.energia_media_restringida_mwh_por_hora) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[0.6875rem] text-muted-foreground">Base: PLD médio 30 d</dt>
              <dd className="tabular mt-0.5 text-sm font-semibold text-historic">
                {historico ? `${fmtBRL(historico.pld_medio_reais_mwh)}/MWh` : "—"}
              </dd>
            </div>
          </dl>

          <Button asChild size="sm" variant="outline" className="h-8 shrink-0 gap-1.5 text-xs">
            <Link to={`/usinas/${id}/bess`}>
              Quanto disso uma bateria evitaria <ArrowRight className="h-3 w-3" />
            </Link>
          </Button>
        </div>
      )}
    </ChartPanel>
  )
}
