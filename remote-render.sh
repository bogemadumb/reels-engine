#!/usr/bin/env bash
# Render on a remote machine (REELS_HOST, e.g. WSL box): sync the engine, render there, pull out/ back.
# usage: ./remote-render.sh examples/ai30-day1.json [render.js flags]
set -euo pipefail
HOST="${REELS_HOST:?set REELS_HOST to an ssh alias of the render machine}"
RDIR="${REELS_REMOTE_DIR:-reels-engine}"
HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$1"; shift
case "$SCRIPT" in /*) REL="${SCRIPT#"$HERE"/}" ;; *) REL="$SCRIPT" ;; esac
[ -f "$HERE/$REL" ] || { echo "script must live inside the engine folder: $SCRIPT" >&2; exit 2; }
rsync -az --delete --exclude node_modules --exclude out --exclude '.DS_Store' --exclude voice-cache "$HERE/" "$HOST:$RDIR/"
[ -d "$HERE/voice-cache" ] && rsync -az "$HERE/voice-cache/" "$HOST:$RDIR/voice-cache/"
ssh "$HOST" "cd $RDIR && { [ -d node_modules/playwright ] || npm install --no-audit --no-fund --loglevel=error; } && node render.js $(printf '%q ' "$REL" "$@")"
mkdir -p "$HERE/out"
rsync -az --exclude '.tmp-*' "$HOST:$RDIR/out/" "$HERE/out/"
mkdir -p "$HERE/voice-cache"
rsync -az "$HOST:$RDIR/voice-cache/" "$HERE/voice-cache/" 2>/dev/null || true
