# Protocol stacks — httpjet Documentation

> HTTP/1.1, native HTTP/2 with zero-allocation HPACK, HTTP/3 over QUIC, sendfile and kTLS egress, PROXY protocol, and Unix-socket listeners on one io_uring transport.

- **Canonical URL:** https://httpjet.net/docs/protocols
- **Source Repository:** https://github.com/faratech/httpjet

---

# Protocol stacks

httpjet speaks **HTTP/1.1**, a **from-scratch native HTTP/2** stack, and **HTTP/3 over QUIC** through one unconditional **io_uring / monoio** transport. TCP and QUIC converge behind one rustls configuration, every protocol hands requests to the same pipeline, and file bodies leave over `sendfile(2)` where the kernel allows it.

        resolve    acl    rewrite    cache    dispatch    finalize    store

## Overview

All serving lives in the binary's `uring/` module. HTTP/1.1 is a custom monoio + `httparse` codec; HTTP/2 and cleartext h2c use the native `hj-h2` stack through its monoio serve path; HTTP/3 is `uring/h3.rs`, a `quinn-proto` QUIC loop over io_uring UDP with `quinn-udp` socket metadata (GSO/GRO). Protocol selection happens at the connection boundary: ALPN over TLS, a non-destructive preface sniff in cleartext, and QUIC on the UDP listener.

> [Diagram: connection-lifecycle] A TCP connection's life. PROXY-protocol stripping (if the listener opts in) happens before the TLS handshake or the cleartext sniff, so every later stage sees the proxied client as the peer. ALPN picks the TLS stack; the 24-byte h2 preface picks the cleartext one. H2 connections drain with GOAWAY on shutdown.

           HTTP/1.1 · custom monoio codec
           HTTP/2 · native `hj-h2`
           h2c · prior-knowledge sniff
           HTTP/3 · `quinn-proto` on io_uring
           HPACK · RFC 7541, zero-alloc
           TLS · rustls / aws-lc-rs · optional kTLS

## Connection front doors

Two per-listener features sit before protocol detection. Both are httpjet-native — LiteSpeed has no listener-level equivalent — and both change *who httpjet thinks the client is*.

### PROXY protocol v2 / v1

A listener with ` 1 ` requires every connection to open with a PROXY header. The header is consumed and the claimed client address installed before the TLS handshake on secure listeners and before the H1/h2c discriminator on plain ones. Missing header → the connection is closed (fail-closed both ways). Since 2026-09-16 a header that claims a loopback or unspecified source is **refused at the parser**: those addresses feed the mTLS exemption and the loopback purge gate, so accepting them would let a proxy hop forge local trust.

        !   The listener opt-in is the trust decision
Unlike OpenLiteSpeed's server-level trusted-peer ACL, httpjet binds PROXY trust to the listener (nginx/HAProxy semantics). Enabling it on an internet-facing bind lets anyone forge their client address; `check` warns on wildcard or public binds. Point such a listener only at your load balancer or a local hop.

### HTTP over Unix sockets

A listener whose address is `unix:/path/sock` (or `uds:`), or the `--http-uds` flag, serves plain HTTP over a Unix-domain socket: H1 and h2c prior knowledge, one accept core (SO_REUSEPORT does not exist for AF_UNIX), socket mode 0600 group-writable, socket-activated fds adopted by path. A stale socket file is unlinked only after a `connect(2)` proves it dead, and cleanup is bound to the owned directory and socket identity. Peers have no address: ACLs, the per-IP throttle and `REMOTE_ADDR` see a fabricated loopback value and the access log renders `unix:`. TLS over UDS is unsupported and linted.

## HTTP/1.1 & h2c detection

The H1 codec parses with `httparse`, enforces strict framing (single `Content-Length`, conflicting-length rejection, bounded incomplete reads), supports keep-alive and pipelining, honors `maxKeepAliveReq` (0 or 1 disables keep-alive, matching OpenLiteSpeed), decodes chunked bodies, and streams large responses from the bridge without buffering. Request-body deadlines extend on forward progress up to an absolute ceiling, while response egress enforces a minimum send-progress rate. Since the 2026-10-06 review it also enforces the RFC 9112 request-target and Host rules at intake: only origin-form targets (plus `*` for OPTIONS) and http/https absolute-form (reduced to origin-form, its authority replacing `Host`); `CONNECT` answers **405**, authority-form and a raw `#` answer 400. HTTP/1.1 **requires `Host`**, and any Host must be UTF-8 and pass the same authority validation the h2/h3 `:authority` rule uses (HTTP/1.0 may omit it). A header line terminated by a bare LF is rejected 400 before the head is materialized, and refusals that leave request bytes unread perform a lingering close so the peer reads the error status cleanly.

Cleartext HTTP/2 by prior knowledge has no upgrade handshake — the client simply sends the connection preface. httpjet detects it *non-destructively*: the bytes already read are handed to whichever stack wins, so h1 and h2 both parse the connection as if no router sat in front.

            **uring** · ALPN + cleartext routing

```
// over TLS: ALPN decides the TCP stack
match alpn {
    b"h2"       => hj_h2::server::serve_local_with_prefix(io, prefix, service, cfg).await,
    _           => handle_h1_bridged(io, prefix, service).await,   // http/1.1 or none
}

// cleartext: sniff the 24-byte preface, pass the observed bytes along
match sniff_cleartext(&mut stream).await? {
    Proto::Http2(prefix) => hj_h2::server::serve_local_with_prefix(stream, prefix, service, cfg).await,
    Proto::Http1(prefix) => handle_h1_bridged(stream, prefix, service).await,
}
```

Beyond framing, the H1 path implements the newer semantics end to end:

- **103 Early Hints** — the same preload/preconnect `Link` matcher the h2 stack uses emits an interim `103` on h1 (batched into the same write as the final head when both are ready); `101` upgrades bypass it; canonical/alternate links are excluded.

- **Ranges, single and multipart** — RFC 9110 multi-range sets are parsed, clamped, coalesced and framed as `multipart/byteranges`, capped at 8 ranges / 8 MiB of part bytes with a full-200 fallback. An invalid component poisons the whole header (→ 200); an unsatisfiable set is 416.

- **Request decompression** — gzip bodies decode by default; brotli/zstd opt in with `--request-decompression-extra`. Bounded and buffered; see Compression .

- **Bandwidth pacing** — a per-connection token bucket (burst 2× rate) paces `Body::Full` as 64 KiB slices and streams per chunk when `bandwidthLimit` is set; a matched context overrides the server-wide rate.

- **Explicit `CONNECT` rejection** (405) and stalled-sendfile backoff with a 60 s zero-progress bound.

## Native HTTP/2

`hj-h2` is httpjet's own HTTP/2 server. Every h2 connection — ALPN `h2` over TLS and cleartext h2c — lands here through the monoio local serve path. The design targets the CDN→origin shape: few long-lived connections, many concurrent streams, so it optimizes one connection's multiplexing rather than spreading work across many.

- TLS conn ALPN h2 / h2c ONE connection task FuturesUnordered⟨stream⟩ stream 1 · handler stream 2 · handler … stream N HPACK enc / dec send flow control · deadlines one vectored writev / wake wire zero-copy Bytes bridge dispatch → shared pipeline → monoio writes One connection task multiplexes every stream and emits a single vectored write per wake. Handlers cross the bridge into the shared pipeline; framing stays on the monoio core. **One task per connection.** All streams multiplex through `FuturesUnordered`; a 100-stream connection costs one task.

- **Send-side flow control** honors per-stream and connection windows; **frame, header-block and body deadlines** are enforced on the monoio loop, and a stalled response stream waiting on withheld flow-control credit that delivers under 16 KiB per `connTimeout` window is reset with `RST_STREAM(CANCEL)`.

- **Streaming bodies** — LSAPI, proxy, SSE and async file bodies stream without buffering; the response-completion hook keeps spans open through the final flush.

- **One vectored write per wake**; large bodies are zero-copy from page-cache `Bytes`. The vendored `monoio-rustls` fork adds a real `writev`, flushes all queued TLS records in one socket write, and pools per-record buffers per core so records do not page-fault.

- **Inbound RFC 9113 validation** with graceful GOAWAY drain; `CONTINUATION` without an open header block and stream-id reuse are connection errors; over-cap decoded header blocks become a **stream error** (`RST_STREAM(REFUSED_STREAM)`, decoding the block with emission suppressed so the HPACK dynamic table stays in sync on pooled CDN connections); the time-refilled rapid-reset budget (`httpjet_h2_rapid_reset_drops_total`), HTTP/2 Bomb pattern (CVE-2026-49975) and no-forward-progress cases are bounded.

- **Egress pacing** is per connection at the OutQueue flush with the server-wide rate (a per-response override is ill-defined under multiplexing). HTTP/3 is not paced.

        ⎁   Measured
The native stack passes **146 of 146** h2spec 2.6.0 cases over TLS (three consecutive runs is the gate). h2c is informative-only: generic §3.5/2 is structurally unsatisfiable on a port that also sniffs HTTP/1.1, so it records 145/146 with that one documented exception.
 scripts/h2spec_check.sh · scripts/ci-h2spec.py

## HPACK

Header compression is RFC 7541 HPACK, implemented as the `hpack` submodule of `hj-h2` (once a standalone crate, folded in so the codec and the connection state evolve together). It is **zero-allocation** — fields are decoded and encoded by slicing frame bytes in place — and pure safe Rust with `#![forbid(unsafe_op_in_unsafe_fn)]`. Both the decoder and the round-trip are fuzz targets ( Conformance ).

## HTTP/3 & QUIC

HTTP/3 is `uring/h3.rs`: `quinn-proto` for QUIC state, `quinn-udp` for socket metadata (with a live GSO segment cap and QUIC DATAGRAM disabled), UDP driven from monoio/io_uring, incremental request-stream parsing, QPACK encode/decode (charging decoded head bytes to both `total_req_bytes` and the global body budget), and the same bridge into the pipeline. Small, cached and sub-threshold bodies are buffered and sent whole; large, SSE and proxy bodies stream — HEADERS goes out immediately and DATA follows as the backend produces it, with backpressured writeback and send-stall stream resets (`httpjet_h3_send_stall_resets_total`). Retained response memory is bounded per connection (2026-09-06). The process-wide connection budget (shared with TCP accepts) is charged at `Connected` — after address validation — so spoofed Initials cannot hold budget for the idle timeout; until then a connection costs only one of 256 per-core handshake slots, and once 64 connections on a core are handshaking an unvalidated Initial receives a stateless **Retry** (token-bearing Initials are still accepted). A full budget closes with `H3_EXCESSIVE_LOAD`; handshakes are closed after 10 s.

Discovery is via **Alt-Svc** on TLS responses (the last response transform), so an h2 client learns it can upgrade to QUIC. Connection migration is disabled because listener steering does not yet preserve ownership across an address change. Each connection pins its trust generation and mTLS requirement at acceptance; a trust reload replaces quinn's server configuration only for future handshakes while the bound UDP workers and established connection IDs survive.

> [Diagram: h3-admission] HTTP/3 UDP intake, anti-amplification and stream admission. Unvalidated Initial packets pass through per-core handshake slot caps (256 max, stateless Retry above 64 concurrent handshakes) before charging the process-wide maxConnections budget at Connected. Decoded QPACK headers charge both total_req_bytes and BodyBufferBudget.

        !   Publish UDP too
The same numeric HTTPS port must be reachable over TCP (h1/h2) *and* UDP (h3). Publishing `8443/tcp` alone means no HTTP/3, and the Alt-Svc header will advertise a port clients cannot reach.

## File egress: sendfile & kTLS

An uncached `Body::File` keeps its pinned inode and byte range across the tokio→monoio bridge. On **plain TCP HTTP/1** it is sent with bounded nonblocking `sendfile(2)`; unsupported descriptor/filesystem combinations resume at the exact offset with positional io_uring reads, and short files or client aborts close the connection rather than completing an incorrect `Content-Length`. A stalled sendfile backs off exponentially and gives up after 60 s of zero progress.

A `--features ktls` build extends this to **TLS 1.3 H1**: after the rustls handshake the socket is upgraded to kernel TLS, so the same sendfile writer feeds ciphertext without a userspace AEAD copy. A peer KeyUpdate queued during a transfer is applied before the next response writes, fencing TX rekey from sendfile. Policy is `--ktls=auto|on|off`: `auto` (default in feature builds) resolves the IPv4 default-route interface, reads its driver and features via ethtool ioctls, refuses known virtual NICs, and enables kTLS only when `tls-hw-tx-offload` is active — otherwise it logs one reason and stays on rustls. TLS 1.2, H2, H3 and UDS keep their userspace paths.

        ⎁   Measured
Plaintext sendfile: 5,000 × 1 MiB at c=50 → **4,852 req/s**, 10.08 ms mean, zero failures. Software kTLS on a virtual GVE NIC (offload `off [fixed]`): **2,999.7 req/s off vs 2,944.9 on** — the expected-negative result that is why `auto` refuses virtual NICs.
 loopback · 2026-09-09 · `bench-results/httpjet-sendfile-*.csv`, `httpjet-ktls-sendfile-*.csv`

## TLS in one paragraph

`hj-tls` builds **one** `rustls::ServerConfig` for TCP and QUIC with aws-lc-rs as the crypto provider. SNI maps directly to configured chains (no cert-name-match, like OLS), with dual ECDSA+RSA chains per name; client verification is optional mTLS against the *listener* CA with CRL enforcement; TLS 1.3 offers exactly `TLS_AES_128_GCM_SHA256`; resumption uses single-use tickets with 0-RTT off. Certificates, ACME and OCSP have their own page: TLS, ACME & OCSP .
