import { useMemo } from "react"
import { Link } from "react-router-dom"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { ArrowRight, Sun, Wind } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/shared/ErrorState"
import { PageHeader } from "@/components/shared/PageHeader"
import { StatTile } from "@/components/shared/StatTile"
import { DataKindBadge, MetodoBadge } from "@/components/shared/Provenance"
import { ChartEmpty, ChartLegend, ChartPanel, ChartTooltip, axisProps, gridProps, type SeriesConfig } from "@/components/charts/chart-kit"
import { ForecastPanel } from "@/pages/Resumo/ForecastPanel"
import { usePlantContext } from "@/components/shell/PlantShell"
import { usePerda } from "@/hooks/useFinanceiro"
import { useUsinaResumo } from "@/hooks/useUsinas"
import { agruparPorDia, fatiasPorRazao, maioresIntervalos } from "@/lib/series"
import { corDaRazao, FONTE_LABELS, RAZAO_LABELS } from "@/lib/constants"
import {
  fmtBRL,
  fmtBRLCompacto,
  fmtDiaMes,
  fmtDiaHora,
  fmtInt,
  fmtMWh,
  fmtMWhCompacto,
  fmtPct,
} from "@/lib/formatters"

const serieConfig: SeriesConfig = {
  perda_reais: { label: "Perda financeira", color: "var(--loss)", format: fmtBRL },
  energia_mwh: { label: "Energia restringida", color: "var(--energy)", format: fmtMWh },
}

const razaoConfigBase: SeriesConfig = {
  valor: { label: "Perda financeira", color: "var(--loss)", format: fmtBRL },
}

export default function Resumo() {
  const { id, usina, range } = usePlantContext()
  const resumo = useUsinaResumo(id, range.inicio, range.fim, range.ready)
  const perda = usePerda(id, range.inicio, range.fim, range.ready)

  const dados = resumo.data
  const serieDiaria = useMemo(
    () => agruparPorDia(perda.data?.serie ?? [], { inicio: range.inicio, fim: range.fim }),
    [perda.data, range.inicio, range.fim],
  )
  const razoes = useMemo(
    () => fatiasPorRazao(dados?.perda_por_razao ?? perda.data?.por_razao ?? {}, RAZAO_LABELS),
    [dados, perda.data],
  )
  const picos = useMemo(() => maioresIntervalos(perda.data?.serie ?? [], 6), [perda.data])

  const pldMedio =
    dados && Number(dados.total_corte_mwh || 0) > 0
      ? Number(dados.total_perda_reais || 0) / Number(dados.total_corte_mwh || 0)
      : 0

  const carregando = resumo.isLoading || !range.ready
  const FonteIcon = usina?.fonte === "solar" ? Sun : Wind

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Painel da usina"
        title={usina?.nome ?? "Carregando…"}
        description="Quanto esta usina perdeu com curtailment no período, por que foi cortada e quanto disso dá para recuperar."
        meta={
          usina && (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[0.6875rem] font-medium text-muted-foreground">
                <FonteIcon className={usina.fonte === "solar" ? "h-3 w-3 text-solar" : "h-3 w-3 text-wind"} />
                {FONTE_LABELS[usina.fonte] ?? usina.fonte}
              </span>
              <span className="rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[0.6875rem] font-medium text-muted-foreground">
                {usina.potencia_mw.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MW instalados
              </span>
              <span className="rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[0.6875rem] font-medium text-muted-foreground">
                Submercado {usina.submercado}
              </span>
              {usina.id_ons && (
                <span className="rounded-full border border-border bg-muted/60 px-2 py-0.5 font-mono text-[0.6875rem] text-muted-foreground">
                  ONS {usina.id_ons}
                </span>
              )}
            </>
          )
        }
      />

      {resumo.error && <ErrorState error={resumo.error} />}

      {/* ---- faixa de números: a leitura de 5 segundos --------------------- */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Perda financeira no período"
          value={dados ? fmtBRLCompacto(dados.total_perda_reais) : "—"}
          accent="loss"
          size="lg"
          isLoading={carregando}
          sub={dados ? `${fmtBRL(dados.total_perda_reais)} · receita que a usina deixou de faturar` : undefined}
        />
        <StatTile
          label="Energia restringida"
          value={dados ? fmtMWhCompacto(dados.total_corte_mwh) : "—"}
          accent="energy"
          size="lg"
          isLoading={carregando}
          sub={dados ? `${fmtInt(dados.total_eventos_corte)} eventos · PLD médio ${fmtBRL(pldMedio)}/MWh` : undefined}
        />
        <StatTile
          label="Potencial ressarcível"
          value={dados ? fmtPct(dados.percentual_ressarcivel) : "—"}
          accent="recoverable"
          size="lg"
          isLoading={carregando}
          sub={dados ? `${fmtBRLCompacto(dados.perda_ressarcivel_reais)} com base para pleito regulatório` : undefined}
          action={
            <Button asChild size="sm" variant="outline" className="h-7 gap-1.5 text-xs">
              <Link to={`/usinas/${id}/dossie`}>
                Montar pleito <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          }
        />
        <StatTile
          label={`Projeção · próximos ${dados?.perda_esperada_30d.horizonte_dias ?? 30} dias`}
          value={dados ? fmtBRLCompacto(dados.perda_esperada_30d.valor_reais) : "—"}
          accent="forecast"
          size="lg"
          isLoading={carregando}
          sub={
            dados && (
              <span className="flex flex-wrap items-center gap-1.5">
                <DataKindBadge kind="previsao" />
                <MetodoBadge metodo={dados.perda_esperada_30d.metodo} />
              </span>
            )
          }
          action={
            <Button asChild size="sm" variant="outline" className="h-7 gap-1.5 text-xs">
              <Link to={`/usinas/${id}/bess`}>
                Simular bateria <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          }
        />
      </div>

      {/* ---- perda ao longo do período ------------------------------------ */}
      <ChartPanel
        title="Perda financeira ao longo do período"
        description="Somatório diário da receita não faturada por restrição de geração."
        actions={<DataKindBadge kind="historico" />}
        empty={
          perda.isLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : serieDiaria.length === 0 ? (
            <ChartEmpty
              title="Nenhum evento de curtailment neste período"
              hint="Amplie o intervalo de datas no seletor acima para alcançar o histórico da usina."
            />
          ) : undefined
        }
      >
        <ResponsiveContainer width="100%" height={230}>
          <AreaChart data={serieDiaria} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="gradPerda" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--loss)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--loss)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="dia" {...axisProps} tickFormatter={fmtDiaMes} minTickGap={40} />
            <YAxis {...axisProps} width={62} tickFormatter={(v: number) => fmtBRLCompacto(v)} />
            <Tooltip
              cursor={{ stroke: "var(--axis)", strokeWidth: 1 }}
              content={
                <ChartTooltip
                  config={serieConfig}
                  labelFormatter={(label) => fmtDiaMes(String(label))}
                  footer={(row) => `${fmtMWh(Number(row.energia_mwh ?? 0))} restringidos em ${fmtInt(Number(row.intervalos ?? 0))} intervalos`}
                />
              }
            />
            <Area
              type="monotone"
              dataKey="perda_reais"
              stroke="var(--loss)"
              strokeWidth={2}
              fill="url(#gradPerda)"
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--color-card)" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartPanel>

      {/* ---- por que cortaram + maiores eventos --------------------------- */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChartPanel
          title="Por que a usina foi cortada"
          description="Participação de cada razão de restrição na perda do período."
          legend={
            razoes.length > 1 && (
              <ChartLegend
                config={Object.fromEntries(
                  razoes.map((fatia) => [fatia.chave, { label: fatia.razao, color: corDaRazao(fatia.chave) }]),
                )}
              />
            )
          }
          empty={
            perda.isLoading ? (
              <Skeleton className="h-52 w-full" />
            ) : razoes.length === 0 ? (
              <ChartEmpty title="Sem classificação de razão no período" />
            ) : undefined
          }
        >
          <ResponsiveContainer width="100%" height={Math.max(170, razoes.length * 52)}>
            <BarChart data={razoes} layout="vertical" margin={{ top: 4, right: 116, bottom: 4, left: 0 }} barSize={20}>
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="razao"
                {...axisProps}
                width={150}
                tick={{ fill: "var(--color-foreground)", fontSize: 12 }}
              />
              <Tooltip
                cursor={{ fill: "var(--color-accent)", opacity: 0.4 }}
                content={<ChartTooltip config={razaoConfigBase} labelFormatter={(l) => String(l)} />}
              />
              <Bar dataKey="valor" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                {razoes.map((fatia) => (
                  <Cell key={fatia.chave} fill={corDaRazao(fatia.chave)} />
                ))}
                {/* Rótulo direto no fim da barra: o comprimento mostra a ordem,
                    o rótulo mostra o valor. Repetir isso numa lista embaixo só
                    duplicaria as mesmas categorias. */}
                <LabelList
                  dataKey="valor"
                  position="right"
                  offset={8}
                  fill="var(--color-foreground)"
                  fontSize={11}
                  formatter={(valor: unknown) => fmtBRLCompacto(Number(valor))}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          <p className="mt-1 text-[0.6875rem] text-muted-foreground">
            {razoes
              .slice(0, 2)
              .map((fatia) => `${fatia.razao} responde por ${fatia.share.toFixed(0)}% da perda`)
              .join(" · ")}
            .
          </p>
        </ChartPanel>

        <section className="panel flex flex-col p-4">
          <header className="mb-3">
            <h3 className="panel-title">Intervalos de maior perda</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Os piores momentos do período — pontos de partida para o pleito.
            </p>
          </header>

          {perda.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-11 w-full" />
              ))}
            </div>
          ) : picos.length === 0 ? (
            <ChartEmpty title="Nenhum intervalo de restrição no período" />
          ) : (
            <ul className="divide-y divide-border">
              {picos.map((item) => (
                <li key={item.timestamp} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="tabular text-xs font-medium text-foreground">{fmtDiaHora(item.timestamp)}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
                      <span
                        aria-hidden
                        className="inline-block h-2 w-2 shrink-0 rounded-[2px]"
                        style={{ background: corDaRazao(item.razao_restricao) }}
                      />
                      {RAZAO_LABELS[item.razao_restricao] ?? item.razao_restricao}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tabular text-sm font-semibold text-loss">{fmtBRL(item.perda_reais)}</p>
                    <p className="tabular text-[0.6875rem] text-muted-foreground">
                      {fmtMWh(item.energia_restringida_mwh)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <Button asChild variant="ghost" size="sm" className="mt-auto w-full gap-1.5 pt-3 text-xs">
            <Link to={`/usinas/${id}/financeiro`}>
              Ver análise financeira completa <ArrowRight className="h-3 w-3" />
            </Link>
          </Button>
        </section>
      </div>

      {/* ---- histórico x previsão ----------------------------------------- */}
      <ForecastPanel id={id} />
    </div>
  )
}
