# LSAPI & PHP — httpjet Documentation

> How httpjet runs PHP through lsphp.

- **Canonical URL:** https://httpjet.net/docs/lsapi
- **Source Repository:** https://github.com/faratech/httpjet

---

# LSAPI & PHP

You speak native LSAPI to an operator-configured `lsphp` here — no FastCGI shim. Run the persistent external pool in production so web restarts keep PHP warm.

        resolve    acl    rewrite    cache    dispatch    finalize    store

## Overview

Suffix routing to PHP (` `, an `lsapi` `extProcessor`, or `SetHandler application/x-httpd-php`) talks LSAPI directly. PHP stays optional for static, proxy, and FastCGI deployments.

- client HTTP/1·2·3 HTTP httpjet LSAPI handler · CGI env LSAPI · UDS lsphp pool — capped by --php-children / maxConns php #1 php #2 … php #N streamed response · php-slow log · lsapi_ttfb histogram Native LSAPI over a Unix socket. You own the pool (spawn) or run it separately (external, the production shape). Native LSAPI · vendored `lsapidef.h` Operator-supplied `lsphp` Generation-tracked UDS pool Candidate-first zero-downtime reload Fail-closed jail ## Zero-downtime deploys: the external pool Spawn mode cold-starts opcache on every web deploy. You avoid that with `httpjet lsphp` as its own unit (`httpjet-lsphp.service`, `Type=notify`, socket-activated). ### Web tier deploy `systemctl restart httpjet`
- systemd holds the :80/:443 fds — no RST for new or queued connections
- PHP workers and opcache stay warm

### PHP recycle

- `systemctl reload httpjet-lsphp` → `httpjet lsphp-reload`
- candidate-first: a new family must answer a real, marker-attributed LSAPI request before promotion
- the systemd-owned listener is never closed; queued dials survive

> [Diagram: lsphp-reload] Candidate-first reload. Promotion follows a marker-attributed response, then the shared 16-byte epoch advances. Web pools drop idle sockets and retire in-flight stale workers after their responses, via pre-pinned pidfds.

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

        !   Generation file and socket are trust anchors
The 16-byte file (epoch + promoted-family marker fingerprint) identifies your pool. Supplying `--lsphp-generation-file` aborts startup if it is missing or malformed; its parent must not be group/other-writable, and test pools default files beside their own socket.

Never restart `httpjet-lsphp.socket` during a reload: it preserves the listener inode and 8192-deep queue. Restart only `httpjet-lsphp.service` (it reapplies the XML backlog via `listen(2)`); verify socket inode, 16-byte file, and `ss -xln` Send-Q = 8192 (`LIVE=1 scripts/lsphp-reload-test.sh`).

## The UDS connection pool

Requests reach `lsphp` over a Unix socket behind a generation-epoch pool. In external mode you map the 16-byte generation file read-only; in owned mode the epoch stays process-local.

- **Idle reuse.** Idle connections reuse newest-first and expire oldest-first (0.1.10). Limit: post-surge traffic avoids workers marked to retire.

- **Reset replay.** A GET/HEAD reset before any response byte replays up to twice, on fresh dials after 25 ms (0.1.9). Limit: since 0.1.10, any method dropped unread replays if bodiless or fully read (non-multipart POST to 64 KiB).

- **Dial retries.** Refused or missing-socket dials retry within `retryTimeout`, capped at 15 s. Limit: fresh-dial `EAGAIN` under backlog retries too; accepted connections keep TCP keepalive.

- **Attribution.** Each connection's worker is found via `UNIX_DIAG` peer-inode plus `/proc`, then pinned by pidfd. Limit: stale workers retire via that pidfd after responding; failures count, never guess.

- **Request bodies.** Chunked or no-`Content-Length` uploads collect first, because LSAPI needs `m_reqBodyLen`. Limit: `collect_to_cap` returns 413 the instant `maxReqBodySize` would pass; bytes charge the process-wide budget until completion or teardown (2026-09-06). See the bodies stub .

| Metric | Meaning. Limit: |

| `httpjet_lsapi_generation_advances_total` | Epoch advances observed. Limit: this web process only. |

| `httpjet_lsapi_stale_idle_drops_total` / `_stale_checked_out_drops_total` | Idle sockets discarded / checked-out sockets refused re-pooling. Limit: after an advance. |

| `httpjet_lsapi_stale_worker_retire_signals_total` / `_failures_total` | Stale workers retired via pidfd / signals failed. Limit: after their responses completed. |

| `httpjet_lsapi_worker_attribution_failures_total` | Workers you could not pin. Limit: counted, never guessed. |

| `httpjet_lsapi_acquire_seconds` · `_dispatch_seconds` · `_ttfb_seconds` | Pool contention · backend time · first byte. Limit: TTFB covers pickup plus render start. |

| `httpjet_lsapi_reset_replays_total` / `_reset_replay_exhaustions_total`, `httpjet_lsapi_eagain_*` | Reset replays / exhausted replays, backlog retries. Limit: see replay rules above. |

        ⎁   Measured
PHP/LSAPI over HTTP/1.1: **~44.8k req/s vs LiteSpeed's ~38.5k at c=40** (LiteSpeed best ~41.2k at c=60). In production, PHP render is ~90% of wall time; pool acquire is p99.9  loopback · PGO · 2026-06 · production telemetry 2026-08-30

## The lsphp supervisor

In spawn mode (`serve` without `--lsphp-external`) you supervise `lsphp` yourself. Start with the external pool above for production; read this for spawn-mode limits.

- **Spawn.** The listen socket passes on fd 0; socket-activation listeners stay out of children via `FD_CLOEXEC` and `close_range(..., CLOSE_RANGE_CLOEXEC)`. Limit: `setsid()` detaches; `PR_SET_PDEATHSIG` ties workers to the parent; `pre_exec` uses async-signal-safe calls only.

- **Tracking.** The supervisor is a subreaper for adopted PHP zombies. Limit: each generation family tracks by injected `LSAPI_Z_HTTPJET_GENERATION_MARKER` plus pidfds.

- **Cap.** Config `LSAPI_CHILDREN` is stripped, so `--php-children` / `maxConns` alone caps workers. Limit: values below 2 normalize to 2.

- **Refusals (2026-09-16).** Workers never run as root, even if suEXEC computes uid/gid 0. Limit: a setuid `lsphp` binary is also refused.

- **Deadline.** `--php-max-process-time-ms` gives a total per-request deadline; exceeded means 504. Limit: spawn mode also kills/restarts the worker; external mode has no web-process monitor, so keep it conservative.

        !   Packaging boundary
httpjet ships no PHP runtime; you manage the executable, extensions, `php.ini`, opcache, and writable paths. The repo's hardening runbook (`systemd/httpjet-lsphp.service.d/hardening.conf`, `MemoryDenyWriteExecute=no` for opcache JIT) is validated live but off by default.

## The LSAPI wire codec

`proto/{frame,builder}` implements the vendored php-src `lsapidef.h` constants (BSD-3-Clause) byte-for-byte. Remember one rule: each length prefix includes the trailing NUL.

           **proto** · the NUL-inclusive length prefix
```
// each env/header field:  [u16 BE = byte_len + 1] [bytes…] [0x00]
const MAX_FIELD: usize = (u16::MAX as usize) - 1;   // 65534
```

- Fields cap at `u16::MAX − 1` bytes. Limit: longer fields would wrap and desync every later frame, so the handler answers 431 first.

- Bodies scan for an embedded `BEGIN_REQUEST` signature before sending; negative env counts fail at the builder. Limit: the response-header parser is fuzz target `lsapi_resp_header`, one of eight.

- A worker dying before `LSAPI_RESP_END` aborts the body, never truncates silently. Limit: use the shipped `packaging/lsphp/lsapilib-hardening.patch` for upstream `lsapilib.c`; tracing reaches PHP as `HTTP_TRACEPARENT` with OpenTelemetry on.

## The CGI environment

The builder keeps what was requested apart from what runs. `LsapiScript` pins `SCRIPT_FILENAME` while the original `REQUEST_URI` survives, so front-controller routing stays correct.

| Variable | Meaning. Limit: |

| `REQUEST_URI` | Original request URI. Limit: preserved through rewrites. |

| `SCRIPT_FILENAME` / `SCRIPT_NAME` | Resolved on-disk script / URI-space name. Limit: `SCRIPT_NAME`/`QUERY_STRING` upsert via `ctx.env`. |

| `REMOTE_ADDR`, `SERVER_NAME`, `HTTPS`, `CONTENT_LENGTH`, `HTTP_AUTHORIZATION`, `PHP_VALUE`, `PHP_ADMIN_VALUE`, … | Server-computed or special-env only. Limit: since 2026-09-16, `[E=…]`/`SetEnv`/processor `env` naming one is denied (shared with FastCGI). |

| `HTTP_*` | Validated request headers (2026-10-06 rule for CGI, LSAPI, FastCGI). Limit: `Proxy` and underscore names never pass; forwarding-authority names pass only from a trusted, certificate-presenting proxy. |

| `HTTP_*` via LSAPI block | Since 0.1.8, lsphp builds these from the header block. Limit: env table also carries only `Host`, `Content-Type`/`Content-Length`, `Transfer-Encoding`, names over 250 bytes, and repeats; `HJ_LSAPI_FULL_HEADER_ENV=1` restores all (FastCGI keeps all). |

| `REMOTE_USER` | Set by successful Basic auth . Limit: realm-authenticated requests only. |

| Special-env section | `php_value` / `php_admin_value` / `php_flag` / `php_admin_flag` from `.htaccess`. Limit: carried on the special-env wire path; plain `lsphp` ignores regular CGI `PHP_VALUE`. |

## The jail

You fence PHP with suEXEC (` `, `uidMin`/`gidMin` floors), chroot (`chrootMode` 0–2, per-vhost `chrootPath`), and optional namespaces. Namespaces cover `mount`, `net`, `uts`, `ipc`; `pid` is accepted but not honored.

- suEXEC off, non-root process, or no per-vhost isolation gives the all-None default `"php"` pool. Limit: single-pool behaviour preserved byte-for-byte.

- An unsafe configured jail disables PHP for that vhost with 503. Limit: uid 0, below-floor uid, bad chroot, out-of-range modes (2026-09-16), or credential-less chroot (0.0.5); never unjailed or static.

        !   Source-disclosure guard
An unavailable pool returns 503, always. Falling through to static would serve raw `.php` source; shared-pool vhosts share worker credentials, so isolation is your suEXEC decision.

## Request bodies

Request bodies now live inside The UDS connection pool . This stub keeps existing links working.
