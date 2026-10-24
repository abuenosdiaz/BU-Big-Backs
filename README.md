# BU-Big-Backs

Rate and find the best food in BU's dining halls.

## Web app (`frontend`)

TanStack Start + React + Tailwind, backed by Supabase. Pages live in `frontend/src/routes/`, dish photos and the logo in `frontend/src/assets/`, and the database setup in `frontend/drizzle/migrations/`.

```sh
cd frontend
cp .env.example .env
bun install
bun run dev            # http://localhost:8080
```

`bun run build` builds, `bun run test` runs the tests.

## Dining data pipeline

`backend/dining_poller.py` pulls BU's dining menus every 30 minutes into `backend/data/` (needs `API_KEY=` in a `.env` at the repo root). `collect_menu_dfs.py` and `marciano_json_to_df.py` turn those snapshots into dataframes.
