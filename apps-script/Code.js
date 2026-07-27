/**
 * Linkulino — Apps Script web app (bound to the expenses spreadsheet).
 *
 * The ONLY thing that touches the spreadsheet. Runs as the sheet owner and
 * exposes a small JSON API:
 *   - doGet  → reads   (?action=health, participants, expenses, trips, categories)
 *   - doPost → writes  (addExpense)
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

var VERSION = '0.1.0'
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
        return json({ ok: true, expenses: getHouseholdExpenses_() })
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
        return json({ ok: true, expense: addExpense_(body.expense) })
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

/** @return {Object[]} this instance's household (recurring) expenses. */
function getHouseholdExpenses_() {
  var household = findHouseholdTab_()
  if (!household) return []
  var participants = parseParticipants(readValues_(SETTINGS_TAB))
  return parseExpenses(household.getDataRange().getValues(), participants)
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
 * Writes a new expense into the first blank slot of the household tab (see
 * docs/sheet-setup.md — rows below the header are pre-filled with formulas,
 * so this fills A–E in place rather than appending a row).
 * @param {{date: string, description: string, category: string, payer: string, amount: number}} input
 * @return {Object} the created expense
 */
function addExpense_(input) {
  if (!input) throw new Error('Missing expense')
  var household = findHouseholdTab_()
  if (!household) throw new Error('No household tab found (see docs/sheet-setup.md)')

  var values = household.getDataRange().getValues()
  var rowNumber = findBlankSlotRow(values)
  if (rowNumber === -1) {
    throw new Error('No blank row left on the household tab — extend the Quota/Saldo formulas down first')
  }

  var rowValues = buildExpenseRowValues(input)
  household.getRange(rowNumber, COL.date + 1, 1, rowValues.length).setValues([rowValues])

  var participants = parseParticipants(readValues_(SETTINGS_TAB))
  var updated = household.getRange(rowNumber, 1, 1, 10).getValues()[0]
  return rowToExpense(updated, rowNumber, participants)
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
