#!/usr/bin/env bash
# Local render at low priority.
# usage: cinema/local.sh <clip> [render-cinema.js flags]     needs: npm i playwright-core in $PWCORE (path required)
cd "$(dirname "$0")/.."
CLIP="$1"; shift
exec nice -n 10 env NODE_PATH="${PWCORE:?set PWCORE to a dir with node_modules/playwright-core}/node_modules" CINEMA_CHROME=1 node cinema/render-cinema.js "$CLIP" --workers 2 "$@"
