/**
 * Linkulino — pure sheet logic (framework-free, no SpreadsheetApp).
 *
 * Everything here is a plain function of its inputs so it can be unit-tested in
 * Node (`npm test`) without a live spreadsheet. The Apps Script glue in Code.js
 * reads tabs, hands the raw 2-D values to these functions, and writes results
 * back. Google Apps Script and Node both load this file:
 *   - in Apps Script every declaration below becomes a global (no imports there);
 *   - in Node the guarded `module.exports` at the bottom exposes them to tests.
 *
 * See docs/sheet-setup.md for the schema this maps. CORE RULE: expense-tab
 * columns are resolved by FIXED POSITION, not header name — the quota/saldo
 * headers embed each participant's name, so they differ per instance.
 */

var SETTINGS_TAB = 'Impostazioni'
var TEMPLATE_TAB = 'Viaggio - Modello'
var AUX_TAB_PREFIX = 'wise raw'

// The A1 marker words an expense tab uses to identify its own kind. These are
// plain text, not a fixed vocabulary — translate them if you like, as long as
// row 1 of your tabs matches whatever you put here.
var HOUSEHOLD_MARKER = 'casa'
var TRIP_MARKER = 'viaggio'

var TAB_TYPE = {
  household: 'household',
  trip: 'trip',
  settings: 'settings',
  ignore: 'ignore',
}

/** Fixed 0-based column indexes within an expense tab (see docs/sheet-setup.md). */
var COL = {
  date: 0,
  description: 1,
  category: 2,
  payer: 3,
  amount: 4,
  splitA: 5,
  splitB: 6,
  // 7 (quota A €), 8 (quota B €), 9 (saldo) are formulas — never written to.
}

// ---------------------------------------------------------------------------
// Cell parsing
// ---------------------------------------------------------------------------

/** Normalizes a sheet cell to a trimmed string. */
function cellToString(v) {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

/** Normalizes a sheet cell to a number, or 0 when blank/non-numeric. */
function cellToNumber(v) {
  if (v === null || v === undefined || v === '') return 0
  var n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Formats a date cell as ISO `YYYY-MM-DD`. Sheet cells with a Date type arrive
 * as JS Date objects; a plain `DD/MM/YYYY` string (e.g. pasted data) is parsed
 * too. Returns `''` for anything else.
 */
function cellToIsoDate(v) {
  if (v instanceof Date) {
    var y = v.getFullYear()
    var m = String(v.getMonth() + 1).padStart(2, '0')
    var d = String(v.getDate()).padStart(2, '0')
    return y + '-' + m + '-' + d
  }
  var s = cellToString(v)
  var match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
  if (match) return match[3] + '-' + match[2].padStart(2, '0') + '-' + match[1].padStart(2, '0')
  return ''
}

// ---------------------------------------------------------------------------
// Tab discovery
// ---------------------------------------------------------------------------

/**
 * Classifies a tab from its name and its A1 cell value.
 * @param {string} name the tab's name
 * @param {*} a1 the raw value of cell A1
 * @return {string} one of TAB_TYPE
 */
function classifyTab(name, a1) {
  if (name === SETTINGS_TAB) return TAB_TYPE.settings
  if (name === TEMPLATE_TAB) return TAB_TYPE.ignore
  if (name.toLowerCase().indexOf(AUX_TAB_PREFIX) === 0) return TAB_TYPE.ignore
  var marker = cellToString(a1).toLowerCase()
  if (marker === HOUSEHOLD_MARKER) return TAB_TYPE.household
  if (marker === TRIP_MARKER) return TAB_TYPE.trip
  return TAB_TYPE.ignore
}

/**
 * Parses an expense tab's row-1 metadata: `[type, name, startDate, emoji, endDate]`.
 * @param {Array<*>} row1
 * @return {{name: string, startDate: string, emoji: string, endDate: string}}
 */
function parseTabMeta(row1) {
  return {
    name: cellToString(row1[1]),
    startDate: cellToIsoDate(row1[2]),
    emoji: cellToString(row1[3]),
    endDate: cellToIsoDate(row1[4]),
  }
}

// ---------------------------------------------------------------------------
// Settings (participant names)
// ---------------------------------------------------------------------------

/**
 * Finds the two participant names from the Impostazioni tab, searching by
 * label (column A) rather than a fixed cell so notes can surround them.
 * @param {Array<Array<*>>} values
 * @return {{a: string, b: string}}
 */
function parseParticipants(values) {
  var a = ''
  var b = ''
  for (var r = 0; r < values.length; r++) {
    var label = cellToString(values[r][0])
    if (label === 'Nome Persona A') a = cellToString(values[r][1])
    if (label === 'Nome Persona B') b = cellToString(values[r][1])
  }
  return { a: a, b: b }
}

// ---------------------------------------------------------------------------
// Expense rows
// ---------------------------------------------------------------------------

/**
 * Finds the 0-based index of the column-header row (cell A = "Data"), searching
 * only the first few rows since it always immediately follows the summary rows.
 * @param {Array<Array<*>>} values
 * @return {number} 0-based row index, or -1 if not found
 */
function findHeaderRowIndex(values) {
  var searchLimit = Math.min(values.length, 10)
  for (var r = 0; r < searchLimit; r++) {
    if (cellToString(values[r][0]) === 'Data') return r
  }
  return -1
}

/**
 * Maps one data row to an Expense, or null if the row is a blank slot.
 * @param {Array<*>} row
 * @param {number} rowNumber 1-based sheet row number (becomes the expense id)
 * @param {{a: string, b: string}} participants
 * @return {Object|null}
 */
function rowToExpense(row, rowNumber, participants) {
  var date = cellToIsoDate(row[COL.date])
  var description = cellToString(row[COL.description])
  if (!date && !description) return null

  var splits = {}
  if (participants.a) splits[participants.a] = cellToNumber(row[COL.splitA])
  if (participants.b) splits[participants.b] = cellToNumber(row[COL.splitB])

  return {
    id: String(rowNumber),
    date: date,
    description: description,
    category: cellToString(row[COL.category]),
    payer: cellToString(row[COL.payer]),
    amount: cellToNumber(row[COL.amount]),
    splits: splits,
  }
}

/**
 * Maps an expense tab's full values into Expense objects.
 * @param {Array<Array<*>>} values
 * @param {{a: string, b: string}} participants
 * @return {Array<Object>}
 */
function parseExpenses(values, participants) {
  var headerRowIndex = findHeaderRowIndex(values)
  if (headerRowIndex === -1) return []
  var expenses = []
  for (var r = headerRowIndex + 1; r < values.length; r++) {
    var expense = rowToExpense(values[r], r + 1, participants)
    if (expense) expenses.push(expense)
  }
  return expenses
}

/**
 * Finds the first fully-blank slot row (columns A–E empty) after the header,
 * where a new expense should be written in place — NOT appended, since rows
 * below the header are pre-filled with the Quota/Saldo formulas (see
 * docs/sheet-setup.md). Returns -1 if every pre-filled row is already used.
 * @param {Array<Array<*>>} values
 * @return {number} 1-based sheet row number, or -1
 */
function findBlankSlotRow(values) {
  var headerRowIndex = findHeaderRowIndex(values)
  if (headerRowIndex === -1) return -1
  for (var r = headerRowIndex + 1; r < values.length; r++) {
    var row = values[r]
    var empty = true
    for (var c = COL.date; c <= COL.amount; c++) {
      if (cellToString(row[c]) !== '') {
        empty = false
        break
      }
    }
    if (empty) return r + 1
  }
  return -1
}

/**
 * Builds the A–E row values to write for a new expense (F/G default to the
 * existing split already in the slot unless overridden). Columns H–J (quota
 * €, saldo) are formulas and are never written.
 * @param {{date: string, description: string, category: string, payer: string, amount: number}} expense
 * @return {Array<*>}
 */
function buildExpenseRowValues(expense) {
  var parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(expense.date)
  var date = parts ? parts[3] + '/' + parts[2] + '/' + parts[1] : expense.date
  return [date, expense.description, expense.category, expense.payer, expense.amount]
}

// Node-only export (skipped in Apps Script, where `module` is undefined).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SETTINGS_TAB: SETTINGS_TAB,
    TEMPLATE_TAB: TEMPLATE_TAB,
    HOUSEHOLD_MARKER: HOUSEHOLD_MARKER,
    TRIP_MARKER: TRIP_MARKER,
    TAB_TYPE: TAB_TYPE,
    COL: COL,
    cellToString: cellToString,
    cellToNumber: cellToNumber,
    cellToIsoDate: cellToIsoDate,
    classifyTab: classifyTab,
    parseTabMeta: parseTabMeta,
    parseParticipants: parseParticipants,
    findHeaderRowIndex: findHeaderRowIndex,
    rowToExpense: rowToExpense,
    parseExpenses: parseExpenses,
    findBlankSlotRow: findBlankSlotRow,
    buildExpenseRowValues: buildExpenseRowValues,
  }
}
