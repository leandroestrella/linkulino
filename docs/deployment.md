# deploying to production

Production is a static build of `web/` served from a cPanel subdomain
(`linkulino.leandroestrella.com`), published by GitHub Actions on every push to
`master`. The backend is a Google Apps Script web app bound to a spreadsheet.

## the two environments

Development and production use **separate spreadsheets**, each with its own
bound Apps Script project and its own `/exec` URL. Nothing is shared: editing a
trip locally can never touch production data.

| | development | production |
| --- | --- | --- |
| spreadsheet | the testing sheet | the real, private sheet |
| apps script | bound to the testing sheet | bound to the production sheet |
| clasp config | `apps-script/.clasp.json` | `apps-script/.clasp.prod.json` |
| `VITE_API_URL` | `web/.env.local` | GitHub repo secret |
| where it runs | `npm run dev`, localhost | the subdomain |

Both clasp config files are gitignored — they hold your own script ids.

## branch flow

Work happens on `develop`. Merging `develop` into `master` triggers the build
and FTP deploy:

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
| `VITE_API_URL` | the **production** Apps Script's `/exec` deployment URL |
| `VITE_GOOGLE_CLIENT_ID` | the Google OAuth 2.0 Web client id |
| `FTP_SERVER` | cPanel FTP hostname |
| `FTP_USERNAME` | FTP account scoped to the subdomain |
| `FTP_PASSWORD` | that account's password |

Neither `VITE_*` value is secret — the OAuth client id is public by design, and
every read and write is verified server-side against the `Users` allowlist —
but they live in secrets so the repo stays environment-agnostic. The workflow fails fast
if either is empty, because an empty `VITE_API_URL` would silently build the app
in **mock mode** (fake in-memory data) rather than erroring.

## first-time production backend setup

Do this once, before the first deploy. Each step ends with a way to check it
worked — don't move on until it does.

### 1. Create the production spreadsheet

Open the testing sheet → File → Make a copy. That carries the tab structure
over; then delete the copied data rows so production starts clean. It needs a
`Users` tab, a `Categorie` tab, and a household tab — see
[sheet-setup.md](sheet-setup.md). Keep it **private** (never link-share it; the
app reads it through the backend).

Fill in the `Users` tab with the real participants: `Email`, `Name`, `Icon`
columns, one row each. The first two named rows become Persona A and B, and
that list doubles as the write allowlist.

### 2. Create the bound Apps Script project

**2a.** With the *production* spreadsheet open, go to **Extensions → Apps
Script** in the sheet's menu bar. A new browser tab opens with an editor
containing a single `Code.gs` and an empty `myFunction`. This project is now
*bound* to that spreadsheet — that binding is what makes it production.

Leave this tab open, you'll need it through step 5.

**2b.** Get the script id: click the **⚙️ Project Settings** icon in the editor's
left sidebar. Under **IDs** you'll see **Script ID** with a *Copy* button.

**2c.** One-time account prerequisite: open
<https://script.google.com/home/usersettings> and turn the **Google Apps Script
API** toggle **on**. Without it `clasp push` fails with a "User has not enabled
the Apps Script API" error. (You may already have done this for the dev script.)

**2d.** Point clasp at the production project. Create
`apps-script/.clasp.prod.json` with the id you copied — it's gitignored, like
the dev `.clasp.json`:

```bash
cd apps-script
cat > .clasp.prod.json <<'JSON'
{
  "scriptId": "PASTE_THE_PRODUCTION_SCRIPT_ID_HERE",
  "rootDir": ".",
  "fileExtension": "gs"
}
JSON
```

Then open that file and replace `PASTE_THE_PRODUCTION_SCRIPT_ID_HERE` with the
real id (keep the quotes).

**2e.** Push the backend code (if it's been a while, `npm run login` first):

```bash
npm run push:prod
```

> ✅ **Check:** it prints `Pushed 4 files.` Reload the Apps Script editor tab —
> the placeholder `Code.gs` is replaced by `Code.gs`, `sheet.gs`, `auth.gs`.

### 3. Add the OAuth client id as a script property

Still in the Apps Script editor: **⚙️ Project Settings** → scroll to **Script
Properties** → **Add script property**.

| field | value |
| --- | --- |
| Property | `OAUTH_CLIENT_ID` |
| Value | the same client id used for `VITE_GOOGLE_CLIENT_ID` |

Click **Save script properties**.

The backend compares every sign-in token's audience against this value. Without
it, *every write is rejected* — reads would still work, so the app would look
fine until someone tried to add an expense.

### 4. Grant the OAuth scopes

Apps Script won't let the web app touch the sheet until you've approved its
scopes interactively, once.

In the editor, pick **`setupUsersTab`** from the function dropdown in the
toolbar (next to ▶ Run), then click **Run**. It's the right function for this:
it needs the spreadsheet scope, and it's safe to re-run — it creates the `Users`
tab only if missing and otherwise just reports what's there.

You'll be walked through:

1. **Review permissions** → choose your Google account.
2. A **"Google hasn't verified this app"** warning — expected, since this is
   your own unpublished script. Click **Advanced**, then
   **Go to \<project name\> (unsafe)**.
3. **Allow** the requested scopes.

> ✅ **Check:** the Execution log shows something like
> `Users tab ready with 2 user(s).` — no red error.

Functions whose names end in `_` are private to Apps Script and won't appear in
that dropdown; that's why `setupUsersTab` (no underscore) is the one to run.

### 5. Deploy as a web app

In the editor, top right: **Deploy → New deployment**. Then:

1. Click the **⚙️ gear** next to "Select type" and choose **Web app**.
2. Description: anything, e.g. `production`.
3. **Execute as: Me** — so the script runs as the sheet's owner.
4. **Who has access: Anyone** — the SPA calls it without a Google session;
   every read and write is still gated by token verification against the
   `Users` allowlist (`health` is the only public action).
5. **Deploy**.

Copy the **Web app URL** it shows (ends in `/exec`). **That is `VITE_API_URL`.**

> ✅ **Check:** it answers, from the production sheet:
>
> ```bash
> curl -sL "<the /exec url>?action=health"
> # {"ok":true,"service":"linkulino","version":"0.3.0"}
> curl -sL "<the /exec url>?action=participants"
> # {"ok":false,"error":"Not authorized: sign-in required"} — expected, no token given
> ```
>
> `-L` matters: Apps Script answers with a redirect first. Everything past
> `health` now requires a real Google ID token, so there's no anonymous
> curl check for it — verify participants/expenses/trips by signing in through
> the deployed SPA instead once `VITE_API_URL` is set (step 6).

### 6. Set the two remaining repo secrets

```bash
gh secret set VITE_API_URL           # paste the /exec url from step 5
gh secret set VITE_GOOGLE_CLIENT_ID  # paste the OAuth client id
gh secret list                       # all five should now be listed
```

### 7. Recurring expenses (optional)

Add a `Ricorrente` column (anywhere after column E) to the **household** tab
only — not trip tabs — then run `installMonthlyRecurringTrigger` once from the
editor, the same way as step 4.

### 8. Authorize the production origin

In Google Cloud Console → APIs & Services → Credentials → your OAuth 2.0 Web
client → **Authorized JavaScript origins**, add:

```
https://linkulino.leandroestrella.com
```

Without this, the sign-in button silently fails to render on the live site.

### 9. Spreadsheet backups (optional)

The Google Sheet is the only copy of your expense data — no snapshotting
otherwise. A cPanel **cron job** runs a PHP script daily that exports it to
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

**9a. Create a Google service account.** In [Google Cloud
Console](https://console.cloud.google.com/), in the same project as this
app's OAuth client:
1. **APIs & Services → Library** → search **Google Drive API** → **Enable**
   (needed for a direct API export call; Apps Script's sign-in flow never
   required this since it went through Apps Script's own execution grant).
2. **IAM & Admin → Service Accounts → Create Service Account.** Name it
   something like `linkulino-backup`. No project-level role needed — skip
   that step; it only needs access to one file, granted next.
3. Click into the new service account → **Keys** tab → **Add Key → Create
   new key → JSON** → download it. It contains a `client_email` and a
   `private_key` — both go into the config file below.

**9b. Share the spreadsheet with it.** Open the spreadsheet (dev and/or
prod) → **Share** → paste the service account's `client_email` (looks like
`linkulino-backup@your-project.iam.gserviceaccount.com`) → **Viewer** is
enough → **Share**.

Get the spreadsheet's id from its URL:
`https://docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`.

**9c.** On cPanel, via File Manager or SFTP, create `private/` **inside**
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
field from step 9a's downloaded JSON pastes in as-is (its `\n` sequences
stay literal backslash-n inside a PHP double-quoted string, which PHP reads
back as real newlines, same as the JSON did):

```php
<?php
// docroot/private/linkulino-backup-config.php
return [
  'spreadsheetId' => 'PASTE_THE_SPREADSHEET_ID_FROM_9B',
  'serviceAccountEmail' => 'linkulino-backup@your-project.iam.gserviceaccount.com',
  'serviceAccountPrivateKey' => "-----BEGIN PRIVATE KEY-----\nPASTE...\n-----END PRIVATE KEY-----\n",
  'backupsDir' => '/full/path/to/docroot/private/backups', // created automatically if missing; use the absolute path cPanel shows for this subdomain's docroot
  'dailyKeep' => 14,
  'monthlyKeep' => 6,
];
```

Keep this file out of git, same as every other credential in this project —
it holds a real private key, not just a shared secret this time.

**9d.** The cron script (`web/public/backup/run-backup.php`) ships with
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

**9e. Add the cron job.** cPanel → **Cron Jobs** → **Add New Cron Job**:

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

The workflow only deploys the frontend. Apps Script changes go out separately —
and to *both* environments, since each has its own copy of the code:

```bash
cd apps-script
npm run push          # dev script  → testing sheet
npm run push:prod     # prod script → production sheet
```

`clasp push` updates the code but **not** what the live `/exec` URL serves, if
that URL is pinned to a numbered version rather than `@HEAD`. Check with
`npm run deployments:prod`; if the deployment your `VITE_API_URL` points at
shows `@<number>`, re-deploy that same id so the URL picks up the new code:

```bash
npx clasp -P .clasp.prod.json deploy -i <deploymentId> -d "what changed"
```

That keeps the URL stable — no secret to update.
