# Overview — httpjet Documentation

> Start here for what httpjet is.

- **Canonical URL:** https://httpjet.net/docs/
- **Source Repository:** https://github.com/faratech/httpjet

---

httpjet · documentation · release overview

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

httpjet reads LiteSpeed Web Server (LSWS 6.3.5) and OpenLiteSpeed configuration trees. Check the supported directives and limits , validate your configuration, and test it before migrating. Native additions are opt-in.

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
httpjet serves WindowsForum.com (x86_64) and MoonTimeNow.com + ThisDayInHistory.ai (ARM64) behind Cloudflare, on pure io_uring with the file tier live. It replaced LiteSpeed for all three. The project is GPL-3.0-only; running versions and deployment settings can differ by host. Run `check --strict` and test on alternate ports before cutover. See Capabilities & limits .

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

          1,465.8 k rps   v0.2.8 H2 empty body, dedicated lab, 10-round matched (+6.6% vs 0.2.7); H3 empty 145.0k (+15.9%)
          44.8 k rps   PHP/LSAPI h1, PGO loopback (2026-06): LiteSpeed ~38.5k
          40 ×   cache hit vs PHP render: 19,215 vs 480 rps; p50 2 ms vs 34 ms
          146 /146   h2spec, native HTTP/2, TLS, three runs
          0.2 %   httpjet phases, June 2026 production (~138 µs/req); LSAPI elapsed time 86.5–98.8% of wall time
          3,300 +   test functions, 20 crates; suite green at v0.2.8 (3,302 tests)

## Project status

| Aspect | State |

| Version | Check the latest public release |

| Release history | Version 0.2.8 adds a synchronous borrowed HTTP/3 memo fast path, cached QPACK `field_section_size`, H2 Frame-1 single-shot batching, cookied guest response-memo with strict logged-in member isolation, O(1) LSAPI wire-header lookup, 64 KiB access-log batching, and 29 bug fixes. Explore dated measurements and their methods in Performance . For release changes and packages, see GitHub Releases . |

| Configuration | LiteSpeed XML stays authoritative. Native directives stay opt-in. `check --strict` gates deploys. |

| Transport | Pure io_uring (monoio), H1/H2/H3 only. No epoll fallback or Windows/macOS port. |

| PHP | Native LSAPI; you supply `lsphp`. Production: persistent external pool, zero-downtime generation reloads. |

| Page cache | Off by default; opt-in LSCache, private tier, cookie vary, tmpfs file tier, per-vhost dictionaries, generation namespaces. Live in production. |

| Optional features | `acme`, `ocsp`, `otel`, `ktls`, `profiling` build features. Each still needs runtime opt-in. |

| Security posture | Continuous security and RFC audits through v0.2.8 (29 issues fixed in 0.2.8, 36 in 0.2.4, 28 in 0.2.0, 22 in 0.1.10; see audit posture ). Defaults stay fail-closed. |

| Release | Linux installer plus signed DEB, RPM and static archives via GitHub Releases . Full distribution matrix not completed for this release. |
