/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo } from "react"
import { Outlet, useLocation, useParams } from "react-router-dom"
import { AppHeader, type TabItem } from "@/components/shell/AppHeader"
import { BuildFooter } from "@/components/shared/BuildFooter"
import { DateRangePicker } from "@/components/shared/DateRangePicker"
import { Skeleton } from "@/components/ui/skeleton"
import { usePlantDateRange } from "@/hooks/usePlantDateRange"
import { useUsina } from "@/hooks/useUsinas"
import type { UsinaOut } from "@/types/usinas"

interface PlantRange {
  inicio: string
  fim: string
  setRange: (inicio: string, fim: string) => void
  minDate: Date
  maxDate: Date
  ready: boolean
}

interface PlantContextValue {
  id: string
  usina?: UsinaOut
  isLoading: boolean
  range: PlantRange
}

const PlantContext = createContext<PlantContextValue | null>(null)

/** Dados da usina e período selecionado, compartilhados por todas as abas. */
export function usePlantContext() {
  const ctx = useContext(PlantContext)
  if (!ctx) throw new Error("usePlantContext precisa estar dentro de PlantShell")
  return ctx
}

const TABS = (id: string): TabItem[] => [
  { to: `/usinas/${id}`, label: "Painel", end: true },
  { to: `/usinas/${id}/risco`, label: "Risco" },
  { to: `/usinas/${id}/financeiro`, label: "Financeiro" },
  { to: `/usinas/${id}/bess`, label: "Bateria" },
  { to: `/usinas/${id}/dossie`, label: "Ressarcimento" },
  { to: `/usinas/${id}/chat`, label: "Curtail AI" },
]

export function PlantShell() {
  const { id = "" } = useParams<{ id: string }>()
  const { data: usina, isLoading } = useUsina(id)
  const range = usePlantDateRange(usina?.data_fim)
  const { pathname } = useLocation()

  const value = useMemo<PlantContextValue>(() => ({ id, usina, isLoading, range }), [id, usina, isLoading, range])

  return (
    <PlantContext.Provider value={value}>
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <AppHeader
          crumbs={[
            { label: "Portfólio", to: "/usinas" },
            { label: isLoading ? <Skeleton className="h-4 w-36" /> : (usina?.nome ?? id) },
          ]}
          tabs={TABS(id)}
          tabsAside={
            <DateRangePicker
              initialFrom={range.inicio ? new Date(range.inicio) : undefined}
              initialTo={range.fim ? new Date(range.fim) : undefined}
              minDate={range.minDate}
              maxDate={range.maxDate}
              onChange={range.setRange}
            />
          }
        />

        <main id="conteudo" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {/* A chave no caminho faz a animação recomeçar a cada troca de aba. */}
          <div key={pathname} className="entrada-conteudo">
            <Outlet />
          </div>
        </main>

        <BuildFooter />
      </div>
    </PlantContext.Provider>
  )
}
