# Overview — httpjet Documentation

> httpjet is a from-scratch Rust web server and drop-in LiteSpeed replacement: the same XML configuration, native HTTP/2 and HTTP/3, LSAPI PHP, .htaccess rewriting, reverse proxy and FastCGI gateways, and an opt-in origin page cache.

- **Canonical URL:** https://httpjet.net/docs/
- **Source Repository:** https://github.com/faratech/httpjet

---

httpjet · documentation · v0.1.10

# httpjet

A from-scratch **Rust web server** that is a **drop-in LiteSpeed replacement**: it reads the same `conf/httpd_config.xml` tree, speaks native LSAPI to `lsphp`, evaluates the same `.htaccess` files, and adds native HTTP/2 and HTTP/3, reverse-proxy and FastCGI gateways, an opt-in LSCache-protocol page cache, optional ACME and OCSP, and a loopback admin API — all on one io_uring transport.

            resolve  SNI / Host → vhost
            acl  identity · throttle · geo · WAF
            rewrite  .htaccess · auth
            cache  lookup → hit?
            dispatch  ws · proxy · php · fcgi · static
            finalize  headers · compress
            store  cache write

       one pipeline per request, whatever the wire protocol — every page tells you where it sits on this rail

           GitHub · faratech/httpjet ↗
           Drop-in LiteSpeed XML config
           HTTP/1.1 · native HTTP/2 · HTTP/3
           Native LSAPI → lsphp · FastCGI
           Apache .htaccess · Basic auth
           Opt-in origin page cache
           ACME · OCSP · OTel (build features)

## What httpjet is

httpjet is a complete origin server on a memory-safe Rust core, built so that an existing LiteSpeed Web Server (LSWS 6.3.5 compatibility target) or OpenLiteSpeed deployment becomes an httpjet deployment by pointing `--root` at the tree it already has. Compatibility is the feature; everything httpjet adds on top is an explicit opt-in that LiteSpeed simply ignores.

### Compatible surface

- LiteSpeed XML: server, tuning, listeners, vhosts, contexts, `mime.properties`

- Native LSAPI wire protocol to any LSAPI-capable `lsphp`

- mod_rewrite , access control, Basic auth, `Header`, `ErrorDocument`, LSCache directives

- LSCache protocol (`X-LiteSpeed-Cache-Control` / `-Tag` / `-Vary` / `-Purge`)

- LiteSpeed `fileETag=28` ETags, `.html`→PHP dispatch order

### httpjet-native (opt-in)

- Per-client throttle, GeoIP/ASN rules, PROXY protocol , Unix-socket listeners

- Weighted upstream groups with active health checks; `h2://` / `h2s://` upstreams; FastCGI

- Per-context body/timeout/bandwidth overrides, `sub_filter`, request decompression

- ACME HTTP-01/DNS-01, OCSP stapling , kTLS/sendfile, OpenTelemetry

- Loopback status + transactional config API , WAF sidecar , compile-time extensions

        i   Where it runs
httpjet serves WindowsForum.com on an x86_64 origin and MoonTimeNow.com + ThisDayInHistory.ai on an active ARM64 origin behind Cloudflare, over the pure io_uring transport with the page cache's file tier live. It is early-stage software (semantic version **0.1.5**, Rust 1.99.1+, edition 2024, GPL-3.0-only) built around these production deployments — test on alternate ports before trusting it elsewhere. See Capabilities & limits for the honest matrix.

## How the pieces fit

Every wire protocol lands in the same request pipeline. Click a node to jump to its page.

> [Diagram: pipeline] The request pipeline. pipeline::handle() resolves the vhost and the client's identity, then dispatch() mirrors OpenLiteSpeed's ordering with the WAF, extension, page-cache lookup and store seams inserted at fixed points. Each terminal finishes through finalize_response before the transforms run.

## By the numbers

Headline figures from the checked-in benchmark record — every number names its regime (see Performance for methodology and the raw CSVs).

          ~908 k rps   h2 static, dedicated-host loopback — vs OpenLiteSpeed's ~793k (2026-08-27)
          44.8 k rps   PHP/LSAPI over h1, PGO loopback — vs LiteSpeed's ~38.5k (2026-06)
          101 ×   cache hit vs full PHP render of the same page (19,912 vs 196 rps)
          146 /146   h2spec conformance on the native HTTP/2 stack, over TLS, three consecutive runs
          0.2 %   httpjet's share of production request latency — ~138 µs/req; PHP owns the rest
          3,000 +   test functions across 20 crates; full workspace suite green at v0.1.10 (3,068 tests)

## Project status

| Aspect | State (2026-10-26) |

| Version | **0.1.10** (current production release; latest public source tag v0.1.5) — semantic versioning adopted 2026-09-17; MSRV Rust 1.99.1, edition 2024; dependencies current (0.1.x sweep: tokio 1.54, rustls 0.23.46, rustls-webpki 0.103.16 + webpki-roots 1.0.10, fancy-regex 0.20, parking_lot 0.13, zstd 0.14.3). |

| Configuration | LiteSpeed-compatible XML is the authority; httpjet-native directives are opt-in add-ons. `check --strict` is the deploy gate. |

| Transport | Pure io_uring (monoio) for H1/H2/H3 — the *only* transport; there is no epoll fallback and no Windows/macOS port. |

| PHP | Native LSAPI; the operator supplies `lsphp`. Production runs the persistent external pool with zero-downtime generation reloads. |

| Page cache | Off by default; LSCache-protocol opt-in, private tier, per-URL cookie vary, tmpfs file tier, per-vhost dictionaries, generation-scoped namespaces. Live in production. |

| Optional features | `acme`, `ocsp`, `otel`, `ktls`, `profiling` — build features that still need explicit runtime opt-in. |

| Security posture | Whole-codebase review rounds through 2026-10-23 landed, plus the October bug-bash campaign (rounds 1–16 across 0.0.6–0.1.1, then a five-round review in 0.1.10 that closed 23 issues; see audit posture ); fail-closed defaults throughout. |

| Release | Source builds on github.com/faratech/httpjet , generic systemd units, and a hardened OCI example. Signed public packages and a supported-platform matrix are still release work. |

## Read next

The docs follow the request: how the server is structured, the protocols it speaks, how it runs PHP and proxies, who gets in, the page cache, and how it is configured, operated and measured.

          Quickstart →  Build, validate a tree with `check --strict`, serve on loopback.
          Architecture →  20 crates, the frozen `hj-core` seam, the io_uring bridge, generations.
          Capabilities →  Supported, optional, partial, unsupported — and the fixed bounds.
          Page cache →  Keys, tiers, admission, purge, the file tier, capsules.
          CLI reference →  Every subcommand and flag, filterable.
          Migrating →  The validation-first path off LiteSpeed.
          GitHub ↗  Browse the source tree, benchmark harnesses, and issues at `faratech/httpjet`.
