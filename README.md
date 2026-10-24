# BU-Big-Backs

Rate and find the best food in BU's dining halls.

## Web app (`ui/ux`)

TanStack Start + React + Tailwind, backed by Supabase. Pages live in `ui/ux/src/routes/`, dish photos and the logo in `ui/ux/src/assets/`, and the database setup in `ui/ux/drizzle/migrations/`.

```sh
cd ui/ux
cp .env.example .env
bun install
bun run dev            # http://localhost:8080
```

`bun run build` builds, `bun run test` runs the tests.

## Dining data pipeline

`server/dining_poller.py` pulls BU's dining menus every 30 minutes into `server/data/` (needs `API_KEY=` in a `.env` at the repo root). `collect_menu_dfs.py` and `marciano_json_to_df.py` turn those snapshots into dataframes.
