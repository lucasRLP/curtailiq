import type { SeriePerdaItem } from "@/types/financeiro"
import type { PrevisaoRiscoItem } from "@/types/usinas"

/**
 * A série de perdas vem em intervalos de 30 min: uma janela de 6 meses passa de
 * 8.000 pontos. Jogar isso direto no Recharts trava a página e o gráfico vira
 * uma mancha — então agregamos por dia antes de desenhar.
 */

export interface PontoDiario {
  dia: string
  perda_reais: number
  energia_mwh: number
  intervalos: number
}

/**
 * @param janela Período selecionado, para preencher os dias sem evento.
 *
 * Os dias sem restrição precisam existir na série com valor zero. Sem isso o
 * eixo vira categórico e espaça oito dias esparsos como se fossem consecutivos
 * — o gráfico passa a mentir sobre quando a perda aconteceu.
 */
export function agruparPorDia(serie: SeriePerdaItem[], janela?: { inicio?: string; fim?: string }): PontoDiario[] {
  const mapa = new Map<string, PontoDiario>()

  for (const item of serie) {
    const dia = item.timestamp.slice(0, 10)
    const atual = mapa.get(dia) ?? { dia, perda_reais: 0, energia_mwh: 0, intervalos: 0 }
    atual.perda_reais += Number(item.perda_reais || 0)
    atual.energia_mwh += Number(item.energia_restringida_mwh || 0)
    atual.intervalos += 1
    mapa.set(dia, atual)
  }

  if (mapa.size === 0) return []

  const dias = [...mapa.keys()].sort()
  const primeiro = janela?.inicio?.slice(0, 10) ?? dias[0]
  const ultimo = janela?.fim?.slice(0, 10) ?? dias[dias.length - 1]

  const inicio = new Date(`${primeiro < dias[0] ? primeiro : dias[0]}T00:00:00`)
  const fim = new Date(`${ultimo > dias[dias.length - 1] ? ultimo : dias[dias.length - 1]}T00:00:00`)

  // Guarda contra janelas absurdas (parâmetro inválido, relógio errado).
  const totalDias = Math.round((fim.getTime() - inicio.getTime()) / 86_400_000) + 1
  if (!Number.isFinite(totalDias) || totalDias <= 0 || totalDias > 1100) {
    return [...mapa.values()].sort((a, b) => a.dia.localeCompare(b.dia))
  }

  const completa: PontoDiario[] = []
  for (let i = 0; i < totalDias; i += 1) {
    const data = new Date(inicio.getTime() + i * 86_400_000)
    const dia = data.toISOString().slice(0, 10)
    completa.push(mapa.get(dia) ?? { dia, perda_reais: 0, energia_mwh: 0, intervalos: 0 })
  }

  return completa
}

export interface FatiaRazao {
  chave: string
  razao: string
  valor: number
  share: number
}

/** Divisão da perda por razão de restrição, já ordenada e com participação. */
export function fatiasPorRazao(porRazao: Record<string, number>, rotulos: Record<string, string>): FatiaRazao[] {
  const entradas = Object.entries(porRazao ?? {}).filter(([, valor]) => Number(valor) > 0)
  const total = entradas.reduce((acc, [, valor]) => acc + Number(valor), 0)
  if (!total) return []

  return entradas
    .map(([chave, valor]) => ({
      chave,
      razao: rotulos[chave] ?? chave,
      valor: Number(valor),
      share: (Number(valor) / total) * 100,
    }))
    .sort((a, b) => b.valor - a.valor)
}

/**
 * Maiores intervalos de restrição do período. Usado quando o backend não
 * devolve eventos agregados — melhor mostrar os picos reais do que nada.
 */
export function maioresIntervalos(serie: SeriePerdaItem[], limite = 6): SeriePerdaItem[] {
  return [...serie].sort((a, b) => Number(b.perda_reais || 0) - Number(a.perda_reais || 0)).slice(0, limite)
}

/* ---------------------------------------------------------------------------
   Janelas de corte a partir da previsão horária.
   ------------------------------------------------------------------------ */

export interface JanelaParada {
  inicio: string
  fim: string
  intervalos: number
  duracaoHoras: number
  probabilidadeMedia: number
  energiaMwh: number
  /** Magnitude × probabilidade: é o que ranqueia as janelas entre si. */
  energiaEsperadaMwh: number
}

/** Passo da série devolvida pela API de previsão detalhada. */
const PASSO_HORAS = 1

/**
 * Agrupa intervalos consecutivos acima do limiar numa janela só.
 *
 * É a tradução de "vai ter corte" para "existe uma janela de tantas horas
 * começando em tal hora" — que é a forma como manutenção e operação pensam.
 */
export function agruparJanelasDeCorte(previsoes: PrevisaoRiscoItem[], limiar: number): JanelaParada[] {
  const janelas: JanelaParada[] = []
  let atual: PrevisaoRiscoItem[] = []

  const fechar = () => {
    if (atual.length === 0) return
    const energia = atual.reduce((acc, p) => acc + Number(p.magnitude_estimada_mwh || 0), 0)
    const probMedia = atual.reduce((acc, p) => acc + Number(p.prob_corte || 0), 0) / atual.length
    const ultimo = atual[atual.length - 1]

    janelas.push({
      inicio: atual[0].timestamp,
      // O fim é o término do último intervalo, não o seu início.
      fim: new Date(new Date(ultimo.timestamp).getTime() + PASSO_HORAS * 3_600_000).toISOString(),
      intervalos: atual.length,
      duracaoHoras: atual.length * PASSO_HORAS,
      probabilidadeMedia: probMedia,
      energiaMwh: energia,
      energiaEsperadaMwh: energia * probMedia,
    })
    atual = []
  }

  for (const ponto of previsoes) {
    if (Number(ponto.prob_corte || 0) >= limiar) atual.push(ponto)
    else fechar()
  }
  fechar()

  return janelas
}
