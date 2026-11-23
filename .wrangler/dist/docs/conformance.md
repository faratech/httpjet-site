# Conformance & testing — httpjet Documentation

> Test results, protocol coverage, and parity checks.

- **Canonical URL:** https://httpjet.net/docs/conformance
- **Source Repository:** https://github.com/faratech/httpjet

---

# Conformance & testing

The table records implemented protocol surfaces and selected test evidence. In the historical TLS run, httpjet passed **146 / 146** h2spec 2.6.0 cases.

## Conformance matrix

| Area | Standard / reference | Status | Notes |

| HTTP/1.1 | RFC 9110 · RFC 9111 · RFC 9112 | Strict framing, conditionals, ranges, `Vary`, 103. | Targets below. |

| HTTP/2 | RFC 9113 (native `hj-h2`) | 146 / 146 h2spec cases in the historical TLS run. | h2c 145/146, one exception. |

| HPACK | RFC 7541 | Bounded dynamic table and header decoding. | Two fuzz targets. |

| HTTP/3 / QUIC | RFC 9114 over RFC 9000 (quinn-proto), QPACK RFC 9204 | Public source includes aioquic and telemetry fixtures. | Migration disabled. |

| TLS | rustls + aws-lc-rs · RFC 8446 mandatory suite | SNI mirrors OLS; mTLS + CRLs. | Single-use tickets; 0-RTT off. |

| ACME | RFC 8555 §8.1 / §8.3 (Pebble v2.10.1 fixtures) | HTTP-01, DNS-01. | Behind `--features acme`. |

| OCSP | RFC 6960 with the lightweight-profile conventions (SHA-256 issuer identity, bounded fetch — not full client conformance) | Bounded fetch. | Behind `--features ocsp`. |

| PROXY protocol | v2 binary + v1 text | Per-listener, fail-closed. | Pre-TLS. Relayed source addresses that claim loopback or unspecified are refused. |

| LSAPI | Native wire codec (vendored php-src `lsapidef.h`) | `lsphp` parity. | Header parser fuzzed. |

| FastCGI | FastCGI 1.0 (65,535-byte records, application record types) | Synthetic responder interop. | 65,535-byte records. |

| ETag | LiteSpeed `fileETag=28` | Byte-for-byte. | `" - - ;;;"` |

| `.htaccess` | Apache mod_rewrite / mod_access / mod_auth_basic / mod_headers / mod_expires subset | Common-core parity. | `Expires*`, `Header merge`, APR1 htpasswd. |

| OpenTelemetry | OTLP HTTP/protobuf, W3C traceparent (version 00) | Protobuf tests pass. | Behind `--features otel`. |

| LiteSpeed parity | Retired differential matrix vs LSWS 6.3.5 | 11 / 11 retained. | Historical differential results. |

Intake: origin-form; `*` OPTIONS-only; absolute-form authority replaces Host. CONNECT: 405. Authority-form, raw `#`, bare-LF: 400. HTTP/1.1 requires Host, h2-validated. For application compatibility, verify your own configuration using the migration checklist .

## LiteSpeed parity and the clean-room boundary

Differential testing hit 11/11 pre-retirement: ETag, `.html`→PHP, LSAPI encoding, rewrite flags. Those trials cover selected behaviors. Reference: GPL OpenLiteSpeed source, behavior only. Reimplemented from scratch. No OLS code copied. License: **GPL-3.0-only**. No paid edition, no key. Independent, not endorsed by LiteSpeed Technologies.

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

Historical run: v0.1.10 reported 3,068 passing workspace tests. For a new release, record the exact commit, commands and results you verify.

> [Diagram: verification-pyramid] Verification layers. Choose checks for the change and runtime you are qualifying. Release publication status separately records distribution coverage.

For a deployment, run the checks relevant to its enabled features. See the deployment workflow and the page-cache checks .

## CI and interoperability jobs

The public release includes workflows for installer, container and dependency checks. The commands below exercise the public protocol fixtures locally. An available fixture or workflow does not establish that release binaries passed it.

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

The v0.2.6-3 source ships 14 fuzz targets: `fastcgi_records`, `h1_chunked_decode`, `h1_request_framing`, `h2_frames`, `h3_control`, `h3_request_stream`, `hpack_decode`, `hpack_roundtrip`, `lsapi_packet_stream`, `lsapi_resp_header`, `lscache_control`, `pagecache_container`, `proxy_protocol_parse`, `qpack_decode`. Each target checks the invariants documented in the public fuzzing guide .

           **bounded fuzz**
```
FUZZ_TOOLCHAIN=nightly FUZZ_SECONDS=5 bash scripts/fuzz-bounded.sh h1_request_framing
python3 scripts/fuzz-seeds.py     # regenerate the shared seed corpus
```

## Production gates

Use the staged change workflow and record the checks that ran against your candidate.
