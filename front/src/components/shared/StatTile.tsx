import type { ReactNode } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

/**
 * Bloco de número. É a unidade de leitura da tela da usina: o dono do ativo
 * varre a faixa de tiles antes de olhar qualquer gráfico.
 *
 * `accent` é semântico, não decorativo — cada valor carrega um significado fixo
 * no produto inteiro (perda é sempre vermelha, ressarcível é sempre teal,
 * previsão é sempre violeta). Nunca escolher por gosto.
 */

export type StatAccent = "loss" | "recoverable" | "forecast" | "energy" | "neutral"

const accentValue: Record<StatAccent, string> = {
  loss: "text-loss",
  recoverable: "text-recoverable",
  forecast: "text-forecast",
  energy: "text-energy",
  neutral: "text-foreground",
}

const accentBar: Record<StatAccent, string> = {
  loss: "bg-loss",
  recoverable: "bg-recoverable",
  forecast: "bg-forecast",
  energy: "bg-energy",
  neutral: "bg-border",
}

interface StatTileProps {
  label: string
  value: string
  sub?: ReactNode
  accent?: StatAccent
  icon?: ReactNode
  /** Rodapé de ação: link para a tela que resolve aquele número. */
  action?: ReactNode
  isLoading?: boolean
  className?: string
  size?: "md" | "lg"
}

export function StatTile({
  label,
  value,
  sub,
  accent = "neutral",
  icon,
  action,
  isLoading,
  className,
  size = "md",
}: StatTileProps) {
  return (
    <div className={cn("panel relative flex flex-col overflow-hidden p-4", className)}>
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-[3px]", accentBar[accent])} />
      <div className="flex items-center justify-between gap-2">
        <p className="eyebrow truncate">{label}</p>
        {icon && <span className="shrink-0 text-muted-foreground">{icon}</span>}
      </div>

      {isLoading ? (
        <div className="mt-2 space-y-2">
          <Skeleton className={size === "lg" ? "h-9 w-40" : "h-7 w-28"} />
          <Skeleton className="h-3 w-24" />
        </div>
      ) : (
        <>
          <p
            className={cn(
              "tabular mt-1.5 font-bold leading-none tracking-tight",
              size === "lg" ? "text-3xl md:text-4xl" : "text-2xl",
              accentValue[accent],
            )}
          >
            {value}
          </p>
          {sub && <div className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{sub}</div>}
        </>
      )}

      {action && <div className="mt-auto pt-3">{action}</div>}
    </div>
  )
}
