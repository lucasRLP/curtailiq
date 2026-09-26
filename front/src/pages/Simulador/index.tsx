import { useCallback, useEffect, useState } from "react"
import { Battery, RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Slider } from "@/components/ui/slider"
import { ErrorState } from "@/components/shared/ErrorState"
import { PageHeader } from "@/components/shared/PageHeader"
import { StatTile } from "@/components/shared/StatTile"
import { DataKindBadge, MetodoBadge } from "@/components/shared/Provenance"
import { usePlantContext } from "@/components/shell/PlantShell"
import { CurvaDimensionamento } from "@/pages/Simulador/CurvaDimensionamento"
import { DocumentoIA } from "@/components/shared/DocumentoIA"
import { useMemorandoBess } from "@/hooks/useOperacao"
import { useBessSimular } from "@/hooks/useFinanceiro"
import { useUsinaResumo } from "@/hooks/useUsinas"
import { fmtBRL, fmtBRLCompacto, fmtMWh, fmtPct } from "@/lib/formatters"
import { cn } from "@/lib/utils"
import type { BessOut, BessRequest } from "@/types/financeiro"

const PRESETS: Array<{ label: string; config: BessRequest }> = [
  { label: "30 MW · 4 h", config: { potencia_mw: 30, duracao_horas: 4, eficiencia: 0.85 } },
  { label: "50 MW · 4 h", config: { potencia_mw: 50, duracao_horas: 4, eficiencia: 0.85 } },
  { label: "100 MW · 2 h", config: { potencia_mw: 100, duracao_horas: 2, eficiencia: 0.88 } },
]

function Meter({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="tabular text-sm font-semibold text-recoverable">{fmtPct(value)}</span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className="h-full rounded-full bg-recoverable transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function ScenarioRow({ label, result, isActive }: { label: string; result?: BessOut | null; isActive?: boolean }) {
  const previsao = result?.dimensionamento_com_previsao
  return (
    <tr className={cn("border-b border-border/60 last:border-0", isActive && "bg-primary/[0.06]")}>
      <td className="px-4 py-2.5 text-xs font-medium">
        {label}
        {isActive && <span className="ml-2 text-[0.6875rem] font-normal text-primary">cenário atual</span>}
      </td>
      <td className="tabular px-4 py-2.5 text-right text-xs">{result ? fmtMWh(result.energia_recuperada_mwh) : "—"}</td>
      <td className="tabular px-4 py-2.5 text-right text-xs font-semibold text-recoverable">
        {result ? fmtBRL(result.receita_recuperada_reais) : "—"}
      </td>
      <td className="tabular px-4 py-2.5 text-right text-xs">{result ? fmtPct(result.percentual_mitigado) : "—"}</td>
      <td className="tabular px-4 py-2.5 text-right text-xs text-forecast">
        {previsao ? fmtBRL(previsao.perda_financeira_evitavel_prevista_reais) : "—"}
      </td>
      <td className="tabular px-4 py-2.5 text-right text-xs">
        {result?.payback_anos != null ? `${result.payback_anos.toFixed(1)} anos` : "—"}
      </td>
    </tr>
  )
}

export default function Simulador() {
  const { id, range } = usePlantContext()
  const resumo = useUsinaResumo(id, range.inicio, range.fim, range.ready)

  const [potencia, setPotencia] = useState(30)
  const [duracao, setDuracao] = useState(4)
  const [eficiencia, setEficiencia] = useState(85)
  const [capex, setCapex] = useState(120_000_000)

  const principal = useBessSimular(id, range.inicio, range.fim)
  const comparacao = useBessSimular(id, range.inicio, range.fim)
  const [resultadosPreset, setResultadosPreset] = useState<Record<string, BessOut>>({})

  const { mutate: simular } = principal
  const rodar = useCallback(() => {
    if (!range.ready) return
    simular({
      potencia_mw: potencia,
      duracao_horas: duracao,
      eficiencia: eficiencia / 100,
      capex: capex > 0 ? capex : undefined,
    })
  }, [simular, range.ready, potencia, duracao, eficiencia, capex])

  // Simula sozinho conforme o usuário mexe nos controles. O debounce evita
  // disparar uma requisição por pixel arrastado do slider.
  useEffect(() => {
    if (!range.ready) return
    const timer = window.setTimeout(rodar, 550)
    return () => window.clearTimeout(timer)
  }, [rodar, range.ready])

  /**
   * A comparação de cenários é sob demanda, não automática: cada preset é uma
   * simulação completa no servidor, e disparar três ao abrir a página deixaria
   * o usuário olhando esqueleto enquanto concorre com a própria simulação dele.
   * Rodam em sequência pelo mesmo motivo.
   */
  const { mutateAsync: simularPreset } = comparacao
  const [comparando, setComparando] = useState(false)
  // Estado, e não ref: a tela precisa re-renderizar quando a comparação passa a
  // se referir a um período diferente do selecionado.
  const [janelaComparada, setJanelaComparada] = useState("")

  const compararCenarios = useCallback(async () => {
    if (!range.ready || comparando) return
    setComparando(true)
    setResultadosPreset({})
    setJanelaComparada(`${range.inicio}|${range.fim}`)

    for (const preset of PRESETS) {
      try {
        const resultado = await simularPreset(preset.config)
        setResultadosPreset((anterior) => ({ ...anterior, [preset.label]: resultado }))
      } catch {
        // Um preset que falha não pode derrubar a comparação inteira.
      }
    }
    setComparando(false)
  }, [range.ready, range.inicio, range.fim, comparando, simularPreset])

  // Trocar o período invalida a comparação anterior.
  const janelaAtual = `${range.inicio}|${range.fim}`
  const comparacaoDesatualizada =
    Object.keys(resultadosPreset).length > 0 && janelaComparada !== janelaAtual

  const resultado = principal.data
  const previsao = resultado?.dimensionamento_com_previsao

  /**
   * Memorando de investimento.
   *
   * A simulação responde "quanto recupera"; quem decide o CAPEX precisa de um
   * documento com premissas, cenário recomendado e o que ainda não foi
   * validado. A IA escreve esse texto sobre os números já calculados — não
   * recalcula nada.
   */
  const memorando = useMemorandoBess(id)
  const gerarMemorando = () => {
    if (!resultado) return
    memorando.mutate({
      periodo: { inicio: range.inicio, fim: range.fim },
      cenario: {
        potencia_mw: potencia,
        duracao_horas: duracao,
        eficiencia: eficiencia / 100,
        capex: capex > 0 ? capex : undefined,
      },
      resultado: {
        energia_recuperada_mwh: resultado.energia_recuperada_mwh,
        receita_recuperada_reais: resultado.receita_recuperada_reais,
        percentual_mitigado: resultado.percentual_mitigado,
        payback_anos: resultado.payback_anos ?? null,
        perda_financeira_evitavel_prevista_reais: previsao?.perda_financeira_evitavel_prevista_reais ?? null,
        metodo_previsao: previsao?.metodo_previsao ?? null,
      },
    })
  }
  const rotuloAtual = `${potencia} MW · ${duracao} h · ${eficiencia}%`

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Simulador de bateria"
        title="Quanto uma bateria recuperaria"
        description="Dimensione um sistema de armazenamento e veja quanto da energia cortada ele teria guardado — no histórico apurado e na projeção à frente."
        actions={
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={rodar} disabled={principal.isPending}>
            <RotateCw className={cn("h-3.5 w-3.5", principal.isPending && "animate-spin")} />
            Recalcular
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,20rem)_1fr]">
        {/* ---- configuração ------------------------------------------------ */}
        <section className="panel h-fit space-y-5 p-4">
          <div>
            <h3 className="panel-title">Configurar bateria</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">O resultado recalcula sozinho.</p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((preset) => {
              const ativo = potencia === preset.config.potencia_mw && duracao === preset.config.duracao_horas
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setPotencia(preset.config.potencia_mw)
                    setDuracao(preset.config.duracao_horas)
                    setEficiencia(Math.round(preset.config.eficiencia * 100))
                  }}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[0.6875rem] font-medium transition-colors",
                    ativo
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {preset.label}
                </button>
              )
            })}
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="potencia" className="text-xs">Potência</Label>
                <span className="tabular text-sm font-semibold text-foreground">{potencia} MW</span>
              </div>
              <Slider id="potencia" min={5} max={200} step={5} value={[potencia]} onValueChange={([v]) => setPotencia(v)} />
            </div>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="duracao" className="text-xs">Duração</Label>
                <span className="tabular text-sm font-semibold text-foreground">{duracao} h</span>
              </div>
              <Slider id="duracao" min={1} max={8} step={0.5} value={[duracao]} onValueChange={([v]) => setDuracao(v)} />
              <p className="text-[0.6875rem] text-muted-foreground">
                Capacidade total: {(potencia * duracao).toLocaleString("pt-BR")} MWh
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="eficiencia" className="text-xs">Eficiência de ciclo</Label>
                <span className="tabular text-sm font-semibold text-foreground">{eficiencia}%</span>
              </div>
              <Slider id="eficiencia" min={70} max={98} step={1} value={[eficiencia]} onValueChange={([v]) => setEficiencia(v)} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="capex" className="text-xs">CAPEX (opcional, para payback)</Label>
              <Input
                id="capex"
                type="text"
                inputMode="numeric"
                value={capex > 0 ? new Intl.NumberFormat("pt-BR").format(capex) : ""}
                onChange={(event) => {
                  const bruto = event.target.value.replace(/\D/g, "")
                  setCapex(bruto ? Number(bruto) : 0)
                }}
                className="tabular h-8 text-sm"
                placeholder="R$ 0"
              />
            </div>
          </div>

          {resumo.data && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs">
              <p className="eyebrow mb-1.5">Base do período</p>
              <p className="text-muted-foreground">
                Energia cortada: <span className="font-medium text-foreground">{fmtMWh(resumo.data.total_corte_mwh)}</span>
              </p>
              <p className="mt-0.5 text-muted-foreground">
                Perda projetada 30 d:{" "}
                <span className="font-medium text-foreground">{fmtBRL(resumo.data.perda_esperada_30d.valor_reais)}</span>
              </p>
            </div>
          )}
        </section>

        {/* ---- resultado --------------------------------------------------- */}
        <div className="space-y-5">
          {principal.error && <ErrorState error={principal.error} />}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatTile
              label="Receita recuperada no período"
              value={resultado ? fmtBRLCompacto(resultado.receita_recuperada_reais) : "—"}
              accent="recoverable"
              size="lg"
              isLoading={principal.isPending && !resultado}
              sub={<DataKindBadge kind="historico" />}
            />
            <StatTile
              label={`Perda evitável projetada · ${previsao?.horizonte_dias ?? 30} dias`}
              value={previsao ? fmtBRLCompacto(previsao.perda_financeira_evitavel_prevista_reais) : "—"}
              accent="forecast"
              size="lg"
              isLoading={principal.isPending && !resultado}
              sub={
                previsao ? (
                  <span className="flex flex-wrap items-center gap-1.5">
                    <DataKindBadge kind="previsao" />
                    <MetodoBadge metodo={previsao.metodo_previsao} />
                  </span>
                ) : (
                  "Projeção indisponível para este cenário."
                )
              }
            />
            <StatTile
              label="Payback estimado"
              value={resultado?.payback_anos != null ? `${resultado.payback_anos.toFixed(1)} anos` : "—"}
              accent="neutral"
              size="lg"
              isLoading={principal.isPending && !resultado}
              sub={capex > 0 ? `Sobre CAPEX de ${fmtBRLCompacto(capex)}` : "Informe o CAPEX para calcular"}
            />
          </div>

          <section className="panel space-y-4 p-4">
            <div className="flex items-center gap-2">
              <Battery className="h-4 w-4 text-primary" />
              <h3 className="panel-title">O que este cenário captura</h3>
            </div>

            {principal.isPending && !resultado ? (
              <div className="space-y-3">
                <Skeleton className="h-2 w-full" />
                <Skeleton className="h-2 w-full" />
              </div>
            ) : resultado ? (
              <div className="space-y-4">
                <Meter value={resultado.percentual_mitigado} label="Do corte do período que a bateria teria mitigado" />
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-border pt-3 text-xs sm:grid-cols-4">
                  <div>
                    <dt className="text-muted-foreground">Energia recuperada</dt>
                    <dd className="tabular mt-0.5 font-semibold">{fmtMWh(resultado.energia_recuperada_mwh)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Capacidade instalada</dt>
                    <dd className="tabular mt-0.5 font-semibold">{(potencia * duracao).toLocaleString("pt-BR")} MWh</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Perda energética projetada</dt>
                    <dd className="tabular mt-0.5 font-semibold text-forecast">
                      {previsao ? fmtMWh(previsao.energia_perdida_prevista_mwh) : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Energia recuperável projetada</dt>
                    <dd className="tabular mt-0.5 font-semibold text-forecast">
                      {previsao ? fmtMWh(previsao.energia_recuperavel_prevista_mwh) : "—"}
                    </dd>
                  </div>
                </dl>
                {resultado.receita_recuperada_reais <= 0 && previsao && previsao.perda_financeira_evitavel_prevista_reais > 0 && (
                  <p className="rounded-md border border-border bg-muted/40 p-2.5 text-xs leading-relaxed text-muted-foreground">
                    No histórico selecionado a bateria não teria recuperado receita — não houve corte com PLD suficiente na
                    janela. O caso de investimento aqui está na projeção à frente:{" "}
                    <span className="font-medium text-forecast">{fmtBRL(previsao.perda_financeira_evitavel_prevista_reais)}</span>.
                  </p>
                )}
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">Ajuste os controles para simular.</p>
            )}
          </section>

          <CurvaDimensionamento
            id={id}
            inicio={range.inicio}
            fim={range.fim}
            duracao={duracao}
            eficiencia={eficiencia}
            capex={capex}
            onAplicar={setPotencia}
          />

          <DocumentoIA
            titulo="Memorando de decisão de investimento"
            descricao="O documento que acompanha o pedido de CAPEX: cenário recomendado, premissas, o que a bateria recupera e o que ainda precisa ser validado."
            rotuloAcao="Gerar memorando"
            rota="POST /api/usinas/{id}/documentos/memorando-bess"
            nomeArquivo={`memorando-bess-${id}.md`}
            avisoRevisao="Texto redigido por IA sobre números calculados pelo simulador. Revisão técnica e financeira obrigatória antes de circular internamente ou levar a comitê."
            consome={[
              "cenario: potência, duração, eficiência, CAPEX",
              "resultado: energia e receita recuperadas",
              "percentual mitigado e payback",
              "perda evitável projetada e método do modelo",
              "curva de dimensionamento, quando levantada",
            ]}
            base={[
              { label: "Cenário", valor: rotuloAtual },
              {
                label: "Receita recuperada no período",
                valor: resultado ? fmtBRL(resultado.receita_recuperada_reais) : "—",
              },
              {
                label: "Energia recuperada",
                valor: resultado ? fmtMWh(resultado.energia_recuperada_mwh) : "—",
              },
              {
                label: "Corte mitigado",
                valor: resultado ? fmtPct(resultado.percentual_mitigado) : "—",
              },
              {
                label: "Perda evitável projetada",
                valor: previsao ? fmtBRL(previsao.perda_financeira_evitavel_prevista_reais) : "—",
              },
              {
                label: "Payback",
                valor: resultado?.payback_anos != null ? `${resultado.payback_anos.toFixed(1)} anos` : "—",
              },
              { label: "CAPEX considerado", valor: capex > 0 ? fmtBRLCompacto(capex) : "não informado" },
            ]}
            markdown={memorando.data?.markdown}
            modelo={memorando.data?.modelo}
            isPending={memorando.isPending}
            error={memorando.error}
            onGerar={gerarMemorando}
            disabled={!resultado}
          />

          <section className="panel overflow-hidden">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
              <div>
                <h3 className="panel-title">Comparação de cenários</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {comparacaoDesatualizada
                    ? "O período mudou desde a última comparação. Rode de novo para atualizar."
                    : "Mesma janela de datas, dimensionamentos diferentes."}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => void compararCenarios()}
                disabled={comparando || !range.ready}
              >
                <RotateCw className={cn("h-3.5 w-3.5", comparando && "animate-spin")} />
                {comparando ? "Comparando…" : "Comparar cenários"}
              </Button>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Cenário</th>
                    <th className="px-4 py-2 text-right font-medium">Energia recuperada</th>
                    <th className="px-4 py-2 text-right font-medium">Receita recuperada</th>
                    <th className="px-4 py-2 text-right font-medium">Corte mitigado</th>
                    <th className="px-4 py-2 text-right font-medium">Evitável projetado</th>
                    <th className="px-4 py-2 text-right font-medium">Payback</th>
                  </tr>
                </thead>
                <tbody>
                  <ScenarioRow label={rotuloAtual} result={resultado} isActive />
                  {PRESETS.map((preset) => (
                    <ScenarioRow key={preset.label} label={preset.label} result={resultadosPreset[preset.label]} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
