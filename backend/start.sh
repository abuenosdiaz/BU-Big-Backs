#!/usr/bin/env bash
#
# start.sh -- start the BU Big Backs app in production.
#
# Boots two processes and ties them together:
#   1. the Next.js production server (``next start``) on NEXT_PORT, run from
#      ../frontend
#   2. the Python integration server (server.py) on SERVER_PORT, which runs
#      the dining poller on a 24h cycle, serves the JSON API over
#      backend/data, and proxies everything else to Next.js
#
# It is self-initializing: on first run it creates a Python virtualenv and
# installs requirements.txt, and it builds the frontend (via build.sh) if no
# build exists yet. Nothing needs to be run beforehand. Ctrl-C stops both.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(cd "$SCRIPT_DIR/../frontend" && pwd)"

# Ports (overridable via the environment, matching server.py's defaults).
NEXT_PORT="${NEXT_PORT:-3000}"
SERVER_PORT="${SERVER_PORT:-8000}"
export NEXT_PORT SERVER_PORT

# Pick a package manager the same way build.sh does.
if [ -f "$FRONTEND_DIR/bun.lock" ] || [ -f "$FRONTEND_DIR/bun.lockb" ]; then
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

# --------------------------------------------------------------------
# Initialize the frontend build.
#
# If the compiled Next.js output is missing, build it automatically via
# build.sh instead of bailing out.
# --------------------------------------------------------------------
if [ ! -d "$FRONTEND_DIR/.next" ]; then
  echo "[start] No frontend build found; running build.sh..."
  "$SCRIPT_DIR/build.sh"
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

echo "[start] Launching Next.js server on port $NEXT_PORT (from $FRONTEND_DIR)..."
( cd "$FRONTEND_DIR" && "$PKG" run start -- --port "$NEXT_PORT" ) &
PIDS+=("$!")

echo "[start] Launching integration server on port $SERVER_PORT..."
"$PY" "$SCRIPT_DIR/server.py" &
PIDS+=("$!")

echo "[start] App is up. Open http://localhost:$SERVER_PORT (Ctrl-C to stop)."

# Exit (and trigger cleanup) as soon as either process stops.
wait -n
