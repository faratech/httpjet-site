# Compression — httpjet Documentation

> How responses shrink for faster delivery.

- **Canonical URL:** https://httpjet.net/docs/compression
- **Source Repository:** https://github.com/faratech/httpjet

---

# Compression

`hj-compress` encodes responses with gzip, brotli and zstd. Response compression enables gzip, brotli and zstd by default. The server chooses among enabled codecs the client accepts. For request decompression , gzip is enabled by default and brotli and zstd require opt-in.

        resolve    acl    rewrite    cache    dispatch    finalize    store

## Codecs and negotiation

| Codec | Backend | Default level | XML switches |

| zstd | `zstd` | 3 (1–22) | `enableZstdCompress`, `enableDynZstdCompress`, `zstdCompressLevel` |

| brotli | `brotli` | 5 (0–11). Without `brCompressLevel`, `enableBrCompress` level 1–6 sets it, 0 disables. | `enableBrCompress`, `enableDynBrCompress`, `brCompressLevel` |

| gzip | `flate2` | 6 (1–9) | `enableGzipCompress`, `enableDynGzipCompress`, `gzipCompressLevel` |

> [Diagram: compression-negotiation] Choosing an encoder. The dynamic response transform checks content type, cache directives, range and encoding headers. Known-size bodies need at least 201 bytes. Stream compression has separate per-codec gates.

**What gets compressed** — check each item:

- Known-size bodies need at least 201 bytes. Streamed bodies are checked against the selected codec’s streaming switch.

- Types in LiteSpeed's `compressibleTypes`. Other types pass through.

- Unencoded responses with no range and no `Cache-Control: no-transform`. The transform also skips 204, 206 and 304 responses.

- Buffered bodies can encode in one shot or in cooperative slices when configured. Eligible streams encode incrementally.

- Every encoded response. It carries `Vary: Accept-Encoding`.

zstd uses a per-thread `ZSTD_CCTX` pool and pooled buffers (`hj_core::recycle::BODY_BUFS`). Streamed bodies (`Body::Stream`) wrap in a lazy `CompressStream`, while SSE bypasses compression.

## Trusted-proxy zstd egress

`--cf-send-zstd` (or `CF_SEND_ZSTD=1`) forces zstd to a *trusted-proxy* peer, ignoring forwarded `Accept-Encoding`. Cloudflare re-encodes per browser at its edge, so browser bytes stay unchanged (cheapest-to-produce form; officially unsupported CDN↔origin). Off by default. Enable it only when every peer classified as a trusted proxy can accept zstd. It never applies to untrusted clients.

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

- Decoded output may not exceed `maxReqBodySize` (413). The absolute decoder ceiling is 16 MiB.

- At the 16 MiB ceiling, you forward the encoded body unchanged. You never expose a truncated body.

- Brotli large-window extensions stay disabled. Zstd frames cap at a 2 24 -byte window; `deflate` never decodes.

- Brotli/zstd reserve 17 MiB for decoder tables first. If workspace plus both body forms cannot reserve, you get 503.

**Limits.** Response-side decoding caps `windowLogMax` and bounds decoded size. A hostile or corrupt frame fails the decode instead of ballooning memory. Compare representative hits and misses before trading CPU for bytes. Production samples this phase as `httpjet_phase_compress_seconds`.

           **tests**
```
cargo test --locked -p httpjet uring::request_body --no-fail-fast     # all three codecs, bombs, malformed input, stacked encodings, workspace exhaustion
```

## Decode safety

See Request decompression → Limits . Response-side caps now live there.
