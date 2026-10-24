#!/usr/bin/env bash
#
# start.sh -- run the BU Big Backs app locally.
#
# Boots two processes:
#   1. the Vite dev server (``vite dev``) from ../frontend, on port 8080
#   2. the Python integration server (server.py) on SERVER_PORT, which runs
#      the dining poller on a 24h cycle and serves the JSON API over
#      backend/data
#
# Vite forwards /api requests to server.py (see frontend/vite.config.ts), so
# open http://localhost:8080 for the whole app.
#
# It is self-initializing: on first run it creates a Python virtualenv,
# installs requirements.txt, and installs the frontend's node dependencies.
# Nothing needs to be run beforehand. Ctrl-C stops both.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(cd "$SCRIPT_DIR/../frontend" && pwd)"

# Port for server.py (overridable, matching server.py's default). Vite reads
# the same variable to know where to forward /api.
SERVER_PORT="${SERVER_PORT:-8000}"
export SERVER_PORT

# Pick a package manager the same way build.sh does: bun if it is installed
# (the repo has a bun.lock), else npm.
if command -v bun >/dev/null 2>&1; then
  PKG=bun
elif command -v npm >/dev/null 2>&1; then
  PKG=npm
else
  echo "start.sh: no supported package manager (npm or bun) found." >&2
  exit 1
fi

# Pick a base Python interpreter.
if command -v python3 >/dev/null 2>&1; then
  BASE_PY=python3
elif command -v python >/dev/null 2>&1; then
  BASE_PY=python
else
  echo "start.sh: no python interpreter found." >&2
  exit 1
fi

# --------------------------------------------------------------------
# Initialize the Python environment.
#
# The analysis endpoints need the packages in requirements.txt. We keep
# them in a local virtualenv (backend/.venv) so the system Python stays
# clean and runs are reproducible. The venv and its dependencies are
# created/installed only when they are missing, so repeat starts are fast.
# --------------------------------------------------------------------
VENV_DIR="$SCRIPT_DIR/.venv"
REQUIREMENTS="$SCRIPT_DIR/requirements.txt"

if [ ! -x "$VENV_DIR/bin/python" ]; then
  echo "[start] Creating Python virtualenv at $VENV_DIR..."
  "$BASE_PY" -m venv "$VENV_DIR"
fi

# From here on, use the venv's interpreter for everything Python.
PY="$VENV_DIR/bin/python"

# Install dependencies if any required package is missing. A quick import
# check avoids a pip run on every start once things are in place.
if ! "$PY" -c "import pandas, numpy" >/dev/null 2>&1; then
  if [ -f "$REQUIREMENTS" ]; then
    echo "[start] Installing Python dependencies from requirements.txt..."
    "$PY" -m pip install --upgrade pip >/dev/null
    "$PY" -m pip install -r "$REQUIREMENTS"
  else
    echo "start.sh: requirements.txt not found at $REQUIREMENTS." >&2
    exit 1
  fi
fi

# Install the frontend's node dependencies when they are missing.
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  echo "[start] Installing frontend dependencies with $PKG..."
  ( cd "$FRONTEND_DIR" && "$PKG" install )
fi

# Track child PIDs so we can clean them up on exit.
PIDS=()

cleanup() {
  echo ""
  echo "[start] Shutting down..."
  for pid in "${PIDS[@]:-}"; do
    if [ -n "${pid:-}" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "[start] Launching Vite dev server (from $FRONTEND_DIR)..."
# exec vite directly (not through npm/bun) so the PID we track is vite
# itself and cleanup can actually stop it.
( cd "$FRONTEND_DIR" && exec ./node_modules/.bin/vite dev ) &
PIDS+=("$!")

echo "[start] Launching integration server on port $SERVER_PORT..."
"$PY" "$SCRIPT_DIR/server.py" &
PIDS+=("$!")

echo "[start] App is up. Open http://localhost:8080 (Ctrl-C to stop)."

# Exit (and trigger cleanup) as soon as either process stops. This polls
# instead of using ``wait -n``, which macOS's bash 3.2 does not support.
while kill -0 "${PIDS[0]}" 2>/dev/null && kill -0 "${PIDS[1]}" 2>/dev/null; do
  sleep 1
done
