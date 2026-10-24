# BU-Big-Backs

Rate and find the best food in BU's dining halls.

## Web app (`frontend/`)

Next.js + Tailwind, backed by Supabase. See [frontend/README.md](frontend/README.md).

```sh
cd frontend
cp .env.example .env.local
npm install
npm run dev            # http://localhost:3000
```

`concept/` is the original Lovable prototype the app was ported from.

## Dining data pipeline

`server/dining_poller.py` pulls BU's dining menus for today and the next 6 days into `server/data/<date>/` (needs `API_KEY=` in a `.env` at the repo root). `server/collect_menu_dfs.py` and `server/marciano_json_to_df.py` turn those snapshots into dataframes.
