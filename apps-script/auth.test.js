const test = require('node:test')
const assert = require('node:assert/strict')
const auth = require('./auth.js')

test('parseUsers maps email to name, lower-casing emails', () => {
  const values = [
    ['Email', 'Name'],
    ['Alex@Example.com', 'Alex'],
    ['sam@example.com', 'Sam'],
    ['', 'no email, skipped'],
  ]
  assert.deepEqual(auth.parseUsers(values), {
    'alex@example.com': 'Alex',
    'sam@example.com': 'Sam',
  })
})

test('parseUsers tolerates a missing or empty tab', () => {
  assert.deepEqual(auth.parseUsers([]), {})
  assert.deepEqual(auth.parseUsers([['Email', 'Name']]), {})
  assert.deepEqual(auth.parseUsers([['Nope', 'Nope']]), {})
})

test('evaluateUser accepts a verified, allowlisted, correct-audience token', () => {
  const claims = { email: 'Alex@Example.com', email_verified: true, aud: 'client-id' }
  const users = { 'alex@example.com': 'Alex' }
  assert.deepEqual(auth.evaluateUser(claims, 'client-id', users), {
    authorized: true,
    email: 'alex@example.com',
    name: 'Alex',
    reason: '',
  })
})

test('evaluateUser rejects a missing/invalid token', () => {
  const result = auth.evaluateUser(null, 'client-id', {})
  assert.equal(result.authorized, false)
  assert.equal(result.reason, 'invalid or expired token')
})

test('evaluateUser rejects when the server has no client id configured', () => {
  const claims = { email: 'alex@example.com', email_verified: true, aud: 'client-id' }
  const result = auth.evaluateUser(claims, '', {})
  assert.equal(result.authorized, false)
  assert.equal(result.reason, 'server missing OAUTH_CLIENT_ID')
})

test('evaluateUser rejects a token minted for a different client', () => {
  const claims = { email: 'alex@example.com', email_verified: true, aud: 'someone-elses-client' }
  const result = auth.evaluateUser(claims, 'client-id', { 'alex@example.com': 'Alex' })
  assert.equal(result.authorized, false)
  assert.equal(result.reason, 'token audience mismatch')
})

test('evaluateUser rejects an unverified email', () => {
  const claims = { email: 'alex@example.com', email_verified: false, aud: 'client-id' }
  const result = auth.evaluateUser(claims, 'client-id', { 'alex@example.com': 'Alex' })
  assert.equal(result.authorized, false)
  assert.equal(result.reason, 'email not verified')
})

test('evaluateUser rejects an email not on the allowlist', () => {
  const claims = { email: 'stranger@example.com', email_verified: true, aud: 'client-id' }
  const result = auth.evaluateUser(claims, 'client-id', { 'alex@example.com': 'Alex' })
  assert.equal(result.authorized, false)
  assert.equal(result.reason, 'not on the allowlist')
})
