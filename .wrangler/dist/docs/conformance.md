# Conformance & testing — httpjet Documentation

> Test results, protocol coverage, and parity checks.

- **Canonical URL:** https://httpjet.net/docs/conformance
- **Source Repository:** https://github.com/faratech/httpjet

---

# Conformance & testing

Judge httpjet on LiteSpeed compatibility plus wire conformance. Headline result: **146 / 146** h2spec 2.6.0 over TLS. Later sections reference this score, not repeat it.

## Conformance matrix

| Area | Standard / reference | Status | Notes |

| HTTP/1.1 | RFC 9110 · RFC 9111 · RFC 9112 | Strict framing, conditionals, ranges, `Vary`, 103. | Targets below. |

| HTTP/2 | RFC 9113 (native `hj-h2`) | Full TLS pass. Limit: see lede. | h2c 145/146, one exception. |

| HPACK | RFC 7541 | Zero-allocation codec. | Two fuzz targets. |

| HTTP/3 / QUIC | RFC 9114 over RFC 9000 (quinn-proto), QPACK RFC 9204 | aioquic + OTel fixtures in CI. | Migration disabled. |

| TLS | rustls + aws-lc-rs · RFC 8446 mandatory suite | SNI mirrors OLS; mTLS + CRLs. | Single-use tickets; 0-RTT off. |

| ACME | RFC 8555 §8.1 / §8.3 (Pebble v2.10.1 fixtures) | HTTP-01, DNS-01. | Behind `--features acme`. |

| OCSP | RFC 6960 with the lightweight-profile conventions (SHA-256 issuer identity, bounded fetch — not full client conformance) | Bounded fetch. | Behind `--features ocsp`. |

| PROXY protocol | v2 binary + v1 text | Per-listener, fail-closed. | Pre-TLS; loopback refused. |

| LSAPI | Native wire codec (vendored php-src `lsapidef.h`) | `lsphp` parity. | Header parser fuzzed. |

| FastCGI | FastCGI 1.0 (65,535-byte records, application record types) | Synthetic responder interop. | 65,535-byte records. |

| ETag | LiteSpeed `fileETag=28` | Byte-for-byte. | `" - - ;;;"` |

| `.htaccess` | Apache mod_rewrite / mod_access / mod_auth_basic / mod_headers / mod_expires subset | Common-core parity. | `Expires*`, `Header merge`, APR1 htpasswd. |

| OpenTelemetry | OTLP HTTP/protobuf, W3C traceparent (version 00) | Protobuf tests pass. | Behind `--features otel`. |

| LiteSpeed parity | Retired differential matrix vs LSWS 6.3.5 | 11 / 11 retained. | Production exercises continuously. |

Intake: origin-form; `*` OPTIONS-only; absolute-form authority replaces Host. CONNECT: 405. Authority-form, raw `#`, bare-LF: 400. HTTP/1.1 requires Host, h2-validated. Target: LSWS 6.3.5, same tree. LiteSpeed choices beat strict readings.

## LiteSpeed parity and the clean-room boundary

Differential testing hit 11/11 pre-retirement: ETag, `.html`→PHP, LSAPI encoding, rewrite flags. httpjet now serves the live tree as drop-in. Reference: GPL OpenLiteSpeed source, behavior only. Reimplemented from scratch. No OLS code copied. License: **GPL-3.0-only**. No paid edition, no key. Independent, not endorsed by LiteSpeed Technologies.

           **fileETag=28** · byte-for-byte
```
ETag: "4096-1718800000-1572934;;;"     # size-mtime-inode, three trailing semicolons — strict validators compare bytes
```

Suffix routing follows OLS order, including disclosure guard. Pool-less script handlers return 503. Never serve statically instead.

## Test layers

| Layer | What it covers | Run |

| unit | Pure logic per crate: config parsing, rewrite evaluation, HPACK, ETags, cache keys, ACME snapshots, OCSP profiles, FastCGI records. | `cargo test -p ` |

| integration | Crate boundaries: `.htaccess` engine (`redirect_repro`, `header_compat`), upstreams, cache races, pipeline e2e, H1 corpus (2,333 cases). | `cargo test --workspace` |

| live (`#[ignore]`) | Spawn `lsphp`, read real certificates, bind ports, QUIC round-trips, Pebble issuance. Run individually with their prerequisites; never as one batch. | `cargo test -- --ignored ` |

| scripts | Real-server fixtures on isolated loopback listeners: h2spec, ACME/OCSP/admin runtime tests, the cache gates, memo parity, OCI smoke. | see each page |

Last runs: 0.1.10 green (3,068 passed / 0 failed; 3,019 at 0.1.5; 2,028 at 0.0.5). Before flipping 0.1.11 defaults: 40 memo tests, purge-revocation pipeline test, 24 H1/H2 + 4 H3 arms recording real hits. Failures count as regressions. Flaky meta-assertions removed June 2026. Tests stay deterministic.

> [Diagram: verification-pyramid] Four-layer verification stack. Every change passes ~3,068 unit and integration tests, bounded corpus and ASan fuzz targets, protocol interoperability suites (h2spec, aioquic, Pebble ACME, OTel), and live loopback deploy gates before cutover.

**Production gates.** Deploys run cache gates (cross-URL/scheme/host, private, persistence), memo parity, capsule purge, h2spec. Failure classes: Page cache → deploy gates . Flow: Operations → deploy .

## CI and interoperability jobs

- **Ubuntu 24.04 x86_64**: fmt, builds, config validation, license/DCO, workspace tests, H1 replay.

- **Ubuntu 22.04 x86_64, 24.04 ARM64**: all-features compile, H1 replay, io_uring UDS test. Selected probes only, no kernel matrix.

- **Protocol interoperability**: OTel binary, h2spec 2.6.0 TLS (SHA-256 pinned, exact pass — see lede), WebSocket/H2 tracing, aioquic 1.3.0 venv test.

- **Dependency advisories**: daily RustSec failures, plus newer transport-critical crates (quinn, rustls, aws-lc-rs, tokio, httparse, io-uring, zstd, brotli, h2, hyper, http, mio, socket2, openssl, bcrypt, libc).

- **Weekly/manual fuzz**: eight targets, bounded time/size/memory/retention.

           **local reproduction**
```
cargo test --locked -p httpjet --test h1_corpus -- --nocapture
cargo build --locked -p httpjet --features otel --bin httpjet
python3 -B scripts/ci-h2spec.py --binary target/debug/httpjet --h2spec h2spec
cargo test --locked -p httpjet --features otel traced_fast_and_bridged_requests
cargo test --locked -p httpjet --features otel traced_quic_roundtrip -- --ignored
```

Hosted execution evidence is tracked separately from local runs; a runner label being available is not proof a job executed.

## Fuzzing

Eight `cargo-fuzz` targets share one invariant: never panic, never allocate unboundedly, agree with reference decoders. Targets: `h1_chunked_decode`, `h1_request_framing`, `hpack_decode`, `hpack_roundtrip`, `lsapi_resp_header`. Added 2026-10-06: `qpack_decode`, `proxy_protocol_parse`, `lscache_control`. ASan smokes (original five): 164,558 chunked, 739,373 framing, 452,899 HPACK-decode, 58,082 roundtrip, 438,582 LSAPI-header executions. No findings.

           **bounded fuzz**
```
FUZZ_TOOLCHAIN=nightly FUZZ_SECONDS=5 bash scripts/fuzz-bounded.sh h1_request_framing
python3 scripts/fuzz-seeds.py     # regenerate the shared seed corpus
```

## Production gates

See Test layers footer. Gates listed once there.
