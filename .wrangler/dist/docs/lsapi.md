# LSAPI & PHP — httpjet Documentation

> The native LSAPI wire codec, the lsphp supervisor, the zero-downtime external pool with generation tracking, the CGI environment, and the fail-closed jail.

- **Canonical URL:** https://httpjet.net/docs/lsapi
- **Source Repository:** https://github.com/faratech/httpjet

---

# LSAPI & PHP

httpjet speaks the **native LSAPI wire protocol** to an operator-configured `lsphp` executable — no FastCGI shim, no translation layer. `hj-lsapi` holds the wire codec, a generation-aware UDS client pool, the `lsphp` supervisor, the CGI environment builder, and a fail-closed jail. The production shape is a **persistent external pool** so the web tier restarts without cold-starting PHP.

        resolve    acl    rewrite    cache    dispatch    finalize    store

## Overview

When suffix routing maps a request to a PHP handler (` ` or an `lsapi` `extProcessor` bound by a `scriptHandler`, or a `.htaccess` `SetHandler application/x-httpd-php`), httpjet talks LSAPI directly to `lsphp`. PHP is optional: static, proxy and FastCGI deployments need no LSAPI executable.

- client HTTP/1·2·3 HTTP httpjet LSAPI handler · CGI env LSAPI · UDS lsphp pool — capped by --php-children / maxConns php #1 php #2 … php #N streamed response · php-slow log · lsapi_ttfb histogram Native LSAPI over a Unix socket. The pool may be owned by the web process (spawn mode) or run as a separate `httpjet lsphp` process (external mode, the production shape). Native LSAPI · vendored `lsapidef.h` Operator-supplied `lsphp` Generation-tracked UDS pool Candidate-first zero-downtime reload Fail-closed jail ## The LSAPI wire codec `proto/{frame,builder}` implement the protocol straight from the vendored php-src `lsapidef.h` constants (BSD-3-Clause), so frames match byte-for-byte what `lsphp` reads. One sharp edge deserves stating precisely: every env key/value and known header value is length-prefixed with a big-endian `u16` that **includes the trailing NUL**, so the largest safe field is `u16::MAX − 1` bytes. A longer field would wrap the prefix and desync `lsphp`'s parser for every subsequent frame; the handler answers 431 before the frame is built. **proto** · the NUL-inclusive length prefix ``` // each env/header field: [u16 BE = byte_len + 1] [bytes…] [0x00] const MAX_FIELD: usize = (u16::MAX as usize) - 1; // 65534 ``` The response-header parser is one of the eight fuzz targets (`lsapi_resp_header`). Request bodies are scanned before transmission and refused if they embed an `lsphp` `BEGIN_REQUEST` frame signature, negative env counts are rejected at the builder, and the repository ships a verified `packaging/lsphp/lsapilib-hardening.patch` for upstream `lsapilib.c`. If a worker dies before emitting an `LSAPI_RESP_END` packet, the response body is aborted rather than silently truncated. Inbound tracing context reaches PHP as `HTTP_TRACEPARENT` in the unknown-header table when OpenTelemetry is on. ## The UDS connection pool Requests reach `lsphp` over a Unix-domain socket fronted by a pool that carries a **generation epoch**. In owned mode the epoch is process-local; in external mode it is the 16-byte generation file below, mapped read-only. Idle connections are reused newest-first and expire oldest-first (0.1.10), so traffic after a surge stays off the workers lsphp has marked to retire. A GET/HEAD whose connection resets before any response byte is replayed up to twice, each time on a *fresh* dial after a 25 ms pause (0.1.9; `httpjet_lsapi_reset_replays_total` / `_reset_replay_exhaustions_total`). Since 0.1.10 a request of any method that a retiring worker dropped unread is replayed the same way if it is bodiless or its body was already read whole (a non-multipart POST up to 64 KiB). Refused or missing-socket dials retry within the processor's `retryTimeout` (capped at 15 s). A fresh-dial `EAGAIN` under backlog pressure is retried and counted (`httpjet_lsapi_eagain_*`). Accepted connections keep TCP keepalive so a vanished client cannot pin pool permits. Attribution is what makes generation retirement safe: for every connection the pool identifies the accepting worker through `UNIX_DIAG` peer-inode lookup plus `/proc`, pins it with a pidfd, and — after the response completes — retires a stale-generation worker through that pidfd rather than by pid (workers call `setsid()` and are not reliably in the master's tree). Failures to attribute are counted, never guessed. Metric Meaning `httpjet_lsapi_generation_advances_total` Epoch advances this web process observed. `httpjet_lsapi_stale_idle_drops_total` / `_stale_checked_out_drops_total` Idle sockets discarded / checked-out sockets refused re-pooling after an advance. `httpjet_lsapi_stale_worker_retire_signals_total` / `_failures_total` Old-generation workers retired via pinned pidfd after their response completed / signals that failed. `httpjet_lsapi_worker_attribution_failures_total` Connections whose worker could not be pinned. `httpjet_lsapi_acquire_seconds` · `_dispatch_seconds` · `_ttfb_seconds` Pool contention · backend call time · request-committed-to-first-byte (worker pickup + render start). ## The lsphp supervisor In spawn mode (`serve` without `--lsphp-external`) `hj-lsapi` spawns and supervises `lsphp` itself: the listen socket is passed on **fd 0**, inherited socket-activation listeners are kept out of PHP children via `FD_CLOEXEC` and `close_range(..., CLOSE_RANGE_CLOEXEC)`, `setsid()` detaches the pool from any controlling terminal, `PR_SET_PDEATHSIG` ties a worker's life to its parent, and the `pre_exec` closure between fork and exec calls only async-signal-safe syscalls. The process is a subreaper (reaping all adopted PHP orphan zombies) and tracks each generation family by an injected `LSAPI_Z_HTTPJET_GENERATION_MARKER` plus pidfds. The config's `LSAPI_CHILDREN` env is stripped so `--php-children` / `maxConns` is the only cap (values below 2 normalize to 2). Two refusals are unconditional (2026-09-16): the supervisor **never runs workers as root** (resolve_credentials rejects uid/gid 0 even if suEXEC would compute it) and **refuses to spawn a setuid `lsphp` binary**. `--php-max-process-time-ms` sets a total per-request deadline: exceeded → 504. In spawn mode the monitor also kills and restarts the worker; under `--lsphp-external` there is no monitor in the web process, so only the 504 applies and a wedged worker is not auto-reclaimed here — keep the value conservative. ! Packaging boundary httpjet ships no PHP runtime. The executable, its extensions, `php.ini`, opcache settings and writable application paths are operator-managed. For the pool unit's sandboxing the repository ships a **validated hardening runbook** (`systemd/httpjet-lsphp.service.d/hardening.conf`: a bounded capability set, the standard Protect*/Restrict* family, and `MemoryDenyWriteExecute=no` because opcache JIT needs RWX, with the opcache helper steps run via `+`-prefixed ExecStartPre/Reload) — validated against a live pool, but not applied by any unit by default; adopting it is the operator's call. ## Zero-downtime deploys: the external pool Spawn mode couples PHP's lifetime to the web process — a binary deploy cold-starts opcache. The `httpjet lsphp` subcommand instead runs a **persistent pool as its own systemd unit** (`httpjet-lsphp.service`, `Type=notify`, socket-activated through `httpjet-lsphp.socket`); the web tier dials it with `serve --lsphp-external --lsphp-generation-file ` and never spawns workers itself. Both halves then deploy independently: ### Web tier deploy `systemctl restart httpjet`
- systemd holds the :80/:443 fds — no RST for new or queued connections
- PHP workers and opcache stay warm

### PHP recycle

- `systemctl reload httpjet-lsphp` → `httpjet lsphp-reload`
- candidate-first: a new family must answer a real, marker-attributed LSAPI request before promotion
- the systemd-owned listener is never closed; queued dials survive

> [Diagram: lsphp-reload] Candidate-first generation reload. The supervisor promotes a new family only after a marker-attributed response, then advances the shared 16-byte epoch. Web pools observe the epoch, drop idle sockets, and retire each in-flight stale worker only after its response completes, through a pidfd pinned before the epoch moved. The old family is drained with bounded forced cleanup.

           external pool wiring (see  Operations  for the units)
```
# the PHP half — its own unit, its own identity
httpjet --root /abs/root lsphp --php-socket /run/httpjet/php.sock --php-children 256 \
  --control-socket /run/httpjet/lsphp-control.sock \
  --generation-file /run/httpjet/lsphp.generation

# the serving half — dial, never spawn; restart freely
httpjet --root /abs/root serve … --lsphp-external /run/httpjet/php.sock \
  --lsphp-generation-file /run/httpjet/lsphp.generation

# opcache/PHP recycle without dropping the listener
httpjet lsphp-reload --control-socket /run/httpjet/lsphp-control.sock --timeout-secs 90
```

        !   The generation file is the trust anchor
The 16-byte file (epoch + promoted-family marker fingerprint) is how a web tier tells *its* pool from a foreign one. Supplying `--lsphp-generation-file` is fail-closed: startup aborts if it is missing or malformed. Its parent directory must not be group/other-writable. Test pools default their control and generation files *beside their own socket* so they can never advance the production epoch — which would drop the live web tier's pooled connections and retire its workers against a foreign marker.

        !   Never restart the socket unit during a reload
`httpjet-lsphp.socket` is the continuity boundary: keeping it open preserves the listener inode and its 8192-deep accept queue. Replace the supervisor by restarting only `httpjet-lsphp.service`; it reapplies the XML backlog to the inherited fd with `listen(2)`. Verify with `stat` of the socket inode before/after, a 16-byte generation file, and `ss -xln` Send-Q = 8192; `LIVE=1 scripts/lsphp-reload-test.sh` is the live gate.

## The CGI environment

The env builder assembles the CGI/LSAPI environment per request. The load-bearing split is *what was requested* vs *what runs*: the `LsapiScript` request extension pins a resolved `SCRIPT_FILENAME` while the **original** `REQUEST_URI` is kept, with `SCRIPT_NAME`/`QUERY_STRING` pushed into `ctx.env` and upserted over the builder's defaults. That is what makes front-controller routing (every page → `/index.php`) correct.

| Variable | What it holds |

| `REQUEST_URI` | The original request URI, preserved through rewrites. |

| `SCRIPT_FILENAME` / `SCRIPT_NAME` | The resolved on-disk script and its URI-space name. |

| `REMOTE_ADDR`, `SERVER_NAME`, `HTTPS`, `CONTENT_LENGTH`, `HTTP_AUTHORIZATION`, `PHP_VALUE`, `PHP_ADMIN_VALUE`, … | Server-computed or special-env only. Since 2026-09-16 a `.htaccess` `[E=…]`/`SetEnv` or processor `env` entry that names one of these is **denied** (shared deny-list with FastCGI) — a directory cannot override the server's view of the client or inject PHP ini overrides through the regular environment. |

| `HTTP_*` | Request headers after name/value validation, under one forwarding rule (2026-10-06, applied identically to the CGI env table, the LSAPI wire header block and FastCGI params): the `Proxy` header and underscore-named headers never pass, and forwarding-authority names (`CF-Connecting-IP`, `X-Forwarded-*`, `X-Real-IP`, `True-Client-IP`, `Forwarded`) pass only from a peer that is *both* a trusted proxy and — on a client-cert listener — presented one. `HTTP_TRACEPARENT` when OTel is enabled. Since 0.1.8, lsphp builds these entries from the LSAPI header block. Only the copies it cannot take from there also go in the env table: `Host`, `Content-Type`/`Content-Length`, `Transfer-Encoding`, names over 250 bytes and repeated headers. `HJ_LSAPI_FULL_HEADER_ENV=1` restores every copy, and FastCGI keeps them all. |

| `REMOTE_USER` | Set by a successful Basic auth realm. |

| special-env section | `php_value` / `php_admin_value` / `php_flag` / `php_admin_flag` from `.htaccess`, carried on the LSAPI special-env wire path with the right permission level — plain `lsphp` ignores a regular CGI `PHP_VALUE`. |

## The jail

PHP execution is fenced by a config-gated jail — suEXEC (` ` with `uidMin`/`gidMin` floors), chroot (`chrootMode` 0–2, per-vhost `chrootPath`) and optional Linux namespaces (`mount`, `net`, `uts`, `ipc`; `pid` is accepted but deliberately not honored). Resolution has two outcomes and no third:

- suEXEC off, non-root process, or no per-vhost isolation → the **all-None** case: the default `"php"` pool, single-pool behavior preserved byte-for-byte.

- A configured jail that turns out unsafe — uid 0, a uid below the floor, a bad chroot, an out-of-range `setUIDMode`/`chrootMode` (hard error since 2026-09-16), or a chroot without credentials to run inside it (hard error since 0.0.5) → httpjet **disables PHP for that vhost and returns 503**. It never runs unjailed, and it never falls through to the static handler.

        !   Source-disclosure guard
A script that resolves to a PHP handler is identified as PHP even when no pool can serve it. Falling through to static would hand back the raw `.php` source, so an unavailable pool is a 503, always. Operators sharing one pool across vhosts should read the "shared PHP trust boundary" note in the repository's security docs: workers in one pool share credentials, so per-vhost isolation is a suEXEC decision, not a default.

## Request bodies

LSAPI needs a concrete `m_reqBodyLen` before the body is sent, so chunked / no-`Content-Length` uploads are collected first. `collect_to_cap` enforces the effective `maxReqBodySize` *as frames arrive* — the instant the accumulated size would exceed the cap it returns `PayloadTooLarge` (413) — and every buffered byte is charged to the process-wide body budget through an owned lease that is released on completion or on connection teardown (H2/H3 teardown leaks were closed in the 2026-09-06 review).

        ⎁   Measured
PHP/LSAPI over HTTP/1.1: **~44.8k req/s vs LiteSpeed's ~38.5k at c=40** on the same hardware (LiteSpeed's best, ~41.2k, needed c=60). In production the render inside PHP is ~90% of request wall time; pool acquire is p99.9  loopback · PGO · 2026-06 · production telemetry 2026-08-30
