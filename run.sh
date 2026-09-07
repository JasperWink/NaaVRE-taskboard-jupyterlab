#!/usr/bin/env bash
#
# Start JupyterLab with the task board extension.
#
#   ./run.sh                 Build, then launch JupyterLab.
#   ./run.sh --watch         ... and rebuild on source changes.
#   ./run.sh --no-build      Skip the build.
#   ./run.sh --setup         Install and build, then exit without launching.
#   ./run.sh --venv PATH     Use that environment instead of ./venv.
#   ./run.sh --port N        Serve on this port (default 8888).
#
# Standalone by default: the first run creates ./venv and installs this
# extension into it. `--setup --venv PATH` is how the top-level
# NaaVRE-implementation/run.sh installs the board into the shared environment it
# shares with the workflow extension — see that script for why they must share.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

VENV="$ROOT/venv"
PORT=8888
WATCH=0
BUILD=1
SETUP_ONLY=0

usage() {
  cat <<'EOF'
Start JupyterLab with the NaaVRE task board extension.

  ./run.sh                 Build, then launch JupyterLab.
  ./run.sh --watch         ... and rebuild on source changes.
  ./run.sh --no-build      Skip the build.
  ./run.sh --setup         Install and build, then exit without launching.
  ./run.sh --venv PATH     Use that environment instead of ./venv.
  ./run.sh --port N        Serve on this port (default 8888).
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --watch) WATCH=1 ;;
    --no-build) BUILD=0 ;;
    --setup) SETUP_ONLY=1 ;;
    --venv) VENV="$2"; shift ;;
    --port) PORT="$2"; shift ;;
    -h | --help) usage; exit 0 ;;
    *) echo "Unknown option: $1 (try --help)" >&2; exit 1 ;;
  esac
  shift
done

say() { printf '\033[1;34m==> [taskboard]\033[0m %s\n' "$*"; }

# This project uses Yarn's node-modules linker. Without .yarnrc.yml, Yarn 3
# falls back to Plug'n'Play, which breaks `jupyter labextension build`.
[ -f .yarnrc.yml ] || echo "nodeLinker: node-modules" > .yarnrc.yml
rm -f .pnp.cjs .pnp.loader.mjs

# jupyter-collaboration >= 4.4.2, which carries the fix for GHSA-8w8w-78q2-76qw,
# requires Python 3.10+. Override with e.g. PYTHON=python3.12 ./run.sh.
PYTHON="${PYTHON:-python3}"

if [ ! -d "$VENV" ]; then
  if ! "$PYTHON" -c 'import sys; sys.exit(sys.version_info < (3, 10))'; then
    echo "$PYTHON is $("$PYTHON" -V 2>&1); jupyter-collaboration needs 3.10+." >&2
    echo "Re-run as: PYTHON=python3.12 $0 $*" >&2
    exit 1
  fi
  say "Creating $VENV (this takes a few minutes)"
  "$PYTHON" -m venv "$VENV"
  "$VENV/bin/python" -m pip install --upgrade pip wheel
  "$VENV/bin/python" -m pip install 'jupyterlab>=4.0.0,<5'
fi

export PATH="$VENV/bin:$PATH"

# Install if this environment does not have the extension yet. The
# [collaboration] extra pulls in jupyter-collaboration; without it the board
# still works, but each client edits its own copy of the file instead of one
# shared document — which is the whole point of the board.
# `labextension develop` symlinks the venv's labextension path at this repo, so
# a later `pip install -e` writes its install.json shared-data into the source
# tree; hatchling then sees that path twice and refuses to build the wheel.
rm -f NaaVRE_taskboard_jupyterlab/labextension/install.json

# Install, and re-install whenever the packaging metadata changes. Entry points
# and dependencies are registered at *install* time, not at build time, so after
# a `git pull` that touches pyproject.toml a plain rebuild would leave this
# environment on the old ones. That matters most for the jupyter_ydoc entry
# point: if its name no longer matches the document's content type, the
# collaboration server silently falls back to a generic YFile and the board
# stops syncing while still looking fine.
STAMP="$VENV/.NaaVRE_taskboard_jupyterlab-pyproject.sha256"
PYPROJECT_SHA=$("$VENV/bin/python" -c \
  "import hashlib;print(hashlib.sha256(open('pyproject.toml','rb').read()).hexdigest())")
if ! "$VENV/bin/python" -c 'import NaaVRE_taskboard_jupyterlab' 2>/dev/null; then
  say "Installing the extension into $(basename "$VENV")"
  "$VENV/bin/python" -m pip install -e '.[collaboration]'
  echo "$PYPROJECT_SHA" > "$STAMP"
elif [ "$(cat "$STAMP" 2>/dev/null)" != "$PYPROJECT_SHA" ]; then
  say "pyproject.toml changed — reinstalling so entry points and deps re-register"
  "$VENV/bin/python" -m pip install -e '.[collaboration]'
  echo "$PYPROJECT_SHA" > "$STAMP"
fi

# Always (re)link the labextension, deliberately NOT guarded by the install
# check above: `pip install -e` COPIES the built labextension into the
# environment, so a venv that already has the package keeps serving whatever
# was built at install time and every later rebuild is invisible in the
# browser. `develop --overwrite` replaces that copy with a symlink to this
# repo's build output. It is idempotent and cheap.
"$VENV/bin/jupyter" labextension develop . --overwrite > /dev/null

# Re-install when package.json changes too, not just when node_modules is
# missing: a dependency bump would otherwise build against the old resolution.
PKG_SHA=$("$VENV/bin/python" -c \
  "import hashlib;print(hashlib.sha256(open('package.json','rb').read()).hexdigest())")
PKG_STAMP="node_modules/.package-json.sha256"
if [ ! -d node_modules ] || [ "$(cat "$PKG_STAMP" 2>/dev/null)" != "$PKG_SHA" ]; then
  say "Installing node dependencies"
  jlpm install
  echo "$PKG_SHA" > "$PKG_STAMP"
fi

if [ "$BUILD" = "1" ] && [ "$WATCH" = "0" ]; then
  say "Building"
  jlpm build
fi

if [ "$WATCH" = "1" ]; then
  say "Watching sources (log: /tmp/naavre-taskboard-watch.log)"
  if [ "$SETUP_ONLY" = "1" ]; then
    # Driven by the top-level script: detach so it can move on to the next repo.
    nohup jlpm watch > /tmp/naavre-taskboard-watch.log 2>&1 &
  else
    jlpm watch > /tmp/naavre-taskboard-watch.log 2>&1 &
    trap 'kill %1 2>/dev/null || true' EXIT
  fi
fi

if [ "$SETUP_ONLY" = "1" ]; then
  say "Ready (not launching JupyterLab)"
  exit 0
fi

mkdir -p notebook-dir

# Keep the Yjs update store beside this repo rather than wherever the shell
# happened to be: jupyter-collaboration defaults it to '.jupyter_ystore.db' in
# the *current directory*, which otherwise litters whichever folder you ran from.
say "Starting JupyterLab on http://localhost:$PORT"
say "  Open taskboard.naavretb from the file browser."
exec jupyter lab \
  --notebook-dir="$ROOT/notebook-dir" \
  --port="$PORT" \
  --SQLiteYStore.db_path="$ROOT/.jupyter_ystore.db"
