import { useMutation, useQuery } from "@tanstack/react-query"
import { ApiException } from "@/api/client"
import {
  getAgendamento,
  getBacktestUltimo,
  getGargaloDetalhe,
  getGargalos,
  getGargalosDaUsina,
  getJanelasCorte,
  getOperacaoDemo,
  getOrdensServico,
  getScadaSerie,
  getScadaUltimo,
  postAgendar,
  postBacktest,
  postJustificativaManutencao,
  postMemorandoBess,
  postOperacaoDemo,
} from "@/api/operacao"
import type {
  AgendarRequest,
  JustificativaManutencaoRequest,
  MemorandoBessRequest,
  OperationConfig,
} from "@/types/operacao"

/**
 * As telas de Operação são escritas contra o contrato antes de o backend
 * publicar as rotas. Nesses casos não faz sentido insistir: uma rota que não
 * existe não passa a existir na segunda tentativa, e o retry só empurra o
 * estado de "aguardando" para alguns segundos depois.
 */
function naoRepetirSeAusente(falhas: number, error: unknown) {
  if (error instanceof ApiException && [404, 405, 501].includes(error.status)) return false
  return falhas < 1
}

const PADRAO = { retry: naoRepetirSeAusente }

/* ---- cenário de demonstração -------------------------------------------- */

export const useOperacaoDemo = () =>
  useQuery({
    queryKey: ["operacao-demo"],
    queryFn: getOperacaoDemo,
    staleTime: 30 * 60 * 1000,
    ...PADRAO,
  })

export const useSimularOperacao = () =>
  useMutation({
    mutationFn: (config: Partial<OperationConfig>) => postOperacaoDemo(config),
  })

/* ---- SCADA --------------------------------------------------------------- */

/**
 * @param intervaloMs Pausa entre leituras. A tela de SCADA é o único lugar do
 * app que faz polling; fora dela o dado é histórico e não muda sozinho.
 */
export const useScadaUltimo = (plantId: string, intervaloMs = 10_000, ativo = true) =>
  useQuery({
    queryKey: ["scada-ultimo", plantId],
    queryFn: () => getScadaUltimo(plantId),
    enabled: ativo && !!plantId,
    refetchInterval: ativo ? intervaloMs : false,
    refetchIntervalInBackground: false,
    staleTime: 0,
    ...PADRAO,
  })

export const useScadaSerie = (plantId: string, inicio: string, fim: string, turbineId?: string, ativo = true) =>
  useQuery({
    queryKey: ["scada-serie", plantId, inicio, fim, turbineId],
    queryFn: () => getScadaSerie(plantId, inicio, fim, turbineId),
    enabled: ativo && !!plantId && !!inicio && !!fim,
    ...PADRAO,
  })

/* ---- janelas de corte ---------------------------------------------------- */

export const useJanelasCorte = (
  plantId: string,
  tipo: "observada" | "prevista",
  inicio?: string,
  fim?: string,
  ativo = true,
) =>
  useQuery({
    queryKey: ["janelas-corte", plantId, tipo, inicio, fim],
    queryFn: () => getJanelasCorte(plantId, tipo, inicio, fim),
    enabled: ativo && !!plantId,
    staleTime: 5 * 60 * 1000,
    ...PADRAO,
  })

/* ---- manutenção ---------------------------------------------------------- */

export const useOrdensServico = (plantId: string, ativo = true) =>
  useQuery({
    queryKey: ["ordens-servico", plantId],
    queryFn: () => getOrdensServico(plantId),
    enabled: ativo && !!plantId,
    staleTime: 5 * 60 * 1000,
    ...PADRAO,
  })

export const useAgendar = (plantId: string) =>
  useMutation({
    mutationFn: (body: AgendarRequest) => postAgendar(plantId, body),
  })

export const useAgendamento = (runId?: string) =>
  useQuery({
    queryKey: ["agendamento", runId],
    queryFn: () => getAgendamento(runId!),
    enabled: !!runId,
    ...PADRAO,
  })

/* ---- backtest ------------------------------------------------------------ */

export const useBacktestUltimo = (plantId: string, ativo = true) =>
  useQuery({
    queryKey: ["backtest-ultimo", plantId],
    queryFn: () => getBacktestUltimo(plantId),
    enabled: ativo && !!plantId,
    staleTime: 30 * 60 * 1000,
    ...PADRAO,
  })

export const useRodarBacktest = (plantId: string) =>
  useMutation({
    mutationFn: (body: Record<string, unknown>) => postBacktest(plantId, body),
  })

/* ---- gargalos ------------------------------------------------------------ */

export const useGargalos = (inicio?: string, fim?: string) =>
  useQuery({
    queryKey: ["gargalos", inicio, fim],
    queryFn: () => getGargalos(inicio, fim),
    staleTime: 30 * 60 * 1000,
    ...PADRAO,
  })

export const useGargaloDetalhe = (gargaloId?: string) =>
  useQuery({
    queryKey: ["gargalo", gargaloId],
    queryFn: () => getGargaloDetalhe(gargaloId!),
    enabled: !!gargaloId,
    ...PADRAO,
  })

export const useGargalosDaUsina = (plantId: string, inicio?: string, fim?: string, ativo = true) =>
  useQuery({
    queryKey: ["gargalos-usina", plantId, inicio, fim],
    queryFn: () => getGargalosDaUsina(plantId, inicio, fim),
    enabled: ativo && !!plantId,
    staleTime: 30 * 60 * 1000,
    ...PADRAO,
  })

/* ---- documentos redigidos por IA ---------------------------------------- */

export const useMemorandoBess = (plantId: string) =>
  useMutation({
    mutationFn: (body: MemorandoBessRequest) => postMemorandoBess(plantId, body),
  })

export const useJustificativaManutencao = (runId?: string) =>
  useMutation({
    mutationFn: (body: JustificativaManutencaoRequest) => postJustificativaManutencao(runId!, body),
  })
