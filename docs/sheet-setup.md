# sheet setup

Linkulino reads and writes a Google Sheet with a small, rigid layout so the
backend can find things by position rather than parsing free-form data. This
doc is the schema the backend (`apps-script/`) expects — copy it when setting
up your own instance.

## tabs

| tab | purpose |
| --- | --- |
| `Impostazioni` (Settings) | the two participants' names, used everywhere else |
| one **household** tab (e.g. `casa`) | recurring shared-living expenses (rent, bills, groceries…) |
| `Viaggio - Modello` (Trip - Template) | an empty template — never edited directly |
| one **trip** tab per vacation | duplicated from the template, one per trip |
| `wise raw *` (optional) | raw exported transaction data kept for manual reconciliation; the backend ignores any tab whose name starts with `wise raw` |

Trip tabs are created by right-clicking the template tab → Duplicate → rename
(e.g. `Lisbon 2026`). The backend discovers them automatically — see below —
so there's no registry to update.

### tab discovery

The backend does **not** match tabs by name (you can call your household tab
anything). Instead, cell **A1** of every non-settings, non-template, non-`wise
raw` tab is a type marker:

```
A1 = "casa"      → this tab is the recurring household-expenses tab
A1 = "viaggio"   → this tab is a vacation's expense tab
```

(the marker words themselves are just plain text compared case-insensitively —
`HOUSEHOLD_MARKER`/`TRIP_MARKER` in `apps-script/sheet.js` — translate them if
you'd rather use `household`/`trip` or anything else, as long as row 1 matches)

Row 1 of an expense tab looks like:

| A | B | C | D | E |
| --- | --- | --- | --- | --- |
| `casa` or `viaggio` | display name | start date | emoji | end date |

(start/end date and emoji are only meaningful for trips; the household tab's
B–E cells are informational only.)

## Impostazioni (Settings)

Two label/value rows, searched by label (not fixed cell coordinates, so you
can add notes above/below without breaking anything):

| A | B |
| --- | --- |
| `Nome Persona A` | *Participant A's name* |
| `Nome Persona B` | *Participant B's name* |

Both names propagate everywhere else (column headers, dashboard labels).

## expense tab layout

Below the row-1 type marker:

| row | content |
| --- | --- |
| 2 | `Totale speso` (Total spent) \| `€ <sum>` |
| 3 | `Saldo attuale` (Current balance) \| a plain-language summary of who owes whom |
| 4 | column headers (see below) |
| 5+ | one row per expense |

Column headers (fixed positions — the backend reads by column index, not by
header text, since the quota columns embed each participant's name and so
differ per instance):

| col | header | contents |
| --- | --- | --- |
| A | Data (Date) | `DD/MM/YYYY` |
| B | Descrizione (Description) | free text |
| C | Categoria (Category) | free text, offered as a dropdown (data validation) but editable — no fixed enum |
| D | Pagato da (Paid by) | one of the two participant names |
| E | Importo € (Amount) | the expense total |
| F | Quota % \<Participant A\> | this expense's split %, defaults to 50 |
| G | Quota % \<Participant B\> | defaults to 50 |
| H | Quota \<Participant A\> (€) | **formula**, `= E * F / 100` |
| I | Quota \<Participant B\> (€) | **formula**, `= E * G / 100` |
| J | Saldo (Balance) | **formula** — positive means Participant A is owed |
| K | Ricorrente (Recurring) | **household tab only** — `TRUE`/`FALSE`, flags an expense (e.g. rent, internet) that repeats every month. Added by the app, not part of the original template; the backend never writes column K on a trip tab, since recurring doesn't apply there |

A tab is pre-filled with ~60 blank rows (F/G already defaulted to 50/50) so
the H/I/J formulas are already in place below every future entry. **Adding an
expense means filling in A–G (plus K on the household tab) on the first
fully-blank row (by A–E), not appending a new row** — appending past the
pre-filled range would leave a row with no formulas. If a tab ever runs out of
blank rows, extend the formulas down manually before adding more.

The last row (`TOTALE`) sums columns E, H, I, J and is also a formula — leave
it alone.

## trips

A trip tab is created by duplicating `Viaggio - Modello` and is named
`"{emoji} {name}"` (e.g. `🐚 cala gonone`) — the app does this for you (the
vacations tab in the SPA), or you can still do it by hand (right-click the
template → Duplicate → rename, then fill in row 1). A trip's status (current /
upcoming / past) is derived client-side from row 1's start/end dates against
today — nothing to configure.

## recurring expenses

Household expenses flagged recurring (column K, household tab only — not
trips) are recreated automatically once a month: `runMonthlyRecurringExpenses`
(in `apps-script/Code.js`) finds, per description, the most recent recurring
occurrence and — unless that description already has an entry dated this
month — writes a fresh copy dated today. It's idempotent, so running it twice
in the same month is harmless.
Recurring only applies to the household tab; trips are time-boxed, so it
doesn't make sense there.

This needs a one-time setup step: run `installMonthlyRecurringTrigger` once
from the Apps Script editor (Run menu). It installs a time-based trigger that
fires on the 1st of each month (~6am, in the script's timezone). Re-running it
is safe — it replaces any existing trigger for the same function rather than
stacking duplicates.

## why this shape

The sheet already encodes almost the entire app: participant names, the
split, and the running balance are all formulas the human template author
designed by hand. The backend's job is mostly *finding the right cell*, not
computing anything — quota/saldo math stays in the sheet, where it's visible
and editable without redeploying code.
