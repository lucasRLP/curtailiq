import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * Cabeçalho único de página. Antes cada tela inventava o seu (eyebrow teal,
 * tamanhos de título diferentes, larguras diferentes), o que fazia o app
 * parecer cinco produtos costurados.
 */
interface PageHeaderProps {
  eyebrow?: string
  title: string
  description?: ReactNode
  /** Controles da direita: período, exportar, alternadores. */
  actions?: ReactNode
  /** Linha de selos abaixo do título (procedência, método, qualidade). */
  meta?: ReactNode
  className?: string
}

export function PageHeader({ eyebrow, title, description, actions, meta, className }: PageHeaderProps) {
  return (
    <header className={cn("mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3", className)}>
      <div className="min-w-0 flex-1">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="mt-1 font-heading text-xl font-bold tracking-tight text-foreground md:text-2xl">{title}</h1>
        {description && (
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>
        )}
        {meta && <div className="mt-2.5 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
