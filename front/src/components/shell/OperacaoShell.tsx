/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo } from "react"
import { Outlet, useLocation } from "react-router-dom"
import { AppHeader, type TabItem } from "@/components/shell/AppHeader"
import { BuildFooter } from "@/components/shared/BuildFooter"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { usePersistedState } from "@/hooks/usePersistedState"
import { useAllUsinas } from "@/hooks/useUsinas"
import type { UsinaOut } from "@/types/usinas"

/**
 * Operação é a única área do app que não pertence a uma usina pela URL: o
 * gestor entra para comparar o parque e escolhe o ativo aqui. A escolha fica
 * guardada entre sessões, porque na prática ele opera sempre as mesmas usinas.
 */
interface OperacaoContextValue {
  plantId: string
  usina?: UsinaOut
  usinas: UsinaOut[]
  carregandoCatalogo: boolean
}

const OperacaoContext = createContext<OperacaoContextValue | null>(null)

export function useOperacaoContext() {
  const ctx = useContext(OperacaoContext)
  if (!ctx) throw new Error("useOperacaoContext precisa estar dentro de OperacaoShell")
  return ctx
}

/**
 * Ordem das abas = ordem de prioridade do produto, e não a ordem em que as
 * telas foram escritas: a recomendação de manutenção é o núcleo (M3), SCADA é a
 * base que a alimenta, gargalos explicam a causa e o backtest prova o valor.
 * "Visão geral" abre primeiro por ser a única que roda fim a fim hoje.
 */
const TABS: TabItem[] = [
  { to: "/operacao", label: "Visão geral", end: true },
  { to: "/operacao/manutencao", label: "Manutenção no corte" },
  { to: "/operacao/scada", label: "SCADA" },
  { to: "/operacao/gargalos", label: "Gargalos" },
  { to: "/operacao/valor", label: "Valor" },
]

export function OperacaoShell() {
  const { data: usinas, isLoading } = useAllUsinas({ fonte: "eolica" })
  const [plantId, setPlantId] = usePersistedState("operacao.usina", "")
  const { pathname } = useLocation()

  const lista = useMemo(() => usinas ?? [], [usinas])
  // Sem escolha guardada, assume a primeira do catálogo (a do gêmeo digital).
  const selecionada = plantId || lista[0]?.usina_id || ""
  const usina = lista.find((u) => u.usina_id === selecionada)

  const valor = useMemo<OperacaoContextValue>(
    () => ({ plantId: selecionada, usina, usinas: lista, carregandoCatalogo: isLoading }),
    [selecionada, usina, lista, isLoading],
  )

  return (
    <OperacaoContext.Provider value={valor}>
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <AppHeader
          crumbs={[{ label: "Portfólio", to: "/usinas" }, { label: "Operação" }]}
          tabs={TABS}
          tabsAside={
            lista.length > 0 && (
              <Select value={selecionada} onValueChange={setPlantId}>
                <SelectTrigger className="h-8 w-56 text-xs" aria-label="Usina em operação">
                  <SelectValue placeholder="Selecionar usina" />
                </SelectTrigger>
                <SelectContent>
                  {lista.map((item) => (
                    <SelectItem key={item.usina_id} value={item.usina_id}>
                      {item.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )
          }
        />

        <main id="conteudo" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {/* A chave no caminho faz a animação recomeçar a cada troca de aba. */}
          <div key={pathname} className="entrada-conteudo space-y-5">
            <Outlet />
          </div>
        </main>

        <BuildFooter />
      </div>
    </OperacaoContext.Provider>
  )
}
