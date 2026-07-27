const test = require('node:test')
const assert = require('node:assert/strict')
const sheet = require('./sheet.js')

test('classifyTab', () => {
  assert.equal(sheet.classifyTab('Impostazioni', ''), sheet.TAB_TYPE.settings)
  assert.equal(sheet.classifyTab('Viaggio - Modello', 'viaggio'), sheet.TAB_TYPE.ignore)
  assert.equal(sheet.classifyTab('wise raw copenhagen', ''), sheet.TAB_TYPE.ignore)
  assert.equal(sheet.classifyTab('casa nostra', 'casa'), sheet.TAB_TYPE.household)
  assert.equal(sheet.classifyTab('lisbon 2026', 'viaggio'), sheet.TAB_TYPE.trip)
  assert.equal(sheet.classifyTab('something else', ''), sheet.TAB_TYPE.ignore)
})

test('parseTabMeta reads the row-1 marker cells', () => {
  const meta = sheet.parseTabMeta(['viaggio', 'Lisbon', '24/08/2026', '🐚', '30/08/2026'])
  assert.deepEqual(meta, { name: 'Lisbon', startDate: '2026-08-24', emoji: '🐚', endDate: '2026-08-30' })
})

test('parseParticipants finds names by label, ignoring row position', () => {
  const values = [
    ['[merged] Impostazioni condivise'],
    ['Nome Persona A', 'Alex'],
    ['Nome Persona B', 'Sam'],
    ['a trailing note row'],
  ]
  assert.deepEqual(sheet.parseParticipants(values), { a: 'Alex', b: 'Sam' })
})

test('parseParticipants tolerates a missing tab shape', () => {
  assert.deepEqual(sheet.parseParticipants([]), { a: '', b: '' })
})

test('cellToIsoDate handles Date objects and DD/MM/YYYY strings', () => {
  assert.equal(sheet.cellToIsoDate(new Date(2026, 6, 3)), '2026-07-03')
  assert.equal(sheet.cellToIsoDate('03/07/2026'), '2026-07-03')
  assert.equal(sheet.cellToIsoDate(''), '')
  assert.equal(sheet.cellToIsoDate('not a date'), '')
})

function householdFixture() {
  const participants = { a: 'Alex', b: 'Sam' }
  const values = [
    ['casa', 'casa nostra', '', '', ''],
    ['Totale speso', '€ 20.08'],
    ['Saldo attuale', 'Sam deve a Alex: € 10.04'],
    ['Data', 'Descrizione', 'Categoria', 'Pagato da', 'Importo (€)', 'Quota % Alex', 'Quota % Sam', 'Quota Alex (€)', 'Quota Sam (€)', 'Saldo'],
    ['03/07/2026', 'groceries', 'Spesa', 'Alex', 20.08, 50, 50, 10.04, 10.04, -10.04],
    ['', '', '', '', '', 50, 50, '', '', ''],
    ['', '', '', '', '', 50, 50, '', '', ''],
  ]
  return { participants, values }
}

test('findHeaderRowIndex locates the "Data" row', () => {
  const { values } = householdFixture()
  assert.equal(sheet.findHeaderRowIndex(values), 3)
  assert.equal(sheet.findHeaderRowIndex([['no header here']]), -1)
})

test('parseExpenses maps filled rows and skips blank slots', () => {
  const { values, participants } = householdFixture()
  const expenses = sheet.parseExpenses(values, participants)
  assert.equal(expenses.length, 1)
  assert.deepEqual(expenses[0], {
    id: '5',
    date: '2026-07-03',
    description: 'groceries',
    category: 'Spesa',
    payer: 'Alex',
    amount: 20.08,
    splits: { Alex: 50, Sam: 50 },
  })
})

test('findBlankSlotRow finds the first fully-empty row after the header', () => {
  const { values } = householdFixture()
  assert.equal(sheet.findBlankSlotRow(values), 6)
})

test('findBlankSlotRow returns -1 when no tab is present', () => {
  assert.equal(sheet.findBlankSlotRow([['no header here']]), -1)
})

test('buildExpenseRowValues formats the date back to DD/MM/YYYY', () => {
  const row = sheet.buildExpenseRowValues({
    date: '2026-07-03',
    description: 'groceries',
    category: 'Spesa',
    payer: 'Alex',
    amount: 20.08,
  })
  assert.deepEqual(row, ['03/07/2026', 'groceries', 'Spesa', 'Alex', 20.08])
})
