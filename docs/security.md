# Security & access control — httpjet Documentation

> Control who can reach your sites.

- **Canonical URL:** https://httpjet.net/docs/security
- **Source Repository:** https://github.com/faratech/httpjet

---

# Security & access control

Decide **who the client is** and **who may ask** here. The posture is **fail closed**: a control that cannot evaluate acts restrictive. One exception: the opt-in throttle fails open (see Throttle ).

        resolve    acl    rewrite    cache    dispatch    finalize    store

## Client identity

Resolve one client IP at connection admission. Store it in `ReqCtx.client_ip`. Every later gate reads that value.

> [Diagram: client-ip] From socket peer to client identity. Forwarded headers are evidence, not identity: they count only from a peer an allow rule marks T; from anyone else they are attacker-controlled data and ignored. Every later gate — ACL, geo, throttle, mTLS exemption, logs, the cache key — reads the resolved value.

| `useIpInProxyHeader` | Forwarded headers are believed… |

| 0 | never |

| 1 / 4 | always. Limit: only safe when only your proxy can reach the listener. |

| 2 (default) | only from trusted peers (`allow … T`). Limit: `CF-Connecting-IP` counts on that path. |

| 3 | as 2, for IP purposes only |

The admin write API marks `useIpInProxyHeader` and ` ` **restart-required**. Trust never changes under a running generation.

## Network ACLs

**Summary:** CIDRs decide access most-specific-wins; static opens stay beneath the docroot.

Evaluate ` ` CIDRs most-specific-wins; trailing `T` marks a trusted proxy. Never serve ` ` globs; malformed globs hard-fail. Mode `2` fails closed to never-follow.

Open statics with `openat2(RESOLVE_BENEATH)` (plus `RESOLVE_NO_SYMLINKS` when denying symlinks). Refuse non-regular files. Without `openat2`, walk `O_NOFOLLOW` components beneath the docroot (v0.1.10).

## Per-client-IP throttle

Cap requests per client IP per fixed window with ` ` (or `--per-ip-rate`). Set the window with `perIpRateWindowSecs` (default 1 s). Excess requests get 429. Count once per request, in 64 shards with 4096 tracked IPs per shard.

        !   Off by default, and fail-open
Default 0 (disabled): a shared NAT egress aggregates many visitors behind one address. Under pressure the throttle evicts expired windows, then *admits untracked*. It degrades fairness, never availability. Watch `httpjet_throttle_{allowed,rejected}_total`.

## GeoIP / ASN rules

Get country/network membership from `hj-geo` (no runtime network access). Point ` ` at a CidrList file; ranges binary-search as merged intervals. Judge IPv4-mapped IPv6 in v4 space.

           **geo source** · CidrList format
```
# country
country US 203.0.113.0/24 198.51.100.0/24
country DE 2001:db8::/32
# asn
asn 13335 203.0.113.0/24
```

Resolve `geoAllow`/`geoDeny`/`asnAllow`/`asnDeny` at build: **deny first**; allow-alone is a **fail-closed whitelist**. Unknown labels or a missing database hard-fail. Judge the *resolved* IP in both funnels.

## PROXY protocol trust

Require a PROXY v2/v1 header on every connection to a `proxyProtocol=1` listener. Consume it before TLS or the h1/h2c sniff. The opt-in *is* the trust decision — never enable it on a public bind (`check` warns). Refuse loopback or unspecified source claims at the parser (2026-09-16). Details: Protocol stacks .

## TLS & mTLS

- **mTLS** — set `clientVerify` 1–3 for a webpki verifier on the *listener* CA; level 2 requires a client certificate. Limit: `--no-mtls` is local testing only; confirm flags with `systemctl show -p ExecStart`.

- **Revocation and resumption** — add `crlFile` for PEM CRL enforcement; absent means none. Limit: one TLS 1.3 suite, 0-RTT off, single-use tickets only without client verification, resumption off with OCSP.

- **One config, two transports** — a certificate, verifier or CRL change lands on TCP and QUIC together. Limit: see TLS, ACME & OCSP .

A plaintext request for an mTLS vhost is refused unless from loopback. TLS stream splitting was made memory-safe in the 2026-09-06 round.

## Request limits & resource fences

| Fence | Enforcement |

| Header, URL, connections, timeouts | From ` `. Limit: `maxReqURLLen`, `maxReqHeaderSize`, `maxConnections`, `connTimeout`, `keepAliveTimeout`, `maxKeepAliveReq`. |

| Body size | `maxReqBodySize`, per-context override. Limit: 413 on every terminal; reserve decoded growth first. |

| Body budget | Process-wide byte budget with owned leases. Limit: released on completion or teardown; see `httpjet_body_buffer_*`. |

| Request decompression | Gzip default; br/zstd opt-in. Limit: 16 MiB ceiling, 17 MiB workspace, zstd window ≤ 2 24 , one coding ( → ). |

| Egress bandwidth | Per-connection token bucket (`bandwidthLimit`). Limit: H2 paces per connection; H3 unpaced. |

| Ranges · sub_filter · `.htaccess` | 8 ranges / 8 MiB. Limit: 4 MiB then raw pass-through; 64 levels then deny-all. |

| H2 / H3 memory | Stream and connection limits, Bomb mitigation. Limit: leases release on reset/EOF/error. |

| Page cache | 100 MiB object cap; index/file/hot budgets; identity guard. Limit: integrity key validated like admin tokens; purge is loopback POST-only. |

| Reload safety | Broken SIGHUP config keeps the old generation. Limit: out-of-range isolation modes are hard errors. |

| Worker pinning | Core indices clamped to `CPU_SETSIZE`. Limit: no pin past the set size. |

Incomplete request reads stay bounded (2026-09-06). H2 frame/body deadlines apply on both loops. Judge integrity state by `httpjet_pagecache_integrity_active`; `--page-cache-integrity-required` makes an uninstallable key a boot failure.

## WAF inspection seam

httpjet embeds no rules engine. Enable `--waf-sidecar-addr` for a bounded call over a Unix socket (peer UID via `SO_PEERCRED` vs `--waf-sidecar-uid`) or loopback TCP. Run it before rewrite, cache and dispatch, so warm hits still get inspected. Default failure is **closed** (503); `--waf-fail-open` is explicit. A sidecar 403 always blocks. See Extending httpjet .

## The PHP jail

Configure suEXEC (` `, off by default; uid 0 always rejected), chroot (`chrootMode` 0–2) and namespaces (`pid` accepted, not honored). An unsafe jail disables PHP with 503 — never unjailed. Workers never run as root. See LSAPI & PHP .

## Control surfaces

**Summary:** every control surface requires loopback, a token, or both — check the guard before you expose one.

| Surface | Guard |

| `/__hj_cache_purge`, `/__hj_cache_ready` | Raw TCP peer must be loopback. Limit: POST-only purge (405 + `Allow`); ready takes GET/HEAD; a `unix:` listener opens both to local processes. |

| `--metrics-addr` (`/metrics`, `/cache-entries`, `/__mimalloc-stats`, `/__alloc-count`, `/debug/pprof/profile`) | Loopback-only by default. Limit: `/metrics` open on loopback; the rest need a Bearer token matching `--profile-token-file` (403 when unset). |

| `--admin-addr` (`/v1/status`) | Loopback TCP only. Limit: loopback Host required; Origin headers and bodies rejected. |

| `--admin-write-addr` (`/v1/revision`, `/v1/config[/validate]`) | Loopback + Bearer token from a 0400/0600 single-link file. Limit: constant-time compare, exact `If-Match`, explicit resource roots. |

| LSAPI control and generation files | Root-only control socket. Limit: web pools mmap the generation file read-only; parent must not be group-writable. |

| ACME store · DNS token · integrity key · admin token | Owner and mode checks on the descriptor. Limit: no symlink following, bounded reads. |

## Audit posture

| Date | Scope | Headline |

| 2026-08-30 | #362–#368 | No exploitable High. Limit: five low/informational fixes. |

| 2026-09-06 | Five findings | H2/H3 reservation leaks, gzip accounting, Basic-auth merging. Limit: plus authenticated-static caching and UA memo keys. |

| 2026-09-16 | Twelve fixes | Unreadable `.htaccess` fail-closed, PROXY loopback claims, `[P]` screening. Limit: plus CGI deny-list, never-root, single Content-Length. |

| 2026-10-06 | #560–#575 (0.0.4) | H3 budget at `Connected`, RFC 9112 intake, docroot-confined `AuthUserFile`. Limit: plus POST-only purge, fuzz targets, RustSec CI. |

| — | 0.0.5 (#579–#593) | 15 findings. |

| 2026-10-13 | 0.0.6 (#594–#611) | Truncated LSAPI/FastCGI aborts, HPACK over-cap stream error. Limit: plus H3 backpressure, OCSP SAN checks. |

| 2026-10-14..24 | 0.0.7–0.1.5, bug-bash 1–16, #1138 | OLS parity, APR1/MD5-crypt + auth rate limit, SHA-256 vary hashing. Limit: plus WAF peer-UID, rustls 0.23.46. |

| 2026-10-25 | 0.1.10 bug/perf bash | 23 issues, 22 fixed, one closed by decision. Limit: no-follow walk, H1 send deadlines, dropped-POST replay. |

Gates re-run after each round: full suite (3,068 tests at 0.1.10), fast-memo parity, cache xurl/scheme/xhost, h2spec 146/146.

        i   Reporting
Use private responsible disclosure per `SECURITY.md`, not a public issue. Findings reconcile against source and regression tests. Nothing here proves production exploitation, or absence of other vulnerabilities.
