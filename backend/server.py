"""BU Big Backs backend API server.

A standalone Python backend for the dining service. It does two things:

    1. Runs a daily job that executes the dining poller (``dining_poller``),
       downloading the upcoming menu window into ``backend/data``. The first
       run happens on startup; subsequent runs fire once a day.

    2. Serves a holistic JSON API built on the analysis modules in this
       directory (``collect_menu_dfs`` -> ``marciano_json_to_df`` and
       ``dining_diet_analysis``). The frontend is hosted separately and calls
       this API cross-origin, so every response carries permissive CORS
       headers and OPTIONS preflight is handled.

The server itself depends only on the Python standard library, so it always
boots. The analysis layer pulls in pandas on demand; if it is missing the data
endpoints return a clear 503 while /api/health still answers.

API overview
------------
    GET /api/health                 service + poller + data status
    GET /api/halls                  dining halls present in the data
    GET /api/dates                  service dates present in the data
    GET /api/meals                  distinct meal names present in the data
    GET /api/menu                   menu item rows (filterable)
    GET /api/menu/grouped           menu grouped by hall -> meal -> station
    GET /api/items/{item_id}        every occurrence of one item
    GET /api/stats/halls            quick per-hall diet shares & nutrition means
    GET /api/stats/dietary          full per-hall dietary & nutrition summary
                                    (alias: /api/vegan-outlook)

Common query parameters for /api/menu and /api/menu/grouped:
    hall / location_name, campus, date, meal, station   exact(ish) filters
    diet = vegan|vegetarian|gluten_free|halal           dietary flag filter
    q                                                   item-name search
"""

from __future__ import annotations

import json
import os
import sys
import threading
import time
import traceback
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

# ==================================================
# 1. Paths and configuration
# ==================================================

BACKEND_DIR = Path(__file__).resolve().parent
DATA_DIR = BACKEND_DIR / "data"

# The analysis modules live right here in the backend directory; make them
# importable no matter where the server is launched from.
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Where this API server binds.
HOST = os.environ.get("SERVER_HOST", "0.0.0.0")
PORT = int(os.environ.get("SERVER_PORT", "8000"))

# Daily poller schedule. By default the poller runs once on startup and then
# every day at POLL_HOUR_UTC:POLL_MINUTE_UTC. Set POLL_INTERVAL_SECONDS to a
# positive value to use a plain fixed interval instead of a wall-clock time.
POLL_HOUR_UTC = int(os.environ.get("POLL_HOUR_UTC", "3"))
POLL_MINUTE_UTC = int(os.environ.get("POLL_MINUTE_UTC", "0"))
POLL_INTERVAL_SECONDS = int(os.environ.get("POLL_INTERVAL_SECONDS", "0"))

# How long a built DataFrame is reused before being rebuilt from disk, in
# seconds. Keeps repeated API calls fast without going stale for long.
CACHE_TTL_SECONDS = int(os.environ.get("CACHE_TTL_SECONDS", "300"))

# Permissive CORS by default since the frontend is a separate origin. Narrow
# this via ALLOWED_ORIGIN (e.g. "https://app.example.com") in production.
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "*")


# ==================================================
# 2. Poller scheduler (daily job)
# ==================================================

class PollerState:
    """Tracks the most recent dining-poller run for the health endpoint."""

    def __init__(self):
        self._lock = threading.Lock()
        self.last_run_at = None
        self.last_status = None  # "ok", "error", or None before the first run
        self.last_detail = None
        self.next_run_at = None

    def record(self, status, detail):
        with self._lock:
            self.last_run_at = datetime.now(timezone.utc).isoformat()
            self.last_status = status
            self.last_detail = detail

    def set_next(self, when):
        with self._lock:
            self.next_run_at = when.isoformat() if when else None

    def snapshot(self):
        with self._lock:
            return {
                "last_run_at": self.last_run_at,
                "last_status": self.last_status,
                "last_detail": self.last_detail,
                "next_run_at": self.next_run_at,
                "schedule": (
                    f"every {POLL_INTERVAL_SECONDS}s"
                    if POLL_INTERVAL_SECONDS > 0
                    else f"daily at {POLL_HOUR_UTC:02d}:{POLL_MINUTE_UTC:02d} UTC"
                ),
            }


POLLER_STATE = PollerState()


def run_poller_once():
    """Run the dining poller a single time, recording the outcome.

    Clears the analysis cache afterwards so freshly downloaded data is picked
    up on the next API call.
    """
    try:
        import dining_poller
    except Exception as exc:
        POLLER_STATE.record("error", f"Could not import dining_poller: {exc}")
        print(f"[poller] import failed: {exc}", file=sys.stderr, flush=True)
        return

    print(f"[poller] Starting run at {datetime.now(timezone.utc).isoformat()}", flush=True)
    try:
        exit_code = dining_poller.main()
        if exit_code == 0:
            POLLER_STATE.record("ok", "Poller completed successfully.")
            print("[poller] Run finished (ok).", flush=True)
        else:
            detail = f"Poller returned non-zero exit code {exit_code}."
            POLLER_STATE.record("error", detail)
            print(f"[poller] {detail}", file=sys.stderr, flush=True)
    except Exception as exc:
        POLLER_STATE.record("error", f"Poller raised: {exc}")
        print(f"[poller] Run failed: {exc}", file=sys.stderr, flush=True)
        traceback.print_exc()
    finally:
        CACHE.invalidate()


def _seconds_until_next_daily_run(now=None):
    """Return (seconds, when) until the next POLL_HOUR_UTC:POLL_MINUTE_UTC."""
    now = now or datetime.now(timezone.utc)
    target = now.replace(
        hour=POLL_HOUR_UTC, minute=POLL_MINUTE_UTC, second=0, microsecond=0
    )
    if target <= now:
        target += timedelta(days=1)
    return (target - now).total_seconds(), target


def poller_loop(stop_event):
    """Run the poller on startup, then on the configured daily schedule."""
    # Always refresh immediately on boot so the API has data to serve.
    run_poller_once()

    while not stop_event.is_set():
        if POLL_INTERVAL_SECONDS > 0:
            delay = POLL_INTERVAL_SECONDS
            when = datetime.now(timezone.utc) + timedelta(seconds=delay)
        else:
            delay, when = _seconds_until_next_daily_run()

        POLLER_STATE.set_next(when)
        print(
            f"[poller] Next run at {when.isoformat()} "
            f"(in {int(delay)}s).",
            flush=True,
        )

        # Sleep until the next run, waking early if asked to stop.
        if stop_event.wait(delay):
            break
        run_poller_once()


def start_poller_thread():
    """Launch the poller loop on a daemon thread and return a stop handle."""
    stop_event = threading.Event()
    thread = threading.Thread(
        target=poller_loop,
        args=(stop_event,),
        name="dining-poller",
        daemon=True,
    )
    thread.start()
    return stop_event


# ==================================================
# 3. Analysis data layer (cached)
# ==================================================

class BackendUnavailable(RuntimeError):
    """Raised when the analysis backend cannot be imported or run."""


class DataCache:
    """Caches the combined menu DataFrame to avoid rebuilding it per request."""

    def __init__(self, ttl_seconds):
        self._lock = threading.Lock()
        self._ttl = ttl_seconds
        self._df = None
        self._built_at = 0.0

    def invalidate(self):
        with self._lock:
            self._df = None
            self._built_at = 0.0

    def get(self):
        """Return the cached DataFrame, rebuilding it when stale or empty."""
        with self._lock:
            fresh = (
                self._df is not None
                and (time.monotonic() - self._built_at) < self._ttl
            )
            if fresh:
                return self._df

            df = _build_items()
            self._df = df
            self._built_at = time.monotonic()
            return df


def _build_items():
    """Build the combined menu DataFrame from ``backend/data``.

    Imports are lazy so the server still boots (and /api/health answers) even
    when pandas or the analysis modules are unavailable. The data root is
    pinned to ``backend/data`` rather than the modules' hard-coded script
    defaults.
    """
    try:
        from collect_menu_dfs import collect_menu_dataframes
    except Exception as exc:  # ImportError, or pandas import failure
        raise BackendUnavailable(
            "Could not import the analysis backend. Ensure its dependencies "
            f"(e.g. pandas) are installed. Original error: {exc}"
        ) from exc

    if not DATA_DIR.exists():
        raise BackendUnavailable(
            f"No menu data found at {DATA_DIR} yet. The poller runs on startup; "
            "wait for its first run to finish, then retry."
        )

    return collect_menu_dataframes(DATA_DIR)


CACHE = DataCache(CACHE_TTL_SECONDS)


def _records(df):
    """Convert a DataFrame to JSON-ready records (NaN/NaT -> null)."""
    return json.loads(df.to_json(orient="records", date_format="iso"))


def _apply_filters(items, params):
    """Apply the shared query filters to the menu DataFrame.

    Exact-match (case-insensitive) on hall/campus/date/meal/station, a diet
    flag filter, and a substring search ``q`` on the item name.
    """
    df = items

    # Column filters. ``hall`` is an alias for ``location_name``.
    exact = {
        "location_name": params.get("hall") or params.get("location_name"),
        "campus": params.get("campus"),
        "date": params.get("date"),
        "meal": params.get("meal"),
        "station": params.get("station"),
    }
    for column, value in exact.items():
        if value and column in df.columns:
            df = df[df[column].astype(str).str.casefold() == str(value).casefold()]

    diet = params.get("diet")
    if diet:
        flag = diet.strip().lower()
        if flag in {"vegan", "vegetarian", "gluten_free", "halal"} and flag in df.columns:
            df = df[df[flag].fillna(False).astype(bool)]

    query = params.get("q")
    if query and "item_name" in df.columns:
        df = df[df["item_name"].astype(str).str.casefold().str.contains(
            query.casefold(), na=False
        )]

    return df


# ---- endpoint data builders ----

def data_menu(params):
    items = CACHE.get()
    if items.empty:
        return {"count": 0, "rows": []}
    rows = _records(_apply_filters(items, params))
    return {"count": len(rows), "rows": rows}


def data_menu_grouped(params):
    """Menu grouped as hall -> meal -> station -> items, for menu browsing."""
    items = CACHE.get()
    if items.empty:
        return {"halls": []}

    df = _apply_filters(items, params)
    halls = []
    for hall_name, hall_df in df.groupby("location_name", sort=True):
        meals = []
        for meal_name, meal_df in hall_df.groupby("meal", sort=False):
            stations = []
            for station_name, station_df in meal_df.groupby("station", sort=True):
                stations.append({
                    "station": station_name,
                    "items": _records(station_df),
                })
            meals.append({
                "meal": meal_name,
                "opens_at": _first_or_none(meal_df, "meal_opens_at"),
                "closes_at": _first_or_none(meal_df, "meal_closes_at"),
                "stations": stations,
            })
        halls.append({
            "hall": hall_name,
            "campus": _first_or_none(hall_df, "campus"),
            "meals": meals,
        })
    return {"halls": halls}


def data_item(item_id):
    items = CACHE.get()
    if items.empty or "item_id" not in items.columns:
        return None
    matches = items[items["item_id"].astype(str) == str(item_id)]
    if matches.empty:
        return None
    rows = _records(matches)
    first = rows[0]
    return {
        "item_id": item_id,
        "item_name": first.get("item_name"),
        "occurrences": rows,
    }


def data_halls():
    items = CACHE.get()
    if items.empty:
        return {"halls": []}
    cols = [c for c in ("location_id", "location_name", "campus") if c in items.columns]
    halls = items[cols].drop_duplicates().sort_values("location_name")
    return {"halls": _records(halls)}


def data_dates():
    items = CACHE.get()
    if items.empty or "date" not in items.columns:
        return {"dates": []}
    dates = sorted({d for d in items["date"].dropna().astype(str) if d})
    return {"dates": dates}


def data_meals():
    items = CACHE.get()
    if items.empty or "meal" not in items.columns:
        return {"meals": []}
    order = {"Breakfast": 0, "Brunch": 1, "Lunch": 2, "Dinner": 3}
    meals = sorted(
        {m for m in items["meal"].dropna().astype(str) if m},
        key=lambda m: order.get(m, 99),
    )
    return {"meals": meals}


def data_hall_stats():
    """Per-hall nutrition and dietary-availability summary."""
    items = CACHE.get()
    if items.empty:
        return {"halls": []}

    import pandas as pd

    df = items.copy()
    for flag in ("vegan", "vegetarian", "gluten_free", "halal"):
        if flag in df.columns:
            df[flag] = df[flag].fillna(False).astype(bool)
    for col in ("calories", "protein_grams", "carbohydrates_grams", "saturated_fat_grams"):
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    out = []
    for hall_name, g in df.groupby("location_name", sort=True):
        total = len(g)
        out.append({
            "hall": hall_name,
            "campus": _first_or_none(g, "campus"),
            "total_items": int(total),
            "share_vegan": _safe_mean_bool(g, "vegan"),
            "share_vegetarian": _safe_mean_bool(g, "vegetarian"),
            "share_gluten_free": _safe_mean_bool(g, "gluten_free"),
            "share_halal": _safe_mean_bool(g, "halal"),
            "avg_calories": _safe_mean(g, "calories"),
            "avg_protein_grams": _safe_mean(g, "protein_grams"),
            "avg_carbohydrates_grams": _safe_mean(g, "carbohydrates_grams"),
        })
    return {"halls": out}


def data_dietary_summary():
    """Full per-hall dietary & nutrition summary from the analysis module.

    This wraps ``dining_diet_analysis.build_hall_summary``: one row per hall
    with average nutrition, dietary totals/percentages, and first-day vs
    last-day changes.
    """
    from dining_diet_analysis import build_hall_summary

    items = CACHE.get()
    if items.empty:
        return {"halls": []}
    summary = build_hall_summary(items)
    return {"halls": _records(summary)}


def _first_or_none(df, column):
    if column not in df.columns:
        return None
    vals = df[column].dropna()
    return None if vals.empty else vals.iloc[0]


def _safe_mean(df, column):
    if column not in df.columns:
        return None
    val = df[column].mean()
    return None if val != val else round(float(val), 2)  # NaN check


def _safe_mean_bool(df, column):
    if column not in df.columns:
        return None
    val = df[column].mean()
    return None if val != val else round(float(val), 4)


# ==================================================
# 4. Request handler
# ==================================================

class ApiHandler(BaseHTTPRequestHandler):
    """Serve the JSON API under /api with CORS."""

    server_version = "BUBigBacksAPI/1.0"

    # ---- response helpers ----

    def _cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _send_json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _send_error_json(self, status, message):
        self._send_json({"error": message}, status=status)

    # ---- routing ----

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/" or parsed.path == "/api":
            self._send_json(self._index())
            return
        if parsed.path.startswith("/api/"):
            self._handle_api(parsed)
            return
        self._send_error_json(404, "Not found.")

    def do_POST(self):
        self._send_error_json(405, "Method not allowed. This API is read-only.")

    # ---- API ----

    def _handle_api(self, parsed):
        route = parsed.path
        params = {k: v[0] for k, v in parse_qs(parsed.query).items() if v}

        try:
            if route == "/api/health":
                self._send_json(self._health())
                return
            if route == "/api/halls":
                self._send_json(data_halls())
                return
            if route == "/api/dates":
                self._send_json(data_dates())
                return
            if route == "/api/meals":
                self._send_json(data_meals())
                return
            if route == "/api/menu":
                self._send_json(data_menu(params))
                return
            if route == "/api/menu/grouped":
                self._send_json(data_menu_grouped(params))
                return
            if route.startswith("/api/items/"):
                item_id = route[len("/api/items/"):]
                result = data_item(item_id)
                if result is None:
                    self._send_error_json(404, f"No item with id '{item_id}'.")
                else:
                    self._send_json(result)
                return
            if route == "/api/stats/halls":
                self._send_json(data_hall_stats())
                return
            # /api/vegan-outlook is kept as an alias for the dietary summary
            # so older frontend builds keep working.
            if route in ("/api/stats/dietary", "/api/vegan-outlook"):
                self._send_json(data_dietary_summary())
                return

            self._send_error_json(404, f"Unknown API route: {route}")

        except BackendUnavailable as exc:
            self._send_error_json(503, str(exc))
        except ValueError as exc:
            self._send_error_json(400, str(exc))
        except Exception as exc:  # pragma: no cover - defensive catch-all
            self._send_error_json(500, f"Unexpected error: {exc}")

    def _index(self):
        return {
            "service": "BU Big Backs API",
            "version": self.server_version,
            "endpoints": [
                "/api/health",
                "/api/halls",
                "/api/dates",
                "/api/meals",
                "/api/menu",
                "/api/menu/grouped",
                "/api/items/{item_id}",
                "/api/stats/halls",
                "/api/stats/dietary",
            ],
        }

    def _health(self):
        backend_ok = True
        backend_detail = "ready"
        item_count = None
        try:
            df = CACHE.get()
            item_count = int(len(df))
        except BackendUnavailable as exc:
            backend_ok = False
            backend_detail = str(exc)
        except Exception as exc:  # pragma: no cover - defensive
            backend_ok = False
            backend_detail = f"error: {exc}"

        return {
            "status": "ok",
            "backend": {
                "available": backend_ok,
                "detail": backend_detail,
                "data_dir": str(DATA_DIR),
                "item_count": item_count,
            },
            "poller": POLLER_STATE.snapshot(),
        }

    def log_message(self, fmt, *args):
        sys.stderr.write(f"[server] {self.address_string()} - {fmt % args}\n")


# ==================================================
# 5. Entry point
# ==================================================

def main():
    # Kick off the daily poller (runs now, then on schedule).
    stop_event = start_poller_thread()

    httpd = ThreadingHTTPServer((HOST, PORT), ApiHandler)
    schedule = (
        f"every {POLL_INTERVAL_SECONDS}s"
        if POLL_INTERVAL_SECONDS > 0
        else f"daily at {POLL_HOUR_UTC:02d}:{POLL_MINUTE_UTC:02d} UTC"
    )
    print(
        f"[server] BU Big Backs API listening on http://{HOST}:{PORT}\n"
        f"[server]   Endpoints -> GET /api (index of routes)\n"
        f"[server]   Poller    -> {schedule}, data in {DATA_DIR}",
        flush=True,
    )
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[server] Shutting down.", flush=True)
    finally:
        stop_event.set()
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
