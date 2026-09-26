import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Play, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/shared/PageHeader"
import { StatTile } from "@/components/shared/StatTile"
import { EstadoDeFalha } from "@/components/shared/PendingEndpoint"
import { ChartTooltip, axisProps, gridProps, type SeriesConfig } from "@/components/charts/chart-kit"
import { useOperacaoContext } from "@/components/shell/OperacaoShell"
import { useBacktestUltimo, useRodarBacktest } from "@/hooks/useOperacao"
import { fmtBRL, fmtBRLCompacto, fmtDate, fmtInt, fmtNum } from "@/lib/formatters"
import type { CenarioBacktest } from "@/types/operacao"

const config: SeriesConfig = {
  custo_total_brl: { label: "Custo total do período", color: "var(--loss)", format: fmtBRL },
}

const CENARIOS: Record<CenarioBacktest, { label: string; cor: string; explica: string }> = {
  baseline: {
    label: "A · Como é hoje",
    cor: "var(--loss)",
    explica: "Cada tarefa na data originalmente planejada, sem olhar para o corte.",
  },
  oraculo: {
    label: "B · Teto teórico",
    cor: "var(--color-muted-foreground)",
    explica: "Agendando com as janelas de corte já observadas. É o máximo que daria para capturar.",
  },
  realista: {
    label: "C · O que o produto entrega",
    cor: "var(--recoverable)",
    explica: "Agendando só com o que o modelo previa em D−1. É este o número que vale.",
  },
}

export default function Valor() {
  const { plantId, usina } = useOperacaoContext()
  const ultimo = useBacktestUltimo(plantId)
  const rodar = useRodarBacktest(plantId)

  const dados = rodar.data ?? ultimo.data
  const erro = rodar.error ?? ultimo.error
  const carregando = ultimo.isLoading || rodar.isPending

  const cenarios =
    dados?.cenarios.map((cenario) => ({
      ...cenario,
      rotulo: CENARIOS[cenario.cenario]?.label ?? cenario.cenario,
    })) ?? []

  return (
    <>
      <PageHeader
        eyebrow="Valor"
        title="Quanto o reagendamento vale por ano"
        description={
          usina
            ? `Backtest sobre o histórico de ${usina.nome}: compara o plano de manutenção de hoje com o que o agendador teria feito, separando o teto teórico do que o modelo realmente entregaria.`
            : "Backtest que compara o plano de manutenção atual com o que o agendador teria feito."
        }
        actions={
          <Button
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => rodar.mutate({})}
            disabled={rodar.isPending || !plantId}
          >
            <Play className="h-3.5 w-3.5" />
            {rodar.isPending ? "Rodando…" : "Rodar backtest"}
          </Button>
        }
      />

      {erro && !dados ? (
        <EstadoDeFalha
          error={erro}
          rota="GET /api/operacao/usinas/{id}/backtest/ultimo"
          titulo="Backtest de valor ainda não publicado"
          descricao="Esta é a tela que prova o valor do produto: economia por MW por ano, percentual do teto capturado e a sensibilidade a cada premissa que ainda não foi validada com O&M."
          consome={[
            "resumo.economia_brl_por_mw_ano e por_turbina_ano",
            "resumo.teto_capturado_pct = (A−C)/(A−B)",
            "resumo.desvio_padrao_economia_brl (≥ 30 sementes)",
            "cenarios[]: baseline, oraculo, realista",
            "horas em corte ENE / ressarcível / fora de corte",
            "sensibilidade[]: flexibilidade, vento, domingo, penalidade",
            "premissas[]: o que ainda não foi validado",
          ]}
        />
      ) : carregando && !dados ? (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
          <Skeleton className="h-64 w-full" />
        </>
      ) : dados ? (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatTile
              label="Economia por MW por ano"
              value={fmtBRLCompacto(dados.resumo.economia_brl_por_mw_ano)}
              accent="recoverable"
              size="lg"
              sub={`± ${fmtBRLCompacto(dados.resumo.desvio_padrao_economia_brl)} entre ${fmtInt(dados.sementes)} sementes`}
            />
            <StatTile
              label="Economia por turbina por ano"
              value={fmtBRLCompacto(dados.resumo.economia_brl_por_turbina_ano)}
              accent="recoverable"
              size="lg"
            />
            <StatTile
              label="Do teto teórico capturado"
              value={`${fmtNum(dados.resumo.teto_capturado_pct)}%`}
              accent="neutral"
              size="lg"
              sub="Quanto do ganho possível o modelo consegue pegar prevendo em D−1."
            />
            <StatTile
              label="Tarefas movidas"
              value={`${fmtNum(dados.resumo.tarefas_movidas_pct)}%`}
              accent="neutral"
              size="lg"
              sub={`Período de ${fmtDate(dados.periodo.inicio)} a ${fmtDate(dados.periodo.fim)}`}
            />
          </div>

          <section className="panel p-4">
            <header className="mb-3">
              <h2 className="flex items-center gap-2 panel-title">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                Custo total por cenário
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Mesma usina, mesmo período, mesmas ordens de serviço. Só muda a informação disponível na hora de decidir.
              </p>
            </header>

            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={cenarios} margin={{ top: 16, right: 12, bottom: 0, left: 4 }} barSize={56}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="rotulo" {...axisProps} />
                <YAxis {...axisProps} width={68} tickFormatter={(v: number) => fmtBRLCompacto(v)} />
                <Tooltip cursor={{ fill: "var(--color-accent)", opacity: 0.4 }} content={<ChartTooltip config={config} />} />
                <Bar dataKey="custo_total_brl" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {cenarios.map((cenario) => (
                    <Cell key={cenario.cenario} fill={CENARIOS[cenario.cenario]?.cor ?? "var(--chart-1)"} />
                  ))}
                  <LabelList
                    dataKey="custo_total_brl"
                    position="top"
                    fill="var(--color-foreground)"
                    fontSize={11}
                    formatter={(v: unknown) => fmtBRLCompacto(Number(v))}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            <dl className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-3">
              {cenarios.map((cenario) => (
                <div key={cenario.cenario}>
                  <dt className="flex items-center gap-1.5 text-[0.6875rem] font-medium">
                    <span
                      aria-hidden
                      className="inline-block h-2.5 w-2.5 rounded-[3px]"
                      style={{ background: CENARIOS[cenario.cenario]?.cor }}
                    />
                    {CENARIOS[cenario.cenario]?.label ?? cenario.cenario}
                  </dt>
                  <dd className="mt-1 text-[0.6875rem] leading-relaxed text-muted-foreground">
                    {CENARIOS[cenario.cenario]?.explica}
                  </dd>
                  <dd className="tabular mt-1 text-xs">
                    {fmtNum(cenario.horas_em_corte_ene)} h em corte energético ·{" "}
                    {fmtNum(cenario.horas_fora_de_corte)} h fora de corte
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          {dados.sensibilidade.length > 0 && (
            <section className="panel overflow-hidden">
              <header className="border-b border-border p-4">
                <h2 className="panel-title">Sensibilidade às premissas</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Um número só, sem faixa, não sai deste módulo. Cada linha mostra o resultado mudando uma premissa.
                </p>
              </header>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium">Premissa</th>
                      <th className="px-4 py-2.5 font-medium">Valor testado</th>
                      <th className="px-4 py-2.5 text-right font-medium">Economia por MW/ano</th>
                      <th className="px-4 py-2.5 text-right font-medium">Teto capturado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.sensibilidade.map((linha, indice) => (
                      <tr key={`${linha.parametro}-${indice}`} className="border-b border-border/60 last:border-0">
                        <td className="px-4 py-2.5 text-xs">{linha.parametro}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{String(linha.valor)}</td>
                        <td className="tabular px-4 py-2.5 text-right text-xs font-semibold text-recoverable">
                          {fmtBRL(linha.economia_brl_por_mw_ano)}
                        </td>
                        <td className="tabular px-4 py-2.5 text-right text-xs">{fmtNum(linha.teto_capturado_pct)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {dados.premissas.length > 0 && (
            <section className="panel p-4">
              <h2 className="panel-title mb-2">Premissas ainda não validadas</h2>
              <ul className="space-y-1.5">
                {dados.premissas.map((premissa) => (
                  <li key={premissa} className="text-xs leading-relaxed text-muted-foreground">
                    · {premissa}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : null}
    </>
  )
}
