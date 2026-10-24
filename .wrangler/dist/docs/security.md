# Security & access control — httpjet Documentation

> Client identity, network ACLs, throttling, GeoIP/ASN rules, PROXY protocol trust, request decompression limits, the body budget, the WAF sidecar, and the PHP jail.

- **Canonical URL:** https://httpjet.net/docs/security
- **Source Repository:** https://github.com/faratech/httpjet

---

# Security & access control

Everything that decides **who the client is** and **who may ask**: the trusted-proxy identity model, network ACLs, the opt-in per-IP throttle, GeoIP/ASN rules from an offline source, PROXY-protocol trust, the mTLS boundary, request-body and decompression budgets, the WAF sidecar seam, and the fail-closed PHP jail. The recurring rule is **fail closed**: a control that cannot evaluate acts restrictive, never permissive.

        resolve    acl    rewrite    cache    dispatch    finalize    store

## Client identity

Every decision that depends on "the client's IP" starts from one resolved value, produced at connection admission and stored in `ReqCtx.client_ip`:

> [Diagram: client-ip] From socket peer to client identity. Forwarded headers are evidence, not identity: they count only from a peer an allow rule marks T; from anyone else they are attacker-controlled data and ignored. Every later gate — ACL, geo, throttle, mTLS exemption, logs, the cache key — reads the resolved value.

| `useIpInProxyHeader` | Forwarded headers are believed… |

| 0 | never |

| 1 / 4 | always (only safe when nothing but your proxy can reach the listener) |

| 2 (default) | only from trusted peers (`allow … T`); `CF-Connecting-IP` recognized on that path |

| 3 | as 2, for IP purposes only |

The admin write API classifies `useIpInProxyHeader` and the whole ` ` block as **restart-required**: trust must not change under a running generation without a listener transaction.

## Network ACLs

` ` evaluates `allow`/`deny` CIDR lists most-specific-wins; a trailing `T` on an *allow* rule marks a trusted proxy. ` ` globs are never served, and a malformed glob is a hard start/reload error rather than a warn-and-skip. ` ` mode `2` (owner-restricted) fails closed to never-follow. Static opens use `openat2(RESOLVE_BENEATH)` — plus `RESOLVE_NO_SYMLINKS` when policy denies symlinks — and refuse non-regular files so a planted FIFO cannot park an executor thread; a kernel without `openat2` fails closed to 404.

## Per-client-IP throttle

` ` (or `--per-ip-rate`) caps requests per client IP per fixed window (`perIpRateWindowSecs`, default 1 s); excess requests get 429. The implementation is a sharded fixed-window counter — 64 shards, 4096 tracked IPs per shard — counted exactly once per request at the fast-path serve points and at dispatch.

        !   Off by default, and fail-open
Default 0 (disabled): a shared NAT egress aggregates many real visitors behind one address, so limits are strictly opt-in. Under internal state pressure (a distinct-IP flood) the throttle evicts expired windows and then *admits untracked* — degrading fairness, never availability. `httpjet_throttle_{allowed,rejected}_total` show what it does.

## GeoIP / ASN rules

Country and network membership come from `hj-geo`, which has no runtime network access: point ` ` at a CidrList text file and refresh it on your own schedule. Ranges load into sorted, merged interval sets queried by binary search; IPv4-mapped IPv6 addresses are judged in v4 space.

           **geo source** · CidrList format
```
# country
country US 203.0.113.0/24 198.51.100.0/24
country DE 2001:db8::/32
# asn
asn 13335 203.0.113.0/24
```

`geoAllow`/`geoDeny` (ISO-2 labels) and `asnAllow`/`asnDeny` resolve to CIDR sets at state build: **deny first**; an allow list with no deny list is a **fail-closed whitelist**; an unknown label or a missing database is a hard build error, not a silent no-op; `check` warns on geo lists without a database. Both funnels (on-core and bridged) judge the *resolved* client IP, so CDN-fronted visitors are evaluated by their real address.

## PROXY protocol trust

A listener with `proxyProtocol=1` requires a PROXY v2/v1 header on every connection, consumed before TLS or the h1/h2c sniff. The listener opt-in *is* the trust decision — never enable it on a public bind (`check` warns). Headers claiming a loopback or unspecified source are refused at the parser (2026-09-16), because those addresses would otherwise unlock the mTLS exemption and the loopback purge/ready endpoints. Details: Protocol stacks .

## TLS & mTLS

- **mTLS** — `clientVerify` 1–3 attaches a webpki verifier to the *listener* CA; level 2 requires a client certificate (e.g. Cloudflare Authenticated Origin Pulls). A plaintext request for an mTLS vhost is refused unless from loopback. `--no-mtls` is for local testing only — always confirm the live flags with `systemctl show -p ExecStart` before reasoning about the boundary.

- **Revocation** — `crlFile` adds PEM CRL enforcement; absent means none, stated plainly.

- **Cipher and resumption discipline** — one TLS 1.3 suite, single-use tickets, 0-RTT off; resumption disabled when OCSP is on. TLS stream splitting was made memory-safe in the 2026-09-06 round.

- **One config, two transports** — a certificate, verifier or CRL change cannot land on TCP and miss QUIC. See TLS, ACME & OCSP .

## Request limits & resource fences

| Fence | Enforcement |

| Header and URL size, connection counts, timeouts | From ` `: `maxReqURLLen`, `maxReqHeaderSize`, `maxConnections`, `connTimeout`, `keepAliveTimeout`, `maxKeepAliveReq`. Incomplete request reads are bounded (2026-09-06); h2 frame/body deadlines apply on both loops. |

| Body size | `maxReqBodySize` server-wide, per-context override; 413 on every terminal. Chunked/decoded growth is reserved before allocation. |

| Body budget | A process-wide byte budget with owned leases attached to the allocation (including cloned/sliced `Bytes`), released on completion or connection teardown. `httpjet_body_buffer_{bytes,capacity_bytes,rejected_total}`. |

| Request decompression | Gzip by default; br/zstd opt-in. Decoded ceiling 16 MiB, 17 MiB codec workspace reservation, zstd window ≤ 2 24 , one coding only; 503 when the reservation fails, 413 past `maxReqBodySize`. → |

| Egress bandwidth | Per-connection token bucket (`bandwidthLimit`, context override); H2 paces per connection; H3 unpaced. |

| Ranges · sub_filter · `.htaccess` depth | 8 ranges / 8 MiB; 4 MiB buffer then raw pass-through; 64 levels then deny-all. |

| H2 / H3 memory | Stream and connection limits, HTTP/2 Bomb mitigation, bounded H3 retained response memory, body-reservation leases released on reset/EOF/error. |

| Page cache | 100 MiB object cap; index/file/hot budgets; identity guard; integrity-keyed persistent containers (key loaded through the same private-file validator as the admin/profiling tokens — `O_NOFOLLOW`, single link, owner root or the serving uid, no group/other bits, checked on the opened descriptor; `httpjet_pagecache_integrity_active` on :9090, and `--page-cache-integrity-required` makes an uninstallable key a boot failure); purge endpoint loopback-only and POST-only (other methods get 405 + `Allow`). |

| Reload safety | A broken config on SIGHUP keeps the old generation; out-of-range isolation modes are hard errors; the write API rejects rather than partially applies. |

| Worker pinning | Core indices clamped to `CPU_SETSIZE`. |

## WAF inspection seam

httpjet embeds no rules engine. `--waf-sidecar-addr` enables a bounded HTTP inspection call over a Unix socket (`unix:/path`, peer UID verified via `SO_PEERCRED` against `--waf-sidecar-uid`) or loopback TCP (`ip:port`) that runs after URI normalization and body limits but **before** rewrite, cache lookup, WebSocket/proxy dispatch, LSAPI, FastCGI and static serving — so a warm cache hit is still inspected. The default failure policy is **closed** (503); `--waf-fail-open` must be chosen explicitly and logs every bypass (an explicit 403 from the sidecar always blocks). The full contract is on Extending httpjet .

## The PHP jail

suEXEC (` `, off by default, `uidMin`/`gidMin` floors; uid 0 always rejected), chroot (`chrootMode` 0–2) and optional namespaces (`pid` accepted but not honored). A configured jail that turns out unsafe disables PHP for that vhost with a 503 — never unjailed, never falling through to static. Workers never run as root and a setuid `lsphp` is refused. See LSAPI & PHP .

## Control surfaces

| Surface | Guard |

| `/__hj_cache_purge`, `/__hj_cache_ready` (main listeners) | Raw TCP peer must be loopback — no shared secret; CDN-relayed or LAN peers get 404. The purge endpoint answers POST only (405 + `Allow` otherwise) and honors every `X-LiteSpeed-Purge` header line; the ready probe answers GET/HEAD. PROXY headers cannot claim loopback; a `unix:` listener opens these endpoints to any local process (`check` warns — the socket mode is the boundary). |

| `--metrics-addr` (`/metrics`, `/cache-entries`, `/__mimalloc-stats`, `/__alloc-count`, `/debug/pprof/profile`) | Loopback-only by default; `/metrics` is open on loopback, while `/cache-entries`, `/__mimalloc-stats`, `/__alloc-count` and profiling require `Authorization: Bearer ` matching `--profile-token-file` (returning 403 when unset or mismatched). Do not reverse-proxy it. |

| `--admin-addr` (read-only `/v1/status`) | Loopback TCP only (argument parsing rejects anything else); Host must be a loopback authority; Origin headers and bodies rejected; no secrets in the schema. |

| `--admin-write-addr` (`/v1/revision`, `/v1/config[/validate]`) | Loopback + bearer token from a 0400/0600 single-link file (constant-time compare) + exact `If-Match` revision + explicit resource roots for any filesystem reference. |

| LSAPI control and generation files | Root-only control socket; generation file mmap'd read-only by web pools; non-group-writable parent directory required. |

| ACME store · DNS token · integrity key · admin token | Owner and mode checks on the descriptor, no symlink following, bounded reads. |

## Audit posture

Seven whole-codebase review rounds plus the sixteen-round October bug-bash campaign have landed on top of the August hardening pass: **2026-08-30** (issues #362–#368: no exploitable High, five low/informational fixes), **2026-09-06** (five confirmed medium/low findings: H2/H3 body-reservation leaks, retained-body and gzip-expansion accounting, scoped Basic-auth merging, public caching of authenticated static responses, UA-classification memo dependencies), **2026-09-16** (twelve fixes: h2 monoio deadlines, sendfile stall bounds, unreadable `.htaccess` fail-closed, PROXY loopback claims, `[P]` target screening, CGI-var deny-list, never-root and setuid refusal, isolation-mode hard errors, restart-required trust fields, seccomp ptrace gating, Origin-varied cache entries, CPU_SETSIZE clamp and single Content-Length), **2026-10-06** (issues #560–#575, released as 0.0.4: the H3 connection budget is charged at `Connected` with stateless Retry under handshake pressure, RFC 9112 request-target/Host enforcement at the H1 intake, one rule for which client headers reach PHP, `AuthUserFile` confined to the docroot with constant-cost verification and a bcrypt cost cap, POST-only purge + validated integrity keys + bounded control surfaces, quinn GHSA-53rm-773f-4q8c, new `qpack_decode`/`proxy_protocol_parse`/`lscache_control` fuzz targets, and a daily RustSec dependency-advisory CI job), **0.0.5** (15 findings #579–#593), **0.0.6** (2026-10-13 audit #594–#611: truncated LSAPI/FastCGI response aborts, HPACK over-cap converted to a stream error so dynamic tables stay in sync on pooled CDN connections, H3 streaming backpressure, OCSP responder TLS SAN verification), and **0.0.7–0.1.5** (2026-10-14..24 bug-bash rounds 1–16 and audit #1138: OLS XML wildcard/routing parity, APR1/MD5-crypt htpasswd + per-client auth rate limit, `.htaccess` `Expires*` + `Header merge`, per-URL cookie vary, SHA-256 vary hashing, Unix-socket WAF peer-UID verification, Bearer token gating on `/cache-entries` and `/__mimalloc-stats`, `lsapilib-hardening.patch` + `BEGIN_REQUEST` body scan, time-refilled H2 rapid-reset budget and send-stall resets, rustls 0.23.46 and webpki emSign distrust). Each round's regressions are in the tree; gates re-run after each: full workspace suite (3,019 tests), fast-memo parity, cache xurl/scheme/xhost, h2spec 146/146.

        i   Reporting
Security issues: use private responsible disclosure per `SECURITY.md` in the repository, not a public issue. Findings are reconciled against source and regression tests; none of this is evidence of production exploitation or a proof of absence of other vulnerabilities.
