# Protocol stacks — httpjet Documentation

> How HTTP versions and listeners work.

- **Canonical URL:** https://httpjet.net/docs/protocols
- **Source Repository:** https://github.com/faratech/httpjet

---

# Protocol stacks

You get HTTP/1.1, native HTTP/2, and HTTP/3 over QUIC here. One unconditional io_uring / monoio transport serves all three.

        resolve    acl    rewrite    cache    dispatch    finalize    store

## Overview

All serving lives in the binary's `uring/` module. You select the protocol at the connection boundary.

| Signal | Stack. Limit: |

| TLS ALPN `h2` | Native `hj-h2`. Limit: TLS only. |

| TLS ALPN other / none | Custom monoio + `httparse` HTTP/1.1. Limit: http/1.1 or none. |

| Cleartext 24-byte h2 preface | Native `hj-h2` h2c. Limit: prior knowledge, no upgrade. |

| Cleartext other bytes | HTTP/1.1. Limit: sniff is non-destructive. |

| UDP on the HTTPS port | HTTP/3, `quinn-proto` on io_uring. Limit: see HTTP/3 . |

> [Diagram: connection-lifecycle] A TCP connection's life. PROXY stripping (if opted in) precedes TLS or the cleartext sniff. ALPN picks the TLS stack; the 24-byte preface picks the cleartext one. H2 drains with GOAWAY on shutdown.

## HTTP/1.1 & h2c detection

You get strict RFC 9112 framing here. Cleartext h2c needs no upgrade handshake.

| Rule | Behaviour. Limit: |

| Framing | Single `Content-Length` only. Limit: conflicting lengths rejected. |

| Reads and bodies | Bounded incomplete reads; chunked bodies decoded. Limit: deadlines extend only on progress, to an absolute ceiling. |

| Keep-alive | Keep-alive and pipelining supported. Limit: `maxKeepAliveReq` 0 or 1 disables keep-alive, matching OpenLiteSpeed. |

| Request target | Origin-form, plus `*` for OPTIONS. Limit: http/https absolute-form reduces to origin-form; its authority replaces `Host`. |

| `CONNECT` / authority-form / raw `#` | `CONNECT` answers 405. Limit: authority-form and raw `#` answer 400. |

| `Host` | HTTP/1.1 requires `Host`; HTTP/1.0 may omit it. Limit: must be UTF-8 and pass the h2/h3 `:authority` validation. |

| Line endings | Bare LF ends no header line. Limit: rejected 400 before the head materializes. |

| Refusals | Lingering close drains unread request bytes. Limit: the peer reads the error status cleanly. |

| Egress | Large responses stream from the bridge. Limit: minimum send-progress rate applies; see below. |

These rules date from the 2026-10-06 review. You detect h2c non-destructively: observed bytes pass to the winning stack.

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

- **103 Early Hints.** You emit interim `103` from the shared preload/preconnect `Link` matcher. Limit: batched with the final head when ready; `101` upgrades bypass it; canonical/alternate links excluded.

- **Ranges.** You parse, clamp, and coalesce RFC 9110 multi-range sets. Limit: `multipart/byteranges`, capped at 8 ranges / 8 MiB part bytes, full-200 fallback; invalid component poisons the header (200); unsatisfiable set is 416.

- **Request decompression.** You decode gzip by default. Limit: brotli/zstd need `--request-decompression-extra`; bounded and buffered; see Compression .

- **Bandwidth pacing.** You pace `Body::Full` as 64 KiB slices and streams per chunk. Limit: per-connection token bucket, burst 2× rate, when `bandwidthLimit` is set; a matched context overrides the server-wide rate.

- **Send progress.** You end a response under 16 KiB delivered per `connTimeout` window. Limit: applies to every response write, sendfile included.

## Native HTTP/2

`hj-h2` serves ALPN `h2` and cleartext h2c here. You optimize one connection's multiplexing for few, long-lived CDN connections.

- TLS conn ALPN h2 / h2c ONE connection task FuturesUnordered⟨stream⟩ stream 1 · handler stream 2 · handler … stream N HPACK enc / dec send flow control · deadlines one vectored writev / wake wire zero-copy Bytes bridge dispatch → shared pipeline → monoio writes One connection task multiplexes every stream. It emits a single vectored write per wake. **One task per connection.** Streams multiplex through `FuturesUnordered`. Limit: 100 streams cost one task.

- **Flow control.** Per-stream and connection windows apply. Limit: frame, header-block, and body deadlines run on the monoio loop.

- **Stalled streams.** Under 16 KiB per `connTimeout` window earns `RST_STREAM(CANCEL)`. Limit: withheld flow-control credit only.

- **Streaming bodies.** LSAPI, proxy, SSE, and file bodies stream unbuffered. Limit: spans stay open through final flush.

- **Writes.** One vectored write per wake; large bodies stay zero-copy `Bytes`. Limit: vendored `monoio-rustls` adds `writev`, one flush write, per-core pooled buffers.

- **Validation.** RFC 9113 inbound, GOAWAY drain. Limit: stray `CONTINUATION` and stream-id reuse are connection errors.

- **Oversize heads.** Over-cap block gets bodiless 431; over-cap body gets 413. Limit: then `RST_STREAM(NO_ERROR)`; suppressed decode keeps HPACK in sync.

- **Refusals.** Budget-refused streams get `RST_STREAM(REFUSED_STREAM)`. Limit: rapid-reset budget 200, refilled 10/s; past it, GOAWAY(ENHANCE_YOUR_CALM).

- **Abuse bounds.** HTTP/2 Bomb (CVE-2026-49975) and no-progress stay bounded. Limit: see rapid-reset budget.

- **Pacing.** Per-connection at OutQueue flush. Limit: server-wide rate only; H3 unpaced.

        ⎁   Measured
You pass **146 of 146** h2spec 2.6.0 cases over TLS. Limit: three consecutive runs is the gate; h2c records 145/146, with generic §3.5/2 structurally unsatisfiable on the sniffing port.
 scripts/h2spec_check.sh · scripts/ci-h2spec.py
        i   HPACK
RFC 7541 HPACK lives in the `hpack` submodule of `hj-h2`, zero-allocation and pure safe Rust (`#![forbid(unsafe_op_in_unsafe_fn)]`). Huffman codes to 11 bits resolve from a 4 KiB root table. Three 32-entry sub-tables cover 12–16-bit codes (0.1.7; replaced 256 KiB flat; cold decode 16.6 → 4.6 µs). The encoder remembers eight long literals (257+ bytes) per thread (0.1.10; 4.73 → 1.34 µs per block). Decoder and round-trip are fuzz targets . See the HPACK stub .

## HPACK

HPACK now lives inside Native HTTP/2 as a three-line summary. You keep this stub so existing links keep working.

## HTTP/3 & QUIC

`uring/h3.rs` runs `quinn-proto` state over io_uring UDP here. You bridge requests into the same pipeline.

- **Intake and parsing.** You use `quinn-udp` metadata (GSO/GRO, live GSO cap) and parse streams incrementally. Limit: QUIC DATAGRAM disabled; QPACK head bytes charge `total_req_bytes` and the body budget.

- **Bodies and stalls.** Small, cached, and sub-threshold bodies go whole; large, SSE, and proxy bodies stream HEADERS-first. Limit: backpressured DATA; send-stalled streams reset; retained memory bounded per connection (2026-09-06).

- **Budget.** Charge at `Connected`, after validation. Limit: spoofed Initials cannot hold budget; full budget closes `H3_EXCESSIVE_LOAD`.

- **Handshake slots.** One of 256 per-core slots per unvalidated connection. Limit: above 64 per core, stateless **Retry**; token-bearing Initials pass; handshakes close after 10 s.

- **Discovery and trust.** Advertise via **Alt-Svc** (last TLS transform); pin trust/mTLS at acceptance. Limit: migration disabled; reloads affect future handshakes only.

> [Diagram: h3-admission] HTTP/3 UDP intake. Unvalidated Initials pass per-core slot caps (256 max, Retry above 64) before charging maxConnections at Connected. QPACK heads charge total_req_bytes and BodyBufferBudget.

        !   Publish UDP too
You must publish the same numeric HTTPS port over TCP and UDP. Publishing `8443/tcp` alone gives you no HTTP/3.

## Connection front doors

Two per-listener features sit before protocol detection. Both are httpjet-native, with no LiteSpeed listener equivalent.

### PROXY protocol v2 / v1

Set ` 1 ` and you require a PROXY header on every connection. You install the claimed address before TLS or the H1/h2c sniff.

- Missing header closes the connection. Limit: fail-closed both ways.

- Loopback or unspecified sources are refused at the parser (2026-09-16). Limit: they would otherwise forge mTLS exemption and the loopback purge gate.

        !   The listener opt-in is the trust decision
Never enable this on an internet-facing bind. Anyone can forge their client address there; `check` warns on wildcard or public binds.

### HTTP over Unix sockets

Use `unix:/path/sock` (or `uds:`), or `--http-uds`, for plain HTTP over a Unix socket. You serve H1 and h2c prior knowledge on one accept core.

- Socket mode is 0660, owner and group read/write. Limit: SO_REUSEPORT does not exist for AF_UNIX; socket-activated fds are adopted by path.

- A stale file is unlinked only after `connect(2)` proves it dead. Limit: cleanup binds to the owned directory and socket identity.

- Peers have no address. Limit: ACLs, the per-IP throttle, and `REMOTE_ADDR` see fabricated loopback; the log renders `unix:`.

- TLS over UDS is unsupported. Limit: `check` lints it.

## File egress: sendfile & kTLS

An uncached `Body::File` keeps its pinned inode and byte range across the bridge. You send it with bounded nonblocking `sendfile(2)` on plain TCP HTTP/1.

- Unsupported pairs resume at the exact offset via positional io_uring reads. Limit: short files or aborts close, never a wrong `Content-Length`.

- Stalled sendfile backs off 100 µs → 12.8 ms. Limit: 16 KiB per `connTimeout` progress rule still applies.

- `--features ktls` extends this to TLS 1.3 H1 after the rustls handshake. Limit: queued peer KeyUpdate applies before next writes, fencing TX rekey.

- Policy `--ktls=auto|on|off`; `auto` (default in feature builds) checks the IPv4 default-route NIC via ethtool. Limit: enables only with active `tls-hw-tx-offload` on a non-virtual NIC; else logs one reason, stays rustls.

- TLS 1.2, H2, H3, and UDS keep userspace paths.

        ⎁   Measured
Plaintext sendfile: 5,000 × 1 MiB at c=50 → **4,852 req/s**, 10.08 ms mean, zero failures. Software kTLS on a virtual GVE NIC: **2,999.7 req/s off vs 2,944.9 on**.
 loopback · 2026-09-09 · `bench-results/httpjet-sendfile-*.csv`, `httpjet-ktls-sendfile-*.csv`

## TLS in one paragraph

`hj-tls` builds one `rustls::ServerConfig` for TCP and QUIC, on aws-lc-rs. You map SNI directly to configured chains (no cert-name-match, like OLS), with dual ECDSA+RSA chains per name.

Client verification uses the listener CA only, with CRL enforcement. Read TLS, ACME & OCSP for resumption (`--tls-session-tickets`, default 2; 0-RTT off) and reload.
