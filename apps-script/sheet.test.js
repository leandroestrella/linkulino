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

test('tripTabName joins emoji and name', () => {
  assert.equal(sheet.tripTabName({ name: 'lisbon', emoji: '🐚' }), '🐚 lisbon')
})

test('buildTripRow1Values builds the row-1 metadata for a new trip tab', () => {
  const row1 = sheet.buildTripRow1Values({
    name: 'lisbon',
    emoji: '🐚',
    startDate: '2026-08-24',
    endDate: '2026-08-30',
  })
  assert.deepEqual(row1, ['viaggio', 'lisbon', '24/08/2026', '🐚', '30/08/2026'])
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

test('isoToDmy formats an ISO date back to DD/MM/YYYY', () => {
  assert.equal(sheet.isoToDmy('2026-07-03'), '03/07/2026')
  assert.equal(sheet.isoToDmy(''), '')
  assert.equal(sheet.isoToDmy('not a date'), 'not a date')
})

test('cellToBool accepts a real boolean or a TRUE/FALSE string', () => {
  assert.equal(sheet.cellToBool(true), true)
  assert.equal(sheet.cellToBool(false), false)
  assert.equal(sheet.cellToBool('TRUE'), true)
  assert.equal(sheet.cellToBool('true'), true)
  assert.equal(sheet.cellToBool('FALSE'), false)
  assert.equal(sheet.cellToBool(''), false)
})

function householdFixture() {
  const participants = { a: 'Alex', b: 'Sam' }
  const values = [
    ['casa', 'casa nostra', '', '', ''],
    ['Totale speso', '€ 20.08'],
    ['Saldo attuale', 'Sam deve a Alex: € 10.04'],
    [
      'Data',
      'Descrizione',
      'Categoria',
      'Pagato da',
      'Importo (€)',
      'Quota % Alex',
      'Quota % Sam',
      'Quota Alex (€)',
      'Quota Sam (€)',
      'Saldo',
      'Ricorrente',
    ],
    ['03/07/2026', 'groceries', 'Spesa', 'Alex', 20.08, 50, 50, 10.04, 10.04, -10.04, 'TRUE'],
    ['', '', '', '', '', 50, 50, '', '', '', ''],
    ['', '', '', '', '', 50, 50, '', '', '', ''],
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
    recurring: true,
  })
})

test('findBlankSlotRow finds the first fully-empty row after the header', () => {
  const { values } = householdFixture()
  assert.equal(sheet.findBlankSlotRow(values), 6)
})

test('findBlankSlotRow returns -1 when no tab is present', () => {
  assert.equal(sheet.findBlankSlotRow([['no header here']]), -1)
})

test('buildExpenseRowValues formats the date and maps splits by participant name', () => {
  const row = sheet.buildExpenseRowValues(
    {
      date: '2026-07-03',
      description: 'groceries',
      category: 'Spesa',
      payer: 'Alex',
      amount: 20.08,
      splits: { Alex: 30, Sam: 70 },
    },
    { a: 'Alex', b: 'Sam' },
  )
  assert.deepEqual(row, ['03/07/2026', 'groceries', 'Spesa', 'Alex', 20.08, 30, 70])
})

test('expensesToRecreateThisMonth recreates a recurring expense not yet logged this month', () => {
  const expenses = [
    {
      id: '1',
      date: '2026-06-30',
      description: 'fibra',
      category: 'Bollette',
      payer: 'Alex',
      amount: 22.9,
      splits: { Alex: 50, Sam: 50 },
      recurring: true,
    },
  ]
  const toCreate = sheet.expensesToRecreateThisMonth(expenses, '2026-07-01')
  assert.deepEqual(toCreate, [
    {
      date: '2026-07-01',
      description: 'fibra',
      category: 'Bollette',
      payer: 'Alex',
      amount: 22.9,
      splits: { Alex: 50, Sam: 50 },
      recurring: true,
    },
  ])
})

test('expensesToRecreateThisMonth is idempotent — skips a description already logged this month', () => {
  const expenses = [
    {
      id: '1',
      date: '2026-06-30',
      description: 'fibra',
      category: 'Bollette',
      payer: 'Alex',
      amount: 22.9,
      splits: { Alex: 50, Sam: 50 },
      recurring: true,
    },
    {
      id: '2',
      date: '2026-07-01',
      description: 'fibra',
      category: 'Bollette',
      payer: 'Alex',
      amount: 22.9,
      splits: { Alex: 50, Sam: 50 },
      recurring: true,
    },
  ]
  assert.deepEqual(sheet.expensesToRecreateThisMonth(expenses, '2026-07-15'), [])
})

test('expensesToRecreateThisMonth ignores non-recurring expenses', () => {
  const expenses = [
    {
      id: '1',
      date: '2026-06-15',
      description: 'one-off gift',
      category: 'Altro',
      payer: 'Sam',
      amount: 16,
      splits: { Alex: 50, Sam: 50 },
      recurring: false,
    },
  ]
  assert.deepEqual(sheet.expensesToRecreateThisMonth(expenses, '2026-07-01'), [])
})

test('expensesToRecreateThisMonth uses the most recent occurrence as the template', () => {
  const expenses = [
    {
      id: '1',
      date: '2026-05-30',
      description: 'fibra',
      category: 'Bollette',
      payer: 'Alex',
      amount: 20,
      splits: { Alex: 50, Sam: 50 },
      recurring: true,
    },
    {
      id: '2',
      date: '2026-06-30',
      description: 'fibra',
      category: 'Bollette',
      payer: 'Alex',
      amount: 22.9,
      splits: { Alex: 50, Sam: 50 },
      recurring: true,
    },
  ]
  const toCreate = sheet.expensesToRecreateThisMonth(expenses, '2026-07-01')
  assert.equal(toCreate.length, 1)
  assert.equal(toCreate[0].amount, 22.9)
})
