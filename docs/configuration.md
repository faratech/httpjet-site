# Configuration — httpjet Documentation

> Look up every setting in the XML reference.

- **Canonical URL:** https://httpjet.net/docs/configuration
- **Source Repository:** https://github.com/faratech/httpjet

---

# Configuration reference

httpjet is configured by a **LiteSpeed-compatible XML tree** selected with `--root`: `conf/httpd_config.xml`, the per-vhost files it references, and `conf/mime.properties`. An existing LiteSpeed or OpenLiteSpeed tree works as-is. On that base httpjet layers its own opt-in directives — marked httpjet — which LiteSpeed ignores. Operational overrides live on the command line , not in the XML.

## The configuration tree

With no `--root`, httpjet uses `/usr/local/lsws`. You get LiteSpeed value semantics:

- Variables `$SERVER_ROOT`, `$HOSTNAME`, `$VH_ROOT`, `$VH_NAME` substitute. Limit: `$DOC_ROOT` and `$VH_DOMAIN` need vhost resolution.

- Sizes accept `K`/`M`/`G`/`B` suffixes. Limit: times use bare seconds.

- Bounded integers fall back to defaults when invalid. Limit: `setUIDMode`/`chrootMode` errors instead (2026-09-16).

- Booleans accept `1`, `2`, or `true`. Limit: symlink value `2` never follows.

- Unknown elements load silently. Limit: partial `allowOverride`, vhost `clientVerify`, rewrite maps, `phpIniOverride`, `enableHotlinkCtrl`, and `forceStrictOwnership` refuse the load.

           **layout** · a server root
```
/usr/local/lsws/
├── conf/
│   ├── httpd_config.xml          # server, tuning, security, listeners, extProcessors, vhost declarations
│   ├── mime.properties           # mime/type = ext1, ext2   (best-effort)
│   └── vhosts/example.test.xml   #  : docroot, contexts, rewrite, vhssl, cache, logging
└── logs/
```

> [Diagram: config-inheritance] Configuration cascade and parse-time memo classification. Server-wide defaults in httpd_config.xml cascade into each  , then into longest-prefix   overrides and the per-directory .htaccess chain, where static analysis computes the MemoClass eligibility verdict reported by httpjet check.

## Checking a configuration

           **check**
```
httpjet --root /abs/root check            # summary: listeners, vhost map, fast-memo verdicts, warnings
httpjet --root /abs/root check --strict   # same lint output; exits non-zero on lint errors (warnings never fail)
```

You run check under the service identity too. Readable-by-root does not prove readable at runtime. The write API runs the same normalization. It also refuses DTDs, nesting over 64 levels, over 128 vhosts, and XML over 1 MiB. Disk files cap at 16 MiB per file (`ConfigError::TooLarge`, 2026-10-06).

## Server and tuning

| Directive | Default | Meaning |

| `serverName` | `$HOSTNAME` | Server identity (else `localhost`). |

| `user` / `group` | `nobody` | Run-as credentials (the systemd unit usually sets these). |

| `indexFiles` | `index.html` | Directory-index candidates (vhost may override). |

| `useIpInProxyHeader` | `2` | Client-IP trust mode. Limit: 0 never, 1 always, 2 trusted peers, 3 as 2, 4 always. |

| ` ` | `0` | HTTP/3 master switch; also drives `Alt-Svc`. Needs the UDP port published. |

| ` maxConnections` | `65000` | Connection cap. |

| `connTimeout` / `keepAliveTimeout` | `60` / `5` s | Idle / keep-alive timeouts. |

| `maxKeepAliveReq` | `1000` | Requests per keep-alive connection (0 or 1 disables keep-alive, matching OpenLiteSpeed). |

| `maxReqURLLen` / `maxReqHeaderSize` | `8192` / `16380` | URL and header-block caps. |

| `maxReqBodySize` | `100M` | Server-wide request-body cap (413); per-context override below. |

| `perIpRate` · `perIpRateWindowSecs` httpjet | `0` · `1` | Per-client-IP request throttle (0 = off) and its fixed window. 429 on exceed; fail-open under state pressure. |

| `bandwidthLimit` httpjet | `0` | Per-connection egress throttle, bytes/s (0 = unlimited). H2 paces per connection; H3 unpaced. |

| `maxCachedFileSize` / `totalInMemCacheSize` | `4M` / `4G` | Small-file in-memory promotion threshold and budget (`CacheCaps`); the budget is clamped to 1 GiB. |

| `maxMMapFileSize` / `totalMMapCacheSize` | `256K` / `2G` | Sizes the static RAM store. Limit: per-file cap uses the larger value; budgets clamp to 1 GiB + 2 GiB. |

| `fileETag` | `28` | ETag bitmask (INODE|MTIME|SIZE → `"size-mtime-inode;;;"`); 0 = no ETag. |

| `enable{Gzip,Br,Zstd}Compress` (+`Dyn`) | on | Static/dynamic compression per codec; `zstdCompressLevel` 3, `brCompressLevel` 5. |

| ` enableExpires`, `expiresByType` | off | Expiry rules like `image/*=A604800`. Limit: authenticated responses default to `private, no-store`. |

| ` expireInSeconds` · `privateExpireInSeconds` · `cacheStatusCode` · `enablePostCache` | `900` · `0` · `200,301` · off | Default public/private TTLs and cacheable statuses. `cacheStorePath` is parsed but deliberately unused (see `--page-cache-store-path`). |

## Security directives

| Directive | Default | Meaning |

| ` ` `allow`/`deny` | — | `ALL` or CIDR lists, most-specific wins. A trailing `T` on an allow rule marks a trusted proxy. |

| ` ` | — | Globs never served; a malformed glob is a hard start/reload error. |

| ` followSymbolLink` | off | Folded into each vhost's effective `allowSymbolLink`; `2` fails closed. |

| `geoipDBFile` · `geoAllow`/`geoDeny` · `asnAllow`/`asnDeny` httpjet | none | Offline CidrList source and label lists; deny-first, allow-only = whitelist, unknown label = build error. → |

| ` enable` · `uidMin` · `gidMin` | `0` · `100` · `100` | suEXEC master gate and floors; uid/gid 0 always rejected. |

| ` ` `enable`, `mount`, `pid`, `net`, `uts`, `ipc` | off | Namespace isolation for PHP workers; `pid` is accepted but not honored. |

| ` ` `CPUSoftLimit`/`CPUHardLimit` | — | Parsed for compatibility; ignored on persistent `lsphp` workers (`check` warns). |

| `lsrecaptcha`, `censorshipControl`, permission masks | — | not enforced — `check` warns. |

## Listeners and TLS

| Directive | Default | Meaning |

| `name`, `address` | `*:80` | Listener bind address. Limit: `unix:`/`uds:` serves HTTP only; TLS over UDS never serves. |

| `secure`, `keyFile`, `certFile`, `certChain` | off | TLS material; `certChain=1` appends `CACertFile` to the served chain. |

| `CACertFile` · `clientVerify` · `verifyDepth` | none · `0` · `1` | Client-certificate verification (0 none · 1 optional · 2 required · 3 optional without CA) against the listener CA. |

| `crlFile` httpjet | none | PEM CRL/bundle enforced by the client verifier. |

| `enableStapling` | `0` | Compatibility only; OCSP needs `--features ocsp` + `--ocsp-responder`. |

| `proxyProtocol` httpjet | `0` | PROXY v2/v1 required on *this* listener; fail-closed; never on a public bind. |

| `vhostMapList/vhostMap` `vhost`, `domain` | — | Maps host to vhost. Limit: exact, then parent, then `*`; globs never match. |

           **httpd_config.xml** · a TLS listener with h3
```
  1

     https
     *:443
     1
     /etc/letsencrypt/live/example.test/privkey.pem
     /etc/letsencrypt/live/example.test/fullchain.pem
     0
       example.test  example.test,www.example.test

```

## External processors

You define proxy, LSAPI, or FastCGI upstreams here. Limit: unknown legacy types proxy; `cgi` contexts never execute.

| Directive | Default | Meaning |

| `name`, `type` | required | `proxy` · `lsapi` · `fcgi`/`fastcgi` httpjet . |

| `address` (repeatable) | required | `ip:port`, `host:port`, `uds:///path`, `http://`, `https://`, and httpjet `h2://` (prior knowledge) / `h2s://` (TLS, ALPN fail-closed). Additional addresses form a group: ordered failover by default, load-balanced with the options below. |

| `loadBalancePolicy` httpjet | `primary-first` | `weighted-round-robin` · `weighted-least-active`. Invalid on non-proxy processors. |

| `addressWeights` httpjet | all 1 | One integer 1–1000 per address. |

| ` ` `mode` · `path` · `host` · `interval` · `timeout` · `rise` · `fall` · `expectedStatus` httpjet | `connect` · `/` · — · 10 · 2 · 2 · 3 · 200 | Active probes; intervals 1–3600 s, timeout ≤ interval, thresholds 1–100, status 200–599. → |

| `maxConns` | `100` | Pool cap (LSAPI: worker count source unless `--php-children` overrides). |

| `initTimeout` / `retryTimeout` / `pcKeepAliveTimeout` | `60` / `0` / `60` s | Connect timeout / bad-mark cooldown (retry dials fresh; a backend timeout is 504) / idle recycle. |

| `respBuffer` | `0` | Parsed; responses always stream (`check` warns if set). |

| `clientCertFile` / `clientKeyFile` httpjet | none | Upstream mTLS client identity for `https://`/`h2s://` targets; must lie within an admin resource root when submitted via the API. |

| `env` (repeatable) | — | `K=V` worker environment. Server-computed CGI names are protected. |

| `path`, `backlog`, `instances`, `autoStart`, `runOnStartUp` | — / `100` / `1` / `0` / `0` | LSAPI worker binary and supervision (`instances>1` warns: one fixed upstream). |

| *`phpConfig` additionally:* `phpHandler` (`command`, `suffixes`), `memSoftLimit`/`memHardLimit`, `maxProcessTime` (0 = unlimited; `--php-max-process-time-ms` overrides), `procSoftLimit`/`procHardLimit`, `extMaxIdleTime`, `backlog` default 1024, `pcKeepAliveTimeout` default 30 s (not 60), `detachedMode`. |

## Virtual hosts

You declare vhosts in `httpd_config.xml`. Limit: `restrained` confines to `vhRoot`; `enableScript=0` disables scripts.

| Vhost directive | Meaning |

| `docRoot`, `indexFiles`, `enableExpires`/`expiresByType` | Root and per-vhost overrides of the server settings. |

| ` ` `enable`, `autoLoadHtaccess`, `base`, `rules` | Inline rules run before the `.htaccess` chain. |

| ` ` `allowOverride`, `accessFileName` | Controls `.htaccess` loading. Limit: only `0` or `31` loads; partial masks refuse. |

| ` ` `keyFile`, `certFile`, `certChain`, `CACertFile` | The SNI identity for this vhost's domains (chain material, not a client-verify root). |

| ` ` `enableCache`, `enablePublicCache`, `enablePrivateCache` | Per-vhost page-cache gates (with `--page-cache-standard-vhosts` a missing block gets a default public policy). |

| ` ` `suffix`, `type`, `handler` | Suffix routing to `lsapi`/`php` handlers or a `cgi` handler bound to a FastCGI processor. |

| ` ` `uri`, `address` | WebSocket relay maps (plain TCP HTTP/1 upstreams). |

| ` ` `accessLog`/`errorLog` with `useServer=0`, `fileName`, `rollingSize`, `keepDays`, `logHeaders` httpjet | Per-vhost log files (default roll 50 MB, keep 30 days; `logHeaders` default 3 = combined, 7 = combined + Host). Log paths are boot-owned. |

| `setUIDMode` (0/1/2), `chrootMode` (0/1/2), `chrootPath`, `suexecUser`/`suexecGroup`, ` ` | Per-vhost PHP isolation (needs the server ` ` gate). Out-of-range modes are hard errors. → |

| ` ` | Vhost-scoped processors (distinct scope from server-level ones). |

## Contexts

Contexts map URI prefixes to terminals (`static`, `proxy`, `redirect`, `php`/`lsapi` via `handler`) and carry per-context overrides:

| Context directive | Default | Meaning |

| `type`, `uri`, `location`, `handler`, `enabled` | — | Kind, prefix, on-disk location (static), processor name (proxy/lsapi). |

| `extraHeaders` | — | Adds response headers. Limit: `Name: value` only; never on `proxy` contexts. |

| `addDefaultCharset` / `addDefaultCharsetCustomized` | off | Charset appended to text types. |

| `cachePolicy/*` | on (`enablePostCache` off) | `checkPublicCache`, `checkPrivateCache`, `respectCacheable`, `enableCache`, `enablePrivateCache`, `enablePostCache` — the six LSWS gates, enforced on both cache tiers. |

| `maxReqBodySize` httpjet | inherit | Per-context body cap (413) on every terminal. |

| `responseTimeout` httpjet | inherit | Upstream response-head deadline, seconds (proxy paths). |

| `bandwidthLimit` httpjet | `0` | Egress throttle overriding the server-wide rate. |

| `subFilter` (repeatable) · `subFilterOnce` · `subFilterTypes` · `subFilterMaxBody` httpjet | — · `0` · `text/html` · `4M` | Literal body substitution. Limit: missing `=>` disables the context filter. → |

           **vhost XML** · a proxied API prefix with overrides
```

     proxy
     /api/
     application
     2M
     15
     http://internal.example => https://example.test
     text/html,application/json

```

## Environment variables

See the CLI reference for the full list.

Common unit settings include `RUST_LOG` and `CF_SEND_ZSTD=1`.

You set variables in your unit drop-in.
