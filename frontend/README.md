# BU Big Backs — web app

Next.js (App Router) + Tailwind, backed by Supabase. Students browse the most loved BU dining hall dishes, heart their favourites, comment, post in hall forums and send feedback. Everything is anonymous: each browser gets a random device id.

```bash
cp .env.example .env.local
npm install
npm run dev        # http://localhost:3000
```

`npm run build` builds for production, `npm run lint` lints.

## Layout

- `app/` — one folder per page (`page.tsx` sets the title, the component next to it is the page). Pages: dishes (`/`), `/dish/[id]`, `/near-me`, `/forums`, `/feedback`, `/profile`, `/settings`.
- `components/` — site header and dish cards.
- `lib/` — data hooks (`dishes.ts`), dining hall info (`halls.ts`), the per-device profile (`profile.ts`) and the Supabase client.
- `public/dishes/` — dish photos, named `<dish id>.jpg`.
- `supabase/migrations/` — SQL that creates the tables and the `get_menu` / `toggle_love` functions, if the database ever needs rebuilding.

Votes go through the `get_menu` / `toggle_love` database functions; the vote table has no direct client access, so counts can't be tampered with row by row.
