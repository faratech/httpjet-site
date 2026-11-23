# Operations — httpjet Documentation

> Deploy, upgrade, roll back, and recover safely.

- **Canonical URL:** https://httpjet.net/docs/operations
- **Source Repository:** https://github.com/faratech/httpjet

---

# Operations & deployment

A fresh packaged installation runs a static service as a dedicated account. The reference configurations below also show optional socket activation, persistent PHP pools and container deployment for operators who need them.

## Installation

### Fresh installer

For a fresh Linux server, use the signed installer . It selects the native package or portable archive, starts the welcome page on ports 80 and 443, and creates a unique self-signed certificate. A browser warning is expected until a trusted certificate is configured. io_uring must be available.

### Source build

To build and deploy from source instead, install the binary at a stable path *outside* Cargo's `target/` so a later `cargo clean` cannot delete what a running unit depends on:

         public static example
```
cargo build --locked --release -p httpjet
sudo install -m0755 target/release/httpjet /usr/bin/httpjet
sudo install -d /etc/httpjet
sudo cp -a examples/litespeed /etc/httpjet/litespeed
sudo install -m0644 packaging/systemd/httpjet-example.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now httpjet-example
curl -f -H 'Host: example.test' http://127.0.0.1:8080/
```

        !   Review before start
The example units bind loopback and use example document roots. Set listeners, domains, docroots, TLS material, writable paths and the service identity deliberately before enabling a public service. The static reference unit uses `DynamicUser=yes` and runs its strict config check under that service identity.

## Advanced systemd socket activation

The public release includes a packaged static service and two source-based example units. They provide starting points for an operator-managed socket-activated deployment.

> [Diagram: systemd-units] Service options in the public release. The packaged service and source example serve static files. Attach a separately managed LSAPI pool when the site needs PHP.

| Public unit | Role |

| `packaging/services/systemd/httpjet.service` | Portable installation under the `httpjet` account with a strict pre-start check and startup readiness notification. |

| `packaging/systemd/httpjet-example.service` | Source-build example with a dynamic account, strict validation and loopback HTTP. |

| `packaging/systemd/httpjet-lsphp.service` | Optional persistent PHP service with readiness notification and a root-run reload command. |

With operator-configured socket activation, the socket unit can retain its listener while the web process restarts. Accepted connections still belong to the old process and drain under its shutdown policy. Validate listener counts, address families and restart behavior on a staging instance before relying on this setup.

## The persistent PHP pool

Static and proxy deployments need no PHP. For LSAPI, run the pool as its own unit and point the web tier at it; the public example configures the listener, root-only control socket and 16-byte generation file. Routine opcache recycle is `systemctl reload httpjet-lsphp.service` — synchronous and candidate-first. Use the restart example below only with an operator-managed socket unit that owns the LSAPI listener. Set the path to the deployed socket. With the standalone example, restarting the pool interrupts its listener. Reference: LSAPI & PHP .

           replace the supervisor without closing the listener
```
before=$(stat -Lc '%d:%i' /run/httpjet/lsphp.sock)
systemctl daemon-reload
systemctl restart httpjet-lsphp.service                 # the SERVICE only — never the .socket
test "$(stat -Lc '%d:%i' /run/httpjet/lsphp.sock)" = "$before"
test "$(stat -Lc %s /run/httpjet/lsphp.generation)" = 16
ss -xlnH | awk '$5 == "/run/httpjet/lsphp.sock" {print $4}'    # Compare Send-Q with the configured socket backlog
```

## Safe change workflow

- **Edit in a reviewable change** Configuration tree or application content.

- **`check --strict`** The deploy gate. SIGHUP with a broken config keeps the old generation, but the check should catch it first.

- **Test in isolation** Alternate ports, a separate PHP socket, a separate cache store path, low worker/child counts. Kill test instances by exact PID; a leaked SO_REUSEPORT instance silently shares the port with independent cache and htaccess state.

- **Apply** `systemctl reload httpjet` (SIGHUP) for vhost/rewrite/access/expires/tuning/certificate changes; `systemctl restart httpjet` for the binary or boot-owned resources; the write API for validated in-memory replacement.

- **Verify on loopback, then watch** `curl -sk -H 'Host: …' https://127.0.0.1/…`, the journal, `httpjet_requests_total` and 5xx counters. Purge any outer cache if an incorrect cacheable response reached it.

## Binary deploy and rollback

> [Diagram: deploy-flow] Manual source-build deployment. Validate a candidate, retain a known-good binary and verify representative requests before considering the deployment healthy.

- **Kill switch: cache**: Drop `--page-cache` from the unit (a drop-in override) and restart; the cache code is inert without the flag.

- **Kill switch: capsules**: Drop the `--xf-capsule*` flags and restart.

- **Kill switch: fast memo**: `--no-fast-memo` or `HJ_FAST_MEMO=0`.

- **Kill switch: WAF**: Remove `--waf-sidecar-addr` (the seam is completely inert without it).

- **Rollback**: Keep the previous binary beside the current one (`bin/httpjet.prev`); restore and restart. A rollback does not remove bad objects already stored in the origin cache (purge) or at the CDN edge (purge the zone).

- **Start limits**: The portable systemd unit allows three starts per 60 seconds. Check the journal and fix the failure before resetting the unit’s failed state.

Production examples may use profile-guided optimization. Record the build profile and flags so benchmark comparisons can account for them.

## What SIGHUP reloads

Vhost maps, rewrites, document roots, contexts, access/expires/tuning settings, cache policy gates, and TLS certificates on an unchanged listener topology. Signal streams (`SIGHUP`, `SIGUSR1`, `SIGUSR2`) are registered immediately at runtime startup so a certbot or reload signal arriving during boot queues cleanly instead of terminating the process. A change that needs a restart (listener addresses, QUIC enablement, PHP topology, cache-store identity, privileges, log paths) is logged as "requires a restart — keeping current config" and nothing changes. A reload that would 404 a mapped vhost because its per-vhost file failed to load is refused. The dictionary registry is retained across SIGHUP (rotation needs a restart). Full semantics: Admin API & reload .

## Observability checklist

See Observability for metrics and logs.

You check loopback surfaces first.

You pair counters with a process monitor.

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

GitHub Releases provides the installer, two static Linux archives, and native DEB and RPM packages for x86-64 and ARM64. The package site hosts signed manifests and repository metadata. A build-only publication records that distribution qualification is incomplete. For a manual source upgrade, retain a known-good binary and validate the candidate before restarting. After dictionary rotation, old entries that need an unavailable dictionary become misses.

See the release process and current downloads .
