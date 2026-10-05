# deploying to production

Production is two things: a static build of `web/` served from a cPanel
subdomain (`linkulino.leandroestrella.com`), published by GitHub Actions on
every push to `master`, and the backend in `server/`, a Cloudflare Worker with
a D1 database, deployed by hand with wrangler. The Google Sheet is kept in sync
with the backend's database in both directions.

## the two environments

Development and production use **separate spreadsheets**, each with its own
Worker, database and sync script. Nothing is shared: editing a trip locally can
never touch production data.

| | development | production |
| --- | --- | --- |
| spreadsheet | the testing sheet | the real, private sheet |
| worker and database | `linkulino-dev` | `linkulino` |
| worker settings | `server/wrangler.dev.local.jsonc` | `server/wrangler.local.jsonc` |
| sync secret, kept at hand | `server/.dev.vars` | `server/.prod.vars` |
| the sheet's sync script (clasp) | `apps-script/.clasp.json` | `apps-script/.clasp.prod.json` |
| `VITE_API_URL` | `web/.env.local` | GitHub repo secret |
| where the web app runs | `npm run dev`, localhost | the subdomain |
| recurring expenses | only when asked (`POST /recurring`) | on the first of each month |

Every file in that table is gitignored — they hold your own ids and secrets.
The worker settings files are copies of `server/wrangler.jsonc` with their
values filled in; the development one has its own worker name and database, and
no `triggers` entry.

## branch flow

Work happens on `develop`. Merging `develop` into `master` triggers the build
and FTP deploy of the web app:

```bash
git checkout master
git merge develop      # fast-forward while master stays behind develop
git push
git checkout develop   # go straight back; never commit on master
```

Watch the run with `gh run watch`, or in the repo's Actions tab.

## GitHub repo secrets

Set under Settings → Secrets and variables → Actions (or with
`gh secret set <NAME>`):

| secret | where it comes from |
| --- | --- |
| `VITE_API_URL` | the **production** Worker's address, without `/api/v1` |
| `VITE_GOOGLE_CLIENT_ID` | the Google OAuth 2.0 Web client id |
| `FTP_SERVER` | cPanel FTP hostname |
| `FTP_USERNAME` | FTP account scoped to the subdomain |
| `FTP_PASSWORD` | that account's password |

Neither `VITE_*` value is secret — the OAuth client id is public by design, and
every read and write needs a session of someone on the `Users` allowlist — but
they live in secrets so the repo stays environment-agnostic. The workflow fails
fast if either is empty, because an empty `VITE_API_URL` would silently build
the app on its **sample data** rather than erroring.

The workflow installs `server/` as well as `web/`: the web app reads the
backend's schema (`server/src/schema.ts`) for its row types.

## first-time production setup

Do this once, before the first deploy.

1. **The backend.** Follow "deploy your own" in
   [server/README.md](../server/README.md#deploy-your-own) with
   `wrangler.local.jsonc`: a D1 database named `linkulino`, the OAuth client id,
   `ALLOWED_ORIGINS` set to the subdomain's origin
   (`https://linkulino.leandroestrella.com`), your email in `ADMIN_EMAILS`, the
   production sheet's id, then `npm run migrate` and `npm run deploy`.

   > ✅ **Check:** `curl https://<the worker's address>/api/v1/health` answers
   > `{"ok":true,"app":"linkulino",…}`, and `/api/v1/expenses` answers 401.

2. **The sheet.** Lay it out as in [sheet-setup.md](sheet-setup.md) (or move
   one from the first layout — see
   [server/README.md](../server/README.md#moving-a-sheet-from-the-first-layout)),
   then connect it as in
   [server/README.md](../server/README.md#connecting-the-sheet): the service
   account, the two secrets, the sync script pushed with
   `cd apps-script && npm run push:prod`, its two script properties, and a
   first **Sync → Sync now**.

   > ✅ **Check:** the sync reports what it took from the sheet, no `Validation`
   > tab appears (or it is empty), and every row of `Spese` has an `ID`.

3. **The two repo secrets.**

   ```bash
   gh secret set VITE_API_URL           # the worker's address from step 1
   gh secret set VITE_GOOGLE_CLIENT_ID  # the OAuth client id
   gh secret list                       # all five should now be listed
   ```

4. **Authorize the production origin.** In Google Cloud Console → APIs &
   Services → Credentials → your OAuth 2.0 Web client → **Authorized JavaScript
   origins**, add:

   ```
   https://linkulino.leandroestrella.com
   ```

   Without this, the sign-in button silently fails to render on the live site.

5. **Merge to `master`** (see "branch flow") and sign in on the live site.

## spreadsheet backups (optional)

The database and the Google Sheet hold the same data, but neither keeps
earlier versions of it. A cPanel **cron job** runs a PHP script daily that exports it to
XLSX and stores it on cPanel, inside the docroot at `private/` but blocked
from ever being served over HTTP — a `.htaccess` deny-all rule inside that
folder, not its position, is what keeps it private — with rotation (last 14
daily + 6 monthly, configurable).

**Why a cron *pull* instead of Apps Script *pushing*, and why a service
account instead of the app's own OAuth sign-in (two design pivots, in
order):**

1. **First draft:** an Apps Script time trigger exported the sheet and
   POSTed it to a receiving PHP endpoint here. That hit a wall: cPanel's
   inbound security layer (a WAF — Imunify360 or similar) blocked every
   request from Google's servers with a 403, regardless of payload encoding
   or User-Agent — and this cPanel account's Security panel doesn't expose
   the kind of WAF dashboard that would let you add an exception for it.
   **Pulling instead of pushing sidesteps the whole problem**: this script
   runs *on* cPanel and reaches out to Google — nothing from Google reaches
   in, so there's no inbound request for a WAF to block. It also means no
   public HTTP endpoint at all anymore — simpler and a smaller attack
   surface than the push design had.
2. **Auth, once pulling was the plan:** the obvious option was reusing the
   app's existing OAuth flow (a refresh token, stored in the config file,
   exchanged for a fresh access token each run). The problem: an OAuth app
   left in Google Cloud's "Testing" publish status has refresh tokens that
   silently expire after 7 days — exactly the kind of thing that works
   perfectly in testing and then quietly stops a week later, with no
   obvious error until you notice backups stopped landing. A **Google
   service account** doesn't have that expiry — it's key-based auth, entirely
   separate from the OAuth consent-screen system — which makes it the right
   choice for something meant to run unattended indefinitely.

Also still true from the previous design, and still why `private/` is
structured the way it is: putting it *inside* the docroot rather than one or
two directories above it (the naively "more secure"-sounding option) avoids
depending on cPanel's specific directory nesting for this subdomain — a
`.htaccess` deny-all works the same regardless of what's above the docroot,
and is portable across hosts. The trade-off is that `private/` had to be
explicitly excluded from the FTP deploy's sync
(`.github/workflows/deployTocPanel.yml`'s `exclude` list) — since it now
lives inside the docroot the deploy manages, and isn't part of the
git-tracked build output, the next deploy would otherwise see it as removed
and delete it. That exclusion is already in place.

**a. Create a Google service account** — or reuse the one the backend syncs
the sheet with (see [server/README.md](../server/README.md#connecting-the-sheet)),
in which case skip to step c. In [Google Cloud
Console](https://console.cloud.google.com/), in the same project as this
app's OAuth client:
1. **APIs & Services → Library** → search **Google Drive API** → **Enable**
   (needed for a direct API export call).
2. **IAM & Admin → Service Accounts → Create Service Account.** Name it
   something like `linkulino-backup`. No project-level role needed — skip
   that step; it only needs access to one file, granted next.
3. Click into the new service account → **Keys** tab → **Add Key → Create
   new key → JSON** → download it. It contains a `client_email` and a
   `private_key` — both go into the config file below.

**b. Share the spreadsheet with it.** Open the spreadsheet (dev and/or
prod) → **Share** → paste the service account's `client_email` (looks like
`linkulino-backup@your-project.iam.gserviceaccount.com`) → **Viewer** is
enough → **Share**.

Get the spreadsheet's id from its URL:
`https://docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`.

**c.** On cPanel, via File Manager or SFTP, create `private/` **inside**
the subdomain's docroot (a sibling of `backup/`, which the deploy puts
there) and add a deny-all `.htaccess` to it:

```apache
# private/.htaccess — blocks every request under this folder, whatever the
# filename, regardless of Apache version.
<IfModule mod_authz_core.c>
  Require all denied
</IfModule>
<IfModule !mod_authz_core.c>
  Order deny,allow
  Deny from all
</IfModule>
```

Then, still inside `private/`, add the config file — the `private_key`
field from step a's downloaded JSON pastes in as-is (its `\n` sequences
stay literal backslash-n inside a PHP double-quoted string, which PHP reads
back as real newlines, same as the JSON did):

```php
<?php
// docroot/private/linkulino-backup-config.php
return [
  'spreadsheetId' => 'PASTE_THE_SPREADSHEET_ID_FROM_B',
  'serviceAccountEmail' => 'linkulino-backup@your-project.iam.gserviceaccount.com',
  'serviceAccountPrivateKey' => "-----BEGIN PRIVATE KEY-----\nPASTE...\n-----END PRIVATE KEY-----\n",
  'backupsDir' => '/full/path/to/docroot/private/backups', // created automatically if missing; use the absolute path cPanel shows for this subdomain's docroot
  'dailyKeep' => 14,
  'monthlyKeep' => 6,
];
```

Keep this file out of git, same as every other credential in this project —
it holds a real private key, not just a shared secret this time.

**d.** The cron script (`web/public/backup/run-backup.php`) ships with
every frontend deploy automatically — Vite copies `web/public/` as-is into
`web/dist/` — landing at `docroot/backup/run-backup.php`. It reads the
config file above via `dirname(__DIR__)`, i.e. the docroot itself
(`docroot/backup/run-backup.php` → `docroot/`), then into `private/`. It
refuses to run at all over HTTP (only from the command line), so there's
nothing to secret-check the way the old push design needed.

> ✅ **Check the config parses and the folder is locked down**, before
> wiring up cron:
> ```bash
> curl -s https://<subdomain>/private/linkulino-backup-config.php
> # should NOT return the file's contents — confirms .htaccess is blocking it
> curl -s https://<subdomain>/backup/run-backup.php
> # "This script only runs from cron, not the web." — confirms the CLI guard
> ```

**e. Add the cron job.** cPanel → **Cron Jobs** → **Add New Cron Job**:

| field | value |
| --- | --- |
| Minute | `0` |
| Hour | `3` |
| Day/Month/Weekday | `*` |
| Command | `php /full/path/to/docroot/backup/run-backup.php` |

cPanel's Cron Jobs page usually shows which exact `php` command your account
should use (sometimes a full versioned path like
`/usr/local/bin/ea-php82`) — use that if plain `php` doesn't resolve.

> ✅ **Check:** don't wait for 3am — SSH in (or use cPanel's Terminal) and
> run the command by hand once:
> ```bash
> php /full/path/to/docroot/backup/run-backup.php
> # Backup stored: backup-<timestamp>.xlsx
> ```
> Then confirm a real `backup-<timestamp>.xlsx` landed in
> `private/backups/`. cPanel also emails the cron command's output to the
> account's contact address on every run by default, which doubles as a
> free daily "did it work" notification — worth knowing about even if you
> end up filtering those emails.

## shipping backend changes

The workflow only deploys the web app. Backend changes go out separately — and
to *both* environments, since each is its own Worker:

```bash
cd server
npm test
npx wrangler deploy -c wrangler.dev.local.jsonc    # development
npm run deploy                                      # production
```

After changing `src/schema.ts`, write the next migration and apply it to both
databases **before** deploying the code that needs it (migrations only add, so
the code still running is not disturbed):

```bash
npm run migrations
npx wrangler d1 migrations apply linkulino-dev --remote -c wrangler.dev.local.jsonc
npm run migrate
```

A column added to the schema also needs its header added to the sheet's tab;
until then the sync lists it as missing on the `Validation` tab and leaves the
rest alone.

The sheet's sync script rarely changes (it is pomuku's, copied into
`apps-script/sync.js`). When it does:

```bash
cd apps-script
npm run push          # the testing sheet
npm run push:prod     # the production sheet
```

`npm run measure` in `server/` prints what requests cost the deployed Worker in
CPU time and database rows, from Cloudflare's own logs.
