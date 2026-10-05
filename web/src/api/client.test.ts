/**
 * Client tests with no backend configured (`hasBackend` is false): everything
 * is answered by the in-page demo over the sample fixtures.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** A fresh client, and so a fresh copy of the fixtures. */
async function loadClient() {
  vi.resetModules()
  return import('./client')
}
let api: Awaited<ReturnType<typeof loadClient>>
beforeEach(async () => {
  api = await loadClient()
})

const draft = { date: '2026-10-05', description: 'fondue', category: 'dining out', payer: 'mara', amount: 72.4, splits: { momra: 0, mara: 100 }, recurring: false, notes: '' }

describe('the demo', () => {
  it('serves the sample household and each trip apart', async () => {
    const [household, mountains, trips, people] = await Promise.all([api.getExpenses(), api.getExpenses('mountains'), api.getTrips(), api.getParticipants()])
    expect(people).toEqual([{ name: 'momra', icon: '🐠' }, { name: 'mara', icon: '⚽' }])
    expect(trips.map((trip) => trip.id)).toEqual(['seaside', 'mountains', 'city-break'])
    expect(mountains.map((expense) => expense.description)).toEqual(['cabin rental'])
    expect(household.find((expense) => expense.id === 'exp-1')).toMatchObject({ description: 'rent', splits: { momra: 50, mara: 50 }, recurring: true })
    expect(household.some((expense) => expense.description === 'cabin rental')).toBe(false)
  })

  it('takes an expense on a trip, an edit and a removal, and logs each', async () => {
    const added = await api.addExpense(draft, 'mountains')
    expect(added).toMatchObject({ description: 'fondue', splits: { momra: 0, mara: 100 }, recurring: false })
    await api.updateExpense(added.id, { ...draft, amount: 80, splits: { momra: 50, mara: 50 } }, 'mountains')
    expect((await api.getExpenses('mountains')).find((expense) => expense.id === added.id)?.amount).toBe(80)
    expect((await api.getHistory())[0]).toMatchObject({ action: 'update', entity: 'expense', entityId: added.id, sheetId: 'mountains', amount: 80, changes: 'amount: 72.4 → 80; split momra: 0 → 50; split mara: 100 → 50' })
    await api.deleteExpense(added.id, 'mountains')
    expect((await api.getHistory())[0]).toMatchObject({ action: 'delete', entityId: '', label: 'fondue', category: 'dining out', amount: 80 })
  })

  it('gives a new trip a readable id that a rename leaves alone, and deletes it with its expenses', async () => {
    const trip = await api.createTrip({ name: 'København', emoji: '', startDate: '2026-11-01', endDate: '' })
    expect(trip).toEqual({ id: 'kobenhavn', name: 'København', emoji: '🧳', startDate: '2026-11-01', endDate: '' })
    expect((await api.createTrip({ name: 'kobenhavn', emoji: '🌭', startDate: '', endDate: '' })).id).toBe('kobenhavn-2')
    await api.addExpense(draft, trip.id)
    expect((await api.updateTrip(trip.id, { name: 'copenhagen', emoji: '🌭', startDate: '', endDate: '' })).id).toBe('kobenhavn')
    await api.deleteTrip(trip.id)
    expect((await api.getTrips()).map((each) => each.id)).not.toContain('kobenhavn')
    expect(await api.getExpenses(trip.id)).toEqual([])
    expect((await api.getHistory()).slice(0, 2).map((entry) => [entry.action, entry.entity, entry.label])).toEqual([['delete', 'trip', '🌭 copenhagen'], ['delete', 'expense', 'fondue']])
  })

  it('keeps the sample runway settings and a new category for the visit', async () => {
    expect(await api.getRunwaySettings()).toEqual({ enableRunway: true, savings: 8000 })
    expect(await api.updateRunwaySettings({ enableRunway: false, savings: 100 })).toEqual({ enableRunway: false, savings: 100 })
    expect(await api.getRunwaySettings()).toEqual({ enableRunway: false, savings: 100 })
    await api.addCategory({ name: 'pets', icon: '🐕', overhead: false })
    expect((await api.getCategories()).at(-1)).toEqual({ name: 'pets', icon: '🐕', overhead: false })
  })
})
