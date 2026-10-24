#!/usr/bin/env bash
#
# build.sh -- build the BU Big Backs frontend.
#
# The frontend lives in ../frontend. This installs its node dependencies if
# needed, then compiles the Vite app (``vite build``).
# For local development use start.sh instead, which runs the dev server.

set -euo pipefail

# This script lives in the backend directory; the frontend is its sibling.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(cd "$SCRIPT_DIR/../frontend" && pwd)"
cd "$FRONTEND_DIR"

# Pick a package manager: bun if it is installed (the repo has a bun.lock),
# else npm.
if command -v bun >/dev/null 2>&1; then
  PKG=bun
elif command -v npm >/dev/null 2>&1; then
  PKG=npm
else
  echo "build.sh: no supported package manager (npm or bun) found." >&2
  exit 1
fi

echo "[build] Frontend: $FRONTEND_DIR"
echo "[build] Using package manager: $PKG"

# Install dependencies when they are missing.
if [ ! -d node_modules ]; then
  echo "[build] Installing dependencies..."
  "$PKG" install
fi

echo "[build] Building Vite app..."
"$PKG" run build

echo "[build] Done."
