import { useMemo } from "react"
import { Link } from "react-router-dom"
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/shared/ErrorState"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MetodoBadge } from "@/components/shared/Provenance"
import {
  ChartEmpty,
  ChartLegend,
  ChartPanel,
  ChartTooltip,
  axisProps,
  gridProps,
  type SeriesConfig,
} from "@/components/charts/chart-kit"
import { usePrevisaoPerdas } from "@/hooks/useFinanceiro"
import { fmtBRL, fmtBRLCompacto, fmtDiaHora, fmtMWh } from "@/lib/formatters"

const config: SeriesConfig = {
  historico: { label: "Perda realizada", color: "var(--loss)", format: fmtBRL },
  previsao: { label: "Perda projetada", color: "var(--forecast)", dashed: true, format: fmtBRL },
}

interface Ponto {
  timestamp: string
  historico?: number
  previsao?: number
  energia_mwh: number
}

/**
 * Histórico realizado × projeção, com divisor no "agora".
 *
 * Exigência do contrato de front: as duas séries nunca podem parecer a mesma
 * coisa. Realizado é linha cheia em vermelho de perda; projeção é tracejada em
 * violeta, com o método do modelo declarado no cabeçalho.
 */
export function ForecastPanel({ id }: { id: string }) {
  const { data, isLoading, error } = usePrevisaoPerdas(id)

  const { pontos, corte } = useMemo(() => {
    if (!data) return { pontos: [] as Ponto[], corte: undefined as string | undefined }

    const historico: Ponto[] = data.serie_historico.map((item) => ({
      timestamp: item.timestamp,
      historico: Number(item.perda_reais || 0),
      energia_mwh: Number(item.energia_mwh || 0),
    }))

    const previsao: Ponto[] = data.serie_previsao.map((item) => ({
      timestamp: item.timestamp,
      previsao: Number(item.perda_reais || 0),
      energia_mwh: Number(item.energia_mwh || 0),
    }))

    // Costura: o último ponto realizado também alimenta a série prevista, para
    // as linhas se encontrarem em vez de deixar um vão no "agora".
    const ultimo = historico.at(-1)
    if (ultimo) ultimo.previsao = ultimo.historico

    return { pontos: [...historico, ...previsao], corte: previsao[0]?.timestamp }
  }, [data])

  const resumo = data?.resumo

  /**
   * Um gráfico com todas as séries zeradas vira uma reta em cima do eixo — que
   * o leitor interpreta como "o gráfico quebrou" ou, pior, como uma previsão
   * precisa de perda zero. Quando não há o que desenhar, o painel diz por quê.
   */
  const semHistorico = (data?.serie_historico.length ?? 0) === 0
  const tudoZero =
    pontos.length > 0 && pontos.every((ponto) => !(ponto.historico ?? 0) && !(ponto.previsao ?? 0))

  return (
    <ChartPanel
      title="Realizado × projetado"
      description="Últimos dias apurados e o que o modelo projeta para as próximas horas."
      actions={
        <div className="flex items-center gap-2">
          <MetodoBadge metodo={data?.metodo_previsao} />
          <Button asChild size="sm" variant="ghost" className="h-7 gap-1.5 text-xs">
            <Link to={`/usinas/${id}/risco`}>
              Ver risco hora a hora <ArrowRight className="h-3 w-3" />
            </Link>
          </Button>
        </div>
      }
      legend={tudoZero ? undefined : <ChartLegend config={config} />}
      empty={
        isLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : error ? (
          <ErrorState error={error} />
        ) : pontos.length === 0 ? (
          <ChartEmpty
            title="Sem projeção disponível para esta usina"
            hint="O modelo precisa de histórico recente contíguo para projetar as próximas horas."
          />
        ) : tudoZero ? (
          <ChartEmpty
            title={
              semHistorico
                ? "Sem restrição apurada nas últimas horas e projeção zerada"
                : "Modelo projeta perda zero para as próximas horas"
            }
            hint={
              semHistorico
                ? "Esta janela é ancorada na data de hoje, não no período selecionado acima. Se a base desta usina termina antes de hoje, não há histórico recente para comparar — o histórico completo está no gráfico anterior."
                : "Nenhum corte previsto no horizonte do modelo. O histórico do período selecionado continua no gráfico acima."
            }
          />
        ) : undefined
      }
    >
      <ResponsiveContainer width="100%" height={230}>
        <LineChart data={pontos} margin={{ top: 4, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="timestamp" {...axisProps} tickFormatter={fmtDiaHora} minTickGap={56} />
          <YAxis {...axisProps} width={62} tickFormatter={(v: number) => fmtBRLCompacto(v)} />
          <Tooltip
            cursor={{ stroke: "var(--axis)", strokeWidth: 1 }}
            content={
              <ChartTooltip
                config={config}
                labelFormatter={(label) => fmtDiaHora(String(label))}
                footer={(row) => `${fmtMWh(Number(row.energia_mwh ?? 0))} de energia no intervalo`}
              />
            }
          />
          {/* O divisor só faz sentido quando existe realizado à esquerda dele;
              colado na borda o rótulo cai em cima do eixo Y. */}
          {corte && !semHistorico && (
            <ReferenceLine
              x={corte}
              stroke="var(--axis)"
              strokeDasharray="4 4"
              label={{ value: "agora", position: "top", fill: "var(--color-muted-foreground)", fontSize: 10 }}
            />
          )}
          <Line
            type="monotone"
            dataKey="historico"
            stroke="var(--loss)"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--color-card)" }}
          />
          <Line
            type="monotone"
            dataKey="previsao"
            stroke="var(--forecast)"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            connectNulls={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--color-card)" }}
          />
        </LineChart>
      </ResponsiveContainer>

      {resumo && (
        <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3 sm:grid-cols-4">
          <div>
            <dt className="text-[0.6875rem] text-muted-foreground">Perda realizada na janela</dt>
            <dd className="tabular mt-0.5 text-sm font-semibold text-loss">{fmtBRL(resumo.perda_historica_reais)}</dd>
          </div>
          <div>
            <dt className="text-[0.6875rem] text-muted-foreground">Perda projetada</dt>
            <dd className="tabular mt-0.5 text-sm font-semibold text-forecast">{fmtBRL(resumo.perda_prevista_reais)}</dd>
          </div>
          <div>
            <dt className="text-[0.6875rem] text-muted-foreground">Energia realizada</dt>
            <dd className="tabular mt-0.5 text-sm font-semibold text-foreground">{fmtMWh(resumo.energia_historica_mwh)}</dd>
          </div>
          <div>
            <dt className="text-[0.6875rem] text-muted-foreground">Energia projetada</dt>
            <dd className="tabular mt-0.5 text-sm font-semibold text-foreground">{fmtMWh(resumo.energia_prevista_mwh)}</dd>
          </div>
        </dl>
      )}
    </ChartPanel>
  )
}
