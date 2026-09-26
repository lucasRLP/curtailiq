import { useMemo, useState } from "react"
import { CalendarClock, Play, Wrench } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { PageHeader } from "@/components/shared/PageHeader"
import { StatTile } from "@/components/shared/StatTile"
import { EstadoDeFalha } from "@/components/shared/PendingEndpoint"
import { useOperacaoContext } from "@/components/shell/OperacaoShell"
import { GanttManutencao } from "@/pages/Operacao/GanttManutencao"
import { DocumentoIA } from "@/components/shared/DocumentoIA"
import { useAgendar, useJanelasCorte, useJustificativaManutencao, useOrdensServico } from "@/hooks/useOperacao"
import { fmtBRL, fmtBRLCompacto, fmtDiaHora, fmtInt, fmtMWh, fmtNum } from "@/lib/formatters"
import { cn } from "@/lib/utils"
import type { RecomendacaoAgendamento } from "@/types/operacao"

const confiancaEstilo: Record<string, string> = {
  alta: "border-good/40 bg-good/10 text-good",
  media: "border-warning/40 bg-warning/10 text-warning",
  baixa: "border-border bg-muted text-muted-foreground",
}

function LinhaRecomendacao({ recomendacao }: { recomendacao: RecomendacaoAgendamento }) {
  const moveu =
    recomendacao.inicio_recomendado && recomendacao.inicio_recomendado !== recomendacao.inicio_baseline
  const economia = recomendacao.economia_brl

  return (
    <tr className="border-b border-border/60 align-top last:border-0 hover:bg-accent/40">
      <td className="px-4 py-3">
        <p className="font-mono text-[0.6875rem] text-muted-foreground">{recomendacao.wo_id}</p>
        <p className="mt-0.5 text-xs font-medium">{recomendacao.turbine_id}</p>
        {recomendacao.tipo_tarefa && (
          <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">{recomendacao.tipo_tarefa}</p>
        )}
      </td>
      <td className="tabular px-4 py-3 text-xs text-muted-foreground">{fmtDiaHora(recomendacao.inicio_baseline)}</td>
      <td className="tabular px-4 py-3 text-xs">
        {recomendacao.inicio_recomendado ? (
          <span className={cn(moveu && "font-semibold text-recoverable")}>
            {fmtDiaHora(recomendacao.inicio_recomendado)}
          </span>
        ) : (
          <span className="text-critical">Sem janela viável</span>
        )}
      </td>
      <td className="tabular px-4 py-3 text-right text-xs text-muted-foreground">{fmtNum(recomendacao.duracao_h)} h</td>
      <td className="tabular px-4 py-3 text-right text-xs text-loss">{fmtBRL(recomendacao.perda_baseline_brl)}</td>
      <td className="tabular px-4 py-3 text-right text-xs">{fmtBRL(recomendacao.perda_esperada_brl)}</td>
      <td className="tabular px-4 py-3 text-right text-xs text-muted-foreground">
        {recomendacao.ressarcimento_perdido_brl > 0 ? `− ${fmtBRL(recomendacao.ressarcimento_perdido_brl)}` : "—"}
      </td>
      <td
        className={cn(
          "tabular px-4 py-3 text-right text-xs font-semibold",
          economia > 0 ? "text-recoverable" : "text-muted-foreground",
        )}
      >
        {economia > 0 ? fmtBRL(economia) : "—"}
      </td>
      <td className="px-4 py-3">
        <span
          className={cn(
            "inline-flex rounded-full border px-2 py-0.5 text-[0.625rem] font-medium",
            confiancaEstilo[recomendacao.confianca] ?? confiancaEstilo.baixa,
          )}
        >
          {recomendacao.confianca}
        </span>
      </td>
      <td className="max-w-80 px-4 py-3 text-[0.6875rem] leading-relaxed text-muted-foreground">
        {recomendacao.justificativa}
      </td>
    </tr>
  )
}

export default function Manutencao() {
  const { plantId, usina } = useOperacaoContext()

  const [flexibilidade, setFlexibilidade] = useState(7)
  const [limiteVento, setLimiteVento] = useState(12)
  const [equipes, setEquipes] = useState(2)
  const [penalizarRessarcimento, setPenalizarRessarcimento] = useState(true)
  const [incluirDomingo, setIncluirDomingo] = useState(true)

  const ordens = useOrdensServico(plantId)
  const janelas = useJanelasCorte(plantId, "prevista")
  const agendar = useAgendar(plantId)

  const resultado = agendar.data
  const janelasParaDesenhar = useMemo(
    () => resultado?.janelas ?? janelas.data?.janelas ?? [],
    [resultado, janelas.data],
  )

  const rodar = () =>
    agendar.mutate({
      flexibilidade_dias: flexibilidade,
      limite_vento_ms: limiteVento,
      equipes,
      penalizar_ressarcimento: penalizarRessarcimento,
      incluir_domingo: incluirDomingo,
      tipo_janela: "prevista",
    })

  const resumo = resultado?.resumo

  /**
   * Justificativa da reprogramação.
   *
   * Mover uma parada de manutenção exige aprovação de quem responde pelo ativo.
   * A conta o agendador já fez; o que falta é o texto que entra na ordem de
   * serviço e convence o supervisor de O&M — escrito sobre os mesmos números.
   */
  const justificativa = useJustificativaManutencao(resultado?.run_id)

  return (
    <>
      <PageHeader
        eyebrow="Manutenção no corte"
        title="Quando parar cada turbina para perder menos"
        description={
          usina
            ? `Dentro de uma janela de corte a energia já está perdida — parar uma turbina ali custa pouco ou nada. O agendador move cada ordem de serviço de ${usina.nome} para a janela de menor custo, respeitando equipe, vento e prazo.`
            : "O agendador move cada ordem de serviço para a janela de corte de menor custo, respeitando equipe, vento e prazo."
        }
        actions={
          <Button size="sm" className="h-8 gap-1.5" onClick={rodar} disabled={agendar.isPending || !plantId}>
            <Play className="h-3.5 w-3.5" />
            {agendar.isPending ? "Calculando…" : "Rodar agendador"}
          </Button>
        }
      />

      {/* ---- parâmetros da recomendação ----------------------------------- */}
      <section className="panel p-4">
        <div className="mb-4">
          <h2 className="panel-title">Restrições operacionais</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Os padrões vêm de <span className="font-mono">parametros_operacao.yaml</span>. O limite de vento é
            provisório e precisa de confirmação do time de O&amp;M.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-5">
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="flex" className="text-xs">Flexibilidade da data</Label>
              <span className="tabular text-sm font-semibold">± {flexibilidade} d</span>
            </div>
            <Slider id="flex" min={1} max={21} step={1} value={[flexibilidade]} onValueChange={([v]) => setFlexibilidade(v)} />
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="vento" className="text-xs">Vento máximo para subir</Label>
              <span className="tabular text-sm font-semibold">{limiteVento} m/s</span>
            </div>
            <Slider id="vento" min={8} max={20} step={1} value={[limiteVento]} onValueChange={([v]) => setLimiteVento(v)} />
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="equipes" className="text-xs">Equipes simultâneas</Label>
              <span className="tabular text-sm font-semibold">{equipes}</span>
            </div>
            <Slider id="equipes" min={1} max={6} step={1} value={[equipes]} onValueChange={([v]) => setEquipes(v)} />
          </div>

          <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3">
            <div>
              <Label htmlFor="ressarc" className="text-xs">Penalizar ressarcimento</Label>
              <p className="mt-1 text-[0.625rem] leading-relaxed text-muted-foreground">
                Parar turbina em corte ressarcível derruba a disponibilidade e reduz o pleito. Hipótese a confirmar com
                o ONS.
              </p>
            </div>
            <Switch id="ressarc" checked={penalizarRessarcimento} onCheckedChange={setPenalizarRessarcimento} />
          </div>

          <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3">
            <div>
              <Label htmlFor="domingo" className="text-xs">Trabalhar no domingo</Label>
              <p className="mt-1 text-[0.625rem] leading-relaxed text-muted-foreground">
                Domingo concentra corte por razão energética, quando a parada custa menos.
              </p>
            </div>
            <Switch id="domingo" checked={incluirDomingo} onCheckedChange={setIncluirDomingo} />
          </div>
        </div>
      </section>

      {/* ---- resultado ----------------------------------------------------- */}
      {agendar.error ? (
        <EstadoDeFalha
          error={agendar.error}
          rota="POST /api/operacao/usinas/{id}/agendar"
          titulo="Agendador ainda não publicado"
          descricao="Esta tela já monta o pedido com as restrições acima e desenha o calendário com a recomendação de cada ordem de serviço."
          consome={[
            "resumo.economia_total_brl, tarefas_movidas, tarefas_sem_janela",
            "recomendacoes[]: inicio_baseline × inicio_recomendado",
            "recomendacoes[].justificativa e confianca",
            "recomendacoes[].ressarcimento_perdido_brl (efeito da §0.3)",
            "janelas[]: faixas de corte no fundo do Gantt",
            "horas_em_corte_ene / ressarcivel / fora_de_corte",
          ]}
        />
      ) : agendar.isPending ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      ) : resumo && resultado ? (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatTile
              label="Economia do reagendamento"
              value={fmtBRLCompacto(resumo.economia_total_brl)}
              accent="recoverable"
              size="lg"
              sub={`${fmtBRL(resumo.perda_baseline_total_brl)} no plano original → ${fmtBRL(resumo.perda_recomendada_total_brl)} recomendado`}
            />
            <StatTile
              label="Tarefas movidas"
              value={`${fmtInt(resumo.tarefas_movidas)} / ${fmtInt(resumo.tarefas_total)}`}
              accent="neutral"
              size="lg"
              sub={
                resumo.tarefas_sem_janela > 0
                  ? `${fmtInt(resumo.tarefas_sem_janela)} sem janela viável`
                  : "Todas couberam nas restrições"
              }
            />
            <StatTile
              label="Horas de parada em corte energético"
              value={`${fmtNum(resumo.horas_em_corte_ene)} h`}
              accent="recoverable"
              size="lg"
              sub="Corte ENE não é ressarcível: parar aqui é o mais barato."
            />
            <StatTile
              label="Ressarcimento abdicado"
              value={fmtBRLCompacto(resumo.ressarcimento_perdido_total_brl)}
              accent={resumo.ressarcimento_perdido_total_brl > 0 ? "loss" : "neutral"}
              size="lg"
              sub={`${fmtNum(resumo.horas_em_corte_ressarcivel)} h de parada dentro de corte ressarcível`}
            />
          </div>

          <GanttManutencao recomendacoes={resultado.recomendacoes} janelas={janelasParaDesenhar} />

          <section className="panel overflow-hidden">
            <header className="border-b border-border p-4">
              <h2 className="flex items-center gap-2 panel-title">
                <CalendarClock className="h-4 w-4 text-muted-foreground" />
                Recomendação por ordem de serviço
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                A economia é a diferença entre executar na data original e na data recomendada, já descontando o
                ressarcimento abdicado.
              </p>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Ordem</th>
                    <th className="px-4 py-2.5 font-medium">Data original</th>
                    <th className="px-4 py-2.5 font-medium">Recomendada</th>
                    <th className="px-4 py-2.5 text-right font-medium">Duração</th>
                    <th className="px-4 py-2.5 text-right font-medium">Perda original</th>
                    <th className="px-4 py-2.5 text-right font-medium">Perda recomendada</th>
                    <th className="px-4 py-2.5 text-right font-medium">Ressarc. abdicado</th>
                    <th className="px-4 py-2.5 text-right font-medium">Economia</th>
                    <th className="px-4 py-2.5 font-medium">Confiança</th>
                    <th className="px-4 py-2.5 font-medium">Justificativa</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.recomendacoes.map((recomendacao) => (
                    <LinhaRecomendacao key={recomendacao.wo_id} recomendacao={recomendacao} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <DocumentoIA
            titulo="Justificativa da reprogramação"
            descricao="O texto que entra na ordem de serviço e sustenta o pedido de mover a parada — por que a nova data custa menos, e o que se abre mão ao mudar."
            rotuloAcao="Gerar justificativa"
            rota="POST /api/operacao/agendamentos/{run_id}/justificativa"
            nomeArquivo={`justificativa-${resultado.run_id}.md`}
            avisoRevisao="Texto redigido por IA sobre o resultado do agendador. A decisão de mover uma parada é do supervisor de O&M; nada aqui altera ordem de serviço automaticamente."
            consome={[
              "recomendacoes[]: data original × recomendada",
              "economia_brl por ordem e no total",
              "ressarcimento_perdido_brl (efeito da §0.3)",
              "razão e probabilidade da janela usada",
              "restrições aplicadas: equipe, vento, prazo",
            ]}
            base={[
              { label: "Rodada", valor: resultado.run_id },
              { label: "Tarefas movidas", valor: `${fmtInt(resumo.tarefas_movidas)} de ${fmtInt(resumo.tarefas_total)}` },
              { label: "Economia total", valor: fmtBRL(resumo.economia_total_brl) },
              { label: "Perda no plano original", valor: fmtBRL(resumo.perda_baseline_total_brl) },
              { label: "Perda recomendada", valor: fmtBRL(resumo.perda_recomendada_total_brl) },
              { label: "Ressarcimento abdicado", valor: fmtBRL(resumo.ressarcimento_perdido_total_brl) },
              { label: "Horas em corte energético", valor: `${fmtNum(resumo.horas_em_corte_ene)} h` },
            ]}
            markdown={justificativa.data?.markdown}
            modelo={justificativa.data?.modelo}
            isPending={justificativa.isPending}
            error={justificativa.error}
            onGerar={() => justificativa.mutate({ destinatario: "supervisor_om" })}
          />

          {resultado.premissas.length > 0 && (
            <section className="panel p-4">
              <h2 className="panel-title mb-2">Premissas desta rodada</h2>
              <ul className="space-y-1.5">
                {resultado.premissas.map((premissa) => (
                  <li key={premissa} className="text-xs leading-relaxed text-muted-foreground">
                    · {premissa}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <section className="panel flex flex-col items-center px-6 py-10 text-center">
          <span className="rounded-full border border-border bg-muted p-3">
            <Wrench className="h-5 w-5 text-muted-foreground" aria-hidden />
          </span>
          <p className="mt-4 text-sm font-medium">Ajuste as restrições e rode o agendador</p>
          <p className="mt-1 max-w-lg text-xs leading-relaxed text-muted-foreground">
            O resultado mostra, para cada ordem de serviço, quanto custa executá-la na data original e quanto custaria
            na janela recomendada.
          </p>
        </section>
      )}

      {/* ---- ordens de serviço em aberto ----------------------------------- */}
      {ordens.error ? (
        <EstadoDeFalha
          error={ordens.error}
          rota="GET /api/operacao/usinas/{id}/ordens-servico"
          titulo="Ordens de serviço ainda não publicadas"
          descricao="Lista o que há para agendar: tipo de tarefa, duração, janela de flexibilidade e se exige subida na nacele."
          consome={[
            "ordens[].tipo_tarefa e duracao_h",
            "inicio_mais_cedo / inicio_mais_tarde",
            "inicio_planejado_original",
            "exige_subida (restrição de vento)",
          ]}
        />
      ) : ordens.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : ordens.data && ordens.data.ordens.length > 0 ? (
        <section className="panel overflow-hidden">
          <header className="border-b border-border p-4">
            <h2 className="panel-title">Ordens de serviço em aberto</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {fmtInt(ordens.data.total)} ordens no sistema de manutenção desta usina.
            </p>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Ordem</th>
                  <th className="px-4 py-2.5 font-medium">Turbina</th>
                  <th className="px-4 py-2.5 font-medium">Tarefa</th>
                  <th className="px-4 py-2.5 text-right font-medium">Duração</th>
                  <th className="px-4 py-2.5 font-medium">Janela permitida</th>
                  <th className="px-4 py-2.5 font-medium">Sobe na nacele</th>
                  <th className="px-4 py-2.5 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {ordens.data.ordens.map((ordem) => (
                  <tr key={ordem.wo_id} className="border-b border-border/60 last:border-0 hover:bg-accent/40">
                    <td className="px-4 py-2.5 font-mono text-[0.6875rem]">{ordem.wo_id}</td>
                    <td className="px-4 py-2.5 text-xs">{ordem.turbine_id}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{ordem.tipo_tarefa}</td>
                    <td className="tabular px-4 py-2.5 text-right text-xs">{fmtNum(ordem.duracao_h)} h</td>
                    <td className="tabular px-4 py-2.5 text-xs text-muted-foreground">
                      {fmtDiaHora(ordem.inicio_mais_cedo)} – {fmtDiaHora(ordem.inicio_mais_tarde)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{ordem.exige_subida ? "Sim" : "Não"}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{ordem.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* A tela tolera a ausência das janelas: sem elas o Gantt perde o fundo,
          mas a recomendação continua legível. */}
      {janelas.error && !janelas.data && (
        <EstadoDeFalha
          error={janelas.error}
          rota="GET /api/operacao/usinas/{id}/janelas-corte?tipo=prevista"
          titulo="Janelas de corte ainda não publicadas"
          descricao="São as faixas de fundo do calendário: quando o corte é esperado, com que profundidade, por qual razão e se é ressarcível."
          consome={[
            "janelas[].ts_inicio / ts_fim",
            "razao (ENE, REL, CNF) e ressarcivel",
            "profundidade_mw e probabilidade",
            "gargalo_id, para ligar com a aba Gargalos",
          ]}
        />
      )}

      {resultado && (
        <p className="text-[0.6875rem] text-muted-foreground">
          Rodada <span className="font-mono">{resultado.run_id}</span> ·{" "}
          {fmtMWh(resultado.recomendacoes.reduce((acc, r) => acc + r.perda_esperada_mwh, 0))} de energia em jogo
        </p>
      )}
    </>
  )
}
