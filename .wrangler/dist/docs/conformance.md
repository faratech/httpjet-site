# Conformance & testing — httpjet Documentation

> h2spec 146/146, RFC coverage, LiteSpeed parity, the test layers, CI interoperability jobs, fuzzing, and the deploy gates.

- **Canonical URL:** https://httpjet.net/docs/conformance
- **Source Repository:** https://github.com/faratech/httpjet

---

# Conformance & testing

Two axes define httpjet's posture: **LiteSpeed compatibility** on the same configuration tree (LSWS 6.3.5 target — XML model, LSAPI, ETags, LSCache protocol, `.htaccess`), and **standards conformance** on the wire. Where they agree there is one right answer; where LiteSpeed made a deliberate choice a strict reading would call optional, httpjet matches LiteSpeed. Everything is held in place by ~3,000 tests, h2spec, fuzzing, CI interoperability jobs and the production deploy gates.

## Conformance matrix

| Area | Standard / reference | Status |

| HTTP/1.1 | RFC 9110 · RFC 9111 · RFC 9112 | Strict framing, conditional requests, single + multipart ranges (RFC 9110 §14), `Vary`, 103 Early Hints (RFC 8297); RFC 9112 request-target forms enforced at intake (origin-form; `*` OPTIONS-only; absolute-form reduced with its authority replacing Host), 405 for CONNECT, 400 for authority-form/raw `#`/bare-LF lines, Host required on HTTP/1.1 and validated by the h2 authority rule |

| HTTP/2 | RFC 9113 (native `hj-h2`) | **146 / 146** h2spec 2.6.0 over TLS; h2c informative 145/146 (documented dual-protocol exception) |

| HPACK | RFC 7541 | Zero-allocation codec; two fuzz targets |

| HTTP/3 / QUIC | RFC 9114 over RFC 9000 (quinn-proto), QPACK RFC 9204 | aioquic transfer and OTel trace fixtures in CI; migration disabled |

| TLS | rustls + aws-lc-rs · RFC 8446 mandatory suite | SNI mirrors OpenLiteSpeed; mTLS with CRLs; single-use tickets, 0-RTT off |

| ACME | RFC 8555 §8.1 / §8.3 (Pebble v2.10.1 fixtures) | HTTP-01 and DNS-01 behind `--features acme` |

| OCSP | RFC 6960 with the lightweight-profile conventions (SHA-256 issuer identity, bounded fetch — not full client conformance) | Behind `--features ocsp` |

| PROXY protocol | v2 binary + v1 text | Per-listener, fail-closed, pre-TLS/pre-sniff; loopback claims refused |

| LSAPI | Native wire codec (vendored php-src `lsapidef.h`) | Parity with `lsphp`; fuzzed response-header parser |

| FastCGI | FastCGI 1.0 (65,535-byte records, application record types) | Synthetic responder interoperability |

| ETag | LiteSpeed `fileETag=28` | `" - - ;;;"`, byte-for-byte |

| `.htaccess` | Apache mod_rewrite / mod_access / mod_auth_basic / mod_headers / mod_expires subset | Directive and flag parity for the common core (including `Expires*`, `Header merge` and APR1/MD5-crypt htpasswd); `Header` boundary characterized by fixtures |

| OpenTelemetry | OTLP HTTP/protobuf, W3C traceparent (version 00) | Behind `--features otel`; decoded-protobuf tests |

| LiteSpeed parity | Retired differential matrix vs LSWS 6.3.5 | 11 / 11 on the retained behaviors; now exercised continuously by production |

## LiteSpeed parity and the clean-room boundary

Differential testing against a live LiteSpeed reached 11/11 on ETag format, `.html`→PHP dispatch, LSAPI encoding and rewrite-flag semantics before the apparatus was retired: httpjet *is* now the same-config drop-in serving the live tree. The authoritative reference for LiteSpeed's exact behavior was the GPL OpenLiteSpeed source, read to extract *behavior* and then reimplemented from scratch — no OpenLiteSpeed code was copied. httpjet itself is licensed **GPL-3.0-only**, with no paid edition or license key, and is independent of and not endorsed by LiteSpeed Technologies.

           **fileETag=28** · byte-for-byte
```
ETag: "4096-1718800000-1572934;;;"     # size-mtime-inode, three trailing semicolons — strict validators compare bytes
```

Suffix routing and the `.html`→PHP decision follow OpenLiteSpeed's order, including the source-disclosure guard: a script whose handler has no pool is a 503 and never falls through to static.

## Test layers

| Layer | What it covers | Run |

| unit | Pure logic per crate: config parsing, rewrite evaluation, HPACK, ETags, cache keys, ACME snapshots, OCSP profiles, FastCGI records. | `cargo test -p ` |

| integration | Crate boundaries: real `.htaccess` files through the engine (`redirect_repro`, `header_compat`), upstream groups on ephemeral ports, page-cache expiry/race tests, full-pipeline e2e and security regressions in the binary, the H1 corpus replay (2,333 seed/truncation/mutation cases). | `cargo test --workspace` |

| live (`#[ignore]`) | Spawn `lsphp`, read real certificates, bind ports, QUIC round-trips, Pebble issuance. Run individually with their prerequisites; never as one batch. | `cargo test -- --ignored ` |

| scripts | Real-server fixtures on isolated loopback listeners: h2spec, ACME/OCSP/admin runtime tests, the cache gates, memo parity, OCI smoke. | see each page |

The last full runs: the whole workspace suite green at the 0.1.10 release (3,068 passed / 0 failed; 3,019 at 0.1.5); 2,028 at 0.0.5. A failure is a regression, not "pre-existing." Timing-flaky meta-assertions were deleted in June 2026 so the concurrency tests are deterministic.

> [Diagram: verification-pyramid] Four-layer verification stack. Every change passes ~3,068 unit and integration tests, bounded corpus and ASan fuzz targets, protocol interoperability suites (h2spec 146/146, aioquic, Pebble ACME, OTel), and live loopback deploy gates before cutover.

## CI and interoperability jobs

- **Ubuntu 24.04 x86_64**: formatting, default and profiling builds, strict example-config validation, dependency-license and DCO checks, workspace tests, H1 corpus replay.

- **Ubuntu 22.04 x86_64 and Ubuntu 24.04 ARM64**: compile all features, replay H1, run the real io_uring UDS H1/H2 test — selected compatibility probes on GitHub-hosted runners, not a full kernel matrix.

- **Protocol interoperability**: an OTel-enabled binary, h2spec 2.6.0 over TLS against a fresh example configuration (archive SHA-256 pinned, exactly 146/146 required), H1 WebSocket / H2 dispatch tracing, and the aioquic 1.3.0 QUIC test in an isolated venv.

- **Dependency advisories**: a daily job fails on any RustSec finding and on a newer compatible transport-critical crate (quinn, rustls, aws-lc-rs, tokio, httparse, io-uring, zstd, brotli, h2, hyper, http, mio, socket2, openssl, bcrypt, libc).

- **Weekly/manual fuzz**: all eight parser targets with bounded time, input size, memory and artifact retention.

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

Eight `cargo-fuzz` targets share one invariant (never panic, never allocate unboundedly, agree with the reference decoder where one exists): `h1_chunked_decode`, `h1_request_framing`, `hpack_decode`, `hpack_roundtrip`, `lsapi_resp_header`, and — added in the 2026-10-06 review — `qpack_decode`, `proxy_protocol_parse` and `lscache_control`. Short ASan smoke runs of the original five covered 164,558 chunked, 739,373 framing, 452,899 HPACK-decode, 58,082 HPACK-roundtrip and 438,582 LSAPI-header executions without a finding.

           **bounded fuzz**
```
FUZZ_TOOLCHAIN=nightly FUZZ_SECONDS=5 bash scripts/fuzz-bounded.sh h1_request_framing
python3 scripts/fuzz-seeds.py     # regenerate the shared seed corpus
```

## Production gates

Beyond the suites, a deploy runs the cache-correctness gates (cross-URL, cross-scheme, cross-host, private tier, persistence), the fast-memo parity gate, the capsule purge gate and the h2spec gate. They are described with their failure classes on Page cache → deploy gates and Operations → deploy .
