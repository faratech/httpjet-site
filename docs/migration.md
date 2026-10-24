# Migrating from LiteSpeed — httpjet Documentation

> A validation-first migration path from LiteSpeed or OpenLiteSpeed: inventory, check --strict, isolated candidate, behavioral proof, caching, cutover and rollback.

- **Canonical URL:** https://httpjet.net/docs/migration
- **Source Repository:** https://github.com/faratech/httpjet

---

# Migrating from LiteSpeed

httpjet consumes LiteSpeed-compatible XML and LSAPI, but a migration is a **compatibility project**, not a binary swap that can skip validation. Directive coverage, filesystem identity, listener ownership, PHP supervision, TLS trust and cache behavior must each be proved for the target deployment. This is the path that proves them in order.

> [Diagram: migration-path] Eight steps, three gates. Nothing binds the incumbent ports until behavior — not just startup — has been proved on an isolated candidate; caching is introduced only after uncached parity.

## 1 · Inventory before changing traffic

- Main and per-vhost XML, included files, variables, listener/vhost maps.

- Document roots, symlink policy, `.htaccess` files, error documents, MIME maps, htpasswd files.

- TLS identities, chains, client-CA/CRL policy, renewal ownership (certbot? built-in ACME?), SNI maps.

- LSAPI processors, PHP environment, child limits, socket owner/mode, application health checks.

- Proxy/WebSocket targets, timeout and retry assumptions, trusted-proxy networks.

- Cache opt-in and purge headers, public/private variation, stale behavior, every external cache/CDN layer.

- Service user/group, writable paths, open-file/memory limits, socket activation, firewall rules, monitoring probes.

Keep secrets and host-specific paths out of migration reports and example repositories.

## 2 · Validate a copied configuration

           **gate 1**
```
target/release/httpjet --root /abs/copied-root check --strict
sudo -u   target/release/httpjet --root /abs/copied-root check --strict
```

Treat errors as blockers. Review every warning — ignored security elements (`lsrecaptcha`, `censorshipControl`), generic CGI contexts, wildcard maps, TLS over a Unix socket, unsupported auth forms, missing GeoIP data, unloaded vhosts, and settings that require a restart rather than a reload. *Parsed does not mean equivalent.* Compare the resulting listener/vhost map and effective limits with the source server, and run the check as the runtime identity too: readable-by-root is not proof the service user can read certificates or write logs, sockets and cache.

        !   Things LiteSpeed does that httpjet will not
`RequestHeader` and `Header edit` are ignored; traditional DES and `$5$`/`$6$` `crypt()` htpasswd hashes verify false (bcrypt, APR1 `$apr1$`, MD5-crypt `$1$` and `{SHA}` are supported); `Require` forms other than `all granted`/`valid-user`/`user` deny; anti-abuse elements are inert; `cacheStorePath` is unused; `respBuffer` always streams; `instances>1` is a single upstream. Each is on the capability matrix . You can also paste any `.htaccess` file into the interactive `.htaccess` & `fast_memo` readiness inspector to preview directive support and `MemoClass` eligibility in the browser.

## 3 · Build the smallest required binary

           **build**
```
CARGO_INCREMENTAL=0 cargo build --locked --release -p httpjet
```

Add `acme`, `ocsp`, `otel`, `profiling` or `ktls` only for a reviewed need, and keep every default-off feature and runtime switch off during initial parity testing. A `ktls` build defaults to `--ktls=auto`, which stays on rustls unless a physical NIC advertises active `tls-hw-tx-offload`.

## 4 · Start an isolated candidate

           **serve** · alternate everything
```
target/release/httpjet --root /abs/copied-root serve \
  --http-addr 127.0.0.1:18080 --https-addr 127.0.0.1:18443 --workers 1 \
  --php-socket /tmp/httpjet-migration-test.sock --php-children 4 \
  --metrics-addr 127.0.0.1:19090
```

Never bind the incumbent ports for the first run. Use loopback/alternate ports, a separate LSAPI socket (or an explicitly selected external test pool), distinct logs and a separate cache path. If PHP is out of scope use `--no-php` — and do not read that static fallback as PHP parity. Never point two supervisors at one LSAPI socket or process family.

## 5 · Prove behavior, not only startup

### Routing & transport

- exact / default / foreign Host routing, HTTP→HTTPS behavior
- SNI, chain validation, ALPN, client certificates, CRL rejection
- h1 keep-alive and chunking, h2 multiplexing, h3 over UDP, large files, ranges, conditional requests, compression, HEAD

### Application

- rewrite/redirect loops, front controllers, PATH_INFO, per-directory access, Basic auth, custom headers, error documents
- PHP/FastCGI environment, uploads, streaming, timeouts, worker recycling, source-disclosure failure cases
- proxy/WebSocket/SSE, upstream TLS identity, load distribution, all-backends-down, active-health recovery
- logs, request ids, metrics, readiness, graceful shutdown, restart, reload

Compare status, headers and body bytes with the incumbent where compatibility is required. Normalize inherently variable fields (Date, generated request ids) explicitly — do not discard all headers to make a comparison pass.

## 6 · Introduce caching separately

Leave `--page-cache` off until uncached parity is established. Then, with an isolated cache and conservative caps, prove that distinct paths, hosts, schemes, queries, cookies, sessions and encodings cannot replay one another; public responses never store private cookies or authenticated data; private entries are session-bound; purge tags invalidate every tier; stale-if-error and stale-while-revalidate obey their windows; restart scanning, integrity failures, missing files and capacity eviction are fail-safe; and the upstream CDN does not retain redirects or errors longer than intended. The repository's cache gates are the executable form of this list. A cache that looks fast but is keyed wrongly is a data-isolation defect, not a performance win.

## 7 · Stage traffic and retain rollback

Package the exact tested binary at a stable path. Prefer a service manager that can hold listener ownership (socket activation), apply non-root permissions, set limits and restart on failure — validate the systemd or OCI example against your environment rather than copying it. Canary through an existing load balancer or CDN, or a dedicated address, before a full listener handoff. Monitor status classes, backend latency and errors, cache dispositions, active connections, memory, file descriptors, PHP/upstream health and h1/h2/h3 traffic independently.

Write and *drill* the rollback before cutover: the prior binary, configuration, unit, certificate ownership, application socket and cache/CDN purge procedure. A binary rollback does not remove bad objects already stored in origin or edge caches.

## 8 · Reload only what is reloadable

Validate before SIGHUP or an API submission. Application-compatible state publishes while existing requests finish on the old generation; listener/QUIC/Unix-socket topology, PHP topology, cache-store identity, process privileges and other boot-owned resources need a restart. An API `restart_required` result is a safety boundary, not a suggestion to force the transaction. See Admin API & reload .

## Minimum acceptance record

- Source commit and build features.

- Sanitized configuration fingerprint (`vhost-map-fingerprint`) and validation output.

- Service identity, kernel/runtime, resource limits.

- Exact test commands, protocol clients, pass/fail counts.

- Canary window and the observed error/cache/backend deltas.

- The rollback command and a successful rollback drill.

Do not claim completion from source inspection, a successful compile or one HTTP 200. The migration is complete when the intended workload, failure modes, operations and rollback have been exercised in the target environment.
