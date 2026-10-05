# sheet setup

Linkulino keeps its data in a database of its own, and a Google Sheet as a
complete, editable copy of it: a save in the app reaches the sheet a few
seconds later, and an edit in the sheet reaches the app on the next sync. This
doc is the layout the backend (`server/`) expects — copy it when setting up
your own instance. How the sheet is connected is in
[server/README.md](../server/README.md).

## tabs

| tab | purpose |
| --- | --- |
| `Users` | the allowlist **and** the two participants — see below |
| `Categorie` | expense categories and their emoji |
| `Spese` | every expense: the household's and each trip's, one per row |
| `Viaggi` | the trips, one per row |
| `Riepilogo` | formulas only: totals and balance per trip, and one trip's expenses at a time. Never read by the app |
| `Validation` | written by the sync: values it couldn't take, until they're fixed |

Each synced tab has its **header on row 1** and one row per thing. Columns are
found by **header text**, so they can be reordered and others added freely
(formulas, notes of your own); renaming a header breaks its column until the
schema (`server/src/schema.ts`) says the new name. Any other tab in the file is
left alone.

Every row has an `ID`, which is how a row in the sheet and a row in the app are
known to be the same one. **Leave `ID` empty on a row you type**: the next sync
gives it one. Never change one that's there.

## Users

One row per person:

| Email | Name | Icon | Enable Runway | Savings | Language | Role | Persona |
| --- | --- | --- | --- | --- | --- | --- | --- |
| momra@example.com | momra | 🐠 | `TRUE` | 12000 | en | admin | A |
| mara@example.com | mara | ⚽ | | | it | | B |

This tab does double duty:

- **allowlist** — only these emails can sign in; nothing in the app is public.
  `Email` is this tab's `ID`.
- **participants** — the two people expenses are split between are the ones
  with `A` and `B` in **Persona**. That is what ties a person to the
  `Quota % A` and `Quota % B` columns of `Spese`, whatever order the rows are
  in. Don't swap the two once there are expenses: the shares wouldn't follow.

**Icon** is an emoji or the address of an image, shown next to the person's
name throughout the app.

**Role** takes `admin` for someone who may manage users and access tokens;
empty is a member. The emails in the backend's `ADMIN_EMAILS` setting are
admins whatever this says.

**Enable Runway** (`TRUE`/`FALSE`) and **Savings** (a number) back the
homepage's personal runway estimate (an approximate date a person's savings
would run out at their average monthly spend). Each is that person's own value,
changed only by themselves from the app's Settings page and never shown to the
other participant in the app.

**Language** is the language the app opens in for that person (`en`, `it` or
`es`), so it follows them across devices — see [translations](translations.md).
Empty means the browser's own.

## Categorie

One row per expense category:

| ID | Category | Emoji | Overhead |
| --- | --- | --- | --- |
| groceries | Groceries | 🛒 | `TRUE` |
| rent | Rent | 🏠 | `TRUE` |
| dining-out | Dining out | 🍽️ | |

This is the category picker in the app; people on the `Users` tab can also add
a category from the app.

**Overhead** (`TRUE`/`FALSE`) flags a category as an essential — the "four
walls" budgeting term (groceries, rent, utilities, transport…): what it costs
to keep going before any discretionary spending. The Overview page shows a
monthly breakdown of overhead vs. everything else. Empty reads as `FALSE`.

## Spese

One row per expense:

| ID | Data | Descrizione | Categoria | Pagato da | Importo (€) | Quota % A | Quota % B | Ricorrente | Note | Viaggio |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| x7k2m9qd | 03/10/2026 | lidl | Groceries | momra | 42.10 | 50 | 50 | `FALSE` | | |
| b4n8p2wz | 14/08/2026 | fuel | Transport | mara | 61.00 | 50 | 50 | | | pian-della-mussa |

| column | contents |
| --- | --- |
| Data | the day it was spent: a date cell, or text written `YYYY-MM-DD` |
| Descrizione | free text |
| Categoria | a category's name; free text, so it can name one `Categorie` doesn't list |
| Pagato da | the name of the participant who paid |
| Importo (€) | the expense total |
| Quota % A, Quota % B | each participant's share, in percent (see `Persona` on the `Users` tab) |
| Ricorrente | `TRUE` for a household expense that repeats every month (rent, internet) |
| Note | free text |
| Viaggio | the `ID` of the trip it was spent on, from the `Viaggi` tab; **empty for a household expense** |

The columns to the right of these are **formulas**, never written by the app:
each participant's share in euros, and the balance the expense leaves (positive
when B owes A). Each formula sits once, in its column's header cell, and fills
the column below it — so a row the app adds gets its values by itself, and a
row removed takes nothing with it. Don't type in those columns.

To add an expense by hand, type a row at the bottom, leave `ID` empty, and pick
the trip in `Viaggio` (or leave it empty for the household). To remove one,
delete its row. Sort or filter the tab however you like: rows are known by
their `ID`, not their position.

## Viaggi

One row per trip:

| ID | Nome | Emoji | Inizio | Fine |
| --- | --- | --- | --- | --- |
| pian-della-mussa | pian della mussa | ⛰️ | 14/08/2026 | 16/08/2026 |

A trip's `ID` is made from its name the first time, and kept when the trip is
renamed, so its expenses stay with it. A trip's status (current / upcoming /
past) is worked out in the app from `Inizio` and `Fine` against today.

Deleting a trip **in the app** removes every expense on it too. Deleting a
trip's row here removes only the trip: its expenses stay on `Spese`, naming a
trip that no longer exists, and don't show in the app until their `Viaggio` is
fixed or emptied.

## Riepilogo

Nothing here is typed and the app never reads it; it is the sheet's own view of
`Spese`:

- who Persona A and B are, read from the `Users` tab
- one line for the household and one per trip: total spent and current balance
- **one trip at a time**: pick a trip in the cell next to `Viaggio (vuoto =
  casa)` (leave it empty for the household) and its total, balance and every
  expense list below

Change it or add to it freely; if it breaks, delete the tab — nothing depends
on it.

## recurring expenses

Household expenses with `Ricorrente` set are recreated once a month by the
backend: on the first of the month, each description marked recurring gets a
fresh copy of its latest occurrence, dated that day — unless that description
already has an entry in the month. Running it twice adds nothing. It doesn't
apply to trips, which are time-boxed. See [server/README.md](../server/README.md)
for the schedule.

## months and years

There's no per-month tab rotation — `Spese` is one continuous ledger. The home
page's default view is the household expenses of the last 90 days, filtered in
the app (see `filtersFromSearchParams` in `web/src/lib/filters.ts`); any other
range is one click away in the timeframe dropdown. The Overview page aggregates
across every month and year in the ledger.

## syncing

The spreadsheet gets a **Sync** menu from its own small script
(`apps-script/sync.js`):

- **Sync now** — sends what the app has waiting and takes what changed here.
  Use it after editing the sheet; opening the app does the same within a few
  minutes.
- **Sync now, removing rows deleted here** — a tab that lost more than half its
  rows at once is kept as it was in the app, in case it was a slip. This is how
  to say it was meant.
- **Sync by itself after edits** — syncs about a minute after an edit, without
  being asked.

When the same cell was changed in both places since the last sync, the app's
value wins and the sheet's is kept in the app's activity log, so nothing is
lost silently.

## coming from the first layout

Linkulino first kept one tab for the household and one per trip, each with its
own totals above the header and expenses known by their row number. A script
gathers such a sheet into the tabs above, leaving the old ones untouched: see
"moving a sheet from the first layout" in [server/README.md](../server/README.md).
