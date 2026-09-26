import { useCallback, useState } from "react"
import { CartesianGrid, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Check, Play, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { ChartEmpty, ChartPanel, ChartTooltip, axisProps, gridProps, type SeriesConfig } from "@/components/charts/chart-kit"
import { useBessSimular } from "@/hooks/useFinanceiro"
import { fmtBRL, fmtBRLCompacto, fmtMWh, fmtNum } from "@/lib/formatters"
import type { BessOut } from "@/types/financeiro"

/**
 * Curva de dimensionamento.
 *
 * O simulador sozinho responde "e se eu puser 30 MW?" — o usuário tem que
 * adivinhar o número e arrastar sliders até achar algo. Esta curva responde a
 * pergunta que ele realmente tem: **qual tamanho de bateria vale a pena aqui**.
 *
 * Roda a mesma simulação do servidor para uma faixa de potências e mostra onde
 * o ganho por MW adicional desaba — o joelho da curva. Acima dele, cada MW a
 * mais custa igual e entrega cada vez menos.
 */

/**
 * Faixa varrida.
 *
 * Concentrada embaixo de propósito: em usina com corte frequente e raso, a
 * curva satura cedo — começar em 25 MW esconderia o joelho e recomendaria uma
 * bateria maior do que a necessária.
 */
const POTENCIAS = [5, 10, 20, 40, 75, 120]

const config: SeriesConfig = {
  receita_recuperada_reais: { label: "Receita recuperada", color: "var(--recoverable)", format: fmtBRL },
}

interface PontoCurva {
  potencia_mw: number
  receita_recuperada_reais: number
  energia_recuperada_mwh: number
  percentual_mitigado: number
  payback_anos: number | null
  /** Receita adicional por MW em relação ao ponto anterior da curva. */
  ganho_marginal_por_mw: number
}

interface Props {
  id: string
  inicio: string
  fim: string
  duracao: number
  eficiencia: number
  capex: number
  /** Aplica um dimensionamento da curva nos controles do simulador. */
  onAplicar: (potenciaMw: number) => void
}

export function CurvaDimensionamento({ id, inicio, fim, duracao, eficiencia, capex, onAplicar }: Props) {
  const { mutateAsync } = useBessSimular(id, inicio, fim)
  const [curva, setCurva] = useState<PontoCurva[]>([])
  const [rodando, setRodando] = useState(false)
  const [progresso, setProgresso] = useState(0)

  const rodar = useCallback(async () => {
    setRodando(true)
    setCurva([])
    setProgresso(0)

    const brutos: Array<{ potencia_mw: number; resultado: BessOut }> = []
    for (const [indice, potencia] of POTENCIAS.entries()) {
      try {
        const resultado = await mutateAsync({
          potencia_mw: potencia,
          duracao_horas: duracao,
          eficiencia: eficiencia / 100,
          // CAPEX escala linear com a potência, tomando o valor informado como
          // referência para 30 MW. É uma aproximação: na prática há custo fixo
          // de conexão e ganho de escala. Por isso o payback da curva serve para
          // comparar portes entre si, não como número de negociação.
          capex: capex > 0 ? capex * (potencia / 30) : undefined,
        })
        brutos.push({ potencia_mw: potencia, resultado })
      } catch {
        // Um ponto que falha não invalida a curva; ela segue com o que deu certo.
      }
      setProgresso(((indice + 1) / POTENCIAS.length) * 100)
    }

    // O ganho marginal é o que revela o joelho: quanto cada MW extra ainda traz.
    const pontos: PontoCurva[] = brutos.map(({ potencia_mw, resultado }, indice) => {
      const anterior = brutos[indice - 1]
      const deltaReceita =
        resultado.receita_recuperada_reais - (anterior?.resultado.receita_recuperada_reais ?? 0)
      const deltaPotencia = potencia_mw - (anterior?.potencia_mw ?? 0)
      return {
        potencia_mw,
        receita_recuperada_reais: resultado.receita_recuperada_reais,
        energia_recuperada_mwh: resultado.energia_recuperada_mwh,
        percentual_mitigado: resultado.percentual_mitigado,
        payback_anos: resultado.payback_anos ?? null,
        ganho_marginal_por_mw: deltaPotencia > 0 ? deltaReceita / deltaPotencia : 0,
      }
    })

    setCurva(pontos)
    setRodando(false)
  }, [mutateAsync, duracao, eficiencia, capex])

  /**
   * Joelho da curva: o último ponto em que o MW adicional ainda entrega pelo
   * menos 40% do que entregava no início. Depois dele, aumentar a bateria é
   * pagar caro por sobra de capacidade.
   */
  const joelho = (() => {
    const comGanho = curva.filter((p) => p.ganho_marginal_por_mw > 0)
    if (comGanho.length < 2) return null
    const referencia = comGanho[0].ganho_marginal_por_mw
    const uteis = comGanho.filter((p) => p.ganho_marginal_por_mw >= referencia * 0.4)
    return uteis.at(-1) ?? comGanho[0]
  })()

  // Joelho no primeiro ponto significa que a saturação começa antes da faixa
  // testada: a recomendação precisa dizer isso em vez de fingir precisão.
  const saturaAbaixoDaFaixa = joelho != null && joelho.potencia_mw === POTENCIAS[0]

  const melhorPayback = curva
    .filter((p) => p.payback_anos != null && p.payback_anos > 0)
    .sort((a, b) => (a.payback_anos ?? 0) - (b.payback_anos ?? 0))[0]

  return (
    <ChartPanel
      title="Qual tamanho de bateria vale a pena"
      description="Mesma janela de datas, várias potências. A curva mostra onde o MW adicional para de compensar."
      actions={
        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => void rodar()} disabled={rodando || !inicio}>
          <Play className="h-3.5 w-3.5" />
          {rodando ? "Calculando…" : "Levantar curva"}
        </Button>
      }
      empty={
        rodando ? (
          <div className="flex min-h-40 flex-col items-center justify-center gap-3 px-6">
            <p className="text-sm text-muted-foreground">
              Simulando {POTENCIAS.length} dimensionamentos no servidor, um de cada vez.
            </p>
            <Progress value={progresso} className="w-full max-w-sm" />
            <p className="tabular text-xs text-muted-foreground">{Math.round(progresso)}%</p>
          </div>
        ) : curva.length === 0 ? (
          <ChartEmpty
            title="Levante a curva para ver o dimensionamento recomendado"
            hint={`Roda a simulação para ${POTENCIAS.join(", ")} MW e aponta onde o retorno por MW começa a cair.`}
          />
        ) : undefined
      }
    >
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={curva} margin={{ top: 10, right: 20, bottom: 0, left: 12 }}>
          <CartesianGrid {...gridProps} />
          <XAxis
            dataKey="potencia_mw"
            {...axisProps}
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v: number) => `${v} MW`}
          />
          <YAxis {...axisProps} width={62} tickFormatter={(v: number) => fmtBRLCompacto(v)} />
          <Tooltip
            cursor={{ stroke: "var(--axis)", strokeWidth: 1 }}
            content={
              <ChartTooltip
                config={config}
                labelFormatter={(label) => `${label} MW · ${duracao} h`}
                footer={(row) =>
                  `${fmtMWh(Number(row.energia_recuperada_mwh ?? 0))} recuperados · ${fmtNum(Number(row.percentual_mitigado ?? 0))}% do corte mitigado`
                }
              />
            }
          />
          <Line
            type="monotone"
            dataKey="receita_recuperada_reais"
            stroke="var(--recoverable)"
            strokeWidth={2}
            dot={{ r: 3, fill: "var(--recoverable)" }}
            isAnimationActive={false}
          />
          {joelho && (
            <ReferenceDot
              x={joelho.potencia_mw}
              y={joelho.receita_recuperada_reais}
              r={7}
              fill="var(--primary)"
              stroke="var(--color-card)"
              strokeWidth={2}
            />
          )}
        </LineChart>
      </ResponsiveContainer>

      {joelho && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/[0.05] p-3.5">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Dimensionamento recomendado: {joelho.potencia_mw} MW · {duracao} h
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Recupera {fmtBRL(joelho.receita_recuperada_reais)} no período e mitiga{" "}
              {fmtNum(joelho.percentual_mitigado)}% do corte.{" "}
              {saturaAbaixoDaFaixa ? (
                <>
                  A curva já satura no menor porte testado — o corte desta usina é frequente e raso, e uma bateria
                  pequena captura quase tudo. O ponto ótimo provavelmente está <strong>abaixo de {joelho.potencia_mw} MW</strong>;
                  vale simular portes menores antes de fechar o dimensionamento.
                </>
              ) : (
                <>
                  Acima disso, cada MW adicional rende menos de 40% do que rendia no começo da curva
                  {melhorPayback && melhorPayback.potencia_mw !== joelho.potencia_mw && (
                    <> — o melhor payback da varredura ficou em {melhorPayback.potencia_mw} MW
                      {melhorPayback.payback_anos != null && `, com ${melhorPayback.payback_anos.toFixed(1)} anos`}</>
                  )}
                  .
                </>
              )}
            </p>
          </div>
          <Button size="sm" className="h-8 shrink-0 gap-1.5 text-xs" onClick={() => onAplicar(joelho.potencia_mw)}>
            <Check className="h-3.5 w-3.5" />
            Aplicar nos controles
          </Button>
        </div>
      )}

      {curva.length > 0 && capex > 0 && (
        <p className="mt-2 text-[0.6875rem] leading-relaxed text-muted-foreground">
          Premissa da varredura: o CAPEX informado ({fmtBRLCompacto(capex)}) é tratado como referência para 30 MW e
          escalado linearmente em cada ponto. Custo fixo de conexão e ganho de escala não entram — o payback aqui
          compara portes entre si, não serve como número de negociação.
        </p>
      )}
    </ChartPanel>
  )
}
