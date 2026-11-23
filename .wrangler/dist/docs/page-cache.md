# Page cache — httpjet Documentation

> How full pages are cached and cleared.

- **Canonical URL:** https://httpjet.net/docs/page-cache
- **Source Repository:** https://github.com/faratech/httpjet

---

# The origin page cache

Use this opt-in full-response cache to serve stored pages without the backend. It speaks the LiteSpeed protocol — `X-LiteSpeed-Cache-Control`, `X-LiteSpeed-Tag`, `X-LiteSpeed-Vary`, `X-LiteSpeed-Purge` — so LSCache-tuned sites need no app change.

        resolve    acl    rewrite    cache    dispatch    finalize    store

## Overview

`hj-pagecache` is the store: sharded LRU, W-TinyLFU admission, key/vary/tag indexes and the HJPC file tier. The `lscache/` glue runs `cache_lookup` before any backend, and `cache_store` after `finalize_response`. Both stay inert without `--page-cache`.

           Off by default · app opt-in per response
           Keyed by the ORIGINAL URI · identity-guarded
           Public · private · shared-path tiers
           RAM index · hot tier · tmpfs file tier
           Tag purge · stale-while-revalidate · stale-if-error · single flight
           Per-vhost dictionaries · survives restarts

        i   Two memos, kept apart
Static files use a separate default-on per-worker memo (1 s TTL) — see Rewrite → Two caches . It never serves page-cache entries. Since 0.1.11 the page cache has its own default-on response memo, fenced by freshness, Age and purge epochs (`--no-page-cache-response-memo` disables it). With the default `coop` ring it measured +27.6% RPS / −26.7% CPU per cookieless H2 hit — see Performance → 0.1.11 .

## Opt-in by the app

Store only when the app says so. Gate lookups with ` `, `CacheLookup` and `[E=no-cache]`; gate storage with the response header. `respectCacheable`/`enablePostCache` parse but do not enforce.

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

**Standards mode.** List vhosts in `--page-cache-standard-vhosts` for OLS `checkPublicCache` shape: plain `Cache-Control: public` opts in. All other guards still apply.

        !   Backends cannot self-purge
Strip `X-LiteSpeed-*` from proxied upstream responses. Only LSAPI/PHP responses and loopback purge callers shape cache behavior.

## The lookup path

> [Diagram: cache-lookup] Choosing a cache route. This diagram assumes the request has passed the initial lookup gates. Public and private paths still apply their respective policy and response guards.

> [Diagram: cache-freshness] Finding a response. The original URI and vary dimensions form the key; identity is checked before serving. Misses may share a single backend render, while stale entries follow their configured windows.

With private caching enabled, user or session markers select private routing when a session is available and the vhost permits it. Missing sessions or a disabled private policy bypass the cache; an admitted allowlisted invariant path uses public routing. With the private tier disabled, public routing still applies its other cache eligibility guards. Key on the *original* URI. Serve only on identity match. Serve stale in-window with background refresh; collapse concurrent misses.

## Keys, tiers and the identity guard

key & tier explorer — change the request and the app's header

           method  GET  HEAD  POST
           scheme  https  http
           host
           path
           query
           vary cookie xf_style_id

           login markers  none  non-empty xf_session  xf_user without session
             --page-cache-private on
             path matches shared allowlist and canary admits it
             the .htaccess chain reads Origin

          X-LiteSpeed-Cache-Control on the response

Illustrative routing: assumes the vhost permits caching, the private policy is enabled when selected, and shared-path canary selection succeeds. Other request and response guards still apply. The key shown is not its byte layout.

        !   Invariant 1 · key by the original URI
Key on `orig_path`/`orig_query`, never the rewrite-resolved path. XenForo rewrites every page to `/index.php`; resolved-path keying once served one page to everyone.

Every entry records its host and raw request path. Serve only when both match; a collision degrades to a miss (`httpjet_pagecache_key_id_collisions_total`), never wrong content. Add three key dimensions: **per-URL cookie vary** (`X-LiteSpeed-Vary: cookie=NAME`, plus `--page-cache-vary-cookies`; header vary hashes with SHA-256), **Origin** when the chain reads it (2026-09-16), and **epoch + generation** from the first API publication . Only the canonical Host spelling reads or populates an entry. An absent Origin keeps the historic base key.

| Tier | Routed when | Keyed by | Notes |

| **Public** | No login marker, or private tier disabled; also admitted shared paths | vhost · scheme · host · original path?query · vary cookies (· Origin) | Strip `Set-Cookie` and `X-LiteSpeed-*`. A private-cookie response never stores. |

| **Private** | Private tier enabled, non-empty session, and private policy allowed | public key + session-cookie value | Never touches public entries. TTL capped at 300 s. |

| **Shared paths** | Member cookie + `--page-cache-shared-paths` match, within canary % | public key | Visitor-invariant HMAC image endpoints only. Never HTML; malformed specs abort startup. |

| **Bypass** | Non-GET/HEAD, `[E=no-cache]`, or private routing without a session or permission | — | Counted as `httpjet_cache_bypass`. |

## The store path and admission

> [Diagram: cache-store] Store gates. Responses must pass request, response, policy, vary and size checks. Public entries also pass frequency admission; private entries do not. The file tier is optional.

A response must pass the request, status, policy, vary, self-redirect, purge-race and size checks before it can be stored. Public entries must also pass the private-cookie guard and W-TinyLFU admission; private entries use session identity and skip the admission threshold. The file tier is optional.

### W-TinyLFU admission

> [Diagram: admission] For public entries, a fixed-memory frequency sketch rejects one-hit wonders: at the default threshold of 2 an eligible URL can be stored on its second sighting. One request is ONE sighting — the on-core fast path probes uncounted and records only a hit it serves. Size weighting adds +1 per 256 KiB. With dictionaries making storage cheap, --page-cache-admit-threshold 1 permits a first-sighting store for an eligible public response below 256 KiB. Tune by httpjet_cache_hit_ratio_real and httpjet_cache_admit_ratio.

Reject one-hit wonders with a fixed-memory frequency sketch. For public entries at threshold 2 (default), the second sighting can be stored; one request counts as one sighting. Size weighting adds +1 per 256 KiB. Set `--page-cache-admit-threshold 1` to permit first-sighting storage for eligible public bodies below 256 KiB. Tune by `httpjet_cache_hit_ratio_real` and `httpjet_cache_admit_ratio`.

Decline a cacheable 3xx whose `Location` is the request's own URL (hosts normalized without port). Re-check that guard at serve time; the XF add-on refuses at a third layer. De-cache cacheable redirects from the CDN via the deny-CDN-cache transform.

## Storage tiers & the file tier

> [Diagram: cache-tiers] Dual-cap tier model. The RAM index describes every entry; with a file tier, bodies live as immutable HJPC files and are charged metadata-only against --page-cache-mem while their footprint counts against --page-cache-disk-mem. A small hot tier fronts the files. Every teardown path (evict, expire, purge, replace) is synchronous under the shard lock; only the unlink(2) syscall is deferred to just after the lock is released.

Default to in-RAM only; restarts flush it. Set `--page-cache-store-path /dev/shm/jetcache` (or `default`/`jetcache`) for a **tmpfs-primary** tier. `PageStore::store` normally writes eligible bodies as immutable files. If the file store cannot open, the cache runs in RAM. An individual persistence failure can also leave that entry in RAM. HJPC containers authenticate with `--page-cache-integrity-key`. The LiteSpeed `cacheStorePath` parses but stays unused.

- **Survives restarts.** A boot scan (up to 8 threads) rebuilds the index — scan duration depends on the store contents and host. `/__hj_cache_ready` returns 503 while scanning, then 200 + `x-hj-cache-ready: 1` + `x-hj-cache-loaded: N`.

- **Reclaim invariant.** Live entries resolve to live bodies. A missing file fails closed to a miss and counts `disk_read_err`.

- **Durable purges.** Purges remove matching entries and unlink their files. The file tier persists purge state for restart recovery and logs write failures.

- **Dictionaries compress at store.** A background task dict-recompresses the identity birth copy (~3.5–9× smaller), never inline. Incompressible types never encode; vhosts in `--page-cache-egress-at-rest-vhosts` skip this job (0.1.6).

budget calculator — how many pages fit?

           --page-cache-mem (MiB)
           --page-cache-disk-mem (MiB)
           --page-cache-hot-mem (MiB)
           typical page (KB, identity)
           dictionary ratio ×

Rules of thumb only (≈6 KB metadata per entry, ratio 3.5–9× on forum HTML). tmpfs *is* RAM. The starting values in this calculator match the defaults.

| Flag | Default | Meaning |

| `--page-cache-mem` | 128 MiB | RAM index budget. File-tier bodies charge metadata-only here. |

| `--page-cache-disk-mem` | 2 GiB | tmpfs footprint cap. 0 falls back to `--page-cache-mem`. |

| `--page-cache-hot-mem` | 192 MiB | Hot bodies in RAM before files. Cold hits pay one tmpfs read + decode. |

| `--page-cache-store-path` | *none* | Enables the file tier. Deploy gate `ALLOW_PAGE_CACHE_FILE_TIER=1`. |

| `--page-cache-dict-vhost` / `--page-cache-dict` / `--page-cache-dict-level` | — | Per-vhost / fallback dictionaries; level 1–19 (default 12). Rotation needs a restart. |

| `--page-cache-vary-default` | *empty* | `name=value` keyed as absent. E.g. `xf_style_id=50`. |

| `--page-cache-opt-in-status` / `--page-cache-303-prefixes` | *empty* | Cache 303/404/410 on explicit public opt-in only. TTL ≤ 300 s, no stale; default caches 200/301. |

| `--page-cache-stream-fill-vhosts` | *empty* | Stream length-less public 200 misses frame by frame. Errors and over-cap bodies never store. |

| `--page-cache-egress-at-rest-vhosts` | *empty* | Keep dictionary-less zstd at rest; skip re-encode. Stored copy stays larger; capsules keep the dictionary path. |

        !   Dictionaries can retain content
Train only on public, logged-out pages of one vhost. Served bytes are never dictionary-encoded. A missing compatible dictionary is a miss, never undecodable output.

## Variants, compression and egress

See Compression → cache interaction . Variant and egress rules now live there.

## Purge

Invalidate by tag. Emit `X-LiteSpeed-Purge: tag=T1234` (or `*`) on a response — every header line counts (0.0.5) — or POST the loopback endpoint. Reject a store that started before a purge and finished after it (`httpjet_pagecache_store_purge_rejections_total`).

           **purge** · loopback-only endpoint
```
curl -s -X POST -H 'x-litespeed-purge: tag=T1234' -o /dev/null -w '%{http_code}\n' http://127.0.0.1/__hj_cache_purge   # 204
curl -s -X POST -H 'x-litespeed-purge: *' http://127.0.0.1/__hj_cache_purge                                          # everything
```

Gate the endpoint on a **raw loopback TCP source** — no secret, no per-URL purge. CDN-relayed or LAN requests get 404. The endpoint answers **POST only** (2026-10-07); other methods get 405 + `Allow`. The former `--cache-peer` fan-out and `--cache-purge-secret-file` are gone.

## Stale policies & single flight

| Mechanism | Flags | Behavior |

| stale-while-revalidate | `--page-cache-stale-default-secs` (0), `--page-cache-stale-max-secs` (86400) | Serve stale now; refresh in background via full dispatch. An `X-LiteSpeed` opt-in never merges standard `Cache-Control` stale values (2026-10-04). |

| stale-if-error | `--page-cache-stale-if-error-default-secs` (0), `--page-cache-stale-if-error-max-secs` (86400) | Serve the retained entry on backend 5xx as `hit,stale-if-error`. `public,max-age=30` egress, Age reset; production sets 30 s. |

| single flight | built in | Collapse concurrent misses onto one leader via `Notify`. Followers wait instead of rendering. |

## XenForo public-shell capsules application-specific

Enable `--xf-capsule` (requires `--page-cache`) for a public HTML *shell* on member requests; the add-on fills member bits client-side. Empty `--xf-capsule-vhosts` disables every vhost. Cover routes with `--xf-capsule-paths` or `all-get-classified`. Set `--xf-capsule-stale-secs` (production 3600). Since 2026-10-04 members use the *public* entry; `--xf-capsule-dedicated-store` (default off) restores a dedicated copy.

> [Diagram: xf-capsule] Cache surfaces for XenForo. The arrows identify possible paths rather than evaluation order. Each surface has its own request, policy and response gates; ineligible requests bypass it. The capsule shell is anonymized and member state is hydrated in the browser.

## Generation-scoped namespaces

Derive an *epoch* from the process-bound revision at first API publication. Key all entries by epoch + generation (including SIGHUP). In-flight renders finish in their own namespace; restarts return to the on-disk namespace. Obsolete entries age out normally.

## Microcaching today, and what is missing

Apps can set short TTLs with an explicit cache header such as `public,max-age=2`. The usual eligibility and admission checks still apply. Route-level XML microcache policy is unimplemented.

## Observing the cache

           **observe** · headers, entries, metrics
```
$ curl -fsS -D - -o /dev/null -H 'Host: example.test' http://127.0.0.1:8080/ | grep -i x-litespeed-cache
x-litespeed-cache: miss            # ran the backend; stored if admitted
$ curl -fsS -D - -o /dev/null -H 'Host: example.test' http://127.0.0.1:8080/ | grep -i x-litespeed-cache
x-litespeed-cache: hit             # served from cache (also: hit,stale-if-error)

$ curl -s -H "Authorization: Bearer $(cat /etc/httpjet/profile.token)" http://127.0.0.1:9090/cache-entries   # totals, per-URL-class counts, top-N by size, ram/disk line, health line
$ curl -s http://127.0.0.1:9090/metrics | grep -E '^httpjet_(pagecache|cache)_'
$ curl -sk https://127.0.0.1/__hj_cache_ready -o /dev/null -w '%{http_code}\n'   # 200 once the boot scan finished
```

Judge health by `httpjet_cache_hit_ratio_real` and `httpjet_pagecache_{hits,misses,stores,purges,evictions}_total` (per-vhost split, 2026-10-04). Never judge by raw file count. Full list: Observability .

## Deploy gates

Pass these loopback scripts before shipping `--page-cache`:

- **`cache_xurl_test.sh`** Three distinct URLs keep their own content — the front-controller poisoning class.

- **`cache_scheme_test.sh`** An HTTP-origin canonical 301 must not poison the HTTPS entry — the "Too Many Redirects" loop.

- **`cache_xhost_test.sh`** Foreign-host isolation.

- **`cache_private_test.sh`** Private-tier session isolation, plus the shared-paths case when configured.

- **`cache_persist_test.sh`** With a file tier: waits on `/__hj_cache_ready` and asserts the boot scan restored entries. It restarts the service — run once (five restarts a minute trip systemd's start limit).

- **`cache_sie_test.sh` · `cache_capsule_purge_test.sh`** Stale-if-error (freezes its own lsphp tree mid-test, the production outage shape) and the capsule purge invariant.

        !   A cache bug outlives a rollback
A wrong response cached at the CDN edge stays there for its edge TTL. If bad content shipped: confirm the origin is correct on loopback, then purge the CDN zone — a binary rollback does not remove objects already stored upstream.
