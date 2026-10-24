"""Poll the BU dining API for the upcoming two-week window.

Each run of this script:

    1. Reads ``API_KEY`` from the ``.env`` file.
    2. Walks the window of today through today + 13 (14 days total). For
       each day that does not already have a folder, it requests the
       dining locations and each location's menu for that day and writes
       the JSON responses into the day's folder. Days that already exist
       are left untouched.
    3. Deletes any folder in the ``data`` directory whose date falls
       outside the window -- past days as well as anything beyond the
       end of the window.

The menu endpoint accepts a ``day`` query parameter, valid from
yesterday through 14 days ahead, so every day in the forward window can
be fetched with its own real menu. The script relies only on the Python
standard library, so no extra packages need to be installed.
"""

import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

# ==================================================
# 1. Configuration
# ==================================================

BASE_URL = "https://public.api-nonprod.bu.edu/api/v1/dining"

LOCATIONS_URL = f"{BASE_URL}/locations"

# ``{location}`` is replaced with each id from the locations response.
MENU_URL_TEMPLATE = f"{BASE_URL}/locations/{{location}}/menu"

# The API authenticates requests with this header.
API_KEY_HEADER = "X-API-Key"

# Per-request network timeout, in seconds.
REQUEST_TIMEOUT = 30

# Repository root (one level above this ``server`` directory).
REPO_ROOT = Path(__file__).resolve().parent.parent

ENV_FILE = REPO_ROOT / ".env"

# Snapshots are written here, one subfolder per day (``YYYY-MM-DD``).
DATA_DIR = Path(__file__).resolve().parent / "data"

# Folder-name format for a day's snapshot directory.
DAY_FORMAT = "%Y-%m-%d"

# How many days in advance to cover. The window is today plus the next
# DAYS_AHEAD days, i.e. it ends on today + DAYS_AHEAD. A folder is kept
# only when its date falls inside that range.
DAYS_AHEAD = 6

# Total number of day-folders in the window (today plus DAYS_AHEAD days).
WINDOW_DAYS = DAYS_AHEAD + 1


# ==================================================
# 2. Environment loading
# ==================================================

def load_api_key(env_path=ENV_FILE):
    """Read ``API_KEY`` from a simple ``KEY=VALUE`` ``.env`` file."""

    if not env_path.exists():
        raise FileNotFoundError(
            f"Could not find an .env file at {env_path}."
        )

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():

        line = raw_line.strip()

        # Skip blank lines and comments.
        if not line or line.startswith("#"):
            continue

        if "=" not in line:
            continue

        key, _, value = line.partition("=")

        if key.strip() != "API_KEY":
            continue

        # Trim optional surrounding quotes.
        value = value.strip().strip('"').strip("'")

        if value:
            return value

    raise ValueError(
        f"API_KEY was not found (or was empty) in {env_path}."
    )


# ==================================================
# 3. HTTP helper
# ==================================================

def fetch_json(url, api_key):
    """Perform a GET request and return the decoded JSON body."""

    request = urllib.request.Request(
        url,
        headers={
            API_KEY_HEADER: api_key,
            "Accept": "application/json",
        },
        method="GET",
    )

    with urllib.request.urlopen(
        request,
        timeout=REQUEST_TIMEOUT,
    ) as response:

        charset = response.headers.get_content_charset() or "utf-8"
        body = response.read().decode(charset)

    return json.loads(body)


# ==================================================
# 4. Snapshot persistence
# ==================================================

def timestamp_label():
    """Return a filesystem-safe UTC timestamp, e.g. 20261024T153000Z."""

    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def today():
    """Return today's UTC date."""

    return datetime.now(timezone.utc).date()


def window_dates():
    """Return the window's dates: today through today + WINDOW_DAYS - 1."""

    start = today()
    return [start + timedelta(days=offset) for offset in range(WINDOW_DAYS)]


def dir_for_date(day):
    """Return the snapshot folder for a date, e.g. data/2026-10-24."""

    return DATA_DIR / day.strftime(DAY_FORMAT)


def write_snapshot(day_dir, name, payload):
    """Write one JSON payload into the day's folder, overwriting it."""

    day_dir.mkdir(parents=True, exist_ok=True)

    output_path = day_dir / f"{name}.json"

    output_path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    return output_path


def remove_dir(path):
    """Recursively delete a directory and everything inside it."""

    for item in sorted(path.rglob("*"), reverse=True):
        if item.is_file() or item.is_symlink():
            item.unlink()
        else:
            item.rmdir()
    path.rmdir()


def prune_out_of_window():
    """Delete day folders whose date is outside the forward window.

    The window is today through today + WINDOW_DAYS - 1. A folder is kept
    only when its date falls inside that range; past days and anything
    beyond the end of the window are removed. The decision is made per
    folder from its own date, so gaps in the data never cause an
    out-of-range folder to be retained. Non-date folders are ignored.
    """

    if not DATA_DIR.exists():
        return

    start = today()
    end = start + timedelta(days=WINDOW_DAYS - 1)

    for child in sorted(DATA_DIR.iterdir()):

        if not child.is_dir():
            continue

        try:
            folder_date = datetime.strptime(child.name, DAY_FORMAT).date()
        except ValueError:
            # Not a dated folder; leave it alone.
            continue

        if start <= folder_date <= end:
            continue

        remove_dir(child)
        print(f"  Removed out-of-window folder -> {child}", flush=True)


# ==================================================
# 5. Single polling cycle
# ==================================================

def day_is_complete(day):
    """Return True when a day's folder has every expected menu file.

    A day counts as complete only if it has ``locations.json`` and a
    ``menu_<id>.json`` for each location listed there. Partial days left
    behind by a failed fetch are reported incomplete so they get retried.
    """

    day_dir = dir_for_date(day)

    locations_file = day_dir / "locations.json"
    if not locations_file.exists():
        return False

    try:
        payload = json.loads(locations_file.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return False

    locations = payload.get("locations", [])

    for location in locations:
        location_id = location.get("id")
        if not location_id:
            continue
        if not (day_dir / f"menu_{location_id}.json").exists():
            return False

    return True


def poll_day(api_key, day):
    """Fetch the locations and each location's menu for one date.

    Returns True when every menu was saved, False when at least one menu
    request failed (so the caller knows the day is only partially filled).
    """

    day_label = day.strftime(DAY_FORMAT)
    day_dir = dir_for_date(day)

    print(
        f"[{timestamp_label()}] Polling {day_label}: requesting locations...",
        flush=True,
    )

    locations_payload = fetch_json(LOCATIONS_URL, api_key)

    path = write_snapshot(day_dir, "locations", locations_payload)
    print(f"  Saved locations -> {path}", flush=True)

    locations = locations_payload.get("locations", [])

    if not locations:
        print("  No locations returned; skipping menu requests.", flush=True)
        # Nothing to fetch and nothing to retry for this day.
        return True

    all_succeeded = True

    for location in locations:

        location_id = location.get("id")

        if not location_id:
            print("  Skipping a location with no id.", flush=True)
            continue

        base_menu_url = MENU_URL_TEMPLATE.format(location=location_id)
        menu_url = f"{base_menu_url}?day={day_label}"

        print(f"  Requesting menu for '{location_id}'...", flush=True)

        try:
            menu_payload = fetch_json(menu_url, api_key)
        except urllib.error.HTTPError as error:
            print(
                f"  Menu request for '{location_id}' failed: "
                f"HTTP {error.code} {error.reason}.",
                flush=True,
            )
            all_succeeded = False
            continue
        except urllib.error.URLError as error:
            print(
                f"  Menu request for '{location_id}' failed: {error.reason}.",
                flush=True,
            )
            all_succeeded = False
            continue

        path = write_snapshot(day_dir, f"menu_{location_id}", menu_payload)
        print(f"  Saved menu for '{location_id}' -> {path}", flush=True)

    return all_succeeded


# ==================================================
# 6. Entry point
# ==================================================

def main():
    """Fill any missing days in the window, then prune outside it."""

    try:
        api_key = load_api_key()
    except (FileNotFoundError, ValueError) as error:
        print(f"Startup error: {error}", file=sys.stderr)
        return 1

    dates = window_dates()

    print(
        f"[{timestamp_label()}] Window: "
        f"{dates[0].strftime(DAY_FORMAT)} .. {dates[-1].strftime(DAY_FORMAT)} "
        f"({WINDOW_DAYS} days). Output directory: {DATA_DIR}",
        flush=True,
    )

    for day in dates:

        day_label = day.strftime(DAY_FORMAT)

        # Skip only days that are already complete. A partially filled
        # day (e.g. locations saved but a menu request failed earlier)
        # is re-polled so the missing files can be filled in.
        if day_is_complete(day):
            print(f"  {day_label} already complete; skipping.", flush=True)
            continue

        try:
            complete = poll_day(api_key, day)
        except urllib.error.HTTPError as error:
            print(
                f"  {day_label} request failed: "
                f"HTTP {error.code} {error.reason}.",
                file=sys.stderr,
            )
            continue
        except urllib.error.URLError as error:
            print(
                f"  {day_label} request failed: {error.reason}.",
                file=sys.stderr,
            )
            continue

        if not complete:
            print(
                f"  {day_label} is incomplete; it will be retried "
                "on a future run.",
                flush=True,
            )

    # Tidy up folders outside the forward window (past days and beyond).
    prune_out_of_window()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
