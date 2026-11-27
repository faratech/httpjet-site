# Architecture — httpjet Documentation

> See how the server fits together.

- **Canonical URL:** https://httpjet.net/docs/architecture
- **Source Repository:** https://github.com/faratech/httpjet

---

# Architecture

httpjet is a Cargo workspace with **one binary crate** and **nineteen `hj-*` library crates**. Over 3,300 test functions span the workspace (3,302 green at v0.2.8).

## Workspace shape

The dependency graph is acyclic, with several independent root crates including `hj-config`. `hj-core` is the small frozen seam for every handler. Two crates, `hj-acme` and `hj-ocsp`, link only behind build features. The binary is the only crate that sees everything. Transports, protocols, gateways and the cache evolve behind `hj-core`. Request-aware page-cache glue also lives in the binary.

           Browse workspace on GitHub ↗
           1 binary + 19 libraries
           Rust 1.100.0+ · edition 2024
           Acyclic crate dependencies
           3,302 tests at v0.2.8
           Vendored forks: monoio, monoio-rustls (real writev), dashmap, pprof

## Crate dependency graph

`hj-config` parses LiteSpeed XML into one normalized model. `hj-core` re-exports that model for crates using the shared handler contract.

> [Diagram: crate-map] Workspace relationships. Arrows show selected dependencies, not every edge. The binary assembles the server; optional certificate crates require build features. See the public source tree for the crate manifests.

## Crate map

| Crate | Role |

| hj-core | The frozen handler seam. Changing its types requires updating every dependent. |

| hj-config | LiteSpeed XML to one normalized model. Defaults fail closed. |

| hj-tls | One rustls config for TCP and QUIC. SNI uses no cert-name-match, like OLS. |

| hj-acme feature | HTTP-01 and DNS-01 issuance and renewal. Links only behind `acme`. |

| hj-ocsp feature | Bounded OCSP fetch and validation. Needs OpenSSL 3.x and the `ocsp` feature. |

| hj-http | Shared connection-tuning from ` `. It holds no transport. |

| hj-h2 | The native HTTP/2 server and HPACK codec. One task serves each connection. |

| hj-lsapi | LSAPI codec, pool and `lsphp` supervisor. The jail fails closed. |

| hj-fastcgi | FastCGI codec, pool and handler. Use only explicit `fcgi`/`fastcgi` processors. |

| hj-static | Static files with ranges and conditionals. Opens stay beneath the docroot. |

| hj-cache | Shared sharded byte-LRU primitive. Sizing comes from `CacheCaps`. |

| hj-pagecache | The origin page store. Request-aware glue lives in the binary. |

| hj-compress | gzip, brotli and zstd response encoding. Negotiation follows server priority. |

| hj-rewrite | mod_rewrite and `.htaccess` evaluation. Lookahead uses `fancy-regex` fallback. |

| hj-proxy | Reverse proxy, WebSocket and SSE relay. Upstreams use h1, `h2://` or `h2s://`. |

| hj-acl | ACLs, real-IP, throttle and geo rules. Geo resolves to CIDR sets at build. |

| hj-geo | Offline GeoIP and ASN sources. It makes no runtime fetches. |

| hj-log | Non-blocking access and error logging. The syslog tap is optional. |

| hj-extension | Compile-time handlers and transforms. The shipped registry is empty. |

| httpjet | The binary with transport and pipeline. It alone sees every crate. Path: see the note below this table. |

Path: transport lives in `crates/httpjet/src/uring/`. Path: pipeline lives in `crates/httpjet/src/pipeline/`. Path: cache glue lives in `crates/httpjet/src/lscache/`. Path: HTTP/2 lives in `crates/hj-h2/src/server/`. Path: rewrite lives in `crates/hj-rewrite/src/`. Path: LSAPI lives in `crates/hj-lsapi/src/`.

## Transport paths

The pure io_uring transport is the only serving transport. You get no runtime switch and no `URING=0` rollback build. One monoio runtime runs per listener fd. It pins to its core when workers equal CPU count. Use `--no-core-pinning` to disable pinning.

> [Diagram: transport] One transport, three protocols, one pipeline. Cheap work stays on the monoio core: the H1 codec, the native h2 task, the QUIC driver, and the on-core fast path (finished-response memo, static files, page-cache hits). Anything else crosses uring::bridge into the tokio runtime that owns ServerState, the LSAPI pool, the page cache and reload state, then returns to the monoio core for framing and writes. Bodies ≤ 256 KiB are buffered; larger ones stream on H1, H2 and H3 alike.

`--uring-ring coop` is the default since 2026-11-07. It measured +28% RPS and -27% CPU per cookieless H2 cache hit on x86. `legacy` uses flagless rings. `defer` measured ~-2% on the GCE guest. Ring size stays at the default. Ring memory is memlock-charged. Multishot accept is on by default. Use `--no-multishot-accept` for one SQE per connection. Bodies ≤ 256 KiB are buffered. Larger bodies stream on H1, H2 and H3.

## The frozen contract — hj-core

This is the seam that lets handlers compose without knowing the transport. Changing these signatures means updating every dependent, so they are treated as frozen:

            **hj-core** · the seam

```
enum Body { Empty, Full(Bytes), Stream(BoxBody), File(FileBody) }
type Request  = http::Request ;
type Response = http::Response ;

// every terminal handler (StaticFiles, Lsapi, FastCgi, ProxyHandler)
trait Handler { async fn handle(&self, &mut ReqCtx, Request) -> Result ; }

// every post-handler munger (promote → expires → sub_filter → compress → deny-CDN-cache → Alt-Svc)
trait ResponseTransform { async fn transform(&self, &ReqCtx, &mut Response); }
```

`FileBody` can pin an open inode across cache swaps. `ReqCtx` carries `server`/`vhost` and client state. It also carries `is_tls`, `protocol` and `trusted_proxy`. Its `env` vec holds rewrite `[E=]` sets and CGI overrides. `Router::resolve(listener, key)` maps SNI/Host to a vhost.

        i   Extending
Register new handlers in `pipeline/mod.rs::dispatch()`. Register new transforms in `state.rs::build_transforms`. Out-of-tree code uses the extension registry .

## The request pipeline

`pipeline::handle()` is the integration point. It resolves the vhost first. It then applies trust, ACL, geo and throttle checks. Optional extension pre-handlers can return a response or continue to `dispatch()`. Dispatch checks the context body limit and runs any configured WAF sidecar before rewrite or cache lookup. The request handler then applies response transforms. It finally writes logs, metrics and spans. `dispatch()` mirrors OpenLiteSpeed ordering. It inserts page-cache seams after rewrite and access resolve. The pinned `LsapiScript` extension keeps the resolved script separate. It pushes `SCRIPT_NAME`/`QUERY_STRING` into `ctx.env` for front controllers.

Terminals use an explicit `if/return` chain, not a uniform registry. A failed proxy context falls through to static. A script with no pool **hard-fails 503**. It must never fall through to source.

        !   Load-bearing detail
A rewrite to `index.php` keeps the original `REQUEST_URI`. The cache must key by that original URI. Never key by the rewrite-resolved path.

Cache seams stay inert without `--page-cache`. `lscache::cache_lookup` runs before any backend. `lscache::cache_store` runs after `finalize_response`.

## Module organization

See the Path note under Crate map .

## Configuration generations

Live state publishes as immutable *generations* behind an `ArcSwap`. A SIGHUP or API transaction builds a complete candidate first. It validates the candidate before publishing. In-flight requests finish on their pinned generation.

> [Diagram: generations] Candidate → published → retired. A rejected candidate never touches the serving generation. Trust changes (TLS material, mTLS policy, PROXY protocol) retire the old listener group and drain its connections under their pinned policy; boot-owned resources (listener topology, PHP pools, cache stores, privileges) are restart_required.

The full ownership inventory and the transactional replacement sequence are on Admin API & reload .

## Code conventions

- **Formatting:** rustfmt-clean (default settings, edition 2024); `cargo fmt --all --check` is a CI gate.

- **Errors:** `thiserror` types at system boundaries; internal invariant violations panic with a message rather than pretending to recover.

- **unsafe:** Keep `unsafe` rare and never in HPACK. Document the safety invariant above each block.

- **Async:** tokio tasks for independent work, `FuturesUnordered` for multiplexing with coordinated shutdown, no per-stream spawn on hot paths.

- **Hashing:** Use `rustc-hash` only for trusted or hard-capped keys. The `.htaccess` memo caps at 16 shards × 512 entries, keys ≤ 1 KiB. Untrusted unbounded maps keep SipHash.

- **Allocator:** Use mimalloc globally with threshold-gated trim (`--mimalloc-trim-*`). Production sets `MIMALLOC_PURGE_DELAY=0`, so you pool transient buffers in `hj_core::recycle`.

> [Diagram: recycle-pools] Buffer and task recycling. Under MIMALLOC_PURGE_DELAY=0, unpooled transient allocations in sparse size classes can incur minor page faults when reused. hj_core::recycle pools H2 stream futures, bridge futures, tiered body buffers (frozen into ref-counted Bytes via Bytes::from_owner and returned when the last slice drops), LSAPI read/BEGIN buffers, and per-core 64 KiB TLS record buffers.
