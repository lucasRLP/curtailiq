import { AlertTriangle, XCircle } from "lucide-react"
import { QUALIDADE_LABELS } from "@/lib/constants"
import { fmtInt } from "@/lib/formatters"
import type { QualidadeDados } from "@/types/financeiro"

/**
 * Aviso de qualidade do dado. Quando falta PLD em parte dos intervalos, a perda
 * financeira sai subestimada — o gestor precisa saber disso antes de usar o
 * número em decisão ou em pleito.
 */
export function DataQualityBanner({ qualidade }: { qualidade: QualidadeDados }) {
  if (qualidade.status === "completo") return null

  const grave = qualidade.status === "sem_pld"
  const Icon = grave ? XCircle : AlertTriangle
  const faltantes = qualidade.pld_faltante_intervalos ?? qualidade.pld_faltante_eventos
  const total = qualidade.total_intervalos_restricao ?? qualidade.total_eventos

  return (
    <div
      role="status"
      className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 ${
        grave ? "border-critical/40 bg-critical/[0.07]" : "border-warning/35 bg-warning/[0.07]"
      }`}
    >
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${grave ? "text-critical" : "text-warning"}`} aria-hidden />
      <p className="text-xs leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">{QUALIDADE_LABELS[qualidade.status]}</span> — {fmtInt(faltantes)} de{" "}
        {fmtInt(total)} intervalos de restrição estão sem PLD. A perda financeira do período está subestimada.
      </p>
    </div>
  )
}
