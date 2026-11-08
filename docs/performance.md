# Performance — httpjet Documentation

> Measured throughput by regime: three-way benchmarks, the origin cache result, production attribution, sendfile and kTLS receipts, and PGO discipline.

- **Canonical URL:** https://httpjet.net/docs/performance
- **Source Repository:** https://github.com/faratech/httpjet

---

# Performance

httpjet is fast — and these docs are strict about *where* the time goes. Every figure names its regime, because a **loopback benchmark** (synthetic, on-box, PGO build) is not the same thing as **production telemetry** (real CDN-fronted traffic). The short version: on a Cloudflare-fronted PHP site, almost all wall time is PHP, and httpjet's own CPU is a rounding error.

        1,183 k rps   h2 static empty, c=50, dedicated load-generator VM, median of 3 (0.1.12, 2026-11-08)
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

A loopback benchmark removes the network, real TLS handshakes and the CDN — it isolates the server's code path, which is exactly what you want to compare two servers and exactly what you must not generalize to end-user latency. Production telemetry measures what users feel, dominated by the backend and the edge. The same server shows ~908k req/s in a synthetic benchmark and ~0.2% of user-visible latency in June 2026 production telemetry; those answer different questions.

## Performance across builds — interactive presentation

Every benchmark campaign from the initial Phase 1–7 baseline (`0.0.1`, June 2026) through the October 2026 zero-fault pooling release (`v0.1.5`), the `0.1.10` bug/perf release, the `0.1.11` defaults release and the `0.1.12` hot-path release are recorded below with its regime, development-tree commit and receipt name; the CSV receipts and the results log are not part of the public source export at github.com/faratech/httpjet . Use the **Release Speed Curve** below to compare every release from v0.0.1 to v0.1.10, each PGO-built from its tag and measured side by side on 2026-10-26 under identical conditions (raw results: release-sweep-2026-10-26.tsv ); the v0.1.11 and v0.1.12 points were added 2026-11-08 from a paired run of the two production PGO binaries under the same workload shapes and core split. Step through the **16 build slides**, **Workload Trajectories**, and **Build-vs-Build Diff**.

## Loopback throughput

The primary dataset is the August 2026 **three-way** (httpjet vs OpenLiteSpeed vs nginx): the static matrix was driven from a dedicated load-generator client on 2026-08-27 (two interleaved pairs per cell; the server host was not otherwise idle), and the heavy-`.htaccess` rows are a loopback PGO run on 2026-08-28. The June PGO campaign against a commercial-LiteSpeed baseline remains the PHP-path reference.

> [Benchmark Chart: h2-static — HTTP/2 static throughput by concurrency (dedicated load-generator client · 2026-08-27 · empty bodies · mean of 2 interleaved pairs · req/s)]

One h2 connection is not a ceiling (~58k req/s at c=1), and throughput keeps rising with concurrency instead of collapsing; the earlier "h2 collapses past c=50" shape belonged to the June build and its measurement conditions, not the transport. HTTP/1.1 empty bodies at c=1000: ~202k vs OpenLiteSpeed's ~183k.

> [Benchmark Chart: heavy-rewrite — Heavy .htaccess static (806-line chain, /robots.txt) (PGO three-way · 2026-08-28 · c=100 · req/s)]

> [Benchmark Chart: memo-ab — Fast-path memo, same binary A/B (forum chain · /robots.txt · c=100 · req/s)]

> [Benchmark Chart: php-h1 — PHP over LSAPI, HTTP/1.1 (loopback · PGO build · 2026-06 · req/s)]

## Release 0.1.10: controlled A/B against 0.1.5

The `0.1.10` release (October 26, 2026) closed a five-round bug and performance review: **23 issues found, 22 fixed and 1 closed by decision**, with the full workspace suite (3,068 tests) green. To see what that did to the serving paths, the public `v0.1.5` build and the `0.1.10` build were run back to back, each with the flags it runs with in production, over **16 workloads, 5 blocks, in both run orders**. Result: **0 of 80 metric rows were worse**. Every figure below is a *relative* change from that A/B, not a production throughput number.

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
Static-file CPU per request is up 1–2%, which is within the measurement noise. The h2 cache-hit p99 row (+20%) is a high-variance metric on a loop that finishes in a couple of milliseconds. All of this is loopback measurement on a shared 8-core host, so read it as direction and size of change between two builds, not as capacity. The largest page-cache miss and warmer gains come mostly from the egress-at-rest work that shipped in `0.1.7`, which `0.1.5` predates.

Measured against `0.1.9` alone, the `0.1.10` review changes CPU per request by **−4.7%** on uncached PHP, **−4.3%** on beacon POSTs, **−4.2%** on cookied page-cache serves and **−1.8%** on h2 cache hits. Microbenchmarks behind that: HPACK header-block encode went from **4.73 µs to 1.34 µs** (word-at-a-time Huffman plus a long-literal memo), and cookie `SetEnvIf` evaluation on the production `.htaccess` from **29 µs to 1 µs** (lookahead conjunctions now run in linear time).

The release also fixes a live bug: under systemd `RestrictSUIDSGID=yes`, `openat2` returns `ENOSYS` and static files of a sandboxed vhost answered 404. A component-by-component no-follow walk now resolves beneath the docroot, and a transient unit with that option confirmed it (`0.1.9`: 404, `0.1.10`: 200).

## Release 0.1.11: two defaults flipped on

The `0.1.11` release (November 7, 2026) makes two measured optimizations the **default** instead of opt-in flags: the `coop` io_uring ring setup (`--uring-ring coop`; `legacy`/`defer` stay selectable) and the per-worker **response memo** for finalized public page-cache hits (`--no-page-cache-response-memo` turns it off; the old `--page-cache-response-memo` opt-in still parses). The ARM origin already ran both; the x86 origin ran neither.

An alt-port ABBA on x86 (same build, flags on vs off, both orders) measured the pair on the dominant production shape:

| Workload | Throughput | p50 | p99 | CPU / request | RSS |

| Cookieless H2 page-cache hits | **+27.6%** | **−36%** | **−32%** | **−26.7%** | +~2 MB |

| Cookied page-cache hits | – | – | – | −4.4% | – |

| Static 1 KiB | neutral (within noise) |

        ⎁   Honest caveats
This is a *relative* loopback A/B of two flag defaults on one x86 host, not a new absolute throughput record — the ~908k req/s h2 static figure above is unchanged. On aarch64 the `coop` ring alone was neutral against `legacy`. The memo only retains cookieless public GET hits and keeps the native entry's exact freshness, Age and purge fences, so a purge or expiry revokes it immediately; correctness gates (40 memo-focused tests, a pipeline purge-revocation test, and 24 H1/H2 smoke arms plus 4 H3 arms that must record real memo hits) ran before the default flipped.

The release also removes the retired Beeper/eBPF kernel-fastpath experiment code, adopts the ARM canary source for the voidrune origin, and clears the remaining panic-ratchet sites in the H1 and H3 send paths. Packaging fixes that followed in the same release line (musl release build, H3 dispatch stack use, Gentoo `DIGESTS` parsing) do not change serving behavior.

The memo half of the pair was also measured on its own, as instructions per request on a frozen non-PGO binary (SINGULARITY loopback, 1 KiB public-cache hits, 500k responses per arm, off/on/on/off):

| Protocol | Memo off (instr/req) | Memo on (instr/req) | Change |

| H1 plaintext | 60,337 | 30,811 | **−48.9%** |

| H1 TLS | 72,720 | 40,561 | **−44.2%** |

| H2 plaintext | 65,975 | 36,621 | **−44.5%** |

| H2 TLS | 72,742 | 41,532 | **−42.9%** |

| H3 | 98,293 | 68,024 | **−30.8%** |

Instructions are user-mode PMU counts over warmup + measurement; they show less native cache-hit work, not a whole-machine CPU saving, and throughput/tails in that run were mixed under unrelated compiler load — which is why the shipped claim above rests on the x86 ABBA, not this table. Source: `docs/pagecache-response-memo-experiment.md` in the source tree.

## Release 0.1.12: hot-path allocation and contention reductions

The `0.1.12` release (November 8, 2026) reduces per-request allocation and lock contention on the serving hot paths: borrowed vhost routing (`Router::resolve_ref`), a single-pass fast-serve header scan, HPACK header-name reuse, batched request IDs and cached HTTP dates, sharded telemetry and fast-bridge counters, page-cache diskstore/metablob refinements, and allocation-light access-log rendering. No flag or configuration changes are required; the wire behavior is unchanged (the fast-memo parity gate compared memo-on against memo-off byte-for-byte over 192 cells with zero diffs before deployment).

Loopback throughput on the production x86_64 host (PGO build, 8 cores, live production traffic on the same host — directional, not a capacity claim), measured 2026-11-08 with the standard bench suites:

| Workload (c50 unless noted) | httpjet 0.1.12 | nginx | OpenLiteSpeed |

| HTTP/2 static 1 KiB | **371,540 req/s** | 180,940 req/s | 399,505 req/s |

| HTTP/1.1 static 1 KiB | **195,446 req/s** | 117,979 req/s | 201,306 req/s |

| HTTP/2 static 64 KiB | **68,689 req/s** | 35,063 req/s | — |

| Heavy `.htaccess` vhost, HTTP/2 (c100) | **271,118 req/s** | 131,955 req/s | 333,519 req/s |

| Warm page-cache hit, HTTP/2 (c32/m32) | **110,158 req/s** | — | — |

| Warm page-cache hit, HTTP/1.1 (c100) | **80,025 req/s** | — | — |

Re-run on 2026-11-08 in the topology LiteSpeed and nginx publish with — `h2load` (and a `wrk` cross-check) on a **dedicated load-generator VM** (c4-highcpu-8, same zone) against the full, unpinned host over the VPC, production PGO binaries, median of 3 rounds:

> [Benchmark Chart: dedicated-0112 — Dedicated load-generator client, three-way (httpjet 0.1.12) (c4-highcpu-8 client VM, same zone · full-host servers over VPC · h2load c=50 x100, 1M requests/cell · median of 3 rounds · 2026-11-08 · req/s)]

The `wrk` HTTP/1.1 cross-check (1 KiB, c=100, 15 s) agrees on the ordering: httpjet **540,911**, nginx 439,433, OpenLiteSpeed 341,344 req/s. Dedicated-client numbers are not comparable cell-for-cell with the same-host rows above (the client no longer shares the server's cores); they are comparable with the August 2026 dedicated dataset (891k empty-body for the build of that week).

        ⎁   Honest caveats
These are absolute loopback numbers for this build on a shared production host, not an A/B against `0.1.11`: the changed paths (memoized/fast-serve serves, cache-hit serving, logging) are exactly the ones the rows above exercise, but treat the comparison against the older dedicated-host baselines elsewhere on this page as approximate. Full CSV receipts are published with the release on the benchmark page .

## The origin cache result

The single largest performance fact about the real workload is not a micro-optimization — it is the origin page cache . For the cacheable fraction of traffic, a hit replaces an entire PHP render with a memory (or tmpfs) copy.

> [Benchmark Chart: cache-vs-php — One forum page: cache hit vs full PHP render (HTTPS loopback · PGO · 152 KB page · req/s)]

A 2026-08-30 refresh under shared-box conditions (live production on the same host — directional only) put cache-hit serves at ~5.4k req/s h2 and ~6.7k h1 on real `/help/*` pages. The production hit ratio reads low for a structural reason: ~51% of origin GET-200s are one-shot bot crawls whose repeat interval exceeds any TTL, so no origin tier can absorb them — the lever there is edge TTL.

## Where the time actually goes

> [Benchmark Chart: attribution — Where a production request spends its time (live sample · 2026-08-30 · mean request 9.99 ms)]

        ⎁   Measured
Across millions of production requests, the `lsphp` render is **86.5–98.8% of request wall time**. In the June 2026 telemetry httpjet's own request phases were about **0.2%** — roughly **138 µs per request** (rewrite, cache lookup, compression); a synthetic cache hit costs ~38 µs of CPU including TLS, HTTP/2, rewrite, cache lookup and access logging. The 2026-08-30 sample: mean request 9.99 ms, 8.96 ms of it LSAPI TTFB, rewrite 5.4 µs, cache lookup 3.2 µs; pool acquire p99.9  production telemetry · --telemetry-file + --php-slow-log

If httpjet is 0.2% of latency, halving its CPU shaves ~0.1% off a page — imperceptible. Turning a PHP render into a cache hit removes the other ~99%. That asymmetry is why the project stopped shaving the serving path and invested in the cache, PHP/opcache tuning and raising the cacheable fraction.

## At the instruction floor

        ⎁   Measured
At saturation the h2 cache-hit path shows **IPC 1.55**, a **0.31% branch-miss rate** and **1.6 L1d misses per 100 instructions**: execution is efficient and the bottleneck is instructions retired per request, not locality. Futex traffic (~85% of syscall time) turned out to be idle parking and cross-thread waker churn — the box was ~50% idle at the apparent ceiling — not lock contention.
 perf stat / strace · off-CPU analysis

Two structural moves followed: the global **mimalloc** allocator (fewer arena futexes across the per-core monoio workers plus the tokio side-runtime) and the **on-core fast path** with the finished-response memo, which removes pipeline work rather than speeding it up. The October 2026 campaign (`0.0.9`–`0.1.5`) extended this to the remaining hot paths: keeping static-missing 404s and non-cacheable PHP GETs off the fast-path double lookup (−14.5% CPU on cookied guest pages), memoizing per-file `.htaccess` access rule matches (`access_decision_for_request` 13% → 2.7% of process CPU), extending the certified-peer idle window via `--trusted-proxy-idle-secs 1800` (cutting full TLS handshakes per request by 30% on x86 and 78% on ARM), tuning per-vhost dictionary zstd levels via `--page-cache-dict-level` (cutting ARM dictionary encode from ~50% to 11% of tokio CPU), and pooling transient response/TLS buffers and h2/bridge task slots (`hj_core::recycle::BODY_BUFS`) so sparse size classes do not page-fault under `MIMALLOC_PURGE_DELAY=0`.

## File egress: sendfile and kTLS

> [Benchmark Chart: sendfile — File egress receipts (1 MiB bodies, c=50) (loopback · 2026-09-09 · req/s)]

Plain-TCP H1 file bodies leave through bounded nonblocking `sendfile(2)`; TLS 1.3 H1 can too under kernel TLS, but only when `--ktls=auto` finds a physical NIC with active `tls-hw-tx-offload`. The production host's virtual NIC reports `off [fixed]`, and forcing software kTLS there measured slightly *worse* — which is exactly why `auto` refuses it. Details: Protocol stacks .

## The codegen tier — PGO + mimalloc

Production binaries combine profile-guided optimization, the mimalloc allocator and `-C target-cpu=native`. The development tree's `scripts/build-pgo.sh` (not in the public source export) is the classic three-step — instrument, drive a representative loopback workload (h2 cache hits dominant, plus h2/h1 static and PHP), merge and rebuild — with frame pointers kept so the pprof endpoint can symbolize the live binary. Its workload and CPU tuning belong to one deployment; build a neutral release artifact separately.

        !   A non-PGO benchmark is not a benchmark
Debug builds are ~5× slower and meaningless. Even a plain release build differs from PGO by enough (~10% from binary layout alone) to fake a regression: build both sides the same way and interleave runs. The bench harness (`scripts/bench-suite.sh`, `scripts/bench-report.py`) records CSVs under `scripts/bench-results/` in the development tree; neither the harness nor the CSVs are in the public source export.

## Knobs that actually move production

| Lever | Effect |

| Page-cache opt-in coverage and TTLs (app side) | The dominant lever: every hit removes a PHP render. |

| `--page-cache-admit-threshold 1` with dictionaries | Cache on first sight when storage is cheap; watch `httpjet_cache_hit_ratio_real`. |

| `--cf-send-zstd` | Hands the CDN the cheapest encoding to produce; no browser-visible change. |

| Fast-memo eligibility of the docroot chain | An ineligible chain (see `httpjet check`) pays the full pipeline on every static request; fix the directive rather than disabling the memo. |

| `--rewrite-ua-classify` | Collapses UA diversity on UA-reading chains onto a handful of outcome-cache entries. |

| TLS resumption & certified idle window | Full handshakes dominate behind a CDN that does not re-offer tickets; ECDSA chains, the single AES-128-GCM suite, `--tls-session-tickets 0` and `--trusted-proxy-idle-secs` keep handshake CPU low. |

| PHP: opcache, worker count, slow endpoints | Use `--php-slow-log` attribution; the pool is rarely the bottleneck (acquire p99.9

## All builds & benchmark receipts ledger

Filter by build tag, commit, workload, regime, or CSV receipt file across all 14 benchmarked eras:

| Build / Commit | Regime | Measured Results & Source Receipt |

| `0.0.1` · Phase 1–7 2026-06-01 · `dcf4ca1e` | loopback A/B vs LSWS 6.3.5 | Light `.htaccess` H1: **135,448 RPS** vs LSWS 182,743 (`0.74×`); Heavy 477-line `.htaccess` H1: **95,840 RPS** vs LSWS 160,920 (`0.60×`); H2 1 KB `c=50`: **~128k RPS** vs LSWS 220.5k. Receipt: `RESULTS.md` Phase 7, `litespeed-*-run1.csv` |

| `Tier A` · StatCache + DFA 2026-05-31 · `66fc2088` | loopback A/B vs LSWS 6.3.5 | 1s TTL on `.htaccess` `statx`, `FileCache` & `StatCache` (`-f`/`-d`) + `RegexSet` DFA prefilter: heavy `/robots.txt` ratio lifted **`0.46× → 0.63×`** (`0.70×` peak); 66 KB `og-image.png` reached **`0.90–0.99×`** parity. Receipt: `RESULTS.md` Tier A |

| `Batches 1–5` · Micro-Opts 2026-06-02 · `2d80a25` | same-session A/B shared host | Lazy header map, `Cow` CGI env keys, literal-prefix rule filter, `zstd > br > gzip` negotiation, OR-condition regex folding (28 evals → 1): PHP H1 `c=40` **31,013 → 31,300 RPS**; heavy H1 **78.6k vs 72.3k** (within noise, isolating codegen/allocator as the true bottleneck). Receipt: `RESULTS.md` Batches 1–5 |

| `Batch 6` · Codegen PGO 2026-06-02 · `5091dfc` | isolated PID A/B PGO + mimalloc | `-C target-cpu=native` + global `mimalloc` + 3-step PGO: heavy `.htaccess` H1 **75.4k → 84.3k RPS (`+11.8%`)** matching LSWS (84.3k); light static H1 **88.3k → 93.0k RPS (`+5.2%`)**. Receipt: `RESULTS.md` Batch 6, `scripts/build-pgo.sh` |

| `LSCache + H2 Fix` 2026-06-07 · `36078788` | loopback PGO HTTPS suite | Single-flight follower Notify fix lifted heavy `c=50` H1 **298 → 72,371 RPS** and H2 **2,939 → 165,939 RPS**. H2 1-conn 64-stream fan-out: **52.5k → 116k RPS (`2.2×`)**. 1s `open_beneath` memo: `openat` **20,000 → 0** (`+12%` static). H2 1 KB `c=50`: **250.8k** vs LSWS 220.5k; PHP H1 `c=40`: **44.8k** vs LSWS 38.5k. Origin page-cache HIT (152 KB): **19,215 RPS (`p50 2ms`)** vs PHP **480 RPS (`p50 34ms`, `40×`)**; tmpfs `jetcache` hit: **18,211 RPS**. Receipt: `httpjet-sweep-fixed.csv`, `httpjet-cache-run1.csv`, `httpjet-cache-jetfile.csv` |

| `io_uring` · monoio 2026-06-21 · `c4930ff6` | transport A/B uring vs epoll | Unconditional thread-per-core `monoio` `io_uring` transport for H1/H2 TCP+TLS and UDP H3 + vendored `monoio-rustls` vectored `writev`: H1 **`+19%`**, H2 **`+22%`**, H3 **`+14–20%`** over tokio/epoll + quinn. Receipt: `CLAUDE.md` / `RESULTS.md` 2026-06-21 |

| `v0.0.1` · 3-Way + Memo 2026-08-27..28 · `49c5e7c2` (pre-tag) | dedicated-client + loopback 3-way + prod telemetry | H2 static empty (mean of two interleaved pairs): `c=50` **891.1k** (HJ) vs 838.2k (OLS); `c=200` **851.8k** vs 736.3k; 1 KB `c=200` **802.9k** vs 788.4k. Fast-memo A/B (`c=100`): H1 **107k → 153k (`+43%`)**, H2 **137k → 248k (`+81%`)**. 806-line `.htaccess` PGO 3-way: H2 **298.0k** (HJ) vs 283.3k (OLS) vs 125.4k (nginx). Prod telemetry (2026-08-30): mean **9.99 ms** (8.96 ms PHP = `89.7%`; rewrite 5.4 µs + cache lookup 3.2 µs = `0.09%`). Receipt: `versus5-dedicated-final-20260827.csv`, `compare-rewrite-memo-vary-pgo.csv` |

| `v0.0.2` · sendfile & kTLS 2026-09-23 · `f987d7cd` | loopback egress 1 MiB × 5,000 c=50 | Plaintext H1 `sendfile(2)`: **4,852.5 RPS** (`10.08 ms` mean); TLS 1.3 H1 rustls (`--ktls=off`): **2,999.7 RPS**; forced software kTLS on virtual GVE NIC: **2,944.9 RPS** (validating why `--ktls=auto` requires physical `tls-hw-tx-offload`). `--page-cache-dict-level windowsforum.com=6` halved encode CPU for `+4%` footprint. Receipt: `httpjet-sendfile-sendfile-release.csv`, `httpjet-ktls-sendfile-*-20260909.csv` |

| `v0.0.3` · openat2 + H3 PGO 2026-09-27 · `6e36d652` | 6-pair ABBA H2 + H3 PGO | Rooted `openat2(RESOLVE_BENEATH | RESOLVE_NO_SYMLINKS)` file-tier opens + H3 QPACK PGO training: warm H2 dict `/help/smilies/` **`+4.46%`** (combined `+1.45%`), no-dict **`+11.66%` / `+2.81%`**, H3 20k-req ABBA **`+0.64%`** (**28,653 RPS** peak, `p50 0.427 ms`). Receipt: `httpjet-0.0.3-vs-previous-*-20260927.csv` |

| `v0.0.9` · CPU Campaign 2026-10-18 · `d4a4e333` | PMU counters x86 + ARM64 | Idle ticker parking: idle CPU **`−54..63%`** (TLS wakes `32/s → 0`). Cookied front-controller early bridge: cookied guest **`−14.5%` CPU** (TLS **`−30%`**), PHP **`−12%`** (TLS **`−44%`**). Per-file `.htaccess` access-rule match memo (`#963`): `access_decision_for_request` **`13.0% → 2.7%`** CPU. ARM64 PMU instructions/req: PHP **`−18%`**, guest **`−11%`**, hit **`−8.5%`**. Live x86 prod CPU/req: **970 µs → 921 µs**. Receipt: `RESULTS.md` 2026-10-18 (`#958`–`#964`) |

| `v0.0.10` · TLS Idle + Dict L3 2026-10-18 · `f73fcedf` | live prod metrics x86 + voidrune | `--trusted-proxy-idle-secs 1800` cut full TLS handshakes/req **`0.052 → 0.0365 (−30%)`** on x86 and **`0.77 → 0.169 (−78%)`** on ARM64; `--tls-session-tickets 0` cut handshake CPU **`−5%`**. `--page-cache-dict-level moontimenow.com=3,thisdayinhistory.ai=3` sped up ARM64 dict encode **`5.3×`** (`3.53 → 0.66 ms/page`), dropping dict CPU from **`~50% → 11%`** of tokio CPU. Receipt: `CLAUDE.md` `#486`, `#489`, `#967` |

| `v0.1.2–0.1.3` · Task Pools 2026-10-24 · `2f259201` | perf stat PGO PURGE_DELAY=0 | `hj_core::recycle::Recycled ` for H2 stream & bridge futures, LSAPI read/BEGIN pools, and per-thread zstd/gzip scratch: minor page faults/req dropped **`0.80 → 0.0005`** on H2 1 KiB (`−22..32%` CPU), **`1.61 → 0.05`** on heavy `.htaccess` (`−19..25%` CPU), **`1.60 → 0.026`** on 64 KiB, and **`0.41 → 0.001`** on cache hits. `v0.1.3` (`0c10fdc4`) skipped quality-9 brotli on internal refresh under `--cf-send-zstd` (**`−8k` faults & `−10 ms`/page**). Receipt: PR `#1157`, commit `0c10fdc4` |

| `v0.1.5` · BODY_BUFS 2026-10-24 · `16ed92f9` | perf stat PGO x86 + ARM64 | `BODY_BUFS` `TieredPool >` frozen via `Bytes::from_owner`, zero-copy LSAPI `PacketReader` slices, `spawn_blocking` variant/dict fills, per-thread `PageDict` `DCtx`, `MAP_POPULATE` tmpfs mmaps, and per-core TLS record size-class retention: streamed 117 KB `/login/` H2 faults/req dropped **`1.80 → 0.106 (−94%)`**, W1 cache hit **`0.0325 → 0.0005`**, W3s1 1 KiB **`0.185 → 0.0002`**, and 500-URL miss→store RSS dropped **`165–195 MB → 125–132 MB`**. Receipt: PR `#1163` (`16ed92f9`) |

| `v0.1.6` · Prod-Weighted Egress-at-Rest 2026-10-25 · `8938bea` | prod-weighted ABBA voidrune ARM + x86 | Production cost profile first: voidrune `3.7 ms/req` vs x86 `0.65 ms/req` (egress 25%, dict encode 23%, store 16% of voidrune cost). Egress-at-rest on a cookieless miss→store: instructions/req **`−39.9%`** [`0.6005, 0.6022`], CPU/req `−31.4%`, RSS `−23%` (never-store bound `−46.7%`). Receipt: `RESULTS.md` 2026-10-25 (0.1.6), `docs/performance/BASELINE.md` |

| `v0.1.7` · Egress-at-Rest x86 + HPACK Huffman 2026-10-25 · `6885820` | same-binary flag off/on, both orders admission threshold 1 | Miss→store CPU/req **`−61%`** (throughput `+14.6%`), warmer burst CPU/req `−36.4%`, hits `±1.3%`, RSS `−12..−13%`. Cache-resident HPACK Huffman table: cold decode x86 `16.6 → 4.6 µs`, voidrune `~32 → 8 µs`. Receipt: `RESULTS.md` 2026-10-25 (0.1.7) |

| `v0.1.8` · LSAPI Header Dedupe 2026-10-25 · `4eefffd` | microbench + W2 ABBA same-binary kill switch | Each request header reaches `lsphp` once: env+block+encode `5.7 → 4.2 µs` (`−26%`), `BEGIN_REQUEST` `2,993 → 2,009 B`, env pairs `41 → 21`; W2 CPU/req `−1.4%` (below tau), 0 rows worse. Receipt: `RESULTS.md` 2026-10-25 (0.1.8) |

| `v0.1.9` · Reset Replay + Prod-Weighted PGO 2026-10-25 · `fdca111` | x86 A/B + voidrune PGO ABBA the order that reproduced the 502s | A pre-response LSAPI reset now replays on a fresh dial: fix arm **23 replays, 0 exhaustions, 0 502s** (0.1.8 arm: one run-aborting 502); cost 0 rows worse. Voidrune prod-weighted PGO: W2 instr `−2.5%`, W8 `−2.0%`, CPU `−3.1%`; the x86 forum profile was rejected (W1 `−6.2%`). Receipt: `RESULTS.md` 2026-10-25 (0.1.9) |

| `v0.1.10` · Bug/Perf Bash 2026-10-26 · `c07d345` | loopback A/B, both orders x86, vs public v0.1.5 | 16 workloads × 5 blocks: **`0 of 80`** metric rows worse. Page-cache miss→store CPU/req **`−61%`** (throughput `+16%`), warmer burst CPU/req **`−38%`**, open-loop mix p99 **`−29%`**, uncached PHP `+6%` throughput / `−6%` CPU, RSS `−8..−10%` across the board. Static-file CPU `+0.8..+1.8%` (within noise); h2-hit p99 `+20%` is a noisy metric. HPACK encode `4.73 → 1.34 µs`, cookie `SetEnvIf` `29 → 1 µs`. Relative A/B, not production throughput. |

| `v0.1.11` · Coop Ring + Response Memo Defaults 2026-11-07 · `54df571f` | alt-port ABBA, both orders x86; aarch64 neutral | `--uring-ring coop` and the page-cache response memo became defaults. Cookieless H2 page-cache hits: throughput **`+27.6%`**, CPU/req **`−26.7%`**, p50 **`−36%`**, p99 **`−32%`**; cookied hits CPU/req `−4.4%`; static 1 KiB neutral; RSS `+~2 MB`. Relative A/B of flag defaults, not production throughput. Receipt: source commit `54df571f`. |

| `v0.1.12` · Hot-Path Allocation & Contention Reductions 2026-11-08 · `85b99e16` | paired run live production host, server 4 cores / loadgen 4 cores | Borrowed vhost routing, single-pass fast-serve header scan, HPACK header-name reuse, sharded telemetry counters, page-cache diskstore/metablob refinements. Paired against v0.1.11 (median of 3 rounds): static 1 KiB H2 **525.0k → 597.4k (`+13.8%`)**, static H1 **197.6k → 218.7k (`+10.7%`)**, PHP/LSAPI **31.5k → 32.6k (`+3.3%`)**; page-cache hits **105.3k → 100.6k** and heavy-`.htaccess` H2 **436.1k → 414.3k** are within the shared-host round spread. Three-way c=50: H2 1 KiB **371,540** (nginx 180,940; OLS 399,505). Receipts: `*-v0112-20261108.csv` on the benchmark page ; paired curve addendum 2026-11-08 |

| `experiment` · H3 GSO Segment Cap SINGULARITY · same-binary A/B | H3 32 KiB, 100k req/arm GSO cap 10 vs 20 | Static `6,052 → 7,816/6,552 rps` (p99 `49.5 → 33.9 ms`), page-cache `6,135 → 7,063/7,360 rps`, `sendmsg` calls `−44.6%` — but system CPU dominates and instructions/response moved ` Receipt: `docs/h3-gso-segment-experiment.md` in the source tree |
