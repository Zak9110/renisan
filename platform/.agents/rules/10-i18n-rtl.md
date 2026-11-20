# i18n and RTL rules

- Locales: `ar` (RTL), `ckb` Sorani (RTL, Arabic script), `kmr` Kurmanji (LTR, Latin script), `en` (LTR).
- Set `<html lang dir>` per locale. Direction map: ar=rtl, ckb=rtl, kmr=ltr, en=ltr.
- Use Tailwind logical utilities only (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, `text-start`). Flip directional icons under RTL.
- Fonts: self-host via `next/font`. Arabic + Sorani: Noto Sans Arabic or IBM Plex Sans Arabic (must render Sorani letters ڕ ڵ ۆ ێ ە ڤ پ چ ژ گ). Latin: Inter. Always set fallbacks.
- Glyph test string: `ڕێنیشان — خوێندکار — ئەو ڤێدیۆیە`.
- Western digits by default in all locales; make it a setting later.
- Translations need native-speaker review. Do not ship machine-only Sorani or Kurmanji. Track unreviewed keys in `messages/*.review.json`.
- Persist locale in a cookie; detect from `Accept-Language`; default `ar`.
- Mixed-direction text (English program names inside Arabic): wrap in `<bdi>` or `dir="auto"`.
- Dates: `Intl.DateTimeFormat` with the active locale and `Asia/Baghdad`.
