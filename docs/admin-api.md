# Admin API & reload — httpjet Documentation

> Check status and reload configuration safely.

- **Canonical URL:** https://httpjet.net/docs/admin-api
- **Source Repository:** https://github.com/faratech/httpjet

---

# Admin API & reload

You change a running httpjet three ways: SIGHUP, read-only status API, transactional write API. One publication coordinator serves all writers. Each change publishes fully, or not at all.

| Way | Does | Limit |

| **SIGHUP** | Republish on-disk tree | Needs shell/systemd access |

| **Read API** | Status only | Changes nothing; loopback only |

| **Write API** | Publish memory bundle | Volatile; token required |

## SIGHUP

Run `systemctl reload httpjet` (or `kill -HUP`). Re-parse, build, publish via `config_transaction::Coordinator`. Builds precede certificate reload. Preserves `--no-mtls`, `--per-ip-rate`. Journal outcomes:

- **published**: New generation serving; in-flight requests finish on the old one; certificate handles reloaded for the unchanged listener topology.

- **requires a restart — keeping current config**: The diff touched a boot-owned resource (hot reload covers vhost/rewrite/access/expires/tuning, cache policy gates and TLS material).

- **reload would 404 mapped vhost(s)**: A per-vhost file failed to load; the old generation is kept rather than serving 404s.

- **reload rejected**: Parse or build error — nothing changes.

- **certificate reload failed**: Application state published; certificates whose reload failed are retained.

## Read-only status API

Opt in: `serve --admin-addr 127.0.0.1:9091`. Non-loopback rejected. Bind failure aborts startup. Separate from metrics. Changes nothing. No profiling or purge.

           **GET** /v1/status · schema_version 1
```
$ curl -s http://127.0.0.1:9091/v1/status | jq .
{
  "schema_version": 1,
  "generation": 3,                       # process-local, starts at 1; rejected candidates stay invisible
  "config_fingerprint": "9f2c…",      # of the normalized model's Debug form — comparable within one binary version only
  "listeners": [{"name":"https","tls":true,"unix":false}],   # configured names + flags, NOT bound addresses
  "vhosts": ["example.test"],
  "upstreams": [{"scope":"server","group":"application","peer":0,"healthy":true,"active":2,"selections":1290}],
  "page_cache": {"entries": 41210, "memory_bytes": 60817408, "hits": 1904411, "misses": 88123},   # or null when off
  "truncated": false
}
```

Returns no values, paths, credentials, headers, keys, URLs. Limits: names 256 chars, rows 256, response 1 MiB (503 beyond). GET only, exact path (405/404 otherwise). Host: loopback or `localhost`. Rejects Origin, bodies. Sends `Cache-Control: no-store`, closes connections. Caps: 4 KiB / 32 fields, four tasks, 5 s deadlines. Local users trusted. Never proxy it.

## Transactional configuration API

Writes need separate opt-in. Read listener never enables them. Set all three:

           **serve** · enabling writes
```
httpjet --root /abs/root serve … \
  --admin-write-addr 127.0.0.1:9092 \
  --admin-token-file /operator/private/token \       # 64 lowercase hex chars (32 random bytes), mode 0400/0600, one hard link, root or service uid
  --admin-resource-root /operator/content \          # repeatable; up to 32 existing directories; "/" is refused
  --admin-resource-root /etc/letsencrypt/live
```

> [Diagram: reload-transaction] Validate, then publish with an exact precondition. Every write carries If-Match with the revision it read; a stale revision or an out-of-band publication (SIGHUP included) loses with a conflict rather than silently rebuilding against newer state. Publication is volatile: the on-disk XML is never rewritten and a restart returns to it.

### Endpoints and contract

| Request | Behavior |

| `GET /v1/revision` | The current revision: a random 128-bit process incarnation plus a monotonic generation, so a restart can never revive an earlier process's revision. |

| `POST /v1/config/validate` | Builds the candidate, returns a redacted verdict, publishes and persists nothing. |

| `PUT /v1/config` | Builds, rechecks the exact revision under the publication boundary, publishes, transfers health-check ownership, notifies bridge admission. Returns the next revision and `persistence: volatile`. An interrupted response after publication does not roll back — re-read the revision to reconcile. |

Frame each write exactly:

- `Authorization: Bearer `: missing/duplicate/malformed → 401, body unread, constant-time compare, token never logged.

- Exact quoted `If-Match`: missing → 428, stale → conflict.

- `Content-Type: application/json`, one `Content-Length` ≤ 1 MiB, headers ≤ 8 KiB / 32, deadline 5 s.

- Host: bound loopback, or `localhost: `. Rejected: encodings, Origin, Expect, Upgrade, Trailer.

- One request per connection, never pipelined. Max four connections, one build. Lock ≤ 5 s, candidate ≤ 10 s. Late builds never publish.

           **body** · the in-memory bundle (exactly three fields)
```
{
  "server_xml": " … ",
  "vhosts": [ {"name": "example.test", "xml": " … "} ],
  "mime": "text/html = html, htm\n"
}
```

`hj-config::parse_bundle` normalizes bundles. Never reads `configFile` paths. Limits: 1 MiB, ≤128 vhosts, one root, no DTD, ≤64 nesting. Bad declarations fail. Errors carry no submitted data. Root from startup.

### What a transaction may change

Boundary, stated once for this page: reloadable publishes live, boot-owned returns `restart_required`, nothing half-applies.

#### Reloadable (application)

- Listener→vhost mappings on the unchanged listener set
- Rewrites, document roots, contexts, static locations
- Reloadable request settings, cache policy gates, expires
- Proxy and FastCGI processors, and proxy groups (health schedulers restart cleanly)
- GeoIP database and upstream client-cert files — inside a resource root

#### Constrained trust (TCP transaction)

- Listener identity/routing, PROXY-protocol policy, TLS certificate/key/CA/CRL material — through prepared same-socket TCP successors
- An existing `--http-uds` endpoint is handed off
- An already-enabled QUIC endpoint adopts the new TLS/mTLS policy for future handshakes without rebinding UDP
- UDS ext-processor addresses authorized against resource roots

#### restart_required

- Listener addresses, count, order, secure/plain roles; QUIC enablement; UDS topology
- PHP topology and pools (LSAPI processors)
- Cache-store identity and boot-time cache caps/policy
- User/group, namespace and isolation settings, per-vhost log resources
- `useIpInProxyHeader` and the whole ` ` block

**Resource policy.** Keep candidate files inside an `--admin-resource-root`: docroots, contexts, GeoIP, certs, TLS paths. Rejects traversal, relative, missing, escaping links. Authorization, not sandbox. Failures return categories only.

**Cache namespaces.** First publication creates an epoch. Keys use epoch + generation. Old renders cannot overwrite. Old roots cannot replay. See Page cache → generations .

**Shutdown.** Coordinator closes first. Candidates get `Closed`. Listener drops tasks. Blocking work resists forced stop. Deadline bounds waiting only.

## The reload boundary in depth

Live state: one generation — application state plus listener generations. Each listener pins bind, PROXY, TLS, identity, drain control. Connections pin trust at acceptance (`ServingView` via `CoreHandler`). Compatible reloads stay visible live. Incompatible trust retires the group: H2 GOAWAY, H1 close-after-response, H3 bounded drain. Old connections never reach new routes.

         Owner table: resource, owner, replacement rule

| Resource | Owner | Replacement rule |

| TCP addresses, workers, fds | listener plan + `uring` groups | Same-socket successors behind barrier; identities verified. |

| UDS path, permissions | listener adoption | Distinct owned path; never unlink inherited sockets. |

| TLS acceptor, mTLS, PROXY | per-core TLS bridge | Pinned per connection, per generation. |

| Certificates / SNI map | `CertReloadHandle` | One validated snapshot per generation; swaps not atomic. |

| QUIC endpoint / UDP fds | `QuicResources` | Stable UDP; policy handle for future handshakes. |

| kTLS template | TLS worker | New handshakes only; keys connection-owned. |

| ACME overlays, OCSP slots | feature runtimes | Generation-owned targets; leases retained. |

| PHP supervisor / external worker registry | startup | Restart-required. |

| Log writers, budgets, metrics, admission | process-owned Arcs | Retained; reservations preserved. |

| User/group, privileges, namespaces | startup | Never runtime-acquired; rejected first. |

TCP trust order: authenticate → check revision → diff (retain unchanged) → acquire owned candidates → start behind barrier (readiness ≠ permission) → validate (failure drops all) → recheck + publish atomically → activate/stop acceptors → retire old, bounded, outside lock.

## Reproducible checks

           **tests** · isolated loopback listeners and temporary trees
```
cargo test --locked -p httpjet admin
python3 -B scripts/admin-runtime-test.py --binary target/debug/httpjet                       # served-file replacement, validate-only non-mutation, stale writes, SIGHUP restoration, restart incarnation
python3 -B scripts/admin-runtime-test.py --binary target/debug/httpjet --memo-parity         # 48-cell memo parity across a publication
python3 -B scripts/admin-runtime-test.py --binary target/debug/httpjet --persistent-cache    # authenticated on-disk containers, hits across publication, boot-scan restoration
```
