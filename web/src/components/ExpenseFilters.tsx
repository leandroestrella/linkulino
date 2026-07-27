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
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1.5">
        <label className="text-muted-foreground text-xs">{t('filters.category')}</label>
        <Select
          value={filters.category || ALL}
          onValueChange={(v) => onChange({ ...filters, category: v === ALL ? '' : v })}
        >
          <SelectTrigger size="sm" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('filters.all')}</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.name} value={c.name}>
                {c.icon} {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-muted-foreground text-xs">{t('filters.payer')}</label>
        <Select
          value={filters.payer || ALL}
          onValueChange={(v) => onChange({ ...filters, payer: v === ALL ? '' : v })}
        >
          <SelectTrigger size="sm" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('filters.all')}</SelectItem>
            {participants.map((p) => (
              <SelectItem key={p.name} value={p.name}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-muted-foreground text-xs">{t('filters.from')}</label>
        <Input
          type="date"
          value={filters.from}
          onChange={(e) => onChange({ ...filters, from: e.target.value })}
          className="w-36"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-muted-foreground text-xs">{t('filters.to')}</label>
        <Input
          type="date"
          value={filters.to}
          onChange={(e) => onChange({ ...filters, to: e.target.value })}
          className="w-36"
        />
      </div>

      {hasActiveFilters(filters) && (
        <Button variant="ghost" size="sm" onClick={() => onChange(EMPTY_FILTERS)}>
          <XIcon className="size-4" />
          {t('filters.clear')}
        </Button>
      )}
    </div>
  )
}
