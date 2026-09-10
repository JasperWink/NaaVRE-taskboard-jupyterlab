#!/usr/bin/env bash
#
# Start JupyterLab with the NaaVRE task board extension.
#
#   ./run.sh    Install, build, launch on http://localhost:8888
#
# NAAVRE_VENV and NAAVRE_SETUP_ONLY let the top-level NaaVRE-implementation/
# run.sh install this extension into the shared environment instead of ./venv.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
VENV="${NAAVRE_VENV:-$ROOT/venv}"

[ $# -eq 0 ] || { echo "usage: $0   (takes no options)" >&2; exit 1; }

say() { printf '\033[1;34m==> [taskboard]\033[0m %s\n' "$*"; }

# Yarn 3 falls back to Plug'n'Play without this, which breaks
# `jupyter labextension build`.
[ -f .yarnrc.yml ] || echo "nodeLinker: node-modules" > .yarnrc.yml
rm -f .pnp.cjs .pnp.loader.mjs

PYTHON="${PYTHON:-python3}"
if [ ! -d "$VENV" ]; then
  say "Creating $VENV (this takes a few minutes)"
  "$PYTHON" -m venv "$VENV"
  "$VENV/bin/python" -m pip install --upgrade pip wheel 'jupyterlab>=4.0.0,<5'
fi

# Checked on every run, not just at creation: an older venv left over from a
# previous setup would fail the collaboration install with a confusing error.
if ! "$VENV/bin/python" -c 'import sys; sys.exit(sys.version_info < (3, 10))'; then
  echo "$VENV runs $("$VENV/bin/python" -V 2>&1); jupyter-collaboration needs 3.10+." >&2
  echo "Delete it and re-run as: PYTHON=python3.12 $0" >&2
  exit 1
fi
export PATH="$VENV/bin:$PATH"

sha() {
  "$VENV/bin/python" -c \
    "import hashlib,sys;print(hashlib.sha256(open(sys.argv[1],'rb').read()).hexdigest())" "$1"
}

# `pip install -e` writes install.json into the source tree once the labextension
# path is symlinked, and hatchling then sees that path twice and refuses to build.
rm -f NaaVRE_taskboard_jupyterlab/labextension/install.json

# Entry points register at install time, so reinstall when packaging changes: a
# stale jupyter_ydoc entry point stops the board syncing without any error.
STAMP="$VENV/.taskboard-pyproject.sha256"
if ! "$VENV/bin/python" -c 'import NaaVRE_taskboard_jupyterlab' 2>/dev/null \
  || [ "$(cat "$STAMP" 2>/dev/null)" != "$(sha pyproject.toml)" ]; then
  say "Installing the extension into $(basename "$VENV")"
  "$VENV/bin/python" -m pip install -e '.[collaboration]'
  sha pyproject.toml > "$STAMP"
fi

# Unguarded on purpose: `pip install -e` COPIES the built labextension, so later
# rebuilds stay invisible until this replaces the copy with a symlink.
"$VENV/bin/jupyter" labextension develop . --overwrite > /dev/null

PKG_STAMP="node_modules/.package-json.sha256"
if [ ! -d node_modules ] || [ "$(cat "$PKG_STAMP" 2>/dev/null)" != "$(sha package.json)" ]; then
  say "Installing node dependencies"
  jlpm install
  sha package.json > "$PKG_STAMP"
fi

say "Building"
jlpm build

if [ -n "${NAAVRE_SETUP_ONLY:-}" ]; then
  say "Ready (not launching JupyterLab)"
  exit 0
fi

mkdir -p notebook-dir

# --SQLiteYStore.db_path keeps the Yjs store here instead of the caller's cwd.
say "Starting JupyterLab on http://localhost:8888"
say "  Open taskboard.naavretb from the file browser."
exec jupyter lab \
  --notebook-dir="$ROOT/notebook-dir" \
  --port=8888 \
  --SQLiteYStore.db_path="$ROOT/.jupyter_ystore.db"
