/**
 * Linkulino — the sheet's side of the sync with the Worker backend (server/).
 *
 * This is pomuku's sheet script, as shipped in @lndrstrll/pomuku-server
 * (sheet-script/Code.js), kept here so `clasp push` puts it in the spreadsheet's
 * bound project. Change it there, not here, and copy the new version over.
 */

/**
 * The sheet's side of the sync: a "sync now" menu, and optionally a nudge
 * after edits. Bound to the app's google sheet (Extensions → Apps Script).
 *
 * The app's backend does the syncing; this only asks it to. Nobody waits on
 * apps script here, so its slowness doesn't matter.
 *
 * Two script properties (Project settings → Script properties):
 *   SYNC_URL     the backend's sync address, https://<app>.<account>.workers.dev/api/v1/sync
 *   SYNC_SECRET  the same long random text set as the worker's SYNC_SECRET
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Sync')
    .addItem('Sync now', 'syncNow')
    .addItem('Sync now, removing rows deleted here', 'syncNowRemovingMissing')
    .addSeparator()
    .addItem('Sync by itself after edits', 'installEditNudge')
    .addItem('Stop syncing after edits', 'removeEditNudge')
    .addToUi()
}

function syncNow() {
  report_(runSync_(''))
}

/**
 * A tab that lost most of its rows is kept as it was in the app, in case it
 * was a slip. This is the way to say it was meant.
 */
function syncNowRemovingMissing() {
  var ui = SpreadsheetApp.getUi()
  var answer = ui.alert('Remove from the app every row deleted from this sheet?', ui.ButtonSet.OK_CANCEL)
  if (answer === ui.Button.OK) report_(runSync_('?missing=remove'))
}

/**
 * Asks the backend to sync until it says it's done. One call sends what the
 * app has waiting and looks at one tab, a limited number of rows at a time, so
 * a first import of a large sheet takes several.
 * @param {string} query '' or '?missing=remove'
 * @return {{ok: boolean, rounds: number, added: number, applied: number, removed: number, issues: number, error: string}}
 */
function runSync_(query) {
  var properties = PropertiesService.getScriptProperties()
  var url = properties.getProperty('SYNC_URL')
  var secret = properties.getProperty('SYNC_SECRET')
  var total = { ok: false, rounds: 0, added: 0, applied: 0, removed: 0, issues: 0, error: '' }
  if (!url || !secret) {
    total.error = 'set the SYNC_URL and SYNC_SECRET script properties first'
    return total
  }
  // stays well inside the six minutes a script may run
  var deadline = Date.now() + 4 * 60 * 1000
  while (Date.now() < deadline) {
    var response = UrlFetchApp.fetch(url + query, {
      method: 'post',
      headers: { 'x-sync-secret': secret },
      muteHttpExceptions: true,
    })
    var body
    try {
      body = JSON.parse(response.getContentText())
    } catch (e) {
      body = { ok: false, error: 'the backend answered ' + response.getResponseCode() }
    }
    if (!body.ok) {
      total.error = body.error || 'the backend answered ' + response.getResponseCode()
      return total
    }
    total.rounds++
    total.added += body.pulled.added
    total.applied += body.pulled.applied
    total.removed += body.pulled.removed
    total.issues += body.pulled.issues
    if (body.done) {
      total.ok = true
      return total
    }
  }
  total.error = 'still syncing after four minutes; run it again to go on'
  return total
}

function report_(total) {
  var ui = SpreadsheetApp.getUi()
  if (!total.ok) {
    ui.alert('The sync did not finish: ' + total.error)
    return
  }
  var parts = []
  if (total.added) parts.push(total.added + ' added')
  if (total.applied) parts.push(total.applied + ' changed')
  if (total.removed) parts.push(total.removed + ' removed')
  var message = parts.length ? 'Taken from this sheet: ' + parts.join(', ') + '.' : 'Nothing here was new to the app.'
  if (total.issues) message += ' Some values could not be taken; see the Validation tab.'
  SpreadsheetApp.getActive().toast(message, 'Sync', 8)
}

// --- the nudge after edits ---------------------------------------------------

/**
 * Makes edits sync by themselves: an installable trigger, because a simple
 * onEdit isn't allowed to call out to the backend. It runs as whoever
 * installs it.
 */
function installEditNudge() {
  removeEditNudge()
  ScriptApp.newTrigger('nudge_').forSpreadsheet(SpreadsheetApp.getActive()).onEdit().create()
  SpreadsheetApp.getActive().toast('Edits now sync by themselves, about a minute after the last one.', 'Sync', 8)
}

function removeEditNudge() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'nudge_') ScriptApp.deleteTrigger(trigger)
  })
}

/**
 * After an edit: one sync a minute at most, however many cells were typed.
 * The edit that finds a sync already asked for within the minute does
 * nothing; its cells are picked up by the next sync, or when someone opens
 * the app.
 */
function nudge_() {
  var cache = CacheService.getScriptCache()
  if (cache.get('nudged')) return
  cache.put('nudged', '1', 60)
  Utilities.sleep(20 * 1000)
  runSync_('')
}
