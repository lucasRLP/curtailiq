import { useMemo } from "react"
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { ErrorState } from "@/components/shared/ErrorState"
import { PageHeader } from "@/components/shared/PageHeader"
import { StatTile } from "@/components/shared/StatTile"
import { DataKindBadge } from "@/components/shared/Provenance"
import { DataQualityBanner } from "@/components/shared/DataQualityBanner"
import { ExposicaoPanel } from "@/pages/Financeiro/ExposicaoPanel"
import { ChartEmpty, ChartPanel, ChartTooltip, axisProps, gridProps, type SeriesConfig } from "@/components/charts/chart-kit"
import { usePlantContext } from "@/components/shell/PlantShell"
import { usePerda } from "@/hooks/useFinanceiro"
import { fatiasPorRazao } from "@/lib/series"
import {
  corDaRazao,
  ELEGIBILIDADE_ESTILOS,
  ELEGIBILIDADE_LABELS,
  MOTIVO_ONS_LABELS,
  RAZAO_LABELS,
} from "@/lib/constants"
import { fmtBRL, fmtBRLCompacto, fmtDate, fmtInt, fmtMWh, fmtMWhCompacto, fmtNum } from "@/lib/formatters"
import { cn } from "@/lib/utils"
import type { SeriePerdaItem } from "@/types/financeiro"

const perfilConfig: SeriesConfig = {
  energia_mwh: { label: "Energia restringida", color: "var(--energy)", format: fmtMWh },
}

const razaoConfig: SeriesConfig = {
  valor: { label: "Perda financeira", color: "var(--loss)", format: fmtBRL },
}

/**
 * A razão do evento chega como código do ONS (CNF/REL/ENE/INDEFINIDO), enquanto
 * a série de perdas usa chaves descritivas minúsculas. Os dois vocabulários
 * convivem na API, então a tradução tenta os dois.
 */
function rotularRazao(razao?: string | null) {
  if (!razao) return "—"
  return MOTIVO_ONS_LABELS[razao.toUpperCase()] ?? RAZAO_LABELS[razao.toLowerCase()] ?? razao
}

/** Energia restringida somada por hora do dia — revela o padrão do corte. */
function perfilHorario(serie: SeriePerdaItem[]) {
  const horas = Array.from({ length: 24 }, (_, hora) => ({ hora, rotulo: `${String(hora).padStart(2, "0")}h`, energia_mwh: 0, perda_reais: 0 }))
  for (const item of serie) {
    const hora = new Date(item.timestamp).getHours()
    horas[hora].energia_mwh += Number(item.energia_restringida_mwh || 0)
    horas[hora].perda_reais += Number(item.perda_reais || 0)
  }
  return horas
}

export default function Financeiro() {
  const { id, usina, range } = usePlantContext()
  const { data, isLoading, error } = usePerda(id, range.inicio, range.fim, range.ready)

  const razoes = useMemo(() => fatiasPorRazao(data?.por_razao ?? {}, RAZAO_LABELS), [data])
  const perfil = useMemo(() => perfilHorario(data?.serie ?? []), [data])
  const eventos = useMemo(
    () => [...(data?.eventos ?? [])].sort((a, b) => b.perda_total_reais - a.perda_total_reais).slice(0, 25),
    [data],
  )

  const picoHorario = useMemo(() => perfil.reduce((max, atual) => (atual.energia_mwh > max.energia_mwh ? atual : max), perfil[0]), [perfil])
  const temPerfil = perfil.some((hora) => hora.energia_mwh > 0)

  const pldMedio =
    data && Number(data.total_energia_restringida_mwh || 0) > 0
      ? Number(data.total_perda_reais || 0) / Number(data.total_energia_restringida_mwh || 0)
      : 0

  const referenciaOficial = data?.qualidade_dados.referencia_oficial_intervalos ?? 0
  const referenciaEstimativa = data?.qualidade_dados.referencia_estimativa_intervalos ?? 0

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Análise financeira"
        title="De onde vem a perda"
        description="Decomposição da receita não faturada: em que horas do dia o corte acontece, por qual razão regulatória e em quais eventos."
        meta={<DataKindBadge kind="historico" />}
      />

      {error && <ErrorState error={error} />}
      {data && <DataQualityBanner qualidade={data.qualidade_dados} />}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Perda realizada"
          value={data ? fmtBRLCompacto(data.total_perda_reais) : "—"}
          accent="loss"
          size="lg"
          isLoading={isLoading}
          sub={data ? fmtBRL(data.total_perda_reais) : undefined}
        />
        <StatTile
          label="Energia restringida"
          value={data ? fmtMWhCompacto(data.total_energia_restringida_mwh) : "—"}
          accent="energy"
          size="lg"
          isLoading={isLoading}
          sub={
            referenciaOficial || referenciaEstimativa
              ? `${fmtInt(referenciaOficial)} intervalos com referência final do ONS · ${fmtInt(referenciaEstimativa)} estimados`
              : undefined
          }
        />
        <StatTile
          label="Parcela ressarcível"
          value={data?.total_perda_ressarcivel_reais != null ? fmtBRLCompacto(data.total_perda_ressarcivel_reais) : "—"}
          accent="recoverable"
          size="lg"
          isLoading={isLoading}
          sub={
            data?.total_energia_ressarcivel_mwh != null
              ? `${fmtMWh(data.total_energia_ressarcivel_mwh)} com base regulatória`
              : "Sem energia ressarcível apurada no período"
          }
        />
        <StatTile
          label="PLD médio ponderado"
          value={pldMedio ? `${fmtBRL(pldMedio)}/MWh` : "—"}
          accent="neutral"
          size="lg"
          isLoading={isLoading}
          sub={
            picoHorario && picoHorario.energia_mwh > 0
              ? `Corte se concentra às ${picoHorario.rotulo}`
              : undefined
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <ChartPanel
          className="lg:col-span-3"
          title="Perfil horário do corte"
          description={
            usina?.fonte === "solar"
              ? "Energia restringida somada por hora do dia. Em usinas solares o corte tende a se concentrar no pico de irradiação."
              : "Energia restringida somada por hora do dia — mostra em que janela o sistema costuma limitar a usina."
          }
          empty={
            isLoading ? (
              <Skeleton className="h-52 w-full" />
            ) : !temPerfil ? (
              <ChartEmpty title="Nenhum corte registrado no período" />
            ) : undefined
          }
        >
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={perfil} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="rotulo" {...axisProps} interval={2} />
              <YAxis {...axisProps} width={58} tickFormatter={(v: number) => fmtMWhCompacto(v).replace(" MWh", "")} />
              <Tooltip
                cursor={{ fill: "var(--color-accent)", opacity: 0.4 }}
                content={
                  <ChartTooltip
                    config={perfilConfig}
                    labelFormatter={(label) => `${label} — somado no período`}
                    footer={(row) => `${fmtBRL(Number(row.perda_reais ?? 0))} de perda acumulada nesta hora`}
                  />
                }
              />
              {/* Gap de 2px entre barras: barras coladas leem como uma massa só. */}
              <Bar dataKey="energia_mwh" fill="var(--energy)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel
          className="lg:col-span-2"
          title="Perda por razão de restrição"
          description="A razão define se o corte é ressarcível."
          empty={
            isLoading ? (
              <Skeleton className="h-52 w-full" />
            ) : razoes.length === 0 ? (
              <ChartEmpty title="Sem classificação de razão" />
            ) : undefined
          }
        >
          <ResponsiveContainer width="100%" height={Math.max(150, razoes.length * 46)}>
            <BarChart data={razoes} layout="vertical" margin={{ top: 4, right: 104, bottom: 4, left: 0 }} barSize={18}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="razao" {...axisProps} width={142} tick={{ fill: "var(--color-foreground)", fontSize: 11 }} />
              <Tooltip cursor={{ fill: "var(--color-accent)", opacity: 0.4 }} content={<ChartTooltip config={razaoConfig} />} />
              <Bar dataKey="valor" radius={[0, 3, 3, 0]} isAnimationActive={false}>
                {razoes.map((fatia) => (
                  <Cell key={fatia.chave} fill={corDaRazao(fatia.chave)} />
                ))}
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

          {/* Elegibilidade é a informação que o gráfico não carrega: a razão
              decide se o corte pode virar pleito. */}
          <dl className="mt-2 space-y-1.5 border-t border-border pt-2.5">
            {razoes.map((fatia) => (
              <div key={fatia.chave} className="flex items-center justify-between gap-3 text-xs">
                <dt className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                  <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: corDaRazao(fatia.chave) }} />
                  <span className="truncate">{fatia.razao}</span>
                </dt>
                <dd className="tabular shrink-0 text-muted-foreground">{fatia.share.toFixed(0)}% da perda</dd>
              </div>
            ))}
          </dl>
        </ChartPanel>
      </div>

      <ExposicaoPanel id={id} />

      {eventos.length > 0 && (
        <section className="panel overflow-hidden">
          <header className="border-b border-border p-4">
            <h3 className="panel-title">Maiores eventos de curtailment</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Eventos agregados a partir dos intervalos contíguos de restrição, com o indício de evidência usado na
              classificação de elegibilidade.
            </p>
          </header>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Início</th>
                  <th className="px-4 py-2 font-medium">Duração</th>
                  <th className="px-4 py-2 text-right font-medium">Energia</th>
                  <th className="px-4 py-2 text-right font-medium">Perda</th>
                  <th className="px-4 py-2 font-medium">Razão</th>
                  <th className="px-4 py-2 font-medium">Elegibilidade</th>
                  <th className="px-4 py-2 text-right font-medium">Evidência</th>
                </tr>
              </thead>
              <tbody>
                {eventos.map((evento) => (
                  <tr key={evento.event_id} className="border-b border-border/60 last:border-0 hover:bg-accent/40">
                    <td className="tabular whitespace-nowrap px-4 py-2.5 text-xs">{fmtDate(evento.inicio)}</td>
                    <td className="tabular px-4 py-2.5 text-xs text-muted-foreground">
                      {fmtNum(evento.duracao_horas)} h
                    </td>
                    <td className="tabular px-4 py-2.5 text-right text-xs">{fmtMWh(evento.energia_restringida_mwh)}</td>
                    <td className="tabular px-4 py-2.5 text-right text-xs font-semibold text-loss">
                      {fmtBRL(evento.perda_total_reais)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {rotularRazao(evento.razao_normalizada)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[0.6875rem] font-normal",
                          ELEGIBILIDADE_ESTILOS[evento.elegibilidade_status] ?? "",
                        )}
                      >
                        {ELEGIBILIDADE_LABELS[evento.elegibilidade_status] ?? evento.elegibilidade_status}
                      </Badge>
                    </td>
                    {/* evidence_score já vem em 0–100; multiplicar de novo daria "6000%". */}
                    <td className="tabular px-4 py-2.5 text-right text-xs text-muted-foreground">
                      {Math.round(evento.evidence_score)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {isLoading && <Skeleton className="h-64 w-full" />}
    </div>
  )
}
