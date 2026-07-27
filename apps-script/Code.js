/**
 * Linkulino — Apps Script web app (bound to the expenses spreadsheet).
 *
 * The ONLY thing that touches the spreadsheet. Runs as the sheet owner and
 * exposes a small JSON API:
 *   - doGet  → reads   (?action=health, participants, expenses[&sheet=], trips, categories)
 *   - doPost → writes  (addExpense, updateExpense, createTrip)
 *
 * All pure logic (tab discovery, row↔object mapping, blank-slot finding) lives
 * in sheet.js and is unit-tested in Node. This file is just the glue: read
 * values → call pure fn → write values. See docs/sheet-setup.md for the schema.
 *
 * Cross-origin note: browsers can't send a JSON preflight to Apps Script, so the
 * SPA POSTs with Content-Type text/plain and a JSON string body — hence the
 * manual JSON.parse of e.postData.contents below.
 *
 * AUTH: reads are public; every write verifies the caller's Google ID token
 * (via Google's tokeninfo endpoint) and checks the email against the
 * participant allowlist in the `Users` tab before touching the sheet (see
 * requireUser_). Auth decisions themselves are pure logic in auth.js.
 */

var VERSION = '0.2.0'
var USERS_SHEET = 'Users'

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || 'health'
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

    requireUser_(body) // throws unless the caller is an allowed participant
    switch (body.action) {
      case 'addExpense':
        return json({ ok: true, expense: addExpense_(body.expense, body.sheet) })
      case 'updateExpense':
        return json({ ok: true, expense: updateExpense_(body.id, body.expense, body.sheet) })
      case 'createTrip':
        return json({ ok: true, trip: createTrip_(body.trip) })
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

/** @return {{name: string}[]} the two participants, in Persona A/B order. */
function getParticipants_() {
  var settings = readValues_(SETTINGS_TAB)
  var names = parseParticipants(settings)
  var result = []
  if (names.a) result.push({ name: names.a })
  if (names.b) result.push({ name: names.b })
  return result
}

/**
 * Reads the category dropdown's data-validation list from the household tab's
 * Categoria column, so categories stay sheet-driven rather than hardcoded.
 * @return {string[]}
 */
function getCategories_() {
  var household = findHouseholdTab_()
  if (!household) return []
  var values = household.getDataRange().getValues()
  var headerRowIndex = findHeaderRowIndex(values)
  if (headerRowIndex === -1) return []
  var rule = household
    .getRange(headerRowIndex + 2, COL.category + 1)
    .getDataValidation()
  if (!rule) return []
  var criteria = rule.getCriteriaValues()
  var list = criteria && criteria[0]
  return Array.isArray(list) ? list.map(cellToString).filter(Boolean) : []
}

/**
 * @param {string=} sheetId a trip's tab name, or omitted for the household budget.
 * @return {Object[]} that tab's expenses.
 */
function getExpenses_(sheetId) {
  var tab = findExpenseTab_(sheetId)
  if (!tab) return []
  var participants = parseParticipants(readValues_(SETTINGS_TAB))
  return parseExpenses(tab.getDataRange().getValues(), participants)
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
 * so this fills A–G in place rather than appending a row). The recurring flag
 * (column K) only applies to the household budget — trips are time-boxed, so
 * "repeats every month" doesn't apply there, and column K is never touched on
 * a trip tab.
 * @param {{date: string, description: string, category: string, payer: string, amount: number, splits: Object, recurring: boolean}} input
 * @param {string=} sheetId a trip's tab name, or omitted for the household budget.
 * @return {Object} the created expense
 */
function addExpense_(input, sheetId) {
  if (!input) throw new Error('Missing expense')
  var tab = findExpenseTab_(sheetId)
  if (!tab) throw new Error('No matching expense tab found (see docs/sheet-setup.md)')

  var values = tab.getDataRange().getValues()
  var rowNumber = findBlankSlotRow(values)
  if (rowNumber === -1) {
    throw new Error('No blank row left on this tab — extend the Quota/Saldo formulas down first')
  }

  var participants = parseParticipants(readValues_(SETTINGS_TAB))
  writeExpenseRow_(tab, rowNumber, input, participants, !sheetId)

  var updated = tab.getRange(rowNumber, 1, 1, COL.recurring + 1).getValues()[0]
  return rowToExpense(updated, rowNumber, participants)
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

  var participants = parseParticipants(readValues_(SETTINGS_TAB))
  writeExpenseRow_(tab, rowNumber, input, participants, !sheetId)

  var updated = tab.getRange(rowNumber, 1, 1, COL.recurring + 1).getValues()[0]
  return rowToExpense(updated, rowNumber, participants)
}

/**
 * Writes an expense's A–G cells to a specific row, and its recurring flag
 * (column K) only when `includeRecurring` (household budget only — see callers).
 * @param {GoogleAppsScript.Spreadsheet.Sheet} tab
 * @param {number} rowNumber 1-based
 * @param {Object} input
 * @param {{a: string, b: string}} participants
 * @param {boolean} includeRecurring
 */
function writeExpenseRow_(tab, rowNumber, input, participants, includeRecurring) {
  var rowValues = buildExpenseRowValues(input, participants)
  tab.getRange(rowNumber, COL.date + 1, 1, rowValues.length).setValues([rowValues])
  if (includeRecurring) {
    tab.getRange(rowNumber, COL.recurring + 1).setValue(!!input.recurring)
  }
}

/**
 * Duplicates the trip template tab, renames it `"{emoji} {name}"`, and sets
 * its row-1 metadata.
 * @param {{name: string, emoji: string, startDate: string, endDate: string}} input
 * @return {Object} the created trip
 */
function createTrip_(input) {
  if (!input || !cellToString(input.name)) throw new Error('Trip name is required')

  var ss = getSpreadsheet_()
  var template = ss.getSheetByName(TEMPLATE_TAB)
  if (!template) throw new Error('Missing template tab: ' + TEMPLATE_TAB)

  var trip = {
    name: cellToString(input.name),
    emoji: cellToString(input.emoji) || '🧳',
    startDate: cellToString(input.startDate),
    endDate: cellToString(input.endDate),
  }
  var tabName = tripTabName(trip)
  if (ss.getSheetByName(tabName)) throw new Error('A trip tab named "' + tabName + '" already exists')

  var copy = template.copyTo(ss)
  copy.setName(tabName)
  ss.setActiveSheet(copy)
  ss.moveActiveSheet(ss.getNumSheets())

  var row1 = buildTripRow1Values(trip)
  copy.getRange(1, 1, 1, row1.length).setValues([row1])

  return { id: tabName, name: trip.name, emoji: trip.emoji, startDate: trip.startDate, endDate: trip.endDate }
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

  var participants = parseParticipants(readValues_(SETTINGS_TAB))
  var today = todayIso_()
  var expenses = parseExpenses(household.getDataRange().getValues(), participants)
  var toCreate = expensesToRecreateThisMonth(expenses, today)

  var created = 0
  for (var i = 0; i < toCreate.length; i++) {
    var values = household.getDataRange().getValues() // re-read: prior iterations filled a slot
    var rowNumber = findBlankSlotRow(values)
    if (rowNumber === -1) break // out of pre-filled rows; stop rather than append past the formulas
    writeExpenseRow_(household, rowNumber, toCreate[i], participants, true)
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
 * @param {Object} body parsed POST body (expects `idToken`)
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
  var sheet = getSpreadsheet_().getSheetByName(USERS_SHEET)
  if (!sheet) return {}
  return parseUsers(sheet.getDataRange().getValues())
}

/**
 * One-time setup: creates the `Users` allowlist tab if missing and seeds it
 * with the deploying account. Run once from the editor, then edit the tab to
 * add/remove participants (Email, Name columns). Safe to re-run.
 * @return {string} a human-readable status.
 */
function setupUsersTab() {
  var ss = getSpreadsheet_()
  var sheet = ss.getSheetByName(USERS_SHEET)
  if (!sheet) {
    sheet = ss.insertSheet(USERS_SHEET)
    sheet.appendRow(['Email', 'Name'])
    sheet.appendRow([Session.getEffectiveUser().getEmail(), ''])
  }
  return USERS_SHEET + ' tab ready with ' + Math.max(0, sheet.getLastRow() - 1) + ' user(s).'
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
 * `Impostazioni`, `Users`, or any other tab through this parameter.
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
