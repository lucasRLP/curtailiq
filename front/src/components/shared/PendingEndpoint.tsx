import type { ReactNode } from "react"
import { PlugZap } from "lucide-react"
import { ErrorState } from "@/components/shared/ErrorState"
import { endpointIndisponivel } from "@/api/client"

/**
 * Estado de "tela pronta, rota ainda não publicada".
 *
 * As telas de Operação foram escritas contra o contrato antes de o backend
 * subir as rotas. Sem isto, cada uma apareceria como erro vermelho — o que faz
 * a pessoa achar que o front quebrou e o time perder tempo investigando. Aqui a
 * tela declara o que vai desenhar e qual rota está esperando; quando a rota
 * existir, o conteúdo real aparece sozinho.
 */
interface PendingEndpointProps {
  /** Rota esperada, como está em docs/CONTRATO_FRONT_OPERACAO.md. */
  rota: string
  titulo: string
  /** O que esta tela passa a mostrar quando a rota existir. */
  descricao: ReactNode
  /** Itens que a tela vai renderizar, para o backend saber o que priorizar. */
  consome?: string[]
}

export function PendingEndpoint({ rota, titulo, descricao, consome }: PendingEndpointProps) {
  return (
    <div className="panel flex flex-col items-center px-6 py-10 text-center">
      <span className="rounded-full border border-border bg-muted p-3">
        <PlugZap className="h-5 w-5 text-muted-foreground" aria-hidden />
      </span>

      <h3 className="mt-4 text-sm font-semibold text-foreground">{titulo}</h3>
      <p className="mt-1.5 max-w-xl text-xs leading-relaxed text-muted-foreground">{descricao}</p>

      <code className="mt-4 rounded-md border border-border bg-muted px-2.5 py-1.5 font-mono text-[0.6875rem] text-muted-foreground">
        {rota}
      </code>

      {consome && consome.length > 0 && (
        <div className="mt-5 w-full max-w-xl text-left">
          <p className="eyebrow mb-2">Esta tela renderiza</p>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {consome.map((item) => (
              <li
                key={item}
                className="rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-[0.6875rem] leading-relaxed text-muted-foreground"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-5 text-[0.6875rem] text-muted-foreground/70">
        Contrato completo em <span className="font-mono">docs/CONTRATO_FRONT_OPERACAO.md</span>
      </p>
    </div>
  )
}

/**
 * Decide entre "rota ainda não existe" e "a rota existe e falhou".
 * Um 500 continua sendo erro de verdade e precisa aparecer como tal.
 */
export function EstadoDeFalha({ error, ...props }: PendingEndpointProps & { error: unknown }) {
  if (endpointIndisponivel(error)) return <PendingEndpoint {...props} />
  return <ErrorState error={error} />
}
