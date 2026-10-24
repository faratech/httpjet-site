# Admin API & reload — httpjet Documentation

> SIGHUP reload semantics, the read-only status API, the transactional configuration API, revisions, and the restart-required boundary.

- **Canonical URL:** https://httpjet.net/docs/admin-api
- **Source Repository:** https://github.com/faratech/httpjet

---

# Admin API & reload

Three ways to change or inspect a running httpjet: **SIGHUP**, the opt-in **read-only status API**, and the separately authenticated **transactional configuration API**. All writers — including SIGHUP — go through one publication coordinator, so a change is either fully published as a new generation or not applied at all, and anything the process cannot safely replace at runtime is reported as `restart_required` rather than half-done.

## SIGHUP

`systemctl reload httpjet` (or `kill -HUP`) re-parses the tree, builds application state *before* touching certificate resolvers, and publishes through `config_transaction::Coordinator`. Preserved from the command line: `--no-mtls` and `--per-ip-rate` overrides. Outcomes, in the journal:

- **published**: New generation serving; in-flight requests finish on the old one; certificate handles reloaded for the unchanged listener topology.

- **requires a restart — keeping current config**: The diff touched a boot-owned resource (hot reload covers vhost/rewrite/access/expires/tuning, cache policy gates and TLS material).

- **reload would 404 mapped vhost(s)**: A per-vhost file failed to load; the old generation is kept rather than serving 404s.

- **reload rejected**: Parse or build error — nothing changes.

- **certificate reload failed**: Application state published; certificates whose reload failed are retained.

## Read-only status API

Opt in with `serve --admin-addr 127.0.0.1:9091`. Non-loopback addresses are rejected at argument parsing; a bind failure aborts startup. It is a separate listener from metrics, changes nothing, and exposes no profiling, allocation or purge operations.

           **GET** /v1/status · schema_version 1
```
$ curl -s http://127.0.0.1:9091/v1/status | jq .
{
  "schema_version": 1,
  "generation": 3,                       # process-local, starts at 1; rejected candidates stay invisible
  "config_fingerprint": "sha256:…",      # of the normalized model's Debug form — comparable within one binary version only
  "listeners": [{"name":"https","tls":true,"unix":false}],   # configured names + flags, NOT bound addresses
  "vhosts": ["example.test"],
  "upstreams": [{"scope":"server","group":"application","peers":[{"ordinal":0,"healthy":true,"active":2,"selections":1290}]}],
  "page_cache": {"entries": 41210, "memory_bytes": 60817408, "hits": 1904411, "misses": 88123},   # or null when off
  "truncated": false
}
```

No configuration values, paths, credentials, request headers, session keys or cached URLs are returned. Names are limited to 256 characters and each collection to 256 rows; the response is capped at 1 MiB (503 beyond). Only GET at the exact path (405/404 otherwise); Host must be a loopback socket authority or `localhost`; Origin headers and request bodies are rejected; `Cache-Control: no-store`; every connection closes; 4 KiB/32 header fields; four concurrent tasks with five-second deadlines. Local users are trusted — this is not an authentication boundary between users on the same host, and it must never be reverse-proxied.

## Transactional configuration API

Writable access is a separate, explicit opt-in that never becomes available merely because the read-only listener is on. Three options are required together:

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

Framing: `Authorization: Bearer ` (missing/duplicate/malformed → 401 without reading the body; constant-time digest compare; nothing about the token in Debug, logs or responses), exact quoted `If-Match` (missing → 428; stale → conflict), `Content-Type: application/json`, one positive `Content-Length` ≤ 1 MiB, headers ≤ 8 KiB/32 fields, five-second combined deadline, Host equal to the bound loopback address or `localhost: `; transfer/content encodings, Origin, Expect, Upgrade and Trailer are rejected; one request per connection, never pipelined. At most four connections and one candidate build; writer-lock acquisition is bounded at 5 s and candidate waiting at 10 s — a timed-out build keeps its admission permit until it exits and can never publish after its caller stopped waiting.

           **body** · the in-memory bundle (exactly three fields)
```
{
  "server_xml": " … ",
  "vhosts": [ {"name": "example.test", "xml": " … "} ],
  "mime": "text/html = html, htm\n"
}
```

`hj-config::parse_bundle` normalizes the bundle without ever reading the submitted `configFile` paths: 1 MiB aggregate, ≤128 vhosts, one root element per document, no DTD, ≤64 nesting levels, missing/extra/duplicate declarations fatal, diagnostics suppressed, errors carry no submitted data. The server root always comes from startup.

### What a transaction may change

#### Reloadable (application)

- Listener→vhost mappings on the unchanged listener set
- Rewrites, document roots, contexts, static locations
- Reloadable request settings, cache policy gates, expires
- Proxy processors and groups (health schedulers restart cleanly)
- GeoIP database and upstream client-cert files — inside a resource root

#### Constrained trust (TCP transaction)

- Listener identity/routing, PROXY-protocol policy, TLS certificate/key/CA/CRL material — through prepared same-socket TCP successors
- An existing `--http-uds` endpoint is handed off
- An already-enabled QUIC endpoint adopts the new TLS/mTLS policy for future handshakes without rebinding UDP
- UDS ext-processor addresses authorized against resource roots

#### restart_required

- Listener addresses, count, order, secure/plain roles; QUIC enablement; UDS topology
- PHP topology and pools; non-proxy processors
- Cache-store identity and boot-time cache caps/policy
- User/group, namespace and isolation settings, per-vhost log resources
- `useIpInProxyHeader` and the whole ` ` block

**Resource policy.** Every filesystem reference in a candidate (vhost roots, docroots, static contexts, GeoIP file, upstream client certs, TCP certificate/key/CA/CRL paths) must resolve inside one of the operator's `--admin-resource-root` directories: parent traversal, relative paths, missing resources and symlinks resolving outside the roots are rejected at submission time. This is authorization, not a sandbox — roots and their symlinks stay operator-controlled. Failures return bounded categories, never configuration values.

**Cache namespaces.** The first successful publication introduces a response-cache epoch; every later generation keys page-cache and memo entries by epoch + generation, so a late render from an old generation cannot overwrite a new entry and a previous document root's memoized response cannot replay. See Page cache → generations .

**Shutdown.** Closing the coordinator precedes cancelling serving; a prepared candidate receives `Closed` and cannot reactivate probes; the write listener drops its connection tasks. Blocking candidate work cannot be forcibly stopped by tokio, so use responsive local resource files — the ten-second deadline bounds the caller's wait, not an uninterruptible filesystem call.

## The reload boundary in depth

Live state is a *resource generation*: application state plus references to listener generations, each with immutable bind, PROXY-protocol and TLS-verification policy, a resource identity, and separately owned accept/drain control. Connections pin their trust generation at acceptance (`CoreHandler` reads a trust-epoch-aware `ServingView`, pinned again at TCP/UDS accept and per QUIC connection). Compatible application reloads stay visible to existing connections; an incompatible trust change retires the old listener group — H2 gets GOAWAY, H1 closes after its current response, H3 stops admitting streams while preserving connection IDs through a bounded drain — rather than letting an old unauthenticated connection reach newly protected routes.

| Resource | Owner | Replacement rule |

| TCP addresses, worker count, inherited fds | listener plan + `uring` worker groups | Prepared successors on the same sockets behind an activation barrier; kernel socket identities verified; raced accepts transferred to the successor. |

| UDS path and permissions | listener adoption | Stage a distinct owned path; never unlink an inherited or unrelated socket; retain the old inode until retirement. |

| TLS acceptor, mTLS requirement, PROXY binding | per-core TLS bridge | Pinned to one listener generation per connection. |

| Certificates / SNI map | `CertReloadHandle` | Validated snapshots published as one trust-generation handle; multi-resource swaps are not advertised as atomic. |

| QUIC endpoint / UDP fds | process-persistent `QuicResources` | UDP ownership stable; a shared policy handle replaces quinn's server config for future handshakes; a stale policy rejects new handshakes once its epoch is no longer current. |

| kTLS template | TLS worker | New templates apply to new handshakes; existing key schedules are connection-owned. |

| ACME overlays, OCSP staple slots | feature runtimes | Certificate targets owned by resource generation; refresh leases retained through retirement. |

| PHP supervisor / external worker registry | startup | Restart-required. |

| Log writers, cache budgets, body budget, metrics, bridge admission | process-owned Arcs | Retained across reloads; outstanding reservations preserved. |

| User/group, privileges, namespaces, systemd topology | startup | Never acquired at runtime; rejected before any resource acquisition. |

Acquisition order for a TCP trust transaction: authenticate and check the revision → derive the resource diff with unchanged resources retained by identity → acquire candidate-only resources with every descriptor, thread and pending side effect owned on creation → start candidate workers behind an activation barrier (readiness proves adoption, not permission to serve) → validate the complete bundle (failure drops and joins everything) → recheck the revision under the coordinator's publication/close boundary and publish atomically — no fallible resource creation after that point → activate and stop old acceptors → retire old generations outside the publication lock, bounded.

## Reproducible checks

           **tests** · isolated loopback listeners and temporary trees
```
cargo test --locked -p httpjet admin
python3 -B scripts/admin-runtime-test.py --binary target/debug/httpjet                       # served-file replacement, validate-only non-mutation, stale writes, SIGHUP restoration, restart incarnation
python3 -B scripts/admin-runtime-test.py --binary target/debug/httpjet --memo-parity         # 48-cell memo parity across a publication
python3 -B scripts/admin-runtime-test.py --binary target/debug/httpjet --persistent-cache    # authenticated on-disk containers, hits across publication, boot-scan restoration
```
