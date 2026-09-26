import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { CircleMarker, MapContainer, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet"
import type { LatLngBoundsExpression, Map as LeafletMap } from "leaflet"
import { Maximize2, MousePointerClick, Sun, Wind } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useResolvedTheme } from "@/hooks/useResolvedTheme"
import { fmtBRL, fmtMW, fmtMWh, fmtMWhCompacto } from "@/lib/formatters"
import { cn } from "@/lib/utils"
import type { UsinaOut } from "@/types/usinas"

/* ============================================================================
   Mapa do portfólio.

   É um mapa de verdade: arrasta, aproxima, explora. A tentativa anterior de
   desenhar a malha do IBGE em SVG deixava tudo estático — o enquadramento era
   calculado e não havia como chegar perto de um ativo.

   O que se manteve daquela versão: basemap que acompanha o tema (um mapa branco
   no meio de uma interface escura vira um clarão), marcador com a energia
   cortada codificada no tamanho, e sincronia com a lista ao lado.
   ========================================================================= */

type PontoUsina = UsinaOut & { latitude: number; longitude: number }

/**
 * Tiles cinza da Esri: existem em versão clara e escura, não pedem chave de API
 * e são discretos o bastante para o dado ficar em primeiro plano.
 *
 * O basemap escuro do CARTO foi descartado: passou a exigir API key e os tiles
 * voltam com "API KEY REQUIRED" estampado. Inverter o OSM por filtro CSS também
 * foi descartado — força o repaint de uma camada enorme a cada movimento e
 * chegou a travar o rasterizador da aba em teste.
 *
 * Nota: a Esri ordena o caminho como {z}/{y}/{x}, ao contrário do OSM.
 */
const TILES = {
  dark: {
    url: "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    solar: "#c98500",
    eolica: "#3987e5",
    anel: "#0b1119",
  },
  light: {
    url: "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    solar: "#eda100",
    eolica: "#2a78d6",
    anel: "#ffffff",
  },
} as const

const ATRIBUICAO = 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>'

/**
 * Zoom pela roda só depois de clicar no mapa.
 *
 * Com a roda sempre ativa, rolar a página em cima do mapa aproxima o mapa em
 * vez de descer a página — o atrito clássico de mapa embutido. Clicou, explora;
 * tirou o mouse, a página volta a rolar normalmente.
 */
function ZoomPorRoda({
  ativo,
  onAtivar,
  onDesativar,
}: {
  ativo: boolean
  onAtivar: () => void
  onDesativar: () => void
}) {
  const map = useMap()

  useEffect(() => {
    if (ativo) map.scrollWheelZoom.enable()
    else map.scrollWheelZoom.disable()
  }, [ativo, map])

  useMapEvents({
    click: onAtivar,
    mouseout: onDesativar,
  })

  return null
}

/** Guarda a instância do mapa para os controles que vivem fora do MapContainer. */
function CapturarMapa({ onPronto }: { onPronto: (map: LeafletMap) => void }) {
  const map = useMap()
  useEffect(() => onPronto(map), [map, onPronto])
  return null
}

interface Props {
  usinas: UsinaOut[]
  destacada?: string | null
  onHover?: (usinaId: string | null) => void
  height?: number
  className?: string
}

export function MapaUsinas({ usinas, destacada, onHover, height = 460, className }: Props) {
  const navigate = useNavigate()
  const tema = useResolvedTheme()
  const estilo = TILES[tema]

  const [mapa, setMapa] = useState<LeafletMap | null>(null)
  const [rodaAtiva, setRodaAtiva] = useState(false)

  const pontos = useMemo(
    () => usinas.filter((u): u is PontoUsina => typeof u.latitude === "number" && typeof u.longitude === "number"),
    [usinas],
  )

  const limites = useMemo<LatLngBoundsExpression | null>(() => {
    if (!pontos.length) return null
    return pontos.map((p) => [p.latitude, p.longitude] as [number, number])
  }, [pontos])

  const reenquadrar = useCallback(() => {
    if (!mapa || !limites) return
    mapa.fitBounds(limites, { padding: [40, 40], maxZoom: 9 })
  }, [mapa, limites])

  // Reenquadra quando o CONJUNTO muda (filtro, busca), e não a cada render: o
  // pai recria a lista toda vez, e reenquadrar sempre anularia o zoom do usuário.
  const chave = pontos.map((p) => p.usina_id).join(",")
  const chaveAnterior = useRef("")
  useEffect(() => {
    if (!mapa || !limites || chave === chaveAnterior.current) return
    chaveAnterior.current = chave
    mapa.fitBounds(limites, { padding: [40, 40], maxZoom: 9 })
  }, [chave, mapa, limites])

  const maxCorte = useMemo(() => Math.max(...pontos.map((p) => Number(p.total_corte_mwh || 0)), 1), [pontos])

  if (pontos.length === 0) {
    return (
      <div className={cn("panel flex min-h-64 items-center justify-center p-6 text-center", className)}>
        <p className="text-sm text-muted-foreground">Nenhuma usina com coordenada no recorte atual.</p>
      </div>
    )
  }

  return (
    <div className={cn("panel relative overflow-hidden", className)}>
      <MapContainer
        center={[-5.5, -38]}
        zoom={7}
        minZoom={3}
        maxZoom={14}
        scrollWheelZoom={false}
        style={{ height }}
        className="w-full"
      >
        <TileLayer key={tema} attribution={ATRIBUICAO} url={estilo.url} />
        <CapturarMapa onPronto={setMapa} />
        <ZoomPorRoda ativo={rodaAtiva} onAtivar={() => setRodaAtiva(true)} onDesativar={() => setRodaAtiva(false)} />

        {/* Maiores primeiro: as menores ficam por cima e não somem atrás delas. */}
        {[...pontos]
          .sort((a, b) => Number(b.total_corte_mwh || 0) - Number(a.total_corte_mwh || 0))
          .map((usina) => {
            const corte = Number(usina.total_corte_mwh || 0)
            // Raio pela raiz: a ÁREA fica proporcional à energia, que é como o
            // olho compara bolhas. Usar o raio direto exagera as maiores.
            const raio = 6 + 14 * Math.sqrt(corte / maxCorte)
            const ativo = usina.usina_id === destacada
            const cor = usina.fonte === "solar" ? estilo.solar : estilo.eolica

            return (
              <CircleMarker
                key={usina.usina_id}
                center={[usina.latitude, usina.longitude]}
                radius={ativo ? raio * 1.35 : raio}
                pathOptions={{
                  color: ativo ? cor : estilo.anel,
                  weight: ativo ? 3 : 1.5,
                  fillColor: cor,
                  fillOpacity: ativo ? 1 : 0.78,
                }}
                eventHandlers={{
                  mouseover: () => onHover?.(usina.usina_id),
                  mouseout: () => onHover?.(null),
                }}
              >
                <Popup>
                  <div className="w-60 p-3">
                    <p className="flex items-center gap-1.5 text-sm font-semibold leading-tight text-popover-foreground">
                      {usina.fonte === "solar" ? (
                        <Sun className="h-3.5 w-3.5 shrink-0 text-solar" />
                      ) : (
                        <Wind className="h-3.5 w-3.5 shrink-0 text-wind" />
                      )}
                      {usina.nome}
                    </p>
                    <p className="mt-0.5 text-[0.6875rem] capitalize text-muted-foreground">
                      {usina.fonte} · {fmtMW(usina.potencia_mw)} · {usina.submercado}
                    </p>

                    <dl className="mt-2.5 space-y-1 border-t border-border pt-2.5 text-xs">
                      {typeof usina.total_corte_mwh === "number" && (
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">Energia cortada</dt>
                          <dd className="tabular font-semibold text-energy">{fmtMWh(usina.total_corte_mwh)}</dd>
                        </div>
                      )}
                      {typeof usina.total_perda_reais === "number" && (
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">Perda financeira</dt>
                          <dd className="tabular font-semibold text-loss">{fmtBRL(usina.total_perda_reais)}</dd>
                        </div>
                      )}
                      {typeof usina.total_perda_ressarcivel_reais === "number" && (
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">Ressarcível</dt>
                          <dd className="tabular font-semibold text-recoverable">
                            {fmtBRL(usina.total_perda_ressarcivel_reais)}
                          </dd>
                        </div>
                      )}
                      {usina.id_ons && (
                        <div className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">ID ONS</dt>
                          <dd className="font-mono text-[0.6875rem]">{usina.id_ons}</dd>
                        </div>
                      )}
                    </dl>

                    <Button
                      size="sm"
                      className="mt-3 h-7 w-full text-xs"
                      onClick={() => navigate(`/usinas/${usina.usina_id}`)}
                    >
                      Analisar esta usina
                    </Button>
                  </div>
                </Popup>
              </CircleMarker>
            )
          })}
      </MapContainer>

      {/* Depois de explorar, um clique volta para o recorte inteiro. */}
      <Button
        variant="outline"
        size="sm"
        onClick={reenquadrar}
        className="absolute right-3 top-3 z-[400] h-8 gap-1.5 bg-card/90 text-xs backdrop-blur"
      >
        <Maximize2 className="h-3.5 w-3.5" />
        Enquadrar tudo
      </Button>

      {!rodaAtiva && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-[400] flex justify-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/90 px-2.5 py-1 text-[0.6875rem] text-muted-foreground backdrop-blur">
            <MousePointerClick className="h-3 w-3" />
            Clique no mapa para aproximar com a roda
          </span>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-3 left-3 z-[400] rounded-lg border border-border bg-card/90 px-3 py-2 backdrop-blur">
        <ul className="space-y-1">
          <li className="flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
            <Wind className="h-3 w-3 text-wind" /> Eólica
          </li>
          <li className="flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
            <Sun className="h-3 w-3 text-solar" /> Solar
          </li>
        </ul>
        <div className="mt-2 flex items-center gap-1.5 border-t border-border pt-2">
          <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
          <span aria-hidden className="inline-block h-3 w-3 rounded-full bg-muted-foreground/60" />
          <span className="ml-0.5 text-[0.625rem] leading-tight text-muted-foreground">
            energia cortada
            <br />
            até {fmtMWhCompacto(maxCorte)}
          </span>
        </div>
      </div>
    </div>
  )
}
