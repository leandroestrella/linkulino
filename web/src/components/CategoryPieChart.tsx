import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Category, Expense } from '@/api/types'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { type ExpenseFilterValues, filtersToSearch } from '@/lib/filters'
import { formatAmount } from '@/lib/format'

/**
 * Fixed-order categorical palette (validated for CVD/contrast — see the
 * dataviz skill's reference palette). Assigned by rank, never re-cycled per
 * category name, so the mapping is only stable within a single chart.
 */
const PALETTE = [
  '#2a78d6', // blue
  '#eb6834', // orange
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#e87ba4', // magenta
  '#008300', // green
  '#4a3aa7', // violet
]
/** Past this many explicit slices, the remainder folds into "Other" (dataviz skill's series ladder). */
const MAX_SLICES = 6

interface Slice {
  name: string
  icon: string
  value: number
  color: string
  fraction: number
}

function totalsByCategory(expenses: Expense[]): [string, number][] {
  const totals = new Map<string, number>()
  for (const expense of expenses) {
    totals.set(expense.category, (totals.get(expense.category) ?? 0) + expense.amount)
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1])
}

function toSlices(expenses: Expense[], categories: Category[]): Slice[] {
  const ranked = totalsByCategory(expenses)
  const top = ranked.slice(0, MAX_SLICES)
  const rest = ranked.slice(MAX_SLICES)
  const total = ranked.reduce((sum, [, value]) => sum + value, 0)
  if (total === 0) return []

  const slices: Omit<Slice, 'color'>[] = top.map(([name, value]) => ({
    name,
    icon: categories.find((c) => c.name === name)?.icon ?? '💸',
    value,
    fraction: value / total,
  }))
  if (rest.length > 0) {
    const restTotal = rest.reduce((sum, [, value]) => sum + value, 0)
    slices.push({ name: 'other', icon: '➕', value: restTotal, fraction: restTotal / total })
  }
  return slices.map((slice, i) => ({ ...slice, color: PALETTE[i % PALETTE.length] }))
}

function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
}

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  // A full circle can't be drawn as a single arc; nudge it just under 360°.
  const clampedEnd = endAngle - startAngle >= Math.PI * 2 ? startAngle + Math.PI * 2 - 0.0001 : endAngle
  const start = polarToCartesian(cx, cy, r, clampedEnd)
  const end = polarToCartesian(cx, cy, r, startAngle)
  const largeArc = clampedEnd - startAngle > Math.PI ? 1 : 0
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`
}

/**
 * A pie chart (with legend) of expense totals by category. Renders nothing
 * when there's no data. When `linkFilters` is given, each slice (except the
 * folded-together "Other") links back to the home dashboard filtered to that
 * category, layered on top of `linkFilters` (e.g. a month's date range).
 */
export function CategoryPieChart({
  expenses,
  categories,
  linkFilters,
}: {
  expenses: Expense[]
  categories: Category[]
  linkFilters?: Partial<ExpenseFilterValues>
}) {
  const navigate = useNavigate()
  const [hovered, setHovered] = useState<string | null>(null)
  const slices = toSlices(expenses, categories)
  if (slices.length === 0) return null

  const r = 40
  const cx = 44
  const cy = 44
  let angle = -Math.PI / 2 // 12 o'clock
  const arcs = slices.map((slice) => {
    const startAngle = angle
    const endAngle = angle + slice.fraction * Math.PI * 2
    angle = endAngle
    return { ...slice, d: arcPath(cx, cy, r, startAngle, endAngle) }
  })

  const goToCategory = (name: string) => {
    if (!linkFilters || name === 'other') return
    navigate(`/${filtersToSearch({ ...linkFilters, category: name })}`)
  }
  const clickable = (name: string) => !!linkFilters && name !== 'other'

  return (
    <div className="flex flex-wrap items-center gap-4 pt-1">
      <svg viewBox="0 0 88 88" className="size-20 shrink-0" role="img" aria-label="expenses by category">
        {arcs.map((arc) => (
          <Tooltip key={arc.name}>
            <TooltipTrigger asChild>
              <path
                d={arc.d}
                fill={arc.color}
                stroke="var(--card)"
                strokeWidth="1"
                opacity={hovered && hovered !== arc.name ? 0.4 : 1}
                className={`transition-opacity ${clickable(arc.name) ? 'cursor-pointer' : ''}`}
                onClick={() => goToCategory(arc.name)}
                onMouseEnter={() => setHovered(arc.name)}
                onMouseLeave={() => setHovered(null)}
              />
            </TooltipTrigger>
            <TooltipContent className="lowercase">
              {arc.icon} {arc.name} · {formatAmount(arc.value)}
            </TooltipContent>
          </Tooltip>
        ))}
      </svg>
      <div className="flex flex-col gap-1">
        {arcs.map((arc) => (
          <div
            key={arc.name}
            className={`flex items-center gap-1.5 rounded-sm px-1 -mx-1 text-xs transition-colors ${clickable(arc.name) ? 'cursor-pointer' : ''} ${hovered === arc.name ? 'bg-muted' : ''}`}
            onClick={() => goToCategory(arc.name)}
            onMouseEnter={() => setHovered(arc.name)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className="inline-block size-2.5 shrink-0" style={{ backgroundColor: arc.color }} aria-hidden />
            <Tooltip>
              <TooltipTrigger asChild>
                <span>{arc.icon}</span>
              </TooltipTrigger>
              <TooltipContent className="lowercase">{arc.name}</TooltipContent>
            </Tooltip>
            <span className="text-muted-foreground lowercase">{arc.name}</span>
            <span className="font-medium">{formatAmount(arc.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
