#!/usr/bin/env bash
# Runs ON the lab VM (as root, via lab-up.sh). Idempotent.
# Installs toolchain + bench tools, unpacks staged content, restores the
# preserved release binaries, and prepares fixtures/TLS/hosts pins.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
LAB=/var/tmp/lab
SWEEP=/var/tmp/sweep

if [ ! -f "$LAB/.provisioned" ]; then
  apt-get update -qq
  apt-get install -y -qq curl git build-essential pkg-config libclang-dev \
    nghttp2-client wrk nginx linux-tools-common \
    libwebp7 libjpeg8 libzip5 libonig5 libcurl4t64 libssl4 libxml2-16 \
    util-linux >/dev/null 2>&1 || apt-get install -y -qq curl git build-essential \
    nghttp2-client wrk nginx libwebp7 libjpeg8 libzip5 util-linux
  # perf binary (best effort; bench-extended.sh logs PERF_UNAVAILABLE if absent)
  apt-get install -y -qq "linux-tools-$(uname -r)" linux-perf >/dev/null 2>&1 || true
  touch "$LAB/.provisioned"
fi

# Rust 1.99.1 for rebuilds (remote/build-one.sh)
if [ ! -x /root/.cargo/bin/cargo ]; then
  curl -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain 1.99.1 >/dev/null 2>&1
  /root/.cargo/bin/rustup component add llvm-tools >/dev/null 2>&1 || true
fi

# Staged content -> / (conf, lsphp, fixtures)
if [ -f "$LAB/lab-content.tar" ]; then
  tar -xf "$LAB/lab-content.tar" -C /
fi
# Preserved binaries -> $SWEEP/bin (+ .sha256 sidecars)
mkdir -p "$SWEEP/bin"
if [ -f "$LAB/sweep-keep.tar" ]; then
  tar -xf "$LAB/sweep-keep.tar" -C /var/tmp
fi
(cd "$SWEEP/bin" && sha256sum -c ./*.sha256 >/dev/null 2>&1) \
  && echo "binaries: sha256 verified" || echo "binaries: WARNING sha256 check incomplete"

# lsphp sanity (glibc/lib deps are why the lab is Ubuntu 26.10)
/usr/local/lsws/fcgi-bin/lsphp -v 2>&1 | head -1 || echo "lsphp: WARNING not runnable"

# Source for rebuilds: bundle of all tags, if staged
if [ -f "$LAB/httpjet-tags.bundle" ] && [ ! -d /root/httpjet ]; then
  git clone -q "$LAB/httpjet-tags.bundle" /root/httpjet || echo "repo clone failed (rebuilds unavailable)"
fi

# Fixtures, lab TLS, hosts pins (was lab-setup.sh)
mkdir -p /var/tmp/lab-tls
if [ ! -f /var/tmp/lab-tls/cert.pem ]; then
  openssl req -x509 -newkey rsa:2048 -nodes -keyout /var/tmp/lab-tls/key.pem \
    -out /var/tmp/lab-tls/cert.pem -days 365 -subj "/CN=windowsforum.com" \
    -addext "subjectAltName=DNS:windowsforum.com,DNS:mcp.windowsforum.com,DNS:*.windowsforum.com,DNS:localhost,IP:127.0.0.1" 2>/dev/null
  chmod 644 /var/tmp/lab-tls/cert.pem /var/tmp/lab-tls/key.pem
fi
grep -rl "letsencrypt" /usr/local/lsws/conf/ 2>/dev/null | while read -r f; do
  sed -i -E 's#/etc/letsencrypt/live/[^<"]*/(fullchain|cert)\.pem#/var/tmp/lab-tls/cert.pem#g; s#/etc/letsencrypt/live/[^<"]*/privkey\.pem#/var/tmp/lab-tls/key.pem#g' "$f"
done
grep -q "mcp.windowsforum.com" /etc/hosts || echo "127.0.0.1 windowsforum.com mcp.windowsforum.com" >> /etc/hosts
cat > /web/public_html/cachebench.php <<'PHP'
<?php
header('Content-Type: text/html; charset=UTF-8');
header('X-LiteSpeed-Cache-Control: public,max-age=300');
$chunk = "<p>cache fixture paragraph for origin page-cache benchmarking. 0123456789 abcdefghij.</p>\n";
$body = "<!DOCTYPE html>\n<html><head><title>cachebench</title></head><body>\n";
while (strlen($body) < 37000) { $body .= $chunk; }
$body .= "</body></html>\n";
header('Content-Length: ' . strlen($body));
echo $body;
PHP
chown -R nobody:nogroup /usr/local/lsws /web/public_html /web/mcp-static 2>/dev/null || true
chmod 0711 /var/tmp/sweep 2>/dev/null || true
echo LAB_PROVISION_OK
