# Extending httpjet — httpjet Documentation

> Compile-time extension hooks, the bounded WAF sidecar contract, and why there is no dynamic plugin ABI.

- **Canonical URL:** https://httpjet.net/docs/extensions
- **Source Repository:** https://github.com/faratech/httpjet

---

# Extending httpjet

Two extension points, each with a deliberately narrow contract: **compile-time extensions** — trusted Rust crates linked into a custom build that register read-only pre-handlers and response transforms — and the **WAF sidecar**, a bounded loopback HTTP inspection call for an independently deployed engine. There is no dynamic plugin ABI and no in-process sandbox, on purpose.

## Compile-time extensions

`hj-extension::ExtensionRegistry` is assembled at the binary's registration point, `crates/httpjet/src/extensions.rs`. The distributed binary registers nothing, so the facility is inert unless an operator maintains a custom build. It is a *source-level* compatibility contract over the frozen `hj-core` types, not a stable native ABI.

           **extensions.rs** · registration
```
pub(crate) fn compiled_registry() -> hj_extension::ExtensionRegistry {
    let mut registry = hj_extension::ExtensionRegistry::new();
    registry.register_pre_handler("company.request-policy", company_policy::hook()).expect("unique");
    registry.register_response_transform("company.headers", company_headers::transform()).expect("unique");
    registry
}
```

Registration order is execution order. Names are globally unique, 1–64 bytes of lowercase ASCII letters, digits, `.`, `-` and `_`. Registered extensions are logged once at boot; changing them means rebuilding and restarting, and SIGHUP carries the same linked registry into the next generation. Extension settings belong to the extension crate — the registry does not reinterpret LiteSpeed XML and exposes no runtime loader.

> [Diagram: extension-hooks] Where hooks run. Pre-handlers run after trust and access resolution but before everything that could serve a byte; response transforms run after dispatch (and after page-cache storage) but before httpjet's own transforms, so an extension changes egress, not the canonical cached object, and is re-applied on hits.

### Pre-handler contract

A `PreHandler` receives an immutable `ReqCtx` and a `RequestView` exposing only method, URI and headers — no body, no mutable parts. It returns `Continue` (next hook, then built-in dispatch), `Respond(response)` (skip remaining hooks and dispatch; normal transforms, metrics, request-id handling and access logging still run), or `Err(HandlerError)` (fail closed to that status and log the named failure). Pre-handlers never see reserved operational routes intercepted before vhost dispatch (ACME challenges, loopback cache endpoints) or requests rejected before the hook boundary. **Any registered pre-handler disables the on-core memo/cache/static fast path**, because that synchronous path cannot run async hooks; response-only extensions keep it.

### Response-transform contract

Registered `ResponseTransform`s run in order on every full-pipeline response and every on-core cache/static response, before the host's static promotion, expires, sub_filter, compression, redirect-cache guard and Alt-Svc transforms — so an extension sees the origin representation before compression and cannot bypass the final transport-header policy by ordering. There is no error return: keep work bounded and express fallible initialization at registration.

        !   In-process means full authority
Extension code runs with httpjet's memory and filesystem authority. A panic, deadlock, unbounded allocation or blocking call affects the server. Only trusted, reviewed crates belong in the registry.

## WAF sidecar

httpjet embeds no rules engine and the ignored LiteSpeed `lsrecaptcha`/`censorshipControl` elements stay inactive. Instead, `--waf-sidecar-addr` turns on a bounded inspection call to a local HTTP service over a Unix socket (`unix:/path`, peer UID verified via `SO_PEERCRED` against `--waf-sidecar-uid`) or loopback TCP (`ip:port`) — the integration point for an existing maintained engine such as a Coraza/OWASP CRS adapter. httpjet does not claim CRS compatibility; the adapter owns the translation from the stable inspection document to its engine's model.

           **serve** · sidecar flags
```
--waf-sidecar-addr unix:/run/waf/inspect.sock   # or loopback 127.0.0.1:19090; absent = seam inert
--waf-sidecar-uid 0                   # uid a unix: sidecar must run as (default: root or serving uid)
--waf-sidecar-path /inspect           # absolute, no control characters
--waf-timeout-ms 100                  # total deadline: admission + allowance + connect + write + parse (≤ 30 s)
--waf-body-max 65536                  # bodies at or below this are sent as body_hex (≤ 1 MiB)
--waf-concurrency 128                 # ≤ 4096
--waf-fail-open                       # weaker policy: continue on sidecar failure (every bypass is logged; 403 still blocks)
```

> [Diagram: waf-sidecar] One inspection per request. Inspection runs after URI decoding/normalization and body-limit enforcement but before rewrite, cache lookup and any backend — background cache refreshes go through the same dispatch and are inspected too. Only two replies are valid; everything else is a sidecar failure.

- **Document.** `version: 1`, method, normalized path, query, resolved vhost, resolved client IP, protocol, effective TLS state, all request headers. Header values and the body are lowercase hexadecimal so raw bytes are lossless and cannot inject log or protocol controls; adapters must reject unsupported versions.

- **Bodies.** ≤ `--waf-body-max` → `body_hex`, restored byte-identically for downstream processing; larger → `body_omitted: true` and the sidecar must decide that shape explicitly. The global request limit stays authoritative.

- **Memory.** Beyond the concurrency cap, all generations share a 64 MiB serialization budget; each inspection reserves a byte-weighted allowance before creating hex/JSON copies, so stalled inspections cannot multiply temporary heap up to the concurrency limit. Waiting for the allowance is inside the deadline and follows the fail policy.

- **Transport.** One close-delimited HTTP/1.1 POST per inspection, never reused (no response-boundary ambiguity); response head ≤ 4 KiB; duplicate/nonzero Content-Length, Transfer-Encoding, malformed status, EOF and any status other than 204/403 are failures.

           **tests**
```
cargo test -p httpjet --bin httpjet pipeline::e2e::waf_runs_before_static_cache_and_can_block_a_previously_allowed_path
cargo test -p httpjet --bin httpjet pipeline::e2e::waf_sidecar_failure_policy_is_closed_unless_explicitly_opened
cargo test -p hj-extension
```

## Why there is no dynamic or sandboxed plugin ABI

httpjet does not `dlopen` third-party trait objects: Rust promises no stable trait-object ABI across independently built shared libraries, and a native module would share allocator, signal, thread and process authority with the server. There is no current requirement to execute untrusted third-party code, so a WASM runtime and its dependency and attack surface are not included. Untrusted or independently deployed inspection belongs behind the bounded sidecar contract above. If an untrusted-plugin workload appears, it must first define capabilities, memory and fuel limits, deadline and cancellation behavior, body access, state and network permissions, version negotiation, and fail-open/closed semantics — only then would an isolation mechanism be selected.
