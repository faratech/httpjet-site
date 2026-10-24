# CLI reference — httpjet Documentation

> Every httpjet subcommand and serve flag, grouped and filterable, plus the environment variables the binary reads.

- **Canonical URL:** https://httpjet.net/docs/cli
- **Source Repository:** https://github.com/faratech/httpjet

---

# CLI reference

One binary, four subcommands. `--root` is the only global option. Persistent policy lives in the XML; **everything on the command line is an operational override** — addresses, workers, PHP wiring, cache budgets, feature opt-ins. This page is generated from `httpjet serve --help` of v0.1.5 plus the feature-gated flags.

## Subcommands

           **httpjet** [--root DIR] <subcommand>
```
httpjet --root /abs/root check [--strict]     # parse + summary; --strict lints topology and exits non-zero on findings (deploy gate)
httpjet --root /abs/root serve [flags…]       # bind the configured listeners and serve
httpjet --root /abs/root lsphp [flags…]       # run a standalone persistent lsphp pool (the PHP half of a zero-downtime deploy)
httpjet lsphp-reload [flags…]                 # ask a running pool to replace its worker generation without closing the listener
httpjet --version                             # httpjet 0.1.5
```

| Subcommand · flag | Default | Meaning |

| `--root ` (global) | `/usr/local/lsws` | Server root containing `conf/httpd_config.xml`. Use an absolute path. |

| `check --strict` | off | Hard-error on shared docroots, missing docroots, vhosts without an exact `vhostMap` domain; warn on apex-without-www, TLS over UDS, PROXY protocol on public binds, geo lists without a db, inert LiteSpeed elements, generic CGI contexts, unsupported auth forms; print `vhost-map-fingerprint` and fast-memo verdicts. |

| `lsphp --php-socket` | `/tmp/php8-httpjet.sock` | Socket lsphp listens on — the path `serve --lsphp-external` dials. A systemd-activated fd at the same path is adopted. |

| `lsphp --php-children` | `0` | 0 = honor the XML `PHP_LSAPI_CHILDREN`/`maxConns`; >0 overrides; values below 2 normalize to 2. |

| `lsphp --control-socket` | ` .control` | Root-only control socket used by `lsphp-reload`. Defaults beside the pool socket so a test pool can never answer the production control path. |

| `lsphp --generation-file` | ` .generation` | The 16-byte epoch + marker file external web pools map. Defaults beside the pool socket so a test pool can never advance the production epoch. |

| `lsphp-reload --control-socket` | `/run/httpjet/lsphp-control.sock` | Control socket of the running supervisor. |

| `lsphp-reload --timeout-secs` | `90` | Maximum wait for candidate readiness and old-generation drain. |

## serve flags

Type to filter; click a group to narrow. Defaults are the binary's; *(empty)* means an empty string disables the feature.

| Flag | Default | Meaning |

| Listeners & transport |

| --http-addr   | 127.0.0.1:8080 | Address for the plain-HTTP listener |

| --https-addr   | 127.0.0.1:4443 | Address for the TLS listener. Empty to disable |

| --workers   | — | Number of accept-loop workers (SO_REUSEPORT sockets). Defaults to CPUs |

| --no-core-pinning | off | Do not pin the per-core io_uring transport threads to their CPU cores. Pinning is automatic (and only) when the worker count equals the machine's CPU count; this flag is the kill switch if pinned placement worsens tail latency |

| --uring-ring   | legacy | io_uring ring setup for the per-core transport runtimes. `legacy` (default) = flagless rings — the A/B measured `coop` (COOP_TASKRUN + SUBMIT_ALL) as noise and `defer` (+SINGLE_ISSUER + DEFER_TASKRUN) as a consistent ~-2% on this virtualized guest; both stay available for other hardware. Ring size always stays default — ring memory is memlock-charged and bigger rings under the prod unit's LimitMEMLOCK bankrupt late runtimes (2026-08-27 crash-loop). Unsupported flags fall back to plain rings per-thread with a warning Values: `legacy, coop, defer`. |

| --no-multishot-accept | off | Disable multishot accept: submit one accept SQE per connection (the pre-multishot behavior) instead of one armed SQE per listener |

| --http-uds   | — | Additionally serve plain HTTP on this unix domain socket (H1 + h2c prior knowledge, one accept core). Peers have no address: ACLs and logs see fabricated loopback and the access log renders `unix:` — the socket file's mode/owner is the real access boundary. A socket-activated fd at the same path (socket unit) is adopted for zero-downtime restarts |

| --ktls [ ] | auto | Kernel-TLS on the io_uring TLS path: after the rustls handshake, upgrade the socket to kTLS so H1/H2 serve plaintext over the raw fd (kernel encrypt/decrypt), removing the userspace AEAD copy on large-body egress. Runs only on the io_uring TLS path (the default transport). `auto` (default) requires a `--features ktls` build, a physical default-route NIC, and active `tls-hw-tx-offload`; otherwise it logs one reason and stays on rustls. `on` forces kTLS for isolated benchmarking and fails when the feature is absent; `off` never enables it. A bare `--ktls` remains an alias for `--ktls=on`. TLS 1.3 only (1.2 falls back to userspace); peer KeyUpdate is handled (RX rekey + reply). STAGED — validate on an alt port before production Print help Values: `auto, on, off`. |

| Security & limits |

| --no-mtls | off | Local testing / explicit rollback only: drop the mandatory Cloudflare client-cert requirement so TLS content can be tested locally without a Cloudflare-issued client cert. Without this flag, clientVerify=2 validates every presented certificate during TLS. A peer that presents none completes the handshake, then the request pipeline rejects it before dispatch (except the loopback exemption) |

| --per-ip-rate   | — | Per-client-IP request throttle: max requests per client IP per second. 0 (default) = disabled — overrides the ` ` tuning field when set. Protects the origin from single-source floods; a shared NAT egress aggregates many visitors, so size accordingly |

| --request-decompression-extra   | (empty) | Additional request Content-Encoding values to decode before dispatch. Gzip remains enabled for compatibility; Brotli and zstd are opt-in. Accepted comma-separated values: br,zstd |

| --trusted-proxy-idle-secs   | 0 | Idle window in seconds for connections whose peer presented a VERIFIED client certificate (in prod, only Cloudflare's authenticated-origin-pull cert). CF never resumes TLS to the origin, so closing a connection it would have reused costs a full TCP + TLS + mTLS handshake. 0 keeps the normal 90 s floor for everyone; uncertified peers always keep it |

| --trusted-proxy-idle-max-conns   | 6000 | Above this many open connections, certified connections fall back to the normal idle floor (bounds idle state during a connection surge) |

| --tls-session-tickets   | 2 | TLS 1.3 session tickets issued per full handshake (rustls default 2). 0 stops minting them and shrinks the session cache to TLS 1.2 session IDs: Cloudflare's origin pull never resumes (`httpjet_tls_handshakes_resumed_total` stays 0), so the tickets only cost two records per handshake plus a cached copy of its client-cert chain |

| --auth-user-file-roots   | (empty) | Extra directories (comma-separated) where a `.htaccess` AuthUserFile may live, besides the vhost docroot |

| PHP / LSAPI |

| --no-php | off | Do not spawn lsphp; PHP requests fall back to static serving |

| --php-children   | 0 | LSAPI worker children for the lsphp pool. 0 (default) = honor the lsws config's `PHP_LSAPI_CHILDREN` / `maxConns` (true drop-in). A value > 0 is an explicit override (e.g. to cap concurrency on a shared box); values below 2 are normalized to 2 for persistent supervision |

| --php-socket   | /tmp/php8-httpjet.sock | Socket path for httpjet's OWN lsphp pool — deliberately separate from the production php8.sock so the two never contend |

| --lsphp-external   | — | EXTERNAL lsphp: connect to an lsphp master already listening on this socket (run by a separate `httpjet lsphp` process) instead of spawning one. Lets the web tier restart for a zero-downtime binary deploy without cold- starting PHP. Overrides --php-socket. Mutually exclusive with spawning |

| --lsphp-generation-file   | — | Shared lsphp generation epoch used to invalidate pooled external connections after a supervisor reload or restart. When supplied with --lsphp-external, startup fails if the 16-byte mapping cannot be opened |

| --php-max-process-time-ms   | — | Total request processing deadline in milliseconds. When exceeded, the handler closes the connection (504); in OWNED/spawn mode the monitor also kills+restarts the worker (Tier-2). Under --lsphp-external (prod) there is no monitor in this process, so only the Tier-1 504 applies — a wedged worker is NOT auto-reclaimed here. 0 = no deadline (matches the LiteSpeed XML `maxProcessTime` 0-means-unlimited convention). Absent ⇒ the XML value if present, else no deadline. Must be conservative: too low kills slow renders |

| Page cache |

| --page-cache | off | Enable the LSCache-equivalent origin full-page cache (OFF by default; opt-in / R&D). Per-vhost ` ` + `.htaccess CacheLookup` still gate each request, and the app must opt responses in via `X-LiteSpeed-Cache-Control`. With this flag absent the cache is inert |

| --page-cache-mem   | 134217728 | RAM budget (bytes) for the in-process index: entry metadata + precompressed variants + any in-RAM body. With --page-cache-store-path, persisted (tmpfs) bodies do NOT count here — they are bounded by --page-cache-disk-mem instead — so this should be sized for metadata, not body bytes. Without a file tier it is the whole body budget, as before. Default 128 MiB |

| --page-cache-disk-mem   | 2147483648 | tmpfs file-tier footprint budget (bytes) for --page-cache-store-path: the disk LRU evicts the least-recently-served entry once charged file footprint under the store path exceeds this. tmpfs IS RAM, so size it against the box's headroom (with dict compression a 2 GiB cap holds the compressed equivalent of ~7–18 GiB of pages). 0 ⇒ fall back to --page-cache-mem. Ignored without a file tier. Default 2 GiB |

| --page-cache-store-path   | none | Directory for the PERSISTENT tmpfs file tier. The default is "none": bodies stay in the in-process RAM cache and flush on restart. Pass an explicit directory such as /dev/shm/jetcache to opt into the LiteSpeed-Enterprise-style store where bodies live as files and the cache survives restarts via a boot-time warm scan. The LiteSpeed config's cacheStorePath is intentionally NOT used |

| --page-cache-integrity-key   | /usr/local/httpjet/conf/.jetcache.key | Integrity key used for persistent cache containers |

| --page-cache-integrity-required | off | Refuse to start the file tier when the integrity key cannot be installed, instead of running with untagged containers |

| --page-cache-hot-mem   | 201326592 | Byte cap of the in-RAM hot tier in front of the file store (zero-syscall zero-copy serves for the hottest bodies). Only meaningful with --page-cache-store-path. Default 192 MiB |

| --page-cache-dict   | (empty) | Path to a shared zstd dictionary used to store cached bodies far smaller. CMS pages share ~60%+ of their bytes as position-shifted boilerplate that only a dictionary captures; with this set, `cache_store` dict-compresses the stored body (the SERVED bytes stay standard zstd/br/gzip — browsers/CF can't decode a private dict). Absent/empty/unreadable ⇒ bodies are stored as plain identity (today's behaviour). Build one from a reviewed local corpus with scripts/train-pagecache-dict-from-files.sh |

| --page-cache-dict-vhost   | (empty) | Comma-separated `vhost=path` pairs: a PER-VHOST zstd dictionary, trained on that vhost's own content (train one local corpus per vhost). A shared dictionary trained on one site's boilerplate does little for a differently templated site, so each vhost compresses against its own. A vhost not listed here falls back to --page-cache-dict if set, else stores identity (today's behaviour). Example: `forum.example=conf/pagecache-forum.dict,moon.example=conf/pagecache-moon.dict` |

| --page-cache-dict-level   | (empty) | Comma-separated `vhost=level` pairs overriding the internal zstd level (1-19, default 12) of that vhost's dictionary. A vhost whose compressed bodies round to the same 4 KiB tmpfs pages at a cheaper level gains nothing from 12 (one production vhost costs 5× less at level 3 with no footprint change). A malformed pair aborts startup |

| --page-cache-vary-default   | (empty) | Comma-separated `name=value` pairs: a vary cookie carrying this value is keyed like no cookie (the app treats the default the same way). E.g. `xf_style_id=50` |

| --page-cache-opt-in-status   | (empty) | Comma-separated extra statuses (from 303, 404, 410) cached only when the app sends an explicit `X-LiteSpeed-Cache-Control: public`, with the TTL capped at 300 s and no stale windows. Empty = off (only 200/301 are cached) |

| --page-cache-303-prefixes   | (empty) | Comma-separated request-path prefixes under which an opted-in 303 may be stored (e.g. `/whats-new/`). A 303 anywhere else is never stored |

| --page-cache-stream-fill-vhosts   | (empty) | Comma-separated vhost names whose cacheable page-cache misses WITHOUT a Content-Length (progressive template output) are sent to the client as the backend writes them and stored once the backend finishes, instead of being buffered whole first. Only identity-encoded public 200s; a body that errors, is cut short or grows past the object cap is served but never stored. Empty = off |

| --page-cache-admit-threshold   | 2 | (W-TinyLFU) Base admission bar: minimum frequency a cacheable response must show before it is STORED. One request counts as ONE sighting — the on-core fast path probes uncounted and records only a hit it serves. 2 = store on the 2nd sighting (miss-miss-hit; rejects the long-tail of one-hit-wonders — the default). 1 = store on the 1st sighting (miss-hit; cache everything — now cheap with --page-cache-dict, with the store's byte LRU protecting the hot set). Size-weighting adds +1 per 256 KiB on top. Watch httpjet_cache_hit_ratio_real to tune |

| --page-cache-vary-cookies   | xf_style_variation,xf_style_id,xf_language_id | Comma-separated public-vary cookie names: a cacheable public response may declare `X-LiteSpeed-Vary: cookie=NAME,...` and the entry is keyed by these cookies' values (shared, non-sensitive prefs). Default matches the XenForo style/language set |

| --page-cache-private-cookies   | xf_session,xf_user | Comma-separated cookie names that forbid public caching if a public response tries to Set-Cookie them (session guard). Default: XenForo |

| --page-cache-private | off | Enable the per-session PRIVATE cache tier: an `X-LiteSpeed-Cache-Control: private[,max-age=N]` response from a logged-in request is stored keyed by the session cookie and served only to that same session. OFF by default — without the flag a private opt-in bypasses exactly as before |

| --page-cache-private-session-cookie   | xf_session | Request cookie whose VALUE keys a private entry's owner (the session) |

| --page-cache-private-user-cookie   | xf_user | Request cookie whose PRESENCE routes a request to the private tier (the logged-in marker; XenForo's remember cookie) |

| --page-cache-shared-paths   | (empty) | Comma-separated matchers for visitor-invariant endpoints that MEMBER (logged-in) requests may still read/populate on the PUBLIC cache tier — sharing one entry across guests and every member session instead of duplicating per session and re-rendering each member's first view through PHP. Two matcher forms: `PATH?PARAM` (path equals PATH exactly AND the query carries `PARAM=`, e.g. `proxy.php?image`) and `PATH` (path prefix, e.g. `/wf-unfurl/image`); a missing leading `/` is normalized on. ONLY list endpoints whose bytes are identical for every visitor (HMAC-gated image proxies) — never HTML pages. Malformed specs abort startup. Empty/absent = feature inert (kill switch; members keep today's private routing). GLOBAL like the other --page-cache-private-* knobs — not per-vhost — but a matching request still passes every per-vhost public gate (`vhost` cache policy, `.htaccess` CacheLookup) and every public-store guard before it is served or stored |

| --page-cache-shared-paths-canary-percent   | 100 | Deterministic percentage (0-100) of member requests matching --page-cache-shared-paths that actually route to the public tier; the rest keep today's private-tier behavior. Sticky per member (bucketed by a hash of the user/session cookie value, exactly like --xf-capsule-member-canary-percent), so one member never flickers between tiers. 100 = all matching requests |

| --page-cache-standard-vhosts   | (empty) | Comma-separated vhost names put into "standards mode": they honor a standard `Cache-Control: public, max-age=N` as a cache opt-in (OpenLiteSpeed's `checkPublicCache` equivalent), get a default public cache policy when they declare no ` ` block, and default `CacheLookup` to on — so a non-LiteSpeed app (e.g. moon.example) caches like a standards-compliant shared cache. ALLOWLIST, not a global switch: a vhost not listed is unaffected (X-LiteSpeed opt-in only), so opting one content site in can't make an unrelated vhost (status/admin API) cache a response it merely marked public. All other guards (GET-only, Set-Cookie/private-cookie, vary, status, self-redirect) always apply |

| --page-cache-stale-default-secs   | 0 | Stale-while-revalidate window (seconds) applied when the app declares none. 0 = off (serve only fresh unless the app sets stale-while-revalidate / max-stale) |

| --page-cache-stale-max-secs   | 86400 | Hard cap (seconds) on the stale-while-revalidate window honored from the app |

| --page-cache-stale-if-error-max-secs   | 86400 | Hard cap (seconds) on the stale-if-error window honored from the app |

| --page-cache-stale-if-error-default-secs   | 0 | Stale-if-error window (seconds) applied when the app declares none: how long past freshness a public entry stays servable as a backend-5xx fallback (a brief lsphp/DB outage serves slightly-stale pages instead of error pages). 0 = off (the prior behavior: only an app-declared stale-if-error window arms the fallback) |

| XenForo capsules |

| --xf-capsule | off | Enable XenForo public-shell capsules. Requires --page-cache; otherwise inert |

| --xf-capsule-vhosts   | (empty) | Comma-separated resolved vhost names allowed to serve capsules. Empty DISABLES the capsule tier for every vhost (#239 fail-closed default) |

| --xf-capsule-paths   | /,/forums/,/threads/,/whats-new/,/help/ | Comma-separated request-path prefixes eligible for capsule lookup/store |

| --xf-capsule-safe-get-mode   | prefixes | Capsule route coverage. `prefixes` honors --xf-capsule-paths; `all-get-classified` uses a conservative unsafe-route classifier Values: `prefixes, all-get-classified`. |

| --xf-capsule-stale-secs   | 86400 | Stale-while-revalidate window for capsule shell entries. This is applied to public-shell capsule stores even if the app declares a smaller window |

| --xf-capsule-canary-percent   | 100 | Deterministic percentage of eligible requests that may be served a capsule hit |

| --xf-capsule-members | off | Allow explicitly-marked member-cookie requests to receive public-shell capsules |

| --xf-capsule-member-canary-percent   | 0 | Deterministic percentage of eligible member-cookie requests that may receive capsules |

| Performance knobs |

| --no-fast-memo | off | Disable the finished-response memo on the on-core static fast path (default ON; per-thread, 1 s TTL, byte-identity-gated — see `pipeline::fast_memo`). Env `HJ_FAST_MEMO=0` is equivalent |

| --cf-send-zstd | off | Compress responses to a trusted-proxy (Cloudflare) peer as zstd, ignoring the forwarded Accept-Encoding. CF asks the origin for br/gzip but decodes an origin `Content-Encoding: zstd` and re-encodes per browser at its edge — so this hands CF the cheapest-to-produce form (zstd ≪ brotli to compress) without changing what browsers receive. Officially unsupported CF↔origin; opt-in, default off. Never applies to untrusted (direct) clients. Off ⇒ byte-identical to today |

| --rewrite-outcome-ttl-ms   | 1000 | TTL in milliseconds for the rewrite-outcome cache (memoized rewrite decisions for `path_cacheable` chains, keyed by vhost/scheme/ method/host/path/query + any keyable header vars). 0 disables the cache entirely. The default (1000 ms) matches the historical hard-coded TTL — it bounds `-f`/`-d` filesystem staleness exactly like the StatCache and lets `.htaccess` edits take effect within ~1 s |

| --rewrite-ua-classify | off | Key UA-reading rewrite chains by the bitmap of matching User-Agent RewriteConds instead of the raw UA string, when parse-time analysis proves the outcome depends on the UA only through those match results. Collapses real-world UA diversity (near-zero hit rate on raw UAs) onto a handful of outcome-cache entries. Default OFF — enabling is a deploy-time decision |

| Memory |

| --mimalloc-trim-secs   | 120 | Interval (seconds) for the background mimalloc OS-trim that calls mi_collect(force) to hand retained/cold arena pages back to the OS (counters the swap retention seen in prod after a burst). 0 = disable |

| --mimalloc-trim-threshold-mib   | 768 | Only run the mimalloc trim (periodic and after a connection close) when process RSS+swap (read from /proc/self/status) is at least this many MiB; 0 = always. Lets a healthy process skip the collect entirely. Default 768: above a cache-less steady state (~360 MiB). Size it above the deployment's healthy peak (a large page cache holds 1-2 GiB) so only genuine post-burst arena retention trips the safety-net reclaim |

| Observability |

| --metrics-addr   | 127.0.0.1:9090 | Loopback-only Prometheus metrics endpoint address. Empty to disable. Exposes the page-cache hit/miss ratio (the key operational number once --page-cache is live) plus request/connection counters |

| --telemetry-file   | (empty) | Append a cumulative per-request telemetry snapshot row to this file every --telemetry-flush-secs: durability across restarts + a self-contained time-series for the two-node A/B. Empty = no disk flush (the in-RAM aggregates + the :9090 endpoint still work). e.g. logs/telemetry.tsv |

| --telemetry-flush-secs   | 30 | Snapshot flush interval in seconds (only used when --telemetry-file is set). Fixed RAM; ~1 MB/day on disk at the default |

| --php-slow-log   | (empty) | Per-request PHP render log: a TSV line for every LSAPI request whose render TTFB exceeds --php-slow-threshold-ms, plus a 1-in-128 sample of ALL PHP requests as the population baseline — the per-URL / user-class attribution behind the lsapi_ttfb histogram. Rolls at 64 MiB, gzip archives, 30-day prune. Empty = disabled. e.g. logs/php-slow.tsv |

| --php-slow-threshold-ms   | 50 | "Slow" threshold in milliseconds for --php-slow-log |

| --request-id-header | off | Echo the per-request correlation id (also in the access/error/php-slow logs) as an `X-Request-Id` response header, so a client/CDN can join a response to the server-side logs. Off by default |

| --profile-token   | (empty) | Bearer secret required for profiling and sensitive metrics diagnostics. Empty disables those routes; ordinary metrics scraping stays available. Visible in /proc/*/cmdline; prefer `--profile-token-file` |

| Admin API |

| --admin-addr   | — | Opt-in read-only operational JSON endpoint (loopback TCP only) |

| --admin-write-addr   | — | Authenticated application-config writes on a separate loopback listener |

| --admin-token-file   | — | Private file containing a 64-character lowercase hexadecimal bearer token |

| --admin-resource-root   | — | Allowed existing filesystem root for submitted resources; repeatable |

| WAF sidecar |

| --waf-sidecar-addr   | — | Opt-in HTTP request-inspection sidecar: `unix:/path` (its listener's uid is verified) or a loopback `ip:port` (unauthenticated). The sidecar must return 204 to allow or 403 to block; absent keeps the WAF seam inert |

| --waf-sidecar-uid   | — | The uid a `unix:` sidecar must run as. Default: root or this process's uid |

| --waf-sidecar-path   | /inspect |  |

| --waf-timeout-ms   | 100 |  |

| --waf-body-max   | 65536 |  |

| --waf-concurrency   | 128 |  |

| --waf-fail-open | off | Continue when the configured WAF sidecar is unavailable or malformed. Default is fail-closed (503); this weaker policy requires explicit opt-in |

| ACME (--features acme) |

| --acme-directory   | — | ACME directory URL (HTTPS). Requires --acme-domains, --acme-store and --acme-accept-terms; nothing runs without all four. |

| --acme-domains   | — | Comma-separated DNS identifiers (1–100, ASCII A-labels). Wildcards need DNS-01. Quote a wildcard in the shell. |

| --acme-store   | — | Pre-provisioned private directory, mode 0700, owned by the service uid; holds atomic account/order/certificate snapshots and the DNS cleanup journal. |

| --acme-accept-terms | off | Explicit agreement to the CA terms of service. |

| --acme-bootstrap | off | Start with no listener default certificate; TLS handshakes fail until issuance succeeds. No self-signed placeholder. |

| --acme-reconcile-order   | — | One-shot recovery of an ambiguous newOrder from the same account's CA records. |

| --acme-dns-webhook   | — | Provider-neutral DNS controller endpoint (selects DNS-01). Requires --acme-dns-zones. |

| --acme-dns-zones   | — | Zone allowlist for TXT operations. |

| --acme-dns-token-file   | — | Bearer token for the controller: regular single-link file, mode 0600, 16–4096 printable characters. |

| --acme-test-mode | off | Loopback CA HTTP and alternate loopback validation ports for fixtures only; serving addresses must be loopback. |

| --acme-test-ca-root · --acme-test-issuer-root · --acme-dns-test-root   | — | Replace trust roots for the test CA / issuance / DNS controller without disabling verification (test mode only). |

| OCSP (--features ocsp) |

| --ocsp-responder   | — | Explicit HTTP(S) responder for every enabled certificate issuer. Applies regardless of the XML enableStapling boolean; disables TLS resumption. |

| --ocsp-required | off | Refuse new TLS handshakes without a fresh authenticated GOOD response (also implied by Must-Staple). |

| --ocsp-test-mode | off | Permit a literal-loopback responder, with loopback serving addresses only. |

| --xf-capsule-dedicated-store | off | Also store every capsule-capable page under a DEDICATED (admission-exempt) key. Off by default since 2026-10-04: members are served from the shell-capable PUBLIC entry, which keeps one copy per page and lets the admission gate govern every store |

        !   Removed flags
`--cache-peer` / `--cache-peer-fill*` (cross-node cache peers) and `--cache-purge-secret-file` are gone; the purge endpoint is loopback-gated. `--io-uring` / `--io-uring-h3` never existed as opt-ins — the io_uring transport is unconditional.

## Environment variables

| Variable | Default | Meaning |

| `HTTPJET_ACCESS_LOG_FORMAT` | combined | `json` selects JSON access lines (fixed field order: `ts, client_ip, remote_user, method, uri, protocol, status, bytes, referer, user_agent, reqid`). |

| `HTTPJET_ERROR_LOG_FORMAT` | text | `json` selects JSON error events (`schema_version 1`, credential redaction, bounded fields). Independent of the access format; does not change the stdout/journald tracing formatter. Restart to change; rotate first to avoid mixed files. |

| `HTTPJET_ACCESS_ROLLING_BYTES` / `HTTPJET_ACCESS_KEEP_DAYS` | 50 MB / 30 | Unified access-log rolling size and retention. |

| `HTTPJET_LOG_DIR` | unset | Redirect every opened log file (unified and per-vhost) into this directory so isolated test or PGO runs never touch production log paths. |

| `HTTPJET_URING_NO_IOWAIT` | unset | `1` sets `IORING_FEAT_NO_IOWAIT` on supported kernels so network-wait time on io_uring rings is not accounted as system iowait. |

| `HTTPJET_SYSLOG_TARGET` | unset | Mirror every rendered access line to syslog: `udp://host:514`, bare `host:port`, or a unix-dgram path such as `/run/systemd/journal/syslog`. Sent from the writer task; failures counted, never fatal. |

| `HTTPJET_SYSLOG_FACILITY` · `_SEVERITY` · `_RFC` · `_HOSTNAME` · `_APP_NAME` | `daemon` · `info` · `5424` · server name · `httpjet` | Syslog framing (`3164` for the BSD format). |

| `CF_SEND_ZSTD` | unset | `1` ≡ `--cf-send-zstd`. |

| `HJ_FAST_MEMO` | `1` | `0` ≡ `--no-fast-memo`. |

| `HTTPJET_OTEL` · `HTTPJET_OTEL_METRICS` | unset | `1` enables OTLP tracing / metrics (`--features otel`; startup fails if the feature is absent). |

| `HTTPJET_OTEL_SAMPLE_RATIO` | `0.01` | Root-span ratio sampler, 0–1. |

| `HTTPJET_OTEL_TRUSTED_PARENTS` | empty | Comma-separated exact gateway IPs (≤128) allowed to supply a W3C `traceparent`; everyone else starts a new root. |

| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` · `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` (+ SDK header settings) | — | Complete collector URLs, e.g. `http://127.0.0.1:4318/v1/traces`. |

| `RUST_LOG` | `info` | Tracing filter for the error log / journal, e.g. `RUST_LOG=debug,hj_rewrite=trace`. |

| `HJ_ROOT`, `HJ_URING_*`, `HJ_PEBBLE_*`, `HTTPJET_*_TEST_CHILD` | — | Test-harness variables only. |

## Exit behavior and signals

- **SIGHUP**: Reload configuration and certificates through the publication coordinator; a bad config keeps the current generation (see Admin API & reload ).

- **SIGTERM / SIGINT**: Graceful shutdown: stop accepting, GOAWAY h2, drain within the unit's `TimeoutStopSec`, close the admin coordinator, flush logs and telemetry, bounded OTel shutdown.

- **Argument validation**: Public admin binds, missing companion options (`--admin-token-file`, `--admin-resource-root`, ACME requirements), malformed `--page-cache-shared-paths` or `--page-cache-vary-default` / `--page-cache-dict-level` pairs, an unopenable generation file, or a rejected WAF configuration fail startup before any socket is bound; `--page-cache-integrity-required` additionally refuses to start the file tier when the integrity key cannot be installed.

- **Socket activation**: Inherited fds are adopted by address/path; their count must match `--workers` for TCP listeners.
