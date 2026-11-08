# Capabilities & limits — httpjet Documentation

> See what is supported, optional, or unsupported.

- **Canonical URL:** https://httpjet.net/docs/capabilities
- **Source Repository:** https://github.com/faratech/httpjet

---

# Capabilities & limits

This page lists 25 capabilities, 6 build features and 14 operational bounds. **Supported** means an implemented, tested code path, not parity with another server.

        supported  implemented + tested
        optional  build feature + runtime opt-in
        partial  tested subset — review the boundary
        unsupported  deliberate, documented

## Capability matrix

| Area | Status | Scope and important limits |

| HTTP/1.1 | supported | Keep-alive, pipelining, chunked bodies and 103 Early Hints. Limit: `CONNECT` gets 405; limits configure headers, URL, body and timeouts. → |

| HTTP/2 | supported | Native TLS h2 and h2c prior knowledge with h2spec 146/146. Limit: no server push and no `Upgrade: h2c`. → |

| HTTP/3 | supported | QUIC over UDP through the same pipeline. Limit: publish TCP and UDP HTTPS ports; migration stays disabled. → |

| TLS | supported | rustls (aws-lc-rs) TLS 1.2/1.3 with SNI and ALPN. Limit: dual ECDSA+RSA, reload, client certs and CRLs only as configured. → |

| Automatic certificates | optional | HTTP-01 and DNS-01 behind `--features acme` plus CLI opt-in. Limit: one account/identifier set per process; DNS-01 needs your webhook. → |

| OCSP stapling | optional | Stapling behind `--features ocsp` with OpenSSL 3.x. Limit: your responder must cover every issuer; not for Let's Encrypt. → |

| kTLS / sendfile | partial | Plain-TCP H1 file bodies always use `sendfile(2)`. Limit: TLS 1.3 H1 sendfile needs `--features ktls`, `--ktls=auto` and `tls-hw-tx-offload`. → |

| Virtual hosts | supported | Exact Host/SNI maps with parent-domain and bare `*` fallback. Limit: glob patterns like `*.example.test` never match; `check` warns. |

| Static content | supported | Conditional requests, LiteSpeed ETags and ranges. Limit: precompressed `.br`/`.gz` siblings only; opens stay traversal-safe. → |

| Reverse proxy | supported | HTTP/1 upstreams plus explicit `h2://`/`h2s://` with streaming and SSE. Limit: upstream mTLS only as configured. → |

| WebSocket | partial | HTTP/1 upgrade and raw relay. Limit: relay excludes TLS, H2 and Unix-socket upstreams. → |

| Upstream groups | supported | Primary-first, weighted selection and passive breaker. Limit: probes use connect/GET/HEAD only; unsafe requests never replay. → |

| PHP / LSAPI | supported | Native LSAPI with owned or external pools. Limit: external pools need generation tracking and candidate-first reload. → |

| FastCGI | supported opt-in | Explicit `fcgi`/`fastcgi` routing over TCP or Unix sockets. Limit: you supervise the app externally; bodies buffer. → |

| CGI execution, uWSGI | unsupported | Design contracts exist for both. Limit: nothing routes; a bare `cgi` handler fails closed. → |

| Rewrites & `.htaccess` | partial | Common rewrite, access, auth, header, expiry, cache and env directives. Limit: `Header edit`, `Header setifempty`, `Header echo` and `RequestHeader` are ignored. → |

| Compression | supported | Dynamic gzip/brotli/zstd plus precompressed siblings. Limit: gzip request decoding defaults on; brotli/zstd decoding is opt-in and bounded. → |

| Origin page cache | supported opt-in | Public/private tiers, vary, purge tags, stale, single flight and file tiers. Limit: route-level *microcache policy* is specified, not implemented. → |

| Access controls | supported | Peer ACLs, trusted-proxy IP, GeoIP/ASN rules, rate and body limits. Limit: bcrypt caps at 14; use bcrypt, `$apr1$`, `$1$` or `{SHA}`; files need docroot or `--auth-user-file-roots`. → |

| WAF | external opt-in | Bounded sidecar inspection over Unix or loopback TCP. Limit: it fails closed by default; no embedded ModSecurity/CRS. → |

| Logs and metrics | supported | Combined or JSON access logs and Prometheus metrics. Limit: error logs redact; syslog and slow logs stay optional. → |

| OpenTelemetry | optional | OTLP traces and metrics behind `--features otel` plus `HTTPJET_OTEL=1`. Limit: queues bound output; payloads never export. → |

| Runtime APIs | opt-in | Loopback status API and authenticated config API. Limit: boot-owned resources stay restart-required. → |

| Extensions | compile-time only | Trusted Rust crates register handlers and transforms. Limit: no dynamic ABI and no in-process sandbox. → |

| Deployment | examples | Generic systemd units and a hardened OCI example. Limit: your runtime must still permit io_uring. → |

## Deliberately unsupported or deferred

- **Generic CGI and uWSGI** never route. Use FastCGI, LSAPI or HTTP proxying instead.

- **HTTP/2 server push** is not implemented. Use `Link` preload plus 103 Early Hints.

- **HTTP trailers** are discarded, never forwarded. LSAPI has no trailer concept.

- **h2c is prior-knowledge only**. The `Upgrade: h2c` handshake is not implemented.

- **QUIC connection migration** is disabled. Listener steering cannot preserve ownership across address changes.

- **No epoll/tokio transport fallback**, no Windows/macOS. Linux io_uring is mandatory.

- **No native dynamic-module ABI.** Untrusted inspection belongs behind the bounded sidecar contract.

- **LiteSpeed anti-abuse elements** (`lsrecaptcha`, `censorshipControl`, permission masks, `cgiRlimit`) are parsed and warned about, never enforced.

- **Legacy htpasswd** (DES, `$5$`/`$6$`, plaintext) verifies *false*. Use bcrypt, APR1 (`$apr1$`), MD5-crypt (`$1$`) or `{SHA}`.

- **Cross-node cache peers** (`--cache-peer`, peer fill/purge fan-out) were removed in August 2026; the loopback purge and readiness endpoints remain.

- **Multipath QUIC** was assessed and deferred (June 2026).

## Build-time feature gates

The default binary includes serving, LSAPI, FastCGI, proxy and cache. It also includes logging, metrics and the WAF client. Each feature below needs an explicit build plus its runtime switch.

| Cargo feature | Adds | Runtime opt-in |

| `acme` | `hj-acme`: HTTP-01 / DNS-01 issuance and renewal | `--acme-directory … --acme-domains … --acme-store … --acme-accept-terms` |

| `ocsp` | `hj-ocsp`: fetch, validate, staple (OpenSSL 3.x) | `--ocsp-responder URL` (+ `--ocsp-required`) |

| `otel` | OTLP HTTP/protobuf tracing and metrics exporters | `HTTPJET_OTEL=1` (+ `HTTPJET_OTEL_METRICS=1`) |

| `profiling` | Loopback pprof CPU profile endpoint | `--profile-token` policy; loopback only regardless |

| `ktls` | Kernel TLS on the io_uring TLS path | `--ktls=auto|on|off`; `auto` requires a physical NIC with `tls-hw-tx-offload` |

| `allocount` | Allocation-measurement harness | Diagnostic builds only |

## Operational bounds

Request limits come from ` ` and per-context overrides. Inspect effective values with `check --strict` and `serve --help`.

| Bound | Value |

| Page-cache single object | 100 MiB — larger responses serve uncached |

| Page-cache budgets | Index `--page-cache-mem`; file `--page-cache-disk-mem`; hot `--page-cache-hot-mem`. Limit: files need `--page-cache-integrity-key` (single-link, root/serving uid, no group/other); `--page-cache-integrity-required` enforces it. |

| Bridge buffering | Bodies ≤ 256 KiB buffered, larger streamed (H1/H2/H3) |

| Request body budget | Process-wide byte budget with leases; usage, capacity and rejections exported as `httpjet_body_buffer_*` |

| Request decompression | 16 MiB decoded ceiling; 17 MiB codec workspace reservation for br/zstd; zstd window ≤ 2 24 |

| Multipart ranges | 8 ranges / 8 MiB of part bytes, else a full 200 |

| `.htaccess` chain depth | 64 directories, then a deny-all sentinel |

| sub_filter buffering | 4 MiB default (`subFilterMaxBody`); beyond it the stream passes through raw |

| WAF sidecar | Body inspected up to `--waf-body-max` (default 64 KiB, cap 1 MiB), total timeout default 100 ms (cap 30 s), concurrency default 128 (cap 4096), 4 KiB response head, 64 MiB process-wide serialization budget |

| Admin APIs | Read: 4 KiB/32 header fields, 4 connections, 5 s deadlines, 1 MiB response. Write: 8 KiB/32 fields, 1 MiB body, ≤128 vhosts, ≤64 XML nesting, 4 connections, one candidate build, 5 s lock / 10 s wait |

| Active health probes | Intervals/timeouts 1 s–1 h, rise/fall 1–100, process-wide cap of 16 concurrent probes |

| FastCGI | 65,535-byte records; separately bounded PARAMS aggregate, response head, STDERR, body buffering, pool size and deadlines |

| ACME | 1–100 identifiers, ≤128 live challenges, 1 MiB snapshots and CA bodies, 120 s per attempt |

| OCSP | ≤128 identities, ≤4 concurrent fetches, 64 KiB responses, 7-day staple validity cap |

| OpenTelemetry | 2048 queued spans + one 256-span batch, 1 s interval, 2 s export timeout, 3 s shutdown bound |

| Loopback-only endpoints | `/__hj_cache_purge`, `/__hj_cache_ready` (raw loopback peer), metrics `:9090`, admin listeners |

Size workers, file limits, budgets, cache, PHP and timeouts together.

## Reload boundary (summary)

SIGHUP and the API replace app state without dropping requests. Boot-owned resources stay **restart-required**. See Admin API & reload .

## Reproducible checks

           **verify the tree** · what CI runs
```
cargo fmt --all -- --check
cargo check --locked -p httpjet --bin httpjet
cargo run --locked -p httpjet -- --root "$PWD/examples/litespeed" check --strict
cargo test --locked --workspace
```

Topic pages carry narrower acceptance commands. Tests use synthetic config and ephemeral loopback ports.
