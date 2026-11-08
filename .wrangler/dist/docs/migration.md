# Migrating from LiteSpeed — httpjet Documentation

> Move an existing LiteSpeed site step by step.

- **Canonical URL:** https://httpjet.net/docs/migration
- **Source Repository:** https://github.com/faratech/httpjet

---

# Migrating from LiteSpeed

httpjet reads LiteSpeed-compatible XML and speaks LSAPI. You still must prove compatibility for your tree before you move traffic.

> [Diagram: migration-path] Eight steps, three gates. Nothing binds the incumbent ports until behavior — not just startup — has been proved on an isolated candidate; caching is introduced only after uncached parity.

      i   Prerequisites
Start with a copied configuration root. Keep your `lsphp` binary available for PHP tests. Run every candidate on alternate ports first.

## 1 · Inventory before changing traffic

### Config

- Collect main XML and per-vhost XML. Include included files and variables.

- List listener maps and vhost maps. Record document roots and symlink policy.

- Collect `.htaccess` files and error documents. Add MIME maps and htpasswd files.

- Record TLS identities and chains. Note client-CA/CRL policy and renewal ownership.

### Traffic

- List LSAPI processors and PHP environment. Record child limits and socket owner/mode.

- Add application health checks. List proxy and WebSocket targets.

- Record timeout and retry assumptions. List trusted-proxy networks.

- Record cache opt-in and purge headers. Note public/private variation and stale behavior.

- List every external cache and CDN layer.

### Ops

- Record service user and group. List writable paths and resource limits.

- Note socket activation and firewall rules. Add monitoring probes.

Keep secrets and host-specific paths out of migration reports and example repositories.

## 2 · Validate a copied configuration

           **gate 1**
```
target/release/httpjet --root /abs/copied-root check --strict
sudo -u   target/release/httpjet --root /abs/copied-root check --strict
```

Treat three errors as blockers:

- Shared or missing docroots block you.

- Mapped vhosts whose config did not load block you.

- Geo rules without their database block you.

Run the check as the runtime identity too. Readable-by-root does not prove service access. Review all warnings before you proceed. See Capabilities & limits for ignored directives.

## 3 · Build the smallest required binary

           **build**
```
CARGO_INCREMENTAL=0 cargo build --locked --release -p httpjet
```

Add `acme`, `ocsp`, `otel`, `profiling` or `ktls` only for a reviewed need. Keep default-off features off during parity testing. A `ktls` build defaults to `--ktls=auto`. It stays on rustls without active `tls-hw-tx-offload` on a physical NIC.

## 4 · Start an isolated candidate

           **serve** · alternate everything
```
target/release/httpjet --root /abs/copied-root serve \
  --http-addr 127.0.0.1:18080 --https-addr 127.0.0.1:18443 --workers 1 \
  --php-socket /tmp/httpjet-migration-test.sock --php-children 4 \
  --metrics-addr 127.0.0.1:19090
```

Never bind the incumbent ports for the first run. Use loopback or alternate ports. Use a separate LSAPI socket. Use distinct logs and a separate cache path. Use `--no-php` only when PHP stays out of scope. Never point two supervisors at one LSAPI socket.

## 5 · Prove behavior, not only startup

### Routing & transport

- Test exact, default and foreign Host routing. Check HTTP→HTTPS behavior.
- Test SNI, chains and ALPN. Test client certificates and CRL rejection.
- Test h1 keep-alive and chunking. Test h2 multiplexing and h3 over UDP.
- Test large files and ranges. Test conditional requests, compression and HEAD.

### Application

- Test rewrites and front controllers. Test PATH_INFO and per-directory access.
- Test Basic auth and custom headers. Test error documents.
- Test PHP/FastCGI environment and uploads. Test streaming, timeouts and worker recycling.
- Test source-disclosure failure cases. Test proxy, WebSocket and SSE behavior.
- Test upstream TLS and load distribution. Test all-backends-down and health recovery.
- Check logs, request ids and metrics. Test readiness, shutdown, restart and reload.

Compare status, headers and body bytes with the incumbent. Normalize only variable fields such as Date and request ids. Keep your comparison commands in the acceptance record. Repeat each failed case after every fix. Do not discard headers to force a pass.

## 6 · Introduce caching separately

Leave `--page-cache` off until you prove uncached parity. Then prove each item below:

- Distinct paths, hosts and schemes never replay each other.

- Distinct queries, cookies and encodings never replay each other.

- Public responses never store private or authenticated data.

- Private entries stay bound to their session.

- Purge tags invalidate every tier.

- Stale windows, restart scan and eviction fail safe.

Run the executable checks in page-cache deploy gates .

## 7 · Stage traffic and retain rollback

Package the exact tested binary at a stable path. Prefer socket activation with non-root permissions. Validate the systemd or OCI example for your environment. Canary through a load balancer, CDN or dedicated address first. Monitor status, latency, cache, connections and memory separately. Monitor file descriptors and PHP/upstream health too.

Write and drill the rollback before cutover. Include the prior binary, config and unit. Include certificate, socket and cache/CDN purge steps. A binary rollback does not remove bad cached objects.

## 8 · Reload only what is reloadable

Validate before SIGHUP or an API submission. See Admin API & reload and the acceptance record below.

## Minimum acceptance record

Reloadable state publishes without dropping in-flight requests. Listener, QUIC, PHP, cache-store and privilege changes need a restart. An API `restart_required` result blocks the transaction.

- Record the source commit and build features.

- Save the sanitized `vhost-map-fingerprint` and validation output.

- Record service identity, kernel/runtime and resource limits.

- Record exact test commands, clients and pass/fail counts.

- Record the canary window and observed deltas.

- Record the rollback command and a successful drill.

Do not claim completion from one HTTP 200. Prove the workload, failure modes, operations and rollback.
