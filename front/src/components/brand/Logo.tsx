import { cn } from "@/lib/utils"

/**
 * Marca CurtailIQ desenhada em vetor.
 *
 * O PNG original é azul-marinho sobre transparente e fica ilegível no tema
 * escuro (que é o padrão do produto). Aqui o anel "C" usa `currentColor` e o
 * "i"/"IQ" usam o teal da marca, então o lockup se adapta a qualquer superfície.
 */

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={cn("h-7 w-7", className)} aria-hidden="true">
      <path
        d="M31.2 10.9A16 16 0 1 0 31.2 37.1"
        stroke="currentColor"
        strokeWidth={7}
        strokeLinecap="round"
      />
      <circle cx={40} cy={13.6} r={3.4} className="fill-primary" />
      <rect x={36.6} y={20.2} width={6.8} height={21} rx={3.4} className="fill-primary" />
    </svg>
  )
}

interface LogoProps {
  className?: string
  /** Mostra a assinatura "Inteligência de curtailment" abaixo do nome. */
  withTagline?: boolean
  /** Só o símbolo, sem o nome — para barras estreitas. */
  markOnly?: boolean
}

export function Logo({ className, withTagline = false, markOnly = false }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 text-foreground", className)}>
      <LogoMark className="h-7 w-7 shrink-0" />
      {!markOnly && (
        <span className="flex flex-col leading-none">
          <span className="font-heading text-[1.0625rem] font-bold tracking-tight">
            Curtail<span className="text-primary">IQ</span>
          </span>
          {withTagline && (
            <span className="mt-1 text-[0.5625rem] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Inteligência de curtailment
            </span>
          )}
        </span>
      )}
    </span>
  )
}
