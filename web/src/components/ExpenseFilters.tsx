import { useTranslation } from 'react-i18next'
import { XIcon } from 'lucide-react'
import type { Category, Participant } from '@/api/types'
import { PersonIcon } from '@/components/PersonName'
import {
  EMPTY_FILTERS,
  hasActiveFilters,
  matchingTimeframeKey,
  TIMEFRAME_KEYS,
  timeframeRange,
  type ExpenseFilterValues,
} from '@/lib/filters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/** Sentinel for "no filter" — shadcn's Select doesn't allow an empty-string item value. */
const ALL = '__all__'

export function ExpenseFilters({
  categories,
  participants,
  filters,
  onChange,
}: {
  categories: Category[]
  participants: Participant[]
  filters: ExpenseFilterValues
  onChange: (filters: ExpenseFilterValues) => void
}) {
  const { t } = useTranslation()
  const timeframeKey = matchingTimeframeKey(filters)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={timeframeKey ?? ALL}
        onValueChange={(v) => {
          if (v === ALL) return onChange({ ...filters, from: '', to: '' })
          const range = timeframeRange(v as (typeof TIMEFRAME_KEYS)[number])
          onChange({ ...filters, from: range.from, to: range.to })
        }}
      >
        <SelectTrigger size="sm" className="w-full sm:w-auto">
          <SelectValue placeholder={t('filters.timeframe')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('filters.timeframe')}</SelectItem>
          {TIMEFRAME_KEYS.map((key) => (
            <SelectItem key={key} value={key}>
              {t(`filters.${key}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        type="date"
        value={filters.from}
        onChange={(e) => onChange({ ...filters, from: e.target.value })}
        aria-label={t('filters.from')}
        className="h-8 w-full sm:w-auto"
      />

      <Input
        type="date"
        value={filters.to}
        onChange={(e) => onChange({ ...filters, to: e.target.value })}
        aria-label={t('filters.to')}
        className="h-8 w-full sm:w-auto"
      />

      <Select
        value={filters.category || ALL}
        onValueChange={(v) => onChange({ ...filters, category: v === ALL ? '' : v })}
      >
        <SelectTrigger size="sm" className="w-full sm:w-auto">
          <SelectValue placeholder={t('filters.category')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('filters.category')}</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c.name} value={c.name}>
              {c.icon} {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Grouped so they wrap together as a pair — never leaves the clear
          button isolated alone on its own line. */}
      <div className="flex w-full items-center gap-2 sm:w-auto">
        <Select value={filters.payer || ALL} onValueChange={(v) => onChange({ ...filters, payer: v === ALL ? '' : v })}>
          <SelectTrigger size="sm" className="w-full sm:w-auto">
            <SelectValue placeholder={t('filters.payer')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('filters.payer')}</SelectItem>
            {participants.map((p) => (
              <SelectItem key={p.name} value={p.name}>
                <PersonIcon icon={p.icon} /> {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters(filters) && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                aria-label={t('filters.clear')}
                onClick={() => onChange(EMPTY_FILTERS)}
              >
                <XIcon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('filters.clear')}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  )
}
