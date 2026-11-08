#!/usr/bin/env bash
# Lab loopback bench: server taskset 0-3 (--workers 4), h2load taskset 4-7, all 127.0.0.1.
set -uo pipefail
export PATH=/root/.cargo/bin:$PATH
ROOT=/var/tmp/sweep
LOGD=$ROOT/bench-logs; RAW=$ROOT/raw; mkdir -p "$LOGD" "$RAW"
TAGS=(v0.0.1 v0.0.2 v0.0.3 v0.0.9 v0.0.10 v0.1.2 v0.1.5 v0.1.10 v0.1.11 v0.1.12)
for h in windowsforum.com mcp.windowsforum.com; do
  first=$(getent ahosts "$h" | awk '{print $1; exit}')
  [ "$first" = "127.0.0.1" ] || { echo "PREFLIGHT FAIL: $h resolves to $first (not loopback)"; exit 1; }
done
BUA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'

bench_one() { # tag round
  local tag=$1 round=$2 bin=$ROOT/bin/httpjet-$tag RD pid i st
  local out=$RAW/$tag; mkdir -p "$out"
  local help; help=$("$bin" serve --help 2>&1)
  local dropped=()
  for f in --page-cache --no-mtls; do grep -q -- "$f" <<<"$help" || dropped+=("$f"); done
  echo "${dropped[*]}" > "$LOGD/$tag.dropped"
  RD=$(mktemp -d /tmp/sweep-bench.XXXXXX); chmod 0711 "$RD"
  mkdir -p "$RD/logs" "$RD/php"; chown -R nobody:nogroup "$RD/logs" "$RD/php"; chmod 0750 "$RD/logs"; chmod 0711 "$RD/php"
  local args=(--http-addr 127.0.0.1:18080 --https-addr 127.0.0.1:18443)
  grep -q -- "--workers" <<<"$help" && args+=(--workers 4)
  grep -q -- "--php-socket" <<<"$help" && args+=(--php-socket "$RD/php/php.sock")
  grep -q -- "--php-children" <<<"$help" && args+=(--php-children 16)
  grep -q -- "--page-cache" <<<"$help" && args+=(--page-cache)
  grep -q -- "--no-mtls" <<<"$help" && args+=(--no-mtls)
  HTTPJET_LOG_DIR="$RD/logs" setpriv --reuid=nobody --regid=nogroup --clear-groups taskset -c 0-3 "$bin" --root /usr/local/lsws serve "${args[@]}" >>"$LOGD/$tag.serve.log" 2>&1 &
  pid=$!
  for i in $(seq 1 40); do curl -sk -o /dev/null https://127.0.0.1:18443/robots.txt -H 'Host: windowsforum.com' && break || sleep 1; done
  st=0
  for i in 1 2 3 4 5 6; do
    curl -sk -A "$BUA" -H 'Host: windowsforum.com' -o /dev/null https://127.0.0.1:18443/cachebench.php
    st=$(curl -sk -A "$BUA" -H 'Host: windowsforum.com' -o /dev/null -D - https://127.0.0.1:18443/cachebench.php | grep -ci 'x-litespeed-cache: hit' || true)
    [ "$st" -ge 1 ] && break; sleep 1
  done
  echo "primed($tag r$round)=$st" >> "$LOGD/prime.log"
  local L="taskset -c 4-7 h2load"
  $L -t 4 -c 32 -m 10 -n 100000 -H 'Host: mcp.windowsforum.com' https://mcp.windowsforum.com:18443/__hjbench/1k.bin > "$out/static-h2-r$round.log" 2>&1
  $L --h1 -t 4 -c 100 -m 1 -n 100000 -H 'Host: mcp.windowsforum.com' https://mcp.windowsforum.com:18443/__hjbench/1k.bin > "$out/static-h1-r$round.log" 2>&1
  $L -t 4 -c 32 -m 10 -n 100000 -H 'Host: windowsforum.com' https://windowsforum.com:18443/robots.txt > "$out/heavy-h2-r$round.log" 2>&1
  $L --h1 -t 4 -c 100 -m 1 -n 100000 -H 'Host: windowsforum.com' https://windowsforum.com:18443/robots.txt > "$out/heavy-h1-r$round.log" 2>&1
  $L --h1 -t 4 -c 40 -m 1 -n 20000 -H 'Host: windowsforum.com' 'https://windowsforum.com:18443/admin/httpjet/bench.php?n=50' > "$out/php-h1-r$round.log" 2>&1
  $L -t 4 -c 32 -m 32 -n 30000 -H 'Host: windowsforum.com' -H "User-Agent: $BUA" -H 'Accept-Encoding: gzip, deflate, br, zstd' https://windowsforum.com:18443/cachebench.php > "$out/cache-h2-r$round.log" 2>&1
  echo "done $tag round $round" >> "$LOGD/progress.log"
  kill $pid 2>/dev/null; wait $pid 2>/dev/null; sleep 2; rm -rf "$RD"
}

for ROUND in 1 2 3; do
  if [ "$ROUND" = 2 ]; then ORDER=($(printf '%s\n' "${TAGS[@]}" | tac)); else ORDER=("${TAGS[@]}"); fi
  for tag in "${ORDER[@]}"; do bench_one "$tag" "$ROUND"; done
done
echo "ALL_BENCH_DONE"
