#!/usr/bin/env bash
#
# build.sh -- build the BU Big Backs frontend.
#
# The frontend lives in ../frontend. This installs its node dependencies if
# needed, then compiles the Next.js app (``next build``). Run start.sh
# afterwards to serve the result.

set -euo pipefail

# This script lives in the backend directory; the frontend is its sibling.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(cd "$SCRIPT_DIR/../frontend" && pwd)"
cd "$FRONTEND_DIR"

# Pick a package manager: prefer the one whose lockfile is present, else npm.
if [ -f bun.lock ] || [ -f bun.lockb ]; then
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

echo "[build] Building Next.js app..."
"$PKG" run build

echo "[build] Done. Run ./start.sh to serve the app."
