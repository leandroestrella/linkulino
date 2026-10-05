import { describe, expect, it } from 'vitest'
import { expensesToRecreate } from './recurring.js'
import { nameId } from './schema.js'

const expense = (fields: Partial<Parameters<typeof expensesToRecreate>[0][number]>) => ({
  date: null, description: null, category: null, payer: null, amount: null, splitA: 50, splitB: 50, recurring: false, notes: null, trip: null,
  ...fields,
})

describe('recurring expenses', () => {
  it('copies the latest occurrence of each recurring description, dated today', () => {
    const due = expensesToRecreate(
      [
        expense({ date: '2026-08-01', description: 'rent', amount: 700, recurring: true, payer: 'maria' }),
        expense({ date: '2026-09-01', description: 'rent', amount: 750, recurring: true, payer: 'maria', splitA: 60, splitB: 40, notes: 'landlord: mr. keys' }),
        expense({ date: '2026-09-12', description: 'pizza', amount: 20 }),
      ],
      '2026-10-01',
    )
    expect(due).toEqual([expense({ date: '2026-10-01', description: 'rent', amount: 750, recurring: true, payer: 'maria', splitA: 60, splitB: 40, notes: 'landlord: mr. keys' })])
  })

  it('skips a description that already has an entry this month, recurring or not', () => {
    const expenses = [
      expense({ date: '2026-09-01', description: 'rent', recurring: true }),
      expense({ date: '2026-10-03', description: 'rent' }),
      expense({ date: '2026-09-01', description: 'internet', recurring: true }),
    ]
    expect(expensesToRecreate(expenses, '2026-10-05').map((due) => due.description)).toEqual(['internet'])
  })

  it('leaves trips out: their expenses never recur, and never stand in for a household one', () => {
    const expenses = [
      expense({ date: '2026-09-01', description: 'rent', recurring: true }),
      expense({ date: '2026-10-02', description: 'rent', trip: 'cala-gonone' }),
      expense({ date: '2026-09-01', description: 'hotel', recurring: true, trip: 'cala-gonone' }),
    ]
    expect(expensesToRecreate(expenses, '2026-10-05').map((due) => due.description)).toEqual(['rent'])
  })
})

describe('an id made from a name', () => {
  it('is a readable slug, with letters that have no accent to strip written out', () => {
    expect(nameId('Cala Gonone')).toBe('cala-gonone')
    expect(nameId('København')).toBe('kobenhavn')
    expect(nameId('Attività')).toBe('attivita')
  })

  it('is random for a name with nothing to make a slug from', () => {
    expect(nameId('🧳')).toMatch(/^[2-9a-z]{8}$/)
  })
})
