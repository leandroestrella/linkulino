# Linkulino's backend

A [Cloudflare Worker](https://developers.cloudflare.com/workers/) with a D1
(SQLite) database, built on [pomuku](https://github.com/leandroestrella/pomuku)'s
server package. The app reads and writes only this database, so it answers in a
fraction of a second; the expenses spreadsheet stays a complete, editable copy,
kept in sync in both directions.

```
src/schema.ts          the data model: Spese, Viaggi and Categorie as tables, Users as the allowlist and the two participants
src/recurring.ts       which recurring household expenses are due a copy this month
src/worker.ts          the app: pomuku's routes plus Linkulino's own, and the monthly run
src/testing.ts         the backend as tests run it; the SPA's tests use it too
migrations/            the database's tables, generated from the schema
scripts/move-sheet.ts  moves a spreadsheet from the first layout (one tab per trip) to this one
scripts/measure.mjs    CPU time and rows per request, from the deployed worker's logs
```

## What it answers

Everything is under `/api/v1`, as JSON shaped `{ ok: true, … }` or
`{ ok: false, error }`, with real HTTP status codes. Nothing is public: apart
from the health check, signing in and the visit nudge, every route needs
someone from the `Users` tab.

| Route | Who | What |
| --- | --- | --- |
| `GET /health` | anyone | name and version; doesn't touch the database |
| `POST /session` | anyone | trades a Google ID token for a session token |
| `GET /expenses`, `GET /expenses/:id` | signed in | every expense: the household's and each trip's |
| `POST /expenses`, `PATCH /expenses/:id`, `DELETE /expenses/:id` | signed in | adds, changes, removes an expense |
| `GET` `POST /trips`, `PATCH /trips/:id` | signed in | the trips |
| `DELETE /trips/:id` | signed in | removes a trip **and every expense on it**, as one transaction |
| `GET` `POST /categories`, `PATCH` `DELETE /categories/:id` | signed in | the expense categories |
| `GET /participants` | signed in | the two people expenses are split between, Persona A first |
| `GET /runway`, `PATCH /runway` | a person | their own runway settings, never anyone else's |
| `GET /history` | signed in | the log of every write, newest first |
| `POST /recurring` | an admin | this month's recurring expenses, by hand |
| `POST /sync/visit` | anyone | looks at the sheet if the last look is a few minutes old |
| `POST /sync` | the sync secret | the sheet's "Sync now" |

A row comes back with its fields plus `id`, `rev` and `updatedAt`; an empty
field is `null`. An expense names its trip in `trip` (empty for a household
expense) and carries the two shares as `splitA` and `splitB`, in percent, for
the participants the `Users` tab calls Persona `A` and `B`. The rest (users,
access tokens, the sync's rules) is described in pomuku's server readme.

Only a participant's name and icon are ever sent to a browser, never an email.
A change to someone's runway settings is logged under the `users` table, whose
history entries only admins are shown.

**Recurring expenses.** On the first of each month (05:00 UTC, the `triggers`
entry in `wrangler.jsonc`) the Worker gives every household expense marked
recurring a fresh copy dated that day, unless one with the same description is
already there for the month. Running it twice adds nothing. The free plan allows
five scheduled triggers per account; without the entry, an admin can ask for the
month's copies with `POST /recurring`.

## Deploy your own

You need a Cloudflare account (the free plan is enough) and Node 22.

```bash
cd server && npm install
cp wrangler.jsonc wrangler.local.jsonc      # your instance's settings; gitignored
npx wrangler login
npx wrangler d1 create linkulino            # prints a database_id
```

Fill in `wrangler.local.jsonc`:

| Setting | Value |
| --- | --- |
| `database_id` | from `d1 create` |
| `GOOGLE_CLIENT_ID` | the Google OAuth client ID the SPA signs in with |
| `ALLOWED_ORIGINS` | the SPA's origins, comma-separated (e.g. `https://expenses.example.com,http://localhost:5173`) |
| `ADMIN_EMAILS` | your own email: an admin even with an empty `Users` tab |
| `SHEET_ID` | the spreadsheet's ID, from its address |

Then:

```bash
npm run migrate     # creates the database's tables
npm run deploy      # prints the worker's address
```

To keep development away from the real expenses, run a second instance against
a copy of the spreadsheet: another settings file (say `wrangler.dev.local.jsonc`,
also gitignored) with its own worker name, database and `SHEET_ID`, and without
the `triggers` entry, passed to wrangler with `-c`.

### Connecting the sheet

The spreadsheet's tabs and columns are described in
[docs/sheet-setup.md](../docs/sheet-setup.md).

1. **A service account.** In Google Cloud, a project with the **Google Sheets
   API** and the **Google Drive API** enabled (Drive is only asked when the sheet
   last changed), and a service account with a JSON key.
2. **Share the spreadsheet** with the service account's email, as an **editor**.
3. **The worker's secrets:**

   ```bash
   npx wrangler secret put GOOGLE_SERVICE_ACCOUNT -c wrangler.local.jsonc   # paste the key file's whole JSON
   npx wrangler secret put SYNC_SECRET -c wrangler.local.jsonc              # a long random text
   ```

4. **The sheet's script.** [`../apps-script/sync.js`](../apps-script/sync.js)
   adds a **Sync** menu to the spreadsheet. Push it to the sheet's bound Apps
   Script project (`cd ../apps-script && npm run push`, or paste the file in
   under Extensions → Apps Script), then set two script properties there
   (Project settings → Script properties): `SYNC_URL`
   (`https://<the worker's address>/api/v1/sync`) and `SYNC_SECRET` (the same
   text as the worker's). Reload the sheet; the first use asks for permission.
5. **Sync → Sync now.** With an existing sheet this is the first import: every
   row of `Spese`, `Viaggi`, `Categorie` and `Users` goes into the database, a
   hundred per request, and a row without an `ID` gets one, written back to the
   sheet.

From then on a save in the app reaches the sheet a few seconds later, and an edit
in the sheet reaches the app on the next "Sync now" or when someone next opens
the app. A value the app can't take (an amount that isn't a number, a share
above 100) is listed on a `Validation` tab until it's fixed.

### Moving a sheet from the first layout

Linkulino first kept one tab for the household and one per trip, each with its
own totals above the header. `scripts/move-sheet.ts` gathers them into the tabs
above:

```bash
node scripts/move-sheet.ts --sheet <id> --key <service-account.json> --save ../.temp/tabs   # lists what it would do
node scripts/move-sheet.ts --sheet <id> --key <service-account.json> --apply                 # does it
```

Without `--apply` nothing is written: it prints where every expense would go
and what deserves a look (a payer who isn't a participant, a row with no date,
shares that don't add up to 100). `--save` keeps a copy of every tab as it was.
Applying only adds: `Spese`, `Viaggi` and `Riepilogo`, an `ID` column on the
categories tab, `Role` and `Persona` on the users tab. The old tabs are left as
they were, for you to delete once you trust the new ones; it refuses to run
twice. Then run **Sync → Sync now** for the first import.

## What it costs on the free plan

Cloudflare's free plan allows 10 ms of CPU per request, and D1 caps the rows
read (5 million) and written (100,000) per day. Measured on the deployed Workers
from Cloudflare's own logs (`npm run measure`), with 227 expenses and 7 trips:

| Request | CPU | Rows read | Rows written |
| --- | --- | --- | --- |
| `GET /expenses` (56 KB) | 5 ms, 6 at most | one per expense | 0 |
| `GET /trips`, `/categories`, `/participants` | 2 ms | 3–10 | 0 |
| `GET /history` (100 entries) | 4 ms | 103 | 0 |
| a save, with the push to the sheet that follows it | 13 ms, 25 at most | about 12 | about 9 |
| a visit, the last look at the sheet recent | 0 ms | 0 | 0 |
| a pull of the `Spese` tab, nothing changed | 11–35 ms | two per expense | 1 |
| a pull of `Viaggi`, `Categorie` or `Users` | 5–10 ms | 7–22 | 1 |
| the first import, 100 expenses per request | not measured | | about 500 |

A save with its push, and a pull of the `Spese` tab, take more CPU than the plan
allows. Cloudflare let every request finish (it tolerates occasional overruns),
a pull only runs when the sheet has changed, and a household saves a handful of
expenses a day. A ledger several times this size, or a sheet edited all day,
should expect to need the paid plan.

## Commands

```bash
npm run dev          # the worker on localhost:8787, with a local database (run `npm run migrate:local` first)
npm test             # the whole backend on a local D1, against a spreadsheet kept in memory
npm run typecheck
npm run migrations   # after changing src/schema.ts: writes the next migration file
npm run migrate      # applies migrations to the deployed database
npm run deploy
npm run measure      # CPU time and rows per request, from the deployed worker's logs; see scripts/measure.mjs
```
