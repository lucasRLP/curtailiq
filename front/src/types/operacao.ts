/* ============================================================================
   Contratos de Operação consumidos pelo front.

   Os tipos abaixo seguem `curtailiq_plano_execucao_operacao.md` §4.2 (tabelas
   `ops.*`) e §7 (endpoints). O que o front espera de cada rota, com exemplos,
   está em `docs/CONTRATO_FRONT_OPERACAO.md` — mudou aqui, atualiza lá.

   Convenções válidas para tudo neste arquivo:
   - timestamps em ISO-8601 com timezone;
   - potência em MW, energia em MWh, dinheiro em BRL;
   - todo dado sintético carrega `is_simulated: true`.
   ========================================================================= */

/* ---------------------------------------------------------------------------
   Cenário de demonstração (contrato v1, já entregue)
   GET/POST /api/operacao/demo
   ------------------------------------------------------------------------ */

export interface OperationConfig {
  seed: number
  days: number
  turbines: number
  nominal_mw: number
  teams: number
  max_wind_ms: number
  battery_mwh: number
  battery_mw: number
  efficiency: number
  degradation_brl_mwh: number
  energy_price_brl_mwh: number
}

export interface OperationPoint {
  ts: string
  available_mw: number
  export_limit_mw: number
  baseline_mw: number
  scheduled_mw: number
  export_with_battery_mw: number
  curtailed_mw: number
  wind_ms: number
  price_brl_mwh: number
  battery_charge_mw: number
  battery_discharge_mw: number
  soc_mwh: number
}

export interface ScadaSample {
  turbine_id: string
  ts: string
  vento_ms: number
  potencia_kw: number
  potencia_disponivel_kw: number
  setpoint_kw: number
  pitch_graus: number
  rotor_rpm: number
  temp_nacele_c: number
  temp_mancal_gerador_c: number
  temp_mancal_caixa_c: number
  status: string
  qualidade: string
  is_simulated: boolean
  fonte_ingestao: string
}

export interface OperationTask {
  task_id: string
  turbine_id: string
  duration_minutes: number
  original_start: string
  scheduled_start: string | null
  status: string
  reason: string
}

export interface OperationDemo {
  is_simulated: true
  scenario_id: string
  method: string
  assumptions: string[]
  config: OperationConfig
  summary: {
    available_mwh: number
    baseline_export_mwh: number
    scheduled_export_mwh: number
    battery_export_mwh: number
    maintenance_saving_brl: number
    battery_net_value_brl: number
    recovered_mwh: number
    unallocated_tasks: number
  }
  timeline: OperationPoint[]
  turbines: { turbine_id: string; nominal_kw: number }[]
  scada: ScadaSample[]
  tasks: OperationTask[]
  alerts: { turbine_id: string; ts: string; severity: string; message: string }[]
}

/* ---------------------------------------------------------------------------
   P0 · SCADA ao vivo — WS3/WS7 tela 1
   GET /api/operacao/usinas/{id}/scada/ultimo
   GET /api/operacao/usinas/{id}/scada?inicio=&fim=&turbine_id=
   ------------------------------------------------------------------------ */

/** Estados canônicos de `ops.scada_10min.status`. */
export type ScadaStatus =
  | "operando"
  | "limitada"
  | "parada_manutencao"
  | "parada_falha"
  | "parada_rede"
  | "desconhecido"

export type ScadaQualidade = "ok" | "interpolado" | "ausente" | "suspeito"

export interface ScadaLeitura {
  turbine_id: string
  ts: string
  vento_ms: number | null
  potencia_kw: number | null
  potencia_disponivel_kw: number | null
  setpoint_kw: number | null
  pitch_graus?: number | null
  rotor_rpm?: number | null
  temp_nacele_c?: number | null
  temp_mancal_gerador_c?: number | null
  temp_mancal_caixa_c?: number | null
  status: ScadaStatus
  qualidade: ScadaQualidade
  is_simulated: boolean
  fonte_ingestao: string
}

export interface ScadaUltimoOut {
  plant_id: string
  /** Momento da leitura mais recente do parque. */
  ts: string
  is_simulated: boolean
  fonte_ingestao: string
  /** Idade da leitura mais nova, para a tela avisar quando o dado congelou. */
  atraso_segundos?: number | null
  agregado: {
    potencia_total_kw: number
    potencia_disponivel_total_kw: number
    /** Diferença entre disponível e gerado, isto é, o corte em curso. */
    limitacao_kw: number
    vento_medio_ms: number | null
    turbinas_operando: number
    turbinas_limitadas: number
    turbinas_paradas: number
  }
  turbinas: ScadaLeitura[]
}

export interface ScadaSerieOut {
  plant_id: string
  inicio: string
  fim: string
  is_simulated: boolean
  leituras: ScadaLeitura[]
}

/* ---------------------------------------------------------------------------
   P0 · Janelas de corte — WS5 §6.5.1
   GET /api/operacao/usinas/{id}/janelas-corte?tipo=observada|prevista
   ------------------------------------------------------------------------ */

export type RazaoJanela = "ENE" | "REL" | "CNF" | "PAR" | "desconhecida"

export interface JanelaCorte {
  window_id: string
  plant_id: string
  ts_inicio: string
  ts_fim: string
  tipo: "observada" | "prevista"
  razao: RazaoJanela
  origem: "SIS" | "LOC" | "desconhecida"
  profundidade_mw: number
  /** 1.0 nas observadas. */
  probabilidade: number
  ressarcivel: boolean
  gargalo_id?: string | null
  modelo_versao?: string | null
}

export interface JanelasCorteOut {
  plant_id: string
  tipo: "observada" | "prevista"
  inicio: string
  fim: string
  modelo_versao?: string | null
  janelas: JanelaCorte[]
}

/* ---------------------------------------------------------------------------
   P0 · Ordens de serviço e agendador — WS5 §6.5.3 a §6.5.5
   GET  /api/operacao/usinas/{id}/ordens-servico
   POST /api/operacao/usinas/{id}/agendar
   GET  /api/operacao/agendamentos/{run_id}
   ------------------------------------------------------------------------ */

export interface OrdemServico {
  wo_id: string
  plant_id: string
  turbine_id: string
  tipo_tarefa: string
  duracao_h: number
  inicio_mais_cedo: string
  inicio_mais_tarde: string
  inicio_planejado_original: string
  exige_subida: boolean
  equipe?: string | null
  status: "aberta" | "agendada" | "concluida"
  is_simulated: boolean
}

export interface OrdensServicoOut {
  plant_id: string
  total: number
  ordens: OrdemServico[]
}

export interface AgendarRequest {
  /** Sem isso o backend usa as ordens abertas da usina. */
  wo_ids?: string[]
  inicio?: string
  fim?: string
  /** Hipótese da §0.3: parada em janela ressarcível derruba o ressarcimento. */
  penalizar_ressarcimento?: boolean
  flexibilidade_dias?: number
  limite_vento_ms?: number
  equipes?: number
  incluir_domingo?: boolean
  /** "observada" reproduz o oráculo; "prevista" é o modo realista. */
  tipo_janela?: "observada" | "prevista"
}

export type ConfiancaRecomendacao = "alta" | "media" | "baixa"

export interface RecomendacaoAgendamento {
  wo_id: string
  turbine_id: string
  tipo_tarefa?: string | null
  duracao_h: number
  inicio_baseline: string
  /** Nulo quando o agendador não achou janela viável. */
  inicio_recomendado: string | null
  perda_esperada_mwh: number
  perda_esperada_brl: number
  perda_baseline_brl: number
  ressarcimento_perdido_brl: number
  economia_brl: number
  /** Frase pronta, gerada a partir dos números (§6.5.5). */
  justificativa: string
  confianca: ConfiancaRecomendacao
  /** Janela de corte que motivou o deslocamento, quando houver. */
  window_id?: string | null
  razao_janela?: RazaoJanela | null
}

export interface AgendamentoOut {
  run_id: string
  plant_id: string
  criado_em: string
  is_simulated: boolean
  parametros: AgendarRequest & Record<string, unknown>
  resumo: {
    tarefas_total: number
    tarefas_movidas: number
    tarefas_sem_janela: number
    economia_total_brl: number
    perda_baseline_total_brl: number
    perda_recomendada_total_brl: number
    ressarcimento_perdido_total_brl: number
    horas_em_corte_ene: number
    horas_em_corte_ressarcivel: number
    horas_fora_de_corte: number
  }
  recomendacoes: RecomendacaoAgendamento[]
  /** Janelas usadas no cálculo, para desenhar o fundo do calendário. */
  janelas: JanelaCorte[]
  premissas: string[]
}

/* ---------------------------------------------------------------------------
   P0 · Backtest de valor — WS5 §6.5.6
   POST /api/operacao/usinas/{id}/backtest
   GET  /api/operacao/usinas/{id}/backtest/ultimo
   ------------------------------------------------------------------------ */

export type CenarioBacktest = "baseline" | "oraculo" | "realista"

export interface CenarioBacktestResultado {
  cenario: CenarioBacktest
  custo_total_brl: number
  economia_vs_baseline_brl: number
  tarefas_movidas_pct: number
  horas_em_corte_ene: number
  horas_em_corte_ressarcivel: number
  horas_fora_de_corte: number
}

export interface SensibilidadeBacktest {
  parametro: string
  valor: string | number | boolean
  economia_brl_por_mw_ano: number
  teto_capturado_pct: number
}

export interface BacktestOut {
  plant_id: string
  run_id: string
  criado_em: string
  is_simulated: boolean
  /** Nº de sementes agregadas (§6.5.6 pede ao menos 30). */
  sementes: number
  periodo: { inicio: string; fim: string }
  premissas: string[]
  resumo: {
    economia_brl_por_turbina_ano: number
    economia_brl_por_mw_ano: number
    /** (A − C) / (A − B) em pontos percentuais. */
    teto_capturado_pct: number
    desvio_padrao_economia_brl: number
    tarefas_movidas_pct: number
  }
  cenarios: CenarioBacktestResultado[]
  sensibilidade: SensibilidadeBacktest[]
}

/* ---------------------------------------------------------------------------
   P0 · Gargalos — WS4
   GET /api/gargalos?inicio=&fim=
   GET /api/gargalos/{gargalo_id}
   GET /api/usinas/{id}/gargalos
   ------------------------------------------------------------------------ */

export type TipoEquipamento = "linha" | "transformador" | "subestacao" | "sistemico" | "outro"

export interface Gargalo {
  gargalo_id: string
  rotulo_normalizado: string
  tipo_equipamento: TipoEquipamento
  tensao_kv?: number | null
  subestacao?: string | null
  energia_restringida_mwh: number
  perda_estimada_reais?: number | null
  horas_corte: number
  usinas_afetadas: number
  primeira_ocorrencia: string
  ultima_ocorrencia: string
  /** Quanto do ranking veio de texto livre reconhecido pelo extrator. */
  confianca_extracao?: number | null
}

export interface GargalosOut {
  inicio: string
  fim: string
  /** Honestidade do WS4: quanto do `dsc_restricao` não virou equipamento. */
  cobertura_extracao_pct?: number | null
  total_textos_analisados?: number | null
  gargalos: Gargalo[]
}

export interface GargaloUsina extends Gargalo {
  plant_id: string
  participacao_na_perda_pct: number
}

export interface GargalosUsinaOut {
  plant_id: string
  inicio: string
  fim: string
  gargalos: GargaloUsina[]
}

export interface GargaloDetalheOut extends Gargalo {
  exemplos_texto: string[]
  conjuntos_afetados: Array<{
    plant_id: string
    nome: string
    energia_restringida_mwh: number
    horas_corte: number
  }>
  serie: Array<{ ts: string; energia_restringida_mwh: number }>
}

/* ---------------------------------------------------------------------------
   Documentos redigidos por IA sobre números já calculados.

   Mesmo padrão do pleito de ressarcimento: o cálculo é determinístico e a IA
   só escreve o texto que acompanha a decisão. Detalhe em
   `docs/CONTRATO_FRONT_OPERACAO.md` §8.
   ------------------------------------------------------------------------ */

export interface DocumentoIAOut {
  documento_id: string
  criado_em: string
  /** Identificador do modelo usado, exibido junto ao texto. */
  modelo: string
  markdown: string
  /** Os valores que o modelo recebeu, para conferência. */
  base_numerica?: Record<string, number | string | null>
  aviso_revisao?: string
}

/** POST /api/usinas/{id}/documentos/memorando-bess */
export interface MemorandoBessRequest {
  periodo: { inicio: string; fim: string }
  cenario: {
    potencia_mw: number
    duracao_horas: number
    eficiencia: number
    capex?: number
  }
  resultado: {
    energia_recuperada_mwh: number
    receita_recuperada_reais: number
    percentual_mitigado: number
    payback_anos?: number | null
    perda_financeira_evitavel_prevista_reais?: number | null
    metodo_previsao?: string | null
  }
  /** Varredura de dimensionamentos, quando o usuário levantou a curva. */
  curva?: Array<{
    potencia_mw: number
    receita_recuperada_reais: number
    percentual_mitigado: number
    payback_anos?: number | null
  }>
}

/** POST /api/operacao/agendamentos/{run_id}/justificativa */
export interface JustificativaManutencaoRequest {
  /** Vazio ou ausente significa "todas as ordens da rodada". */
  wo_ids?: string[]
  /** Para quem o texto é escrito: muda o tom, nunca os números. */
  destinatario?: "supervisor_om" | "planejador" | "diretoria"
}
