# Renisan Workspace

Two apps live here:

| Folder | What | Stack |
|---|---|---|
| [renisan/](renisan/README.md) | Live admissions checker and scholarship directory (static PWA) | Vite + Preact |
| [platform/](platform/README.md) | The full platform from the build kit: feed, matching, accounts, editor console, Telegram alerts | Next.js + Postgres |

The checker keeps serving students while the platform is built milestone by milestone
(`platform/docs/ROADMAP-TASKS.md`). Its logic moves into the platform in M6.

## Quick start

```bash
cd renisan && npm install && npm test && npm run dev
cd platform && npx pnpm@10 install && npx pnpm@10 test && npx pnpm@10 dev
```
