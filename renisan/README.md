# ڕێنیسان · Renisan

University eligibility checker and scholarship directory for Grade-12 students in Iraq and the Kurdistan Region.
Works in Sorani Kurdish, Arabic and Kurmanji, installs as an app (PWA), and works offline after the first visit.

## Develop

Requires **Node 22.18+** (tests import the TypeScript sources directly).

```bash
npm install
npm run dev        # local dev server
npm test           # data + logic tests
npm run build      # tests → type-check → production build into dist/
npm run preview    # serve the production build locally
```

## Deploy

`dist/` is a fully static site — any static host works.

| Host | What to do |
|---|---|
| **Netlify** | Connect the repo. `netlify.toml` sets the build; `public/_headers` adds security headers. |
| **Cloudflare Pages** | Build command `npm run build`, output `dist`. `_headers` is applied automatically. |
| **Vercel** | Import the repo. `vercel.json` sets build output and headers. |
| **GitHub Pages** (project site) | Build with `BASE_PATH=/<repo-name>/ npm run build` and publish `dist/`. |

Must be served over **HTTPS** for offline/install support (all hosts above do this).

## Updating data

All content lives in `public/data/`:

- `cutoffs-federal-<year>.json` — Federal (MOHESR) central admission minimums
- `cutoffs-krg-<year>.json` — KRG (Zankoline) minimum composite scores
- `scholarships.json` — scholarship listings

After editing, run `npm test`. It checks for duplicate ids, out-of-range scores, bad dates/URLs,
and **place names without Kurdish translations** — if it reports one, add it to `src/lib/places.ts`.

Notes:
- Scholarship `deadline` must be `YYYY-MM-DD`. Listings whose deadline has passed are shown as
  *closed* automatically — update `deadline`, `status` and `last_verified` each cycle.
- Study-type and admission-channel filters are generated from the data, so a new channel
  (e.g. `martyrs`) appears in the UI as soon as rows with it exist.
- If you add a new year file, update the filenames in `src/lib/data-loader.ts` and the year
  mentioned in `disclaimerText` in `src/lib/translations/*.ts`.

Each deploy ships a new service worker; returning visitors get the new data automatically.

## Project layout

```
src/components/   UI (Preact)
src/lib/          data loading, filtering, i18n, status/deadline logic, URL share state, place names
src/lib/translations/  ar / ckb / kmr strings (all must have the same keys — enforced by tests)
public/data/      datasets
tests/verify.js   test suite
```
