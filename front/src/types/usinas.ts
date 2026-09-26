export interface UsinaOut {
  usina_id: string
  nome: string
  fonte: "solar" | "eolica"
  potencia_mw: number
  submercado: string
  latitude?: number | null
  longitude?: number | null
  id_ons?: string | null
  ceg?: string | null
  nom_conjuntousina?: string | null
  nom_usina_conjunto?: string | null
  total_corte_mwh?: number | null
  total_ressarcivel_mwh?: number | null
  total_perda_reais?: number | null
  total_perda_ressarcivel_reais?: number | null
  percentual_ressarcivel?: number | null
  fonte_rank?: number | null
  pld_faltante_intervalos?: number | null
  total_intervalos_restricao?: number | null
  data_inicio?: string | null
  data_fim?: string | null
}

export interface UsinaListOut {
  total_count: number
  limit: number
  offset: number
  items: UsinaOut[]
}


export interface RiscoHora {
  timestamp: string
  probabilidade_corte: number
  magnitude_estimada_mwh: number
}

export interface UsinaResumoOut {
  usina: UsinaOut
  total_corte_mwh: number
  total_perda_reais: number
  percentual_ressarcivel: number
  perda_ressarcivel_reais: number
  perda_por_razao: Record<string, number>
  total_eventos_corte: number
  total_intervalos_restricao?: number
  ticket_medio_evento_reais: number
  perda_esperada_30d: {
    valor_reais: number
    horizonte_dias: number
    metodo: string
    observacao?: string | null
  }
}

/* ---------------------------------------------------------------------------
   Previsão detalhada de curtailment (Elo 1)
   GET /api/usinas/{id}/curtailment/previsao-detalhada?horizonte=
   ------------------------------------------------------------------------ */

export interface PrevisaoRiscoItem {
  timestamp: string
  prob_corte: number
  magnitude_estimada_mwh: number
  [extra: string]: unknown
}

export interface RiscoDetalhadoOut {
  usina_id: string
  horizonte_horas: number
  modelo: string
  tipo_dado: "previsao"
  previsoes: PrevisaoRiscoItem[]
  /** Subconjunto de `previsoes` acima do limiar de probabilidade do backend. */
  alertas: PrevisaoRiscoItem[]
  resumo: {
    horizonte_horas?: number
    total_alertas?: number
    metodo?: string
    [extra: string]: unknown
  }
  decomposicao_temporal?: Record<string, unknown> | null
  knn_insights?: Record<string, unknown> | null
}
