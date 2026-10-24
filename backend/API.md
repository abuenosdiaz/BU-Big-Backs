# BU Big Backs API

JSON API for BU's dining-hall menu and dietary data, served by
`backend/server.py`.

The server does two things:

1. Runs a daily job that executes the dining poller (`dining_poller.py`),
   downloading the upcoming menu window into `backend/data/`. The first run
   happens on startup; subsequent runs fire once a day.
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
| GET | `/api/halls` | Dining halls present in the data |
| GET | `/api/dates` | Service dates present in the data |
| GET | `/api/meals` | Distinct meal names present in the data |
| GET | `/api/menu` | Menu item rows (filterable) |
| GET | `/api/menu/grouped` | Menu grouped by hall → meal → station |
| GET | `/api/items/{item_id}` | Every occurrence of one item |
| GET | `/api/stats/halls` | Quick per-hall diet shares & nutrition means |
| GET | `/api/stats/dietary` | Full per-hall dietary & nutrition summary |

> `/api/vegan-outlook` is kept as an alias of `/api/stats/dietary` for older
> frontend builds.

---

### GET `/api`

Index listing the available routes. Useful as a quick liveness/version check.

```json
{
  "service": "BU Big Backs API",
  "version": "BUBigBacksAPI/1.0",
  "endpoints": [
    "/api/health",
    "/api/halls",
    "/api/dates",
    "/api/meals",
    "/api/menu",
    "/api/menu/grouped",
    "/api/items/{item_id}",
    "/api/stats/halls",
    "/api/stats/dietary"
  ]
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

### GET `/api/halls`

The distinct dining halls present in the data.

```json
{
  "halls": [
    {
      "location_id": "marciano",
      "location_name": "The Fresh Food Co. at Marciano Commons",
      "campus": "East Campus"
    },
    {
      "location_id": "warren",
      "location_name": "The Fresh Food Co. at Warren Towers",
      "campus": "Central Campus"
    },
    {
      "location_id": "west",
      "location_name": "The Fresh Food Co. at West Campus",
      "campus": "West Campus"
    }
  ]
}
```

---

### GET `/api/dates`

The service dates present in the data, sorted ascending.

```json
{ "dates": ["2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"] }
```

---

### GET `/api/meals`

Distinct meal names, ordered Breakfast → Brunch → Lunch → Dinner.

```json
{ "meals": ["Breakfast", "Brunch", "Lunch", "Dinner"] }
```

---

### GET `/api/menu`

Menu item rows, one object per `(hall, date, meal, station, item)`. Supports
the [shared filters](#filters).

**Query parameters:** see [Filters](#filters).

**Response:**

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

### GET `/api/menu/grouped`

The same rows as `/api/menu`, but nested as hall → meal → station → items for
menu browsing. Accepts the same [filters](#filters).

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
                  /* …same fields as an /api/menu row… */
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

### GET `/api/stats/halls`

A quick per-hall rollup: dietary shares (0–1 proportions) and mean nutrition
across every item for the hall. Lighter than `/api/stats/dietary`.

```json
{
  "halls": [
    {
      "hall": "The Fresh Food Co. at Marciano Commons",
      "campus": "East Campus",
      "total_items": 1965,
      "share_vegan": 0.6351,
      "share_vegetarian": 0.7812,
      "share_gluten_free": 0.029,
      "share_halal": 0.6651,
      "avg_calories": 125.03,
      "avg_protein_grams": 5.72,
      "avg_carbohydrates_grams": 13.12
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `total_items` | number | Items counted for the hall across all days |
| `share_*` | number | Proportion of items with the dietary flag (0–1) |
| `avg_*` | number | Mean of the nutrition field across the hall's items |

---

### GET `/api/stats/dietary`

The full per-hall dietary and nutrition summary from
`dining_diet_analysis.build_hall_summary`: one row per hall with average
nutrition, dietary totals and percentages (0–100 scale), and the change in
suitable-item counts from the first to the last day in the data.

> Alias: `/api/vegan-outlook` returns the same payload.

```json
{
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

| Field | Type | Description |
|-------|------|-------------|
| `dining_hall` | string | Hall name |
| `campus` | string | Campus |
| `first_day` / `last_day` | string | Earliest / latest service date in the data |
| `total_items` | number | Items counted across all days |
| `avg_*` | number | Mean of the nutrition field |
| `total_<diet>` | number | Count of items suiting each dietary need |
| `percent_<diet>` | number | Percentage (0–100) of items suiting each need |
| `change_<diet>` | number | Last-day count minus first-day count (positive = more on the last day; `0` when only one day is present) |

Dietary needs covered: `vegetarian`, `vegan`, `gluten_free`, `halal`,
`cool_food`.

---

## Filters

`/api/menu` and `/api/menu/grouped` accept these optional query parameters.
Combine them freely; they are applied together (logical AND).

| Parameter | Matches | Example |
|-----------|---------|---------|
| `hall` (or `location_name`) | Hall name, case-insensitive exact | `hall=The Fresh Food Co. at West Campus` |
| `campus` | Campus name, case-insensitive exact | `campus=East Campus` |
| `date` | Service date | `date=2026-10-24` |
| `meal` | Meal name | `meal=Breakfast` |
| `station` | Station name, case-insensitive exact | `station=Bakery` |
| `diet` | One of `vegan`, `vegetarian`, `gluten_free`, `halal`; keeps items where that flag is true | `diet=vegan` |
| `q` | Case-insensitive substring of the item name | `q=smoothie` |

**Example:**

```sh
curl "http://localhost:8000/api/menu?hall=The%20Fresh%20Food%20Co.%20at%20West%20Campus&date=2026-10-24&diet=vegan"
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

The poller always runs once on startup; the schedule above governs subsequent
runs. After each successful poll the dataset cache is invalidated so new data
is served on the next request.

## Caching and freshness

Built datasets are cached in memory for `CACHE_TTL_SECONDS` (default 5 minutes)
to keep repeated requests fast. The cache is also cleared immediately after
each poller run, so a fresh download is reflected without waiting for the TTL
to expire.
