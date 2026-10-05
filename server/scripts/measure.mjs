#!/usr/bin/env node
/**
 * Measures what requests cost the deployed Worker in CPU time, which a Worker
 * can't time itself: it follows the Worker's logs with `wrangler tail` while
 * sending the requests, and prints what Cloudflare recorded for each. The free
 * plan allows 10 ms of CPU per request.
 *
 *   npm run measure -- [times] --token <access token> [--base <worker origin>] [--config <wrangler settings file>]
 *
 * First a "Sync now" (asked until done, as the sheet's menu does — on an empty
 * database this is the first import), then the reads the app makes when it
 * opens, `times` times each (5 by default), then a save and the push to the
 * sheet that follows it: a note set on the first expense, then put back as it
 * was. Nothing here is public, so it needs a write access token (`pmt_…`, made
 * by an admin with `POST /tokens`).
 *
 * `--config` names the settings file of the Worker whose logs to follow
 * (`wrangler.local.jsonc` when left out); `--base` is that Worker's address.
 * The sync secret is read from SYNC_SECRET or from `.dev.vars`; nothing secret
 * is printed. Rows read and written come from each answer's `server-timing`
 * header and count the request itself, not the work done after the answer.
 */
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'

const arg = (name) => {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : process.argv[index + 1]
}
const base = (arg('base') ?? 'https://linkulino.pomuku.workers.dev').replace(/\/$/, '')
const token = arg('token')
const times = Number(process.argv[2]) || 5
const vars = new URL('../.dev.vars', import.meta.url)
const secret = process.env.SYNC_SECRET ?? (existsSync(vars) ? /^SYNC_SECRET=(.+)$/m.exec(readFileSync(vars, 'utf8'))?.[1]?.trim() : undefined)
if (!secret) {
  console.error('no sync secret: set SYNC_SECRET, or put it in .dev.vars')
  process.exit(1)
}
if (!token) {
  console.error('no access token: pass --token <pmt_…>')
  process.exit(1)
}

const events = []
const tail = spawn('npx', ['wrangler', 'tail', '-c', arg('config') ?? 'wrangler.local.jsonc', '--format', 'json'], {
  cwd: new URL('..', import.meta.url),
  stdio: ['ignore', 'pipe', 'inherit'],
})
let buffer = ''
tail.stdout.on('data', (chunk) => {
  buffer += chunk
  // Events arrive as JSON objects, one after another, possibly pretty-printed.
  let depth = 0
  let start = -1
  let inString = false
  for (let i = 0; i < buffer.length; i++) {
    const ch = buffer[i]
    if (inString) {
      if (ch === '\\') i++
      else if (ch === '"') inString = false
    } else if (ch === '"') inString = true
    else if (ch === '{') {
      if (depth++ === 0) start = i
    } else if (ch === '}' && --depth === 0) {
      try {
        events.push(JSON.parse(buffer.slice(start, i + 1)))
      } catch {
        // not an event
      }
      buffer = buffer.slice(i + 1)
      i = -1
    }
  }
})
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
// Whatever goes wrong, the log follower mustn't be left running.
process.on('exit', () => tail.kill())
process.on('uncaughtException', (error) => {
  console.error(error)
  process.exit(1)
})
await sleep(6000)
// The log stream tends to drop the first request it sees; let that be one that isn't measured.
await fetch(`${base}/api/v1/health`).catch(() => null)
await sleep(3000)

const sent = []
async function send(label, method, path, { headers = {}, body } = {}) {
  // Each request is told apart in the logs by a query of its own.
  const mark = randomBytes(6).toString('hex')
  const started = performance.now()
  const response = await fetch(`${base}/api/v1${path}${path.includes('?') ? '&' : '?'}m=${mark}`, {
    method,
    headers: { ...headers, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  const seconds = (performance.now() - started) / 1000
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = { ok: false, error: text.slice(0, 200) }
  }
  // The log stream drops events when requests come quickly.
  await sleep(1500)
  sent.push({ label, mark, status: response.status, seconds, bytes: text.length, timing: response.headers.get('server-timing') ?? '' })
  return json
}

// --- a "Sync now", asked until done -------------------------------------------
for (let round = 1; round <= 30; round++) {
  const answer = await send('', 'POST', '/sync', { headers: { 'x-sync-secret': secret } })
  const request = sent[sent.length - 1]
  if (!answer.ok) {
    request.label = `sync ${round}: failed — ${answer.error}`
    break
  }
  const { pushed, pulled } = answer
  request.label = `sync ${round}: ${pulled.table ?? 'nothing'} — ${pulled.added} added, ${pulled.applied} changed, ${pulled.removed} removed, ${pulled.issues} issues; ${pushed.pushed} pushed`
  if (answer.done) break
}
const syncs = sent.length

// --- reads -----------------------------------------------------------------
const authorization = { authorization: `Bearer ${token}` }
for (let i = 0; i < times; i++) {
  await send('GET /health', 'GET', '/health')
  await send('GET /expenses', 'GET', '/expenses', { headers: authorization })
  await send('GET /trips', 'GET', '/trips', { headers: authorization })
  await send('GET /categories', 'GET', '/categories', { headers: authorization })
  await send('GET /participants', 'GET', '/participants', { headers: authorization })
  await send('POST /sync/visit', 'POST', '/sync/visit')
}

// --- a save and its push ---------------------------------------------------------
const all = await send('GET /expenses', 'GET', '/expenses', { headers: authorization })
const expense = all.rows?.[0]
for (let i = 0; expense && i < times; i++) {
  await send('PATCH /expenses/:id (a note) + push', 'PATCH', `/expenses/${expense.id}`, { headers: authorization, body: { notes: 'measure' } })
  await sleep(4000)
  await send('PATCH /expenses/:id (put back) + push', 'PATCH', `/expenses/${expense.id}`, { headers: authorization, body: { notes: expense.notes } })
  await sleep(4000)
}
await send('GET /history (100 entries)', 'GET', '/history', { headers: authorization })

await sleep(8000)
tail.kill()

const logged = (request) => events.find((event) => event.event?.request?.url?.includes(`m=${request.mark}`))
const rowsOf = (request) => /desc="([^"]*)"/.exec(request.timing)?.[1] ?? ''
console.log(`${events.length} events logged for ${sent.length} requests\n`)

console.table(
  Object.fromEntries(
    sent.slice(0, syncs).map((request) => {
      const event = logged(request)
      return [request.label, { status: request.status, 'cpu ms': event?.cpuTime ?? '?', 'wall ms': event?.wallTime ?? '?', outcome: event?.outcome ?? '?', 'answered in s': request.seconds.toFixed(2), rows: rowsOf(request) }]
    }),
  ),
)

const median = (values) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)]
const report = {}
for (const label of new Set(sent.slice(syncs).map((request) => request.label))) {
  const requests = sent.filter((request) => request.label === label)
  const found = requests.map(logged).filter(Boolean)
  const cpu = found.map((event) => event.cpuTime)
  report[label] = {
    status: requests[0].status,
    logged: `${found.length}/${requests.length}`,
    'cpu ms (median)': cpu.length ? median(cpu) : '?',
    'cpu ms (max)': cpu.length ? Math.max(...cpu) : '?',
    outcomes: [...new Set(found.map((event) => event.outcome))].join(', '),
    'answered in s (median)': median(requests.map((request) => request.seconds)).toFixed(2),
    KB: Math.round(requests[0].bytes / 1024),
    rows: rowsOf(requests[0]),
  }
}
console.table(report)
process.exit(0)
