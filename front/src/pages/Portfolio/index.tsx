import { useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { ArrowUpDown, Map as MapIcon, Search, Sun, Table2, TriangleAlert, Wind } from "lucide-react"
import { AppHeader } from "@/components/shell/AppHeader"
import { BuildFooter } from "@/components/shared/BuildFooter"
import { PageHeader } from "@/components/shared/PageHeader"
import { StatTile } from "@/components/shared/StatTile"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ErrorState } from "@/components/shared/ErrorState"
import { useAllUsinas } from "@/hooks/useUsinas"
import { usePersistedState } from "@/hooks/usePersistedState"
import { FONTES, FONTE_LABELS, SUBMERCADOS } from "@/lib/constants"
import { fmtBRL, fmtBRLCompacto, fmtInt, fmtMW, fmtMWh, fmtMWhCompacto } from "@/lib/formatters"
import { cn } from "@/lib/utils"
import type { UsinaOut } from "@/types/usinas"
import { MapaUsinas } from "./MapaUsinas"

type Coluna = "nome" | "potencia_mw" | "total_corte_mwh" | "total_perda_reais" | "total_perda_ressarcivel_reais"

const COLUNAS: Array<{ chave: Coluna; label: string; numerica?: boolean }> = [
  { chave: "nome", label: "Usina" },
  { chave: "potencia_mw", label: "Capacidade", numerica: true },
  { chave: "total_corte_mwh", label: "Energia cortada", numerica: true },
  { chave: "total_perda_reais", label: "Perda financeira", numerica: true },
  { chave: "total_perda_ressarcivel_reais", label: "Ressarcível", numerica: true },
]

const PAGINA = 15

/**
 * Quantos intervalos de restrição ficaram sem PLD.
 *
 * Sem PLD não há como converter energia em dinheiro, então a perda financeira
 * daquela usina sai SUBESTIMADA — e o ranking por perda fica injusto com ela.
 * Marcar isso é o que separa um número honesto de um número bonito.
 */
function lacunaDePld(usina: UsinaOut) {
  const faltantes = Number(usina.pld_faltante_intervalos ?? 0)
  const total = Number(usina.total_intervalos_restricao ?? 0)
  if (!faltantes || !total) return null
  return { faltantes, total, share: (faltantes / total) * 100 }
}

export default function Portfolio() {
  const [fonte, setFonte] = usePersistedState("portfolio.fonte", "all")
  const [submercado, setSubmercado] = usePersistedState("portfolio.submercado", "NE")
  /**
   * Modo de visão na URL, com a preferência guardada como padrão.
   *
   * Sem isso, "manda o mapa pra alguém" não existe: o link abre no modo que a
   * outra pessoa usou por último. A URL vence; o localStorage só decide quando
   * o parâmetro não vem.
   */
  const [searchParams, setSearchParams] = useSearchParams()
  const [visaoSalva, setVisaoSalva] = usePersistedState<"tabela" | "mapa">("portfolio.visao", "tabela")
  const visaoUrl = searchParams.get("visao")
  const visao: "tabela" | "mapa" = visaoUrl === "mapa" || visaoUrl === "tabela" ? visaoUrl : visaoSalva

  const setVisao = (proxima: "tabela" | "mapa") => {
    setVisaoSalva(proxima)
    setSearchParams(
      (atual) => {
        const proximos = new URLSearchParams(atual)
        proximos.set("visao", proxima)
        return proximos
      },
      { replace: true },
    )
  }
  const [busca, setBusca] = useState("")
  const [ordem, setOrdem] = useState<{ coluna: Coluna; desc: boolean }>({ coluna: "total_perda_reais", desc: true })
  const [pagina, setPagina] = useState(0)
  // Hover compartilhado: passar o mouse na lista acende o ponto no mapa, e vice-versa.
  const [destacada, setDestacada] = useState<string | null>(null)

  const filtros = useMemo(
    () => ({
      fonte: fonte !== "all" ? fonte : undefined,
      submercado: submercado !== "all" ? submercado : undefined,
    }),
    [fonte, submercado],
  )

  const { data: usinas, isLoading, error } = useAllUsinas(filtros)

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const base = (usinas ?? []).filter((usina) => {
      if (!termo) return true
      return (
        usina.nome.toLowerCase().includes(termo) ||
        (usina.id_ons ?? "").toLowerCase().includes(termo) ||
        (usina.nom_conjuntousina ?? "").toLowerCase().includes(termo)
      )
    })

    return [...base].sort((a, b) => {
      const { coluna, desc } = ordem
      if (coluna === "nome") {
        const cmp = a.nome.localeCompare(b.nome, "pt-BR")
        return desc ? -cmp : cmp
      }
      const cmp = Number(a[coluna] ?? 0) - Number(b[coluna] ?? 0)
      return desc ? -cmp : cmp
    })
  }, [usinas, busca, ordem])

  /**
   * Somatórios do recorte.
   *
   * Nem todo ambiente traz valor financeiro no catálogo (o repositório local de
   * demonstração, por exemplo, só devolve energia). Somar `null` como zero
   * mostraria "R$ 0" em vermelho — que um gestor lê como "não houve perda". Por
   * isso cada total sabe dizer se tem base para existir.
   */
  const totais = useMemo(() => {
    const base = usinas ?? []
    const somar = (campo: keyof UsinaOut) => {
      const valores = base.map((u) => u[campo]).filter((v): v is number => typeof v === "number")
      return { valor: valores.reduce((acc, v) => acc + v, 0), disponivel: valores.length > 0 }
    }

    return {
      usinas: base.length,
      perda: somar("total_perda_reais"),
      corte: somar("total_corte_mwh"),
      ressarcivel: somar("total_perda_ressarcivel_reais"),
    }
  }, [usinas])

  const SEM_DADO = "Não disponível no catálogo deste ambiente."

  // Referência da barra é o recorte inteiro, não a página: senão a mesma usina
  // mudaria de tamanho ao virar de página.
  const maxCorteRecorte = useMemo(
    () => Math.max(...filtradas.map((u) => Number(u.total_corte_mwh ?? 0)), 1),
    [filtradas],
  )

  const paginadas = filtradas.slice(pagina * PAGINA, pagina * PAGINA + PAGINA)
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / PAGINA))

  const ordenarPor = (coluna: Coluna) => {
    setPagina(0)
    setOrdem((atual) => (atual.coluna === coluna ? { coluna, desc: !atual.desc } : { coluna, desc: coluna !== "nome" }))
  }

  const aoFiltrar = (acao: () => void) => {
    acao()
    setPagina(0)
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <AppHeader crumbs={[{ label: "Portfólio" }]} />

      <main id="conteudo" className="entrada-conteudo mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader
          eyebrow="Portfólio"
          title="Usinas monitoradas"
          description="Usinas individuais ordenadas por impacto de curtailment nos últimos meses disponíveis. O conjunto do ONS aparece apenas como metadado regulatório."
          actions={
            <div className="flex items-center rounded-md border border-border p-0.5" role="group" aria-label="Modo de visualização">
              {([
                { chave: "tabela", label: "Lista", Icon: Table2 },
                { chave: "mapa", label: "Mapa", Icon: MapIcon },
              ] as const).map(({ chave, label, Icon }) => (
                <button
                  key={chave}
                  type="button"
                  onClick={() => setVisao(chave)}
                  aria-pressed={visao === chave}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
                    visao === chave ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          }
        />

        <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatTile label="Usinas no recorte" value={isLoading ? "—" : fmtInt(totais.usinas)} isLoading={isLoading} />
          <StatTile
            label="Perda financeira somada"
            value={totais.perda.disponivel ? fmtBRLCompacto(totais.perda.valor) : "—"}
            accent={totais.perda.disponivel ? "loss" : "neutral"}
            isLoading={isLoading}
            sub={totais.perda.disponivel ? fmtBRL(totais.perda.valor) : SEM_DADO}
          />
          <StatTile
            label="Energia cortada somada"
            value={totais.corte.disponivel ? fmtMWhCompacto(totais.corte.valor) : "—"}
            accent={totais.corte.disponivel ? "energy" : "neutral"}
            isLoading={isLoading}
            sub={totais.corte.disponivel ? undefined : SEM_DADO}
          />
          <StatTile
            label="Potencial ressarcível"
            value={totais.ressarcivel.disponivel ? fmtBRLCompacto(totais.ressarcivel.valor) : "—"}
            accent={totais.ressarcivel.disponivel ? "recoverable" : "neutral"}
            isLoading={isLoading}
            sub={
              totais.ressarcivel.disponivel && totais.perda.disponivel && totais.perda.valor > 0
                ? `${((totais.ressarcivel.valor / totais.perda.valor) * 100).toFixed(0)}% da perda somada`
                : totais.ressarcivel.disponivel
                  ? undefined
                  : SEM_DADO
            }
          />
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1 sm:max-w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(event) => aoFiltrar(() => setBusca(event.target.value))}
              placeholder="Buscar por nome, ID ONS ou conjunto…"
              className="h-8 pl-8 text-xs"
              aria-label="Buscar usina"
            />
          </div>

          <Select value={fonte} onValueChange={(valor) => aoFiltrar(() => setFonte(valor))}>
            <SelectTrigger className="h-8 w-36 text-xs" aria-label="Filtrar por fonte">
              <SelectValue placeholder="Fonte" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as fontes</SelectItem>
              {FONTES.map((valor) => (
                <SelectItem key={valor} value={valor}>
                  {FONTE_LABELS[valor]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={submercado} onValueChange={(valor) => aoFiltrar(() => setSubmercado(valor))}>
            <SelectTrigger className="h-8 w-36 text-xs" aria-label="Filtrar por submercado">
              <SelectValue placeholder="Submercado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os submercados</SelectItem>
              {SUBMERCADOS.map((valor) => (
                <SelectItem key={valor} value={valor}>
                  {valor}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {!isLoading && (
            <span className="ml-auto text-xs text-muted-foreground">
              {fmtInt(filtradas.length)} usina{filtradas.length === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {error && <ErrorState error={error} />}

        {isLoading ? (
          <div className="panel divide-y divide-border">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3 p-3.5">
                <Skeleton className="h-4 w-4 shrink-0 rounded-full" />
                <Skeleton className="h-4 flex-1 max-w-64" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        ) : visao === "mapa" ? (
          <div className="grid gap-4 lg:grid-cols-[1.45fr_1fr]">
            <MapaUsinas usinas={filtradas} destacada={destacada} onHover={setDestacada} />
            <ListaSincronizada usinas={filtradas} destacada={destacada} onHover={setDestacada} />
          </div>
        ) : filtradas.length === 0 ? (
          <div className="panel flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm font-medium text-muted-foreground">Nenhuma usina encontrada</p>
            <p className="mt-1 text-xs text-muted-foreground/70">Ajuste a busca ou os filtros de fonte e submercado.</p>
          </div>
        ) : (
          <>
            {/* Lista em cartões no celular; tabela ordenável no desktop. */}
            <ul className="panel divide-y divide-border sm:hidden">
              {paginadas.map((usina) => (
                <li key={usina.usina_id}>
                  <PlantCardMobile usina={usina} />
                </li>
              ))}
            </ul>

            <div className="panel hidden overflow-hidden sm:block">
              <table className="w-full text-sm">
                <caption className="sr-only">Usinas monitoradas, ordenáveis por coluna</caption>
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th scope="col" className="w-10 px-4 py-2.5 text-right font-medium">
                      #
                    </th>
                    {COLUNAS.map((coluna) => (
                      <th
                        key={coluna.chave}
                        scope="col"
                        className={cn("px-4 py-2.5 font-medium", coluna.numerica && "text-right")}
                        aria-sort={
                          ordem.coluna === coluna.chave ? (ordem.desc ? "descending" : "ascending") : "none"
                        }
                      >
                        <button
                          type="button"
                          onClick={() => ordenarPor(coluna.chave)}
                          className={cn(
                            "inline-flex items-center gap-1 rounded transition-colors hover:text-foreground",
                            ordem.coluna === coluna.chave && "text-foreground",
                            coluna.numerica && "flex-row-reverse",
                          )}
                        >
                          {coluna.label}
                          <ArrowUpDown className="h-3 w-3 opacity-60" />
                        </button>
                      </th>
                    ))}
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Submercado
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginadas.map((usina, indice) => (
                    <tr key={usina.usina_id} className="group border-b border-border/60 last:border-0 hover:bg-accent/40">
                      <td className="tabular px-4 py-2.5 text-right text-xs text-muted-foreground">
                        {pagina * PAGINA + indice + 1}
                      </td>
                      <td className="px-4 py-2.5">
                        <Link
                          to={`/usinas/${usina.usina_id}`}
                          className="flex items-center gap-2 rounded font-medium text-foreground hover:text-primary"
                        >
                          {usina.fonte === "solar" ? (
                            <Sun className="h-3.5 w-3.5 shrink-0 text-solar" aria-label="Solar" />
                          ) : (
                            <Wind className="h-3.5 w-3.5 shrink-0 text-wind" aria-label="Eólica" />
                          )}
                          <span className="truncate">{usina.nome}</span>
                        </Link>
                        {usina.nom_conjuntousina && (
                          <p className="mt-0.5 pl-5.5 text-[0.6875rem] text-muted-foreground">
                            Conjunto {usina.nom_conjuntousina}
                          </p>
                        )}
                      </td>
                      <td className="tabular px-4 py-2.5 text-right text-xs text-muted-foreground">
                        {fmtMW(usina.potencia_mw)}
                      </td>
                      <td className="px-4 py-2.5">
                        {typeof usina.total_corte_mwh === "number" ? (
                          <div className="flex items-center justify-end gap-2">
                            {/* A barra dá a comparação; o número dá o valor exato. */}
                            <span aria-hidden className="hidden h-1 w-16 overflow-hidden rounded-full bg-muted lg:block">
                              <span
                                className="block h-full rounded-full bg-energy/70"
                                style={{ width: `${Math.max(3, (usina.total_corte_mwh / maxCorteRecorte) * 100)}%` }}
                              />
                            </span>
                            <span className="tabular text-xs">{fmtMWh(usina.total_corte_mwh)}</span>
                          </div>
                        ) : (
                          <span className="tabular block text-right text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1.5">
                          {(() => {
                            const lacuna = lacunaDePld(usina)
                            if (!lacuna) return null
                            return (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <TriangleAlert className="h-3 w-3 shrink-0 cursor-default text-warning" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  {fmtInt(lacuna.faltantes)} de {fmtInt(lacuna.total)} intervalos de restrição
                                  ({lacuna.share.toFixed(0)}%) estão sem PLD. A perda financeira desta usina está
                                  subestimada.
                                </TooltipContent>
                              </Tooltip>
                            )
                          })()}
                          <span className="tabular text-xs font-semibold text-loss">
                            {typeof usina.total_perda_reais === "number" ? fmtBRL(usina.total_perda_reais) : "—"}
                          </span>
                        </div>
                      </td>
                      <td className="tabular px-4 py-2.5 text-right text-xs font-medium text-recoverable">
                        {typeof usina.total_perda_ressarcivel_reais === "number"
                          ? fmtBRL(usina.total_perda_ressarcivel_reais)
                          : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className="text-[0.6875rem] font-normal">
                          {usina.submercado}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPaginas > 1 && (
              <nav className="mt-4 flex items-center justify-center gap-4" aria-label="Paginação">
                <Button variant="outline" size="sm" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>
                  Anterior
                </Button>
                <span className="tabular text-xs text-muted-foreground">
                  {pagina + 1} / {totalPaginas}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagina + 1 >= totalPaginas}
                  onClick={() => setPagina((p) => p + 1)}
                >
                  Próxima
                </Button>
              </nav>
            )}
          </>
        )}
      </main>

      <BuildFooter />
    </div>
  )
}

/**
 * Lista ao lado do mapa.
 *
 * O mapa mostra onde, a lista mostra quanto — e o hover liga os dois. Sem essa
 * ligação, um ponto no mapa é só um ponto: não dá para saber qual usina é sem
 * clicar, e a comparação entre elas fica impossível.
 */
function ListaSincronizada({
  usinas,
  destacada,
  onHover,
}: {
  usinas: UsinaOut[]
  destacada: string | null
  onHover: (id: string | null) => void
}) {
  const maxCorte = Math.max(...usinas.map((u) => Number(u.total_corte_mwh ?? 0)), 1)

  // Ordena aqui, e não herda a ordem da tabela: o título promete ranking por
  // energia cortada, e a tabela pode estar ordenada por qualquer outra coluna.
  const ordenadas = [...usinas].sort((a, b) => Number(b.total_corte_mwh ?? 0) - Number(a.total_corte_mwh ?? 0))

  return (
    <section className="panel flex flex-col overflow-hidden">
      <header className="border-b border-border px-4 py-3">
        <h2 className="panel-title">Ranking por energia cortada</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Passe o mouse para localizar no mapa.</p>
      </header>

      <ul className="divide-y divide-border overflow-y-auto" style={{ maxHeight: "30rem" }}>
        {ordenadas.map((usina, indice) => {
          const corte = Number(usina.total_corte_mwh ?? 0)
          const ativa = usina.usina_id === destacada
          return (
            <li key={usina.usina_id}>
              <Link
                to={`/usinas/${usina.usina_id}`}
                onMouseEnter={() => onHover(usina.usina_id)}
                onMouseLeave={() => onHover(null)}
                onFocus={() => onHover(usina.usina_id)}
                onBlur={() => onHover(null)}
                className={cn(
                  "block px-4 py-2.5 transition-colors",
                  ativa ? "bg-accent" : "hover:bg-accent/40",
                )}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
                    <span className="tabular w-4 shrink-0 text-right text-muted-foreground">{indice + 1}</span>
                    {usina.fonte === "solar" ? (
                      <Sun className="h-3 w-3 shrink-0 text-solar" />
                    ) : (
                      <Wind className="h-3 w-3 shrink-0 text-wind" />
                    )}
                    <span className="truncate">{usina.nome}</span>
                  </p>
                  <span className="tabular shrink-0 text-[0.6875rem] text-muted-foreground">
                    {typeof usina.total_corte_mwh === "number" ? fmtMWhCompacto(usina.total_corte_mwh) : "—"}
                  </span>
                </div>

                {/* Barra proporcional: compara as usinas entre si sem exigir leitura de número. */}
                <div className="mt-1.5 flex items-center gap-2 pl-5.5">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full transition-colors", ativa ? "bg-primary" : "bg-energy/70")}
                      style={{ width: `${Math.max(2, (corte / maxCorte) * 100)}%` }}
                    />
                  </div>
                  <span className="tabular shrink-0 text-[0.625rem] text-muted-foreground">
                    {fmtMW(usina.potencia_mw)}
                  </span>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function PlantCardMobile({ usina }: { usina: UsinaOut }) {
  return (
    <Link to={`/usinas/${usina.usina_id}`} className="flex items-center justify-between gap-3 p-3.5 hover:bg-accent/40">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          {usina.fonte === "solar" ? (
            <Sun className="h-3.5 w-3.5 shrink-0 text-solar" />
          ) : (
            <Wind className="h-3.5 w-3.5 shrink-0 text-wind" />
          )}
          <span className="truncate">{usina.nome}</span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {FONTE_LABELS[usina.fonte] ?? usina.fonte} · {fmtMW(usina.potencia_mw)} · {usina.submercado}
        </p>
        {typeof usina.total_corte_mwh === "number" && (
          <p className="tabular mt-0.5 text-[0.6875rem] text-muted-foreground">{fmtMWh(usina.total_corte_mwh)} cortados</p>
        )}
      </div>
      {typeof usina.total_perda_reais === "number" && (
        <span className="tabular shrink-0 text-sm font-semibold text-loss">{fmtBRLCompacto(usina.total_perda_reais)}</span>
      )}
    </Link>
  )
}
