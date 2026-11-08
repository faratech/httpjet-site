# TLS, ACME & OCSP — httpjet Documentation

> Set up certificates, ACME issuance, and OCSP.

- **Canonical URL:** https://httpjet.net/docs/certificates
- **Source Repository:** https://github.com/faratech/httpjet

---

# TLS, ACME & OCSP

You configure certificates, client verification, and session resumption here. ACME and OCSP stapling are opt-in services on the same resolver.

        resolve    acl    rewrite    cache    dispatch    finalize    store

| Choice | Use it when. Gate: |

| File certificates | You already own PEM chains. Gate: none; reload via SIGHUP. |

| ACME ( below ) | You want issuance and renewal in-process. Gate: `--features acme` plus four CLI flags. |

| OCSP stapling ( below ) | Your CA still runs a responder. Gate: `--features ocsp` plus `--ocsp-responder`. |

ACME and OCSP are default-off at build and runtime. Both publish into the same generation-bound resolver slots as file certificates.

## TLS configuration

`hj-tls` builds one `rustls::ServerConfig` for TCP and QUIC via `build_server_config_alpn(cfg, listener, alpn)`. You land rotations on both transports at once.

| Listener XML | Meaning. Limit: |

| `secure`, `keyFile`, `certFile` | Listener default identity (PEM). Limit: `certChain=1` appends `CACertFile` as served chain. |

| Per-vhost ` ` | SNI identity for that vhost. Limit: chain material only, never a client-verify root; pair ECDSA+RSA for smaller modern chains. |

| `clientVerify` 0–3, `CACertFile`, `verifyDepth` | mTLS: 0 none, 1 optional, 2 required, 3 as 1. Limit: verifier uses the listener CA only; verdicts memoized off the hot path. |

| `crlFile` httpjet | PEM CRL or bundle for the webpki verifier. Limit: absent means no revocation checking; rotate via trust-generation reload. |

| `enableStapling` | Parsed for compatibility only. Limit: fetching needs the `ocsp` feature and `--ocsp-responder`; `check` says so. |

| `--ktls` (feature `ktls`) | Kernel TLS for TLS 1.3 H1 file egress. Limit: see the kTLS stub and File egress . |

### Handshake posture

- **SNI without cert-name-match.** SNI maps directly to configured material, mirroring OpenLiteSpeed. Limit: ACME identities are exact-SNI overlays; the no-SNI fallback stays.

- **TLS 1.3 suite.** TLS 1.3 offers exactly `TLS_AES_128_GCM_SHA256`; TLS 1.2 keeps its full set. Limit: rustls negotiates by client order; the pin moves transcripts to hardware SHA-NI.

- **Tickets.** Listeners without client verification (`clientVerify` 0) issue single-use, stateful TLS 1.3 tickets. Limit: `--tls-session-tickets` per full handshake (default 2; 0 shrinks the cache from 32,768 to 256 TLS 1.2 IDs); 0-RTT off everywhere.

- **Verified-client listeners.** `clientVerify` 1–3 issues no tickets and keeps no session cache. Limit: every connection full-handshakes and re-verifies; resumption stays 0 there.

- **Certified-peer idle window.** `--trusted-proxy-idle-secs` extends idle for verified-certificate connections. Limit: OCSP disables resumption; full handshakes fell 28%/s (about 30%/request x86, 78%/request ARM).

- **mTLS boundary.** On `clientVerify=2`, plaintext for an mTLS vhost is refused unless from loopback. Limit: `--no-mtls` relaxes this for local testing only.

- **Reload.** File certificates reload via `CertReloadHandle` on SIGHUP or the write API . Limit: a failed reload keeps prior certificates; kTLS templates apply to new handshakes only.

        !   Two CAs, two roles
A per-vhost `CACertFile` goes to clients as chain material. The listener `CACertFile` verifies client certificates; never merge the roles.

## ACME certificate automation --features acme

Build with `cargo build --locked -p httpjet --features acme`. You need all four required flags; one manager/account/identifier set runs per process, boot-frozen.

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

You need public TCP port 80 and an enabled TLS listener. The route `/.well-known/acme-challenge/ ` runs before normalization, redirects, rewrites, auth, cache, and backends.

Only plaintext GET on the validated authority answers. Limit: 404 unknown, 405 other, `no-store`; tokens redacted; #259 bypass closed.

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

You need no port 80 and no HTTP exemption here. Run your own controller; no Cloudflare or provider integration ships.

A wildcard matches exactly one leftmost label. Limit: request the apex separately; scope the credential to the listed zones.

| Webhook operation | Contract. Limit: |

| `present` | POST JSON `{"version":1,"operation":"present","name":"_acme-challenge.example.test","value":" "}`, Bearer [REDACTED]. Limit: adds that value only, never replaces the RRset. |

| `ready` | Same `name`/`value` fields. Limit: reply `{"ok":true,"ready":true|false}`; false means not yet visible. |

| `cleanup` | Same fields; reply `{"ok":true}`. Limit: removes only that value; succeeds if already absent (apex/wildcard share one owner). |

All operations are idempotent, with a 5 s deadline per call. Limit: replies over 16 KiB, redirects, non-2xx, and unexpected fields are rejected; `ready:true` without real DNS visibility is invalid in production.

`--acme-test-mode` permits literal-loopback HTTP directories and alternate ports. Limit: it requires loopback serving addresses; `--acme-test-ca-root`, `--acme-test-issuer-root`, and `--acme-dns-test-root` replace roots without disabling verification (Pebble only).

               **acceptance** · Pebble v2.10.1
```
cargo test --locked -p hj-acme
cargo build --locked -p httpjet --features acme
python3 -B scripts/acme-pebble-test.py --binary target/debug/httpjet \
  --pebble /path/to/pebble --dns /path/to/pebble-challtestsrv \
  --pebble-source /path/to/pebble-v2.10.1 --bootstrap [--dns01]
```

### Issuance, recovery and activation

> [Diagram: acme-http01] HTTP-01 issuance. Each durable step precedes its network step: account key before registration, certificate key and CSR before finalize, issued pair in the same atomic snapshot. Only a validated pair publishes.

- **Durable before network.** A lost `newOrder` response is ambiguous; a marker stops reissuance. Limit: restart once with `--acme-reconcile-order `; never delete the store.

- **Bounded CA traffic.** Only GET/HEAD/POST at the directory origin. Limit: no redirects/proxies; 1 MiB bodies; 5 s connect / 10 s request; 120 s per attempt; backoff plus `Retry-After`.

- **Private store.** Pre-create a 0700 directory owned by the effective uid. Limit: no-follow ancestors, exclusive lock, 0600 snapshots (pending→fsync→rename→dirsync, 1 MiB cap); pending files discarded.

- **Activation.** The validated `CertifiedKey` publishes as exact-SNI to TCP, kTLS, and QUIC. Limit: SIGHUP uses a separate slot; boot rejects an expired pair.

- **Bootstrap.** With `--acme-bootstrap`, the default identity starts absent. Limit: no self-signed placeholder; handshakes fail until issuance.

- **Renewal.** Renewal keeps one third of lifetime in reserve, plus jitter.

> [Diagram: acme-dns01] DNS-01 cleanup. Cleanup intent journals before any DNS mutation; cleanup replays after attempts, at shutdown and startup, and blocks new issuance until it succeeds. Changing endpoint or zone scope on a reused store fails closed.

Scope: DNS identifiers only (ASCII A-labels), one account/group per process, same-origin endpoints, no EAB, contact management, or ARI. Production at windowsforum.com still renews through certbot.

## OCSP stapling --features ocsp

Build with `--features ocsp` (OpenSSL 3.x headers and pkg-config at build; shared libraries at runtime). Pass `--ocsp-responder https://ocsp.example.net/status`, optionally `--ocsp-required`.

The CLI opt-in covers every certificate on your TLS listeners. Limit: `enableStapling` alone does nothing; one responder must serve every issuer.

        !   Not for Let's Encrypt
Let's Encrypt retired OCSP on 2025-08-06 and publishes CRLs instead. Do not enable this manager for current Let's Encrypt certificates.

> [Diagram: ocsp-policy] Status lifecycle. Fetching never happens during a handshake. Verified GOOD fills a generation-bound slot; verified REVOKED suppresses that leaf even across reload; failures preserve a still-valid staple or fall to policy.

- **Trust.** Each leaf includes its immediate issuer. Limit: issuer/authorized-signer signatures only; no AIA, redirects, encoded bodies, or bypass; SHA-256 CertIDs; RSA PKCS#1 v1.5, ECDSA SHA-256/384/512.

- **Freshness.** `thisUpdate`, `producedAt`, `nextUpdate` required. Limit: never past seven days from `thisUpdate`; wall and monotonic time both apply.

- **Transport.** Percent-encoded GET at ≤ 255 bytes, else binary POST. Limit: DNS pinned; private destinations rejected except loopback under `--ocsp-test-mode`.

- **Policy.** Optional (default) serves without a staple, unless Must-Staple. Limit: required rejects handshakes until valid, even at startup; memory-only, resets on restart.

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

kTLS now lives inside TLS configuration as one table row. See File egress for policy and receipts; this stub keeps old links working.
