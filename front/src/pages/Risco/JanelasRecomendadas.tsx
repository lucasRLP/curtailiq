import { useMemo } from "react"
import { Link } from "react-router-dom"
import { ArrowRight, CalendarClock, Wrench } from "lucide-react"
import { Button } from "@/components/ui/button"
import { fmtDiaHora, fmtInt, fmtMWh, fmtNum } from "@/lib/formatters"
import { agruparJanelasDeCorte } from "@/lib/series"
import { cn } from "@/lib/utils"
import type { PrevisaoRiscoItem } from "@/types/usinas"

/**
 * Janelas de parada recomendadas.
 *
 * A previsão sozinha é um gráfico: informa que vai ter corte e não diz o que
 * fazer. Esta seção faz a tradução que interessa a quem opera — dentro de uma
 * janela de corte a energia já está perdida, então **é ali que parar turbina
 * custa menos**. Manutenção, teste, inspeção: tudo que consome geração fica
 * mais barato dentro da janela.
 *
 * O agrupamento é feito aqui no front, a partir da série que o modelo já
 * devolve. Quando o agendador do backend entrar no ar (`POST /agendar`), ele
 * passa a fazer isso com restrição de equipe, vento e prazo — esta seção é a
 * leitura direta da previsão, sem essas restrições.
 */

interface Props {
  previsoes: PrevisaoRiscoItem[]
  limiar: number
  horizonte: number
}

export function JanelasRecomendadas({ previsoes, limiar, horizonte }: Props) {
  const janelas = useMemo(() => {
    const encontradas = agruparJanelasDeCorte(previsoes, limiar)
    return [...encontradas].sort((a, b) => b.energiaEsperadaMwh - a.energiaEsperadaMwh)
  }, [previsoes, limiar])

  const horasTotais = janelas.reduce((acc, j) => acc + j.duracaoHoras, 0)

  return (
    <section className="panel overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 panel-title">
            <Wrench className="h-4 w-4 text-muted-foreground" />
            Melhores janelas para parar turbina
          </h2>
          <p className="mt-0.5 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            Dentro de uma janela de corte a energia já está perdida — parar uma turbina ali custa pouco ou nada.
            Ordenado por energia esperada no corte (magnitude × probabilidade), que é o quanto a janela "paga" a parada.
          </p>
        </div>
        <Button asChild size="sm" variant="outline" className="h-8 shrink-0 gap-1.5 text-xs">
          <Link to="/operacao/manutencao">
            Agendar manutenção <ArrowRight className="h-3 w-3" />
          </Link>
        </Button>
      </header>

      {janelas.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-10 text-center">
          <CalendarClock className="h-5 w-5 text-muted-foreground/50" aria-hidden />
          <p className="mt-3 text-sm font-medium text-muted-foreground">
            Nenhuma janela de corte prevista nas próximas {horizonte} h
          </p>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground/70">
            Sem corte à vista, qualquer parada de manutenção custa geração cheia. Vale esperar uma janela ou aceitar o
            custo, se a tarefa não puder esperar.
          </p>
        </div>
      ) : (
        <>
          <div className="border-b border-border bg-muted/30 px-4 py-2.5">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {fmtInt(janelas.length)} janela{janelas.length > 1 ? "s" : ""} · {fmtNum(horasTotais)} h no total
              </span>{" "}
              acima de {Math.round(limiar * 100)}% de probabilidade no horizonte de {horizonte} h.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">#</th>
                  <th className="px-4 py-2.5 font-medium">Início</th>
                  <th className="px-4 py-2.5 font-medium">Fim</th>
                  <th className="px-4 py-2.5 text-right font-medium">Duração</th>
                  <th className="px-4 py-2.5 text-right font-medium">Probabilidade</th>
                  <th className="px-4 py-2.5 text-right font-medium">Energia no corte</th>
                  <th className="px-4 py-2.5 text-right font-medium">Energia esperada</th>
                </tr>
              </thead>
              <tbody>
                {janelas.map((janela, indice) => (
                  <tr
                    key={janela.inicio}
                    className={cn(
                      "border-b border-border/60 last:border-0 hover:bg-accent/40",
                      indice === 0 && "bg-recoverable/[0.06]",
                    )}
                  >
                    <td className="tabular px-4 py-2.5 text-xs text-muted-foreground">
                      {indice + 1}
                      {indice === 0 && <span className="ml-1.5 text-[0.625rem] text-recoverable">melhor</span>}
                    </td>
                    <td className="tabular px-4 py-2.5 text-xs font-medium">{fmtDiaHora(janela.inicio)}</td>
                    <td className="tabular px-4 py-2.5 text-xs text-muted-foreground">{fmtDiaHora(janela.fim)}</td>
                    <td className="tabular px-4 py-2.5 text-right text-xs">{fmtNum(janela.duracaoHoras)} h</td>
                    <td className="tabular px-4 py-2.5 text-right text-xs text-forecast">
                      {fmtNum(janela.probabilidadeMedia * 100)}%
                    </td>
                    <td className="tabular px-4 py-2.5 text-right text-xs">{fmtMWh(janela.energiaMwh)}</td>
                    <td className="tabular px-4 py-2.5 text-right text-xs font-semibold text-recoverable">
                      {fmtMWh(janela.energiaEsperadaMwh)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="border-t border-border px-4 py-2.5 text-[0.6875rem] leading-relaxed text-muted-foreground">
            Leitura direta da previsão: ainda não considera disponibilidade de equipe, limite de vento para subir na
            nacele nem o prazo das ordens de serviço. O agendador aplica essas restrições.
          </p>
        </>
      )}
    </section>
  )
}
