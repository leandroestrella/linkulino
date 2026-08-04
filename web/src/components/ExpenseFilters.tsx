import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SlidersHorizontalIcon, XIcon } from 'lucide-react'
import type { Category, Participant } from '@/api/types'
import { PersonIcon } from '@/components/PersonName'
import {
  activeFilterCount,
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
  const [expanded, setExpanded] = useState(false)
  const timeframeKey = matchingTimeframeKey(filters)
  const activeCount = activeFilterCount(filters)

  return (
    <div className="flex flex-col gap-2">
      {/* On mobile, the filters live behind a toggle (submenu) instead of always
          taking up their own space; sm+ always shows the full row. */}
      <Button
        type="button"
        size="sm"
        variant={activeCount ? 'default' : 'outline'}
        className="w-full gap-1 sm:hidden"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <SlidersHorizontalIcon className="size-3.5" />
        {t('filters.title')}
        {activeCount > 0 && ` (${activeCount})`}
      </Button>

      <div className={`flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-1 ${expanded ? 'flex' : 'hidden'} sm:flex`}>
        <Select
          value={timeframeKey ?? ALL}
          onValueChange={(v) => {
            if (v === ALL) return onChange({ ...filters, from: '', to: '' })
            const range = timeframeRange(v as (typeof TIMEFRAME_KEYS)[number])
            onChange({ ...filters, from: range.from, to: range.to })
          }}
        >
          <SelectTrigger size="sm" className="w-full sm:w-auto sm:shrink-0 sm:px-1.5 sm:text-sm">
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
          className="h-8 w-full [&::-webkit-calendar-picker-indicator]:ml-0 [&::-webkit-calendar-picker-indicator]:p-0.5 sm:h-7 sm:w-auto sm:shrink-0 sm:px-1 sm:text-sm"
        />

        <Input
          type="date"
          value={filters.to}
          onChange={(e) => onChange({ ...filters, to: e.target.value })}
          aria-label={t('filters.to')}
          className="h-8 w-full [&::-webkit-calendar-picker-indicator]:ml-0 [&::-webkit-calendar-picker-indicator]:p-0.5 sm:h-7 sm:w-auto sm:shrink-0 sm:px-1 sm:text-sm"
        />

        <Select
          value={filters.split}
          onValueChange={(v) => onChange({ ...filters, split: v as ExpenseFilterValues['split'] })}
        >
          <SelectTrigger size="sm" className="w-full sm:w-auto sm:shrink-0 sm:px-1.5 sm:text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="common">{t('filters.common')}</SelectItem>
            <SelectItem value="single">{t('filters.singleUser')}</SelectItem>
            <SelectItem value="all">{t('filters.all')}</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.category || ALL}
          onValueChange={(v) => onChange({ ...filters, category: v === ALL ? '' : v })}
        >
          <SelectTrigger size="sm" className="w-full sm:w-auto sm:max-w-24 sm:shrink-0 sm:px-1.5 sm:text-sm lowercase">
            <SelectValue placeholder={t('filters.category')} className="truncate" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('filters.category')}</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.name} value={c.name} className="lowercase">
                {c.icon} {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Grouped so they wrap together as a pair on mobile (where the
            submenu can still wrap) — on sm+ the row is nowrap so this is
            just a shrink-0 unit at the end. */}
        <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto sm:gap-1">
          <Select value={filters.payer || ALL} onValueChange={(v) => onChange({ ...filters, payer: v === ALL ? '' : v })}>
            <SelectTrigger size="sm" className="w-full sm:w-auto sm:max-w-24 sm:shrink-0 sm:px-1.5 sm:text-sm">
              <SelectValue placeholder={t('filters.payer')} className="truncate" />
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
                  size="icon-sm"
                  className="shrink-0"
                  aria-label={t('filters.clear')}
                  onClick={() => onChange({ ...EMPTY_FILTERS, split: 'common' })}
                >
                  <XIcon className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('filters.clear')}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  )
}
