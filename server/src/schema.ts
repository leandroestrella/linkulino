/**
 * Linkulino's data model on pomuku: every expense on the `Spese` tab (household
 * ones and each trip's, told apart by the `Viaggio` column), the trips on
 * `Viaggi`, the categories on `Categorie`, and the `Users` tab as both the
 * allowlist and the two participants.
 *
 * Everything else is derived from this file: the database's tables, the REST
 * routes, the history log's fields, and how each sheet column is read and
 * written. Columns are matched by HEADER NAME, never by position — the header
 * text here is the contract with the spreadsheet (see docs/sheet-setup.md).
 *
 * Nothing here touches a database or a server, so the SPA imports the same file
 * for its row types.
 */
import { boolean, date, defineSchema, number, randomId, slugOf, table, text, type RowOf } from '@lndrstrll/pomuku-server/schema'

/**
 * The two people an expense is split between. Which of them is `A` and which
 * `B` is said by the `Persona` column of the `Users` tab, so the `Quota % A`
 * and `Quota % B` columns never depend on the order of that tab's rows.
 */
export const PERSONAS = ['A', 'B'] as const
export type Persona = (typeof PERSONAS)[number]

const percent = (share: number) => (share < 0 || share > 100 ? 'must be between 0 and 100' : null)

// Letters a slug would otherwise drop: they have no accent to strip.
const PLAIN: Record<string, string> = { ø: 'o', æ: 'ae', œ: 'oe', ß: 'ss', đ: 'd', ł: 'l' }

/**
 * A readable ID from a name (`Cala Gonone` → `cala-gonone`), minted once: a
 * trip or a category keeps it when renamed, so nothing pointing at it breaks.
 * A name with no letters or digits (only an emoji, say) gets a random one.
 */
export function nameId(name: string): string {
  return slugOf(String(name ?? '').toLowerCase().replace(/[øæœßđł]/g, (letter) => PLAIN[letter]!)) || randomId()
}

const expenses = table({
  tab: 'Spese',
  columns: {
    date: date('Data'),
    description: text('Descrizione'),
    // A category's name, as on the `Categorie` tab; free text, so an expense
    // typed in the sheet can name one the app doesn't list yet.
    category: text('Categoria'),
    // The name of the participant who paid.
    payer: text('Pagato da'),
    amount: number('Importo (€)'),
    // Each participant's share of the expense, in percent.
    splitA: number('Quota % A', { check: percent }),
    splitB: number('Quota % B', { check: percent }),
    // Repeats every month (rent, internet); household expenses only.
    recurring: boolean('Ricorrente'),
    notes: text('Note'),
    // The ID of the trip this was spent on; empty for a household expense.
    trip: text('Viaggio'),
  },
  label: (row) => row.description ?? '',
})

const trips = table({
  tab: 'Viaggi',
  columns: {
    name: text('Nome', { required: true }),
    emoji: text('Emoji'),
    startDate: date('Inizio'),
    endDate: date('Fine'),
  },
  id: ({ row }) => nameId(row.name),
  label: (row) => [row.emoji, row.name].filter(Boolean).join(' '),
})

const categories = table({
  tab: 'Categorie',
  columns: {
    name: text('Category', { required: true }),
    icon: text('Emoji'),
    // An essential ("four walls": groceries, rent, utilities, transport…).
    overhead: boolean('Overhead'),
  },
  id: ({ row }) => nameId(row.name),
  label: (row) => [row.icon, row.name].filter(Boolean).join(' '),
})

export const schema = defineSchema({
  // Every table is for people on the `Users` tab only: nothing is public.
  tables: { expenses, trips, categories },
  userColumns: {
    // An emoji or an image address, shown next to the person's name.
    icon: text('Icon'),
    persona: text('Persona', { oneOf: PERSONAS }),
    // A person's own runway settings: theirs to read and change, nobody else's.
    enableRunway: boolean('Enable Runway'),
    savings: number('Savings'),
  },
})

/** Rows as the API returns them. Empty fields are `null`. */
export type ExpenseRow = RowOf<typeof expenses>
export type TripRow = RowOf<typeof trips>
export type CategoryRow = RowOf<typeof categories>
