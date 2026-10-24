"""Poll the BU dining API on a fixed schedule.

Every POLL_INTERVAL seconds this script:

    1. Reads ``API_KEY`` from the ``.env`` file.
    2. Requests the list of dining locations.
    3. Requests the menu for each location id returned by step 2.
    4. Writes each JSON response to the ``data`` directory, overwriting
       the previous cycle's file.

The script relies only on the Python standard library, so no extra
packages need to be installed.
"""

import json
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
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

# 30 minutes, expressed in seconds.
POLL_INTERVAL = 30 * 60

# Per-request network timeout, in seconds.
REQUEST_TIMEOUT = 30

# Repository root (one level above this ``server`` directory).
REPO_ROOT = Path(__file__).resolve().parent.parent

ENV_FILE = REPO_ROOT / ".env"

# Snapshots are written here. Files are overwritten on each polling cycle.
DATA_DIR = Path(__file__).resolve().parent / "data"


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


def write_snapshot(name, payload):
    """Write one JSON payload, overwriting any previous file."""

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    output_path = DATA_DIR / f"{name}.json"

    output_path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    return output_path


# ==================================================
# 5. Single polling cycle
# ==================================================

def poll_once(api_key):
    """Fetch the locations and every location's menu once."""

    print(f"[{timestamp_label()}] Requesting dining locations...", flush=True)

    locations_payload = fetch_json(LOCATIONS_URL, api_key)

    path = write_snapshot("locations", locations_payload)
    print(f"  Saved locations -> {path}", flush=True)

    locations = locations_payload.get("locations", [])

    if not locations:
        print("  No locations returned; skipping menu requests.", flush=True)
        return

    for location in locations:

        location_id = location.get("id")

        if not location_id:
            print("  Skipping a location with no id.", flush=True)
            continue

        menu_url = MENU_URL_TEMPLATE.format(location=location_id)

        print(f"  Requesting menu for '{location_id}'...", flush=True)

        try:
            menu_payload = fetch_json(menu_url, api_key)
        except urllib.error.HTTPError as error:
            print(
                f"  Menu request for '{location_id}' failed: "
                f"HTTP {error.code} {error.reason}.",
                flush=True,
            )
            continue
        except urllib.error.URLError as error:
            print(
                f"  Menu request for '{location_id}' failed: {error.reason}.",
                flush=True,
            )
            continue

        path = write_snapshot(f"menu_{location_id}", menu_payload)
        print(f"  Saved menu for '{location_id}' -> {path}", flush=True)


# ==================================================
# 6. Scheduling loop
# ==================================================

def main():
    """Load the key, then poll forever at the configured interval."""

    try:
        api_key = load_api_key()
    except (FileNotFoundError, ValueError) as error:
        print(f"Startup error: {error}", file=sys.stderr)
        return 1

    print(
        "Starting BU dining poller. "
        f"Interval: {POLL_INTERVAL // 60} minutes. "
        f"Output directory: {DATA_DIR}",
        flush=True,
    )

    while True:

        started_at = time.monotonic()

        try:
            poll_once(api_key)
        except urllib.error.HTTPError as error:
            print(
                f"Locations request failed: HTTP {error.code} {error.reason}.",
                file=sys.stderr,
            )
        except urllib.error.URLError as error:
            print(
                f"Locations request failed: {error.reason}.",
                file=sys.stderr,
            )
        except Exception as error:  # noqa: BLE001 - keep the loop alive.
            print(f"Unexpected error during poll: {error}", file=sys.stderr)

        # Account for the time the cycle itself took so the cadence stays
        # close to every POLL_INTERVAL seconds.
        elapsed = time.monotonic() - started_at
        sleep_for = max(0, POLL_INTERVAL - elapsed)

        print(
            f"Cycle complete in {elapsed:.1f}s. "
            f"Sleeping {sleep_for / 60:.1f} minutes until the next poll.",
            flush=True,
        )

        time.sleep(sleep_for)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\nStopped by user.", flush=True)
