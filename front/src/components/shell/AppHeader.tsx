import { useEffect, useState, type ReactNode } from "react"
import { Link, NavLink } from "react-router-dom"
import { ChevronRight, Moon, Sun, Wrench } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/brand/Logo"
import { useTheme } from "@/components/theme-provider"
import { CommandPalette, CommandTrigger } from "@/components/shell/CommandPalette"
import { cn } from "@/lib/utils"

export interface Crumb {
  label: ReactNode
  to?: string
}

export interface TabItem {
  to: string
  label: string
  end?: boolean
}

interface AppHeaderProps {
  crumbs?: Crumb[]
  tabs?: TabItem[]
  /** Slot à direita das abas (ex.: seletor de período fixo no cabeçalho). */
  tabsAside?: ReactNode
}

/**
 * Cabeçalho único do app. Antes existiam três (Layout órfão, Portfolio e
 * PlantShell), cada um com logo e toggle próprios — trocar de tela mudava a
 * altura e a posição dos controles.
 */
export function AppHeader({ crumbs = [], tabs, tabsAside }: AppHeaderProps) {
  const { theme, setTheme } = useTheme()
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setPaletteOpen((open) => !open)
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  return (
    <>
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Pular para o conteúdo
      </a>

      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Link to="/usinas" aria-label="CurtailIQ — ir para o portfólio" className="shrink-0 rounded-md">
            <Logo />
          </Link>

          {crumbs.length > 0 && (
            <nav aria-label="Trilha de navegação" className="flex min-w-0 items-center gap-1.5 text-sm">
              <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-border" />
              {crumbs.map((crumb, index) => {
                const isLast = index === crumbs.length - 1
                return (
                  <span key={index} className="flex min-w-0 items-center gap-1.5">
                    {index > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" aria-hidden />}
                    {crumb.to && !isLast ? (
                      <Link
                        to={crumb.to}
                        className="shrink-0 rounded text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {crumb.label}
                      </Link>
                    ) : (
                      <span
                        className={cn("truncate", isLast ? "font-medium text-foreground" : "text-muted-foreground")}
                        aria-current={isLast ? "page" : undefined}
                      >
                        {crumb.label}
                      </span>
                    )}
                  </span>
                )
              })}
            </nav>
          )}

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {/* A tela de Operação não pertence a nenhuma usina, então não cabe
                nas abas do ativo — fica aqui, ao lado da busca. */}
            <NavLink
              to="/operacao"
              className={({ isActive }) =>
                cn(
                  "hidden h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors sm:inline-flex",
                  isActive ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )
              }
            >
              <Wrench className="h-3.5 w-3.5" />
              Operação
            </NavLink>
            <CommandTrigger onClick={() => setPaletteOpen(true)} />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label={theme === "dark" ? "Usar tema claro" : "Usar tema escuro"}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {tabs && tabs.length > 0 && (
          <div className="mx-auto flex w-full max-w-7xl items-center gap-4 px-4 sm:px-6">
            <nav className="scrollbar-none -mb-px flex items-center gap-1 overflow-x-auto" aria-label="Seções da usina">
              {tabs.map((tab) => (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  end={tab.end}
                  className={({ isActive }) =>
                    cn(
                      "shrink-0 border-b-2 px-3 py-2.5 text-[0.8125rem] font-medium transition-colors",
                      isActive
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                    )
                  }
                >
                  {tab.label}
                </NavLink>
              ))}
            </nav>
            {tabsAside && <div className="ml-auto shrink-0 py-1.5">{tabsAside}</div>}
          </div>
        )}
      </header>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  )
}
