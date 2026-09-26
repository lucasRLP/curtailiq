import { useMemo, useState } from "react"
import { getPlantDateWindow } from "@/lib/dateWindows"

/**
 * Janela de datas da usina.
 *
 * O padrão vem da última data com dado disponível para o ativo. Quando essa
 * data muda (a usina carregou, ou o usuário trocou de usina), a janela se
 * reajusta em render — um efeito aqui causaria um render extra com o intervalo
 * antigo e um piscar de dados errados nas telas filhas.
 */
export function usePlantDateRange(availableFim?: string | null) {
  const janela = useMemo(() => getPlantDateWindow(availableFim), [availableFim])

  const [intervalo, setIntervalo] = useState({ inicio: janela.defaultInicio, fim: janela.defaultFim })
  const [padraoAplicado, setPadraoAplicado] = useState(janela.defaultInicio + janela.defaultFim)

  const padraoAtual = janela.defaultInicio + janela.defaultFim
  if (padraoAtual !== padraoAplicado) {
    setPadraoAplicado(padraoAtual)
    setIntervalo({ inicio: janela.defaultInicio, fim: janela.defaultFim })
  }

  return {
    inicio: intervalo.inicio,
    fim: intervalo.fim,
    setRange: (inicio: string, fim: string) => setIntervalo({ inicio, fim }),
    minDate: janela.minDate,
    maxDate: janela.maxDate,
    ready: Boolean(intervalo.inicio && intervalo.fim),
  }
}
