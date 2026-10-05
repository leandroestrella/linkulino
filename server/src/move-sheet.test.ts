import type { Cell } from '@lndrstrll/pomuku-server'
import { describe, expect, it } from 'vitest'
import { describePlan, planMove, serialOf } from '../scripts/move-sheet.ts'

// The first layout, with what real sheets had: three shapes of expense tab, a
// header written by formulas, slots waiting to be filled, hand-typed quirks.
const OLD: Record<string, Cell[][]> = {
  '💩 casa': [
    ['casa', 'maramomra', 46023, '💩', 46387],
    ['Totale speso', 1234.5],
    ['Saldo attuale', 'In pari!'],
    ['TOTALE', '', '', '', 1234.5, '', '', '', 600, 634.5, 12],
    ['Data', 'Descrizione', 'Categoria', 'Pagato da', 'Importo (€)', 'Ricorrente', 'Quota % maria', 'Quota % leandro', 'Quota maria (€)', 'Quota leandro (€)', 'Saldo (+ = deve a maria)', 'Note'],
    [46266, 'affitto', 'Alloggio', 'Maria', 700, true, 50, 50, 350, 350, 350, 'landlord: mr. keys'],
    [46277.5, 'pizza', 'Cibo', 'leandro', '18,5', false, 60, 40, 11.1, 7.4, -11.1, ''],
    // a slot waiting to be filled
    ['', '', '', '', '', '', 50, 50, '', '', '', ''],
  ],
  // the totals closing the rows, the header on row 4, a date typed as text, a payer nobody knows
  '🧉 argchi': [
    ['viaggio', 'argchi', 46010, '🧉', 46040],
    ['Totale speso', 500],
    ['Saldo attuale'],
    ['Data', 'Descrizione', 'Categoria', 'Pagato da', 'Importo (€)', 'Quota % maria', 'Quota % leandro', 'Quota maria (€)', 'Quota leandro (€)', 'Saldo (+ = deve a maria)', 'Note'],
    ['19/12/2025', 'valigie', 'Trasporti', 'leandro', 80, 50, 50, 40, 40, -40],
    ['', 'riconciliazione', 'Mistero', 'hugo', 20, 70, 20, 14, 4, 4, 'DA VERIFICARE'],
    ['TOTALE', '', '', '', 100],
  ],
  // made by the app: the totals pinned above the header, one empty slot
  '🌭 københavn': [
    ['viaggio', 'københavn', '', '🌭', ''],
    ['Totale speso', 0],
    ['Saldo attuale', 0],
    ['TOTALE', '', '', '', 0],
    ['Data', 'Descrizione', 'Categoria', 'Pagato da', 'Importo (€)', 'Quota % maria', 'Quota % leandro', 'Quota maria (€)', 'Quota leandro (€)', 'Saldo (+ = deve a maria)', 'Note'],
    ['', '', '', '', '', 50, 50],
  ],
  history: [['Timestamp', 'Actor'], ['2026-07-30T15:47:55.036Z', 'leandro']],
  categorie: [['Category', 'Emoji', 'Overhead'], ['Alloggio', '🏠', true], ['Cibo', '🍽️', false], ['Trasporti', '🚌', false]],
  users: [['Email', 'Name', 'Icon', 'Enable Runway', 'Savings', 'Language'], ['maria@example.com', 'maria', '⚽'], ['leandro@example.com', 'leandro', '🐠']],
  notes: [['anything else in the file is left alone']],
}

describe('moving a sheet from one tab per trip to one tab of expenses', () => {
  const plan = planMove(OLD)

  it('takes the participants from the first two named rows of the users tab', () => {
    expect(plan.participants).toEqual({ a: 'maria', b: 'leandro' })
  })

  it('makes a row of each trip tab, with an id that will not change when it is renamed', () => {
    expect(plan.trips).toEqual([
      ['argchi', 'argchi', '🧉', 46010, 46040],
      ['kobenhavn', 'københavn', '🌭', '', ''],
    ])
  })

  it('gathers every expense on one tab, naming its trip, and leaves slots and totals behind', () => {
    expect(plan.expenses).toEqual([
      // the payer's name as the users tab writes it, the time of day dropped from the date
      ['', 46266, 'affitto', 'Alloggio', 'maria', 700, 50, 50, true, 'landlord: mr. keys', ''],
      ['', 46277, 'pizza', 'Cibo', 'leandro', 18.5, 60, 40, false, '', ''],
      // a date typed as text becomes a date; a trip's expense never recurs
      ['', 46010, 'valigie', 'Trasporti', 'leandro', 80, 50, 50, '', '', 'argchi'],
      ['', '', 'riconciliazione', 'Mistero', 'hugo', 20, 70, 20, '', 'DA VERIFICARE', 'argchi'],
    ])
    expect(plan.sources).toEqual([
      { tab: '💩 casa', kind: 'household', trip: '', expenses: 2 },
      { tab: '🧉 argchi', kind: 'trip', trip: 'argchi', expenses: 2 },
      { tab: '🌭 københavn', kind: 'trip', trip: 'kobenhavn', expenses: 0 },
    ])
  })

  it('says what a person should look at', () => {
    expect(plan.notes).toEqual([
      '"🧉 argchi" row 6 (riconciliazione): no date',
      '"🧉 argchi" row 6 (riconciliazione): paid by "hugo", who is not one of the two participants; kept as it is',
      '"🧉 argchi" row 6 (riconciliazione): the shares are 70% and 20%, which is not 100% in all',
      '"🧉 argchi" row 6 (riconciliazione): the category "Mistero" is not on the categories tab',
    ])
    expect(describePlan(plan)).toContain('Spese: 4 expenses')
  })

  it('reads a day written either way, and nothing that is not a day', () => {
    expect([serialOf('2025-12-19'), serialOf('19/12/2025'), serialOf('1/9/2026')]).toEqual([46010, 46010, 46266])
    expect([serialOf('31/02/2026'), serialOf('soon')]).toEqual([null, null])
  })
})
