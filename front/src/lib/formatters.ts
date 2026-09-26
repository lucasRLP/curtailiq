const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
const brlPreciso = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 })
const num = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 })
const inteiro = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 })

export const fmtBRL = (v: number) => brl.format(v)
export const fmtBRLPreciso = (v: number) => brlPreciso.format(v)
export const fmtPct = (v: number) => pct.format(v / 100)
export const fmtMWh = (v: number) => `${num.format(v)} MWh`
export const fmtMW = (v: number) => `${num.format(v)} MW`
export const fmtNum = (v: number) => num.format(v)
export const fmtInt = (v: number) => inteiro.format(v)

/**
 * Valores de manchete e eixos: "R$ 12,4 mi" lê melhor que "R$ 12.412.883" e
 * evita que o número estoure a largura do cartão.
 */
export function fmtBRLCompacto(v: number) {
  const abs = Math.abs(v)
  if (abs >= 1_000_000_000) return `R$ ${num.format(v / 1_000_000_000)} bi`
  if (abs >= 1_000_000) return `R$ ${num.format(v / 1_000_000)} mi`
  if (abs >= 10_000) return `R$ ${inteiro.format(v / 1_000)} mil`
  return brl.format(v)
}

export function fmtMWhCompacto(v: number) {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${num.format(v / 1_000_000)} TWh`
  if (abs >= 1_000) return `${num.format(v / 1_000)} GWh`
  return `${inteiro.format(v)} MWh`
}

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })

export const fmtDiaMes = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })

export const fmtDiaHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })

export const toIso = (d: Date) => d.toISOString().replace("Z", "")
