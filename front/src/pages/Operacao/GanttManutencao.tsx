import { useMemo, useState } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { fmtBRL, fmtDiaHora, fmtNum } from "@/lib/formatters"
import { cn } from "@/lib/utils"
import type { JanelaCorte, RecomendacaoAgendamento } from "@/types/operacao"

/**
 * Calendário de manutenção sobre as janelas de corte.
 *
 * É a tela que explica a tese do produto numa imagem: as faixas de fundo são os
 * cortes previstos, a barra vazada é onde a manutenção estava marcada e a barra
 * cheia é para onde o agendador a moveu. Quando a barra cheia cai dentro de uma
 * faixa, a parada deixou de custar energia.
 *
 * Desenhado em CSS sobre uma escala de tempo, não em biblioteca de gráfico: são
 * retângulos posicionados, e qualquer lib de Gantt aqui seria peso morto.
 */

const ALTURA_LINHA = 34

/** Cor da faixa segue a consequência regulatória, não a razão em si. */
function corDaJanela(janela: JanelaCorte) {
  if (janela.ressarcivel) return { fundo: "var(--loss)", opacidade: 0.14, rotulo: "Corte ressarcível" }
  if (janela.razao === "ENE") return { fundo: "var(--recoverable)", opacidade: 0.16, rotulo: "Corte energético" }
  return { fundo: "var(--color-muted-foreground)", opacidade: 0.12, rotulo: "Corte" }
}

interface Props {
  recomendacoes: RecomendacaoAgendamento[]
  janelas: JanelaCorte[]
}

export function GanttManutencao({ recomendacoes, janelas }: Props) {
  const [selecionada, setSelecionada] = useState<string | null>(null)

  const { inicio, duracaoMs, turbinas } = useMemo(() => {
    const instantes: number[] = []

    for (const item of recomendacoes) {
      const base = new Date(item.inicio_baseline).getTime()
      instantes.push(base, base + item.duracao_h * 3_600_000)
      if (item.inicio_recomendado) {
        const rec = new Date(item.inicio_recomendado).getTime()
        instantes.push(rec, rec + item.duracao_h * 3_600_000)
      }
    }
    for (const janela of janelas) {
      instantes.push(new Date(janela.ts_inicio).getTime(), new Date(janela.ts_fim).getTime())
    }

    const validos = instantes.filter((v) => Number.isFinite(v))
    if (validos.length === 0) return { inicio: 0, duracaoMs: 1, turbinas: [] as string[] }

    const min = Math.min(...validos)
    const max = Math.max(...validos)
    // Respiro de 3% de cada lado para as barras não colarem na borda.
    const folga = Math.max((max - min) * 0.03, 1_800_000)

    const nomes = [...new Set(recomendacoes.map((item) => item.turbine_id))].sort()
    return { inicio: min - folga, duracaoMs: max - min + folga * 2, turbinas: nomes }
  }, [recomendacoes, janelas])

  const pct = (instante: string | number) => {
    const valor = typeof instante === "number" ? instante : new Date(instante).getTime()
    return ((valor - inicio) / duracaoMs) * 100
  }

  const marcasTempo = useMemo(() => {
    if (!duracaoMs || duracaoMs <= 1) return []
    return Array.from({ length: 5 }, (_, i) => {
      const instante = inicio + (duracaoMs * i) / 4
      return { pos: (i / 4) * 100, rotulo: fmtDiaHora(new Date(instante).toISOString()) }
    })
  }, [inicio, duracaoMs])

  if (turbinas.length === 0) {
    return (
      <section className="panel p-4">
        <h2 className="panel-title">Calendário de manutenção</h2>
        <p className="mt-2 text-xs text-muted-foreground">Nenhuma ordem de serviço no resultado do agendador.</p>
      </section>
    )
  }

  const detalhe = recomendacoes.find((item) => item.wo_id === selecionada)

  return (
    <section className="panel p-4">
      <header className="mb-3">
        <h2 className="panel-title">Calendário de manutenção sobre as janelas de corte</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Barra vazada é a data original; barra cheia é a recomendada. As faixas de fundo são os cortes previstos.
        </p>
      </header>

      {/* Legenda: as barras se distinguem por preenchimento, não só por cor. */}
      <ul className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[0.6875rem] text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded-sm border border-dashed border-muted-foreground/70" />
          Data original
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded-sm bg-primary" />
          Data recomendada
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded-sm" style={{ background: "var(--recoverable)", opacity: 0.35 }} />
          Corte energético (parada barata)
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded-sm" style={{ background: "var(--loss)", opacity: 0.35 }} />
          Corte ressarcível (parada custa pleito)
        </li>
      </ul>

      <div className="overflow-x-auto">
        <div className="min-w-[44rem]">
          <div className="flex">
            {/* Coluna fixa com o nome das turbinas. */}
            <div className="w-32 shrink-0 pr-3">
              <div className="h-5" />
              {turbinas.map((turbina) => (
                <div
                  key={turbina}
                  className="flex items-center justify-end text-[0.6875rem] text-muted-foreground"
                  style={{ height: ALTURA_LINHA }}
                >
                  {turbina}
                </div>
              ))}
            </div>

            <div className="relative flex-1">
              {/* Eixo de tempo. */}
              <div className="relative h-5">
                {marcasTempo.map((marca) => (
                  <span
                    key={marca.pos}
                    className="absolute -translate-x-1/2 text-[0.625rem] text-muted-foreground"
                    style={{ left: `${marca.pos}%` }}
                  >
                    {marca.rotulo}
                  </span>
                ))}
              </div>

              <div className="relative rounded-md border border-border bg-muted/20">
                {/* Faixas de corte atravessam todas as turbinas. */}
                {janelas.map((janela) => {
                  const esquerda = pct(janela.ts_inicio)
                  const largura = pct(janela.ts_fim) - esquerda
                  if (largura <= 0) return null
                  const cor = corDaJanela(janela)
                  return (
                    <Tooltip key={janela.window_id}>
                      <TooltipTrigger asChild>
                        <div
                          className="absolute inset-y-0 cursor-default"
                          style={{
                            left: `${esquerda}%`,
                            width: `${largura}%`,
                            background: cor.fundo,
                            opacity: cor.opacidade,
                          }}
                        />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="font-medium">{cor.rotulo} · {janela.razao}</p>
                        <p className="mt-1 text-xs">
                          {fmtDiaHora(janela.ts_inicio)} – {fmtDiaHora(janela.ts_fim)}
                        </p>
                        <p className="mt-0.5 text-xs">
                          {fmtNum(janela.profundidade_mw)} MW de redução · probabilidade{" "}
                          {(janela.probabilidade * 100).toFixed(0)}%
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  )
                })}

                {/* Uma faixa por turbina, com as duas barras da tarefa. */}
                {turbinas.map((turbina, indice) => (
                  <div
                    key={turbina}
                    className={cn("relative border-b border-border/40 last:border-0", indice % 2 === 1 && "bg-background/30")}
                    style={{ height: ALTURA_LINHA }}
                  >
                    {recomendacoes
                      .filter((item) => item.turbine_id === turbina)
                      .map((item) => {
                        const duracaoPct = (item.duracao_h * 3_600_000 * 100) / duracaoMs
                        const largura = Math.max(duracaoPct, 0.8)
                        const esquerdaBase = pct(item.inicio_baseline)
                        const esquerdaRec = item.inicio_recomendado ? pct(item.inicio_recomendado) : null
                        const ativo = selecionada === item.wo_id

                        return (
                          <div key={item.wo_id}>
                            <button
                              type="button"
                              onClick={() => setSelecionada(ativo ? null : item.wo_id)}
                              className="absolute top-1.5 h-3 rounded-sm border border-dashed border-muted-foreground/70 bg-transparent"
                              style={{ left: `${esquerdaBase}%`, width: `${largura}%` }}
                              aria-label={`${item.wo_id}: data original ${fmtDiaHora(item.inicio_baseline)}`}
                            />
                            {esquerdaRec !== null && (
                              <button
                                type="button"
                                onClick={() => setSelecionada(ativo ? null : item.wo_id)}
                                className={cn(
                                  "absolute bottom-1.5 h-3.5 rounded-sm transition-all",
                                  item.economia_brl > 0 ? "bg-primary" : "bg-muted-foreground/60",
                                  ativo && "ring-2 ring-ring ring-offset-1 ring-offset-background",
                                )}
                                style={{ left: `${esquerdaRec}%`, width: `${largura}%` }}
                                aria-label={`${item.wo_id}: recomendado ${fmtDiaHora(item.inicio_recomendado!)}`}
                              />
                            )}
                          </div>
                        )
                      })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {detalhe && (
        <div className="mt-4 rounded-lg border border-primary/30 bg-primary/[0.04] p-3.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-xs font-semibold">
              {detalhe.wo_id} · {detalhe.turbine_id}
              {detalhe.tipo_tarefa && <span className="ml-2 font-normal text-muted-foreground">{detalhe.tipo_tarefa}</span>}
            </p>
            <p className="tabular text-sm font-semibold text-recoverable">
              {detalhe.economia_brl > 0 ? `${fmtBRL(detalhe.economia_brl)} de economia` : "Sem ganho no deslocamento"}
            </p>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{detalhe.justificativa}</p>
        </div>
      )}
    </section>
  )
}
