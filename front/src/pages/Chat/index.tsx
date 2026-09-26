import { useEffect, useRef, useState } from "react"
import { BookOpen, Bot, SendHorizontal, Sparkles, User } from "lucide-react"
import Markdown from "react-markdown"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { PageHeader } from "@/components/shared/PageHeader"
import { ErrorState } from "@/components/shared/ErrorState"
import { usePlantContext } from "@/components/shell/PlantShell"
import { useConsulta } from "@/hooks/useRegulatorio"
import { cn } from "@/lib/utils"

const SUGESTOES = [
  "Qual foi a principal razão de corte desta usina no período selecionado?",
  "Quais eventos deste período têm maior potencial ressarcível e por quê?",
  "O que a Lei 15.269/2025 mudou no ressarcimento por constrained-off?",
  "Que configuração de bateria captura mais perda evitável nesta usina?",
]

interface Mensagem {
  id: number
  autor: "usuario" | "assistente"
  texto: string
  fontes?: string[]
}

export default function Chat() {
  const { id, usina, range } = usePlantContext()
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [rascunho, setRascunho] = useState("")
  const fimRef = useRef<HTMLDivElement | null>(null)
  const { mutate, isPending, error } = useConsulta()

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [mensagens, isPending])

  const enviar = (pergunta: string) => {
    const texto = pergunta.trim()
    if (!texto || isPending) return

    setMensagens((anteriores) => [...anteriores, { id: Date.now(), autor: "usuario", texto }])
    setRascunho("")

    // O contexto da usina e do período vai junto: sem isso o assistente
    // responde genericamente sobre regulação, em vez de sobre este ativo.
    mutate(
      { pergunta: texto, usina_id: id, inicio: range.inicio || undefined, fim: range.fim || undefined },
      {
        onSuccess: (resposta) =>
          setMensagens((anteriores) => [
            ...anteriores,
            { id: Date.now() + 1, autor: "assistente", texto: resposta.resposta, fontes: resposta.fontes },
          ]),
      },
    )
  }

  const vazio = mensagens.length === 0

  return (
    <div className="mx-auto flex max-w-3xl flex-col">
      <PageHeader
        eyebrow="Curtail AI"
        title="Assistente regulatório"
        description={
          usina
            ? `Perguntas sobre curtailment, ressarcimento e operação — respondidas com o contexto de ${usina.nome} e do período selecionado.`
            : "Perguntas sobre curtailment, ressarcimento e operação, com fundamentação nas normas vigentes."
        }
      />

      <div className="flex min-h-[26rem] flex-1 flex-col gap-4">
        {vazio && !isPending && (
          <div className="panel flex flex-col items-center p-6 text-center">
            <span className="rounded-full border border-primary/30 bg-primary/10 p-3">
              <Sparkles className="h-5 w-5 text-primary" />
            </span>
            <p className="mt-3 text-sm font-medium">Comece por uma destas perguntas</p>
            <p className="mt-1 text-xs text-muted-foreground">
              As respostas citam as fontes normativas usadas e sempre exigem revisão humana.
            </p>
            <div className="mt-4 grid w-full gap-2 sm:grid-cols-2">
              {SUGESTOES.map((sugestao) => (
                <button
                  key={sugestao}
                  type="button"
                  onClick={() => enviar(sugestao)}
                  className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-left text-xs leading-relaxed text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent hover:text-foreground"
                >
                  {sugestao}
                </button>
              ))}
            </div>
          </div>
        )}

        {mensagens.map((mensagem) => (
          <article
            key={mensagem.id}
            className={cn("flex gap-3", mensagem.autor === "usuario" ? "justify-end" : "justify-start")}
          >
            {mensagem.autor === "assistente" && (
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10">
                <Bot className="h-3.5 w-3.5 text-primary" />
              </span>
            )}
            <div
              className={cn(
                "max-w-[85%] rounded-xl px-3.5 py-2.5",
                mensagem.autor === "usuario"
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-card",
              )}
            >
              {mensagem.autor === "assistente" ? (
                <div className="markdown">
                  <Markdown>{mensagem.texto}</Markdown>
                </div>
              ) : (
                <p className="text-sm leading-relaxed">{mensagem.texto}</p>
              )}

              {mensagem.fontes && mensagem.fontes.length > 0 && (
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-border pt-2.5">
                  <BookOpen className="h-3 w-3 text-muted-foreground" aria-hidden />
                  {mensagem.fontes.map((fonte) => (
                    <span
                      key={fonte}
                      className="rounded border border-border px-1.5 py-0.5 font-mono text-[0.625rem] text-muted-foreground"
                    >
                      {fonte}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {mensagem.autor === "usuario" && (
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
              </span>
            )}
          </article>
        ))}

        {isPending && (
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10">
              <Bot className="h-3.5 w-3.5 text-primary" />
            </span>
            <span className="flex items-center gap-1" aria-label="Escrevendo resposta">
              {[0, 150, 300].map((atraso) => (
                <span
                  key={atraso}
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60"
                  style={{ animationDelay: `${atraso}ms` }}
                />
              ))}
            </span>
          </div>
        )}

        {error && <ErrorState error={error} />}
        <div ref={fimRef} />
      </div>

      <form
        className="sticky bottom-4 mt-5 flex items-end gap-2 rounded-xl border border-border bg-card/95 p-2 shadow-lg backdrop-blur"
        onSubmit={(event) => {
          event.preventDefault()
          enviar(rascunho)
        }}
      >
        <Textarea
          value={rascunho}
          onChange={(event) => setRascunho(event.target.value)}
          placeholder="Pergunte sobre curtailment, ressarcimento ou operação desta usina…"
          rows={1}
          className="max-h-40 min-h-9 resize-none border-0 bg-transparent px-2 py-1.5 text-sm shadow-none focus-visible:ring-0"
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              enviar(rascunho)
            }
          }}
        />
        <Button type="submit" size="icon" className="h-8 w-8 shrink-0" disabled={isPending || !rascunho.trim()}>
          <SendHorizontal className="h-4 w-4" />
          <span className="sr-only">Enviar pergunta</span>
        </Button>
      </form>
    </div>
  )
}
