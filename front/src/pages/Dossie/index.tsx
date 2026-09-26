import { useMemo, useRef, useState } from "react"
import { Check, Copy, Download, FileText, Loader2, TriangleAlert } from "lucide-react"
import Markdown from "react-markdown"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ErrorState } from "@/components/shared/ErrorState"
import { PageHeader } from "@/components/shared/PageHeader"
import { StatTile } from "@/components/shared/StatTile"
import { usePlantContext } from "@/components/shell/PlantShell"
import { useCriarPleito, useEventosPleito, useExportarPleito, useFranquiaStatus } from "@/hooks/useRegulatorio"
import { fmtBRL, fmtDate, fmtMWh, fmtNum } from "@/lib/formatters"
import { cn } from "@/lib/utils"
import type { EventoPleito } from "@/types/regulatorio"

const canalLabel: Record<string, string> = {
  PROTOCOLO_ONS: "Protocolo ONS",
  TERMO_COMPROMISSO_LEI_15269: "Termo Lei 15.269",
  NENHUM: "Sem pleito",
}

/** Motivo regulatorio do ONS: cor fixa por categoria, igual ao resto do app. */
const motivoStyle: Record<string, string> = {
  REL: "border-chart-1/40 bg-chart-1/15 text-chart-1",
  CNF: "border-chart-2/40 bg-chart-2/15 text-chart-2",
  ENE: "border-border bg-muted text-muted-foreground",
}

function base64ToBlob(base64: string, contentType: string) {
  const binary = window.atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: contentType })
}

function triggerDownload(fileName: string, content: string, contentType: string, encoding: "utf-8" | "base64" = "utf-8") {
  const blob = encoding === "base64" ? base64ToBlob(content, contentType) : new Blob([content], { type: contentType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function valorPerdaOportunidade(ev: EventoPleito) {
  return ev.valor_perda_oportunidade_reais ?? ev.valor_intervalos_reais ?? ev.energia_restringida_mwh * ev.pld_reais_mwh
}

/**
 * Rótulo curto para a coluna de franquia.
 *
 * O backend devolve a explicação inteira em `status_franquia_label` ("Não
 * consome franquia anual: compensação por termo/regramento específico fora da
 * franquia REL"). Numa célula de tabela isso estoura a largura e empurra as
 * colunas de dinheiro para fora da tela — o texto completo fica no tooltip.
 */
const FRANQUIA_CURTA: Record<string, string> = {
  dentro_franquia: "Dentro da franquia",
  fora_franquia: "Fora da franquia",
  nao_aplicavel_cnf_termo: "Fora da franquia REL",
  nao_aplicavel_inelegivel: "Não se aplica",
}

function franquiaCurta(ev: EventoPleito) {
  return FRANQUIA_CURTA[ev.status_franquia] ?? ev.status_franquia_label ?? ev.status_franquia
}

function franquiaLabel(ev: EventoPleito) {
  return ev.status_franquia_label || ev.status_franquia
}

/**
 * Prazo de protocolo.
 *
 * O backend devolve dias restantes, que fica NEGATIVO quando a janela já
 * fechou. Estampar "-162d" não comunica nada: o que importa é que o prazo
 * venceu, e há quanto tempo. O selo de Termo vem antes porque, quando o evento
 * é elegível ao Termo da Lei 15.269, o prazo do protocolo ONS deixa de ser a
 * restrição.
 */
function prazoDoEvento(ev: EventoPleito) {
  const dias = ev.janela_prazo.dias_restantes_protocolo_ons

  if (ev.janela_prazo.elegivel_termo) {
    return { texto: "Termo", variante: "secondary" as const, detalhe: "Elegível ao Termo da Lei 15.269/2025." }
  }
  if (dias < 0) {
    return {
      texto: "Vencido",
      variante: "destructive" as const,
      detalhe: `A janela de protocolo no ONS fechou há ${Math.abs(dias)} dias.`,
    }
  }
  if (dias <= 7) {
    return { texto: `${dias} d`, variante: "destructive" as const, detalhe: "Menos de uma semana para protocolar." }
  }
  return { texto: `${dias} d`, variante: "secondary" as const, detalhe: "Dias restantes para protocolar no ONS." }
}

export default function Dossie() {
  const { id, range: dateRange } = usePlantContext()
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [motivoFilter, setMotivoFilter] = useState<"todos" | "REL" | "CNF" | "ENE">("todos")
  const [onlyEligible, setOnlyEligible] = useState(true)
  const [minValue, setMinValue] = useState("")
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const [copied, setCopied] = useState(false)
  const [generationFeedback, setGenerationFeedback] = useState<{ visible: boolean; message: string; cacheHit?: boolean }>({
    visible: false,
    message: "",
  })
  const pleitoRef = useRef<HTMLDivElement | null>(null)

  const { data, isLoading, error } = useEventosPleito(id, dateRange.inicio, dateRange.fim, dateRange.ready)
  const ano = useMemo(() => dateRange.inicio ? new Date(dateRange.inicio).getFullYear() : new Date().getFullYear(), [dateRange.inicio])
  const franquiaStatus = useFranquiaStatus(id, ano)
  const criarPleito = useCriarPleito(id)
  const exportarPleito = useExportarPleito()

  // O período agora vive no cabeçalho do app: ao trocá-lo, a seleção de eventos
  // e o rascunho anterior deixam de valer.
  const janela = `${dateRange.inicio}|${dateRange.fim}`
  const [janelaAplicada, setJanelaAplicada] = useState(janela)
  if (janela !== janelaAplicada) {
    setJanelaAplicada(janela)
    setSelectedIds([])
    setDraft("")
  }

  const eventos = useMemo(() => data?.eventos ?? [], [data])
  const filteredEventos = useMemo(() => {
    const min = Number(minValue)
    return eventos.filter((ev) => {
      if (onlyEligible && !ev.elegivel) return false
      if (motivoFilter !== "todos" && ev.razao_classificada_ons !== motivoFilter) return false
      if (Number.isFinite(min) && min > 0 && ev.valor_pleitavel_reais < min) return false
      return true
    })
  }, [eventos, onlyEligible, motivoFilter, minValue])

  const selectedEventos = useMemo(
    () => eventos.filter((ev) => selectedIds.includes(ev.evento_id)).sort((a, b) => b.valor_pleitavel_reais - a.valor_pleitavel_reais),
    [eventos, selectedIds],
  )
  const selectedTotal = selectedEventos.reduce((acc, ev) => acc + ev.valor_pleitavel_reais, 0)
  const selectedEnergia = selectedEventos.reduce((acc, ev) => acc + ev.energia_ressarcivel_mwh, 0)
  const selectedCanal = selectedEventos[0]?.canal_recomendado ?? "PROTOCOLO_ONS"
  const canalMixed = new Set(selectedEventos.map((ev) => ev.canal_recomendado)).size > 1

  /**
   * Eventos cuja janela de protocolo no ONS já fechou e que também não são
   * elegíveis ao Termo. O front NÃO bloqueia a geração — quem decide o que
   * ainda cabe é o jurídico —, mas deixar isso invisível faria alguém montar um
   * pleito que não tem mais como ser protocolado.
   */
  const selecionadosVencidos = selectedEventos.filter(
    (ev) => !ev.janela_prazo.elegivel_termo && ev.janela_prazo.dias_restantes_protocolo_ons < 0,
  )
  const pleitoMarkdown = draft || criarPleito.data?.markdown_gerado || ""
  const isGeneratingPleito = criarPleito.isPending || generationFeedback.visible

  const toggleSelected = (eventId: string, checked: boolean | "indeterminate") => {
    setSelectedIds((prev) => {
      if (checked === true) return prev.includes(eventId) ? prev : [...prev, eventId]
      return prev.filter((id) => id !== eventId)
    })
  }

  const selecionarElegiveis = () => {
    setSelectedIds(filteredEventos.filter((ev) => ev.elegivel && ev.valor_pleitavel_reais > 0).map((ev) => ev.evento_id))
  }

  const gerarPleito = (eventosIds = selectedIds, canal = selectedCanal) => {
    const startedAt = Date.now()
    setDraft("")
    setEditing(false)
    setGenerationFeedback({
      visible: true,
      message: "Estruturando o pleito com os eventos selecionados…",
    })
    window.setTimeout(() => pleitoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50)

    criarPleito.mutate(
      { eventos_ids: eventosIds, canal, inicio: dateRange.inicio, fim: dateRange.fim },
      {
        onSuccess: (res) => {
          const cacheHit = Boolean((res.metadados_json?.cache_ia as { hit?: boolean } | undefined)?.hit)
          const elapsed = Date.now() - startedAt
          const minVisibleMs = cacheHit ? 900 : 1200
          const maxCachedMs = 5000
          const delayMs = cacheHit ? Math.max(0, Math.min(minVisibleMs - elapsed, maxCachedMs - elapsed)) : Math.max(0, minVisibleMs - elapsed)
          if (cacheHit) {
            setGenerationFeedback({
              visible: true,
              cacheHit: true,
              message: "Pleito encontrado em cache. Preparando visualização…",
            })
          }
          window.setTimeout(() => {
            setDraft(res.markdown_gerado)
            setEditing(false)
            setGenerationFeedback({ visible: false, message: "", cacheHit })
            window.setTimeout(() => pleitoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50)
          }, delayMs)
        },
        onError: () => {
          setGenerationFeedback({ visible: false, message: "" })
        },
      },
    )
  }

  const exportar = (formato: "docx" | "pdf" | "md" | "json") => {
    if (!criarPleito.data?.pleito_id) return
    exportarPleito.mutate(
      { pleitoId: criarPleito.data.pleito_id, formato },
      { onSuccess: (res) => triggerDownload(res.file_name, res.content, res.content_type, res.content_encoding ?? "utf-8") },
    )
  }

  const copiar = () => {
    navigator.clipboard.writeText(pleitoMarkdown)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Ressarcimento"
        title="Pleito de ressarcimento por evento"
        description="Selecione os eventos elegíveis, confira franquia, PLD e prazo, e gere o documento do pleito para revisão humana."
        meta={
          franquiaStatus.data && (
            <Badge variant="outline" className="font-normal">
              Franquia {franquiaStatus.data.ano}: {fmtNum(franquiaStatus.data.franquia_horas)} h · restam{" "}
              {fmtNum(franquiaStatus.data.horas_restantes)} h
            </Badge>
          )
        }
      />

      {isLoading && !data && <Skeleton className="h-64 w-full" />}
      {error && !data && <ErrorState error={error} />}

      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="Valor pleitável total" value={fmtBRL(data.valor_total_pleitavel_reais)} accent="recoverable" size="lg" />
            <StatTile label="Energia ressarcível" value={fmtMWh(data.energia_ressarcivel_total_mwh)} accent="energy" size="lg" />
            <StatTile label="Eventos elegíveis" value={`${fmtNum(data.eventos_elegiveis)} / ${fmtNum(data.total_eventos)}`} size="lg" />
            <StatTile label="Franquia usada" value={`${fmtNum(data.franquia.horas_definidas)} h`} size="lg" />
          </div>

          {(pleitoMarkdown || isGeneratingPleito || criarPleito.error || exportarPleito.error) && (
            <Card ref={pleitoRef} className="scroll-mt-20 border-primary/30 bg-primary/[0.04]">
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base font-semibold">Pleito de ressarcimento</CardTitle>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Estruturação feita a partir dos dados reais do evento, com elegibilidade, franquia, PLD, prazo e canal calculados conforme Lei 15.269/2025, REN ANEEL nº 1.030/2022 e Procedimentos de Rede do ONS — Submódulo 5.13. Revisão humana e jurídica continua obrigatória antes do protocolo.
                    </p>
                  </div>
                  {criarPleito.data?.canal && <Badge variant="secondary">{canalLabel[criarPleito.data.canal] ?? criarPleito.data.canal}</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={!pleitoMarkdown} onClick={copiar}>{copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}{copied ? "Copiado" : "Copiar"}</Button>
                  <Button size="sm" variant="outline" disabled={!criarPleito.data?.pleito_id || exportarPleito.isPending} onClick={() => exportar("docx")}><Download className="mr-2 h-4 w-4" />Exportar DOCX</Button>
                  <Button size="sm" variant="outline" disabled={!criarPleito.data?.pleito_id || exportarPleito.isPending} onClick={() => exportar("pdf")}><Download className="mr-2 h-4 w-4" />Exportar PDF</Button>
                  <Button size="sm" variant="ghost" disabled={!criarPleito.data?.pleito_id || exportarPleito.isPending} onClick={() => exportar("json")}><Download className="mr-2 h-4 w-4" />JSON técnico</Button>
                  <Button size="sm" variant="outline" disabled={!pleitoMarkdown} onClick={() => setEditing((v) => !v)}>{editing ? "Preview" : "Editar"}</Button>
                </div>
                {criarPleito.error && <ErrorState error={criarPleito.error} />}
                {exportarPleito.error && <ErrorState error={exportarPleito.error} />}
                {isGeneratingPleito ? (
                  <div className="relative overflow-hidden rounded-lg border border-primary/25 bg-primary/[0.04] p-6">
                    <div className="absolute inset-x-0 top-0 h-0.5 animate-pulse bg-primary" />
                    <div className="flex min-h-64 flex-col items-center justify-center text-center">
                      <div className="mb-4 rounded-full border border-primary/30 bg-primary/10 p-4">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      </div>
                      <h3 className="text-lg font-semibold">Gerando pleito de ressarcimento</h3>
                      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                        {generationFeedback.message || "Calculando elegibilidade, franquia, PLD, prazos e preparando a redação para revisão humana."}
                      </p>
                      <div className="mt-5 grid w-full max-w-2xl grid-cols-1 gap-2 text-left text-xs text-muted-foreground sm:grid-cols-3">
                        <div className="rounded-md border bg-background/70 p-3">Eventos e franquia validados</div>
                        <div className="rounded-md border bg-background/70 p-3">Canal regulatório definido</div>
                        <div className="rounded-md border bg-background/70 p-3">{generationFeedback.cacheHit ? "Contexto da usina reaproveitado em até 5s" : "IA usando o contexto da usina para redigir"}</div>
                      </div>
                    </div>
                  </div>
                ) : editing ? (
                  <textarea className="h-[420px] w-full rounded-md border border-border bg-background p-3 font-mono text-xs leading-relaxed" value={draft} onChange={(e) => setDraft(e.target.value)} />
                ) : (
                  <ScrollArea className="h-[420px] rounded-md border bg-background p-4">
                    <div className="markdown">
                      {pleitoMarkdown ? <Markdown>{pleitoMarkdown}</Markdown> : <p className="text-sm text-muted-foreground">Gere um pleito para visualizar o documento.</p>}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Eventos de Pleito</CardTitle>
              <p className="text-xs text-muted-foreground">Elegibilidade, franquia, PLD, prazo e canal são calculados antes da redação por IA. “Perda oportun.” mostra a perda de oportunidade de geração de receita; “Valor pleitável” pode zerar se REL ainda estiver dentro da franquia anual.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm" variant={onlyEligible ? "default" : "outline"} onClick={() => setOnlyEligible((v) => !v)}>
                  Só elegíveis
                </Button>

                {/* Controle segmentado: deixa claro que as quatro opções são
                    excludentes entre si, e que não têm relação com o botão acima. */}
                <div className="flex items-center rounded-md border border-border p-0.5" role="group" aria-label="Motivo do corte">
                  {(["todos", "REL", "CNF", "ENE"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMotivoFilter(m)}
                      aria-pressed={motivoFilter === m}
                      className={cn(
                        "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                        motivoFilter === m ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {m === "todos" ? "Todos" : m}
                    </button>
                  ))}
                </div>
                <Input className="w-52" type="number" value={minValue} onChange={(e) => setMinValue(e.target.value)} placeholder="Valor mínimo R$" />
                <Button size="sm" onClick={selecionarElegiveis}>Selecionar todos elegíveis</Button>
                <span className="text-xs text-muted-foreground">Selecionados: {selectedIds.length}</span>
              </div>

              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead></TableHead>
                      <TableHead>Data/hora</TableHead>
                      <TableHead>Motivo</TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead className="text-right">Energia restr.</TableHead>
                      <TableHead>Franquia</TableHead>
                      <TableHead className="text-right">Ressarcível</TableHead>
                      <TableHead className="text-right">PLD</TableHead>
                      <TableHead className="text-right">Perda oportun.</TableHead>
                      <TableHead className="text-right">Valor pleitável</TableHead>
                      <TableHead>Prazo</TableHead>
                      <TableHead>Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEventos.map((ev) => (
                      <TableRow key={ev.evento_id} className={ev.valor_pleitavel_reais > 0 ? "bg-recoverable/[0.06]" : ""}>
                        <TableCell><Checkbox checked={selectedIds.includes(ev.evento_id)} disabled={!ev.elegivel} onCheckedChange={(v) => toggleSelected(ev.evento_id, v)} /></TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{fmtDate(ev.timestamp)}</TableCell>
                        <TableCell><Badge variant="outline" className={motivoStyle[ev.razao_classificada_ons] ?? ""}>{ev.razao_classificada_ons}</Badge></TableCell>
                        <TableCell className="text-xs">{ev.origem}</TableCell>
                        <TableCell className="tabular text-right text-xs">{fmtMWh(ev.energia_restringida_mwh)}</TableCell>
                        <TableCell className="text-xs">
                          <span
                            className="block max-w-36 truncate text-muted-foreground"
                            title={franquiaLabel(ev)}
                          >
                            {franquiaCurta(ev)}
                          </span>
                        </TableCell>
                        <TableCell className="tabular text-right text-xs">{fmtMWh(ev.energia_ressarcivel_mwh)}</TableCell>
                        <TableCell className="tabular text-right text-xs">{fmtBRL(ev.pld_reais_mwh)}/MWh</TableCell>
                        <TableCell className="tabular text-right text-xs">{fmtBRL(valorPerdaOportunidade(ev))}</TableCell>
                        <TableCell className="tabular text-right text-xs font-semibold">
                          {ev.elegivel ? (
                            <div>
                              <div>{fmtBRL(ev.valor_pleitavel_reais)}</div>
                              {ev.valor_pleitavel_reais === 0 && ev.status_franquia === "dentro_franquia" && (
                                <div className="text-[10px] font-normal text-muted-foreground">zerado pela franquia REL</div>
                              )}
                            </div>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const prazo = prazoDoEvento(ev)
                            return (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant={prazo.variante} className="cursor-default">
                                    {prazo.texto}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>{prazo.detalhe}</TooltipContent>
                              </Tooltip>
                            )
                          })()}
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" disabled={!ev.elegivel || isGeneratingPleito} onClick={() => gerarPleito([ev.evento_id], ev.canal_recomendado)}>
                            Gerar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredEventos.length === 0 && (
                      <TableRow><TableCell colSpan={12} className="py-6 text-center text-sm text-muted-foreground">Nenhum evento encontrado.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Seleção para o pleito</CardTitle>
              <p className="text-xs text-muted-foreground">Um pleito de ressarcimento = um canal. Separe Protocolo ONS e Termo Lei 15.269 em documentos diferentes.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StatTile label="Eventos selecionados" value={`${selectedEventos.length}`} />
                <StatTile label="Valor pleitável" value={fmtBRL(selectedTotal)} accent="recoverable" />
                <StatTile label="Energia" value={fmtMWh(selectedEnergia)} accent="energy" />
              </div>
              {canalMixed && <Badge variant="destructive">Há canais mistos selecionados; gere pleitos separados por canal.</Badge>}

              {selecionadosVencidos.length > 0 && (
                <div className="flex items-start gap-2.5 rounded-lg border border-warning/35 bg-warning/[0.07] px-3.5 py-2.5">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {fmtNum(selecionadosVencidos.length)} de {fmtNum(selectedEventos.length)} eventos selecionados
                      estão com o prazo de protocolo no ONS vencido.
                    </span>{" "}
                    {selectedCanal === "TERMO_COMPROMISSO_LEI_15269" ? (
                      <>
                        O canal recomendado é o Termo da Lei 15.269/2025, mas a API não marca esses eventos como
                        elegíveis ao Termo — os dois campos se contradizem. Confirme a via com o jurídico antes de
                        protocolar.
                      </>
                    ) : (
                      <>
                        Eles também não constam como elegíveis ao Termo da Lei 15.269/2025. O documento pode ser gerado
                        para análise, mas confirme com o jurídico se ainda há via de pleito.
                      </>
                    )}
                  </p>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">Canal: {canalLabel[selectedCanal] ?? selectedCanal}</Badge>
                <Button size="sm" className="gap-2" disabled={!selectedIds.length || canalMixed || isGeneratingPleito} onClick={() => gerarPleito()}>
                  <FileText className="h-4 w-4" />
                  {isGeneratingPleito ? "Gerando…" : "Gerar pleito selecionado"}
                </Button>
              </div>
              <ScrollArea className="h-72 rounded-md border p-2">
                {selectedEventos.map((ev: EventoPleito) => (
                  <div key={ev.evento_id} className="mb-2 rounded-md border p-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{ev.evento_id}</span>
                      <span className="tabular font-semibold text-recoverable">{fmtBRL(ev.valor_pleitavel_reais)}</span>
                    </div>
                    <div className="text-muted-foreground">{canalLabel[ev.canal_recomendado] ?? ev.canal_recomendado} · {fmtMWh(ev.energia_ressarcivel_mwh)} · {franquiaCurta(ev)}</div>
                  </div>
                ))}
                {!selectedEventos.length && <p className="p-4 text-sm text-muted-foreground">Selecione eventos elegíveis acima.</p>}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
