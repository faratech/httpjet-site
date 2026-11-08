# Extending httpjet — httpjet Documentation

> Add trusted code and sidecar checks.

- **Canonical URL:** https://httpjet.net/docs/extensions
- **Source Repository:** https://github.com/faratech/httpjet

---

# Extending httpjet

Extend httpjet two ways: linked Rust crates, or a WAF sidecar. No dynamic plugin ABI exists. No in-process sandbox exists. This page states that once.

Rust offers no stable trait-object ABI across shared libraries. Native modules would share allocator, signals, threads anyway. No workload needs untrusted in-process code. No WASM runtime ships. Route untrusted inspection via the sidecar. Future untrusted designs must define capabilities, memory, fuel, deadlines, cancellation, body access, state, network access, versioning, fail semantics first.

| Need | Hooks | Sidecar |

| Custom headers/policy | Yes. Limit: rebuild + restart. | No. Limit: inspection only. |

| Blocking rules | Yes, in Rust. Limit: in-process. | Yes. Limit: external engine. |

| Independent deploy | No. Limit: linked build. | Yes. Limit: call per request. |

| Untrusted code | No. Limit: trusted only. | Outside process. Limit: bounded document. |

## Compile-time extensions

Assemble `hj-extension::ExtensionRegistry` at `crates/httpjet/src/extensions.rs`. Shipped binary registers nothing. Facility stays inert without your build. Contract: source-level, over frozen `hj-core` types. No stable native ABI.

           **extensions.rs** · registration
```
pub(crate) fn compiled_registry() -> hj_extension::ExtensionRegistry {
    let mut registry = hj_extension::ExtensionRegistry::new();
    registry.register_pre_handler("company.request-policy", company_policy::hook()).expect("unique");
    registry.register_response_transform("company.headers", company_headers::transform()).expect("unique");
    registry
}
```

Registration order = execution order. Names: unique, 1–64 bytes, lowercase ASCII, digits, `.`, `-`, `_`. Logged once at boot. Changes need rebuild + restart. SIGHUP carries registry forward. Settings belong to your crate. No XML reinterpretation. No runtime loader.

> [Diagram: extension-hooks] Where hooks run. Pre-handlers run after trust and access resolution but before everything that could serve a byte; response transforms run after dispatch (and after page-cache storage) but before httpjet's own transforms, so an extension changes egress, not the canonical cached object, and is re-applied on hits.

### Pre-handler contract

`PreHandler` gets immutable `ReqCtx` plus `RequestView`. View exposes method, URI, headers only. No body, no mutable parts. Return `Continue` (next hook, then dispatch), `Respond(response)` (skip dispatch; transforms/metrics/logging still run), or `Err(HandlerError)` (fail closed, log failure). Never sees reserved routes (ACME, cache endpoints) or earlier rejections.

**Any pre-handler disables the fast path.** Memo/cache/static fast path cannot run async hooks. Response-only extensions keep it.

### Response-transform contract

`ResponseTransform`s run in order, on full-pipeline and on-core responses. Run before host transforms: promotion, expires, sub_filter, compression, redirect guard, Alt-Svc. See origin form, pre-compression. Cannot bypass final header policy. No error return. Keep work bounded. Fail setup at registration.

        !   In-process means full authority
Extension code runs with httpjet's memory and filesystem authority. A panic, deadlock, unbounded allocation or blocking call affects the server. Only trusted, reviewed crates belong in the registry.

## WAF sidecar

httpjet embeds no rules engine. Ignored `lsrecaptcha`/`censorshipControl` stay inactive. Enable `--waf-sidecar-addr` for loopback inspection instead. Transport: Unix socket (`unix:/path`, peer UID via `SO_PEERCRED` vs `--waf-sidecar-uid`) or loopback TCP (`ip:port`). Fits Coraza/OWASP CRS adapters. httpjet claims no CRS compatibility. Adapter owns engine translation.

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

### Document

Sends `version: 1`, method, normalized path, query, vhost, client IP, protocol, TLS state, all headers. Headers and body use lowercase hex. Hex stays lossless, injection-safe. Adapters reject unsupported versions.

### Bodies

≤ `--waf-body-max`: `body_hex`, restored byte-identically. Larger: `body_omitted: true`, sidecar decides explicitly. Global request limit stays authoritative.

### Limits

Concurrency cap plus shared 64 MiB serialization budget. Each inspection reserves byte-weighted allowance before copying. Waiting counts inside deadline, follows fail policy. Stalled calls cannot multiply heap.

### Transport

One close-delimited HTTP/1.1 POST per inspection. Never reused. Response head ≤ 4 KiB. Only 204/403 valid. Failures: duplicate/nonzero Content-Length, Transfer-Encoding, malformed status, EOF, other statuses.

           **tests**
```
cargo test -p httpjet --bin httpjet pipeline::e2e::waf_runs_before_static_cache_and_can_block_a_previously_allowed_path
cargo test -p httpjet --bin httpjet pipeline::e2e::waf_sidecar_failure_policy_is_closed_unless_explicitly_opened
cargo test -p hj-extension
```

## Why there is no dynamic or sandboxed plugin ABI

See lede note. Choice stated once there. Untrusted inspection: WAF sidecar .
