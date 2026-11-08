# Compression — httpjet Documentation

> How responses shrink for faster delivery.

- **Canonical URL:** https://httpjet.net/docs/compression
- **Source Repository:** https://github.com/faratech/httpjet

---

# Compression

`hj-compress` encodes responses with gzip, brotli and zstd. You get **gzip on by default; br/zstd are opt-in**. Server priority picks the codec, bounded by the client's `Accept-Encoding`.

        resolve    acl    rewrite    cache    dispatch    finalize    store

## Codecs and negotiation

| Codec | Backend | Default level | XML switches |

| zstd | `zstd` | 3 (1–22) | `enableZstdCompress`, `enableDynZstdCompress`, `zstdCompressLevel` |

| brotli | `brotli` | 5 (0–11). Limit: without `brCompressLevel`, `enableBrCompress` level 1–6 sets it, 0 disables. | `enableBrCompress`, `enableDynBrCompress`, `brCompressLevel` |

| gzip | `flate2` | 6 (1–9) | `enableGzipCompress`, `enableDynGzipCompress`, `gzipCompressLevel` |

> [Diagram: compression-negotiation] Choosing an encoder. Bodies of 200 bytes or fewer are never compressed (OpenLiteSpeed parity), the compressible-type set matches LiteSpeed's compressibleTypes, already-encoded and 206 responses are skipped, and every encoded response carries Vary: Accept-Encoding.

**What gets compressed** — check each item:

- Bodies over 200 bytes. Limit: 200 bytes or fewer never compress.

- Types in LiteSpeed's `compressibleTypes`. Limit: other types pass through.

- Unencoded, non-206 responses. Limit: already-encoded and 206 responses skip.

- Buffered bodies in one shot. Limit: streamed bodies stay streaming.

- Every encoded response. Limit: it carries `Vary: Accept-Encoding`.

zstd uses a per-thread `ZSTD_CCTX` pool and pooled buffers (`hj_core::recycle::BODY_BUFS`). Streamed bodies (`Body::Stream`) wrap in a lazy `CompressStream`, so SSE stays real-time.

## Trusted-proxy zstd egress

`--cf-send-zstd` (or `CF_SEND_ZSTD=1`) forces zstd to a *trusted-proxy* peer, ignoring forwarded `Accept-Encoding`. Cloudflare re-encodes per browser at its edge, so browser bytes stay unchanged (cheapest-to-produce form; officially unsupported CDN↔origin). Off by default; enabled in production. It never applies to untrusted clients.

## Precompressed siblings

Serve an existing `.br`/`.gz` sibling directly (`gzip_static`/`brotli_static`, brotli preferred), with matching `Content-Encoding`/`Vary`. Ranged requests skip the swap. A missing sibling costs one stat, then on-the-fly compression.

## Interaction with the page cache

The page cache keeps identity bytes plus one best variant (server priority). Other clients get a per-serve re-encode. Dictionaries never reach the wire; hits decode to identity first.

## Request decompression

You decode one supported `Content-Encoding` after full body framing. Decoding runs before rewrite, cache, WAF, proxy and dispatch. One decoder serves HTTP/1.1, HTTP/2, h2c and HTTP/3. Gzip is on by default; brotli and zstd are opt-in:

           **serve** · opt-in codings
```
httpjet --root /abs/root serve … --request-decompression-extra br,zstd     # accepts br, brotli, zstd; "gzip" is rejected as redundant
```

> [Diagram: request-decompression] Bounded, buffered, fail-safe. Only exactly one coding is decoded; malformed streams and the 16 MiB ceiling forward the original representation unchanged (the destination applies its own policy); the codec workspace and both body forms are charged to the shared budget first.

- A successful decode removes `Content-Encoding`. It replaces `Content-Length` with the decoded length before any handler runs.

- Decoded output may not exceed `maxReqBodySize` (413). Limit: the absolute decoder ceiling is 16 MiB.

- At the 16 MiB ceiling, you forward the encoded body unchanged. Limit: you never expose a truncated body.

- Brotli large-window extensions stay disabled. Limit: zstd frames cap at a 2 24 -byte window; `deflate` never decodes.

- Brotli/zstd reserve 17 MiB for decoder tables first. Limit: if workspace plus both body forms cannot reserve, you get 503.

**Limits.** Response-side decoding caps `windowLogMax` and bounds decoded size. A hostile or corrupt frame fails the decode instead of ballooning memory. Compare representative hits and misses before trading CPU for bytes. Production samples this phase as `httpjet_phase_compress_seconds`.

           **tests**
```
cargo test --locked -p httpjet uring::request_body --no-fail-fast     # all three codecs, bombs, malformed input, stacked encodings, workspace exhaustion
```

## Decode safety

See Request decompression → Limits . Response-side caps now live there.
