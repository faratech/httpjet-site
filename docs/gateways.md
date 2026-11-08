# Proxy & gateways — httpjet Documentation

> Proxy traffic to other servers and services.

- **Canonical URL:** https://httpjet.net/docs/gateways
- **Source Repository:** https://github.com/faratech/httpjet

---

# Proxy & gateways

You hand requests to other processes here: reverse proxy, WebSocket and SSE relay, and FastCGI. LSAPI/PHP has its own page .

        resolve    acl    rewrite    cache    dispatch    finalize    store

## How a request reaches a backend

Three routes select a gateway, in dispatch order. Script suffixes route to LSAPI or FastCGI instead.

- Rewrite `[P]` target. Limit: deferred until after the page-cache lookup, so it can still cache.

- WebSocket map (` `). Limit: only when the request carries an upgrade.

- Proxy ` ` whose prefix matches and whose `handler` names a `proxy` extProcessor. Limit: missing, unknown, or non-`proxy` handlers give 503, never static fallthrough.

| Target form | Protocol. Limit: |

| `host:port`, `ip:port`, `uds:///path`, `http://…` | HTTP/1.1 with keep-alive pools. Limit: pool keys are scheme-scoped. |

| `https://…` | HTTP/1.1 over TLS, certificate verified. Limit: optional client cert via `clientCertFile`/`clientKeyFile`. |

| `h2://host:port` httpjet | HTTP/2 prior knowledge (cleartext). Limit: multiplexes on one backend connection. |

| `h2s://host[:443]` httpjet | HTTP/2 over TLS. Limit: ALPN fail-closed; h2 requests re-absolutized for `:scheme`/`:authority`. |

Proxied responses may not assert `X-LiteSpeed-Purge`/`-Cache-Control`/`-Tag`/`-Vary`; you strip them. Named upstreams receive a W3C `traceparent` when tracing is on.

        !   [P] targets are screened

- Since 2026-09-16, a `[P]` URL resolving to any non-public-unicast address is refused. Limit: loopback, unspecified, link-local, RFC 1918, CGNAT, multicast, and documentation ranges count; `/etc/hosts` pins cannot bypass DNS screening.

- Only an exact operator-configured extProcessor or WebSocket-map address exempts a screened target. Limit: Unix-socket `[P]` targets are always refused; concurrent DNS lookups stay bounded.

- When the request can choose the upstream host via substitution, you withhold client credentials. Limit: `Authorization`, `Proxy-Authorization`, and `Cookie` are withheld when scheme/authority comes from `$N`/`%N`/`%{…}`.

## Upstream groups & selection

Several ` ` children make a group. Without options you keep ordered primary/failover with a passive breaker: 3 consecutive dial failures mark a peer bad, one success clears it.

           **httpd_config.xml** · a weighted group with active probes
```

   application
   proxy
   127.0.0.1:9001
   127.0.0.1:9002
   weighted-round-robin

   2,1

     GET

/ready application.internal 10 2 2 3 200 ``` > [Diagram: proxy-selection] Selection. Eligibility intersects active health and the passive breaker; policy picks among eligible peers. A pre-head dial failure marks the peer and moves on; sent bodies never replay. > [Diagram: upstream-health] Peer states. A peer starts cold until rise successes; fall failures take it down; probes restore it. All-ineligible gives 503. - **Policies:** `primary-first` (default), `weighted-round-robin` (smooth WRR), `weighted-least-active` (active ÷ weight, WRR tie-break). Limit: invalid policies, weights, or health settings fail config loading. - **Probes:** `connect` tests transport; `GET`/`HEAD` validate TLS, bound the head, compare status exactly, follow no redirects, and consume no body. Limit: no cookies, authorization, or body; 16 concurrent probes process-wide; pool permits untouched. - **Groups share one protocol.** Keep credentials, paths, and queries out of group authorities. Limit: a `Host` override never overrides TLS identity. - **Reloads:** candidates start no probes; publication starts the new scheduler and retires the old. Limit: unchanged identities keep state; changed endpoints, weights, policies, or TLS identities start fresh. - **Reservations** survive the response head. Limit: streams and WebSocket relays release the active count on completion, error, or drop. Metrics carry scope, group, and ordinal labels only: `httpjet_proxy_peer_{healthy,probes_total,health_transitions_total,active_requests,selections_total,prehead_failures_total}`, `httpjet_proxy_failover_total`, `httpjet_phase_upstream_seconds`. See the status API .

## Streaming, SSE and timeouts

Upstream responses never buffer (`respBuffer` parses but always streams; `check` warns). SSE stays real-time through compression and H1, H2, and H3.

| Timeout | Meaning. Limit: |

| Backend connect | `initTimeout` bounds the connect. Limit: see your processor configuration. |

| Response head | Processor default bounds the head. Limit: a context `responseTimeout` overrides it. |

| Backend timeout | An exceeded backend deadline answers 504. Limit: request bodies still stream to h1/h2 upstreams. |

| Request body size | A context `maxReqBodySize` is enforced before dispatch. Limit: before any backend work. |

## WebSocket relay

A ` ` map (`uri` → `address`) or a `ws://` rewrite `[P]` performs the HTTP/1 backend handshake, then relays raw frames. An upgrade reaching an ordinary proxy ` ` without a map gets 426.

- Upstreams are plain TCP HTTP/1 only. Limit: no TLS, H2, or Unix-socket targets.

- Maps carry a stable `websocket: ` identity, vhost-scoped, for trace propagation. Limit: the client span covers the handshake, not the unbounded relay.

- TCP keepalive stays on. Limit: a vanished peer cannot pin fds and permits forever.

## FastCGI gateway opt-in

Declare ` fcgi ` or `fastcgi` for `ExtKind::FastCgi` — never a silent proxy/LSAPI conversion. Only an explicit `cgi` handler naming it dispatches; httpjet spawns nothing, connecting to your supervised TCP/Unix endpoint.

           **vhost XML** · FastCGI suffix routing
```

   my_fcgi
   fcgi
   uds:///run/my-app/fcgi.sock
   32
   5

30 fcgi cgi my_fcgi ``` > [Diagram: fastcgi-flow] One request through hj-fastcgi. The gateway takes an already-validated script target and never derives an executable from the URI. Only a clean, exact END_REQUEST makes a connection reusable; multiplexing is disabled. - **Wire bounds:** FastCGI version 1, nonzero request id, known record types, 65,535-byte records. Limit: PARAMS rejected before allocation past field or aggregate caps. - **Pool:** all sockets, including idle and dialing, cap under one acquisition deadline. Limit: poison/drop releases capacity immediately; clean idle sockets expire oldest-first. - **CGI variables** are server-derived; headers become validated `HTTP_*`. Limit: processor `env` cannot override `SCRIPT_FILENAME`, `DOCUMENT_ROOT`, `REMOTE_ADDR`, `SERVER_NAME`, `CONTENT_LENGTH`, `HTTP_AUTHORIZATION`, etc. (same deny-list as LSAPI `[E=]`). - **Bodies** buffer under the shared budget for an exact STDIN length. Limit: underflow/overflow, framing errors, and cancellation poison the connection. - **Responses:** strict CRLF head, repeated end-to-end headers kept, one valid `Status`, CGI `Location` default, folding rejected. Limit: hop-by-hop and `X-LiteSpeed-*` stripped; missing `END_REQUEST` aborts; STDERR is capped and escaped into the error log only. Known follow-ups: CGI context-directory routing (today suffix mappings only), a codec fragmentation corpus, and a real-application interoperability fixture.

## Conventional CGI and uWSGI not routable

Generic CGI and uWSGI stay disabled until a demonstrated workload exists; see Capabilities . Existing `type=cgi`, `rails`, `appserver`, and unknown types never activate them, and `check --strict` warns on CGI contexts.

Proposed identities are `type=cgi-exec` and `type=uwsgi`. Their contracts require fixed non-root identities, strict limits, and (for CGI) direct `execve` with inode pinning; uWSGI would use modifier-0 packets only, no multiplexing or reuse.

## Reproducible checks

           **tests** · loopback fixtures only
```
cargo test --locked -p hj-config -p hj-proxy
cargo test --locked -p hj-proxy --test upstream_groups     # h1/h2 weighted distribution, cold start, down/recovery, all-down 503
cargo test -p hj-fastcgi                                    # synthetic loopback responder + clean-connection reuse
cargo test -p httpjet --bin httpjet
```

To return a group to legacy selection, remove `loadBalancePolicy`, `addressWeights` and `healthCheck` and reload; removing only the health check keeps the configured policy.
