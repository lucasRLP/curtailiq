import { Link } from "react-router-dom"
import { ArrowLeft, Compass } from "lucide-react"
import { AppHeader } from "@/components/shell/AppHeader"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <AppHeader />
      <main id="conteudo" className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="max-w-md text-center">
          <span className="inline-flex rounded-full border border-border bg-muted p-4">
            <Compass className="h-6 w-6 text-muted-foreground" />
          </span>
          <h1 className="mt-5 font-heading text-2xl font-bold tracking-tight">Página não encontrada</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            O endereço acessado não existe no CurtailIQ. Use a busca no topo (⌘K) para ir direto a uma usina, ou volte
            para o portfólio.
          </p>
          <Button asChild className="mt-6 gap-2">
            <Link to="/usinas">
              <ArrowLeft className="h-4 w-4" />
              Voltar para o portfólio
            </Link>
          </Button>
        </div>
      </main>
    </div>
  )
}
