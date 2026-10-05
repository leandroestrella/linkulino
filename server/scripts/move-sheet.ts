/**
 * Moves a spreadsheet from Linkulino's first layout — one tab for the household
 * and one per trip, each with its own totals above the header — to the layout
 * the backend syncs with: every expense on `Spese`, the trips on `Viaggi`, and
 * a `Riepilogo` tab of formulas for totals and balances (see docs/sheet-setup.md).
 *
 *   node scripts/move-sheet.ts --sheet <id> --key <service-account.json>           lists what it would do
 *   node scripts/move-sheet.ts --sheet <id> --key <service-account.json> --apply   does it
 *
 *   --save <dir>   also keeps a copy of every tab as it was, one JSON file each
 *   --from <file>  reads the tabs from a JSON file ({ "<tab>": [[cells]] }) instead
 *                  of Google; only for listing
 *
 * Without `--apply` nothing is written. Applying only ever adds: the three new
 * tabs, an `ID` column on the categories tab, `Role` and `Persona` columns on
 * the users tab. The old expense tabs are left exactly as they were, for you to
 * delete once you trust the new ones. It refuses to run twice.
 *
 * The planning half (`planMove`) is pure and tested; the rest talks to Google.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { signAssertion, type Cell, type ServiceAccount } from '@lndrstrll/pomuku-server'
import { nameId } from '../src/schema.ts'

// --- the plan ---------------------------------------------------------------

export const SPESE = ['ID', 'Data', 'Descrizione', 'Categoria', 'Pagato da', 'Importo (€)', 'Quota % A', 'Quota % B', 'Ricorrente', 'Note', 'Viaggio']
export const VIAGGI = ['ID', 'Nome', 'Emoji', 'Inizio', 'Fine']

const HOUSEHOLD_MARKER = 'casa'
const TRIP_MARKER = 'viaggio'
/** Tabs that are never expense tabs, whatever their first cell says (compared in lowercase). */
const NOT_EXPENSES = ['users', 'categorie', 'history', 'spese', 'viaggi', 'riepilogo', 'validation']

export interface MovePlan {
  /** The two participants' names, from the first two named rows of the users tab. */
  participants: { a: string | null; b: string | null }
  /** Where each expense tab's rows went. */
  sources: { tab: string; kind: 'household' | 'trip'; trip: string; expenses: number }[]
  /** Rows for `Viaggi`, without the header. */
  trips: Cell[][]
  /** Rows for `Spese`, without the header. */
  expenses: Cell[][]
  /** What a person should look at: values that were changed on the way, or look wrong. */
  notes: string[]
}

const text = (cell: Cell) => (cell === null || cell === undefined ? '' : String(cell).trim())
const blank = (cell: Cell) => text(cell) === ''

/** `YYYY-MM-DD` or `DD/MM/YYYY` as the sheet's day count (days since 30 December 1899), or null. */
export function serialOf(value: string): number | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value)
  const [year, month, day] = iso ? [iso[1], iso[2], iso[3]] : dmy ? [dmy[3], dmy[2], dmy[1]] : []
  if (!year) return null
  const time = Date.UTC(Number(year), Number(month) - 1, Number(day))
  const check = new Date(time)
  if (check.getUTCMonth() !== Number(month) - 1 || check.getUTCDate() !== Number(day)) return null
  return Math.round((time - Date.UTC(1899, 11, 30)) / 86_400_000)
}

/** A tab by its name, whatever its capitals: the sheet itself doesn't tell `users` from `Users`. */
export function findTab(tabs: Record<string, Cell[][]>, name: string): string | undefined {
  return Object.keys(tabs).find((title) => title.trim().toLowerCase() === name.toLowerCase())
}

function column(header: Cell[], name: string): number {
  return header.findIndex((cell) => text(cell).toLowerCase() === name.toLowerCase())
}

export function planMove(tabs: Record<string, Cell[][]>): MovePlan {
  const plan: MovePlan = { participants: { a: null, b: null }, sources: [], trips: [], expenses: [], notes: [] }
  const note = (message: string) => void plan.notes.push(message)

  // the participants: the first two rows of the users tab with a name
  const users = tabs[findTab(tabs, 'users') ?? ''] ?? []
  const nameColumn = column(users[0] ?? [], 'name')
  const names = nameColumn === -1 ? [] : users.slice(1).map((row) => text(row[nameColumn])).filter(Boolean)
  plan.participants = { a: names[0] ?? null, b: names[1] ?? null }
  if (names.length < 2) note('the users tab names fewer than two people: fill in `Persona` (A and B) by hand afterwards')
  const known = new Map(names.slice(0, 2).map((name) => [name.toLowerCase(), name]))

  const categories = tabs[findTab(tabs, 'categorie') ?? ''] ?? []
  const categoryNames = new Set(categories.slice(1).map((row) => text(row[0]).toLowerCase()).filter(Boolean))

  const tripIds = new Set<string>()
  for (const [tab, values] of Object.entries(tabs)) {
    if (NOT_EXPENSES.includes(tab.trim().toLowerCase())) continue
    const marker = text(values[0]?.[0]).toLowerCase()
    if (marker !== HOUSEHOLD_MARKER && marker !== TRIP_MARKER) continue
    const kind = marker === HOUSEHOLD_MARKER ? 'household' : 'trip'

    let trip = ''
    if (kind === 'trip') {
      // row 1: marker, name, start date, emoji, end date
      const [, name, start, emoji, end] = values[0]!
      const base = nameId(text(name) || tab)
      trip = base
      for (let n = 2; tripIds.has(trip); n++) trip = `${base}-${n}`
      tripIds.add(trip)
      const day = (cell: Cell, which: string) => {
        if (typeof cell === 'number') return Math.floor(cell)
        if (blank(cell)) return ''
        const serial = serialOf(text(cell))
        if (serial === null) note(`"${tab}": the ${which} date "${text(cell)}" is not a date; left empty`)
        return serial ?? ''
      }
      plan.trips.push([trip, text(name) || tab, text(emoji), day(start, 'start'), day(end, 'end')])
    }

    const headerIndex = values.slice(0, 10).findIndex((row) => text(row[0]) === 'Data')
    if (headerIndex === -1) {
      note(`"${tab}": no header row found (a row starting with "Data"); none of its expenses were taken`)
      plan.sources.push({ tab, kind, trip, expenses: 0 })
      continue
    }
    // past the five fixed columns, the rest are found by their header's first words
    const header = values[headerIndex]!
    const found = { splitA: -1, splitB: -1, recurring: -1, notes: -1 }
    header.forEach((cell, index) => {
      const label = text(cell).toLowerCase()
      if (index < 5) return
      if (label.startsWith('ricorrente')) found.recurring = index
      else if (label.startsWith('note')) found.notes = index
      else if (label.startsWith('quota %')) {
        if (found.splitA === -1) found.splitA = index
        else if (found.splitB === -1) found.splitB = index
      }
    })

    let count = 0
    values.forEach((row, index) => {
      if (index <= headerIndex) return
      const where = `"${tab}" row ${index + 1}`
      const description = text(row[1])
      if (text(row[0]).toUpperCase() === 'TOTALE') return
      // a slot waiting to be filled: only its formulas and default shares
      if (blank(row[0]) && !description) return

      let date: Cell = ''
      if (typeof row[0] === 'number') date = Math.floor(row[0])
      else if (!blank(row[0])) {
        const serial = serialOf(text(row[0]))
        if (serial === null) note(`${where} (${description}): the date "${text(row[0])}" is not a date; left empty`)
        else date = serial
      } else note(`${where} (${description}): no date`)

      let payer = text(row[3])
      const listed = known.get(payer.toLowerCase())
      if (listed) payer = listed
      else if (payer) note(`${where} (${description}): paid by "${payer}", who is not one of the two participants; kept as it is`)
      else note(`${where} (${description}): nobody is named as having paid`)

      let amount: Cell = row[4]
      if (typeof amount === 'string' && !blank(amount)) {
        const parsed = Number(amount.replace(',', '.'))
        if (Number.isNaN(parsed)) note(`${where} (${description}): the amount "${amount}" is not a number; kept as text, the sync will list it`)
        else amount = parsed
      }
      if (blank(amount)) note(`${where} (${description}): no amount`)

      const share = (position: number) => (position === -1 || blank(row[position]) ? '' : row[position]!)
      const [splitA, splitB] = [share(found.splitA), share(found.splitB)]
      if (typeof splitA === 'number' && typeof splitB === 'number' && Math.abs(splitA + splitB - 100) > 0.01) {
        note(`${where} (${description}): the shares are ${splitA}% and ${splitB}%, which is not 100% in all`)
      }

      const category = text(row[2])
      if (category && categoryNames.size && !categoryNames.has(category.toLowerCase())) {
        note(`${where} (${description}): the category "${category}" is not on the categories tab`)
      }

      const recurring = kind === 'household' && found.recurring !== -1 ? row[found.recurring] === true || text(row[found.recurring]).toUpperCase() === 'TRUE' : ''
      plan.expenses.push(['', date, description, category, payer, blank(amount) ? '' : amount!, splitA, splitB, recurring, found.notes === -1 ? '' : text(row[found.notes]), trip])
      count++
    })
    plan.sources.push({ tab, kind, trip, expenses: count })
  }

  if (!plan.sources.some((source) => source.kind === 'household')) note(`no household tab found (one whose first cell is "${HOUSEHOLD_MARKER}")`)
  return plan
}

/** The plan as a person reads it: what goes where, then what to look at. */
export function describePlan(plan: MovePlan): string {
  const lines = [
    `participants: A = ${plan.participants.a ?? '?'}, B = ${plan.participants.b ?? '?'}`,
    '',
    `Spese: ${plan.expenses.length} expenses, from`,
    ...plan.sources.map((source) => `  ${String(source.expenses).padStart(4)}  ${source.tab}${source.kind === 'trip' ? `  →  Viaggio = ${source.trip}` : '  (household)'}`),
    '',
    `Viaggi: ${plan.trips.length} trips`,
    ...plan.trips.map((trip) => `        ${trip[0]}  (${[trip[2], trip[1]].filter(Boolean).join(' ')})`),
    '',
    plan.notes.length ? `to look at (${plan.notes.length}):` : 'nothing odd found',
    ...plan.notes.map((line) => `  - ${line}`),
  ]
  return lines.join('\n')
}

// --- google -----------------------------------------------------------------

interface TabProperties {
  title: string
  sheetId: number
  gridProperties: { rowCount: number; columnCount: number }
}

async function google(account: ServiceAccount) {
  const answer = await fetch(account.token_uri ?? 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: await signAssertion(account, Math.floor(Date.now() / 1000)),
    }),
  })
  if (!answer.ok) throw new Error(`google refused the service account: ${answer.status} ${await answer.text()}`)
  const { access_token: token } = (await answer.json()) as { access_token: string }
  return async <T>(url: string, body?: unknown): Promise<T> => {
    const response = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!response.ok) throw new Error(`google answered ${response.status}: ${await response.text()}`)
    return (await response.json()) as T
  }
}

const quoted = (tab: string) => `'${tab.replace(/'/g, "''")}'`
const letter = (index: number) => {
  let letters = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters
  return letters
}

async function main() {
  const args = process.argv.slice(2)
  const option = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
  const [sheet, key, from, save] = [option('--sheet'), option('--key'), option('--from'), option('--save')]
  const apply = args.includes('--apply')

  if (from) {
    console.log(describePlan(planMove(JSON.parse(readFileSync(from, 'utf8')))))
    return
  }
  if (!sheet || !key) {
    console.error('usage: node scripts/move-sheet.ts --sheet <id> --key <service-account.json> [--save <dir>] [--apply]')
    process.exit(1)
  }

  const call = await google(JSON.parse(readFileSync(key, 'utf8')) as ServiceAccount)
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${sheet}`
  const { sheets } = await call<{ sheets: { properties: TabProperties }[] }>(`${base}?fields=sheets.properties(title,sheetId,gridProperties(rowCount,columnCount))`)
  const properties = new Map(sheets.map(({ properties }) => [properties.title, properties]))

  const query = new URLSearchParams({ valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER' })
  for (const title of properties.keys()) query.append('ranges', quoted(title))
  const read = await call<{ valueRanges: { values?: Cell[][] }[] }>(`${base}/values:batchGet?${query}`)
  const tabs: Record<string, Cell[][]> = Object.fromEntries([...properties.keys()].map((title, index) => [title, read.valueRanges[index]?.values ?? []]))

  if (save) {
    mkdirSync(save, { recursive: true })
    for (const [title, values] of Object.entries(tabs)) writeFileSync(join(save, `${title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'tab'}.json`), JSON.stringify(values, null, 1))
    console.log(`kept a copy of ${properties.size} tabs in ${save}\n`)
  }

  const plan = planMove(tabs)
  console.log(describePlan(plan))

  const existing = ['Spese', 'Viaggi', 'Riepilogo'].filter((name) => findTab(tabs, name))
  if (existing.length) {
    console.log(`\nthis sheet already has ${existing.join(', ')}: it looks moved already, so nothing was written`)
    return
  }
  if (!apply) {
    console.log('\nnothing was written; run again with --apply to do it')
    return
  }

  // 1. the new tabs, and the two old ones under the names the backend looks for
  const usersTab = findTab(tabs, 'users')
  const categoriesTab = findTab(tabs, 'categorie')
  if (!usersTab || !categoriesTab) throw new Error('the sheet needs its users and categorie tabs first (see docs/sheet-setup.md)')
  const usersHeader = (tabs[usersTab]![0] ?? []).map(text)
  const categoriesHeader = (tabs[categoriesTab]![0] ?? []).map(text)
  const added = (header: string[], names: string[]) => names.filter((name) => !header.some((cell) => cell.toLowerCase() === name.toLowerCase()))
  const newUserColumns = added(usersHeader, ['Role', 'Persona'])
  const newCategoryColumns = added(categoriesHeader, ['ID'])

  const widen = (tab: string, header: string[], extra: number) => {
    const grid = properties.get(tab)!
    const missing = header.length + extra - grid.gridProperties.columnCount
    return missing > 0 ? [{ appendDimension: { sheetId: grid.sheetId, dimension: 'COLUMNS', length: missing } }] : []
  }
  const rename = (tab: string, title: string) => (tab === title ? [] : [{ updateSheetProperties: { properties: { sheetId: properties.get(tab)!.sheetId, title }, fields: 'title' } }])
  const newTab = (title: string, rows: number, columns: number) => ({
    addSheet: { properties: { title, gridProperties: { rowCount: rows, columnCount: columns, frozenRowCount: 1 } } },
  })
  const made = await call<{ replies: { addSheet?: { properties: TabProperties } }[] }>(`${base}:batchUpdate`, {
    requests: [
      newTab('Spese', Math.max(1000, plan.expenses.length + 500), SPESE.length + 3),
      newTab('Viaggi', Math.max(200, plan.trips.length + 100), VIAGGI.length),
      newTab('Riepilogo', 1000, 20),
      ...rename(usersTab, 'Users'),
      ...rename(categoriesTab, 'Categorie'),
      ...widen(usersTab, usersHeader, newUserColumns.length),
      ...widen(categoriesTab, categoriesHeader, newCategoryColumns.length),
    ],
  })
  const [spese, viaggi, riepilogo] = made.replies.slice(0, 3).map((reply) => reply.addSheet!.properties.sheetId) as [number, number, number]

  // 2. the values, exactly as they are: nothing is read as if typed
  const personaColumn = usersHeader.length + newUserColumns.indexOf('Persona')
  const usersNameColumn = column(tabs[usersTab]![0] ?? [], 'name')
  let named = 0
  const personas = newUserColumns.includes('Persona')
    ? tabs[usersTab]!.slice(1).map((row) => [text(row[usersNameColumn]) && named < 2 ? ['A', 'B'][named++]! : ''])
    : []
  await call(`${base}/values:batchUpdate`, {
    valueInputOption: 'RAW',
    data: [
      { range: `Spese!A1`, values: [SPESE, ...plan.expenses] },
      { range: `Viaggi!A1`, values: [VIAGGI, ...plan.trips] },
      ...(newUserColumns.length ? [{ range: `Users!${letter(usersHeader.length)}1`, values: [newUserColumns] }] : []),
      ...(personas.length ? [{ range: `Users!${letter(personaColumn)}2`, values: personas }] : []),
      ...(newCategoryColumns.length ? [{ range: `Categorie!${letter(categoriesHeader.length)}1`, values: [newCategoryColumns] }] : []),
    ],
  })

  // 3. the formulas. On `Spese` each sits in its column's header cell and fills
  //    the column below it, so rows the app adds or removes never carry or lose
  //    one; an expense without an amount gets a truly empty cell, not "".
  const personaName = (persona: string) =>
    `=IFERROR(INDEX(Users!A:Z,MATCH("${persona}",INDEX(Users!A:Z,0,MATCH("Persona",Users!1:1,0)),0),MATCH("Name",Users!1:1,0)),"${persona}")`
  const ofTrip = (range: string) => `=IFERROR(SUM(FILTER(Spese!${range},Spese!C2:C&Spese!F2:F<>"",Spese!K2:K=G1)),0)`
  await call(`${base}/values:batchUpdate`, {
    valueInputOption: 'USER_ENTERED',
    data: [
      {
        range: 'Spese!L1:N1',
        values: [[
          '={"Quota "&Riepilogo!$B$1&" (€)";ARRAYFORMULA(IF(F2:F="",,F2:F*G2:G/100))}',
          '={"Quota "&Riepilogo!$B$2&" (€)";ARRAYFORMULA(IF(F2:F="",,F2:F*H2:H/100))}',
          // paid by A: B owes their share; paid by B: A owes theirs; paid by anyone else: nothing between the two
          '={"Saldo (+ = "&Riepilogo!$B$2&" deve a "&Riepilogo!$B$1&")";ARRAYFORMULA(IF((E2:E="")+(F2:F=""),,IF(LOWER(E2:E)=LOWER(Riepilogo!$B$1),M2:M,IF(LOWER(E2:E)=LOWER(Riepilogo!$B$2),-L2:L,))))}',
        ]],
      },
      {
        // who is who, then one line for the household and one per trip
        range: 'Riepilogo!A1:D6',
        values: [
          ['Persona A', personaName('A'), '', ''],
          ['Persona B', personaName('B'), '', ''],
          ['', '', '', ''],
          ['Viaggio', 'Nome', 'Totale speso', '="Saldo (+ = "&B2&" deve a "&B1&")"'],
          ['', 'casa', '=IFERROR(SUM(FILTER(Spese!F2:F,Spese!C2:C&Spese!F2:F<>"",Spese!K2:K="")),0)', '=IFERROR(SUM(FILTER(Spese!N2:N,Spese!C2:C&Spese!F2:F<>"",Spese!K2:K="")),0)'],
          ['=IFERROR(FILTER(Viaggi!A2:B,Viaggi!A2:A<>""))', '', '=ARRAYFORMULA(IF(A6:A="",,SUMIF(Spese!K:K,A6:A,Spese!F:F)))', '=ARRAYFORMULA(IF(A6:A="",,SUMIF(Spese!K:K,A6:A,Spese!N:N)))'],
        ],
      },
      {
        // one trip at a time: pick it in G1 (empty for the household) and its expenses list below
        range: 'Riepilogo!F1:G5',
        values: [
          ['Viaggio (vuoto = casa)', ''],
          ['Totale speso', ofTrip('F2:F')],
          ['Saldo', ofTrip('N2:N')],
          ['=ARRAYFORMULA(Spese!B1:N1)', ''],
          ['=IFERROR(FILTER(Spese!B2:N,Spese!C2:C&Spese!F2:F<>"",Spese!K2:K=G1))', ''],
        ],
      },
    ],
  })

  // 4. how it looks: dates shown as dates, the trip picked from a list
  const cells = (sheetId: number, startColumnIndex: number, endColumnIndex: number, startRowIndex = 1) => ({ sheetId, startRowIndex, startColumnIndex, endColumnIndex })
  const asDate = (range: object) => ({ repeatCell: { range, cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'dd/mm/yyyy' } } }, fields: 'userEnteredFormat.numberFormat' } })
  const bold = (sheetId: number, startRowIndex: number) => ({
    repeatCell: { range: { sheetId, startRowIndex, endRowIndex: startRowIndex + 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat.bold' },
  })
  const tripList = (range: object) => ({
    setDataValidation: { range, rule: { condition: { type: 'ONE_OF_RANGE', values: [{ userEnteredValue: '=Viaggi!$A$2:$A' }] }, showCustomUi: true, strict: false } },
  })
  await call(`${base}:batchUpdate`, {
    requests: [
      asDate(cells(spese, 1, 2)),
      asDate(cells(viaggi, 3, 5)),
      asDate(cells(riepilogo, 5, 6, 4)),
      bold(spese, 0), bold(viaggi, 0), bold(riepilogo, 3),
      tripList(cells(spese, 10, 11)),
      tripList({ sheetId: riepilogo, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 6, endColumnIndex: 7 }),
    ],
  })

  console.log('\ndone: Spese, Viaggi and Riepilogo were added, and the old tabs left as they were. now run the sheet\'s "Sync now" for the first import.')
}

if (import.meta.main) await main()
