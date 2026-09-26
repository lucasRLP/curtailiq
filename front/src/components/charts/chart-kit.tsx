/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/* ============================================================================
   Kit de gráficos do CurtailIQ.

   Tudo aqui pinta com `var(--token)` em vez de hex fixo: o SVG do Recharts vive
   no mesmo cascade da página, então a troca de tema repinta os gráficos sozinha,
   sem re-render em JS.

   Regras que este kit impõe (e que os gráficos antigos quebravam):
   - uma escala por gráfico, nunca dois eixos Y;
   - identidade nunca só por cor — sempre legenda, e rótulo direto até 4 séries;
   - histórico é linha cheia, previsão é tracejada, com divisor no "agora";
   - grade e eixos recessivos; marcas finas.
   ========================================================================= */

export interface SeriesSpec {
  label: string
  /** Token de cor, ex.: "var(--loss)". */
  color: string
  /** Previsão/estimativa: desenha tracejado e marca a legenda. */
  dashed?: boolean
  format?: (value: number) => string
}

export type SeriesConfig = Record<string, SeriesSpec>

/* ---- eixos e grade ------------------------------------------------------ */

export const gridProps = {
  stroke: "var(--grid)",
  strokeDasharray: "0",
  vertical: false,
} as const

export const axisProps = {
  stroke: "var(--axis)",
  tick: { fill: "var(--color-muted-foreground)", fontSize: 11 },
  tickLine: false,
  axisLine: false,
  tickMargin: 8,
} as const

/* ---- tooltip ------------------------------------------------------------ */

interface TooltipPayloadItem {
  dataKey?: string | number
  name?: string | number
  value?: number | string
  color?: string
  payload?: Record<string, unknown>
}

interface ChartTooltipProps {
  active?: boolean
  payload?: TooltipPayloadItem[]
  label?: string | number
  config: SeriesConfig
  labelFormatter?: (label: string | number) => string
  /** Linha extra abaixo dos valores (ex.: razão do corte naquele ponto). */
  footer?: (row: Record<string, unknown>) => ReactNode
}

export function ChartTooltip({ active, payload, label, config, labelFormatter, footer }: ChartTooltipProps) {
  if (!active || !payload?.length) return null

  const rows = payload.filter((item) => item.dataKey != null && config[String(item.dataKey)])
  if (!rows.length) return null

  return (
    <div className="pointer-events-none min-w-44 rounded-lg border border-border bg-popover/95 p-2.5 text-popover-foreground shadow-xl backdrop-blur">
      {label != null && (
        <p className="mb-1.5 text-[0.6875rem] font-medium text-muted-foreground">
          {labelFormatter ? labelFormatter(label) : label}
        </p>
      )}
      <div className="space-y-1">
        {rows.map((item) => {
          const key = String(item.dataKey)
          const spec = config[key]
          const value = typeof item.value === "number" ? item.value : Number(item.value ?? 0)
          return (
            <div key={key} className="flex items-center justify-between gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <SeriesSwatch color={spec.color} dashed={spec.dashed} />
                {spec.label}
              </span>
              <span className="tabular font-semibold text-foreground">
                {spec.format ? spec.format(value) : value.toLocaleString("pt-BR")}
              </span>
            </div>
          )
        })}
      </div>
      {footer && payload[0]?.payload && (
        <div className="mt-2 border-t border-border pt-1.5 text-[0.6875rem] text-muted-foreground">
          {footer(payload[0].payload)}
        </div>
      )}
    </div>
  )
}

/* ---- legenda ------------------------------------------------------------ */

export function SeriesSwatch({ color, dashed }: { color: string; dashed?: boolean }) {
  if (dashed) {
    return (
      <span aria-hidden className="inline-flex h-2.5 w-3 items-center">
        <span className="h-0.5 w-full" style={{ backgroundImage: `repeating-linear-gradient(to right, ${color} 0 3px, transparent 3px 6px)` }} />
      </span>
    )
  }
  return <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: color }} />
}

export function ChartLegend({ config, keys, className }: { config: SeriesConfig; keys?: string[]; className?: string }) {
  const entries = (keys ?? Object.keys(config)).map((key) => [key, config[key]] as const).filter(([, spec]) => spec)
  if (entries.length < 2) return null

  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5", className)}>
      {entries.map(([key, spec]) => (
        <li key={key} className="flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
          <SeriesSwatch color={spec.color} dashed={spec.dashed} />
          {spec.label}
        </li>
      ))}
    </ul>
  )
}

/* ---- moldura ------------------------------------------------------------ */

interface ChartPanelProps {
  title: string
  description?: string
  /** Canto superior direito: legenda, alternadores, botões. */
  actions?: ReactNode
  legend?: ReactNode
  children: ReactNode
  className?: string
  /** Estado vazio explícito em vez de um gráfico em branco. */
  empty?: ReactNode
}

export function ChartPanel({ title, description, actions, legend, children, className, empty }: ChartPanelProps) {
  return (
    <section className={cn("panel flex flex-col p-4", className)}>
      <header className="mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="panel-title">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </header>
      {legend && <div className="mb-3">{legend}</div>}
      {empty ?? <div className="min-w-0 flex-1">{children}</div>}
    </section>
  )
}

export function ChartEmpty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex min-h-40 flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border px-4 py-10 text-center">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-xs text-muted-foreground/70">{hint}</p>}
    </div>
  )
}
