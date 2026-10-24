#!/usr/bin/env bash
#
# start.sh -- launch the BU Big Backs backend API.
#
# Self-initializing: on first run it creates a Python virtualenv in
# backend/.venv and installs requirements.txt; on later runs it reuses them.
# Then it launches server.py, which runs the dining poller daily and serves
# the JSON API. The frontend is hosted separately and is not started here.
#
# Ctrl-C stops the server.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

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
# Dependencies (pandas, numpy) are kept in a local virtualenv so the system
# Python stays clean and runs are reproducible. The venv and its packages are
# created/installed only when missing, so repeat starts are fast.
# --------------------------------------------------------------------
VENV_DIR="$SCRIPT_DIR/.venv"
REQUIREMENTS="$SCRIPT_DIR/requirements.txt"

if [ ! -x "$VENV_DIR/bin/python" ]; then
  echo "[start] Creating Python virtualenv at $VENV_DIR..."
  "$BASE_PY" -m venv "$VENV_DIR"
fi

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
# Launch the API server.
# --------------------------------------------------------------------
echo "[start] Launching backend API server..."
exec "$PY" "$SCRIPT_DIR/server.py"
