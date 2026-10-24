# TLS, ACME & OCSP — httpjet Documentation

> Certificate selection, mutual TLS with CRLs, resumption policy, opt-in ACME HTTP-01 and DNS-01 issuance, and opt-in OCSP stapling.

- **Canonical URL:** https://httpjet.net/docs/certificates
- **Source Repository:** https://github.com/faratech/httpjet

---

# TLS, ACME & OCSP

How httpjet selects certificates, verifies clients, and resumes sessions — plus the two opt-in certificate services: **ACME** issuance and renewal (HTTP-01 and DNS-01, `--features acme`) and **OCSP stapling** (`--features ocsp`). Both are default-off at build *and* runtime, and both publish into the same generation-bound resolver slots that file-based certificates and SIGHUP use.

        resolve    acl    rewrite    cache    dispatch    finalize    store

## TLS configuration

`hj-tls` builds **one** `rustls::ServerConfig` for TCP *and* QUIC via `build_server_config_alpn(cfg, listener, alpn)`, on the aws-lc-rs provider. A certificate rotation, verifier change or CRL update therefore lands on both transports at once.

| Listener XML | Meaning |

| `secure`, `keyFile`, `certFile` | The listener's default identity (PEM). `certChain=1` appends `CACertFile` as the served chain. |

| per-vhost ` ` | The SNI identity for that vhost's domains — server *chain* material, never a client-verify root. Configure an ECDSA and an RSA pair for the same names to serve modern clients the smaller chain (ECDSA is chosen when the client offers ECDSA signature algorithms). |

| `clientVerify` 0–3, `CACertFile`, `verifyDepth` | Mutual TLS: 0 none · 1 optional · 2 required · 3 optional without CA check. The verifier is built from the **listener** CA only. Positive chain verdicts are memoized off the hot path. |

| `crlFile` httpjet | PEM CRL or bundle enforced by the webpki verifier. Absent = no revocation checking. Loaded at config build; rotating means a reload of the trust generation. |

| `enableStapling` | Parsed for compatibility; OCSP fetching needs the `ocsp` feature and `--ocsp-responder` (see below). `check` says so. |

### Handshake posture

- **SNI without cert-name-match** — the SNI name maps directly to configured material, mirroring OpenLiteSpeed; there is no re-validation that the leaf's SANs match the SNI. Managed ACME identities are exact-SNI overlays and do not replace the no-SNI listener fallback.

- **TLS 1.3 offers exactly `TLS_AES_128_GCM_SHA256`** (the RFC 8446 mandatory suite); TLS 1.2 keeps its full set. rustls negotiates by client order, and without this pin OpenSSL-family clients pick slower suites; the transcript moves to hardware SHA-NI.

- **Resumption & certified-peer idle window** — single-use TLS 1.3 tickets, 0-RTT off, including on client-cert-verifying listeners. Cloudflare does not re-offer origin tickets, so `httpjet_tls_handshakes_resumed_total` stays low behind it. Ticket volume is tunable with `--tls-session-tickets` (rustls default 2); production mints **0** — each ticket was two extra handshake records plus a cached copy of CF's client-cert chain for a resumption that never comes. Instead, `--trusted-proxy-idle-secs` extends the idle window for connections that presented a verified client certificate (reducing full handshakes per request by 28% on x86 and 78% on ARM in production). Resumption is *disabled* whenever OCSP is enabled (status must be enforced per handshake).

- **mTLS trust boundary** — on a listener with `clientVerify=2`, a plaintext request for an mTLS-protected vhost is refused from the request head unless it arrives from loopback; `--no-mtls` relaxes the requirement for local testing only.

- **Reload** — file-based certificates reload through `CertReloadHandle` on SIGHUP or via the write API ; a failed reload keeps the certificates whose reload failed. kTLS templates apply to new handshakes only.

        !   Two CAs, two roles
A per-vhost `CACertFile` is chain material sent *to* clients. The listener `CACertFile` is the root that verifies *client* certificates. Treating the vhost chain CA as a client-verify root would silently widen the mTLS trust boundary; httpjet keeps them distinct.

## ACME certificate automation --features acme

Build with `cargo build --locked -p httpjet --features acme`. The manager is *native CLI*, not pretend LiteSpeed XML: nothing happens unless all four required flags are present. One manager, account and identifier set is supported per process; its domain and TLS/HTTP vhost mappings are boot-frozen.

          HTTP-01  DNS-01 / wildcard  Local test CA

               **serve** · HTTP-01
```
httpjet --root /abs/root serve … \
  --acme-directory https://YOUR-CA/directory \
  --acme-domains example.test,www.example.test \
  --acme-store /abs/private/acme \      # pre-created, mode 0700, owned by the service uid
  --acme-accept-terms \
  --acme-bootstrap                      # only for first issuance without a configured certificate
```

Requires public TCP port 80 and an enabled TLS listener. The raw challenge route `/.well-known/acme-challenge/ ` runs before URI normalization, redirects, rewrites, auth, cache and backends; only plaintext GET on the validated authority answers (404 for unknown tokens, 405 otherwise, always `Cache-Control: no-store`); tokens are redacted in the access log. No exemption is granted for forwarded-scheme headers, and the historical path-prefix bypass (#259) stays closed.

               **serve** · DNS-01
```
httpjet --root /abs/root serve … \
  --acme-directory https://YOUR-CA/directory \
  --acme-domains 'example.test,*.example.test' \   # quote the wildcard
  --acme-store /abs/private/acme --acme-accept-terms \
  --acme-dns-webhook https://YOUR-CONTROLLER/acme \
  --acme-dns-zones example.test \
  --acme-dns-token-file /abs/private/dns-controller.token   # regular file, 0600, 16..4096 printable chars
```

No port 80 requirement and no HTTP challenge exemption. There is **no built-in Cloudflare or provider integration**: you run a controller that implements the webhook contract below with a credential scoped to the listed zones. A managed wildcard matches exactly one leftmost label — request the apex separately.

               **controller contract** · POST, Bearer token, application/json
```
{"version":1,"operation":"present","name":"_acme-challenge.example.test","value":" "}
{"version":1,"operation":"ready",  "name":"…","value":"…"}   → {"ok":true,"ready":true|false}
{"version":1,"operation":"cleanup","name":"…","value":"…"}   → {"ok":true}
```

Operations must be idempotent: `present` adds the exact value without replacing the RRset; `cleanup` removes only that value and succeeds if it is already absent (apex and wildcard share one owner name). Replies over 16 KiB, redirects, non-2xx and unexpected fields are rejected; each call has a 5 s deadline; a `ready:true` returned without real DNS visibility is not a valid production implementation.

`--acme-test-mode` permits literal-loopback HTTP directories and alternate HTTP ports and requires loopback serving addresses. `--acme-test-ca-root` and `--acme-test-issuer-root` replace trust roots without disabling verification; `--acme-dns-test-root` does the same for the DNS controller. These are for the Pebble fixture only:

               **acceptance** · Pebble v2.10.1
```
cargo test --locked -p hj-acme
cargo build --locked -p httpjet --features acme
python3 -B scripts/acme-pebble-test.py --binary target/debug/httpjet \
  --pebble /path/to/pebble --dns /path/to/pebble-challtestsrv \
  --pebble-source /path/to/pebble-v2.10.1 --bootstrap [--dns01]
```

### Issuance, recovery and activation

> [Diagram: acme-http01] HTTP-01 issuance. Every durable step precedes the network step that depends on it: the account key before registration, the certificate key and CSR before finalize, and the issued pair in the same atomic snapshot as account/order state. Only a fully validated pair is published to the TLS resolvers.

- **Durable before network.** A lost `newOrder` response is intrinsically ambiguous, so a marker stops automatic reissuance: recover the order URL from the CA's account records and restart once with `--acme-reconcile-order `. Never delete the store as a generic retry.

- **Bounded CA traffic.** Only GET/HEAD/POST at the directory's origin, no redirects, no environment proxies, 1 MiB bodies, 5 s connect / 10 s request, 120 s per attempt, persisted exponential backoff with account jitter plus `Retry-After`.

- **Private store.** An operator-provisioned 0700 directory owned by the effective uid; every ancestor is checked with pinned no-follow descriptors; an exclusive lock prevents two managers sharing a store; snapshots are 0600 single-link regular files written pending→fsync→rename→dirsync, capped at 1 MiB; an unfinished pending file is discarded on reopen, never promoted.

- **Activation.** The validated `CertifiedKey` is published to the TCP, kTLS and QUIC resolver overlays as an exact-SNI identity. File-based SIGHUP updates a separate slot and cannot erase or mix managed generations. Boot revalidates the persisted pair; an expired one is rejected and needs operator recovery.

- **Bootstrap.** With `--acme-bootstrap` the default TLS identity starts *absent*: handshakes for hosts without a configured certificate fail until issuance succeeds. No self-signed placeholder is generated; client-auth policy is unchanged.

- **Renewal** is scheduled with one third of the remaining lifetime in reserve plus jitter.

> [Diagram: acme-dns01] DNS-01 with durable cleanup. The exact owner/value cleanup intent is journaled before any DNS mutation, so a failed, cancelled or timed-out presentation is always recoverable; cleanup replays after attempts, at shutdown and at startup, and blocks new issuance until it succeeds. Snapshots bind cleanup to the provider endpoint and sorted zone scope — changing those while reusing the store fails closed.

Scope today: DNS identifiers only (ASCII A-labels), one account/group per process, same-origin ACME endpoints, no EAB, contact management or ARI. Production at windowsforum.com still renews through certbot; the manager is an adoption path, not a forced replacement.

## OCSP stapling --features ocsp

Build with `--features ocsp` (OpenSSL 3.x development headers and pkg-config at build time, the shared libraries at runtime). Pass `--ocsp-responder https://ocsp.example.net/status` to `serve`, optionally with `--ocsp-required`. The explicit CLI opt-in applies to every certificate on the process's TLS listeners regardless of the XML `enableStapling` boolean, and the one responder must serve every enabled issuer (per-issuer routing is not implemented).

        !   Not for Let's Encrypt
Let's Encrypt retired its OCSP service on 2025-08-06 and publishes CRLs instead. There is no responder to fetch from — do not enable this manager for current Let's Encrypt certificates. It exists for other CAs.

> [Diagram: ocsp-policy] Status lifecycle. Fetching never happens during a handshake. A verified GOOD response fills a generation-bound staple slot and is refreshed before expiry with jitter; a verified REVOKED result suppresses that leaf's handshakes even across a same-leaf reload; malformed or transient failures preserve a still-valid staple and otherwise fall to the optional/required policy.

- **Trust.** Each managed leaf must include its immediate issuer in the configured chain; responses must be signed by that issuer or a responder it directly authorizes for OCSP signing. Arbitrary trusted-root responders, unsigned responses, AIA fetching, redirects, encoded bodies and verification-bypass flags are all refused. SHA-256 CertIDs; RSA PKCS#1 v1.5 and ECDSA signatures with SHA-256/384/512.

- **Freshness.** `thisUpdate`, `producedAt` and `nextUpdate` are required; a staple is never valid past seven days from `thisUpdate` or the leaf/issuer/responder validity; expiry uses wall *and* monotonic time so a clock step back cannot extend a staple.

- **Transport.** Percent-encoded GET when the full URL is ≤ 255 bytes, else binary POST; DNS pinned per fetch; private destinations rejected except literal loopback under `--ocsp-test-mode`.

- **Policy.** Optional (default): cold or expired status serves without a staple unless the certificate has Must-Staple. Required: new handshakes are rejected until a valid response arrives — including at startup and for new certificate generations, so plan availability. Status is memory-only and resets on restart.

           **acceptance** · real-server fixtures on isolated listeners
```
cargo test --locked -p hj-ocsp
cargo test --locked -p hj-tls --features ocsp ocsp
cargo build --locked -p httpjet --features acme,ocsp
python3 -B scripts/ocsp-runtime-test.py --binary target/debug/httpjet            # required policy
python3 -B scripts/ocsp-runtime-test.py --binary target/debug/httpjet --optional
python3 -B scripts/ocsp-runtime-test.py --binary target/debug/httpjet --optional --must-staple
```

## Kernel TLS

The staged `--ktls` path (feature `ktls`) upgrades a completed TLS 1.3 rustls handshake to kernel TLS so H1 file bodies leave through `sendfile(2)`. It is hardware-aware and off on virtual NICs by default; see Protocol stacks → File egress for the policy and the measured (negative-on-GVE) receipt.
