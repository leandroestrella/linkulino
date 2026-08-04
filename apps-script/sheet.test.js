const test = require('node:test')
const assert = require('node:assert/strict')
const sheet = require('./sheet.js')

test('classifyTab', () => {
  assert.equal(sheet.classifyTab('Users', ''), sheet.TAB_TYPE.ignore)
  assert.equal(sheet.classifyTab('Categorie', ''), sheet.TAB_TYPE.ignore)
  assert.equal(sheet.classifyTab(sheet.TEMPLATE_TAB, 'viaggio'), sheet.TAB_TYPE.ignore)
  assert.equal(sheet.classifyTab('wise raw copenhagen', ''), sheet.TAB_TYPE.ignore)
  assert.equal(sheet.classifyTab('casa nostra', 'casa'), sheet.TAB_TYPE.household)
  assert.equal(sheet.classifyTab('lisbon 2026', 'viaggio'), sheet.TAB_TYPE.trip)
  assert.equal(sheet.classifyTab('something else', ''), sheet.TAB_TYPE.ignore)
})

test('normalizeTabName treats en/em dashes as a plain hyphen', () => {
  assert.equal(sheet.normalizeTabName('Viaggio - Modello'), 'Viaggio - Modello')
  assert.equal(sheet.normalizeTabName('Viaggio – Modello'), 'Viaggio - Modello')
  assert.equal(sheet.normalizeTabName('Viaggio — Modello'), 'Viaggio - Modello')
})

test('classifyTab ignores the template tab even with a typographic dash', () => {
  assert.equal(sheet.classifyTab('Viaggio – Modello (copiare non modificare)', 'viaggio'), sheet.TAB_TYPE.ignore)
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

test('buildTripHeaderRow builds A-E labels plus each participant\'s Quota columns', () => {
  const header = sheet.buildTripHeaderRow({ a: { name: 'Alex' }, b: { name: 'Sam' } })
  assert.deepEqual(header, [
    'Data',
    'Descrizione',
    'Categoria',
    'Pagato da',
    'Importo (€)',
    'Quota % Alex',
    'Quota % Sam',
    'Quota Alex (€)',
    'Quota Sam (€)',
    'Saldo (+ = deve a Alex)',
  ])
})

test('buildTripHeaderRow falls back to placeholder names when participants are missing', () => {
  const header = sheet.buildTripHeaderRow({ a: null, b: null })
  assert.equal(header[5], 'Quota % Persona A')
  assert.equal(header[6], 'Quota % Persona B')
})

test('parseParticipants reads the first two named rows, in order, with their icon', () => {
  const values = [
    ['Email', 'Name', 'Icon'],
    ['alex@example.com', 'Alex', '🧮'],
    ['sam@example.com', 'Sam', '🎯'],
  ]
  assert.deepEqual(sheet.parseParticipants(values), {
    a: { name: 'Alex', icon: '🧮' },
    b: { name: 'Sam', icon: '🎯' },
  })
})

test('parseParticipants skips rows with no name and ignores column order', () => {
  const values = [
    ['Icon', 'Email', 'Name'],
    ['🧮', 'alex@example.com', 'Alex'],
    ['', 'nobody@example.com', ''],
    ['🎯', 'sam@example.com', 'Sam'],
  ]
  assert.deepEqual(sheet.parseParticipants(values), {
    a: { name: 'Alex', icon: '🧮' },
    b: { name: 'Sam', icon: '🎯' },
  })
})

test('parseParticipants tolerates a missing or headerless tab', () => {
  assert.deepEqual(sheet.parseParticipants([]), { a: null, b: null })
  assert.deepEqual(sheet.parseParticipants([['no name column here']]), { a: null, b: null })
})

test('parseCategories reads name/icon/overhead, skipping the header and blank rows', () => {
  const values = [
    ['Categoria', 'Emoji', 'Overhead'],
    ['Groceries', '🛒', true],
    ['', '', ''],
    ['Rent', '🏠', 'TRUE'],
    ['Dining out', '🍽️', ''],
  ]
  assert.deepEqual(sheet.parseCategories(values), [
    { name: 'Groceries', icon: '🛒', overhead: true },
    { name: 'Rent', icon: '🏠', overhead: true },
    { name: 'Dining out', icon: '🍽️', overhead: false },
  ])
})

test('parseCategories defaults overhead to false when the column is missing entirely', () => {
  const values = [
    ['Categoria', 'Emoji'],
    ['Groceries', '🛒'],
  ]
  assert.deepEqual(sheet.parseCategories(values), [{ name: 'Groceries', icon: '🛒', overhead: false }])
})

test('buildCategoryRowValues builds the row to append', () => {
  assert.deepEqual(sheet.buildCategoryRowValues({ name: 'Groceries', icon: '🛒', overhead: true }), [
    'Groceries',
    '🛒',
    true,
  ])
  assert.deepEqual(sheet.buildCategoryRowValues({ name: 'Dining out', icon: '🍽️', overhead: false }), [
    'Dining out',
    '🍽️',
    false,
  ])
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

// Matches the real household tab's actual layout: Ricorrente inserted BEFORE
// the quotas (not appended at the end) — the exact case that broke fixed
// column positions and motivated resolveExpenseColumns.
function householdFixture() {
  const participants = { a: { name: 'Alex', icon: '🧮' }, b: { name: 'Sam', icon: '🎯' } }
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
      'Ricorrente',
      'Quota % Alex',
      'Quota % Sam',
      'Quota Alex (€)',
      'Quota Sam (€)',
      'Saldo',
    ],
    ['03/07/2026', 'groceries', 'Spesa', 'Alex', 20.08, 'TRUE', 50, 50, 10.04, 10.04, -10.04],
    ['', '', '', '', '', '', 50, 50, '', '', ''],
    ['', '', '', '', '', '', 50, 50, '', '', ''],
  ]
  return { participants, values }
}

// Matches a trip tab: no Ricorrente column at all.
function tripFixture() {
  const participants = { a: { name: 'Alex', icon: '🧮' }, b: { name: 'Sam', icon: '🎯' } }
  const values = [
    ['viaggio', 'lisbon', '10/08/2026', '🐚', '15/08/2026'],
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
    ],
    ['10/08/2026', 'hotel', 'Alloggio', 'Alex', 20.08, 50, 50, 10.04, 10.04, -10.04],
    ['', '', '', '', '', 50, 50, '', '', ''],
  ]
  return { participants, values }
}

test('findHeaderRowIndex locates the "Data" row', () => {
  const { values } = householdFixture()
  assert.equal(sheet.findHeaderRowIndex(values), 3)
  assert.equal(sheet.findHeaderRowIndex([['no header here']]), -1)
})

test('resolveExpenseColumns finds Ricorrente before the quotas (household layout)', () => {
  const { values } = householdFixture()
  assert.deepEqual(sheet.resolveExpenseColumns(values[3]), { splitA: 6, splitB: 7, recurring: 5 })
})

test('resolveExpenseColumns finds no Ricorrente column on a trip tab', () => {
  const { values } = tripFixture()
  assert.deepEqual(sheet.resolveExpenseColumns(values[3]), { splitA: 5, splitB: 6, recurring: -1 })
})

test('parseExpenses maps filled rows and skips blank slots (household layout)', () => {
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

test('parseExpenses maps a trip tab with no Ricorrente column', () => {
  const { values, participants } = tripFixture()
  const expenses = sheet.parseExpenses(values, participants)
  assert.equal(expenses.length, 1)
  assert.deepEqual(expenses[0], {
    id: '5',
    date: '2026-08-10',
    description: 'hotel',
    category: 'Alloggio',
    payer: 'Alex',
    amount: 20.08,
    splits: { Alex: 50, Sam: 50 },
    recurring: false,
  })
})

test('findBlankSlotRow finds the first fully-empty row after the header', () => {
  const { values } = householdFixture()
  assert.equal(sheet.findBlankSlotRow(values), 6)
})

test('findBlankSlotRow returns -1 when no tab is present', () => {
  assert.equal(sheet.findBlankSlotRow([['no header here']]), -1)
})

test('findTotaleRow locates the closing TOTALE row', () => {
  const { values } = householdFixture()
  const withTotale = [...values, ['TOTALE', '', '', '', 20.08, '', '', '', 10.04, 10.04, -10.04]]
  assert.equal(sheet.findTotaleRow(withTotale), withTotale.length)
})

test('findTotaleRow returns -1 when there is no TOTALE row', () => {
  const { values } = householdFixture()
  assert.equal(sheet.findTotaleRow(values), -1)
})

test('buildExpenseRowValues formats the date (A-E only, no splits)', () => {
  const row = sheet.buildExpenseRowValues({
    date: '2026-07-03',
    description: 'groceries',
    category: 'Spesa',
    payer: 'Alex',
    amount: 20.08,
  })
  assert.deepEqual(row, ['03/07/2026', 'groceries', 'Spesa', 'Alex', 20.08])
})

test('buildSplitValues maps splits by participant name', () => {
  const row = sheet.buildSplitValues(
    { splits: { Alex: 30, Sam: 70 } },
    { a: { name: 'Alex' }, b: { name: 'Sam' } },
  )
  assert.deepEqual(row, [30, 70])
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

test('classifyTab ignores the History tab', () => {
  assert.equal(sheet.classifyTab('History', ''), sheet.TAB_TYPE.ignore)
})

test('expenseLabel returns the description', () => {
  assert.equal(sheet.expenseLabel({ description: 'rent', amount: 1200, date: '2026-07-01' }), 'rent')
})

test('expenseLabel falls back to a placeholder for a blank description', () => {
  assert.equal(sheet.expenseLabel({ description: '', amount: 5, date: '2026-07-01' }), '(no description)')
})

test('expenseLabel falls back to a placeholder for null', () => {
  assert.equal(sheet.expenseLabel(null), '(no description)')
})

test('diffExpense returns empty for a create (no prior state)', () => {
  const after = { date: '2026-07-01', description: 'rent', category: 'rent', payer: 'alex', amount: 1200, splits: {}, recurring: false }
  assert.equal(sheet.diffExpense(null, after), '')
})

test('diffExpense lists only the fields that changed', () => {
  const before = {
    date: '2026-07-01',
    description: 'rent',
    category: 'rent',
    payer: 'alex',
    amount: 1200,
    splits: { alex: 50, sam: 50 },
    recurring: true,
  }
  const after = { ...before, amount: 1300, category: 'utilities' }
  assert.equal(sheet.diffExpense(before, after), 'category: rent → utilities; amount: 1200 → 1300')
})

test('diffExpense reports a changed split per participant', () => {
  const before = { date: '', description: '', category: '', payer: '', amount: 1, splits: { alex: 50, sam: 50 }, recurring: false }
  const after = { ...before, splits: { alex: 70, sam: 30 } }
  assert.equal(sheet.diffExpense(before, after), 'split alex: 50% → 70%; split sam: 50% → 30%')
})

test('diffExpense returns empty when nothing changed', () => {
  const expense = { date: '2026-07-01', description: 'rent', category: 'rent', payer: 'alex', amount: 1200, splits: { alex: 50 }, recurring: false }
  assert.equal(sheet.diffExpense(expense, { ...expense }), '')
})

test('formatTripSummary joins emoji and name', () => {
  assert.equal(sheet.formatTripSummary({ name: 'lisbon', emoji: '🐚' }), '🐚 lisbon')
})

test('diffTrip lists only the fields that changed', () => {
  const before = { name: 'lisbon', emoji: '🐚', startDate: '2026-08-24', endDate: '2026-08-30' }
  const after = { ...before, endDate: '2026-09-02' }
  assert.equal(sheet.diffTrip(before, after), 'end date: 2026-08-30 → 2026-09-02')
})

test('formatCategorySummary joins icon and name', () => {
  assert.equal(sheet.formatCategorySummary({ name: 'groceries', icon: '🛒' }), '🛒 groceries')
})

test('parseHistory maps rows newest-first', () => {
  const values = [
    ['Timestamp', 'Actor', 'Action', 'Entity', 'Entity Id', 'Sheet', 'Label', 'Category', 'Amount', 'Date', 'Changes'],
    ['2026-07-01T10:00:00.000Z', 'alex', 'add', 'expense', '5', '', 'rent', 'rent', 1200, '2026-07-01', ''],
    [
      '2026-07-02T10:00:00.000Z',
      'sam',
      'update',
      'expense',
      '5',
      '',
      'rent',
      'utilities',
      1300,
      '2026-07-01',
      'amount: 1200 → 1300',
    ],
  ]
  const entries = sheet.parseHistory(values)
  assert.equal(entries.length, 2)
  assert.equal(entries[0].actor, 'sam')
  assert.equal(entries[0].entityId, '5')
  assert.equal(entries[0].category, 'utilities')
  assert.equal(entries[0].amount, 1300)
  assert.equal(entries[0].changes, 'amount: 1200 → 1300')
  assert.equal(entries[1].actor, 'alex')
  assert.equal(entries[1].amount, 1200)
})
