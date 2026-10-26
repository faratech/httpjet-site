# Observability — httpjet Documentation

> Prometheus metrics, the cache-entries report, access and error logs in text or JSON, syslog, request ids, telemetry, the PHP slow log, OpenTelemetry, and profiling.

- **Canonical URL:** https://httpjet.net/docs/observability
- **Source Repository:** https://github.com/faratech/httpjet

---

# Observability

Everything httpjet tells you about itself: **Prometheus metrics** on a loopback listener, the **cache-entries** report, access and error **logs** in text or JSON with an optional syslog tap, per-request **correlation ids**, the telemetry TSV and PHP slow log, opt-in **OpenTelemetry** traces and metrics, and the profiling endpoints. All control surfaces are loopback-only by design.

## Prometheus metrics

`--metrics-addr` (default `127.0.0.1:9090`; empty disables) serves `/metrics` in the Prometheus text format. Over 180 metric families today; the families that matter, grouped:

| Metric | Type | Meaning |

| Requests & connections |

| httpjet_requests_total · httpjet_active_requests · httpjet_active_connections | counter / gauge | Served requests, requests in the response-head phase, open connections. |

| httpjet_requests_by_vhost · httpjet_responses_by_vhost · httpjet_request_duration_by_vhost_seconds | labeled | Per-vhost volume, status class and handle() wall time. |

| httpjet_status_{2xx,3xx,4xx,5xx} · httpjet_status_{400,403,404,410,414,429,500,502,503,504} | counter | Status classes and the interesting exact codes. |

| httpjet_proto_{h1,h2,h3} · httpjet_served_{static,php,proxy} | counter | Wire protocol and terminal mix. |

| httpjet_request_duration_seconds · httpjet_phase_{rewrite,cache_lookup,compress,upstream}_seconds | histogram | Total handle() time and sampled per-stage costs (upstream = proxy checkout → response head). |

| httpjet_tls_handshakes_{full,resumed}_total · httpjet_conn_{idle,peer}_closes_total | counter | Full vs resumed TLS handshakes; connection closes by idle timeout vs peer FIN/RST. |

| httpjet_h2_rapid_reset_goaways_total · httpjet_h2_send_stall_resets_total · httpjet_h3_send_stall_resets_total | counter | H2 connections closed with ENHANCE_YOUR_CALM when cancellations outrun the time-refilled rapid-reset budget; H2 and H3 response streams reset on send stall. |

| httpjet_throttle_{allowed,rejected}_total | counter | Per-IP throttle decisions (0 when disabled). |

| httpjet_body_buffer_{bytes,capacity_bytes,rejected_total} | gauge / counter | The process-wide request-body budget. |

| Fast path & rewrite |

| httpjet_fast_memo_{hits,stores,ineligible}_total | counter | Finished-response memo activity; *ineligible* = the chain refused the store (see `httpjet check`). |

| httpjet_fast_cookie_{none,member_session,benign_only}_total · httpjet_fast_bridge_total{reason} | counter | Cookie shape of fast-path GET/HEADs and attribution of why a GET/HEAD fell off the on-core fast path into the tokio bridge. |

| httpjet_rewrite_outcome_{hits,misses,uncacheable}_total · httpjet_rewrite_ua_classify_entries | counter / gauge | Rewrite-outcome cache and UA-classification table size. |

| Page cache |

| httpjet_pagecache_{hits,misses,stores,purges,purges_received,store_purge_rejections,expired_misses}_total · httpjet_pagecache_hit_ratio · httpjet_cache_hit_ratio_real | counter / gauge | Core activity; `_real` excludes loopback probes; `httpjet_cache_{hits,misses}_by_vhost{vhost}` split it per vhost and `httpjet_pagecache_evictions_total` counts size/TTL teardowns. Telemetry twins `httpjet_cache_{hits,misses,bypass,stale_serves,sie_serves,admitted,rejected}` and `httpjet_disp_*` (why a response was or wasn't stored) plus `httpjet_cache_admit_ratio`. |

| httpjet_pagecache_entries · _memory_bytes · _hot_bytes · _decoded_entries · _meta_{raw,compressed}_bytes · _tag_{keys,memberships,index_bytes} · _tag_purge_{tombstones,floor_milliseconds} | gauge | Exact RAM accounting of the index and tag indexes. |

| httpjet_pagecache_disk_{bytes,max_bytes} · _disk_evictions_total · _disk_evict_age_{lt_1h,1h_6h,6h_24h,ge_24h}_total · _swept_expired_total | gauge / counter | File-tier footprint vs budget, LRU evictions by entry age, proactive expiry sweeps. |

| httpjet_pagecache_disk_{read,write,full}_errors_total · _missing_file_invalidations_total · _orphan_{reclaimed,deferred}_total · _meta_decode_errors_total · _key_id_collisions_total · _poisoned_locks_total | counter | Health: every one of these should be flat. Poisoned locks nonzero = indexes may be inconsistent. `httpjet_pagecache_integrity_active` = 1 once the file-tier integrity key is installed. |

| httpjet_pagecache_dict_recompress_total · _dict_recompress_bytes_total · httpjet_pagecache_refresh_inflight | counter / gauge | Store-time dictionary recompressions (bounded background pool); stale-while-revalidate refreshes in flight. |

| httpjet_pagecache_shared_path_{public_routes,canary_skipped}_total · _shared_paths_{matchers,canary_percent} | counter / gauge | Shared-paths routing. |

| httpjet_xf_capsule_{hits,misses,stale_hits,dedicated_stores,canary_filtered}_total · _hits_by_class_total · _shell_age_secs | counter / summary | XenForo capsule tier. |

| httpjet_process_rss_bytes · httpjet_process_rss_anon_bytes · httpjet_pagecache_unaccounted_rss_anon_bytes | gauge | Process RSS and the part the cache accounting cannot explain. |

| LSAPI / PHP |

| httpjet_lsapi_{acquire,dispatch,ttfb}_seconds | histogram | Pool contention · backend call · request-committed-to-first-byte. |

| httpjet_lsapi_generation_advances_total · _stale_{idle,checked_out}_drops_total · _stale_worker_retire_{signals,failures}_total · _worker_attribution_failures_total · _eagain_{retries,terminal_exhaustions}_total · _reset_replays_total · _reset_replay_exhaustions_total | counter | External-pool generation lifecycle, backlog pressure, and fresh-dial replays of requests a retiring worker reset before any response byte. |

| Proxy |

| httpjet_proxy_peer_{healthy,probes_total,health_transitions_total,active_requests,selections_total,prehead_failures_total} · httpjet_proxy_failover_total | labeled | Per-peer (labels `scope`, `group`, `peer` = ordinal) health and selection; failovers served by a non-primary peer. |

| Logging, OTel, debug |

| httpjet_log_{access,error,vhost}_dropped_lines_total | counter | Access (unified + per-vhost), per-vhost error, and per-vhost writer log lines shed by the bounded writer queues (65,536 lines / 64 MiB per logger). |

| httpjet_otel_spans_{queue,dropped_total,exported_total,export_failed_total} · httpjet_otel_http_{exports,export_failures}_total | gauge / counter | Span queue depth and loss; collector HTTP outcomes (observable even when the collector is down). |

| httpjet_debug_cache_entries_{renders,throttled}_total | counter | Renders of the `/cache-entries` report and locally throttled requests for it. |

## The cache-entries report

`GET /cache-entries` on the metrics listener (not the main port — there it hits the vhost and 301s) renders a throttled text report: total entries and bytes, per-URL-class counts, top-N by size, a `ram: entries=… disk: bytes=…/max evictions=… swept_expired=…` line (live index count vs charged tmpfs footprint), and a health line (hits/misses/stores/purges/disk_{read,write}_err/poisoned_locks). `/__mimalloc-stats` beside it prints allocator statistics; `/debug/pprof/profile` (build feature `profiling`) returns a CPU profile — the release binary keeps its symbol table and frame pointers for exactly this. Whereas `/metrics` is open on loopback, `/cache-entries`, `/__mimalloc-stats`, `/__alloc-count` and `/debug/pprof/profile` all require `Authorization: Bearer ` matching `--profile-token-file` (returning 403 when unset or mismatched).

## Logs

          Access log  Error log  Syslog tap  Per-vhost logs

The unified access log (path from the XML; combined format with a trailing `reqid=` token) writes from a dedicated non-blocking task with a bounded queue (65,536 lines and 64 MiB per logger; `httpjet_log_access_dropped_lines_total` counts sheds), opens and rotates without following symlinks (`O_NOFOLLOW`), rolls asynchronously at 50 MiB and prunes after 30 days (`HTTPJET_ACCESS_ROLLING_BYTES`, `HTTPJET_ACCESS_KEEP_DAYS`). `HTTPJET_ACCESS_LOG_FORMAT=json` emits one object per line with a fixed field order:

               access · json
```
{"ts":"17/Sep/2026:11:02:09 +0000","client_ip":"203.0.113.9","remote_user":null,"method":"GET","uri":"/threads/hello.123/","protocol":"HTTP/2.0","status":200,"bytes":41211,"referer":null,"user_agent":"Mozilla/5.0 …","reqid":"3f9c2a7b81d04e55"}
```

Unix-socket peers render the literal host `unix:`. Cache disposition is in the response header (`x-litespeed-cache`), not the log line; join on `reqid`.

The rolling `httpjet_error.log` (and captured backend stderr) is text by default. `HTTPJET_ERROR_LOG_FORMAT=json` switches to JSON events with `schema_version 1`: `timestamp_unix_ms`, `level`, nullable `target`, `message`, and a `fields` object that keeps tracing WARN/ERROR fields named rather than flattened. JSON-only redaction replaces values of authorization/cookie/password/token/secret/key/credential-named fields and suppresses whole values that look like credential syntax or URL userinfo — a conservative heuristic, not a guarantee. Bounds: 32 fields, 1024-char values, 8192-char messages; inputs over 32 KiB become `[OVERSIZED]`. The stdout/journald tracing formatter (`RUST_LOG`) is unaffected.

`HTTPJET_SYSLOG_TARGET` mirrors every rendered access line as an RFC 5424 (or 3164) datagram from the writer task — request path untouched, file logging unaffected, send failures counted. The MSG part is the rendered line itself, so existing parsers keep working. Targets: `udp://host:514`, bare `host:port`, or a unix-dgram path like `/run/systemd/journal/syslog`. Facility/severity/hostname/app-name knobs are on the CLI page .

A vhost's ` ` block with `useServer=0` and a `fileName` gives it its own access and error files (rolling size and keep-days per file; `logHeaders` 7 = combined format plus the quoted `Host`). Log paths are boot-owned: they cannot be changed through the write API.

## Request ids

Every request gets a 64-bit correlation id (a per-process seed mixed into a lock-free counter — no syscall, no RNG on the hot path; a background stale-while-revalidate refresh inherits its parent's id) that appears in the access, error and PHP-slow logs. `--request-id-header` also echoes it as `X-Request-Id` so a client or CDN can join a response to the server-side records. Off by default.

## Telemetry TSV and the PHP slow log

- **`--telemetry-file logs/telemetry.tsv`**: Appends a cumulative snapshot row of the in-RAM aggregates every `--telemetry-flush-secs` (30): durability across restarts and a self-contained time series (~1 MB/day). The `:9090` endpoint works without it.

- **`--php-slow-log logs/php-slow.tsv`**: A TSV line for every LSAPI request whose render TTFB exceeds `--php-slow-threshold-ms` (50), plus a 1-in-128 sample of *all* PHP requests as the population baseline — the per-URL / user-class attribution behind `httpjet_lsapi_ttfb_seconds`. Rolls at 64 MiB, gzip archives, 7-day prune.

These two files are what produced the production attribution on the Performance page: mean request 9.99 ms, of which 8.96 ms is inside PHP.

## OpenTelemetry --features otel

Build with `--features otel`, then set `HTTPJET_OTEL=1`; without it no provider or exporter is created, and requesting it in a binary without the feature fails startup. The official Rust SDK exports OTLP HTTP/protobuf to `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` (complete URL). `HTTPJET_OTEL_METRICS=1` adds a 30-second periodic metrics reader to `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`.

> [Diagram: otel-spans] What gets exported. One root span per request at the dispatch boundary, backend client spans, internal stage spans on sampled requests, and a loss-accounted batch exporter. Spans carry status and bounded internal attributes only — no headers, bodies, URLs or error text.

- **Sampling and trust.** `HTTPJET_OTEL_SAMPLE_RATIO` (default 0.01) ratio-samples roots; children follow. Inbound `traceparent`/`tracestate`/`baggage` are discarded by default — clients cannot dictate parentage or force sampling. `HTTPJET_OTEL_TRUSTED_PARENTS` lists exact gateway IPs (direct peers on a known non-PROXY listener) allowed to supply a single version-00 traceparent; a listed gateway controls parentage *and sampling*, so it must strip public trace headers first. Do not list a CDN merely because it forwards client IPs.

- **Propagation.** Named configured proxy targets and WebSocket maps receive the generated traceparent; LSAPI receives it as `HTTP_TRACEPARENT`; ad-hoc targets get nothing.

- **Completion.** H1 spans end when the transport's write returns (including sendfile bodies); H2 spans ride the `ResponseCompletion` extension through flow control and the final flush; H3 spans complete when QUIC accepts the FIN. `httpjet.body.outcome` is `complete`/`error`/`cancelled` (`upgraded` for WebSocket). This is local write completion, not peer receipt.

- **Bounds.** Dedicated export thread, 2048 queued spans + one 256-span batch, 1 s interval, 2 s request timeout, 64 KiB response cap, no redirects or environment proxies, 3 s provider shutdown. Saturation drops telemetry rather than blocking serving; drops are counted on both the OTLP and Prometheus sides.

- **Metrics instruments.** `httpjet.pipeline.requests.completed` and `httpjet.pipeline.response_head.duration` (seconds, bounded status labels), plus `httpjet.otel.http.exports`.

           enable
```
HTTPJET_OTEL=1 HTTPJET_OTEL_METRICS=1 HTTPJET_OTEL_SAMPLE_RATIO=0.05 \
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://127.0.0.1:4318/v1/traces \
OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=http://127.0.0.1:4318/v1/metrics \
httpjet --root /abs/root serve …
```

## The read-only status API

`--admin-addr 127.0.0.1:9091` exposes `GET /v1/status`: generation, configuration fingerprint, listener names, vhost names, upstream peer health/active/selection counters and page-cache aggregates — never paths, credentials or cached URLs. Full contract on Admin API & reload .

## Debugging a request

           tracing filters
```
RUST_LOG=debug,hj_rewrite=trace httpjet --root /abs/root serve --http-addr 127.0.0.1:8080 …
# where to look: vhost resolution (hj-core router) → rewrite outcome (hj-rewrite eval) →
#   cache lookup (httpjet lscache) → terminal (pipeline dispatch) → response (handler)
```

Production units run `RUST_LOG=httpjet=info`; anything you must see in the journal should log at WARN or above.
