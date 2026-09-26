import { useState } from "react"
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Cable, Info } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/shared/PageHeader"
import { StatTile } from "@/components/shared/StatTile"
import { EstadoDeFalha } from "@/components/shared/PendingEndpoint"
import { ChartTooltip, axisProps, type SeriesConfig } from "@/components/charts/chart-kit"
import { useOperacaoContext } from "@/components/shell/OperacaoShell"
import { useGargaloDetalhe, useGargalos, useGargalosDaUsina } from "@/hooks/useOperacao"
import { fmtBRLCompacto, fmtDate, fmtInt, fmtMWh, fmtMWhCompacto, fmtNum } from "@/lib/formatters"
import { cn } from "@/lib/utils"
import type { TipoEquipamento } from "@/types/operacao"

const config: SeriesConfig = {
  energia_restringida_mwh: { label: "Energia restringida", color: "var(--energy)", format: fmtMWh },
}

/** Cor fixa por tipo de equipamento, para o ranking não repintar ao filtrar. */
const CORES_TIPO: Record<TipoEquipamento, string> = {
  linha: "var(--chart-1)",
  transformador: "var(--chart-2)",
  subestacao: "var(--chart-3)",
  sistemico: "var(--chart-4)",
  outro: "var(--color-muted-foreground)",
}

const LABEL_TIPO: Record<TipoEquipamento, string> = {
  linha: "Linha de transmissão",
  transformador: "Transformador",
  subestacao: "Subestação",
  sistemico: "Sistêmico",
  outro: "Outro",
}

export default function Gargalos() {
  const { plantId, usina } = useOperacaoContext()
  const [selecionado, setSelecionado] = useState<string | undefined>()

  const ranking = useGargalos()
  const daUsina = useGargalosDaUsina(plantId)
  const detalhe = useGargaloDetalhe(selecionado)

  const lista = ranking.data?.gargalos ?? []
  const topo = lista.slice(0, 10).map((g) => ({ ...g, rotulo: g.rotulo_normalizado }))

  return (
    <>
      <PageHeader
        eyebrow="Gargalos"
        title="Qual equipamento da rede está cortando"
        description="O ONS descreve a restrição em texto livre. Aqui esse texto vira uma lista de equipamentos — linha, transformador, subestação — com as usinas que ficam atrás de cada um."
        meta={
          ranking.data?.cobertura_extracao_pct != null && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[0.6875rem] text-muted-foreground">
              <Info className="h-3 w-3" />
              {fmtNum(ranking.data.cobertura_extracao_pct)}% dos textos com equipamento identificado
              {ranking.data.total_textos_analisados != null &&
                ` · ${fmtInt(ranking.data.total_textos_analisados)} textos analisados`}
            </span>
          )
        }
      />

      {/* ---- o que corta ESTA usina (a pergunta que o dono faz primeiro) ---- */}
      {daUsina.error ? (
        <EstadoDeFalha
          error={daUsina.error}
          rota="GET /api/usinas/{id}/gargalos"
          titulo="Gargalos da usina ainda não publicados"
          descricao="Mostra quais equipamentos respondem pelo corte desta usina e quanto cada um pesa na perda do período."
          consome={[
            "gargalos[].rotulo_normalizado e tipo_equipamento",
            "participacao_na_perda_pct",
            "energia_restringida_mwh e horas_corte",
            "primeira_ocorrencia / ultima_ocorrencia",
          ]}
        />
      ) : daUsina.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : daUsina.data && daUsina.data.gargalos.length > 0 ? (
        <section className="panel overflow-hidden">
          <header className="border-b border-border p-4">
            <h2 className="panel-title">O que corta {usina?.nome ?? "esta usina"}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Ordenado pela participação na perda do período.
            </p>
          </header>
          <ul className="divide-y divide-border">
            {daUsina.data.gargalos.map((gargalo) => (
              <li key={gargalo.gargalo_id}>
                <button
                  type="button"
                  onClick={() => setSelecionado(gargalo.gargalo_id)}
                  className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-accent/40"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-xs font-medium">
                      <span
                        aria-hidden
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]"
                        style={{ background: CORES_TIPO[gargalo.tipo_equipamento] }}
                      />
                      <span className="truncate">{gargalo.rotulo_normalizado}</span>
                    </p>
                    <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
                      {LABEL_TIPO[gargalo.tipo_equipamento]}
                      {gargalo.tensao_kv ? ` · ${gargalo.tensao_kv} kV` : ""}
                      {` · ${fmtNum(gargalo.horas_corte)} h de corte`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tabular text-sm font-semibold text-loss">
                      {fmtNum(gargalo.participacao_na_perda_pct)}%
                    </p>
                    <p className="tabular text-[0.6875rem] text-muted-foreground">
                      {fmtMWhCompacto(gargalo.energia_restringida_mwh)}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ---- ranking do sistema -------------------------------------------- */}
      {ranking.error ? (
        <EstadoDeFalha
          error={ranking.error}
          rota="GET /api/gargalos"
          titulo="Ranking de gargalos ainda não publicado"
          descricao="Ranking dos equipamentos que mais restringem geração no período, com a cobertura da extração declarada — se o texto do ONS for genérico demais, a tela mostra isso em vez de inventar gargalo."
          consome={[
            "gargalos[]: rotulo_normalizado, tipo_equipamento, tensao_kv",
            "energia_restringida_mwh e horas_corte",
            "usinas_afetadas",
            "cobertura_extracao_pct (honestidade do extrator)",
          ]}
        />
      ) : ranking.isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : lista.length > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatTile label="Gargalos identificados" value={fmtInt(lista.length)} size="lg" />
            <StatTile
              label="Energia restringida no topo 10"
              value={fmtMWhCompacto(topo.reduce((acc, g) => acc + g.energia_restringida_mwh, 0))}
              accent="energy"
              size="lg"
            />
            <StatTile
              label="Maior gargalo"
              value={topo[0] ? fmtMWhCompacto(topo[0].energia_restringida_mwh) : "—"}
              accent="loss"
              size="lg"
              sub={topo[0]?.rotulo_normalizado}
            />
            <StatTile
              label="Usinas atrás do maior"
              value={topo[0] ? fmtInt(topo[0].usinas_afetadas) : "—"}
              size="lg"
              sub="Um equipamento corta muitas usinas ao mesmo tempo."
            />
          </div>

          <section className="panel p-4">
            <header className="mb-3">
              <h2 className="flex items-center gap-2 panel-title">
                <Cable className="h-4 w-4 text-muted-foreground" />
                Ranking por energia restringida
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Clique numa barra para ver os conjuntos afetados.</p>
            </header>

            <ResponsiveContainer width="100%" height={Math.max(220, topo.length * 38)}>
              <BarChart data={topo} layout="vertical" margin={{ top: 4, right: 110, bottom: 4, left: 0 }} barSize={16}>
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="rotulo"
                  {...axisProps}
                  width={220}
                  tick={{ fill: "var(--color-foreground)", fontSize: 11 }}
                />
                <Tooltip cursor={{ fill: "var(--color-accent)", opacity: 0.4 }} content={<ChartTooltip config={config} />} />
                <Bar
                  dataKey="energia_restringida_mwh"
                  radius={[0, 3, 3, 0]}
                  isAnimationActive={false}
                  onClick={(dado: unknown) => setSelecionado((dado as { gargalo_id?: string })?.gargalo_id)}
                  className="cursor-pointer"
                >
                  {topo.map((gargalo) => (
                    <Cell key={gargalo.gargalo_id} fill={CORES_TIPO[gargalo.tipo_equipamento]} />
                  ))}
                  <LabelList
                    dataKey="energia_restringida_mwh"
                    position="right"
                    offset={8}
                    fill="var(--color-foreground)"
                    fontSize={11}
                    formatter={(v: unknown) => fmtMWhCompacto(Number(v))}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border pt-2.5">
              {(Object.keys(LABEL_TIPO) as TipoEquipamento[]).map((tipo) => (
                <li key={tipo} className="flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
                  <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: CORES_TIPO[tipo] }} />
                  {LABEL_TIPO[tipo]}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}

      {/* ---- detalhe do gargalo -------------------------------------------- */}
      {selecionado && (
        <section className="panel p-4">
          <header className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="panel-title">{detalhe.data?.rotulo_normalizado ?? "Detalhe do gargalo"}</h2>
              {detalhe.data && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {LABEL_TIPO[detalhe.data.tipo_equipamento]}
                  {detalhe.data.tensao_kv ? ` · ${detalhe.data.tensao_kv} kV` : ""}
                  {detalhe.data.subestacao ? ` · ${detalhe.data.subestacao}` : ""}
                  {` · de ${fmtDate(detalhe.data.primeira_ocorrencia)} a ${fmtDate(detalhe.data.ultima_ocorrencia)}`}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSelecionado(undefined)}
              className="shrink-0 rounded text-xs text-muted-foreground hover:text-foreground"
            >
              Fechar
            </button>
          </header>

          {detalhe.error ? (
            <EstadoDeFalha
              error={detalhe.error}
              rota="GET /api/gargalos/{gargalo_id}"
              titulo="Detalhe do gargalo ainda não publicado"
              descricao="Abre os conjuntos afetados, a série de energia restringida e os textos originais do ONS que geraram o agrupamento."
              consome={[
                "conjuntos_afetados[]: plant_id, nome, energia, horas",
                "serie[]: ts e energia_restringida_mwh",
                "exemplos_texto[]: até 5 textos originais de dsc_restricao",
              ]}
            />
          ) : detalhe.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : detalhe.data ? (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <div>
                <p className="eyebrow mb-2">Conjuntos afetados</p>
                <ul className="divide-y divide-border">
                  {detalhe.data.conjuntos_afetados.map((conjunto) => (
                    <li key={conjunto.plant_id} className="flex items-center justify-between gap-3 py-2 text-xs">
                      <span className="truncate">{conjunto.nome}</span>
                      <span className="tabular shrink-0 text-muted-foreground">
                        {fmtMWhCompacto(conjunto.energia_restringida_mwh)} · {fmtNum(conjunto.horas_corte)} h
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="eyebrow mb-2">Como o ONS descreveu</p>
                <ul className="space-y-1.5">
                  {detalhe.data.exemplos_texto.map((texto, indice) => (
                    <li
                      key={indice}
                      className={cn(
                        "rounded-md border border-border bg-muted/40 px-2.5 py-1.5",
                        "text-[0.6875rem] leading-relaxed text-muted-foreground",
                      )}
                    >
                      “{texto}”
                    </li>
                  ))}
                </ul>
                {detalhe.data.perda_estimada_reais != null && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Perda financeira estimada atribuída a este gargalo:{" "}
                    <span className="font-semibold text-loss">{fmtBRLCompacto(detalhe.data.perda_estimada_reais)}</span>
                  </p>
                )}
              </div>
            </div>
          ) : null}
        </section>
      )}
    </>
  )
}
