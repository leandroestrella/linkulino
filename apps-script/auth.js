/**
 * Linkulino — pure authorization logic (framework-free, no UrlFetchApp).
 *
 * The network part (calling Google's tokeninfo endpoint to validate an ID
 * token) lives in Code.js; this file holds the pure decisions so they can be
 * unit-tested in Node: parsing the participant allowlist and deciding whether
 * a set of verified token claims belongs to an allowed participant.
 *
 * Loaded by both Apps Script (globals) and Node (guarded module.exports).
 */

/**
 * Parses the `Users` tab into an email→name allowlist. Columns are resolved by
 * header name (`Email`, `Name`); emails are lower-cased for case-insensitive
 * matching. Rows missing an email are skipped.
 *
 * @param {Array<Array<*>>} values full `Users` sheet values incl. header row
 * @return {Object<string, string>} lowercased email → participant name
 */
function parseUsers(values) {
  if (!values || values.length < 2) return {}
  var header = values[0]
  var iEmail = -1
  var iName = -1
  for (var i = 0; i < header.length; i++) {
    var label = String(header[i] == null ? '' : header[i]).trim().toLowerCase()
    if (label === 'email') iEmail = i
    else if (label === 'name') iName = i
  }
  if (iEmail === -1) return {}
  var users = {}
  for (var r = 1; r < values.length; r++) {
    var email = String(values[r][iEmail] == null ? '' : values[r][iEmail]).trim().toLowerCase()
    var name = iName === -1 ? '' : String(values[r][iName] == null ? '' : values[r][iName]).trim()
    if (email) users[email] = name
  }
  return users
}

/**
 * Decides whether verified token claims belong to an allowed participant.
 *
 * The claims must already have been validated for authenticity by Google's
 * tokeninfo endpoint (signature + expiry). This function enforces the
 * remaining application checks: audience match (the token was minted for OUR
 * client ID, so a token issued to another app can't be replayed here), a
 * verified email, and membership in the allowlist.
 *
 * @param {Object|null} claims tokeninfo response (aud, email, email_verified, …)
 * @param {string} expectedAud our OAuth client ID
 * @param {Object<string, string>} users email→name allowlist
 * @return {{authorized: boolean, email: string, name: string, reason: string}}
 */
function evaluateUser(claims, expectedAud, users) {
  if (!claims || !claims.email) {
    return { authorized: false, email: '', name: '', reason: 'invalid or expired token' }
  }
  var email = String(claims.email).toLowerCase()
  if (!expectedAud) {
    return { authorized: false, email: email, name: '', reason: 'server missing OAUTH_CLIENT_ID' }
  }
  if (claims.aud !== expectedAud) {
    return { authorized: false, email: email, name: '', reason: 'token audience mismatch' }
  }
  if (claims.email_verified !== true && String(claims.email_verified) !== 'true') {
    return { authorized: false, email: email, name: '', reason: 'email not verified' }
  }
  var name = users && Object.prototype.hasOwnProperty.call(users, email) ? users[email] : null
  if (name == null) {
    return { authorized: false, email: email, name: '', reason: 'not on the allowlist' }
  }
  return { authorized: true, email: email, name: name, reason: '' }
}

// Node-only export (skipped in Apps Script, where `module` is undefined).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseUsers: parseUsers, evaluateUser: evaluateUser }
}
