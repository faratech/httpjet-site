#!/bin/bash
set -euo pipefail
# TLS: lab-local self-signed cert; point every lab conf cert path at it.
mkdir -p /var/tmp/lab-tls
openssl req -x509 -newkey rsa:2048 -nodes -keyout /var/tmp/lab-tls/key.pem -out /var/tmp/lab-tls/cert.pem -days 365 \
  -subj "/CN=windowsforum.com" -addext "subjectAltName=DNS:windowsforum.com,DNS:mcp.windowsforum.com,DNS:*.windowsforum.com,DNS:localhost,IP:127.0.0.1" 2>/dev/null
chmod 644 /var/tmp/lab-tls/cert.pem; chmod 644 /var/tmp/lab-tls/key.pem
grep -rl "letsencrypt" /usr/local/lsws/conf/ | while read -r f; do
  sed -i -E 's#/etc/letsencrypt/live/[^<"]*/(fullchain|cert)\.pem#/var/tmp/lab-tls/cert.pem#g; s#/etc/letsencrypt/live/[^<"]*/privkey\.pem#/var/tmp/lab-tls/key.pem#g' "$f"
done
echo "cert paths now:"; grep -rho "/root/lab-tls/[a-z]*\.pem" /usr/local/lsws/conf/ | sort -u
# hosts pins (loopback only)
grep -q "mcp.windowsforum.com" /etc/hosts || echo "127.0.0.1 windowsforum.com mcp.windowsforum.com" >> /etc/hosts
# cache fixture: public-cacheable PHP page, ~37 KB body (lab only, never on prod)
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
chown -R nobody:nogroup /web/public_html /web/mcp-static 2>/dev/null || chown -R nobody /web/public_html /web/mcp-static
ls -la /web/public_html/ | head -6
echo LAB_SETUP_OK
