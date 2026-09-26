/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from "react"
import { Activity, CircleDot, FlaskConical, TriangleAlert } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/**
 * Procedência do dado.
 *
 * Regra do contrato de front (front.md §1.5): histórico realizado e projeção
 * nunca podem aparecer com a mesma cara. Um gestor que confunde "perdi" com
 * "posso perder" toma decisão errada de investimento — então o selo é
 * obrigatório em qualquer número previsto ou simulado.
 */

type Kind = "historico" | "previsao" | "simulado"

const kindSpec: Record<Kind, { label: string; icon: typeof Activity; className: string; hint: string }> = {
  historico: {
    label: "Histórico medido",
    icon: CircleDot,
    className: "border-historic/35 bg-historic/10 text-historic",
    hint: "Dado realizado, apurado a partir das medições do período selecionado.",
  },
  previsao: {
    label: "Projeção",
    icon: Activity,
    className: "border-forecast/35 bg-forecast/10 text-forecast",
    hint: "Valor estimado para o futuro. Não é dado apurado e não serve como base de pleito.",
  },
  simulado: {
    label: "Simulado",
    icon: FlaskConical,
    className: "border-warning/40 bg-warning/10 text-warning",
    hint: "Cenário sintético gerado para demonstração. Nenhum dado real de equipamento.",
  },
}

export const METODO_LABELS: Record<string, string> = {
  ml_advanced: "ML avançado",
  ml_base_random_forest: "ML · Random Forest",
  fallback_sazonal: "Fallback sazonal",
}

const METODO_HINTS: Record<string, string> = {
  ml_advanced: "Modelo de ML completo, com variáveis climáticas e de programação.",
  ml_base_random_forest: "Modelo base Random Forest treinado no histórico da usina.",
  fallback_sazonal: "Modelo indisponível: projeção feita pela sazonalidade do histórico. Confiança menor.",
}

/**
 * O backend evolui os métodos mais rápido que o mapa acima (aparecem nomes como
 * `media_movel_7_30d_com_zeros_guardrail`). Em vez de estampar o identificador
 * cru no meio do layout, mostramos uma versão legível e guardamos o valor exato
 * no tooltip — quem audita precisa do identificador, quem lê o painel não.
 */
function rotularMetodo(metodo: string) {
  if (METODO_LABELS[metodo]) return METODO_LABELS[metodo]
  const legivel = metodo.replace(/_/g, " ").trim()
  return legivel.charAt(0).toUpperCase() + legivel.slice(1)
}

function Pill({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium leading-tight",
        className,
      )}
    >
      {children}
    </span>
  )
}

export function DataKindBadge({ kind, className }: { kind: Kind; className?: string }) {
  const spec = kindSpec[kind]
  const Icon = spec.icon
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Pill className={cn(spec.className, "cursor-default", className)}>
          <Icon className="h-3 w-3" aria-hidden />
          {spec.label}
        </Pill>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{spec.hint}</TooltipContent>
    </Tooltip>
  )
}

/** Selo do método da previsão, exigido pelo contrato de front. */
export function MetodoBadge({ metodo, className }: { metodo?: string | null; className?: string }) {
  if (!metodo) return null
  const isFallback = metodo === "fallback_sazonal"

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Pill
          className={cn(
            "max-w-56 cursor-default",
            isFallback
              ? "border-warning/40 bg-warning/10 text-warning"
              : "border-border bg-muted text-muted-foreground",
            className,
          )}
        >
          {isFallback && <TriangleAlert className="h-3 w-3 shrink-0" aria-hidden />}
          <span className="truncate">{rotularMetodo(metodo)}</span>
        </Pill>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p>{METODO_HINTS[metodo] ?? "Método usado para gerar a projeção."}</p>
        <p className="mt-1 font-mono text-[0.6875rem] opacity-70">{metodo}</p>
      </TooltipContent>
    </Tooltip>
  )
}

/** Faixa de aviso para telas inteiras construídas sobre dado sintético. */
export function SimulationNotice({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-warning/35 bg-warning/[0.07] px-3.5 py-2.5">
      <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
      <p className="text-xs leading-relaxed text-muted-foreground">{children}</p>
    </div>
  )
}
