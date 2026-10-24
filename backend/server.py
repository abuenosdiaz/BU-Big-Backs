"""Integration server for BU Big Backs.

This server ties the whole app together from the backend side:

    1. It runs the dining poller (``dining_poller.main``) once on startup and
       then on a 24-hour cycle in a background thread, keeping
       ``backend/data`` fresh with the upcoming menu window.

    2. It exposes a small JSON API built on top of ``backend/data`` -- the
       combined menu rows and the per-hall vegan-availability summary -- using
       the analysis modules in this directory.

    3. It serves the frontend by proxying every non-``/api`` request to the
       running Next.js server, so the whole app is reachable behind a single
       origin.

It relies only on the Python standard library, matching the dependency-free
style of the poller, so it always boots. The analysis endpoints pull in pandas
on demand; if those packages are missing the API returns a clear error instead
of taking the whole server down.

Endpoints
---------
    GET /api/health              -> liveness, backend + poller status
    GET /api/menu                -> combined menu rows (optional column filters)
    GET /api/vegan-outlook       -> per-hall vegan availability summary

Everything else is proxied to the Next.js server on ``NEXT_PORT`` (default
3000). ``start.sh`` launches both this server and Next.js together.
"""

from __future__ import annotations

import json
import os
import sys
import threading
import time
import traceback
import urllib.error
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

# ==================================================
# 1. Paths and configuration
# ==================================================

# This file lives in ``<repo>/backend``; the frontend lives in ``<repo>/frontend``.
BACKEND_DIR = Path(__file__).resolve().parent
REPO_ROOT = BACKEND_DIR.parent
FRONTEND_DIR = REPO_ROOT / "frontend"
DATA_DIR = BACKEND_DIR / "data"

# The analysis modules live right here in the backend directory; make sure
# they are importable no matter where the server is launched from.
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Host/port this integration server binds to.
HOST = os.environ.get("SERVER_HOST", "0.0.0.0")
PORT = int(os.environ.get("SERVER_PORT", "8000"))

# Where the Next.js production server is expected to listen. ``start.sh``
# launches ``next start`` on this port and this server proxies to it.
NEXT_HOST = os.environ.get("NEXT_HOST", "127.0.0.1")
NEXT_PORT = int(os.environ.get("NEXT_PORT", "3000"))

# Per-request timeout when proxying to the Next.js server, in seconds.
PROXY_TIMEOUT = 30

# How often to re-run the dining poller, in seconds (24 hours).
POLL_INTERVAL_SECONDS = int(os.environ.get("POLL_INTERVAL_SECONDS", str(24 * 60 * 60)))


# ==================================================
# 2. Poller scheduler
# ==================================================

class PollerState:
    """Tracks the most recent dining-poller run for the health endpoint."""

    def __init__(self):
        self._lock = threading.Lock()
        self.last_run_at = None
        self.last_status = None  # "ok", "error", or None before the first run
        self.last_detail = None

    def record(self, status, detail):
        with self._lock:
            self.last_run_at = datetime.now(timezone.utc).isoformat()
            self.last_status = status
            self.last_detail = detail

    def snapshot(self):
        with self._lock:
            return {
                "last_run_at": self.last_run_at,
                "last_status": self.last_status,
                "last_detail": self.last_detail,
                "interval_seconds": POLL_INTERVAL_SECONDS,
            }


POLLER_STATE = PollerState()


def run_poller_once():
    """Run the dining poller a single time, recording the outcome."""
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


def poller_loop(stop_event):
    """Run the poller immediately, then every POLL_INTERVAL_SECONDS."""
    while not stop_event.is_set():
        run_poller_once()
        # Wait for the interval, but wake early if we're asked to stop.
        stop_event.wait(POLL_INTERVAL_SECONDS)


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
# 3. Backend bridge (API data)
# ==================================================

class BackendUnavailable(RuntimeError):
    """Raised when the analysis backend cannot be imported or run."""


def _load_items():
    """Return the combined menu DataFrame from the analysis pipeline.

    Imports are done lazily so the server still boots (and keeps serving the
    frontend) even when pandas or the analysis modules are unavailable. The
    data root is pinned to ``backend/data`` rather than the module default,
    which is a hard-coded path meant only for local script runs.
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
            f"No menu data found at {DATA_DIR} yet. The dining poller runs on "
            "startup; wait for its first run to finish, then retry."
        )

    return collect_menu_dataframes(DATA_DIR)


def get_menu_rows(filters=None):
    """Return combined menu rows as a list of JSON-serialisable dicts.

    ``filters`` is an optional mapping of column -> value; rows are kept only
    where the column matches (case-insensitive substring match).
    """
    items = _load_items()
    if items.empty:
        return []

    if filters:
        for column, value in filters.items():
            if column not in items.columns or value is None:
                continue
            col = items[column].astype(str).str.casefold()
            items = items[col.str.contains(str(value).casefold(), na=False)]

    # ``to_json`` turns NaN/NaT into null, which is what the frontend expects.
    return json.loads(items.to_json(orient="records", date_format="iso"))


def get_vegan_outlook(horizon_days=None):
    """Return the per-hall vegan-availability summary as a list of dicts."""
    from dining_diet_analysis import build_forward_summary, DEFAULT_HORIZON_DAYS

    items = _load_items()
    if items.empty:
        return []

    summary = build_forward_summary(
        items,
        horizon_days=horizon_days or DEFAULT_HORIZON_DAYS,
    )
    return json.loads(summary.to_json(orient="records", date_format="iso"))


# ==================================================
# 4. Request handler
# ==================================================

class IntegrationHandler(BaseHTTPRequestHandler):
    """Serve the JSON API and proxy everything else to Next.js."""

    server_version = "BUBigBacksIntegration/0.1"

    # ---- response helpers ----

    def _send_json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_error_json(self, status, message):
        self._send_json({"error": message}, status=status)

    # ---- routing ----

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self._handle_api(parsed)
        else:
            self._proxy_to_next()

    def do_POST(self):
        # The API is read-only for now; everything else goes to Next.js.
        if urlparse(self.path).path.startswith("/api/"):
            self._send_error_json(405, "Method not allowed")
        else:
            self._proxy_to_next()

    # ---- API ----

    def _handle_api(self, parsed):
        route = parsed.path
        query = parse_qs(parsed.query)

        try:
            if route == "/api/health":
                self._send_json(self._health())
                return

            if route == "/api/menu":
                # Any query param is treated as a column filter.
                filters = {k: v[0] for k, v in query.items() if v}
                self._send_json({"rows": get_menu_rows(filters)})
                return

            if route == "/api/vegan-outlook":
                horizon = query.get("horizon_days", [None])[0]
                horizon_days = int(horizon) if horizon else None
                self._send_json({"halls": get_vegan_outlook(horizon_days)})
                return

            self._send_error_json(404, f"Unknown API route: {route}")

        except BackendUnavailable as exc:
            self._send_error_json(503, str(exc))
        except ValueError as exc:
            self._send_error_json(400, str(exc))
        except Exception as exc:  # pragma: no cover - defensive catch-all
            self._send_error_json(500, f"Unexpected error: {exc}")

    def _health(self):
        backend_ok = True
        backend_detail = "ready"
        try:
            _load_items()
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
            },
            "poller": POLLER_STATE.snapshot(),
        }

    # ---- proxy ----

    def _proxy_to_next(self):
        """Forward the request to the Next.js server and relay the response."""
        target = f"http://{NEXT_HOST}:{NEXT_PORT}{self.path}"
        request = urllib.request.Request(target, method="GET")

        # Pass through the original request headers (minus hop-by-hop ones).
        for header, value in self.headers.items():
            if header.lower() in ("host", "connection"):
                continue
            request.add_header(header, value)

        try:
            with urllib.request.urlopen(request, timeout=PROXY_TIMEOUT) as upstream:
                body = upstream.read()
                self.send_response(upstream.status)
                for header, value in upstream.headers.items():
                    if header.lower() in ("connection", "transfer-encoding"):
                        continue
                    self.send_header(header, value)
                self.end_headers()
                self.wfile.write(body)
        except urllib.error.HTTPError as error:
            body = error.read()
            self.send_response(error.code)
            self.send_header("Content-Type", error.headers.get_content_type())
            self.end_headers()
            self.wfile.write(body)
        except urllib.error.URLError:
            self._send_error_json(
                502,
                "Frontend server is not reachable. Make sure the Next.js "
                f"server is running on {NEXT_HOST}:{NEXT_PORT} "
                "(start.sh launches it).",
            )

    def log_message(self, fmt, *args):
        # Keep the access log terse and on stderr.
        sys.stderr.write(
            f"[server] {self.address_string()} - {fmt % args}\n"
        )


# ==================================================
# 5. Entry point
# ==================================================

def main():
    # Kick off the dining poller: it runs now and then every 24 hours.
    stop_event = start_poller_thread()

    httpd = ThreadingHTTPServer((HOST, PORT), IntegrationHandler)
    print(
        f"[server] Integration server listening on http://{HOST}:{PORT}\n"
        f"[server]   API      -> /api/health, /api/menu, /api/vegan-outlook\n"
        f"[server]   Frontend -> proxied to http://{NEXT_HOST}:{NEXT_PORT}\n"
        f"[server]   Poller   -> every {POLL_INTERVAL_SECONDS}s, data in {DATA_DIR}",
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
