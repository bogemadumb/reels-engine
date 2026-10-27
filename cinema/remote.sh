#!/usr/bin/env bash
# desktop-cinema on a remote machine (REELS_HOST): sync engine (no --delete, media stays), render, pull results.
# usage: cinema/remote.sh <clip> [render-cinema.js flags]      e.g. cinema/remote.sh my-clip --frames 1,5
set -euo pipefail
export RSYNC_RSH="ssh -o ConnectTimeout=180 -o ServerAliveInterval=30"
SSH="ssh -o ConnectTimeout=180 -o ServerAliveInterval=30"
HOST="${REELS_HOST:?set REELS_HOST to an ssh alias of the render machine}"; RDIR="${REELS_REMOTE_DIR:-reels-engine}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
CLIP="$1"; shift
retry() { for i in 1 2 3 4; do "$@" && return 0; sleep 5; done; return 1; }
retry rsync -az --exclude node_modules --exclude out --exclude '.DS_Store' --exclude voice-cache --exclude legacy-style-g --exclude 'cinema/media' "$HERE/" "$HOST:$RDIR/"
[ -d "$HERE/cinema/media" ] && retry rsync -az "$HERE/cinema/media/" "$HOST:$RDIR/cinema/media/"
$SSH "$HOST" "cd $RDIR && node cinema/render-cinema.js $(printf '%q ' "$CLIP" "$@")"
mkdir -p "$HERE/out/cinema"
retry rsync -az --exclude '.tmp-*' "$HOST:$RDIR/out/cinema/" "$HERE/out/cinema/"
