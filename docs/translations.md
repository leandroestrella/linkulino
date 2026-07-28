# translations

The UI ships in English, Italiano and Español. Everything user-facing goes
through [react-i18next](https://react.i18next.com/) — there are no hardcoded
strings in components, so translating the app means editing JSON, not JSX.

## where things live

| path | what it is |
| --- | --- |
| `web/src/i18n/index.ts` | i18next setup: the `LANGUAGES` list, detection order, storage key |
| `web/src/i18n/locales/en.json` | the reference locale — add new keys here first |
| `web/src/i18n/locales/it.json`, `es.json` | the translations |
| `web/src/i18n/LanguageSwitcher.tsx` | the flag dropdown in the header |

Language is resolved in this order (see `detection` in `index.ts`):

1. `?lng=es` in the URL — handy for sharing a link in a specific language, and
   for testing without changing your own setting
2. the saved choice in `localStorage` under `linkulino.lang`
3. the browser's own language

`load: 'languageOnly'` means `it-IT` and `it-CH` both resolve to `it`.
Anything unrecognised falls back to `en`.

## changing existing wording

Edit the value in each locale file. Keys are nested one level deep and grouped
by area — `app`, `nav`, `auth`, `home`, `form`, `trips`, `overview`, `filters`
— and referenced in components as `t('trips.edit')`.

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

Note that `interpolation.escapeValue` is `false` in `index.ts`. That's safe
here because interpolated values only ever land in React text nodes (which
escape on their own), but it does mean you must not feed a translated string
into `dangerouslySetInnerHTML`.

## adding a language

1. Copy `en.json` to `web/src/i18n/locales/<code>.json` and translate every
   value.
2. Register it in `web/src/i18n/index.ts` — import the file, add it to
   `resources`, and add an entry to `LANGUAGES` with its `code`, `label` and
   `flag` emoji. The switcher and `supportedLngs` both read from that list, so
   there's nothing else to wire up.

```ts
import fr from './locales/fr.json'

export const LANGUAGES = [
  // …
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
] as const

resources: {
  // …
  fr: { translation: fr },
}
```

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
row-1 type markers (`casa` / `viaggio`), which are configurable but live in
`apps-script/sheet.js`, not in the locale files — see
[sheet-setup.md](sheet-setup.md#tab-discovery).

The About page renders `README.md` verbatim, so it's English regardless of the
selected language.
