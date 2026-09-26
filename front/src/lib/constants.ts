export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api"

export const FONTES = ["solar", "eolica"] as const
export const SUBMERCADOS = ["NE", "SE", "S", "N"] as const

export const FONTE_LABELS: Record<string, string> = {
  solar: "Solar",
  eolica: "Eólica",
}

export const QUALIDADE_LABELS: Record<string, string> = {
  completo: "Dados completos",
  parcial: "PLD parcial",
  sem_pld: "Sem PLD",
}

export const RAZAO_LABELS: Record<string, string> = {
  confiabilidade: "Confiabilidade",
  indisponibilidade_externa: "Indisp. externa",
  energetico: "Energético",
  restricao_eletrica: "Restrição elétrica",
  seguranca_eletroenergetica: "Segurança eletroenergética",
  indefinido: "Indefinido",
}

/**
 * Cor fixa por razão de restrição.
 *
 * A cor segue a ENTIDADE, nunca a posição no ranking: filtrar o período não
 * pode repintar as razões que sobraram, senão o leitor perde a referência entre
 * uma tela e outra. "Indefinido" fica cinza de propósito — não é uma categoria
 * de verdade e não deve disputar atenção com as outras.
 */
export const RAZAO_CORES: Record<string, string> = {
  confiabilidade: "var(--chart-1)",
  restricao_eletrica: "var(--chart-2)",
  energetico: "var(--chart-3)",
  indisponibilidade_externa: "var(--chart-4)",
  seguranca_eletroenergetica: "var(--chart-5)",
  indefinido: "var(--color-muted-foreground)",
}

export const corDaRazao = (chave: string) => RAZAO_CORES[chave] ?? "var(--chart-6)"

/** Classificação regulatória do ONS usada nas telas de pleito. */
export const MOTIVO_ONS_LABELS: Record<string, string> = {
  REL: "Restrição elétrica",
  CNF: "Confiabilidade",
  ENE: "Energético",
  INDEFINIDO: "Indefinido",
}

export const MOTIVO_ONS_CORES: Record<string, string> = {
  REL: "var(--chart-1)",
  CNF: "var(--chart-2)",
  ENE: "var(--color-muted-foreground)",
  INDEFINIDO: "var(--color-muted-foreground)",
}

/**
 * Situação de elegibilidade do evento, como o backend classifica.
 *
 * A cor segue a paleta de status (nunca a de séries) e sempre vem acompanhada
 * do rótulo: é uma informação que muda o que a pessoa vai fazer com o evento.
 */
export const ELEGIBILIDADE_LABELS: Record<string, string> = {
  ELEGIVEL: "Elegível",
  REVISAO_HUMANA: "Revisão humana",
  NAO_ELEGIVEL: "Não elegível",
}

export const ELEGIBILIDADE_ESTILOS: Record<string, string> = {
  ELEGIVEL: "border-good/40 bg-good/10 text-good",
  REVISAO_HUMANA: "border-warning/40 bg-warning/10 text-warning",
  NAO_ELEGIVEL: "border-border bg-muted text-muted-foreground",
}
