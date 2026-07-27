import { useTranslation } from 'react-i18next'
import { XIcon } from 'lucide-react'
import type { Category, Participant } from '@/api/types'
import { EMPTY_FILTERS, hasActiveFilters, type ExpenseFilterValues } from '@/lib/filters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

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

  return (
    <div className="flex flex-wrap items-center gap-2">
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

      <Select value={filters.payer || ALL} onValueChange={(v) => onChange({ ...filters, payer: v === ALL ? '' : v })}>
        <SelectTrigger size="sm" className="w-full sm:w-auto">
          <SelectValue placeholder={t('filters.payer')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('filters.payer')}</SelectItem>
          {participants.map((p) => (
            <SelectItem key={p.name} value={p.name}>
              {p.name}
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

      {hasActiveFilters(filters) && (
        <Button variant="ghost" size="sm" onClick={() => onChange(EMPTY_FILTERS)} className="gap-1">
          <XIcon className="size-3.5" />
          {t('filters.clear')}
        </Button>
      )}
    </div>
  )
}
