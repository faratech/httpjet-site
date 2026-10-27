# Operations — httpjet Documentation

> Systemd socket activation, the persistent PHP pool, safe changes, deploy gates, rollback, kill switches, and the hardened OCI example.

- **Canonical URL:** https://httpjet.net/docs/operations
- **Source Repository:** https://github.com/faratech/httpjet

---

# Operations & deployment

A fresh packaged installation runs a static service as a dedicated account. The reference configurations below also show optional socket activation, persistent PHP pools and container deployment for operators who need them.

## Installation

For a fresh Linux server, use the signed installer . It selects the native package or portable archive, starts the welcome page on ports 80 and 443, and creates a unique self-signed certificate. A browser warning is expected until a trusted certificate is configured. io_uring must be available.

To build and deploy from source instead, install the binary at a stable path *outside* Cargo's `target/` so a later `cargo clean` cannot delete what a running unit depends on:

           source install
```
cargo build --locked --release -p httpjet
sudo useradd --system --home-dir /var/lib/httpjet --no-create-home --shell /usr/sbin/nologin httpjet
sudo install -d /usr/local/httpjet/bin /usr/local/httpjet/conf /usr/local/httpjet/logs
sudo install -m0755 target/release/httpjet /usr/local/httpjet/bin/httpjet

# an existing LiteSpeed tree works as-is — validate it first, as root AND as the service user
sudo /usr/local/httpjet/bin/httpjet --root /usr/local/lsws check --strict
sudo -u httpjet /usr/local/httpjet/bin/httpjet --root /usr/local/lsws check --strict

# minimal loopback example unit (no TLS, no PHP, no cache); it runs /usr/bin/httpjet on /etc/httpjet/litespeed
sudo install -m0755 target/release/httpjet /usr/bin/httpjet
sudo install -d /etc/httpjet && sudo cp -a examples/litespeed /etc/httpjet/litespeed
sudo install -m0644 packaging/systemd/httpjet-example.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now httpjet-example
```

        !   Review before start
The example units bind loopback and use example document roots. Set listeners, domains, docroots, TLS material, writable paths and the service identity deliberately before enabling a public service. A permission-preparing `ExecStartPre` that runs as root and then drops to the unprivileged account is the reference shape.

## Advanced systemd socket activation

The following reference topology is optional. The fresh installer uses a single static service and does not set up these socket, PHP-pool or firewall units.

> [Diagram: systemd-units] Five core units (plus the optional edge firewall). The socket units own the listening fds; the boot gate keeps the public listeners closed until the PHP pool can answer; the web tier adopts the fds and dials the pool. Restarting the web tier or reloading the pool never closes a listener.

| Unit | Role |

| `httpjet.socket` | N× `:80` TCP, N× `:443` TCP, N× `:443` UDP with `ReusePort=yes`, `Backlog=8192`. The multiplicity reproduces the per-worker SO_REUSEPORT fan-out, so N must equal `serve --workers`. Static (not enabled under `sockets.target`); pulled in by the service after the gate to avoid a cold-boot ordering cycle. |

| `httpjet-boot-ready.service` | Boot-only oneshot gate, availability-first: the `Type=notify` LSAPI pool is the one hard dependency; databases/caches are ordered but not required — it waits up to 300 s, then proceeds with a loud warning so a cold boot with a slow database still serves static + warm cache + stale-if-error. Later backend maintenance cannot tear down the sockets. |

| `httpjet.service` | The web tier: `httpjet --root … serve --lsphp-external … --lsphp-generation-file …` under a dedicated user, `Restart=always`, `OOMScoreAdjust=-500`, `LimitNOFILE=1048576`, `TimeoutStopSec=20`, `Conflicts=lshttpd.service`. Effective flags come from drop-ins in `httpjet.service.d/` — check `systemctl show -p ExecStart --value httpjet.service` before reasoning about them. The repository ships a validated **hardening drop-in** (`systemd/httpjet.service.d/zz-hardening.conf`: `ProtectSystem=strict` with logs-only `ReadWritePaths`, `PrivateTmp/PrivateDevices`, `ProtectProc=invisible`, empty capability set, `MemoryDenyWriteExecute`, `RestrictAddressFamilies`, and a **log-only seccomp stage** that filters the dangerous syscall groups while logging — enforce `@system-service` only after a clean soak), measured `systemd-analyze security` 9.0 → 1.9; it is the reference copy, not applied by the checked-in unit. |

| `httpjet-lsphp.socket` | Owns the LSAPI Unix listener (mode 0600, backlog 8192, `RemoveOnStop`). Never restart it during a reload or supervisor deploy. |

| `httpjet-lsphp.service` | `httpjet lsphp …`, `Type=notify` (active only after a marker-attributed LSAPI response), `ExecReload=httpjet lsphp-reload …`, its own identity, `RuntimeDirectory=httpjet` for the control socket and generation file. |

| `httpjet-edge-firewall.service` | Optional oneshot edge firewall (`scripts/httpjet-edge-firewall.sh`) for origins without a cloud firewall: restricts new `:80`/`:443` connections to Cloudflare IPv4 + private ranges (keep its list in step with the XML `T` entries). |

        i   Scope of the zero-loss guarantee
Socket activation eliminates RSTs of *new and queued* connections across a deploy. Requests the old process has already accepted — h1/h2 mid-serve and especially h3/QUIC streams — still drain under `TimeoutStopSec`. "Never drops a connection" means never RSTs a new or queued one.

## The persistent PHP pool

Static and proxy deployments need no PHP. For LSAPI, run the pool as its own unit and point the web tier at it; the units above wire the socket, the root-only control socket and the 16-byte generation file. Routine opcache recycle is `systemctl reload httpjet-lsphp.service` — synchronous and candidate-first. Reserve a hard restart of the pool *service* for supervisor binary/unit changes; verify the listener inode is unchanged before and after. Reference: LSAPI & PHP .

           replace the supervisor without closing the listener
```
before=$(stat -Lc '%d:%i' /run/httpjet/php.sock)
systemctl daemon-reload
systemctl restart httpjet-lsphp.service                 # the SERVICE only — never the .socket
test "$(stat -Lc '%d:%i' /run/httpjet/php.sock)" = "$before"
test "$(stat -Lc %s /run/httpjet/lsphp.generation)" = 16
ss -xlnH | awk '$5 == "/run/httpjet/php.sock" {print $4}'    # Send-Q should equal the XML backlog
```

## Safe change workflow

- **Edit in a reviewable change** Configuration tree or application content.

- **`check --strict`** The deploy gate. SIGHUP with a broken config keeps the old generation, but the check should catch it first.

- **Test in isolation** Alternate ports, a separate PHP socket, a separate cache store path, low worker/child counts. Kill test instances by exact PID; a leaked SO_REUSEPORT instance silently shares the port with independent cache and htaccess state.

- **Apply** `systemctl reload httpjet` (SIGHUP) for vhost/rewrite/access/expires/tuning/certificate changes; `systemctl restart httpjet` for the binary or boot-owned resources; the write API for validated in-memory replacement.

- **Verify on loopback, then watch** `curl -sk -H 'Host: …' https://127.0.0.1/…`, the journal, `httpjet_requests_total` and 5xx counters. Purge any outer cache if an incorrect cacheable response reached it.

## Binary deploy and rollback

> [Diagram: deploy-flow] The deploy gate chain. The repository's scripts/deploy-lscache.sh automates this for one deployment (strict check, co-listener guard, external-lsphp recurrence guard, health probe with automatic revert to the previous binary, capsule purge gate); the shape is what matters for any deployment.

- **Kill switch: cache**: Drop `--page-cache` from the unit (a drop-in override) and restart; the cache code is inert without the flag.

- **Kill switch: capsules**: Drop the `--xf-capsule*` flags and restart.

- **Kill switch: fast memo**: `--no-fast-memo` or `HJ_FAST_MEMO=0`.

- **Kill switch: WAF**: Remove `--waf-sidecar-addr` (the seam is completely inert without it).

- **Rollback**: Keep the previous binary beside the current one (`bin/httpjet.prev`); restore and restart. A rollback does not remove bad objects already stored in the origin cache (purge) or at the CDN edge (purge the zone).

- **Start limits**: `StartLimitBurst=5` per 60 s: more than five restarts a minute trips systemd and takes the service down until `systemctl reset-failed`. The persistence gate restarts the service — run it once.

The production build uses profile-guided optimization (`scripts/build-pgo.sh`: instrument → drive a representative loopback workload → rebuild). PGO scratch data is kept off tmpfs. Never benchmark a non-PGO binary against a PGO one.

## What SIGHUP reloads

Vhost maps, rewrites, document roots, contexts, access/expires/tuning settings, cache policy gates, and TLS certificates on an unchanged listener topology. Signal streams (`SIGHUP`, `SIGUSR1`, `SIGUSR2`) are registered immediately at runtime startup so a certbot or reload signal arriving during boot queues cleanly instead of terminating the process. A change that needs a restart (listener addresses, QUIC enablement, PHP topology, cache-store identity, privileges, log paths) is logged as "requires a restart — keeping current config" and nothing changes. A reload that would 404 a mapped vhost because its per-vhost file failed to load is refused. The dictionary registry is retained across SIGHUP (rotation needs a restart). Full semantics: Admin API & reload .

## Observability checklist

           the loopback-only surfaces
```
curl -s http://127.0.0.1:9090/metrics | grep '^httpjet_'          # Prometheus text
curl -s -H "Authorization: Bearer $(cat /etc/httpjet/profile.token)" http://127.0.0.1:9090/cache-entries   # cache totals, budgets, health line
curl -s http://127.0.0.1:9091/v1/status | jq .                     # with --admin-addr: generation, fingerprint, upstream health
curl -sk https://127.0.0.1/__hj_cache_ready -o /dev/null -w '%{http_code}\n'
journalctl -u httpjet -n 100
```

Metric families, log formats, the request-id header, telemetry TSV, PHP slow log, OpenTelemetry and profiling are all on Observability . Pair the counters with a process monitor (the tree ships a `monit` check whose start timeout stays above the boot gate's worst case).

## Container deployment

For a ready-to-run Docker image on Linux or Docker Desktop with WSL 2, follow the Docker quickstart . It includes the seccomp profile required for io_uring and publishes HTTP on 8080 and HTTPS on 8443. Microsoft's separate WSL Containers runtime denied io_uring in the environment tested.

### Hardened OCI example

`packaging/oci/` is an adoption example, not a prescription. The image runs as numeric UID/GID `10001:10001`, binds unprivileged ports, needs no capabilities; the compose file adds a read-only root filesystem, drops every capability, sets `no-new-privileges`, and mounts a small `noexec,nosuid,nodev` `/tmp`. Because Moby's default seccomp allowlist omits io_uring, `seccomp-httpjet.json` is the pinned Moby default plus only `io_uring_setup`, `io_uring_enter` and `io_uring_register` (ptrace/`process_vm_*` gated on `CAP_SYS_PTRACE`).

| Path | Access | Purpose |

| `/run/httpjet-certs` | read-only | TLS certificate + key (no key ships in the image; generate one for `example.test`). |

| `/var/lib/httpjet` | read-write | Page-cache files and the integrity key. |

| `/etc/httpjet/litespeed/logs` | read-write | Access/error logs. |

| `/etc/httpjet/litespeed/{conf,example}` | image read-only | LiteSpeed XML and static content. |

| `/tmp` | bounded tmpfs | Temporary runtime files. |

           build, run, smoke
```
docker compose -f packaging/oci/compose.yaml up --build     # publishes 8080/tcp, 8443/tcp AND 8443/udp
docker run … --security-opt seccomp=/abs/path/seccomp-httpjet.json …   # a hand-written run must pass the profile explicitly
bash scripts/oci-smoke.sh                                    # read-only root, UID 10001, caps dropped, real HTTP/3 through the UDP port
```

A seccomp denial is a startup/test failure — do not work around it with `--privileged`, `--cap-add` or `seccomp=unconfined`; narrow the runtime policy or pick a supported host. Rootless engines may add memlock, UDP or io_uring restrictions of their own. The image health check calls `/__hj_cache_ready`, so readiness means the cache boot scan finished, not that a user URL was warmed.

## Release and upgrade discipline

A public release must provide portable x86_64 and aarch64 artifacts, checksums, signatures or attestations, an SBOM, the GPL-3.0 license text and a documented Linux/kernel/libc floor; architecture-tuned PGO helpers must not be uploaded as generic binaries (production builds and gathers PGO natively on each architecture). Upgrades preserve the tree, dictionaries and state; stage and validate the new binary before restart; keep a known-good binary. Dictionary rotation: write the new file atomically, validate, restart, expect old-generation cache entries to become safe misses. Dependency upgrades run through `scripts/update-deps.sh` and the full suite (the 0.1.x sweeps refreshed tokio 1.54, rustls 0.23.46, rustls-webpki 0.103.16 + webpki-roots 1.0.11, fancy-regex 0.20, parking_lot 0.13, zstd 0.14.3 and brotli 9.1 / brotli-decompressor 6.2; a daily dependency-advisory job fails the build on any RustSec finding).
