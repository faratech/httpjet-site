# Compression — httpjet Documentation

> Response compression with gzip, brotli and zstd, server-priority negotiation, streaming encoders, precompressed siblings, and bounded request decompression.

- **Canonical URL:** https://httpjet.net/docs/compression
- **Source Repository:** https://github.com/faratech/httpjet

---

# Compression

`hj-compress` encodes responses with **gzip**, **brotli** and **zstd**, chosen by server priority but always bounded by the client's `Accept-Encoding`. Buffered bodies encode in one shot; streamed bodies stay streaming; precompressed static siblings skip the work entirely; and a trusted proxy can be handed forced zstd. The reverse direction — **request** decompression — is bounded and mostly opt-in.

        resolve    acl    rewrite    cache    dispatch    finalize    store

## Codecs and negotiation

| Codec | Backend | Default level | XML switches |

| zstd | `zstd` | 3 (1–22) | `enableZstdCompress`, `enableDynZstdCompress`, `zstdCompressLevel` |

| brotli | `brotli` | 5 (0–11; without `brCompressLevel`, a LiteSpeed `enableBrCompress` level 1–6 sets it, 0 disables) | `enableBrCompress`, `enableDynBrCompress`, `brCompressLevel` |

| gzip | `flate2` | 6 (1–9) | `enableGzipCompress`, `enableDynGzipCompress`, `gzipCompressLevel` |

> [Diagram: compression-negotiation] Choosing an encoder. Bodies of 200 bytes or fewer are never compressed (OpenLiteSpeed parity), the compressible-type set matches LiteSpeed's compressibleTypes, already-encoded and 206 responses are skipped, and every encoded response carries Vary: Accept-Encoding.

zstd encoding uses a per-thread `ZSTD_CCTX` pool and pooled transient output buffers (`hj_core::recycle::BODY_BUFS`) so neither contexts nor output buffers page-fault per response. Streamed bodies (`Body::Stream` — LSAPI, proxy, SSE) wrap in a lazy per-chunk `CompressStream`: each inbound chunk is encoded as it arrives, so SSE stays real-time and a slow backend never holds the first byte hostage.

## Trusted-proxy zstd egress

`--cf-send-zstd` (or `CF_SEND_ZSTD=1`) forces zstd to a *trusted-proxy* peer regardless of the forwarded `Accept-Encoding`. Cloudflare asks the origin for br/gzip but decodes an origin `Content-Encoding: zstd` and re-encodes per browser at its edge, so this hands the CDN the cheapest-to-produce form (zstd ≪ brotli to compress) without changing what browsers receive. Off by default, officially unsupported CDN↔origin, enabled in production; it never applies to untrusted or direct clients.

## Precompressed siblings

If a `.br` or `.gz` sibling of a static file exists in the same directory, httpjet serves it directly with the matching `Content-Encoding` and `Vary: Accept-Encoding` — `gzip_static`/`brotli_static` behavior, brotli preferred. Ranged requests skip the swap so byte ranges stay exact; same-directory placement keeps `accessDenyDir` and symlink verdicts unchanged; a missing sibling falls back to on-the-fly compression at the cost of one stat.

## Interaction with the page cache

The page cache keeps identity bytes plus one best precompressed variant chosen under the same priority; a client whose acceptable set differs is re-encoded per serve. Internal dictionary compression is a storage optimization only — dictionaries never reach the wire, and a hit decodes to identity before standard client compression is selected.

## Request decompression

httpjet decodes a single supported `Content-Encoding` after the transport has fully framed the request body and before rewrite, cache, WAF, proxy or application dispatch — the same decoder for HTTP/1.1, HTTP/2, h2c and HTTP/3. Gzip is on by default for compatibility; brotli and zstd are opt-in:

           **serve** · opt-in codings
```
httpjet --root /abs/root serve … --request-decompression-extra br,zstd     # accepts br, brotli, zstd; "gzip" is rejected as redundant
```

> [Diagram: request-decompression] Bounded, buffered, fail-safe. Only exactly one coding is decoded; malformed streams and the 16 MiB ceiling forward the original representation unchanged (the destination applies its own policy); the codec workspace and both body forms are charged to the shared budget first.

- A successful decode removes `Content-Encoding` and replaces `Content-Length` with the decoded length before any handler sees the request.

- Decoded output may not exceed the effective `maxReqBodySize` (413). The absolute decoder ceiling is 16 MiB — at it, httpjet forwards the encoded body rather than exposing a truncated one.

- Brotli large-window extensions are disabled; zstd frames are limited to a 2 24 -byte window; `deflate` is not decoded.

- Brotli/zstd reserve 17 MiB for decoder tables before constructing the codec; if that plus both body forms cannot be reserved, the request gets 503.

           **tests**
```
cargo test --locked -p httpjet uring::request_body --no-fail-fast     # all three codecs, bombs, malformed input, stacked encodings, workspace exhaustion
```

## Decode safety

Response-side decoding (page-cache variants, dictionary frames) caps `windowLogMax` and bounds decoded output size; a hostile or corrupt frame fails the decode rather than ballooning memory. Compression cost depends on body size, codec, cache state and backend latency — compare representative hits and misses before trading CPU for bytes. In production the origin's compression phase is sampled as `httpjet_phase_compress_seconds`.
