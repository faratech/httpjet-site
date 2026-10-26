# Page cache — httpjet Documentation

> The opt-in LSCache-protocol origin page cache: keys, tiers, admission, purge, the file tier, dictionaries, stale policies, capsules, and generation-scoped namespaces.

- **Canonical URL:** https://httpjet.net/docs/page-cache
- **Source Repository:** https://github.com/faratech/httpjet

---

# The origin page cache

An opt-in full-response origin cache speaking the LiteSpeed cache protocol — `X-LiteSpeed-Cache-Control`, `X-LiteSpeed-Tag`, `X-LiteSpeed-Vary`, `X-LiteSpeed-Purge` — so a site already tuned for LSCache needs no application change. A **hit** returns the stored response without touching the backend; everything else is engineered so the cache can never serve the wrong page.

        resolve    acl    rewrite    cache    dispatch    finalize    store

## Overview

Two crates split the work. `hj-pagecache` is the transport-agnostic store: a sharded byte-weighted LRU index built on `hj-cache`, W-TinyLFU admission, key + vary + tag indexes, TTL and stale windows, the LSCache header classifier, and the HJPC file tier. The binary's `lscache/` module is the request-aware glue: `cache_lookup` runs after rewrite and access control but before any backend; `cache_store` runs after each terminal's `finalize_response`. Both are inert and near-zero-cost without `--page-cache`.

           Off by default · app opt-in per response
           Keyed by the ORIGINAL URI · identity-guarded
           Public · private · shared-path tiers
           RAM index · hot tier · tmpfs file tier
           Tag purge · stale-while-revalidate · stale-if-error · single flight
           Per-vhost dictionaries · survives restarts

        i   Not the fast-path memo
Static files have a separate, default-on per-worker finished-response memo (1 s TTL) that sits even earlier on the on-core path — see Rewrite → fast-path memo . It never serves page-cache entries.

## Opt-in by the app

The cache never guesses. A response is stored only when the application says so. Per-vhost ` ` (and the public and private pairs of a context's six-flag LSWS `cachePolicy`: `respectCacheable` and `enablePostCache` are parsed but not enforced), the `.htaccess` `CacheLookup` directive, and the `[E=no-cache]` env all gate lookups; the response header gates storage.

           **app → httpjet** · the cache protocol headers
```
X-LiteSpeed-Cache-Control: public,max-age=3600            # public entry, one hour
X-LiteSpeed-Cache-Control: private,max-age=120            # per-session entry (needs --page-cache-private; TTL capped 300 s)
X-LiteSpeed-Cache-Control: public,max-age=60,stale-while-revalidate=600,stale-if-error=3600
X-LiteSpeed-Cache-Control: no-cache                       # never store this response
X-LiteSpeed-Tag: T1234,forum7                             # purge tags
X-LiteSpeed-Vary: cookie=xf_style_id                      # vary the public entry on a declared cookie value
X-LiteSpeed-Purge: tag=T1234                              # drop every entry carrying this tag (also: * for all)
```

**Standards mode.** `--page-cache-standard-vhosts a.example,b.example` puts listed vhosts into OpenLiteSpeed's `checkPublicCache` shape: a plain `Cache-Control: public, max-age=N` is an opt-in, a default public policy applies when no ` ` block exists, and `CacheLookup` defaults on. It is an allowlist, so a status/admin vhost cannot start caching because it merely marked something public. All other guards still apply.

        !   Backends cannot self-purge
Proxied upstream responses may not assert `X-LiteSpeed-*`; those headers are stripped so a remote backend cannot inject policy or invalidate entries. Only LSAPI/PHP responses and loopback callers of the purge endpoint shape cache behavior.

## The lookup path

> [Diagram: cache-lookup] Lookup, tier routing and freshness. Member-cookie requests route to the private tier (or, for allow-listed visitor-invariant endpoints, to the shared public tier); the key is derived from the original URI; a found entry serves only if its stored identity matches; stale entries within their windows serve immediately with a background refresh; concurrent misses collapse onto one render.

## Keys, tiers and the identity guard

key & tier explorer — change the request and the app's header

           method  GET  HEAD  POST
           scheme  https  http
           host
           path
           query
           vary cookie xf_style_id

             request carries the member cookie (xf_user)
             --page-cache-private on
             path matches --page-cache-shared-paths
             the .htaccess chain reads Origin

          X-LiteSpeed-Cache-Control on the response

Illustrative composition, not the byte layout. The real key is a compact id plus the stored identity; the guard makes any id collision a miss.

        !   Invariant 1 · key by the original URI
The key uses `orig_path`/`orig_query`, never the rewrite-resolved path. XenForo's front controller rewrites *every* page to `/index.php`; keying by the resolved path once collapsed the whole site onto one entry and served the wrong page to everyone. The incident is documented in the crate itself.

        !   Invariant 2 · the identity guard
Every entry records the host + raw request path it was built for; a lookup serves only if both match. A key collision degrades to a miss (`httpjet_pagecache_key_id_collisions_total`), never to wrong content.

Three more dimensions were added later and are part of the key today: **per-URL cookie vary** (`X-LiteSpeed-Vary: cookie=NAME` per URL in addition to the vhost-wide `--page-cache-vary-cookies` list, with request-header vary dimensions hashed with SHA-256), **Origin** when the vhost's `.htaccess` chain reads it (2026-09-16 — a reflected `Access-Control-Allow-Origin` no longer replays the first storer's CORS verdict; an absent Origin keeps the historic base key so persisted entries survive), and the **epoch + generation** namespace introduced by the first API publication so an old in-flight render can never overwrite a new generation's entry. Only the canonical Host spelling may read or populate a vhost's entry.

| Tier | Routed when | Keyed by | Notes |

| **Public** | No member cookie | vhost · scheme · host · original path?query · declared vary-cookie values (· Origin) | `Set-Cookie` and `X-LiteSpeed-*` stripped from the stored copy; a response that sets a private cookie is never stored. |

| **Private** | Member marker present (`xf_user`, or a bare `xf_session` with no `xf_user` — session-only logins leave the public tier, 2026-10-04) and `--page-cache-private` | public key + session-cookie value | Never reads or writes public entries in either direction. TTL capped at 300 s. Member POSTs typically emit a tag purge so their own reply is never hidden. |

| **Shared paths** | Member cookie, path matches `--page-cache-shared-paths` (`PATH?PARAM` exact or `PATH` prefix), within the sticky canary % | public key | Only for visitor-invariant, HMAC-gated image endpoints — never HTML. Malformed specs abort startup; empty = inert. |

| **Bypass** | Non-GET/HEAD, `[E=no-cache]`, no accepted header, member without private tier | — | Counted as `httpjet_cache_bypass`. |

## The store path and admission

> [Diagram: cache-store] Store gates. After the app opts in, the response still has to pass the status list, the private-cookie guard, the proxied-header strip, the self-redirect guard, the purge-race check and the object cap, and then earn admission. Only then is the stored copy written — into RAM, or at birth into an immutable tmpfs file.

### W-TinyLFU admission

> [Diagram: admission] A fixed-memory frequency sketch rejects one-hit wonders: at the default threshold of 2 a URL is stored on its second sighting. One request is ONE sighting — the on-core fast path probes uncounted and records only a hit it serves. Size weighting adds +1 per 256 KiB. With dictionaries making storage cheap, --page-cache-admit-threshold 1 caches on first sight. Tune by httpjet_cache_hit_ratio_real and httpjet_cache_admit_ratio.

The **self-redirect guard** declines an app-marked-cacheable 3xx whose `Location` is the request's own URL (hosts normalized without port, because an h2 `Host` carries `:443` and a generated absolute Location may not); it is re-checked at serve time, and the XF add-on refuses at a third layer. A cacheable origin *redirect* is also de-cached from the CDN's perspective via the deny-CDN-cache transform, so a canonical loop cannot pin itself at the edge.

## Storage tiers & the file tier

> [Diagram: cache-tiers] Dual-cap tier model. The RAM index describes every entry; with a file tier, bodies live as immutable HJPC files and are charged metadata-only against --page-cache-mem while their footprint counts against --page-cache-disk-mem. A small hot tier fronts the files. Every teardown path (evict, expire, purge, replace) is synchronous under the shard lock; only the unlink(2) syscall is deferred to just after the lock is released.

By default the cache is in-RAM only and flushes on restart. `--page-cache-store-path /dev/shm/jetcache` (or `default`/`jetcache`) makes it **tmpfs-primary** in the LiteSpeed Enterprise style: `PageStore::store` offloads every body to a file at birth in identity form, off the process heap; one immutable file per body version; self-describing HJPC containers authenticated with the `--page-cache-integrity-key`. The LiteSpeed `cacheStorePath` is parsed but deliberately unused so httpjet never collides with a resurrected LiteSpeed.

- **Survives restarts.** A background boot scan (up to 8 threads over the fan-out dirs) rebuilds the index from the files — ~300k entries in seconds. `/__hj_cache_ready` returns 503 while scanning and 200 + `x-hj-cache-ready: 1` + `x-hj-cache-loaded: N` when done; probing a URL mid-scan re-primes it and unlinks the persisted copy, so wait for readiness.

- **Reclaim invariant.** Live entries resolve to live bodies; a missing file fails closed to a miss and counts `disk_read_err`. Orphan reconciliation reclaims superseded files it can prove are safe to delete and defers the rest.

- **Durable purges.** Purges unlink eagerly and retain a purge-all stamp, so old data cannot be resurrected on restart.

- **Dictionaries compress at store.** The birth copy is identity; a bounded background task then dict-recompresses it in place against the vhost's own zstd dictionary (~3.5–9× smaller) at store time — never inline on a response, and never triggered by a first hit. An admission filter rejects one-hit public content before it reaches this work, and incompressible Content-Types are never encoded. Judge by `httpjet_pagecache_dict_recompress_{total,skipped_total{reason}}`; the served bytes stay standard zstd/br/gzip either way. Vhosts listed in `--page-cache-egress-at-rest-vhosts` skip this job and keep plain zstd at rest (0.1.6).

budget calculator — how many pages fit?

           --page-cache-mem (MiB)
           --page-cache-disk-mem (MiB)
           --page-cache-hot-mem (MiB)
           typical page (KB, identity)
           dictionary ratio ×

Rules of thumb only (≈6 KB of metadata per entry, ratio 3.5–9× measured on forum HTML). tmpfs *is* RAM — size the disk cap against the box's headroom. Production runs disk-mem 2 GiB on the x86 origin and 5.5 GiB on the ARM origin, hot-mem 384 MiB on both.

| Flag | Default | Bounds |

| `--page-cache-mem` | 128 MiB | RAM index: metadata, variants, any in-RAM body. With a file tier, persisted bodies are charged metadata-only here. |

| `--page-cache-disk-mem` | 2 GiB | tmpfs footprint (actual blocks when available); a per-shard disk LRU evicts the least-recently-*served* entry. 0 ⇒ fall back to `--page-cache-mem`. |

| `--page-cache-hot-mem` | 192 MiB | In-RAM hot bodies in front of the files: zero-syscall serves; cold hits pay one ~µs tmpfs read + decode. |

| `--page-cache-store-path` | *none* | Enables the file tier. Containers are tagged with `--page-cache-integrity-key` (created on first use if absent; without `--page-cache-integrity-required` an unusable key leaves containers untagged instead of refusing to start); deploy scripts gate the tier behind `ALLOW_PAGE_CACHE_FILE_TIER=1`. |

| `--page-cache-dict-vhost` / `--page-cache-dict` / `--page-cache-dict-level` | — | Per-vhost zstd dictionaries (train one per site with `scripts/train-pagecache-dict.sh`) / global fallback / per-vhost internal zstd level (1–19, default 12). Rotation needs a restart; old-generation entries become safe misses (each body records its `dict_gen`). |

| `--page-cache-vary-default` | *empty* | `name=value` pairs: a vary cookie carrying the default value (e.g. `xf_style_id=50`) is keyed as if absent. |

| `--page-cache-opt-in-status` / `--page-cache-303-prefixes` | *empty* | Opt-in caching of 303/404/410 — only on an explicit `X-LiteSpeed-Cache-Control: public`, TTL capped 300 s, no stale windows; a 303 only under a listed prefix. Default: only 200/301 are cached. |

| `--page-cache-stream-fill-vhosts` | *empty* | Vhosts whose cacheable public 200 misses without a Content-Length stream to the client frame by frame and store when the backend finishes (~ms earlier first byte on progressive template output). Errors/short bodies/over-cap serve but never store. |

| `--page-cache-egress-at-rest-vhosts` | *empty* | Vhosts whose buffered misses keep a dictionary-less zstd body and skip the background dictionary re-encode. A zstd miss stores the encode made for its own response (one encode instead of two). Any other miss stores identity and encodes it plain in the background. A hot entry later gains its L9 variant. The stored copy is larger than a dictionary-compressed one. With `--xf-capsule-dedicated-store`, capsule renders keep the dictionary path. |

        !   Dictionaries can retain content
Train only on public, logged-out pages of one vhost; a dictionary trained on another site's boilerplate does little, and one trained on private pages can leak fragments. Served bytes are never dictionary-encoded — a missing compatible dictionary is a miss, never undecodable output.

## Variants, compression and egress

The store keeps identity bytes plus **one best precompressed variant** chosen by the request's `Accept-Encoding` under the server priority zstd > br > gzip (when `--cf-send-zstd` is active, background refreshes fill only the zstd variant); a client whose accepted set differs gets a per-serve compress of the identity form. Egress is therefore always standard zstd/brotli/gzip/identity, and a hit re-negotiates encoding — stored responses are never tied to the first client. Hits from the hot tier are zero-copy `Bytes` on h2. See Compression .

## Purge

Invalidation is tag-based. The app emits `X-LiteSpeed-Purge: tag=T1234` (or `*`) on a response — every such header line is honored (0.0.5) — or a local process POSTs the loopback endpoint on the main listener. The endpoint answers **POST only** (2026-10-07); a loopback GET or other method gets 405 + `Allow`, and the ready probe takes GET/HEAD. A store that started before a relevant purge and finished after it is rejected (`httpjet_pagecache_store_purge_rejections_total`), so a stale render cannot win a race against the purge.

           **purge** · loopback-only endpoint
```
curl -s -X POST -H 'x-litespeed-purge: tag=T1234' -o /dev/null -w '%{http_code}\n' http://127.0.0.1/__hj_cache_purge   # 204
curl -s -X POST -H 'x-litespeed-purge: *' http://127.0.0.1/__hj_cache_purge                                          # everything
```

The endpoint is gated by the **raw TCP source being loopback** — no shared secret, no per-URL purge, and a CDN-relayed or LAN request gets 404. The former `--cache-peer` fan-out and `--cache-purge-secret-file` are gone. A purge with the file tier unlinks eagerly; a restart cannot resurrect purged entries.

## Stale policies & single flight

| Mechanism | Flags | Behavior |

| stale-while-revalidate LSCache-authoritative: an `X-LiteSpeed` opt-in does not merge in the standard `Cache-Control`'s `stale-while-revalidate`/`stale-if-error` (2026-10-04); `s-maxage` still implies proxy-revalidate and suppresses these defaults | `--page-cache-stale-default-secs` (0), `--page-cache-stale-max-secs` (86400) | Within the window a stale entry serves immediately and a background refresh (`httpjet_pagecache_refresh_inflight`) re-renders through the same dispatch (so WAF and gates apply). |

| stale-if-error | `--page-cache-stale-if-error-default-secs` (0), `--page-cache-stale-if-error-max-secs` (86400) | A backend 5xx (including an lsphp-down 503) on a cacheable public GET serves the retained entry as `X-LiteSpeed-Cache: hit,stale-if-error` with a short `public,max-age=30` egress, Age reset, CDN-CC stripped — the CDN coalesces a 30 s burst but never pins it. Production sets 30 s. Gate: `scripts/cache_sie_test.sh`. |

| single flight | built in | Concurrent misses of one key collapse onto one leader via a `Notify`; followers wait rather than each rendering. Registering on the leader's Notify *before* the pre-wait lookup closed a lost-wakeup that once serialized misses. |

## XenForo public-shell capsules application-specific

A second, XenForo-shaped tier behind `--xf-capsule` (requires `--page-cache`): a public HTML *shell* for member requests, with the member-specific bits filled client-side by the SessionValidator/CacheOptimizer add-on. It is fail-closed by allow-list — `--xf-capsule-vhosts` empty disables it for every vhost — with route coverage by `--xf-capsule-paths` prefixes or the `all-get-classified` conservative classifier, deterministic canaries for guests and members, and its own stale window (`--xf-capsule-stale-secs`, production 3600 so a missed purge self-heals within an hour). Since 2026-10-04 members are served from the shell-capable *public* entry — `--xf-capsule-dedicated-store` (default off) restores the second dedicated copy. The capsule purge gate (`scripts/cache_capsule_purge_test.sh`) proves a tag purge invalidates the member-served shell. Metrics: `httpjet_xf_capsule_*`.

> [Diagram: xf-capsule] Guest vs logged-in member routing across the four cache surfaces. Guests use the public tier directly; logged-in members route visitor-invariant HMAC image paths (--page-cache-shared-paths) to the public tier, eligible forum routes (--xf-capsule) to the anonymized public HTML shell, and remaining opt-in pages to the per-session --page-cache-private tier.

## Generation-scoped namespaces

The first successful API publication introduces a response-cache *epoch* derived from the process-bound revision; every later generation (including SIGHUP) keys public, private and capsule entries by epoch + generation while preserving request identity and purge labels. Old in-flight renders finish in their own namespace; restart returns to the on-disk configuration's namespace, and volatile API entries cannot replay there. Obsolete entries age out under the ordinary budgets. The finished-response memo is generation-keyed for the same reason.

## Microcaching today, and what is missing

Short TTLs already work: a backend that sends `X-LiteSpeed-Cache-Control: public,max-age=2` gets every guard above and a two-second hit window (`scripts/microcache_policy_example.sh` proves miss→hit→expiry→fresh render, distinct-query isolation and `no-store` respect on an isolated instance). What does not exist yet is a **first-class route-level policy**: named profiles with deterministic precedence, route TTL floors/ceilings, per-profile eligibility, bypass matchers, declarative key dimensions, profile budgets, and bounded collapse/refresh controls. The proposed ` ` contract is specified in the source tree (`docs/microcache-policy.md`) and the current parser does not implement it yet (like any unknown element, it is ignored).

## Observing the cache

           **observe** · headers, entries, metrics
```
$ curl -sI -H 'Host: example.test' http://127.0.0.1:8080/ | grep -i x-litespeed-cache
x-litespeed-cache: miss            # ran the backend; stored if admitted
$ curl -sI -H 'Host: example.test' http://127.0.0.1:8080/ | grep -i x-litespeed-cache
x-litespeed-cache: hit             # served from cache (also: hit,stale-if-error)

$ curl -s -H "Authorization: Bearer $(cat /etc/httpjet/profile.token)" http://127.0.0.1:9090/cache-entries   # totals, per-URL-class counts, top-N by size, ram/disk line, health line
$ curl -s http://127.0.0.1:9090/metrics | grep -E '^httpjet_(pagecache|cache)_'
$ curl -sk https://127.0.0.1/__hj_cache_ready -o /dev/null -w '%{http_code}\n'   # 200 once the boot scan finished
```

Judge health by `httpjet_cache_hit_ratio_real` (non-loopback lookups), `httpjet_pagecache_{hits,misses,stores,purges,evictions}_total`, the per-vhost `httpjet_cache_{hits,misses}_by_vhost{vhost}` split (2026-10-04), `disk_{read,write,full}_errors_total`, `missing_file_invalidations_total`, `poisoned_locks_total` (nonzero = indexes may be inconsistent), and direct content checks — never by a transient raw file count. The full metric list is on Observability .

## Deploy gates

These scripts must pass before `--page-cache` ships anywhere; they run against a loopback instance and each catches a class of bug that has actually happened:

- **`cache_xurl_test.sh`** Three distinct URLs keep their own content — the front-controller poisoning class.

- **`cache_scheme_test.sh`** An HTTP-origin canonical 301 must not poison the HTTPS entry — the "Too Many Redirects" loop.

- **`cache_xhost_test.sh`** Foreign-host isolation.

- **`cache_private_test.sh`** Private-tier session isolation, plus the shared-paths case when configured.

- **`cache_persist_test.sh`** With a file tier: waits on `/__hj_cache_ready` and asserts the boot scan restored entries. It restarts the service — run once (five restarts a minute trip systemd's start limit).

- **`cache_sie_test.sh` · `cache_capsule_purge_test.sh`** Stale-if-error (freezes its own lsphp tree mid-test, the production outage shape) and the capsule purge invariant.

        !   A cache bug outlives a rollback
A wrong response cached at the CDN edge stays there for its edge TTL. If bad content shipped: confirm the origin is correct on loopback, then purge the CDN zone — a binary rollback does not remove objects already stored upstream.
