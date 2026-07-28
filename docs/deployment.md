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
every write is verified server-side against the `Users` allowlist — but they
live in secrets so the repo stays environment-agnostic. The workflow fails fast
if either is empty, because an empty `VITE_API_URL` would silently build the app
in **mock mode** (fake in-memory data) rather than erroring.

## first-time production backend setup

Do this once, before the first deploy.

1. **Create the production spreadsheet.** Easiest is
   File → Make a copy of the testing sheet, which carries the tab structure
   over; then delete the copied rows so you start clean. It needs a `Users` tab,
   a `Categorie` tab, and a household tab — see
   [sheet-setup.md](sheet-setup.md). Keep it **private**. Fill in the `Users`
   tab with the real participants (the first two named rows become Persona A and
   B, and double as the write allowlist).

2. **Create the bound Apps Script.** From the production sheet:
   Extensions → Apps Script. Then copy its script id from
   Project Settings → IDs, and point clasp at it:

   ```bash
   cd apps-script
   cat > .clasp.prod.json <<'JSON'
   {
     "scriptId": "<the production script id>",
     "rootDir": ".",
     "fileExtension": "gs"
   }
   JSON
   npm run push:prod
   ```

3. **Add the OAuth client id** as a script property on the production project:
   Project Settings → Script Properties → `OAUTH_CLIENT_ID` = the same client id
   used for `VITE_GOOGLE_CLIENT_ID`. Without it the backend can't verify
   sign-in tokens and every write is rejected.

4. **Grant the scopes.** Run any function once from the Apps Script editor and
   click through the consent screen (spreadsheet + external requests +
   triggers).

5. **Deploy it as a web app:** Deploy → New deployment → Web app, with
   *execute as: me* and *who has access: anyone*. Copy the `/exec` URL — that is
   `VITE_API_URL`.

6. **Recurring expenses (optional):** add a `Ricorrente` column to the household
   tab, then run `installMonthlyRecurringTrigger` once from the editor.

7. **Authorize the origin:** add `https://linkulino.leandroestrella.com` to the
   OAuth client's Authorized JavaScript origins.

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
