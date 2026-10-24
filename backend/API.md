# BU Big Backs API

JSON API for BU's dining-hall menu and dietary data, served by
`backend/server.py`.

The server does two things:

1. Runs a daily job (first run on startup, then once a day) that:
   - confirms the dining locations against the live API — if they changed, it
     overwrites `backend/locations.json` and regenerates every day's menus from
     scratch;
   - maintains a 7-day menu window in `backend/data/` — polling missing days,
     pruning out-of-range days, and adding new in-range days;
   - continues compiling `backend/items.json`, fetching any menu items not yet
     in the database (see [the item database](#get-apiitemslocationitem_id)).
2. Serves the read-only JSON API documented below, built on the analysis
   modules in `backend/` (`collect_menu_dfs` → `marciano_json_to_df` and
   `dining_diet_analysis`).

The frontend is hosted separately and calls this API cross-origin, so every
response carries CORS headers (see [CORS](#cors)).

## Running the server

```sh
cd backend
./start.sh
```

`start.sh` creates a local virtualenv (`backend/.venv`), installs
`requirements.txt` if needed, then launches the server. By default it listens
on `http://0.0.0.0:8000`.

The poller reads `API_KEY` from a `.env` file at the repository root. Without a
valid key the server still boots and `/api/health` answers, but the data
endpoints have nothing to serve until the first successful poll.

### Static files and caches

- `backend/locations.json` — the dining locations, checked into the repo and
  served by `/api/locations`. Confirmed against the live API on each daily run;
  if the hall set changes it is rewritten automatically and all menus are
  regenerated.
- `backend/items.json` — the item-detail database. Created on demand, lazily
  filled, and continuously growing (never pruned). Not checked in.

### Precompiling the item cache

The daily poller already tops up `backend/items.json` after each run, but you
can also compile on demand (throttled so the upstream API is not hammered):

```sh
cd backend
.venv/bin/python server.py precompile
```

It fetches only today's menu items that are **not already in the database**, so
it safely resumes from wherever the database currently is. Only today's items
are fetchable, since the upstream item endpoint serves the current day only.
Use a larger `UPSTREAM_MIN_INTERVAL` if you hit upstream rate limits.

## Conventions

- **Base URL:** `http://<host>:8000` (host/port configurable, see
  [Configuration](#configuration)).
- **Methods:** all endpoints are `GET` and read-only. Any other method returns
  `405`.
- **Content type:** responses are `application/json; charset=utf-8`.
- **Missing values:** absent numeric/boolean fields are `null`; absent text
  fields may be the literal string `"null"` (from the upstream feed).
- **Dates:** service dates are `YYYY-MM-DD` strings; timestamps are ISO-8601.

### Status codes

| Code | Meaning |
|------|---------|
| `200` | Success |
| `400` | Bad request (e.g. a non-integer where a number is expected) |
| `404` | Unknown route, or a resource (such as an item id) that does not exist |
| `405` | Method not allowed (the API is read-only) |
| `500` | Unexpected server error |
| `503` | Analysis backend unavailable (e.g. pandas not installed, or no data polled yet) |

Error responses share one shape:

```json
{ "error": "No item with id 'NOPE'." }
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api` | Index of available routes |
| GET | `/api/health` | Service, poller, and data status |
| GET | `/api/locations` | Raw dining locations (`backend/locations.json`) |
| GET | `/api/metadata` | All filter options in one call: halls, campuses, dates, meals, stations, diets |
| GET | `/api/menu` | Filtered menu rows; `?group=true` nests by hall → meal → station |
| GET | `/api/items/{item_id}` | Every occurrence of one item (from menu data) |
| GET | `/api/items/{location}/{item_id}` | Full item detail; `?allergens=true` folds in allergen categories |
| GET | `/api/items/{location}/{item_id}/allergens` | Allergen categories for one item |
| GET | `/api/stats` | Overall rollup + per-hall dietary & nutrition summary |

The surface is deliberately compact: filter options are consolidated into
`/api/metadata`, the flat and grouped menu views share one `/api/menu`
endpoint (`?group=true`), and all statistics live under a single `/api/stats`.

---

### GET `/api`

Index listing the available routes. Useful as a quick liveness/version check.

```json
{
  "service": "BU Big Backs API",
  "version": "BUBigBacksAPI/1.0",
  "endpoints": {
    "/api/health": "service, poller and data status",
    "/api/locations": "raw dining locations (static file)",
    "/api/metadata": "all filter options: halls, campuses, dates, meals, stations, diets",
    "/api/menu": "filtered menu rows; add ?group=true to nest by hall/meal/station",
    "/api/items/{item_id}": "occurrences of one item across the menus",
    "/api/items/{location}/{item_id}": "full item detail; ?allergens=true to include allergens",
    "/api/items/{location}/{item_id}/allergens": "allergen categories for one item",
    "/api/stats": "overall rollup + per-hall dietary & nutrition summary"
  }
}
```

---

### GET `/api/health`

Service status plus the state of the analysis backend and the daily poller.
Always returns `200` even when the data backend is unavailable — inspect
`backend.available` to tell the difference.

```json
{
  "status": "ok",
  "backend": {
    "available": true,
    "detail": "ready",
    "data_dir": "/…/backend/data",
    "item_count": 5698
  },
  "poller": {
    "last_run_at": "2026-10-24T20:19:10.613361+00:00",
    "last_status": "ok",
    "last_detail": "Poller completed successfully.",
    "next_run_at": "2026-10-25T03:00:00+00:00",
    "schedule": "daily at 03:00 UTC"
  }
}
```

| Field | Notes |
|-------|-------|
| `backend.available` | `false` when pandas is missing or no data has been polled yet; `detail` explains why |
| `backend.item_count` | Total menu rows currently loaded, or `null` when unavailable |
| `poller.last_status` | `"ok"`, `"error"`, or `null` before the first run |
| `poller.next_run_at` | ISO timestamp of the next scheduled poll |

---

### GET `/api/locations`

The list of dining locations, served verbatim from `backend/locations.json`.
The set of halls rarely changes, so it is stored as a file rather than fetched
per request — but the daily poller confirms it against the live API each run
and rewrites it automatically (regenerating all menus) if a hall is added or
removed.

```json
{
  "locations": [
    {
      "id": "marciano",
      "name": "The Fresh Food Co. at Marciano Commons",
      "short_name": "Marciano Commons",
      "campus": "East Campus",
      "address": "100 Bay State Road",
      "source_url": "https://www.bu.edu/dining/location/marciano/"
    }
  ],
  "source": "Boston University Dining Services",
  "source_url": "https://www.bu.edu/dining/"
}
```

Returns `503` if `locations.json` is missing or unreadable.

---

### GET `/api/metadata`

Every filter dimension in a single call, so a client can populate menu filters
without hitting several endpoints. Covers the halls present in the data, the
campuses, the service dates, the meal names (ordered Breakfast → Brunch →
Lunch → Dinner), the serving stations, and the supported dietary flags.

```json
{
  "halls": [
    {
      "location_id": "marciano",
      "location_name": "The Fresh Food Co. at Marciano Commons",
      "campus": "East Campus"
    }
  ],
  "campuses": ["Central Campus", "East Campus", "West Campus"],
  "dates": ["2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"],
  "meals": ["Breakfast", "Brunch", "Lunch", "Dinner"],
  "stations": ["Bakery", "Grill", "..."],
  "diets": ["vegetarian", "vegan", "gluten_free", "halal", "cool_food"]
}
```

| Field | Description |
|-------|-------------|
| `halls` | Distinct `{location_id, location_name, campus}` present in the menu data |
| `campuses` / `dates` / `meals` / `stations` | Distinct values for each filter dimension |
| `diets` | The dietary flags accepted by the `diet` filter on `/api/menu` |

---

### GET `/api/menu`

Menu item rows, one object per `(hall, date, meal, station, item)`. Supports
the [shared filters](#filters). By default rows are returned flat; pass
`?group=true` to get them nested by hall → meal → station (see
[Grouped output](#grouped-output) below).

**Query parameters:** see [Filters](#filters).

**Flat response (default):**

```json
{
  "count": 3325,
  "rows": [
    {
      "snapshot": "2026-10-24",
      "collection_day": "2026-10-24T00:00:00.000",
      "source_filename": "menu_marciano.json",
      "source_file": "/…/backend/data/2026-10-24/menu_marciano.json",
      "location_id": "marciano",
      "location_name": "The Fresh Food Co. at Marciano Commons",
      "campus": "East Campus",
      "date": "2026-10-24",
      "meal": "Breakfast",
      "meal_opens_at": "09:00",
      "meal_closes_at": "11:00",
      "station": "Bakery",
      "item_id": "L364777",
      "item_name": "Green Smoothie",
      "description": "Blend of green",
      "calories": 45,
      "carbohydrates_grams": 9,
      "protein_grams": 1,
      "saturated_fat_grams": 0,
      "vegetarian": true,
      "vegan": true,
      "gluten_free": false,
      "halal": true,
      "cool_food": false
    }
  ]
}
```

#### Row fields

| Field | Type | Description |
|-------|------|-------------|
| `snapshot` | string | Day-folder name the row came from (`YYYY-MM-DD`) |
| `collection_day` | string | `snapshot` parsed to an ISO timestamp |
| `source_filename` | string | JSON file the row was parsed from |
| `source_file` | string | Absolute path to that file |
| `location_id` | string | Short hall id (`marciano`, `warren`, `west`) |
| `location_name` | string | Full hall name |
| `campus` | string | Campus the hall sits on |
| `date` | string | Service date (`YYYY-MM-DD`) |
| `meal` | string | `Breakfast` / `Brunch` / `Lunch` / `Dinner` |
| `meal_opens_at` / `meal_closes_at` | string | Service hours (`HH:MM`) |
| `station` | string | Serving station within the meal |
| `item_id` | string | Item identifier (not globally unique across days) |
| `item_name` | string | Dish name |
| `description` | string | Dish description (may be `"null"`) |
| `calories` | number | Calories |
| `carbohydrates_grams` | number | Carbohydrates (g) |
| `protein_grams` | number | Protein (g) |
| `saturated_fat_grams` | number | Saturated fat (g) |
| `vegetarian`, `vegan`, `gluten_free`, `halal`, `cool_food` | boolean | Dietary flags |

---

#### Grouped output

With `?group=true`, the same (filtered) rows are nested as hall → meal →
station → items for menu browsing:

```json
{
  "halls": [
    {
      "hall": "The Fresh Food Co. at West Campus",
      "campus": "West Campus",
      "meals": [
        {
          "meal": "Breakfast",
          "opens_at": "09:00",
          "closes_at": "11:00",
          "stations": [
            {
              "station": "Bakery",
              "items": [
                {
                  "item_id": "M1997",
                  "item_name": "Chocolate Chip Scone",
                  "calories": 165,
                  "vegetarian": true,
                  "vegan": false
                  /* …same fields as a flat /api/menu row… */
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

Each item object has the full set of [row fields](#row-fields).

---

### GET `/api/items/{item_id}`

Every occurrence of a single item across all halls, dates, and meals. Returns
`404` if the id is not present.

**Path parameter:** `item_id` — e.g. `L364777`.

```json
{
  "item_id": "L364777",
  "item_name": "Green Smoothie",
  "occurrences": [
    {
      "location_name": "The Fresh Food Co. at Marciano Commons",
      "date": "2026-10-24",
      "meal": "Breakfast",
      "station": "Bakery",
      "calories": 45,
      "vegan": true
      /* …same fields as an /api/menu row… */
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `item_id` | string | The requested id |
| `item_name` | string | Name taken from the first occurrence |
| `occurrences` | array | One [menu row](#row-fields) per occurrence |

---

### GET `/api/items/{location}/{item_id}`

Detailed information for a single item, fetched live from BU's per-item
endpoint (`…/api/v1/dining/locations/{location}/menu/items/{item_id}`). This
carries richer fields than the menu list — most notably the full `ingredients`
statement — plus a structured `location` block. (The upstream payload also
includes a generic `allergy_notice` disclaimer, which the API does not rely on;
see the [`/allergens`](#get-apiitemslocationitem_idallergens) endpoint for
actual allergen categories.)

Results are stored in a single `backend/items.json` **database**, keyed by
`"<location>/<item_id>"`. It is **lazy** (an item is added when first
requested) and **continuously growing** — entries are never pruned, so the
database accumulates coverage over time and repeat lookups never re-hit the
upstream API.

**Path parameters:**

| Name | Description | Example |
|------|-------------|---------|
| `location` | Short hall id (see `/api/metadata` → `halls[].location_id`) | `marciano` |
| `item_id` | Item id (see any menu row's `item_id`) | `L104377` |

**Query parameters:**

| Name | Description |
|------|-------------|
| `refresh` | `1`/`true`/`yes` forces a live re-fetch, bypassing and updating the database |
| `allergens` | `1`/`true`/`yes` adds an `allergens` array (categories) to the response |

**Response:**

```json
{
  "item": {
    "id": "L104377",
    "name": "Sargent Choice Orange Cranberry Muffin",
    "description": null,
    "calories": 240,
    "carbohydrates_grams": 35,
    "protein_grams": 3,
    "saturated_fat_grams": 3,
    "vegetarian": true,
    "vegan": false,
    "gluten_free": false,
    "halal": true,
    "cool_food": false,
    "location": {
      "id": "marciano",
      "name": "The Fresh Food Co. at Marciano Commons",
      "short_name": "Marciano Commons",
      "campus": "East Campus",
      "address": "100 Bay State Road",
      "source_url": "https://www.bu.edu/dining/location/marciano/"
    },
    "date": "2026-10-24",
    "meal": "Breakfast",
    "station": "Bakery",
    "ingredients": "Whole-Grain Complete Baking Mix (…), Orange Juice (…), …",
    "source": "Boston University Dining Services",
    "source_url": "https://www.bu.edu/dining/location/marciano/",
    "fetched_at": "2026-10-24T21:12:53.163265Z",
    "stale": false
  },
  "cached": false,
  "cache_file": "/…/backend/items.json"
}
```

With `?allergens=true` the response gains a top-level `allergens` array:

```json
{ "item": { "…": "…" }, "cached": true, "cache_file": "…", "allergens": ["dairy", "egg", "soy", "wheat"] }
```

| Field | Type | Description |
|-------|------|-------------|
| `item` | object | The upstream item detail (fields passed through as received) |
| `item.ingredients` | string | Full ingredient statement — the closest the feed gets to allergen info |
| `cached` | boolean | `true` when served from the items database, `false` when freshly fetched |
| `cache_file` | string | Absolute path to the items database (`backend/items.json`) |
| `allergens` | array | Present only with `?allergens=true`: the item's allergen categories |

**Status codes specific to this endpoint:**

| Code | Meaning |
|------|---------|
| `404` | The upstream API has no such item for this location/day |
| `502` | The upstream API could not be reached, the API key is missing, or it returned an error (e.g. `422` for an unknown location) |
| `503` | The upstream throttle queue was saturated and this request waited longer than `UPSTREAM_MAX_WAIT`. A `Retry-After` header is included; retry shortly. |

**Throttling:** each *uncached* item requires its own upstream call, so these
calls are serialised and spaced at least `UPSTREAM_MIN_INTERVAL` seconds apart
to avoid being rate-limited. A burst of requests for different new items is
drip-fed to the upstream API; cache hits are served immediately and are never
throttled. Concurrent requests for the *same* new item trigger only one
upstream call — the rest are served from the cache it populates.

**Example:**

```sh
curl "http://localhost:8000/api/items/marciano/L104377"
curl "http://localhost:8000/api/items/marciano/L104377?refresh=1"
```

> Allergen note: BU's feed does not provide a structured allergen list, and
> `item.allergy_notice` is only a generic disclaimer. The `ingredients` string
> is the real allergen-relevant data; the
> [`/allergens`](#get-apiitemslocationitem_idallergens) endpoint below derives
> likely allergen categories from it.

---

### GET `/api/items/{location}/{item_id}/allergens`

Likely allergen **categories** for one item, derived by matching its
`ingredients` string against `backend/allergen.json`. The server does not use
`allergy_notice` (a generic disclaimer); it classifies the actual ingredients.

`allergen.json` maps ingredient keywords to a major allergen category (e.g.
`milk → dairy`, `cheese → dairy`, `salmon → fish`). Keywords are matched on
word boundaries, so `eggplant` does not match `egg`. The returned `allergens`
list is **deduplicated by category** — an item containing both milk and cheese
reports `dairy` once.

This reuses the per-day item cache (`data/<date>/items.json`), so it does not
re-fetch an item already looked up today. `refresh=1` forces a live re-fetch.

**Path parameters:** same as
[`/api/items/{location}/{item_id}`](#get-apiitemslocationitem_id).

**Response:**

```json
{
  "item_id": "M14258",
  "name": "Shredded Cheddar Cheese",
  "location": "west",
  "ingredients": "Cheddar Cheese (pasteurized milk, cheese cultures, salt, enzymes), …",
  "allergens": ["dairy"],
  "matched_keywords": {
    "dairy": ["cheddar", "cheese", "milk"]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `item_id` / `name` / `location` | string | Item identity |
| `ingredients` | string | The ingredient statement the classification ran on (may be `null` if upstream omits it) |
| `allergens` | array of string | Distinct allergen categories, sorted and deduplicated |
| `matched_keywords` | object | For transparency: per category, the ingredient keywords that triggered it |

Allergen categories currently used: `dairy`, `egg`, `fish`, `shellfish`,
`tree_nuts`, `peanut`, `wheat`, `gluten`, `soy`, `sesame`, `mustard`,
`sulfites`.

> This is a best-effort match on ingredient text, not a guarantee. It can
> over-report (e.g. "coconut milk" matches both `tree_nuts` and `dairy`) — a
> deliberately safe bias for an allergen check. Diners with allergies should
> still confirm with BU Dining staff.

**Status codes:** same as `/api/items/{location}/{item_id}` (`404` unknown
item, `502` upstream failure, `503` when the upstream throttle queue is
saturated), plus `503` if `allergen.json` is missing or unreadable. It is
subject to the same [throttling](#get-apiitemslocationitem_id) on uncached
items.

**Example:**

```sh
curl "http://localhost:8000/api/items/west/M14258/allergens"
```

---

### GET `/api/stats`

All available statistics in one call: an `overall` rollup across every hall,
plus the authoritative per-hall breakdown from
`dining_diet_analysis.build_hall_summary`.

```json
{
  "overall": {
    "total_items": 5698,
    "halls": 3,
    "first_day": "2026-10-24",
    "last_day": "2026-10-30",
    "percent": {
      "vegetarian": 72.6,
      "vegan": 58.35,
      "gluten_free": 3.1,
      "halal": 64.9,
      "cool_food": 3.1
    },
    "avg_nutrition": {
      "calories": 134.18,
      "carbohydrates_grams": 14.2,
      "protein_grams": 5.9,
      "saturated_fat_grams": 1.5
    }
  },
  "halls": [
    {
      "dining_hall": "The Fresh Food Co. at Marciano Commons",
      "campus": "East Campus",
      "first_day": "2026-10-24",
      "last_day": "2026-10-30",
      "total_items": 1965,
      "avg_calories": 125.028,
      "avg_carbohydrates_grams": 13.117,
      "avg_protein_grams": 5.723,
      "avg_saturated_fat_grams": 1.383,
      "total_vegetarian": 1535,
      "percent_vegetarian": 78.117,
      "total_vegan": 1248,
      "percent_vegan": 63.511,
      "total_gluten_free": 57,
      "percent_gluten_free": 2.901,
      "total_halal": 1307,
      "percent_halal": 66.514,
      "total_cool_food": 57,
      "percent_cool_food": 2.901,
      "change_vegetarian": 10,
      "change_vegan": 6,
      "change_gluten_free": 2,
      "change_halal": 18,
      "change_cool_food": 1
    }
  ]
}
```

**`overall`** (aggregated across all halls):

| Field | Type | Description |
|-------|------|-------------|
| `total_items` | number | Items counted across all halls and days |
| `halls` | number | Number of dining halls |
| `first_day` / `last_day` | string | Date span present in the data |
| `percent.<diet>` | number | Percentage (0–100) of items suiting each dietary need |
| `avg_nutrition.<field>` | number | Mean nutrition across all items |

**`halls[]`** (one row per hall, from the analysis module):

| Field | Type | Description |
|-------|------|-------------|
| `dining_hall` / `campus` | string | Hall identity |
| `first_day` / `last_day` | string | Earliest / latest service date in the data |
| `total_items` | number | Items counted across all days |
| `avg_*` | number | Mean of each nutrition field |
| `total_<diet>` | number | Count of items suiting each dietary need |
| `percent_<diet>` | number | Percentage (0–100) of items suiting each need |
| `change_<diet>` | number | Last-day count minus first-day count (positive = more on the last day; `0` when only one day is present) |

Dietary needs covered: `vegetarian`, `vegan`, `gluten_free`, `halal`,
`cool_food`.

---

## Filters

`/api/menu` accepts these optional query parameters. Combine them freely; they
are applied together (logical AND).

| Parameter | Matches | Example |
|-----------|---------|---------|
| `hall` (or `location_name`) | Hall name, case-insensitive exact | `hall=The Fresh Food Co. at West Campus` |
| `campus` | Campus name, case-insensitive exact | `campus=East Campus` |
| `date` | Service date | `date=2026-10-24` |
| `meal` | Meal name | `meal=Breakfast` |
| `station` | Station name, case-insensitive exact | `station=Bakery` |
| `diet` | One or more (comma-separated) of `vegetarian`, `vegan`, `gluten_free`, `halal`, `cool_food`; an item must satisfy **all** listed flags | `diet=vegan,halal` |
| `q` | Case-insensitive substring of the item name | `q=smoothie` |
| `allergens` | Comma-separated allergen categories; keep items containing **any** of them | `allergens=fish,shellfish` |
| `exclude_allergens` | Comma-separated allergen categories; keep items containing **none** of them (the allergy-safe case) | `exclude_allergens=dairy,peanut` |
| `include_unknown` | `true` keeps items with no ingredient data when excluding allergens (default: such items are dropped) | `include_unknown=true` |
| `group` | `true` nests the results by hall → meal → station | `group=true` |

### Filtering by allergen

`allergens` and `exclude_allergens` match against the allergen categories
**derived from each item's ingredients** (see
[`/allergens`](#get-apiitemslocationitem_idallergens)). Valid category names
are: `dairy`, `egg`, `fish`, `shellfish`, `tree_nuts`, `peanut`, `wheat`,
`gluten`, `soy`, `sesame`, `mustard`, `sulfites`.

Because allergens come from the items database (`items.json`), an item only has
a known allergen set once it has been compiled. Items without ingredient data
are treated as **unknown**:

- `exclude_allergens` — unknown items are **dropped** by default (safer for an
  allergy filter). Pass `include_unknown=true` to keep them.
- `allergens` — unknown items are always dropped, since membership can't be
  confirmed.

The daily compile keeps today's items covered; items on future days may be
unknown until they enter the current-day window.

**Examples:**

```sh
# Vegan dishes with no dairy, served at West Campus today
curl "http://localhost:8000/api/menu?date=2026-10-24&diet=vegan&exclude_allergens=dairy"

# Everything safe for someone avoiding dairy, egg, wheat, and soy
curl "http://localhost:8000/api/menu?date=2026-10-24&exclude_allergens=dairy,egg,wheat,soy,gluten"

# Dishes that contain fish or shellfish
curl "http://localhost:8000/api/menu?allergens=fish,shellfish"
```

Remember to URL-encode spaces and punctuation in values.

## CORS

Because the frontend is a separate origin, every response includes:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

`OPTIONS` preflight requests return `204 No Content` with the same headers.
Set the `ALLOWED_ORIGIN` environment variable to restrict the allowed origin in
production (e.g. `ALLOWED_ORIGIN=https://app.example.com`).

## Configuration

The server reads these environment variables at startup:

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVER_HOST` | `0.0.0.0` | Bind address |
| `SERVER_PORT` | `8000` | Bind port |
| `POLL_HOUR_UTC` | `3` | Hour (UTC) of the daily poll |
| `POLL_MINUTE_UTC` | `0` | Minute (UTC) of the daily poll |
| `POLL_INTERVAL_SECONDS` | `0` | If > 0, poll on this fixed interval instead of a daily wall-clock time |
| `CACHE_TTL_SECONDS` | `300` | How long the built dataset is reused before rebuilding from disk |
| `ALLOWED_ORIGIN` | `*` | Value for the `Access-Control-Allow-Origin` header |
| `UPSTREAM_MIN_INTERVAL` | `0.5` | Minimum seconds between consecutive upstream item-detail calls (throttle spacing) |
| `UPSTREAM_MAX_WAIT` | `20` | Max seconds a request waits for its turn in the throttle queue before returning `503` |


The poller always runs once on startup; the schedule above governs subsequent
runs. After each successful poll the dataset cache is invalidated so new data
is served on the next request, and the item database is topped up with any
newly available menu items.

## Caching and freshness

Built datasets are cached in memory for `CACHE_TTL_SECONDS` (default 5 minutes)
to keep repeated requests fast. The cache is also cleared immediately after
each poller run, so a fresh download is reflected without waiting for the TTL
to expire.
