# Capabilities & limits — httpjet Documentation

> What httpjet supports today, what is optional behind build features, what is deliberately unsupported, and the fixed operational bounds.

- **Canonical URL:** https://httpjet.net/docs/capabilities
- **Source Repository:** https://github.com/faratech/httpjet

---

# Capabilities & limits

What the current source tree does, what it does only behind a build feature, what is a tested subset, and what is deliberately unsupported. **Supported** means an implemented, tested code path — not directive-for-directive parity with LiteSpeed, NGINX, Apache or Caddy. Optional features stay off unless explicitly enabled at build *and* at runtime.

        supported  implemented + tested
        optional  build feature + runtime opt-in
        partial  tested subset — review the boundary
        unsupported  deliberate, documented

## Capability matrix

| Area | Status | Scope and important limits |

| HTTP/1.1 | supported | Keep-alive, pipelining, chunked bodies; strict framing; configured header/URL/body/timeout/request-count limits; 103 Early Hints; single + multipart ranges; `CONNECT` answered 405. → |

| HTTP/2 | supported | Native TLS h2 and h2c prior knowledge; flow-controlled buffered, file and streaming responses; h2spec 146/146. No server push; no `Upgrade: h2c`. → |

| HTTP/3 | supported | QUIC over UDP through the same pipeline; TCP *and* UDP HTTPS ports must both be published. Connection migration disabled. → |

| TLS | supported | rustls (aws-lc-rs) TLS 1.2/1.3, SNI, ALPN, dual ECDSA+RSA chains, certificate reload, optional/required client certificates, CRLs. → |

| Automatic certificates | optional | HTTP-01 and DNS-01 behind `--features acme` + CLI opt-in. One managed account/identifier set per process; DNS-01 needs an operator-supplied webhook controller. → |

| OCSP stapling | optional | `--features ocsp`, OpenSSL 3.x, an explicit responder that covers every issuer. Not for CAs that retired OCSP (Let's Encrypt). → |

| kTLS / sendfile | partial | Plain-TCP H1 file bodies use `sendfile(2)` always; a `--features ktls` build adds TLS 1.3 H1 sendfile only when `--ktls=auto` finds a physical NIC with active `tls-hw-tx-offload`. H2/H3/UDS/TLS 1.2 keep userspace paths. → |

| Virtual hosts | supported | Listener + exact Host/SNI maps, OLS wildcard domain patterns (`*.example.test` and `example.*` with exact > longest-match precedence), and a bare `*` fallback. |

| Static content | supported | Conditional requests, LiteSpeed ETags, ranges, in-memory small-file promotion, precompressed `.br`/`.gz` siblings, traversal-safe opens. → |

| Reverse proxy | supported | HTTP/1 upstreams plus explicit `h2://`/`h2s://`; request/response streaming, SSE; upstream mTLS. → |

| WebSocket | partial | HTTP/1 upgrade and raw relay. Relay does not support TLS, H2 or Unix-socket upstreams. → |

| Upstream groups | supported | Primary-first, smooth weighted round-robin, weighted least-active, passive breaker, optional connect/GET/HEAD probes. No automatic replay of unsafe requests. → |

| PHP / LSAPI | supported | Native LSAPI; owned pool or separately supervised external pool with generation tracking and candidate-first reload. → |

| FastCGI | supported opt-in | Explicit `fcgi`/`fastcgi` processor + suffix routing over TCP or Unix sockets; the app is externally supervised; bodies buffered. → |

| CGI execution, uWSGI | unsupported | Design contracts exist; nothing is routable. A `cgi` handler without an explicit FastCGI processor fails closed (never serves source). → |

| Rewrites & `.htaccess` | partial | Common rewrite, access, auth, header (`set`/`append`/`add`/`merge`/`unset`/`setifempty`), expiry (`ExpiresActive`/`ExpiresDefault`/`ExpiresByType`), cache and env directives. `Header edit` and `RequestHeader` are ignored. Run `check --strict`. → |

| Compression | supported | Dynamic gzip/brotli/zstd + precompressed siblings. Gzip *request* decoding on by default; brotli/zstd request decoding opt-in and bounded. → |

| Origin page cache | supported opt-in | Public/private tiers, vary (including per-URL cookie vary), purge tags, stale policies, single flight, admission, RAM/file tiers, dictionaries, restart scan, generation-scoped keys. A first-class route-level *microcache policy* is specified, not implemented. → |

| Access controls | supported | Peer ACLs, trusted-proxy client IP, GeoIP/ASN CIDR rules, per-IP rate limit, body limits, Basic auth (bcrypt, APR1 `$apr1$`, MD5-crypt `$1$` and `{SHA}` htpasswd in constant time; bcrypt cost capped at 14, files confined to the docroot). → |

| WAF | external opt-in | Bounded request-inspection sidecar over Unix socket (peer-UID verified) or loopback TCP, fail-closed by default. No embedded ModSecurity/CRS engine. → |

| Logs and metrics | supported | Combined or JSON access logs, text or JSON error logs with redaction, syslog tap, Prometheus text metrics, request ids, telemetry TSV, PHP slow log. → |

| OpenTelemetry | optional | OTLP traces and metrics behind `--features otel` + `HTTPJET_OTEL=1`. Bounded queues; no payload export. → |

| Runtime APIs | opt-in | Loopback read-only status API; separately authenticated transactional config API. Boot-owned resources stay restart-required. → |

| Extensions | compile-time only | Trusted Rust crates register read-only pre-handlers and response transforms. No dynamic ABI, no in-process sandbox. → |

| Deployment | examples | Generic systemd units (socket activation, boot gate, PHP pool) and a hardened OCI example that still needs an io_uring-permitting runtime. → |

## Deliberately unsupported or deferred

- **Generic CGI process execution and uWSGI** are not routable; their fail-closed design gates are documented. FastCGI, LSAPI or HTTP proxying cover application paths.

- **HTTP/2 server push** is not implemented — use `Link` preload plus 103 Early Hints.

- **HTTP trailers** (inbound h2/h3 trailing HEADERS, chunked trailers) are discarded and not forwarded through gateways. LSAPI has no trailer concept.

- **h2c is prior-knowledge only**; the HTTP/1.1 `Upgrade: h2c` handshake was removed by RFC 9113 and is not implemented.

- **QUIC connection migration** is disabled: listener steering does not yet preserve connection ownership across an address change.

- **No epoll/tokio transport fallback**, no Windows/macOS. Linux io_uring is mandatory.

- **No native dynamic-module ABI.** Untrusted inspection belongs behind the bounded sidecar contract.

- **LiteSpeed anti-abuse elements** (`lsrecaptcha`, `censorshipControl`, permission masks, `cgiRlimit`) are parsed and warned about, never enforced.

- **Legacy crypt and plaintext htpasswd schemes** (traditional DES, `$5$`/`$6$` `crypt()`, and plaintext entries) verify *false* with a parse-time warning — use bcrypt (`htpasswd -B`), APR1 (`$apr1$`), MD5-crypt (`$1$`) or `{SHA}`.

- **Cross-node cache peers** (`--cache-peer`, peer fill/purge fan-out) were removed in August 2026; the loopback purge and readiness endpoints remain.

- **Multipath QUIC** was assessed and deferred (June 2026).

## Build-time feature gates

The default binary includes the serving engine, LSAPI, FastCGI, proxy, cache, logging, metrics, the WAF sidecar client and an empty extension registry. These features add dependencies and require an explicit build — and still nothing happens until the matching runtime switch is set:

| Cargo feature | Adds | Runtime opt-in |

| `acme` | `hj-acme`: HTTP-01 / DNS-01 issuance and renewal | `--acme-directory … --acme-domains … --acme-store … --acme-accept-terms` |

| `ocsp` | `hj-ocsp`: fetch, validate, staple (OpenSSL 3.x) | `--ocsp-responder URL` (+ `--ocsp-required`) |

| `otel` | OTLP HTTP/protobuf tracing and metrics exporters | `HTTPJET_OTEL=1` (+ `HTTPJET_OTEL_METRICS=1`) |

| `profiling` | Loopback pprof CPU profile endpoint | `--profile-token` policy; loopback only regardless |

| `ktls` | Kernel TLS on the io_uring TLS path | `--ktls=auto|on|off`; `auto` requires a physical NIC with `tls-hw-tx-offload` |

| `allocount` | Allocation-measurement harness | Diagnostic builds only |

## Operational bounds

Request limits come from the LiteSpeed ` ` block and per-context overrides; inspect the effective values with `check --strict` and `serve --help`. Fixed or separately configured bounds worth knowing:

| Bound | Value |

| Page-cache single object | 100 MiB — larger responses serve uncached |

| Page-cache budgets | Independent index (`--page-cache-mem`), file tier (`--page-cache-disk-mem`), hot tier (`--page-cache-hot-mem`), object TTL and stale-window caps; persistent files need an integrity key (`--page-cache-integrity-key`; loaded through a private-file validator — single link, owner root or the serving uid, no group/other bits — with `--page-cache-integrity-required` to refuse booting the file tier without one) |

| Bridge buffering | Bodies ≤ 256 KiB buffered, larger streamed (H1/H2/H3) |

| Request body budget | Process-wide byte budget with leases; usage, capacity and rejections exported as `httpjet_body_buffer_*` |

| Request decompression | 16 MiB decoded ceiling; 17 MiB codec workspace reservation for br/zstd; zstd window ≤ 2 24 |

| Multipart ranges | 8 ranges / 8 MiB of part bytes, else a full 200 |

| `.htaccess` chain depth | 64 directories, then a deny-all sentinel |

| sub_filter buffering | 4 MiB default (`subFilterMaxBody`); beyond it the stream passes through raw |

| WAF sidecar | Body ≤ 1 MiB inspected (`--waf-body-max`), total timeout ≤ 30 s, concurrency ≤ 4096, 4 KiB response head, 64 MiB process-wide serialization budget |

| Admin APIs | Read: 4 KiB/32 header fields, 4 connections, 5 s deadlines, 1 MiB response. Write: 8 KiB/32 fields, 1 MiB body, ≤128 vhosts, ≤64 XML nesting, 4 connections, one candidate build, 5 s lock / 10 s wait |

| Active health probes | Intervals/timeouts 1 s–1 h, rise/fall 1–100, process-wide cap of 16 concurrent probes |

| FastCGI | 65,535-byte records; separately bounded PARAMS aggregate, response head, STDERR, body buffering, pool size and deadlines |

| ACME | 1–100 identifiers, ≤128 live challenges, 1 MiB snapshots and CA bodies, 120 s per attempt |

| OCSP | ≤128 identities, ≤4 concurrent fetches, 64 KiB responses, 7-day staple validity cap |

| OpenTelemetry | 2048 queued spans + one 256-span batch, 1 s interval, 2 s export timeout, 3 s shutdown bound |

| Loopback-only endpoints | `/__hj_cache_purge`, `/__hj_cache_ready` (raw loopback peer), metrics `:9090`, admin listeners |

Defaults are starting points, not sizing recommendations. Worker count, open-file limit, body budget, cache caps, PHP/backend concurrency and health/WAF timeouts must be sized together for the deployment.

## Reload boundary (summary)

SIGHUP and the transactional API replace application state without dropping in-flight requests: vhost maps, rewrites, document roots, contexts, reloadable request settings, TLS material on an unchanged listener topology, and the trust policy of an already-enabled QUIC endpoint. Listener addresses/roles, QUIC enablement, Unix-listener topology, PHP topology, cache-store identity, process user/namespace policy and other boot-owned resources are **restart-required**; the write API says so instead of partially applying. Details: Admin API & reload .

## Reproducible checks

           **verify the tree** · what CI runs
```
cargo fmt --all -- --check
cargo check --locked -p httpjet --bin httpjet
cargo run --locked -p httpjet -- --root "$PWD/examples/litespeed" check --strict
cargo test --locked --workspace
```

Protocol, cache, ACME, OCSP, OTel, FastCGI, WAF, admin and OCI pages carry their narrower acceptance commands. Every test uses synthetic configuration, temporary files and ephemeral loopback ports.
