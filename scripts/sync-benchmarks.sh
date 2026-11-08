#!/usr/bin/env bash
# Refresh the public benchmark page (httpjet.net/benchmarks) from the
# production-generated copy. The generator (scripts/bench-report.py in the
# httpjet repo) writes /web/public_html/admin/httpjet/benchmarks/, which is
# admin-only for public visitors; this sync republishes it on httpjet.net.
# Run after regenerating benchmarks, then scripts/deploy.sh.
set -euo pipefail
SRC=${1:-/web/public_html/admin/httpjet/benchmarks}
DST=$(cd "$(dirname "$0")/.." && pwd)/benchmarks
[ -f "$SRC/index.html" ] || { echo "no benchmark page at $SRC" >&2; exit 1; }
mkdir -p "$DST"
rsync -a --delete "$SRC/" "$DST/"
echo "synced $SRC -> $DST ($(du -sh "$DST" | cut -f1))"
