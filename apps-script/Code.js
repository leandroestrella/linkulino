/**
 * Linkulino — Apps Script web app (bound to the expenses spreadsheet).
 *
 * The ONLY thing that touches the spreadsheet. Runs as the sheet owner and
 * exposes a small JSON API:
 *   - doGet  → reads   (?action=health, participants, categories, expenses[&sheet=], trips, history)
 *   - doPost → writes  (addExpense, updateExpense, deleteExpense, createTrip,
 *              updateTrip, deleteTrip, addCategory)
 *
 * All pure logic (tab discovery, row↔object mapping, blank-slot finding) lives
 * in sheet.js and is unit-tested in Node. This file is just the glue: read
 * values → call pure fn → write values. See docs/sheet-setup.md for the schema.
 *
 * Every write also appends a row to the `History` tab (created on first use) —
 * who did what, when, and (for edits) exactly which fields changed. See
 * logHistory_ and the formatXSummary/diffX pure functions in sheet.js.
 *
 * Cross-origin note: browsers can't send a JSON preflight to Apps Script, so the
 * SPA POSTs with Content-Type text/plain and a JSON string body — hence the
 * manual JSON.parse of e.postData.contents below.
 *
 * AUTH: `health` is the only public action. Every other read or write verifies
 * the caller's Google ID token (via Google's tokeninfo endpoint) and checks
 * the email against the participant allowlist in the `Users` tab before
 * touching the sheet (see requireUser_). Reads take the token as an
 * `idToken` query param (GET has no body); writes take it in the JSON POST
 * body. Auth decisions themselves are pure logic in auth.js. The `Users` tab
 * doubles as the participant roster: its first two named rows (Email, Name,
 * Icon columns) are Persona A and B, in order.
 */

var VERSION = '0.3.0'

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || 'health'
    if (action !== 'health') requireUser_((e && e.parameter) || {})
    switch (action) {
      case 'health':
        return json({ ok: true, service: 'linkulino', version: VERSION })
      case 'participants':
        return json({ ok: true, participants: getParticipants_() })
      case 'categories':
        return json({ ok: true, categories: getCategories_() })
      case 'expenses':
        return json({ ok: true, expenses: getExpenses_(e.parameter.sheet) })
      case 'trips':
        return json({ ok: true, trips: getTrips_() })
      case 'history':
        return json({ ok: true, history: getHistory_() })
      default:
        return json({ ok: false, error: 'unknown action: ' + action })
    }
  } catch (err) {
    return json({ ok: false, error: errorMessage_(err) })
  }
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}')
    // "me" reports the caller's authorization status without throwing — the
    // SPA uses it right after sign-in to decide what to show.
    if (body.action === 'me') return json(whoAmI_(body))

    var user = requireUser_(body) // throws unless the caller is an allowed participant
    switch (body.action) {
      case 'addExpense': {
        var added = addExpense_(body.expense, body.sheet)
        logHistory_({
          actor: user.name,
          action: 'add',
          entity: 'expense',
          entityId: added.id,
          sheetId: body.sheet,
          label: expenseLabel(added),
          category: added.category,
          amount: added.amount,
          date: added.date,
        })
        return json({ ok: true, expense: added })
      }
      case 'updateExpense': {
        var beforeExpense = getExpenseSnapshot_(body.id, body.sheet)
        var updatedExpense = updateExpense_(body.id, body.expense, body.sheet)
        logHistory_({
          actor: user.name,
          action: 'update',
          entity: 'expense',
          entityId: updatedExpense.id,
          sheetId: body.sheet,
          label: expenseLabel(updatedExpense),
          category: updatedExpense.category,
          amount: updatedExpense.amount,
          date: updatedExpense.date,
          changes: diffExpense(beforeExpense, updatedExpense),
        })
        return json({ ok: true, expense: updatedExpense })
      }
      case 'deleteExpense': {
        var deletedExpense = getExpenseSnapshot_(body.id, body.sheet)
        var deletedExpenseOk = deleteExpense_(body.id, body.sheet)
        // No entityId: the row is now a blank slot that a future add could
        // reuse, so linking back to it could point at the wrong expense later.
        logHistory_({
          actor: user.name,
          action: 'delete',
          entity: 'expense',
          sheetId: body.sheet,
          label: expenseLabel(deletedExpense),
          category: deletedExpense ? deletedExpense.category : '',
          amount: deletedExpense ? deletedExpense.amount : '',
          date: deletedExpense ? deletedExpense.date : '',
        })
        return json({ ok: true, deleted: deletedExpenseOk })
      }
      case 'createTrip': {
        var createdTrip = createTrip_(body.trip)
        logHistory_({
          actor: user.name,
          action: 'add',
          entity: 'trip',
          entityId: createdTrip.id,
          label: formatTripSummary(createdTrip),
        })
        return json({ ok: true, trip: createdTrip })
      }
      case 'updateTrip': {
        var beforeTrip = getTripSnapshot_(body.id)
        var updatedTrip = updateTrip_(body.id, body.trip)
        logHistory_({
          actor: user.name,
          action: 'update',
          entity: 'trip',
          entityId: updatedTrip.id,
          label: formatTripSummary(updatedTrip),
          changes: diffTrip(beforeTrip, updatedTrip),
        })
        return json({ ok: true, trip: updatedTrip })
      }
      case 'deleteTrip': {
        var deletedTrip = getTripSnapshot_(body.id)
        var deletedTripOk = deleteTrip_(body.id)
        // No entityId: the tab is gone.
        logHistory_({ actor: user.name, action: 'delete', entity: 'trip', label: formatTripSummary(deletedTrip) })
        return json({ ok: true, deleted: deletedTripOk })
      }
      case 'addCategory': {
        var addedCategory = addCategory_(body.category)
        // No entityId: there's no per-category page to link to.
        logHistory_({ actor: user.name, action: 'add', entity: 'category', label: formatCategorySummary(addedCategory) })
        return json({ ok: true, category: addedCategory })
      }
      default:
        return json({ ok: false, error: 'unknown action: ' + body.action })
    }
  } catch (err) {
    return json({ ok: false, error: errorMessage_(err) })
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** @return {{name: string, icon: string}[]} the two participants, in Persona A/B order. */
function getParticipants_() {
  var people = parseParticipants(readValues_(USERS_TAB))
  var result = []
  if (people.a) result.push(people.a)
  if (people.b) result.push(people.b)
  return result
}

/** @return {{name: string, icon: string}[]} categories from the Categorie tab (empty if the tab doesn't exist yet). */
function getCategories_() {
  return parseCategories(readValuesOptional_(CATEGORIES_TAB))
}

/**
 * @param {string=} sheetId a trip's tab name, or omitted for the household budget.
 * @return {Object[]} that tab's expenses.
 */
function getExpenses_(sheetId) {
  var tab = findExpenseTab_(sheetId)
  if (!tab) return []
  var participants = parseParticipants(readValues_(USERS_TAB))
  return parseExpenses(tab.getDataRange().getValues(), participants)
}

/**
 * Reads a tab's values and resolves its Quota %/Ricorrente columns (see
 * resolveExpenseColumns) in one step.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} tab
 * @return {{values: Array<Array<*>>, headerRowIndex: number, cols: {splitA: number, splitB: number, recurring: number}}}
 */
function readExpenseTab_(tab) {
  var values = tab.getDataRange().getValues()
  var headerRowIndex = findHeaderRowIndex(values)
  var cols = headerRowIndex === -1 ? { splitA: -1, splitB: -1, recurring: -1 } : resolveExpenseColumns(values[headerRowIndex])
  return { values: values, headerRowIndex: headerRowIndex, cols: cols }
}

/**
 * Finds the next blank slot row to write an expense into, extending the
 * pre-filled formula rows by one if every existing slot is already used (see
 * findBlankSlotRow in sheet.js) — inserts a row just above the tab's TOTALE
 * row, copies the formulas from the row above it (the Quota €/Saldo columns
 * adjust their relative references automatically, same as a manual drag-fill),
 * then clears the cells this app writes to (A–E, Quota %, Ricorrente) so the
 * new row is a genuine blank slot.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} tab
 * @param {{values: Array<Array<*>>, cols: {splitA: number, splitB: number, recurring: number}}} read
 * @return {number} 1-based row number
 */
function ensureBlankSlotRow_(tab, read) {
  var rowNumber = findBlankSlotRow(read.values)
  if (rowNumber !== -1) return rowNumber

  var totaleRow = findTotaleRow(read.values)
  if (totaleRow === -1) {
    throw new Error('No blank row left on this tab, and no TOTALE row found to extend before — add a blank formula row manually.')
  }

  var sourceRow = totaleRow - 1
  var lastCol = tab.getLastColumn()
  tab.insertRowBefore(totaleRow)
  tab.getRange(sourceRow, 1, 1, lastCol).copyTo(tab.getRange(totaleRow, 1, 1, lastCol))

  tab.getRange(totaleRow, COL.date + 1, 1, COL.amount - COL.date + 1).clearContent()
  if (read.cols.splitA !== -1) tab.getRange(totaleRow, read.cols.splitA + 1).clearContent()
  if (read.cols.splitB !== -1) tab.getRange(totaleRow, read.cols.splitB + 1).clearContent()
  if (read.cols.recurring !== -1) tab.getRange(totaleRow, read.cols.recurring + 1).clearContent()

  return totaleRow
}

/**
 * @return {Array<{timestamp: string, actor: string, action: string, entity: string, summary: string, changes: string}>}
 * every logged action, newest first (empty if nothing has been logged yet).
 */
function getHistory_() {
  var tab = getSpreadsheet_().getSheetByName(HISTORY_TAB)
  if (!tab) return []
  return parseHistory(tab.getDataRange().getValues())
}

/** @return {Object[]} metadata for every trip tab (name, dates, emoji). */
function getTrips_() {
  var sheets = getSpreadsheet_().getSheets()
  var trips = []
  for (var i = 0; i < sheets.length; i++) {
    var sheetTab = sheets[i]
    var name = sheetTab.getName()
    var a1 = sheetTab.getRange(1, 1).getValue()
    if (classifyTab(name, a1) !== TAB_TYPE.trip) continue
    var row1 = sheetTab.getRange(1, 1, 1, 5).getValues()[0]
    var meta = parseTabMeta(row1)
    trips.push({ id: name, name: meta.name || name, emoji: meta.emoji, startDate: meta.startDate, endDate: meta.endDate })
  }
  return trips
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Writes a new expense into the first blank slot of the target tab (see
 * docs/sheet-setup.md — rows below the header are pre-filled with formulas,
 * so this fills A–E in place rather than appending a row). The recurring flag
 * only applies to the household budget — trips are time-boxed, so "repeats
 * every month" doesn't apply there, and the Ricorrente cell is never touched
 * on a trip tab (nor written at all if the tab has no such column).
 * @param {{date: string, description: string, category: string, payer: string, amount: number, splits: Object, recurring: boolean}} input
 * @param {string=} sheetId a trip's tab name, or omitted for the household budget.
 * @return {Object} the created expense
 */
function addExpense_(input, sheetId) {
  if (!input) throw new Error('Missing expense')
  var tab = findExpenseTab_(sheetId)
  if (!tab) throw new Error('No matching expense tab found (see docs/sheet-setup.md)')

  var read = readExpenseTab_(tab)
  var rowNumber = ensureBlankSlotRow_(tab, read)

  var participants = parseParticipants(readValues_(USERS_TAB))
  writeExpenseRow_(tab, rowNumber, input, participants, read.cols, !sheetId)

  var updatedRow = tab.getRange(rowNumber, 1, 1, tab.getLastColumn()).getValues()[0]
  return rowToExpense(updatedRow, rowNumber, participants, read.cols)
}

/**
 * Overwrites an existing expense's row in place. The expense id IS its 1-based
 * row number (see rowToExpense), so no search is needed.
 * @param {string} id
 * @param {{date: string, description: string, category: string, payer: string, amount: number, splits: Object, recurring: boolean}} input
 * @param {string=} sheetId a trip's tab name, or omitted for the household budget.
 * @return {Object} the updated expense
 */
function updateExpense_(id, input, sheetId) {
  if (!input) throw new Error('Missing expense')
  var rowNumber = parseInt(id, 10)
  if (!rowNumber || rowNumber < 1) throw new Error('Invalid expense id: ' + id)

  var tab = findExpenseTab_(sheetId)
  if (!tab) throw new Error('No matching expense tab found (see docs/sheet-setup.md)')
  if (rowNumber > tab.getLastRow()) throw new Error('Expense not found: ' + id)

  var read = readExpenseTab_(tab)
  var participants = parseParticipants(readValues_(USERS_TAB))
  writeExpenseRow_(tab, rowNumber, input, participants, read.cols, !sheetId)

  var updatedRow = tab.getRange(rowNumber, 1, 1, tab.getLastColumn()).getValues()[0]
  return rowToExpense(updatedRow, rowNumber, participants, read.cols)
}

/**
 * Clears an expense's row back to a blank slot, rather than deleting the
 * sheet row outright — later expenses on this tab keep their id (their row
 * number) stable, and the tab's Quota €/Saldo formulas, which reference rows
 * by position, stay intact.
 * @param {string} id
 * @param {string=} sheetId a trip's tab name, or omitted for the household budget.
 * @return {boolean} true
 */
function deleteExpense_(id, sheetId) {
  var rowNumber = parseInt(id, 10)
  if (!rowNumber || rowNumber < 1) throw new Error('Invalid expense id: ' + id)

  var tab = findExpenseTab_(sheetId)
  if (!tab) throw new Error('No matching expense tab found (see docs/sheet-setup.md)')
  if (rowNumber > tab.getLastRow()) throw new Error('Expense not found: ' + id)

  var read = readExpenseTab_(tab)
  tab.getRange(rowNumber, COL.date + 1, 1, COL.amount - COL.date + 1).clearContent()
  if (read.cols.splitA !== -1) tab.getRange(rowNumber, read.cols.splitA + 1).clearContent()
  if (read.cols.splitB !== -1) tab.getRange(rowNumber, read.cols.splitB + 1).clearContent()
  if (read.cols.recurring !== -1) tab.getRange(rowNumber, read.cols.recurring + 1).clearContent()

  return true
}

/**
 * Writes an expense's A–E cells, its two Quota % cells (wherever
 * resolveExpenseColumns found them), and its recurring flag (only when
 * `includeRecurring` AND the tab has a Ricorrente column) to a specific row.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} tab
 * @param {number} rowNumber 1-based
 * @param {Object} input
 * @param {{a: {name: string}|null, b: {name: string}|null}} participants
 * @param {{splitA: number, splitB: number, recurring: number}} cols see resolveExpenseColumns
 * @param {boolean} includeRecurring
 */
function writeExpenseRow_(tab, rowNumber, input, participants, cols, includeRecurring) {
  var mainValues = buildExpenseRowValues(input)
  tab.getRange(rowNumber, COL.date + 1, 1, mainValues.length).setValues([mainValues])

  var splitValues = buildSplitValues(input, participants)
  if (cols.splitA !== -1) tab.getRange(rowNumber, cols.splitA + 1).setValue(splitValues[0])
  if (cols.splitB !== -1) tab.getRange(rowNumber, cols.splitB + 1).setValue(splitValues[1])

  if (includeRecurring && cols.recurring !== -1) {
    tab.getRange(rowNumber, cols.recurring + 1).setValue(!!input.recurring)
  }
}

/**
 * Builds a fresh trip tab's structure: row-1 metadata, the "Totale
 * speso"/"Saldo attuale" summary cells, the header row, one pre-filled blank
 * data row with the Quota €/Saldo formulas, and the closing TOTALE row. No
 * template tab to duplicate — everything's generated directly, so deleting
 * (or never having) a template tab doesn't block trip creation. The one
 * blank data row exists so ensureBlankSlotRow_ has a formula row to copy
 * from the first time this trip runs out of slots (see Code.js).
 * @param {GoogleAppsScript.Spreadsheet.Sheet} tab a freshly inserted, empty sheet
 * @param {{name: string, emoji: string, startDate: string, endDate: string}} trip
 * @param {{a: {name: string}|null, b: {name: string}|null}} participants
 */
function buildTripTab_(tab, trip, participants) {
  var row1 = buildTripRow1Values(trip)
  tab.getRange(1, 1, 1, row1.length).setValues([row1])

  var header = buildTripHeaderRow(participants)
  var headerRow = 4
  tab.getRange(headerRow, 1, 1, header.length).setValues([header])
  tab.getRange(headerRow, 1, 1, header.length).setFontWeight('bold')

  var dataRow = headerRow + 1
  var totaleRow = dataRow + 1
  var bName = participants && participants.b ? participants.b.name : 'Persona B'

  tab.getRange(dataRow, 6, 1, 2).setValues([[50, 50]]) // F/G: Quota % defaults
  tab.getRange(dataRow, 8).setFormula('=IF($E' + dataRow + '="","",$E' + dataRow + '*$F' + dataRow + '/100)')
  tab.getRange(dataRow, 9).setFormula('=IF($E' + dataRow + '="","",$E' + dataRow + '*$G' + dataRow + '/100)')
  tab
    .getRange(dataRow, 10)
    .setFormula('=IF($E' + dataRow + '="","",IF($D' + dataRow + '="' + bName + '",-$H' + dataRow + ',$I' + dataRow + '))')

  tab.getRange(totaleRow, 1).setValue('TOTALE')
  tab.getRange(totaleRow, 5).setFormula('=SUM(E' + dataRow + ':E' + dataRow + ')')
  tab.getRange(totaleRow, 8).setFormula('=SUM(H' + dataRow + ':H' + dataRow + ')')
  tab.getRange(totaleRow, 9).setFormula('=SUM(I' + dataRow + ':I' + dataRow + ')')
  tab.getRange(totaleRow, 10).setFormula('=SUM(J' + dataRow + ':J' + dataRow + ')')
  tab.getRange(totaleRow, 1, 1, header.length).setFontWeight('bold')

  // Cosmetic mirrors of the TOTALE row, for a human skimming the raw sheet —
  // the app itself never reads these two cells.
  tab.getRange(2, 1, 1, 2).setValues([['Totale speso', '=E' + totaleRow]])
  tab.getRange(3, 1, 1, 2).setValues([['Saldo attuale', '=J' + totaleRow]])
}

/**
 * Creates a trip tab named `"{emoji} {name}"` and sets its row-1 metadata.
 * @param {{name: string, emoji: string, startDate: string, endDate: string}} input
 * @return {Object} the created trip
 */
function createTrip_(input) {
  if (!input || !cellToString(input.name)) throw new Error('Trip name is required')

  var trip = {
    name: cellToString(input.name),
    emoji: cellToString(input.emoji) || '🧳',
    startDate: cellToString(input.startDate),
    endDate: cellToString(input.endDate),
  }
  var ss = getSpreadsheet_()
  var tabName = tripTabName(trip)
  if (ss.getSheetByName(tabName)) throw new Error('A trip tab named "' + tabName + '" already exists')

  var participants = parseParticipants(readValues_(USERS_TAB))
  var tab = ss.insertSheet(tabName)
  buildTripTab_(tab, trip, participants)
  ss.setActiveSheet(tab)
  ss.moveActiveSheet(ss.getNumSheets())

  return { id: tabName, name: trip.name, emoji: trip.emoji, startDate: trip.startDate, endDate: trip.endDate }
}

/**
 * Updates an existing trip's metadata in place. A trip's id IS its tab name
 * (see tripTabName), so changing the name or emoji renames the tab; the
 * caller must switch to the returned `id` afterwards.
 * @param {string} id the trip's current tab name
 * @param {{name: string, emoji: string, startDate: string, endDate: string}} input
 * @return {Object} the updated trip
 */
function updateTrip_(id, input) {
  if (!id) throw new Error('Missing trip id')
  if (!input || !cellToString(input.name)) throw new Error('Trip name is required')

  var ss = getSpreadsheet_()
  var tab = ss.getSheetByName(id)
  if (!tab) throw new Error('Trip not found: ' + id)
  // Only an actual trip tab may be renamed and have its row 1 rewritten. Without
  // this, an `id` of `Users` or `Categorie` would rename that tab and overwrite
  // its header row — destroying the participant roster / write allowlist. Same
  // guard, for the same reason, as findExpenseTab_.
  if (classifyTab(id, tab.getRange(1, 1).getValue()) !== TAB_TYPE.trip) {
    throw new Error('Not a trip tab: ' + id)
  }

  var trip = {
    name: cellToString(input.name),
    emoji: cellToString(input.emoji) || '🧳',
    startDate: cellToString(input.startDate),
    endDate: cellToString(input.endDate),
  }
  var newTabName = tripTabName(trip)
  if (newTabName !== id) {
    if (ss.getSheetByName(newTabName)) {
      throw new Error('A trip tab named "' + newTabName + '" already exists')
    }
    tab.setName(newTabName)
  }

  var row1 = buildTripRow1Values(trip)
  tab.getRange(1, 1, 1, row1.length).setValues([row1])

  return { id: newTabName, name: trip.name, emoji: trip.emoji, startDate: trip.startDate, endDate: trip.endDate }
}

/**
 * Permanently deletes a trip's tab, and every expense on it. Unlike an
 * expense row, a trip tab has no row-position invariant to preserve, so
 * removing the whole tab is safe.
 * @param {string} id the trip's tab name
 * @return {boolean} true
 */
function deleteTrip_(id) {
  if (!id) throw new Error('Missing trip id')
  var ss = getSpreadsheet_()
  var tab = ss.getSheetByName(id)
  if (!tab) throw new Error('Trip not found: ' + id)
  // Same guard as updateTrip_: without it, an id of `Users` or `Categorie`
  // would delete the participant roster or write allowlist tab.
  if (classifyTab(id, tab.getRange(1, 1).getValue()) !== TAB_TYPE.trip) {
    throw new Error('Not a trip tab: ' + id)
  }
  ss.deleteSheet(tab)
  return true
}

/**
 * Appends a new category to the Categorie tab. Requires the tab to already
 * exist (see docs/sheet-setup.md) — it's not auto-created, since its column
 * order/header is meant to be set up once by hand.
 * @param {{name: string, icon: string, overhead: boolean}} input
 * @return {Object} the created category
 */
function addCategory_(input) {
  if (!input || !cellToString(input.name)) throw new Error('Category name is required')
  var tab = getSpreadsheet_().getSheetByName(CATEGORIES_TAB)
  if (!tab) throw new Error('Missing sheet tab: ' + CATEGORIES_TAB)

  var category = { name: cellToString(input.name), icon: cellToString(input.icon), overhead: !!input.overhead }
  tab.appendRow(buildCategoryRowValues(category))
  return category
}

// ---------------------------------------------------------------------------
// Action history (History tab)
// ---------------------------------------------------------------------------

/**
 * Reads an expense's current state, for diffing against what it's about to
 * become (update) or logging what's about to be lost (delete). Must be called
 * BEFORE the corresponding write, since that overwrites/clears the row.
 * @param {string} id
 * @param {string=} sheetId
 * @return {Object|null} null if the expense/tab no longer exists
 */
function getExpenseSnapshot_(id, sheetId) {
  var rowNumber = parseInt(id, 10)
  var tab = findExpenseTab_(sheetId)
  if (!tab || !rowNumber || rowNumber < 1 || rowNumber > tab.getLastRow()) return null
  var read = readExpenseTab_(tab)
  var participants = parseParticipants(readValues_(USERS_TAB))
  var row = tab.getRange(rowNumber, 1, 1, tab.getLastColumn()).getValues()[0]
  return rowToExpense(row, rowNumber, participants, read.cols)
}

/**
 * Reads a trip's current metadata, for diffing (update) or logging what's
 * about to be deleted. Must be called BEFORE the corresponding write.
 * @param {string} id the trip's tab name
 * @return {Object|null} null if no such tab exists
 */
function getTripSnapshot_(id) {
  var tab = id ? getSpreadsheet_().getSheetByName(id) : null
  if (!tab) return null
  var row1 = tab.getRange(1, 1, 1, 5).getValues()[0]
  var meta = parseTabMeta(row1)
  return { id: id, name: meta.name || id, emoji: meta.emoji, startDate: meta.startDate, endDate: meta.endDate }
}

/**
 * Appends one row to the History tab (created on first use, header included;
 * column order must match HISTORY_COL in sheet.js). Never throws on its own
 * account — a logging failure shouldn't roll back or mask the write it's
 * recording, so any error here is swallowed.
 * @param {Object} entry
 * @param {string} entry.actor participant name (see requireUser_)
 * @param {string} entry.action 'add' | 'update' | 'delete'
 * @param {string} entry.entity 'expense' | 'trip' | 'category'
 * @param {string=} entry.entityId the row number (expense) or tab name (trip) this
 *   points to — omitted for deletes (nothing left to point at) and categories
 *   (no per-category page exists), so the app knows not to render a link.
 * @param {string=} entry.sheetId the trip tab an expense lives on, '' for household.
 * @param {string} entry.label one-line label for the item — see expenseLabel/
 *   formatTripSummary/formatCategorySummary in sheet.js.
 * @param {string=} entry.category expense category — expenses only.
 * @param {number=} entry.amount expense amount — expenses only.
 * @param {string=} entry.date expense date — expenses only.
 * @param {string=} entry.changes field-by-field diff — see diffExpense/diffTrip in sheet.js.
 */
function logHistory_(entry) {
  try {
    var ss = getSpreadsheet_()
    var tab = ss.getSheetByName(HISTORY_TAB)
    if (!tab) {
      tab = ss.insertSheet(HISTORY_TAB)
      tab.appendRow(['Timestamp', 'Actor', 'Action', 'Entity', 'Entity Id', 'Sheet', 'Label', 'Category', 'Amount', 'Date', 'Changes'])
      tab.getRange(1, 1, 1, 11).setFontWeight('bold')
    }
    tab.appendRow([
      new Date().toISOString(),
      entry.actor,
      entry.action,
      entry.entity,
      entry.entityId || '',
      entry.sheetId || '',
      entry.label || '',
      entry.category || '',
      entry.amount != null ? entry.amount : '',
      entry.date || '',
      entry.changes || '',
    ])
  } catch (err) {
    // Swallowed — see doc comment above.
  }
}

// ---------------------------------------------------------------------------
// Recurring expenses
// ---------------------------------------------------------------------------

/**
 * Monthly job: recreates every recurring household expense (e.g. rent,
 * internet) that hasn't already been logged this month. Idempotent — safe to
 * run more than once in the same month (see expensesToRecreateThisMonth).
 * Runs on the household tab only; trips are time-boxed, so recurring doesn't
 * apply there. Install the monthly trigger once via installMonthlyRecurringTrigger.
 * @return {string} a human-readable status.
 */
function runMonthlyRecurringExpenses() {
  var household = findHouseholdTab_()
  if (!household) return 'No household tab found (see docs/sheet-setup.md).'

  var participants = parseParticipants(readValues_(USERS_TAB))
  var today = todayIso_()
  var expenses = parseExpenses(household.getDataRange().getValues(), participants)
  var toCreate = expensesToRecreateThisMonth(expenses, today)

  var created = 0
  for (var i = 0; i < toCreate.length; i++) {
    var read = readExpenseTab_(household) // re-read: prior iterations filled a slot
    var rowNumber = ensureBlankSlotRow_(household, read)
    writeExpenseRow_(household, rowNumber, toCreate[i], participants, read.cols, true)
    created++
  }
  return 'Created ' + created + ' of ' + toCreate.length + ' recurring expense(s) for ' + today.slice(0, 7) + '.'
}

/**
 * One-time setup: installs the monthly trigger for runMonthlyRecurringExpenses
 * (day 1 of each month, ~6am in the script's timezone). Run once from the
 * editor; safe to re-run (replaces any existing trigger for this function so
 * re-running doesn't create duplicates).
 * @return {string} a human-readable status.
 */
function installMonthlyRecurringTrigger() {
  var triggers = ScriptApp.getProjectTriggers()
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'runMonthlyRecurringExpenses') {
      ScriptApp.deleteTrigger(triggers[i])
    }
  }
  ScriptApp.newTrigger('runMonthlyRecurringExpenses').timeBased().onMonthDay(1).atHour(6).create()
  return 'Monthly recurring-expense trigger installed (runs day 1 of each month, ~6am).'
}

/** @return {string} today as ISO YYYY-MM-DD in the script's timezone. */
function todayIso_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd')
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/**
 * Reports the caller's identity + authorization status. Never throws —
 * returns `authorized: false` (with a reason) for anonymous or non-allowlisted
 * callers.
 * @param {Object} body parsed POST body (expects `idToken`)
 * @return {{ok: true, authorized: boolean, email: string, name: string, reason: string}}
 */
function whoAmI_(body) {
  var r = authorize_(body)
  return { ok: true, authorized: r.authorized, email: r.email, name: r.name, reason: r.reason }
}

/**
 * Verifies the caller is an allowed participant, or throws.
 * @param {Object} body a POST body or a GET's query params — either way, expects `idToken`
 * @return {{email: string, name: string}}
 */
function requireUser_(body) {
  var r = authorize_(body)
  if (!r.authorized) throw new Error('Not authorized: ' + r.reason)
  return { email: r.email, name: r.name }
}

/**
 * Runs the full authorization decision for a request: validate the ID token
 * with Google, then apply audience + allowlist checks (pure logic in auth.js).
 * @param {Object} body
 * @return {{authorized: boolean, email: string, name: string, reason: string}}
 */
function authorize_(body) {
  var token = body && body.idToken
  if (!token) return { authorized: false, email: '', name: '', reason: 'sign-in required' }
  var claims = verifyIdToken_(token)
  return evaluateUser(claims, getClientId_(), getUsers_())
}

/**
 * Validates a Google ID token via the public tokeninfo endpoint (checks the
 * signature and expiry server-side) and returns its claims, or null if invalid.
 * @param {string} idToken
 * @return {Object|null}
 */
function verifyIdToken_(idToken) {
  try {
    var res = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
      { muteHttpExceptions: true },
    )
    if (res.getResponseCode() !== 200) return null
    return JSON.parse(res.getContentText())
  } catch (err) {
    return null
  }
}

/** @return {string} the OAuth client ID this backend accepts tokens for. */
function getClientId_() {
  return PropertiesService.getScriptProperties().getProperty('OAUTH_CLIENT_ID') || ''
}

/**
 * Reads the participant allowlist from the `Users` tab (email→name). Returns
 * an empty allowlist when the tab is absent, so writes simply fail closed.
 * @return {Object<string, string>}
 */
function getUsers_() {
  var sheet = getSpreadsheet_().getSheetByName(USERS_TAB)
  if (!sheet) return {}
  return parseUsers(sheet.getDataRange().getValues())
}

/**
 * One-time setup: creates the `Users` tab if missing and seeds it with the
 * deploying account. Run once from the editor, then edit the tab to add/remove
 * participants (Email, Name, Icon columns). The first two named rows become
 * Persona A and B, in order — see docs/sheet-setup.md. Safe to re-run.
 * @return {string} a human-readable status.
 */
function setupUsersTab() {
  var ss = getSpreadsheet_()
  var sheet = ss.getSheetByName(USERS_TAB)
  if (!sheet) {
    sheet = ss.insertSheet(USERS_TAB)
    sheet.appendRow(['Email', 'Name', 'Icon'])
    sheet.appendRow([Session.getEffectiveUser().getEmail(), '', ''])
  }
  return USERS_TAB + ' tab ready with ' + Math.max(0, sheet.getLastRow() - 1) + ' user(s).'
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** @return {GoogleAppsScript.Spreadsheet.Spreadsheet} the sheet to operate on. */
function getSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID')
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActive()
}

/** @return {GoogleAppsScript.Spreadsheet.Sheet|null} the first tab classified as household. */
function findHouseholdTab_() {
  var sheets = getSpreadsheet_().getSheets()
  for (var i = 0; i < sheets.length; i++) {
    var name = sheets[i].getName()
    var a1 = sheets[i].getRange(1, 1).getValue()
    if (classifyTab(name, a1) === TAB_TYPE.household) return sheets[i]
  }
  return null
}

/**
 * Resolves the tab a set of expenses lives on: the household tab when
 * `sheetId` is omitted, otherwise the trip tab with that exact name — rejecting
 * anything that doesn't classify as household/trip, so callers can't address
 * `Users`, `Categorie`, or any other tab through this parameter.
 * @param {string=} sheetId
 * @return {GoogleAppsScript.Spreadsheet.Sheet|null}
 */
function findExpenseTab_(sheetId) {
  if (!sheetId) return findHouseholdTab_()
  var tab = getSpreadsheet_().getSheetByName(sheetId)
  if (!tab) return null
  var a1 = tab.getRange(1, 1).getValue()
  var kind = classifyTab(sheetId, a1)
  if (kind !== TAB_TYPE.household && kind !== TAB_TYPE.trip) return null
  return tab
}

/** @param {string} name @return {Array<Array<*>>} */
function readValues_(name) {
  var tab = getSpreadsheet_().getSheetByName(name)
  if (!tab) throw new Error('Missing sheet tab: ' + name)
  return tab.getDataRange().getValues()
}

/** Like readValues_, but returns an empty range instead of throwing when the tab doesn't exist yet. */
function readValuesOptional_(name) {
  var tab = getSpreadsheet_().getSheetByName(name)
  return tab ? tab.getDataRange().getValues() : []
}

/** @param {*} payload @return {GoogleAppsScript.Content.TextOutput} */
function json(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  )
}

/** @param {*} err @return {string} */
function errorMessage_(err) {
  return err && err.message ? err.message : String(err)
}
