# ڕێنیسان · Renisan

University eligibility checker and scholarship directory for Grade-12 students in Iraq and the Kurdistan Region.
Works in Sorani Kurdish, Arabic, Kurmanji and English, installs as an app (PWA), works offline after the first visit,
and has dark / light / system themes.

**Data (as of 2026-11-17)**
- Federal: the complete official MOHESR *الحدود الدنيا للقبول المركزي* lists for **2026-2027** — 1,263 general-channel
  programmes plus 438 on the distinguished-schools channel (morning study) with English + Sorani names, governorate,
  single-sex and institute tags.
- Federal history: the official **2025-2026** (1,222 + 411 distinguished) and **2024-2025** (1,111) lists, used to show
  each programme's year-over-year trend on its card.
- Federal rules: the ministry's **2026-2027** minimum averages to *apply* for government evening study and private
  colleges per field (`rules-federal-2026.json`), shown as an "other admission routes" panel under the checker.
- KRG: Zankoline **2024-2025** reported minimums — **96 programmes** across 16 KRG public universities and polytechnic institutes (government, parallel and evening study; colleges and technical institutes).
- Scholarships: 16 listings, each verified against the provider's site with estimated next-cycle deadlines, personal GPA/age matching, and offline `.ics` calendar reminders.

## Develop

Requires **Node 22.18+** (tests import the TypeScript sources directly).

```bash
npm install
npm run dev        # local dev server
npm test           # data + logic tests
npm run build      # tests → type-check → production build → dist/ smoke test
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

### Build settings (set as environment variables on your host)

| Variable | Example | Purpose |
|---|---|---|
| `SITE_URL` | `https://renisan.app` | **Set before launch.** Full public address — makes WhatsApp/Telegram/Facebook link previews show the preview image. |
| `VITE_CONTACT_URL` | `mailto:you@example.com` or a Google Form / Instagram link | Shows a "found a data error? tell us" link in the footer. Hidden when unset. |
| `BASE_PATH` | `/renisan/` | Only when hosting under a sub-folder (GitHub Pages project sites). |

Useful links: `/?tab=scholarships` opens the scholarship directory directly; checker links
(e.g. `/?sys=krg&score=92`) reopen with the same inputs.

Must be served over **HTTPS** for offline/install support (all hosts above do this).

## Updating data

All content lives in `public/data/`, and **`meta.json` says which files the app loads and how to label them**:

- `meta.json` — dataset file names, academic-year labels (`year_label`, `year_label_ar`), score ceilings
  (`max_score`), source links and notes. Every year label shown in the UI comes from here.
  `federal.form` holds the central form's rules (choices per stream, minimum institutes / polytechnic colleges)
  that the wishlist checks against — update it each September from the ministry's student guide.
- `cutoffs-federal-<year>.json` — Federal (MOHESR) central admission minimums, general channel
- `cutoffs-federal-<year>-distinguished.json` — the same year's distinguished-schools channel
  (listed under `meta.json → federal.extra_files` and merged into the checker; the channel filter switches between them)
- Prior years listed under `federal.history` are loaded after the main data and power the trend badges
  (programmes are matched across years by name, see `src/lib/history.ts`)
- `rules-federal-<year>.json` — minimum averages to apply for evening / private routes (`federal.rules`)
- `cutoffs-krg-<year>.json` — KRG (Zankoline) minimum composite scores
- `scholarships.json` — scholarship listings

After editing, run `npm test`. It checks that `meta.json` points at real files, duplicate ids, out-of-range
scores, `min_average == min_score / 7`, bad dates/URLs, translation placeholders, and **place names without
Kurdish translations** — if it reports one, add it to `src/lib/places.ts`.

### New Federal year (every October)

1. Download the new *الحدود الدنيا للقبول المركزي* PDFs (general channel and المتميزين) from the MOHESR download
   center (https://dirasat.mohesr.gov.iq/download-center.html). Older years move to
   `assets/documents/Docs-<year>/Guides/` on the same host (the Wayback Machine keeps copies when a link breaks).
2. `pip install pypdf`, then:
   ```bash
   npm run import:federal -- /path/to/limits.pdf 2027 "https://dirasat.mohesr.gov.iq/download-center.html" 2027-10-15
   npm run import:federal -- /path/to/distinguished.pdf 2027 "https://dirasat.mohesr.gov.iq/download-center.html" 2027-10-15 --channel=distinguished
   ```
   The script understands both PDF layouts the ministry has used (2024-2026) and prints any university/college
   name it does not know — add it to `scripts/federal-names.json` (English + Sorani + governorate) and re-run
   until it is clean.
3. In `meta.json`: point `federal.file / year / year_label / published` at the new general file, put the
   distinguished file under `extra_files`, and move the previous year's files into `history`. Run `npm test`
   (it reports how many programmes matched a prior year), deploy.
4. When the ministry publishes the new private-colleges guide (usually September), update
   `rules-federal-<year>.json` from its chapter-3 tables and point `federal.rules` at it.

Federal averages can exceed 100 (8% of the foreign-language mark is added to the total), so
`meta.json → federal.max_score` is 110; the checker accepts scores up to that ceiling for the Federal system only.

Notes:
- Scholarship `deadline` must be `YYYY-MM-DD`. Set `"deadline_estimated": true` when the date is
  projected from previous years rather than officially announced — the app labels it "expected".
  Optional Kurdish fields: `covers_ckb`, `covers_kmr`, `deadline_note_ckb`, `deadline_note_kmr`, `notes_ckb`, `notes_kmr`.
- Listings whose deadline has passed are shown as
  *closed* automatically — update `deadline`, `status` and `last_verified` each cycle.
- Study-type and admission-channel filters are generated from the data, so a new channel
  (e.g. `martyrs`) appears in the UI as soon as rows with it exist.
- Rows may carry `gender` (`male` / `female` / `both`), `level` (`college` / `institute`), `campus` and
  `program_length`; the gender / institute filters appear automatically when the data uses them.

Each deploy ships a new service worker; returning visitors get the new data automatically.

## Finding new opportunities

Scholarships are kept fresh by a three-step pipeline in `scripts/opportunities/`. Nothing it finds goes live
until an editor accepts it.

| Step | Command | What it does | Needs |
|---|---|---|---|
| Watch | `npm run opps:watch` | Visits every listing's official page; reports pages that changed, moved or broke, deadlines that passed, expected deadlines coming up, and listings not re-checked in 45 days → `review/watch-report.md` | nothing |
| Discover | `npm run opps:discover` (optional `-- --focus "master's in Germany"`) | Claude searches the web for opportunities Iraqi students can apply to, confirms each on the provider's own site, and writes records in all four languages to `review/candidates.json` as *pending*. Duplicates, repost sites and rejected items are skipped | `ANTHROPIC_API_KEY` |
| Review | `npm run opps:review` · `show <cid>` · `accept <cid>` · `reject <cid> "reason"` | Accept validates the record again and adds it to `public/data/scholarships.json` with today's `last_verified`; reject remembers it so discovery never suggests it again | an editor |

Before accepting: open the official link, confirm the dates and that Iraqis are eligible, and edit the candidate in
`review/candidates.json` if anything is off. Sorani and Kurmanji text is machine-written: have a native speaker check it.
Then `npm test` and deploy.

`.github/workflows/opportunities.yml` runs watch (and discover, when the `ANTHROPIC_API_KEY` repository secret is set)
every Monday and opens a pull request with the results. It can also be run by hand with a research focus.
A discovery run costs roughly a few US dollars of API usage, depending on how much it reads.

## Project layout

```
src/components/   UI (Preact)
src/lib/          data loading (meta-driven), filtering, i18n, theme, status/deadline logic, URL share state, place names
src/lib/translations/  ar / ckb / kmr strings (all must have the same keys — enforced by tests)
public/data/      datasets + meta.json
scripts/          import-federal-cutoffs.py + federal-names.json (PDF → JSON pipeline)
tests/verify.js   data + logic tests;  tests/check-build.js — dist/ smoke test run by `npm run build`
```
