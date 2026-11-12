# Performance — httpjet Documentation

> Measured speed and how it was measured.

- **Canonical URL:** https://httpjet.net/docs/performance
- **Source Repository:** https://github.com/faratech/httpjet

---

# Performance

httpjet is fast — and these docs are strict about *where* the time goes. Every figure names its regime, because a **loopback benchmark** (synthetic, on-box, PGO build) is not the same thing as **production telemetry** (real CDN-fronted traffic). The short version: on a Cloudflare-fronted PHP site, almost all wall time is PHP, and httpjet's own CPU is a rounding error.

        1,258 k rps   h2 static empty, c=50, dedicated load-generator VM, median of 3 (0.2.0, 2026-11-11)
        44.8 k rps   PHP/LSAPI over HTTP/1.1, PGO loopback
        40 ×   cache hit vs the same page through PHP
        0.2 %   httpjet's request phases, June 2026 production telemetry
        1.55 IPC   h2 hit path at saturation, June 2026 (hardware counters)
        0.0002 flt   v0.1.5 h2 static minor page faults/req
        0 / 80   metric rows worse, 0.1.10 vs 0.1.5 (controlled A/B)
        +27.6 %   h2 page-cache hit RPS, 0.1.11 defaults (coop ring + response memo, x86 ABBA)

## Read the regime, not just the number

           loopback benchmark · synthetic, on-box, PGO
           production telemetry · real CF-fronted traffic
           hardware counters · perf at saturation

Loopback removes network, handshakes, CDN. It isolates server code for comparison only. **No loopback figure here is a production number.** Telemetry measures user time instead: backend- and edge-dominated. Same server: ~908k req/s synthetic, ~0.2% of June 2026 user latency. Different questions.

## Performance across builds — interactive presentation

You find every campaign below with regime, commit, and receipt name. The curve covers Phase 1–7 (`0.0.1`, June 2026) through `0.2.2`. CSV receipts stay outside the public export at github.com/faratech/httpjet .

Compare v0.0.1–v0.2.2 in the **Release Speed Curve**. Every release was re-measured on 2026-11-12 under identical conditions on a dedicated lab VM — no production host was loaded. Per-round data: release-sweep-2026-11-12.tsv ; raw `h2load` logs, server logs and the bench driver: release-sweep-2026-11-12/ . (Earlier sweeps stay archived: 2026-11-11 and 2026-10-26 .) Then step through **19 build slides**, **Workload Trajectories**, **Build-vs-Build Diff**.

        ⎁   One test, every version
To keep this page simple, every version-to-version number comes from **one run under one set of conditions**: a dedicated lab VM (c4-highmem-8, the production machine type), loopback only, server pinned to 4 cores, `h2load` on the other 4, each release PGO-built from its tag the same way, same flags, same eight workloads, 3 rounds each, median shown. Before benching, every binary also had to pass the **same functional checks** (start, static file, `.htaccess` page, PHP page, cache hit, empty and 64 KiB files, config lint): lab-checks-2026-11-08.tsv . Numbers from *other* regimes — the dedicated-client server comparison, production telemetry, the dated build-history slides — are always labelled with their own conditions and are never mixed into the curve.

## Where the time actually goes

> [Benchmark Chart: attribution — Where a production request spends its time (live sample · 2026-08-30 · mean request 9.99 ms)]

        ⎁   Measured
Across millions of production requests, the `lsphp` render is **86.5–98.8% of request wall time**. In the June 2026 telemetry httpjet's own request phases were about **0.2%** — roughly **138 µs per request** (rewrite, cache lookup, compression); a synthetic cache hit costs ~38 µs of CPU including TLS, HTTP/2, rewrite, cache lookup and access logging. The 2026-08-30 sample: mean request 9.99 ms, 8.96 ms of it LSAPI TTFB, rewrite 5.4 µs, cache lookup 3.2 µs; pool acquire p99.9  production telemetry · --telemetry-file + --php-slow-log

Halving httpjet CPU shaves ~0.1% off latency here. Cache hits remove ~99% instead. Investment follows that asymmetry: cache, PHP/opcache, cacheable fraction.

**At the instruction floor.** Saturated h2 hits show **IPC 1.55**, **0.31% branch-miss**, **1.6 L1d misses per 100 instructions**. Instructions per request bottleneck, not locality. Futex (~85% of syscall time) was idle parking, not contention. Box sat ~50% idle at ceiling.

Responses: global **mimalloc**, **on-core fast path** plus memo. October 2026 campaign (`0.0.9`–`0.1.5`): skip double lookup for 404/PHP GETs (−14.5% cookied CPU); memoize `.htaccess` matches (`access_decision_for_request` 13% → 2.7%); `--trusted-proxy-idle-secs 1800` (handshakes −30% x86, −78% ARM); `--page-cache-dict-level` (ARM encode ~50% → 11%); pool buffers via `hj_core::recycle::BODY_BUFS` under `MIMALLOC_PURGE_DELAY=0`.

## Loopback throughput

August 2026 **three-way** (httpjet/OpenLiteSpeed/nginx): dedicated client, 2026-08-27, two interleaved pairs per cell, busy host. Heavy-`.htaccess`: loopback PGO, 2026-08-28. June PGO stays PHP-path reference (commercial-LiteSpeed baseline).

> [Benchmark Chart: h2-static — HTTP/2 static throughput by concurrency (dedicated load-generator client · 2026-08-27 · empty bodies · mean of 2 interleaved pairs · req/s)]

One h2 connection hits ~58k req/s at c=1 alone. Throughput keeps rising with concurrency. It never collapses here. The June collapse past c=50 reflected that build only. HTTP/1.1 empty bodies reach ~202k at c=1000. OpenLiteSpeed reaches ~183k there.

> [Benchmark Chart: heavy-rewrite — Heavy .htaccess static (806-line chain, /robots.txt) (PGO three-way · 2026-08-28 · c=100 · req/s)]

> [Benchmark Chart: memo-ab — Fast-path memo, same binary A/B (forum chain · /robots.txt · c=100 · req/s)]

> [Benchmark Chart: php-h1 — PHP over LSAPI, HTTP/1.1 (loopback · PGO build · 2026-06 · req/s)]

## Release 0.1.10: controlled A/B against 0.1.5

The `0.1.10` release (October 26, 2026) closed the five-round review. It found **23 issues, fixed 22, and closed 1 by decision**. The full workspace suite (3,068 tests) stayed green. Both builds ran back to back here. Each used its production flags. The run covered **16 workloads, 5 blocks, in both run orders**. Result: **0 of 80 metric rows were worse**. Every figure below shows relative A/B change only.

| Workload | Throughput | p50 | p99 | CPU / request | RSS |

| Page-cache miss → store | **+16%** | −8% | −9% | **−61%** | −10% |

| Warmer burst (fresh TLS connections) | +1% | −2% | −4% | **−38%** | −8% |

| Open-loop realistic mix (fixed offered rate) | fixed rate | +2% | **−29%** | −17% | – |

| Uncached PHP | +6% | −5% | −6% | −6% | −8% |

| Cookied page-cache serve | +1% | −1% | −3% | −6% | −8% |

| Beacon POST to PHP | +3% | −5% | +4% | −5% | −8% |

| h2 cache hits | +2% | +1% | +20% (noisy metric) | −3% | −8% |

| Static 1 KiB / 64 KiB, heavy `.htaccess`, h1 and h2 | −4% to +1% | −2% to +1% | −2% to +11% | +0.8% to +1.8% (within noise) | −8% to −9% |

| New TLS 1.2 / 1.3 connections | same | same | same | same | −9% |

        ⎁   Honest caveats
Static-file CPU per request is up 1–2%, which is within the measurement noise. The h2 cache-hit p99 row (+20%) is a high-variance metric on a loop that finishes in a couple of milliseconds. The largest page-cache miss and warmer gains come mostly from the egress-at-rest work that shipped in `0.1.7`, which `0.1.5` predates.

Vs `0.1.9` alone, CPU/request: PHP **−4.7%**, beacon **−4.3%**, cookied serves **−4.2%**, h2 hits **−1.8%**. HPACK encode **4.73 µs → 1.34 µs** (Huffman + memo). Cookie `SetEnvIf` **29 µs → 1 µs** (linear lookahead).

Also fixes sandbox 404s: `RestrictSUIDSGID=yes` makes `openat2` return `ENOSYS`. No-follow walk now resolves docroots. Transient unit: `0.1.9` 404, `0.1.10` 200.

## Release 0.1.11: two defaults flipped on

`0.1.11` (November 7, 2026) defaults two optimizations on: `coop` ring (`--uring-ring coop`; `legacy`/`defer` selectable) and response memo for public hits (off: `--no-page-cache-response-memo`; old opt-in still parses). ARM already ran both. x86 ran neither.

Alt-port ABBA, x86, one build, flags on/off, both orders, dominant production shape:

| Workload | Throughput | p50 | p99 | CPU / request | RSS |

| Cookieless H2 page-cache hits | **+27.6%** | **−36%** | **−32%** | **−26.7%** | +~2 MB |

| Cookied page-cache hits | – | – | – | −4.4% | – |

| Static 1 KiB | neutral (within noise) |

        ⎁   Honest caveats
~908k h2 static figure unchanged. aarch64 `coop` alone neutral vs `legacy`. Memo retains cookieless public GETs only, exact freshness/Age/purge fences. Gates pre-flip: 40 memo tests, purge-revocation test, 24 H1/H2 + 4 H3 real-hit arms.

Also removes Beeper/eBPF experiment code. Adopts ARM canary for voidrune. Clears H1/H3 panic-ratchet sites. Packaging fixes (musl, H3 stack, Gentoo `DIGESTS`) change no serving behavior.

Memo alone, instructions/request, frozen non-PGO binary, SINGULARITY loopback, 1 KiB hits, 500k/arm, off/on/on/off:

| Protocol | Memo off (instr/req) | Memo on (instr/req) | Change |

| H1 plaintext | 60,337 | 30,811 | **−48.9%** |

| H1 TLS | 72,720 | 40,561 | **−44.2%** |

| H2 plaintext | 65,975 | 36,621 | **−44.5%** |

| H2 TLS | 72,742 | 41,532 | **−42.9%** |

| H3 | 98,293 | 68,024 | **−30.8%** |

Instructions show less native cache-hit work here. They count user-mode PMU over warmup plus measurement. They show no whole-machine CPU saving. Throughput and tails mixed under compiler load. The shipped claim therefore rests on the x86 ABBA. Source: `docs/pagecache-response-memo-experiment.md` in the source tree.

## Release 0.2.1 / 0.2.2: admission fix, second review pass

`0.2.1` (2026-11-12) sized the page-cache store-admission filter so a never-requested URL reads zero — `--page-cache-admit-threshold 2` had decayed into storing every cacheable response — kept LSAPI length-prefix guards in release builds, and added fuzz targets. `0.2.2` (2026-11-12) closed a QUIC flood-guard bypass (a second datagram re-servicing the handshake slot), re-parses access files on ctime/size/inode change, asks proxied upstreams for identity under subFilter, drops refused ACME orders, and cuts the admission filter's false positives. Neither release shipped hot-path work, and the lab shows it: 0.2.1 vs 0.2.0 and 0.2.2 vs 0.2.1 are flat within round spread on every workload.

Lab VM, 2026-11-12 (loopback, server on 4 cores, loadgen on 4, every release PGO-built from its tag, 3 rotated rounds, median; all thirteen releases re-measured in this one run). The version comparisons: 0.2.0 → 0.2.1, H2 1 KiB **699.3k → 669.1k**, heavy `.htaccess` H2 **518.9k → 545.7k**, page-cache hit **604.2k → 540.9k**, PHP/LSAPI **32.3k → 32.6k**; 0.2.1 → 0.2.2, H2 1 KiB **669.1k → 665.6k**, heavy H2 **545.7k → 537.8k**, page-cache **540.9k → 542.4k**, PHP **32.6k → 32.5k**. In the same lab nginx reached 185k (H2 1 KiB) against httpjet 0.2.2's 728k three-way cell (639.7k median sweep cell; the three-way cell is noisier).

> [Benchmark Chart: lab-threeway — Lab three-way, same-host loopback (httpjet vs nginx vs OpenLiteSpeed) (dedicated lab VM c4-highmem-8 · server cores 0-3 / loadgen cores 4-7 · h2load c=32 x10 (64 KiB: n=20k) · median of 3 rounds · 2026-11-12 · req/s)]

## Release 0.2.0: security audit fixes and cold-start latency

`0.2.0` (November 11, 2026) is the result of a security and robustness review of everything added since 0.1.10. It fixes 20+ issues, each with a regression test, and changes one startup behaviour you can measure: the `.htaccess` chain is parsed once, before the first connection, and its rewrite prefilter is built off the request path. Before, every serving thread parsed the same 900-line file after each restart, reload or edit, and requests stalled for the parse (about 0.5 s of CPU).

- **Cold start:** slowest request of a 64-way burst right after boot **508 ms → 3 ms**; `httpjet check --strict` on the production config **1.5 s → 0.07 s**. Gate: `scripts/cold_start_latency_test.sh`.

- **Security and correctness:** upstream WebSocket handshake validation; no credentials in capsule revalidation; every gzip member of a backend response decoded; out-of-order LSAPI packets refused; control characters escaped in the text error log; a QUIC Initial that closes itself no longer leaves a connection behind for 60 s; shared cache bodies no longer drain the server-wide HTTP/3 body budget; listener CPU steering only where the NIC has a receive queue per worker.

- **Observability:** `httpjet_h2_conn_ends_total{reason}`, `httpjet_pagecache_ghost_hits_total`, `httpjet_htaccess_parses_total`.

- **Verification:** 3,171 workspace tests, h2spec 146/146 over TLS, memo parity 192 cells with zero diffs, HPACK and HTTP/1 fuzzers clean for 14 million runs. No flags change; the wire is unchanged.

Same-host loopback on the production x86_64 host (PGO, 8 cores, live traffic shared), 2026-11-11, standard suites. nginx 1.30 and OpenLiteSpeed ran the same docroot on alternate ports:

| Workload (c50 unless noted) | httpjet 0.2.0 | nginx | OpenLiteSpeed |

| HTTP/2 static 1 KiB | **423,164 req/s** | 153,485 req/s | 356,373 req/s |

| HTTP/1.1 static 1 KiB | 172,387 req/s | 110,481 req/s | **176,827 req/s** |

| HTTP/2 static 64 KiB | **60,314 req/s** | 28,667 req/s | — |

| Heavy `.htaccess` vhost, HTTP/2 (c100) | **310,055 req/s** | 155,196 req/s | 263,947 req/s |

| Heavy `.htaccess` vhost, HTTP/1.1 (c100) | 146,047 req/s | 118,156 req/s | **180,919 req/s** |

| Warm page-cache hit, HTTP/2 (c32/m32) | **123,591 req/s** | — | — |

| Warm page-cache hit, HTTP/1.1 (c100) | **90,566 req/s** | — | — |

Dedicated load-generator VM (c4-highcpu-8, same zone) against the production host over the private network, 2026-11-11, production traffic live, median of 3 passes with the server order rotated. The VPC firewall admits only specific ports, so the three servers ran one at a time on one allowed port:

> [Benchmark Chart: dedicated-0200 — Dedicated load-generator client, three-way (httpjet 0.2.0) (c4-highcpu-8 client VM, same zone · servers on the production host's private IP, one at a time · h2load c=50 x100, 1M requests/cell · median of 3 rotated passes · 2026-11-11 · req/s)]

`wrk` cross-check (H1, 1 KiB, c=100, 15 s): httpjet **571,500**, nginx 430,111, OpenLiteSpeed 377,631 req/s. The 0.1.12 run of the same procedure (2026-11-08: 1,183k and 1,097k on HTTP/2 empty and 1 KiB) is in the section below; the 0.2.0 cells sit within about +6% and +13% of it, inside this setup's run-to-run spread.

Lab VM, 2026-11-11 (loopback, server on 4 cores, loadgen on 4, every release PGO-built from its tag, 3 rotated rounds, median). Use it to compare httpjet releases against each other: 0.2.0 vs 0.1.12 measured in the same run, H2 1 KiB **591.8k → 625.5k**, H1 1 KiB **273.3k → 311.2k**, heavy `.htaccess` H2 **402.9k → 515.3k**, PHP/LSAPI **27.8k → 32.3k**, page-cache hit **410.5k → 544.5k**, H2 empty **563.1k → 717.2k**; H2 64 KiB is flat (92.4k → 89.7k). Raw logs and the per-round TSV: release-sweep-2026-11-11/ . In the same lab nginx reached 196k (H2 1 KiB) against httpjet 0.2.0's 656k.

> [Benchmark Chart: lab-threeway — Lab three-way, same-host loopback (httpjet vs nginx vs OpenLiteSpeed) (dedicated lab VM c4-highmem-8 · server cores 0-3 / loadgen cores 4-7 · h2load c=32 x10 (64 KiB: n=20k) · median of 3 rounds · 2026-11-12 · req/s)]

        ⎁   Honest caveats
The production-host rows share a machine with live traffic, and the same servers swing ±10–20% between runs there: nginx's H2 1 KiB moved from 180,940 (2026-11-08) to 153,485 (this run) with no change on its side. Read them as the shape of the comparison, not as a precise delta against 0.1.12. The lab table, where both builds ran back to back on an idle VM, is the version-to-version comparison. The 0.1.12 dedicated load-generator table below was not re-run for 0.2.0 and still describes 0.1.12. The cache rows used a non-forum `/help/` page through the real origin cache (metrics endpoint not verified in this run; each page was primed and confirmed as `x-litespeed-cache: hit`). Raw CSVs for this run are on the benchmark page .

## Release 0.1.12: hot-path allocation and contention reductions

`0.1.12` (November 8, 2026) cuts hot-path allocation/contention: borrowed routing (`Router::resolve_ref`), single-pass header scan, HPACK name reuse, batched IDs, cached dates, sharded counters, diskstore/metablob refinements, lighter logging. No flags change. Wire unchanged. Parity gate: 192 cells, zero diffs.

Loopback, production x86_64 host, PGO, 8 cores, live traffic shared, 2026-11-08, standard suites:

| Workload (c50 unless noted) | httpjet 0.1.12 | nginx | OpenLiteSpeed |

| HTTP/2 static 1 KiB | **371,540 req/s** | 180,940 req/s | 399,505 req/s |

| HTTP/1.1 static 1 KiB | **195,446 req/s** | 117,979 req/s | 201,306 req/s |

| HTTP/2 static 64 KiB | **68,689 req/s** | 35,063 req/s | — |

| Heavy `.htaccess` vhost, HTTP/2 (c100) | **271,118 req/s** | 131,955 req/s | 333,519 req/s |

| Warm page-cache hit, HTTP/2 (c32/m32) | **110,158 req/s** | — | — |

| Warm page-cache hit, HTTP/1.1 (c100) | **80,025 req/s** | — | — |

Re-run 2026-11-08: `h2load` + `wrk` check, **dedicated load-generator VM** (c4-highcpu-8, same zone), full unpinned host over VPC, production PGO, median of 3:

> [Benchmark Chart: dedicated-0112 — Dedicated load-generator client, three-way (httpjet 0.1.12) (c4-highcpu-8 client VM, same zone · full-host servers over VPC · h2load c=50 x100, 1M requests/cell · median of 3 rounds · 2026-11-08 · req/s)]

`wrk` cross-check (H1, 1 KiB, c=100, 15 s): httpjet **540,911**, nginx 439,433, OpenLiteSpeed 341,344 req/s. Dedicated cells never compare with same-host rows. Compare August 2026 dedicated data: 891k empty-body.

Same three servers, second regime: the 2026-11-08 lab VM re-run; its three-way chart is now the 0.2.0 one in Release 0.2.0 . The dedicated-client chart above stays the cross-server headline because it matches how LiteSpeed and nginx publish.

        ⎁   Honest caveats
This build ran on a shared production host here. This section forms no A/B against `0.1.11`. The rows exercise memoized and fast-serve paths directly. They exercise cache-hit serving and logging too. Treat older dedicated-host comparisons as approximate. Full CSV receipts are published with the release on the benchmark page .

## The origin cache result

Largest real-workload fact: the origin page cache . Each hit replaces a PHP render with a memory/tmpfs copy.

> [Benchmark Chart: cache-vs-php — One forum page: cache hit vs full PHP render (HTTPS loopback · PGO · 152 KB page · req/s)]

2026-08-30 refresh, real `/help/*` hits, shared host: ~5.4k req/s h2, ~6.7k h1. Hit ratio reads low structurally: ~51% of GET-200s are one-shot bot crawls beyond any TTL. Lever there: edge TTL.

## At the instruction floor

See Where the time actually goes above. It merges this material there.

## File egress: sendfile and kTLS

> [Benchmark Chart: sendfile — File egress receipts (1 MiB bodies, c=50) (loopback · 2026-09-09 · req/s)]

Plain H1: bounded nonblocking `sendfile(2)`. TLS 1.3 H1: kernel TLS only via `--ktls=auto` + physical `tls-hw-tx-offload`. Production virtual NIC: `off [fixed]`. Forced software kTLS measured worse. `auto` refuses it. Details: Protocol stacks .

## The codegen tier — PGO + mimalloc

Production: PGO + mimalloc + `-C target-cpu=native`. `scripts/build-pgo.sh` (outside public export) runs instrument → loopback drive → rebuild. Load: h2 hits dominant, plus h2/h1 static, PHP. Frame pointers kept for pprof. Tuning belongs to one deployment. Build neutral artifacts separately.

        !   A non-PGO benchmark is not a benchmark
Debug builds run ~5× slower. Plain release differs ~10% by layout alone. Build both sides identically, interleave runs. Harness (`scripts/bench-suite.sh`, `scripts/bench-report.py`) and CSVs stay outside public export.

## Knobs that actually move production

| Lever | Effect |

| Page-cache opt-in coverage and TTLs (app side) | The dominant lever: every hit removes a PHP render. |

| `--page-cache-admit-threshold 1` with dictionaries | Cache on first sight when storage is cheap; watch `httpjet_cache_hit_ratio_real`. |

| `--cf-send-zstd` | Hands the CDN the cheapest encoding to produce; no browser-visible change. |

| Fast-memo eligibility of the docroot chain | Ineligible chains pay full pipeline per request. Fix directives, keep memo. |

| `--rewrite-ua-classify` | Collapses UA diversity onto few outcome-cache entries. |

| TLS resumption & certified idle window | ECDSA, AES-128-GCM, `--tls-session-tickets 0`, `--trusted-proxy-idle-secs` cut handshake CPU. |

| PHP: opcache, worker count, slow endpoints | `--php-slow-log` attribution. Pool rarely bottlenecks (p99.9

## All builds & benchmark receipts ledger

Filter all 14 benchmarked eras by tag, commit, workload, regime, receipt:

| Build / Commit | Regime | Measured Results & Source Receipt |

| `0.0.1` · Phase 1–7 2026-06-01 · `dcf4ca1e` | loopback A/B vs LSWS 6.3.5 | Light H1 **135,448 RPS** vs 182,743 (`0.74×`); heavy H1 **95,840** vs 160,920 (`0.60×`); H2 **~128k** vs 220.5k. Receipt: `RESULTS.md` Phase 7, `litespeed-*-run1.csv` |

| `Tier A` · StatCache + DFA 2026-05-31 · `66fc2088` | loopback A/B vs LSWS 6.3.5 | 1s TTL `statx`, `FileCache`/`StatCache`, `RegexSet` DFA: heavy `/robots.txt` **`0.46× → 0.63×`** (peak `0.70×`); 66 KB image **`0.90–0.99×`**. Receipt: `RESULTS.md` Tier A |

| `Batches 1–5` · Micro-Opts 2026-06-02 · `2d80a25` | same-session A/B shared host | Lazy headers, `Cow` env, prefix filter, `zstd > br > gzip`, regex folding (28→1): PHP H1 **31,013 → 31,300 RPS**; heavy H1 **78.6k vs 72.3k** (noise). Receipt: `RESULTS.md` Batches 1–5 |

| `Batch 6` · Codegen PGO 2026-06-02 · `5091dfc` | isolated PID A/B PGO + mimalloc | `target-cpu=native` + `mimalloc` + PGO: heavy H1 **75.4k → 84.3k (`+11.8%`)**; light H1 **88.3k → 93.0k (`+5.2%`)**. Receipt: `RESULTS.md` Batch 6, `scripts/build-pgo.sh` |

| `LSCache + H2 Fix` 2026-06-07 · `36078788` | loopback PGO HTTPS suite | Notify fix: H1 **298 → 72,371**, H2 **2,939 → 165,939**; fan-out **52.5k → 116k (`2.2×`)**; `openat` **20,000 → 0**; H2 **250.8k** vs 220.5k; PHP **44.8k** vs 38.5k; HIT **19,215** vs PHP **480 (`40×`)**; tmpfs **18,211**. Receipt: `httpjet-sweep-fixed.csv`, `httpjet-cache-run1.csv`, `httpjet-cache-jetfile.csv` |

| `io_uring` · monoio 2026-06-21 · `c4930ff6` | transport A/B uring vs epoll | `monoio` `io_uring` + `writev`: H1 **`+19%`**, H2 **`+22%`**, H3 **`+14–20%`** vs epoll. Receipt: `CLAUDE.md` / `RESULTS.md` 2026-06-21 |

| `v0.0.1` · 3-Way + Memo 2026-08-27..28 · `49c5e7c2` (pre-tag) | dedicated-client + loopback 3-way + prod telemetry | H2 empty `c=50` **891.1k** vs 838.2k; `c=200` **851.8k** vs 736.3k; memo H1 **107k → 153k (`+43%`)**, H2 **137k → 248k (`+81%`)**; heavy H2 **298.0k** vs 283.3k vs 125.4k; prod mean **9.99 ms**. Receipt: `versus5-dedicated-final-20260827.csv`, `compare-rewrite-memo-vary-pgo.csv` |

| `v0.0.2` · sendfile & kTLS 2026-09-23 · `f987d7cd` | loopback egress 1 MiB × 5,000 c=50 | H1 `sendfile(2)` **4,852.5 RPS**; TLS rustls **2,999.7**; forced kTLS **2,944.9**; dict-level 6 halved encode (`+4%` footprint). Receipt: `httpjet-sendfile-sendfile-release.csv`, `httpjet-ktls-sendfile-*-20260909.csv` |

| `v0.0.3` · openat2 + H3 PGO 2026-09-27 · `6e36d652` | 6-pair ABBA H2 + H3 PGO | `openat2` opens + H3 QPACK PGO: dict **`+4.46%`**, no-dict **`+11.66%`**, H3 **`+0.64%`** (**28,653 RPS**). Receipt: `httpjet-0.0.3-vs-previous-*-20260927.csv` |

| `v0.0.9` · CPU Campaign 2026-10-18 · `d4a4e333` | PMU counters x86 + ARM64 | Idle CPU **`−54..63%`**; guest **`−14.5%`**, PHP **`−12%`**; access memo **`13.0% → 2.7%`**; prod CPU **970 µs → 921 µs**. Receipt: `RESULTS.md` 2026-10-18 (`#958`–`#964`) |

| `v0.0.10` · TLS Idle + Dict L3 2026-10-18 · `f73fcedf` | live prod metrics x86 + voidrune | Idle window: handshakes **`0.052 → 0.0365 (−30%)`** x86, **`0.77 → 0.169 (−78%)`** ARM; dict encode **`5.3×`**, CPU **`~50% → 11%`**. Receipt: `CLAUDE.md` `#486`, `#489`, `#967` |

| `v0.1.2–0.1.3` · Task Pools 2026-10-24 · `2f259201` | perf stat PGO PURGE_DELAY=0 | `Recycled ` pools: faults **`0.80 → 0.0005`** H2, **`1.61 → 0.05`** heavy, **`0.41 → 0.001`** hits; brotli skip **`−8k` faults**. Receipt: PR `#1157`, commit `0c10fdc4` |

| `v0.1.5` · BODY_BUFS 2026-10-24 · `16ed92f9` | perf stat PGO x86 + ARM64 | `BODY_BUFS` pool: faults **`1.80 → 0.106 (−94%)`** streamed, **`0.0325 → 0.0005`** hits; RSS **`165–195 MB → 125–132 MB`**. Receipt: PR `#1163` (`16ed92f9`) |

| `v0.1.6` · Prod-Weighted Egress-at-Rest 2026-10-25 · `8938bea` | prod-weighted ABBA voidrune ARM + x86 | Voidrune `3.7 ms/req` vs x86 `0.65 ms/req`; egress-at-rest instr **`−39.9%`**, CPU `−31.4%`, RSS `−23%`. Receipt: `RESULTS.md` 2026-10-25 (0.1.6), `docs/performance/BASELINE.md` |

| `v0.1.7` · Egress-at-Rest x86 + HPACK Huffman 2026-10-25 · `6885820` | same-binary flag off/on, both orders admission threshold 1 | Miss→store CPU **`−61%`** (`+14.6%`); Huffman decode `16.6 → 4.6 µs` x86. Receipt: `RESULTS.md` 2026-10-25 (0.1.7) |

| `v0.1.8` · LSAPI Header Dedupe 2026-10-25 · `4eefffd` | microbench + W2 ABBA same-binary kill switch | Header dedupe: encode `5.7 → 4.2 µs` (`−26%`), pairs `41 → 21`, 0 rows worse. Receipt: `RESULTS.md` 2026-10-25 (0.1.8) |

| `v0.1.9` · Reset Replay + Prod-Weighted PGO 2026-10-25 · `fdca111` | x86 A/B + voidrune PGO ABBA the order that reproduced the 502s | Reset replay: **23 replays, 0 exhaustions, 0 502s**; voidrune PGO CPU `−3.1%`, 0 rows worse. Receipt: `RESULTS.md` 2026-10-25 (0.1.9) |

| `v0.1.10` · Bug/Perf Bash 2026-10-26 · `c07d345` | loopback A/B, both orders x86, vs public v0.1.5 | See Release 0.1.10 : **`0 of 80`** rows worse, miss→store CPU **`−61%`**. Relative A/B only. |

| `v0.1.11` · Coop Ring + Response Memo Defaults 2026-11-07 · `54df571f` | alt-port ABBA, both orders x86; aarch64 neutral | See Release 0.1.11 : hits **`+27.6%`**, CPU **`−26.7%`**. Receipt: source commit `54df571f`. |

| `v0.1.12` · Hot-Path Allocation & Contention Reductions 2026-11-08 · `85b99e16` | lab re-run dedicated lab VM, server 4 cores / loadgen 4 cores, all 10 releases | See Release 0.1.12 : lab medians vs v0.1.11 — H2 1 KiB **443.2k → 549.7k**, H1 1 KiB **267.2k → 284.3k**, page-cache **396.0k → 485.7k**; dedicated-client three-way H2 **371,540**. Receipts: release-sweep-2026-11-08.tsv + raw logs ; three-way CSVs on the benchmark page |

| `v0.2.2` · Second Review Pass 2026-11-12 · `d59a6379` | See Release 0.2.1 / 0.2.2 : lab medians flat vs v0.2.1 in the same run — H2 1 KiB **669.1k → 665.6k**, heavy `.htaccess` H2 **545.7k → 537.8k**, page-cache **540.9k → 542.4k**, PHP **32.6k → 32.5k**. Receipts: release-sweep-2026-11-12.tsv + raw logs ; loopback CSVs on the benchmark page |

| `v0.2.1` · Admission Fix + Fuzz 2026-11-12 · `4345a424` | See Release 0.2.1 / 0.2.2 : lab medians flat vs v0.2.0 in the same run — H2 1 KiB **699.3k → 669.1k**, heavy `.htaccess` H2 **518.9k → 545.7k**, page-cache **604.2k → 540.9k**, PHP **32.3k → 32.6k**. Receipts: release-sweep-2026-11-12.tsv + raw logs |

| `v0.2.0` · Security Audit Fixes & Cold-Start Latency 2026-11-11 · `8fcb4647` | lab re-run dedicated lab VM, server 4 cores / loadgen 4 cores, all 11 releases | See Release 0.2.0 : lab medians vs v0.1.12 in the same run — H2 1 KiB **591.8k → 625.5k**, heavy `.htaccess` H2 **402.9k → 515.3k**, page-cache **410.5k → 544.5k**; slowest request right after boot **508 ms → 3 ms**. Receipts: release-sweep-2026-11-11.tsv + raw logs ; loopback CSVs on the benchmark page |

| `experiment` · H3 GSO Segment Cap SINGULARITY · same-binary A/B | H3 32 KiB, 100k req/arm GSO cap 10 vs 20 | Static `6,052 → 7,816/6,552 rps`, `sendmsg` `−44.6%`, instr ` Receipt: `docs/h3-gso-segment-experiment.md` in the source tree |
