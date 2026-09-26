import { useState } from "react"
import { differenceInCalendarDays, format, startOfYear, subDays } from "date-fns"
import { ptBR } from "date-fns/locale"
import { CalendarIcon, Check } from "lucide-react"
import type { DateRange, Matcher } from "react-day-picker"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { toIso } from "@/lib/formatters"
import { cn } from "@/lib/utils"

interface Props {
  onChange: (inicio: string, fim: string) => void
  defaultDays?: number
  initialFrom?: Date
  initialTo?: Date
  minDate?: Date
  maxDate?: Date
}

/**
 * Seletor de período do app.
 *
 * Os atalhos são ancorados na última data COM DADO (maxDate), não em "hoje": a
 * base do ONS fecha com atraso, e um preset ancorado em hoje devolveria tela
 * vazia na maior parte do ano.
 */
export function DateRangePicker({ onChange, defaultDays = 90, initialFrom, initialTo, minDate, maxDate }: Props) {
  const [open, setOpen] = useState(false)
  const [range, setRange] = useState<DateRange>(() => ({
    from: initialFrom ?? subDays(initialTo ?? maxDate ?? new Date(), defaultDays),
    to: initialTo ?? maxDate ?? new Date(),
  }))

  // O pai recria os objetos Date a cada render, então a sincronização é feita
  // pelo valor (timestamp) e não pela identidade — senão o seletor se
  // redefiniria sozinho em todo render do cabeçalho.
  const chaveExterna = initialFrom && initialTo ? `${initialFrom.getTime()}|${initialTo.getTime()}` : ""
  const [chaveAplicada, setChaveAplicada] = useState(chaveExterna)
  if (chaveExterna && chaveExterna !== chaveAplicada && initialFrom && initialTo) {
    setChaveAplicada(chaveExterna)
    setRange({ from: initialFrom, to: initialTo })
  }

  const anchor = maxDate ?? new Date()

  const presets = [
    { label: "Últimos 30 dias", from: subDays(anchor, 30) },
    { label: "Últimos 90 dias", from: subDays(anchor, 90) },
    { label: "Últimos 6 meses", from: subDays(anchor, 182) },
    { label: "Ano corrente", from: startOfYear(anchor) },
    { label: "Últimos 12 meses", from: subDays(anchor, 365) },
  ].filter((preset) => !minDate || preset.from >= minDate)

  const commit = (from: Date, to: Date) => {
    setRange({ from, to })
    onChange(toIso(from), toIso(to))
  }

  const handleSelect = (next?: DateRange) => {
    if (!next) return
    setRange(next)
    if (next.from && next.to) onChange(toIso(next.from), toIso(next.to))
  }

  const dias = range.from && range.to ? differenceInCalendarDays(range.to, range.from) + 1 : 0
  const label =
    range.from && range.to
      ? `${format(range.from, "dd MMM yy", { locale: ptBR })} – ${format(range.to, "dd MMM yy", { locale: ptBR })}`
      : "Selecionar período"

  const disabledRange: Matcher | undefined =
    minDate && maxDate ? { before: minDate, after: maxDate } : minDate ? { before: minDate } : maxDate ? { after: maxDate } : undefined

  const activePreset = presets.find(
    (preset) =>
      range.from &&
      range.to &&
      differenceInCalendarDays(range.from, preset.from) === 0 &&
      differenceInCalendarDays(range.to, anchor) === 0,
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-2 font-normal">
          <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="tabular text-xs">{label}</span>
          {dias > 0 && <span className="hidden text-[0.6875rem] text-muted-foreground sm:inline">· {dias} d</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex w-auto flex-col p-0 sm:flex-row" align="end">
        <div className="flex shrink-0 flex-row gap-1 overflow-x-auto border-b border-border p-2 sm:w-44 sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-r">
          <p className="hidden px-2 pb-1 pt-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground sm:block">
            Atalhos
          </p>
          {presets.map((preset) => {
            const isActive = activePreset?.label === preset.label
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  commit(preset.from, anchor)
                  setOpen(false)
                }}
                className={cn(
                  "flex shrink-0 items-center justify-between gap-2 whitespace-nowrap rounded-md px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent",
                  isActive ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {preset.label}
                {isActive && <Check className="h-3.5 w-3.5 text-primary" />}
              </button>
            )
          })}
          {maxDate && (
            <p className="mt-auto hidden px-2.5 pt-2 text-[0.625rem] leading-relaxed text-muted-foreground/70 sm:block">
              Dado disponível até {format(maxDate, "dd/MM/yy")}.
            </p>
          )}
        </div>

        <Calendar
          mode="range"
          selected={range}
          onSelect={handleSelect}
          locale={ptBR}
          numberOfMonths={2}
          defaultMonth={range.from}
          disabled={disabledRange}
        />
      </PopoverContent>
    </Popover>
  )
}
