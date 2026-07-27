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
 * See docs/sheet-setup.md for the schema this maps. Data/Descrizione/Categoria/
 * Pagato da/Importo are fixed at columns A–E on every expense tab. Everything
 * after that — the two Quota % columns, and the optional Ricorrente column —
 * is resolved by HEADER TEXT (see resolveExpenseColumns), not a fixed position,
 * since different tabs may order/place them differently (e.g. Ricorrente
 * inserted before the quotas on the household tab, but absent on trip tabs).
 */

var USERS_TAB = 'Users'
var CATEGORIES_TAB = 'Categorie'
// Must match your trip-template tab's name EXACTLY (createTrip_ duplicates
// this tab, and classifyTab excludes it by this name so it isn't mistaken
// for a real trip) — rename this constant if you rename the tab.
var TEMPLATE_TAB = 'Viaggio - Modello (copiare non modificare)'
var AUX_TAB_PREFIX = 'wise raw'

// The A1 marker words an expense tab uses to identify its own kind. These are
// plain text, not a fixed vocabulary — translate them if you like, as long as
// row 1 of your tabs matches whatever you put here.
var HOUSEHOLD_MARKER = 'casa'
var TRIP_MARKER = 'viaggio'

var TAB_TYPE = {
  household: 'household',
  trip: 'trip',
  ignore: 'ignore',
}

/** Fixed 0-based column indexes shared by every expense tab (see docs/sheet-setup.md). */
var COL = {
  date: 0,
  description: 1,
  category: 2,
  payer: 3,
  amount: 4,
  // Quota %/€, Saldo and the optional Ricorrente column are NOT fixed — see
  // resolveExpenseColumns. Quota €/Saldo are formulas and never written to.
}

/** Fixed 0-based column indexes within the Categorie tab. */
var CATEGORY_COL = {
  name: 0,
  icon: 1,
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

/** Normalizes a sheet cell (checkbox boolean or "TRUE"/"FALSE" text) to a boolean. */
function cellToBool(v) {
  if (typeof v === 'boolean') return v
  return cellToString(v).toUpperCase() === 'TRUE'
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

/** Formats an ISO `YYYY-MM-DD` string as `DD/MM/YYYY`, or returns it unchanged if it doesn't match. */
function isoToDmy(iso) {
  var parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cellToString(iso))
  return parts ? parts[3] + '/' + parts[2] + '/' + parts[1] : cellToString(iso)
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
  if (name === USERS_TAB) return TAB_TYPE.ignore
  if (name === CATEGORIES_TAB) return TAB_TYPE.ignore
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

/**
 * The tab name a trip is stored under: `"{emoji} {name}"`, matching the
 * existing convention (e.g. `🐚 cala gonone`).
 * @param {{name: string, emoji: string}} trip
 * @return {string}
 */
function tripTabName(trip) {
  return cellToString(trip.emoji) + ' ' + cellToString(trip.name)
}

/**
 * Builds a new trip tab's row-1 metadata cells.
 * @param {{name: string, emoji: string, startDate: string, endDate: string}} trip
 * @return {Array<*>}
 */
function buildTripRow1Values(trip) {
  return [TRIP_MARKER, cellToString(trip.name), isoToDmy(trip.startDate), cellToString(trip.emoji), isoToDmy(trip.endDate)]
}

// ---------------------------------------------------------------------------
// Participants (Users tab)
// ---------------------------------------------------------------------------

/**
 * Finds the two participants from the Users tab (columns resolved by header
 * name: Email, Name, Icon — Email is only used for the write allowlist, see
 * auth.js). The first two rows with a name become Persona A and B, in order —
 * that order is what the household/trip tabs' Quota % columns follow.
 * @param {Array<Array<*>>} values full Users sheet values incl. header row
 * @return {{a: {name: string, icon: string}|null, b: {name: string, icon: string}|null}}
 */
function parseParticipants(values) {
  if (!values || values.length < 2) return { a: null, b: null }
  var header = values[0]
  var iName = -1
  var iIcon = -1
  for (var i = 0; i < header.length; i++) {
    var label = cellToString(header[i]).toLowerCase()
    if (label === 'name') iName = i
    else if (label === 'icon') iIcon = i
  }
  if (iName === -1) return { a: null, b: null }

  var people = []
  for (var r = 1; r < values.length; r++) {
    var name = cellToString(values[r][iName])
    if (!name) continue
    people.push({ name: name, icon: iIcon === -1 ? '' : cellToString(values[r][iIcon]) })
  }
  return { a: people[0] || null, b: people[1] || null }
}

// ---------------------------------------------------------------------------
// Categories (Categorie tab)
// ---------------------------------------------------------------------------

/**
 * Parses the Categorie tab (fixed columns: A name, B icon).
 * @param {Array<Array<*>>} values
 * @return {Array<{name: string, icon: string}>}
 */
function parseCategories(values) {
  var categories = []
  for (var r = 1; r < values.length; r++) {
    var name = cellToString(values[r][CATEGORY_COL.name])
    if (!name) continue
    categories.push({ name: name, icon: cellToString(values[r][CATEGORY_COL.icon]) })
  }
  return categories
}

/**
 * @param {{name: string, icon: string}} category
 * @return {Array<*>} the row to append to the Categorie tab
 */
function buildCategoryRowValues(category) {
  return [cellToString(category.name), cellToString(category.icon)]
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
 * Locates the two Quota % columns (in order — first found is Persona A's) and
 * the optional Ricorrente column, by header text, searching only past the
 * fixed A–E columns. This is what lets the household tab have Ricorrente
 * inserted BEFORE the quotas while trip tabs have no Ricorrente column at all
 * — both layouts resolve correctly instead of assuming one fixed position.
 * @param {Array<*>} headerRow the header row (see findHeaderRowIndex)
 * @return {{splitA: number, splitB: number, recurring: number}} 0-based indexes, -1 if absent
 */
function resolveExpenseColumns(headerRow) {
  var cols = { splitA: -1, splitB: -1, recurring: -1 }
  var splitsSeen = 0
  for (var i = COL.amount + 1; i < headerRow.length; i++) {
    var label = cellToString(headerRow[i]).toLowerCase()
    if (label.indexOf('ricorrente') === 0) {
      cols.recurring = i
    } else if (label.indexOf('quota %') === 0) {
      if (splitsSeen === 0) cols.splitA = i
      else if (splitsSeen === 1) cols.splitB = i
      splitsSeen++
    }
  }
  return cols
}

/**
 * Maps one data row to an Expense, or null if the row is a blank slot.
 * @param {Array<*>} row
 * @param {number} rowNumber 1-based sheet row number (becomes the expense id)
 * @param {{a: {name: string}|null, b: {name: string}|null}} participants
 * @param {{splitA: number, splitB: number, recurring: number}} cols see resolveExpenseColumns
 * @return {Object|null}
 */
function rowToExpense(row, rowNumber, participants, cols) {
  var date = cellToIsoDate(row[COL.date])
  var description = cellToString(row[COL.description])
  if (!date && !description) return null

  var splits = {}
  if (participants.a && cols.splitA !== -1) splits[participants.a.name] = cellToNumber(row[cols.splitA])
  if (participants.b && cols.splitB !== -1) splits[participants.b.name] = cellToNumber(row[cols.splitB])

  return {
    id: String(rowNumber),
    date: date,
    description: description,
    category: cellToString(row[COL.category]),
    payer: cellToString(row[COL.payer]),
    amount: cellToNumber(row[COL.amount]),
    splits: splits,
    recurring: cols.recurring !== -1 ? cellToBool(row[cols.recurring]) : false,
  }
}

/**
 * Maps an expense tab's full values into Expense objects.
 * @param {Array<Array<*>>} values
 * @param {{a: {name: string}|null, b: {name: string}|null}} participants
 * @return {Array<Object>}
 */
function parseExpenses(values, participants) {
  var headerRowIndex = findHeaderRowIndex(values)
  if (headerRowIndex === -1) return []
  var cols = resolveExpenseColumns(values[headerRowIndex])
  var expenses = []
  for (var r = headerRowIndex + 1; r < values.length; r++) {
    var expense = rowToExpense(values[r], r + 1, participants, cols)
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
 * Builds the fixed A–E row values to write for an expense: date, description,
 * category, payer, amount. The Quota %/Ricorrente cells are written
 * separately (see buildSplitValues) since their columns aren't fixed.
 * @param {{date: string, description: string, category: string, payer: string, amount: number}} expense
 * @return {Array<*>}
 */
function buildExpenseRowValues(expense) {
  return [isoToDmy(expense.date), expense.description, expense.category, expense.payer, expense.amount]
}

/**
 * Builds the two Quota % values to write, by participant name lookup — so the
 * sheet's column order doesn't need to match `participants`' a/b order.
 * @param {{splits: Object<string, number>}} expense
 * @param {{a: {name: string}|null, b: {name: string}|null}} participants
 * @return {Array<*>} `[splitA, splitB]`
 */
function buildSplitValues(expense, participants) {
  var splits = expense.splits || {}
  var splitA = participants && participants.a ? cellToNumber(splits[participants.a.name]) : ''
  var splitB = participants && participants.b ? cellToNumber(splits[participants.b.name]) : ''
  return [splitA, splitB]
}

// ---------------------------------------------------------------------------
// Recurring expenses
// ---------------------------------------------------------------------------

/**
 * Decides which recurring expenses (e.g. rent, internet) need a fresh copy for
 * the current month: for each description marked `recurring` anywhere in the
 * tab, its most recent occurrence becomes the template — unless that
 * description already has an entry dated this month, in which case it's
 * skipped (idempotent: safe to run more than once in the same month).
 * @param {Array<Object>} expenses already-parsed expenses (see parseExpenses)
 * @param {string} todayIso `YYYY-MM-DD`
 * @return {Array<Object>} new expenses (no `id`) to write, dated `todayIso`
 */
function expensesToRecreateThisMonth(expenses, todayIso) {
  var monthPrefix = cellToString(todayIso).slice(0, 7)

  var alreadyThisMonth = {}
  for (var i = 0; i < expenses.length; i++) {
    if (expenses[i].date.slice(0, 7) === monthPrefix) alreadyThisMonth[expenses[i].description] = true
  }

  var latestByDescription = {}
  for (var j = 0; j < expenses.length; j++) {
    var expense = expenses[j]
    if (!expense.recurring) continue
    var current = latestByDescription[expense.description]
    if (!current || expense.date > current.date) latestByDescription[expense.description] = expense
  }

  var toCreate = []
  for (var description in latestByDescription) {
    if (alreadyThisMonth[description]) continue
    var template = latestByDescription[description]
    toCreate.push({
      date: todayIso,
      description: template.description,
      category: template.category,
      payer: template.payer,
      amount: template.amount,
      splits: template.splits,
      recurring: true,
    })
  }
  return toCreate
}

// Node-only export (skipped in Apps Script, where `module` is undefined).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    USERS_TAB: USERS_TAB,
    CATEGORIES_TAB: CATEGORIES_TAB,
    TEMPLATE_TAB: TEMPLATE_TAB,
    HOUSEHOLD_MARKER: HOUSEHOLD_MARKER,
    TRIP_MARKER: TRIP_MARKER,
    TAB_TYPE: TAB_TYPE,
    COL: COL,
    CATEGORY_COL: CATEGORY_COL,
    cellToString: cellToString,
    cellToNumber: cellToNumber,
    cellToBool: cellToBool,
    cellToIsoDate: cellToIsoDate,
    isoToDmy: isoToDmy,
    classifyTab: classifyTab,
    parseTabMeta: parseTabMeta,
    tripTabName: tripTabName,
    buildTripRow1Values: buildTripRow1Values,
    parseParticipants: parseParticipants,
    parseCategories: parseCategories,
    buildCategoryRowValues: buildCategoryRowValues,
    findHeaderRowIndex: findHeaderRowIndex,
    resolveExpenseColumns: resolveExpenseColumns,
    rowToExpense: rowToExpense,
    parseExpenses: parseExpenses,
    findBlankSlotRow: findBlankSlotRow,
    buildExpenseRowValues: buildExpenseRowValues,
    buildSplitValues: buildSplitValues,
    expensesToRecreateThisMonth: expensesToRecreateThisMonth,
  }
}
