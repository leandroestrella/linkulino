/**
 * Linkulino's backend: a Cloudflare Worker serving a JSON API under `/api/v1`,
 * with a D1 database in the middle and the expenses spreadsheet kept in sync
 * both ways. Sign-in, the allowlist, the history log, the REST routes of the
 * `expenses`, `trips` and `categories` tables and the sheet sync all come from
 * pomuku; this file adds only what is Linkulino's own:
 *
 *   GET    /participants  signed in — the two people expenses are split between
 *   GET    /runway        a person — their own runway settings
 *   PATCH  /runway        a person — changes their own runway settings
 *   DELETE /trips/:id     signed in — removes a trip and every expense on it
 *   POST   /recurring     an admin — this month's recurring expenses, by hand
 *
 * Nothing is public: every read and write needs someone from the `Users` tab.
 * On the first of each month a scheduled run recreates the recurring household
 * expenses (see recurring.ts).
 */
import {
  ApiError, createApp, d1, diffFields, reader, store,
  type AppContext, type AppOptions, type Change, type Database, type Env, type Statement, type Writer,
} from '@lndrstrll/pomuku-server'
import { expensesToRecreate } from './recurring.js'
import { PERSONAS, schema, type ExpenseRow, type Persona } from './schema.js'

/** A participant as the SPA shows them. The email never leaves the backend. */
export interface Participant {
  name: string
  icon: string
  persona: Persona
}

/** Who the history log names for expenses nobody typed: the monthly recurring ones. */
const SELF: Writer = { name: 'linkulino', kind: 'token' }

/** The app, with the parts a test replaces (the clock, Google, the sheet) left open. */
export function linkulino(overrides: Partial<AppOptions<typeof schema, Env>> = {}) {
  const now = overrides.now ?? (() => new Date())
  const database = overrides.database ?? ((env: Env) => d1(env.DB!))
  const { expenses, trips } = schema.tables

  /** The `Users` table, read and written as whoever is making the request. */
  const users = (c: AppContext, writer: Writer | null = null) =>
    store({ db: c.var.db, writer, now, changes: c.var.changes }, schema.users)

  /** The signed-in person; machines with an access token have no settings of their own. */
  function person(c: AppContext) {
    const actor = c.var.actor
    if (!actor) throw new ApiError(401, 'sign in first')
    if (actor.kind !== 'person') throw new ApiError(403, 'only a signed-in person has runway settings')
    return actor
  }

  const runwayOf = (row: Record<string, unknown> | null) => ({ enableRunway: row?.enableRunway === true, savings: Number(row?.savings ?? 0) || 0 })

  /**
   * Adds this month's copy of every recurring household expense that doesn't
   * have one yet. Safe to run again: the second run adds nothing.
   */
  async function recreateRecurring(db: Database, writer: Writer, changes: Change[] = []) {
    const table = store({ db, writer, now, changes }, expenses)
    const due = expensesToRecreate(await table.list(), now().toISOString().slice(0, 10))
    const created: ExpenseRow[] = []
    for (const expense of due) created.push(await table.create(expense))
    return created
  }

  const app = createApp<typeof schema, Env>({
    name: 'linkulino',
    version: '1.0.0',
    schema,
    routes: (api, { allow }) => {
      /**
       * The two participants, Persona A first: the people named `A` and `B` in
       * the `Persona` column of the `Users` tab.
       */
      api.get('/participants', async (c) => {
        allow(c, 'member', 'read')
        const people = (await users(c).list()) as Record<string, unknown>[]
        const participants: Participant[] = PERSONAS.flatMap((persona) => {
          const user = people.find((row) => row.persona === persona && row.name)
          return user ? [{ name: String(user.name), icon: String(user.icon ?? ''), persona }] : []
        })
        return c.json({ ok: true, participants })
      })

      // A person's runway settings are their own: looked up by the email of
      // whoever is signed in, never by anything the request names, so nobody
      // can read or change their partner's.
      api.get('/runway', async (c) => {
        return c.json({ ok: true, runway: runwayOf(await users(c).get(person(c).email)) })
      })

      api.patch('/runway', async (c) => {
        const actor = person(c)
        const body = (await c.req.json().catch(() => null)) as { enableRunway?: unknown; savings?: unknown } | null
        if (!body || typeof body !== 'object') throw new ApiError(400, 'the request body must be a json object')
        const savings = Number(body.savings ?? 0)
        if (!Number.isFinite(savings)) throw new ApiError(422, 'savings must be a number')
        // Logged like every write, under the `users` table, whose history
        // entries only admins are shown.
        const row = await users(c, { name: actor.name, kind: 'person' }).update(actor.email, { enableRunway: body.enableRunway === true, savings })
        return c.json({ ok: true, runway: runwayOf(row) })
      })

      /**
       * Removes a trip and every expense on it, as one transaction: either all
       * of it goes or none does. Each expense leaves its own history entry,
       * with its fields, and its own place in the queue for the sheet.
       */
      api.delete('/trips/:id', async (c) => {
        allow(c, 'member', 'write')
        const actor = c.var.actor!
        const id = c.req.param('id')
        const trip = await store({ db: c.var.db, writer: null, now, changes: c.var.changes }, trips).get(id)
        if (!trip) throw new ApiError(404, `no trips row with id ${id}`)
        const spent = (await c.var.db.query('SELECT * FROM expenses WHERE trip = ?', [id])).rows.map(reader(expenses))

        const at = now().toISOString()
        const removal = (entity: string, row: { id: string; rev: number }, label: string, fields: string[]): Statement[] => [
          { sql: `DELETE FROM ${entity} WHERE id = ? AND rev = ?`, params: [row.id, row.rev] },
          {
            sql: `INSERT INTO history (at, actor, actor_kind, action, entity, entity_id, label, changes)
                  SELECT ?, ?, ?, 'delete', ?, ?, ?, ? WHERE changes() > 0`,
            params: [at, actor.name, actor.kind, entity, row.id, label || row.id, diffFields(row, null, fields)],
          },
          { sql: "INSERT INTO outbox (entity, entity_id, op, at) SELECT ?, ?, 'delete', ? WHERE changes() > 0", params: [entity, row.id, at] },
        ]
        await c.var.db.batch([
          ...spent.flatMap((expense) => removal('expenses', expense, expenses.label?.(expense) ?? '', Object.keys(expenses.columns))),
          ...removal('trips', trip, trips.label?.(trip) ?? '', Object.keys(trips.columns)),
        ])
        c.var.changes.push(...spent.map((expense): Change => ({ entity: 'expenses', id: expense.id, op: 'delete' })), { entity: 'trips', id, op: 'delete' })
        return c.json({ ok: true, expenses: spent.length })
      })

      /** The monthly run, asked for by hand: for a month the schedule missed, or to try it. */
      api.post('/recurring', async (c) => {
        allow(c, 'admin', 'write')
        return c.json({ ok: true, created: await recreateRecurring(c.var.db, SELF, c.var.changes) })
      })
    },
    ...overrides,
  })

  /** The monthly run as the schedule starts it, followed by a sync so the sheet has the new rows. */
  const recurring = async (env: Env) => {
    const created = await recreateRecurring(database(env), SELF)
    if (created.length) await app.sync(env)
    return created
  }
  return Object.assign(app, { recurring })
}

const app = linkulino()

export default {
  fetch: app.fetch,
  scheduled: (_event: ScheduledController, env: Env, ctx: ExecutionContext) => ctx.waitUntil(app.recurring(env)),
}
