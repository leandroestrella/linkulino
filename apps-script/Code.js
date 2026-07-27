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
 * There is no admin gate yet (Phase 2, to match Georgie's Google-sign-in
 * pattern) — every write currently succeeds. Don't share this deployment's URL
 * beyond the two of you until that lands.
 */

var VERSION = '0.1.0'

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
