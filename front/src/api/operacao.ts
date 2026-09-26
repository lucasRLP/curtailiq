import { get, post } from "./client"
import type {
  AgendamentoOut,
  AgendarRequest,
  BacktestOut,
  GargaloDetalheOut,
  GargalosOut,
  GargalosUsinaOut,
  JanelasCorteOut,
  OperationConfig,
  OperationDemo,
  DocumentoIAOut,
  JustificativaManutencaoRequest,
  MemorandoBessRequest,
  OrdensServicoOut,
  ScadaSerieOut,
  ScadaUltimoOut,
} from "@/types/operacao"

/* ---- cenário de demonstração (já publicado) ----------------------------- */

/** Cenário padrão (mesma saída do POST com todos os campos omitidos). */
export const getOperacaoDemo = () => get<OperationDemo>("/operacao/demo")

export const postOperacaoDemo = (body: Partial<OperationConfig>) => post<OperationDemo>("/operacao/demo", body)

/* ---- SCADA -------------------------------------------------------------- */

export const getScadaUltimo = (plantId: string) => get<ScadaUltimoOut>(`/operacao/usinas/${plantId}/scada/ultimo`)

export const getScadaSerie = (plantId: string, inicio: string, fim: string, turbineId?: string) => {
  const q = new URLSearchParams({ inicio, fim })
  if (turbineId) q.set("turbine_id", turbineId)
  return get<ScadaSerieOut>(`/operacao/usinas/${plantId}/scada?${q}`)
}

/* ---- janelas de corte --------------------------------------------------- */

export const getJanelasCorte = (plantId: string, tipo: "observada" | "prevista", inicio?: string, fim?: string) => {
  const q = new URLSearchParams({ tipo })
  if (inicio) q.set("inicio", inicio)
  if (fim) q.set("fim", fim)
  return get<JanelasCorteOut>(`/operacao/usinas/${plantId}/janelas-corte?${q}`)
}

/* ---- manutenção --------------------------------------------------------- */

export const getOrdensServico = (plantId: string) => get<OrdensServicoOut>(`/operacao/usinas/${plantId}/ordens-servico`)

export const postAgendar = (plantId: string, body: AgendarRequest) =>
  post<AgendamentoOut>(`/operacao/usinas/${plantId}/agendar`, body)

export const getAgendamento = (runId: string) => get<AgendamentoOut>(`/operacao/agendamentos/${runId}`)

/* ---- backtest ----------------------------------------------------------- */

export const getBacktestUltimo = (plantId: string) => get<BacktestOut>(`/operacao/usinas/${plantId}/backtest/ultimo`)

export const postBacktest = (plantId: string, body: Record<string, unknown>) =>
  post<BacktestOut>(`/operacao/usinas/${plantId}/backtest`, body)

/* ---- gargalos ----------------------------------------------------------- */

export const getGargalos = (inicio?: string, fim?: string) => {
  const q = new URLSearchParams()
  if (inicio) q.set("inicio", inicio)
  if (fim) q.set("fim", fim)
  const sufixo = q.toString() ? `?${q}` : ""
  return get<GargalosOut>(`/gargalos${sufixo}`)
}

export const getGargaloDetalhe = (gargaloId: string) => get<GargaloDetalheOut>(`/gargalos/${gargaloId}`)

export const getGargalosDaUsina = (plantId: string, inicio?: string, fim?: string) => {
  const q = new URLSearchParams()
  if (inicio) q.set("inicio", inicio)
  if (fim) q.set("fim", fim)
  const sufixo = q.toString() ? `?${q}` : ""
  return get<GargalosUsinaOut>(`/usinas/${plantId}/gargalos${sufixo}`)
}

/* ---- documentos redigidos por IA ---------------------------------------- */

export const postMemorandoBess = (plantId: string, body: MemorandoBessRequest) =>
  post<DocumentoIAOut>(`/usinas/${plantId}/documentos/memorando-bess`, body)

export const postJustificativaManutencao = (runId: string, body: JustificativaManutencaoRequest) =>
  post<DocumentoIAOut>(`/operacao/agendamentos/${runId}/justificativa`, body)
