# Overview — httpjet Documentation

> Start here for what httpjet is.

- **Canonical URL:** https://httpjet.net/docs/
- **Source Repository:** https://github.com/faratech/httpjet

---

httpjet · documentation · v0.2.0

# httpjet

A from-scratch **Rust web server** and **drop-in LiteSpeed replacement**: it reads the same `conf/httpd_config.xml` tree, speaks native LSAPI to `lsphp`, evaluates the same `.htaccess` files, and adds native HTTP/2 and HTTP/3, reverse-proxy and FastCGI gateways, and an opt-in LSCache-protocol page cache — all on one io_uring transport.

            resolve  SNI / Host → vhost
            acl  identity · throttle · geo · WAF
            rewrite  .htaccess · auth
            cache  lookup → hit?
            dispatch  ws · proxy · php · fcgi · static
            finalize  headers · compress
            store  cache write

       One pipeline per request, any protocol.

           GitHub · faratech/httpjet ↗
           Drop-in LiteSpeed XML config
           HTTP/1.1 · native HTTP/2 · HTTP/3
           Native LSAPI → lsphp · FastCGI
           Apache .htaccess · Basic auth
           Opt-in origin page cache

### Choose your path

          New to httpjet →  Install and serve.
          Migrating →  Move from LiteSpeed safely.
          Operating →   Operations  ·  Configuration
          Reference →  Commands, flags, and variables.

## What httpjet is

Point `--root` at your LiteSpeed Web Server (LSWS 6.3.5) or OpenLiteSpeed tree. httpjet runs it unchanged. Compatibility is the feature. Native additions stay opt-in.

### Compatible surface

- LiteSpeed XML and `mime.properties`

- Native LSAPI to `lsphp`

- mod_rewrite , access control, Basic auth, `Header`, `ErrorDocument`

- LSCache protocol (`X-LiteSpeed-Cache-Control` / `-Tag` / `-Vary` / `-Purge`)

- LiteSpeed `fileETag=28` ETags, `.html`→PHP dispatch order

### httpjet-native (opt-in)

- Throttle, GeoIP/ASN , PROXY protocol , Unix-socket listeners

- Weighted groups with health checks; `h2://` / `h2s://`; FastCGI

- Per-context body/timeout/bandwidth, `sub_filter`, request decompression

- ACME , OCSP , kTLS/sendfile, OpenTelemetry

- Loopback admin API , WAF sidecar , compile-time extensions

        i   Where it runs
httpjet serves WindowsForum.com (x86_64) and MoonTimeNow.com + ThisDayInHistory.ai (ARM64) behind Cloudflare, on pure io_uring with the file tier live. It replaced LiteSpeed for all three (0.1.12, Rust 1.99.1+, edition 2024, GPL-3.0-only). Run `check --strict` and test on alternate ports before cutover. See Capabilities & limits .

## How the pieces fit

Select a node to open its page.

> [Diagram: pipeline] The request pipeline. pipeline::handle() resolves vhost and identity. dispatch() mirrors OpenLiteSpeed ordering. finalize_response finishes each terminal.

## Read next

Start, operate, learn internals, check reference.

          Quickstart →  Install and serve.
          Migrating →  Move from LiteSpeed safely.
          Capabilities →  Supported, optional, unsupported.
          Configuration →  Look up every XML setting.
          Operations →  Deploy, roll back, recover.
          Architecture →  How the server fits together.
          Page cache →  Cache and purge full pages.
          CLI reference →  Every command and flag.

## By the numbers

See Performance for method and receipts.

          1,183 k rps   h2 empty, c=50, dedicated client VM, median of 3, 0.1.12 (2026-11-08): OLS 892k, nginx 388k; 1 KiB 1,097k vs 740k/319k
          44.8 k rps   PHP/LSAPI h1, PGO loopback (2026-06): LiteSpeed ~38.5k
          40 ×   cache hit vs PHP render: 19,215 vs 480 rps; p50 2 ms vs 34 ms
          146 /146   h2spec, native HTTP/2, TLS, three runs
          0.2 %   httpjet phases, June 2026 production (~138 µs/req); PHP 86.5–98.8% of wall time
          3,000 +   test functions, 20 crates; suite green at v0.1.10 (3,068 tests)

## Project status

| Aspect | State |

| Version | **0.2.0** · November 11, 2026 · latest public release |

| Release detail | Hot-path allocation/contention cuts: borrowed vhost routing, single-pass fast-serve header scan, HPACK header-name reuse, sharded telemetry counters. Loopback (production x86_64): HTTP/2 1 KiB static 371,540 req/s at c50 (nginx 180,940; OpenLiteSpeed 399,505); heavy-`.htaccess` HTTP/2 271,118 req/s (nginx 131,955); warm cache hits 110,158 req/s over HTTP/2; see Performance . Semantic versioning adopted 2026-09-17; MSRV Rust 1.99.1, edition 2024. |

| Configuration | LiteSpeed XML stays authoritative. Native directives stay opt-in. `check --strict` gates deploys. |

| Transport | Pure io_uring (monoio), H1/H2/H3 only. No epoll fallback or Windows/macOS port. |

| PHP | Native LSAPI; you supply `lsphp`. Production: persistent external pool, zero-downtime generation reloads. |

| Page cache | Off by default; opt-in LSCache, private tier, cookie vary, tmpfs file tier, per-vhost dictionaries, generation namespaces. Live in production. |

| Optional features | `acme`, `ocsp`, `otel`, `ktls`, `profiling` build features. Each still needs runtime opt-in. |

| Security posture | Reviews through 2026-10-23 plus October bug-bash (rounds 1–16, 0.0.6–0.1.1; five rounds in 0.1.10 closed 23 issues; see audit posture ). Defaults stay fail-closed. |

| Release | Linux installer plus signed DEB, RPM and static archives via GitHub Releases . Full distribution matrix not completed for this release. |
