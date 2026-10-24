# Proxy & gateways — httpjet Documentation

> Reverse proxy over h1/h2/h2s, weighted upstream groups with active health checks, WebSocket and SSE relay, and the opt-in FastCGI gateway.

- **Canonical URL:** https://httpjet.net/docs/gateways
- **Source Repository:** https://github.com/faratech/httpjet

---

# Proxy & gateways

Everything that hands a request to another process: the **reverse proxy** (HTTP/1, `h2://`, `h2s://`) with **weighted upstream groups and active health checks**, **WebSocket** and **SSE** relay, and the opt-in **FastCGI** gateway. LSAPI/PHP has its own page . Generic CGI execution and uWSGI are specified but deliberately not routable.

        resolve    acl    rewrite    cache    dispatch    finalize    store

## How a request reaches a backend

Three routes select a gateway, in dispatch order: a **WebSocket map** (` `) when the request carries an upgrade, a **proxy ``** whose URI prefix matches and whose `handler` names a `proxy` extProcessor, and a **rewrite `[P]`** target (deferred so it can still participate in the page cache). Script suffixes (`scriptHandler`) route to LSAPI or FastCGI. A proxy context that cannot resolve its processor falls through to static; a script handler that cannot resolve its pool hard-fails 503.

| Target form | Protocol to the backend |

| `host:port`, `ip:port`, `uds:///path`, `http://…` | HTTP/1.1 with keep-alive pools |

| `https://…` | HTTP/1.1 over TLS; backend certificate verified; optional client cert (`clientCertFile`/`clientKeyFile`) |

| `h2://host:port` httpjet | HTTP/2 prior knowledge (cleartext); multiplexes requests on one backend connection |

| `h2s://host[:443]` httpjet | HTTP/2 over TLS, ALPN fail-closed |

Pool keys are scheme-scoped, so an h1 and an h2 target at the same address never share a connection. Forwarded requests to h2 upstreams are re-absolutized (the h2 client derives `:scheme`/`:authority` from the URI). Proxied *responses* may not assert `X-LiteSpeed-Purge`/`-Cache-Control`/`-Vary` — those are stripped so a remote backend cannot inject cache policy. Named upstreams receive a W3C `traceparent` when tracing is on.

        !   [P] targets are screened
Since 2026-09-16 a rewrite `[P]` URL that resolves (after DNS — `/etc/hosts` pins cannot bypass the screen, and concurrent DNS lookups are bounded so slow resolvers fail fast) to loopback, link-local or a Unix socket is refused unless it matches an operator-configured extProcessor address. Forwarding to a foreign `[P]` origin also withholds client `Authorization` and `Cookie` headers. This closes the class where a `.htaccess` author reaches the local trust plane (metrics, admin, purge endpoints) or leaks origin credentials through the server.

## Upstream groups & selection

An `extProcessor` with several ` ` children is a group. Without the options below it keeps **ordered primary/failover** behavior with a passive circuit breaker (3 consecutive dial failures mark a peer bad; one successful dial clears it — nginx `max_fails` semantics). With them it becomes a load-balanced group:

           **httpd_config.xml** · a weighted group with active probes
```

   application
   proxy
   127.0.0.1:9001
   127.0.0.1:9002
   weighted-round-robin

   2,1

     GET

/ready application.internal 10 2 2 3 200 ``` > [Diagram: proxy-selection] Selection. Eligibility is the intersection of active health and the passive breaker; the policy then picks among eligible peers. A pre-head dial failure marks the peer and moves to the next eligible one; nothing replays a request body that has already been sent. > [Diagram: upstream-health] Peer states. A health-enabled peer starts cold (ineligible) until rise consecutive successes; fall failures take it down; probe success restores it without user traffic. Passive breaker state is independent. All-ineligible → 503. - **Policies:** `primary-first` (default), `weighted-round-robin` (smooth WRR), `weighted-least-active` (active ÷ weight, smooth-WRR tie-break). These options on non-proxy processors, unknown policies and invalid health settings fail config loading rather than silently falling back. - **Probes:** `connect` tests transport only; `GET`/`HEAD` use the configured protocol, validate TLS, bound the response head, compare the status exactly, follow no redirects, consume no body, and carry no cookies, authorization or body. Dedicated connections, a process-wide cap of 16 concurrent probes, skipped missed ticks; they never consume application pool permits. - **All peers in a group share a protocol**; do not put credentials, paths or queries in group authorities. A `Host` override does not override TLS identity. - **Reloads:** candidate generations start no probe tasks; publication starts the new scheduler and retires the old one. Unchanged identities keep their group state; changed endpoints, weights, policies or TLS identities start fresh. Server- and vhost-scoped processors are distinct. - **Reservations** survive the response head: streaming bodies and WebSocket relays release the peer's active count on completion, error or drop. Per-peer metrics carry scope, group name and ordinal labels (never URLs or credentials): `httpjet_proxy_peer_{healthy,probes_total,health_transitions_total,active_requests,selections_total,prehead_failures_total}`, plus `httpjet_proxy_failover_total` and the `httpjet_phase_upstream_seconds` latency histogram. The read-only status API exposes the same peer health.

## Streaming, SSE and timeouts

Upstream responses are **never buffered** (`respBuffer` is parsed but always streams — `check` warns). Server-sent events therefore stay real-time through compression (the per-chunk `CompressStream`) and through H1, H2 and H3 alike. A backend connect timeout is `initTimeout`; the response-head deadline is the processor's default or a context's `responseTimeout` override; a backend timeout is a 504. Request bodies stream to h1/h2 upstreams; a context `maxReqBodySize` is enforced before dispatch.

## WebSocket relay

A ` ` map (`uri` → `address`) or an upgrade request on a proxy context performs the HTTP/1 handshake with the backend and then relays raw frames both ways. The relay supports **plain TCP HTTP/1 upstreams only** — not TLS, H2 or Unix-socket targets. Maps carry a stable `websocket: ` target identity scoped to their vhost, so named-target trace propagation applies; the client span covers the handshake, not the potentially unbounded relay. TCP keepalive keeps a vanished peer from pinning fds and permits forever.

## FastCGI gateway opt-in

An external processor declared ` fcgi ` or `fastcgi` is an `ExtKind::FastCgi` — never silently converted into an HTTP proxy or an LSAPI worker. Only an explicit `cgi` script handler whose named processor is FastCGI dispatches through the gateway; a `cgi` mapping with a missing or different processor **fails closed** and is never served as static source. httpjet does not spawn the application: it connects to the configured TCP or Unix endpoint of an independently supervised process.

           **vhost XML** · FastCGI suffix routing
```

   my_fcgi
   fcgi
   uds:///run/my-app/fcgi.sock
   32
   5

30 fcgi cgi my_fcgi ``` > [Diagram: fastcgi-flow] One request through hj-fastcgi. The pipeline hands over an already-validated script target; the gateway never derives an executable path from the URI. Connections are poisoned by default and only a clean, exact END_REQUEST makes one reusable. Multiplexing request ids on one connection is disabled. - **Wire bounds:** FastCGI version 1, nonzero request id, known record types, the protocol's 65,535-byte record limit; PARAMS lengths are rejected before allocation when either the field bound or the configured aggregate cap would be exceeded. - **Pool:** caps all sockets including idle and in-progress dials under one acquisition deadline; poison/drop releases capacity immediately; clean idle sockets expire oldest-first. - **CGI variables** are server-derived; request headers become `HTTP_*` after validation; processor `env` cannot override protected identity/routing variables (`SCRIPT_FILENAME`, `DOCUMENT_ROOT`, `REMOTE_ADDR`, `SERVER_NAME`, `CONTENT_LENGTH`, `HTTP_AUTHORIZATION`, …). The same deny-list applies to `.htaccess` `[E=]` for LSAPI. - **Bodies** are buffered under the shared budget so the exact STDIN length is known; declared underflow/overflow, framing errors and cancellation poison the connection. - **Responses:** strict CRLF head, repeated end-to-end headers preserved, one valid `Status`, CGI `Location` default, folding rejected, app hop-by-hop headers and origin cache-control headers (`X-LiteSpeed-*`) stripped, and streams that end without an `END_REQUEST` frame abort the body; STDERR is byte-capped and control-escaped into the error log, never the client. Known follow-ups: explicit CGI context-directory routing (today: script-handler suffix mappings only), a codec fragmentation corpus, and a maintained real-application interoperability fixture.

## Conventional CGI and uWSGI not routable

Both remain disabled by design until a demonstrated workload exists. Existing `type=cgi`, `rails`, `appserver` and unknown processor types never activate either; `check --strict` keeps warning for configured CGI contexts. The design contracts are strict on purpose: CGI would require an absolute execution root distinct from the docroot, a fixed non-root identity, wall/CPU/memory/process/output limits, an executable allowlist, direct `execve` with no shell or PATH lookup, inode pinning, and bounded pipes with process-group termination; uWSGI would be a separate crate over an explicit endpoint with modifier-0 packets only, no multiplexing, and no connection reuse until a maintained responder proves the response boundary. Proposed identities are `type=cgi-exec` and `type=uwsgi`.

## Reproducible checks

           **tests** · loopback fixtures only
```
cargo test --locked -p hj-config -p hj-proxy
cargo test --locked -p hj-proxy --test upstream_groups     # h1/h2 weighted distribution, cold start, down/recovery, all-down 503
cargo test -p hj-fastcgi                                    # synthetic loopback responder + clean-connection reuse
cargo test -p httpjet --bin httpjet
```

To return a group to legacy selection, remove `loadBalancePolicy`, `addressWeights` and `healthCheck` and reload; removing only the health check keeps the configured policy.
