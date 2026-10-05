# translations

The UI ships in English, Italiano and Español. Everything user-facing goes
through [react-i18next](https://react.i18next.com/) — there are no hardcoded
strings in components, so translating the app means editing JSON, not JSX.

## where things live

| path | what it is |
| --- | --- |
| `web/src/i18n/index.ts` | hands the app's strings to pomuku's i18next setup |
| `web/src/i18n/locales/en.json` | the reference locale — add new keys here first |
| `web/src/i18n/locales/it.json`, `es.json` | the translations |
| [`@lndrstrll/pomuku-i18n`](https://github.com/leandroestrella/pomuku/tree/master/packages/i18n) | the setup itself: the list of languages, the detection order, and the strings every pomuku app shares (`common.*`, `auth.*`, `data.*`, `nav.*`) |
| `@lndrstrll/pomuku-ui` | the flag dropdown in the header |

The app's strings are laid over the shared ones, key by key: giving a shared
key in the app's locale files rewords it (`common.loading` is one the app
rewords).

Language is resolved in this order:

1. `?lng=es` in the URL — handy for sharing a link in a specific language, and
   for testing without changing your own setting
2. the saved choice in `localStorage` under `linkulino.lang`
3. the browser's own language

`it-IT` and `it-CH` both resolve to `it`. Anything unrecognised falls back to
`en`.

For a signed-in participant, that choice is also saved on their account — the
`Users` tab's `Language` column (see [sheet-setup.md](sheet-setup.md#users)) —
applied on sign-in (so it follows them to a new device) and updated whenever
they switch languages from the flag menu. It never overrides an explicit
`?lng=` link, and there's no UI beyond the flag dropdown.

## changing existing wording

Edit the value in each locale file. Keys are nested one level deep and grouped
by area — `app`, `nav`, `auth`, `demo`, `home`, `form`, `trips`, `overview`,
`history`, `filters`, `settings` — and referenced in components as `t('trips.edit')`.

The UI is deliberately lowercase throughout; keep translations lowercase too
unless the language requires otherwise (German nouns, proper names).

## adding a key

1. Add it to `en.json` under the right section.
2. Add the same key to `it.json` and `es.json`. Don't skip this — a missing key
   silently falls back to the English string, which is easy to miss in review.
3. Use it as `t('section.key')`.

### plurals

i18next handles plurals via `_one` / `_other` suffixes, and the component
passes a `count`:

```jsonc
// en.json
"tripCount_one": "{{count}} trip",
"tripCount_other": "{{count}} trips"
```

```tsx
t('overview.tripCount', { count: summary.tripCount })
```

Pick the suffixes the target language actually needs — i18next's plural rules
are per-language (Italian and Spanish use the same `_one`/`_other` pair as
English; other languages may need `_few`, `_many`, and so on).

Note that `interpolation.escapeValue` is `false` in pomuku's setup. That's safe
here because interpolated values only ever land in React text nodes (which
escape on their own), but it does mean you must not feed a translated string
into `dangerouslySetInnerHTML`.

## adding a language

The list of languages is pomuku's, shared by every app built on it, along with
the strings those apps have in common. So a new language starts there:

1. In pomuku's `packages/i18n`: add the language to `LANGUAGES` (its `code`,
   `label` and `flag` emoji) and translate the shared strings
   (`src/locales/<code>.ts`); its tests check that every language has the same
   keys. Publish it and update `@lndrstrll/pomuku-i18n` here.
2. Copy `en.json` to `web/src/i18n/locales/<code>.json`, translate every value,
   and hand it over in `web/src/i18n/index.ts`:

```ts
import fr from './locales/fr.json'

export const i18n = createI18n({ app: 'linkulino', resources: { en, it, es, fr } })
```

3. Translate the README too — copy `README.md` to `README.<code>.md` at the
   repo root, translate it, and add a language link for it at the top of
   every `README*.md` file (including the English one). Then add it to
   `README_BY_LANGUAGE` in `web/src/pages/AboutPage.tsx` (import it with
   `?raw`, same as the existing ones) — that map is what the About page uses
   to pick the right file for the current language, falling back to English
   for any language without one.

## checking the locales agree

There's no automated check, so before shipping a translation change confirm
every locale has exactly the same key set:

```bash
cd web && node -e "
const flat = o => Object.entries(o).flatMap(([k, v]) =>
  typeof v === 'object' ? Object.keys(v).map(x => k + '.' + x) : [k])
const en = flat(require('./src/i18n/locales/en.json'))
for (const code of ['it', 'es']) {
  const other = flat(require('./src/i18n/locales/' + code + '.json'))
  console.log(code,
    '| missing:', en.filter(k => !other.includes(k)),
    '| extra:', other.filter(k => !en.includes(k)))
}"
```

Both lists should be empty for every locale.

## what is *not* translated

Data from the sheet — category names, participant names, expense descriptions,
trip names — is passed through verbatim. If you want those in a given
language, write them that way in the sheet. The same goes for the sheet's own
tab names and headers, which are the backend's contract with the sheet (see
[sheet-setup.md](sheet-setup.md)), not text of the interface.

Everything else — the app UI and the About page's rendered README — is
translated (see below for the README).
