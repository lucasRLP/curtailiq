import { Suspense, lazy, type ReactNode } from "react"
import { createBrowserRouter } from "react-router-dom"

const Home = lazy(() => import("@/pages/Home"))
const Build = lazy(() => import("@/pages/Build"))
const Portfolio = lazy(() => import("@/pages/Portfolio"))
const OperacaoShell = lazy(() => import("@/components/shell/OperacaoShell").then((m) => ({ default: m.OperacaoShell })))
const OperacaoCenario = lazy(() => import("@/pages/Operacao/Cenario"))
const OperacaoManutencao = lazy(() => import("@/pages/Operacao/Manutencao"))
const OperacaoScada = lazy(() => import("@/pages/Operacao/Scada"))
const OperacaoGargalos = lazy(() => import("@/pages/Operacao/Gargalos"))
const OperacaoValor = lazy(() => import("@/pages/Operacao/Valor"))
const PlantShell = lazy(() => import("@/components/shell/PlantShell").then((m) => ({ default: m.PlantShell })))
const Resumo = lazy(() => import("@/pages/Resumo"))
const Financeiro = lazy(() => import("@/pages/Financeiro"))
const Simulador = lazy(() => import("@/pages/Simulador"))
const Dossie = lazy(() => import("@/pages/Dossie"))
const Chat = lazy(() => import("@/pages/Chat"))
const Risco = lazy(() => import("@/pages/Risco"))
const NotFound = lazy(() => import("@/pages/NotFound"))

/** Esqueleto que imita a estrutura real da página, não um spinner genérico. */
function PageLoader() {
  return (
    <div className="min-h-screen bg-background px-4 py-8 text-foreground">
      <div className="mx-auto w-full max-w-7xl space-y-5">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-muted" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  )
}

function lazyPage(element: ReactNode) {
  return <Suspense fallback={<PageLoader />}>{element}</Suspense>
}

export const router = createBrowserRouter([
  { path: "/", element: lazyPage(<Home />) },
  { path: "/build", element: lazyPage(<Build />) },
  { path: "/usinas", element: lazyPage(<Portfolio />) },
  {
    path: "/operacao",
    element: lazyPage(<OperacaoShell />),
    children: [
      { index: true, element: lazyPage(<OperacaoCenario />) },
      { path: "manutencao", element: lazyPage(<OperacaoManutencao />) },
      { path: "scada", element: lazyPage(<OperacaoScada />) },
      { path: "gargalos", element: lazyPage(<OperacaoGargalos />) },
      { path: "valor", element: lazyPage(<OperacaoValor />) },
    ],
  },
  {
    path: "/usinas/:id",
    element: lazyPage(<PlantShell />),
    children: [
      { index: true, element: lazyPage(<Resumo />) },
      { path: "risco", element: lazyPage(<Risco />) },
      { path: "financeiro", element: lazyPage(<Financeiro />) },
      { path: "bess", element: lazyPage(<Simulador />) },
      { path: "dossie", element: lazyPage(<Dossie />) },
      { path: "chat", element: lazyPage(<Chat />) },
    ],
  },
  { path: "*", element: lazyPage(<NotFound />) },
])
