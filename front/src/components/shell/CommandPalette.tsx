import { useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import {
  Battery,
  Bot,
  FileText,
  Gauge,
  LayoutGrid,
  Moon,
  Search,
  Sun as SunIcon,
  TrendingDown,
  Wind,
  Wrench,
} from "lucide-react"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { useTheme } from "@/components/theme-provider"
import { useAllUsinas } from "@/hooks/useUsinas"
import { fmtBRLCompacto, fmtMW } from "@/lib/formatters"

/**
 * Busca global. Com dezenas de usinas no portfólio, obrigar o gestor a voltar
 * para a lista e paginar toda vez que quer trocar de ativo é o maior atrito do
 * app — aqui ele digita o nome e vai direto.
 */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { theme, setTheme } = useTheme()

  // Só busca o catálogo depois da primeira abertura — a paleta existe em toda
  // página e não deve custar uma requisição a quem nunca a abre.
  const [jaAbriu, setJaAbriu] = useState(false)
  const { data: usinas, isLoading } = useAllUsinas({}, jaAbriu)

  const aoAbrir = (aberto: boolean) => {
    if (aberto) setJaAbriu(true)
    onOpenChange(aberto)
  }

  const ranked = useMemo(() => {
    if (!usinas) return []
    return [...usinas]
      .sort((a, b) => Number(b.total_perda_reais ?? 0) - Number(a.total_perda_reais ?? 0))
      .slice(0, 60)
  }, [usinas])

  const go = (to: string) => {
    onOpenChange(false)
    navigate(to)
  }

  return (
    <CommandDialog open={open} onOpenChange={aoAbrir} title="Busca global" description="Encontre uma usina ou navegue pelo app">
      <CommandInput placeholder="Buscar usina, tela ou ação…" />
      <CommandList className="max-h-[22rem]">
        <CommandEmpty>{isLoading ? "Carregando catálogo…" : "Nada encontrado."}</CommandEmpty>

        {id && (
          <>
            <CommandGroup heading="Esta usina">
              <CommandItem onSelect={() => go(`/usinas/${id}`)}>
                <Gauge /> Painel da usina
              </CommandItem>
              <CommandItem onSelect={() => go(`/usinas/${id}/financeiro`)}>
                <TrendingDown /> Análise financeira
              </CommandItem>
              <CommandItem onSelect={() => go(`/usinas/${id}/bess`)}>
                <Battery /> Simulador de bateria
              </CommandItem>
              <CommandItem onSelect={() => go(`/usinas/${id}/dossie`)}>
                <FileText /> Pleito de ressarcimento
              </CommandItem>
              <CommandItem onSelect={() => go(`/usinas/${id}/chat`)}>
                <Bot /> Curtail AI
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="Ir para">
          <CommandItem onSelect={() => go("/usinas")}>
            <LayoutGrid /> Portfólio de usinas
          </CommandItem>
          <CommandItem onSelect={() => go("/operacao")}>
            <Wrench /> Operação, manutenção e bateria
          </CommandItem>
        </CommandGroup>

        {ranked.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Usinas por perda financeira">
              {ranked.map((u) => (
                <CommandItem
                  key={u.usina_id}
                  value={`${u.nome} ${u.id_ons ?? ""} ${u.submercado} ${u.fonte}`}
                  onSelect={() => go(`/usinas/${u.usina_id}`)}
                >
                  {u.fonte === "solar" ? <SunIcon className="text-solar" /> : <Wind className="text-wind" />}
                  <span className="truncate">{u.nome}</span>
                  <CommandShortcut className="tabular">
                    {typeof u.total_perda_reais === "number" ? fmtBRLCompacto(u.total_perda_reais) : fmtMW(u.potencia_mw)}
                  </CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading="Preferências">
          <CommandItem
            onSelect={() => {
              setTheme(theme === "dark" ? "light" : "dark")
              onOpenChange(false)
            }}
          >
            {theme === "dark" ? <SunIcon /> : <Moon />}
            Mudar para tema {theme === "dark" ? "claro" : "escuro"}
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}

/** Botão que abre a paleta e ensina o atalho. */
export function CommandTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-muted/50 pl-2.5 pr-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <Search className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Buscar usina</span>
      <kbd className="hidden rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] sm:inline">
        ⌘K
      </kbd>
    </button>
  )
}
