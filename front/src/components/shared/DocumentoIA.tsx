import { useState } from "react"
import Markdown from "react-markdown"
import { Check, Copy, Download, FileText, Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { EstadoDeFalha } from "@/components/shared/PendingEndpoint"

/* ============================================================================
   Documento gerado por IA.

   É o padrão que o módulo de ressarcimento já usa e que se provou o jeito certo
   de aplicar IA aqui: o backend calcula os números de forma determinística, e a
   IA **redige o documento que destrava uma decisão** — nunca inventa valor.

   Duas regras que este componente impõe:

   1. **A base numérica fica à vista.** Antes e depois de gerar, o leitor vê
      exatamente quais números alimentaram o texto. Sem isso não há como saber
      se a redação derivou do que foi calculado.
   2. **Revisão humana é obrigatória e dita na tela.** O documento sai editável
      e sempre acompanhado do aviso — nenhum texto gerado vai direto para fora
      da empresa.
   ========================================================================= */

export interface ItemBase {
  label: string
  valor: string
}

interface Props {
  titulo: string
  /** O que o documento resolve, em uma frase. */
  descricao: string
  /** Texto do botão — nomeia o artefato, não a ação genérica. */
  rotuloAcao: string
  /** Os números que serão enviados ao modelo, como aparecem na tela. */
  base: ItemBase[]
  /** Rota esperada, para o estado de "ainda não publicado". */
  rota: string
  /** O que a tela vai renderizar quando a rota existir. */
  consome: string[]
  nomeArquivo: string
  /** Frase de responsabilidade específica deste documento. */
  avisoRevisao: string

  markdown?: string
  modelo?: string | null
  isPending: boolean
  error: unknown
  onGerar: () => void
  disabled?: boolean
}

export function DocumentoIA({
  titulo,
  descricao,
  rotuloAcao,
  base,
  rota,
  consome,
  nomeArquivo,
  avisoRevisao,
  markdown,
  modelo,
  isPending,
  error,
  onGerar,
  disabled,
}: Props) {
  const [editando, setEditando] = useState(false)
  const [rascunho, setRascunho] = useState("")
  const [copiado, setCopiado] = useState(false)

  const texto = rascunho || markdown || ""

  const copiar = () => {
    navigator.clipboard.writeText(texto)
    setCopiado(true)
    window.setTimeout(() => setCopiado(false), 2000)
  }

  const baixar = () => {
    const blob = new Blob([texto], { type: "text/markdown;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = nomeArquivo
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="panel overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 panel-title">
            <Sparkles className="h-4 w-4 text-primary" />
            {titulo}
          </h2>
          <p className="mt-0.5 max-w-3xl text-xs leading-relaxed text-muted-foreground">{descricao}</p>
        </div>
        <Button size="sm" className="h-8 shrink-0 gap-1.5" onClick={onGerar} disabled={isPending || disabled}>
          <FileText className="h-3.5 w-3.5" />
          {isPending ? "Redigindo…" : rotuloAcao}
        </Button>
      </header>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,18rem)_1fr]">
        {/* ---- base numérica ------------------------------------------------ */}
        <div className="border-b border-border bg-muted/20 p-4 lg:border-b-0 lg:border-r">
          <p className="eyebrow mb-2.5">Base do documento</p>
          <dl className="space-y-2">
            {base.map((item) => (
              <div key={item.label} className="flex items-baseline justify-between gap-3">
                <dt className="text-[0.6875rem] leading-tight text-muted-foreground">{item.label}</dt>
                <dd className="tabular shrink-0 text-xs font-semibold">{item.valor}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 border-t border-border pt-2.5 text-[0.625rem] leading-relaxed text-muted-foreground">
            A IA redige sobre estes números. Ela não recalcula nem estima valor novo — se algo aqui estiver errado, o
            texto sai errado junto.
          </p>
        </div>

        {/* ---- documento ---------------------------------------------------- */}
        <div className="p-4">
          {error ? (
            <EstadoDeFalha
              error={error}
              rota={rota}
              titulo="Geração de documento ainda não publicada"
              descricao={descricao}
              consome={consome}
            />
          ) : isPending ? (
            <div className="flex min-h-56 flex-col items-center justify-center text-center">
              <span className="rounded-full border border-primary/30 bg-primary/10 p-3.5">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </span>
              <p className="mt-3.5 text-sm font-medium">Redigindo o documento</p>
              <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
                Os números já estão fechados; o modelo está escrevendo a justificativa em cima deles.
              </p>
            </div>
          ) : texto ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={copiar}>
                  {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiado ? "Copiado" : "Copiar"}
                </Button>
                <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={baixar}>
                  <Download className="h-3.5 w-3.5" />
                  Baixar .md
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => {
                    if (!editando) setRascunho(texto)
                    setEditando((v) => !v)
                  }}
                >
                  {editando ? "Pré-visualizar" : "Editar"}
                </Button>
                {modelo && (
                  <span className="ml-auto font-mono text-[0.625rem] text-muted-foreground">{modelo}</span>
                )}
              </div>

              {editando ? (
                <textarea
                  className="h-96 w-full rounded-md border border-border bg-background p-3 font-mono text-xs leading-relaxed"
                  value={rascunho}
                  onChange={(event) => setRascunho(event.target.value)}
                />
              ) : (
                <ScrollArea className="h-96 rounded-md border border-border bg-background p-4">
                  <div className="markdown">
                    <Markdown>{texto}</Markdown>
                  </div>
                </ScrollArea>
              )}

              <p className="rounded-md border border-warning/35 bg-warning/[0.07] px-3 py-2 text-[0.6875rem] leading-relaxed text-muted-foreground">
                {avisoRevisao}
              </p>
            </div>
          ) : (
            <div className="flex min-h-56 flex-col items-center justify-center text-center">
              <span className="rounded-full border border-border bg-muted p-3.5">
                <FileText className="h-5 w-5 text-muted-foreground" />
              </span>
              <p className="mt-3.5 text-sm font-medium text-muted-foreground">Nenhum documento gerado ainda</p>
              <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground/70">
                Os números ao lado já estão calculados. Gerar o documento transforma essa conta na justificativa que
                acompanha a decisão.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
