# Quickstart — httpjet Documentation

> Build httpjet from source, validate a LiteSpeed-compatible configuration tree with check --strict, and serve it on loopback in ten minutes.

- **Canonical URL:** https://httpjet.net/docs/quickstart
- **Source Repository:** https://github.com/faratech/httpjet

---

# Quickstart

From a source checkout to a running origin in a few minutes: build the binary, validate a LiteSpeed-compatible tree with `check --strict`, serve it on loopback, and verify. httpjet reads the same `conf/httpd_config.xml` layout LiteSpeed uses, so an existing tree needs no migration step — but validate it first.

## Prerequisites

| Requirement | Why |

| Linux with **io_uring** | The monoio/io_uring transport is the only transport. Container runtimes must allow `io_uring_setup`/`io_uring_enter`/`io_uring_register` (see OCI ). |

| **Rust 1.99.1+**, edition 2024 | The workspace MSRV. A C toolchain is needed for the aws-lc-rs crypto backend and mimalloc. |

| OpenSSL 3.x headers + pkg-config | Only for `--features ocsp`. |

| An LSAPI-capable `lsphp` | Only for PHP. Static, proxy and FastCGI deployments need no PHP and no LiteSpeed installation. |

        i   Release status
No signed binary packages are published yet; the source build below is the install path. The repository's PGO and deploy scripts are tailored to one production deployment — do not treat them as a general installer.

## 1 · Build the binary

Clone the public repository from github.com/faratech/httpjet and compile the `httpjet` binary crate in release mode:

            **build** · cargo

```
git clone https://github.com/faratech/httpjet.git
cd httpjet

# release build of just the binary crate (the workspace is large — always scope with -p)
cargo build --release -p httpjet        # → target/release/httpjet

# optional build features (each still needs explicit runtime opt-in):
cargo build --release -p httpjet --features acme,ocsp,otel
```

A debug build (`cargo build -p httpjet`) compiles faster but runs ~5× slower — fine for iteration, meaningless for any measurement. For reproducible results use `--locked`.

## 2 · Validate a configuration tree

httpjet is configured by a *server root* containing `conf/httpd_config.xml`, optional `conf/mime.properties`, and the per-vhost XML files it references. The checked-in `examples/litespeed/` tree is a minimal working example: one plain listener on `127.0.0.1:8080` and one static vhost (`example.test`) with scripting and symlinks off.

            **check** · config lint

```
# parse the tree and print a summary (check is also the default subcommand)
target/release/httpjet --root "$PWD/examples/litespeed" check

# strict: exit non-zero on lint errors (warnings never fail) — the deploy gate
target/release/httpjet --root "$PWD/examples/litespeed" check --strict
```

`check --strict` hard-errors on a docroot shared by two vhosts, a vhost whose docroot is missing, and a mapped vhost whose config file did not load (geo rules without a database fail even a plain `check`); it warns, without failing, on a vhost with no exact `vhostMap` domain, an apex mapped without its `www.` twin, TLS over a Unix socket, PROXY protocol on a public bind, ignored LiteSpeed anti-abuse elements, generic CGI contexts, and every other directive that would parse but do nothing. It also prints each vhost's fast-memo verdict (`fast_memo: eligible [vary: …]`) and a `vhost-map-fingerprint` for comparing check output over time. Always use an absolute `--root`.

        !   Parsed ≠ equivalent
httpjet accepts LiteSpeed XML leniently so real trees load. A warning means the directive is *not* enforced — review every one before assuming parity. The capability matrix lists what is implemented.

## 3 · Serve on loopback

The XML holds persistent policy; `serve` flags hold operational overrides (addresses, workers, PHP wiring, cache budgets). The example is HTTP-only, PHP-off and cache-off, so it is safe next to an existing server.

            **serve** · development

```
target/release/httpjet --root "$PWD/examples/litespeed" serve \
  --http-addr 127.0.0.1:8080 --https-addr "" \
  --workers 1 --no-php
```

To try TLS and HTTP/3, add a secure listener with `keyFile`/`certFile` to the XML, set ` 1 `, and pass `--https-addr 127.0.0.1:8443`; the same port must be reachable over TCP (h1/h2) and UDP (h3). See TLS, ACME & OCSP .

        !   Keep test state isolated
Use alternate HTTP/HTTPS/metrics/admin ports, a separate `--php-socket` if PHP is on, low `--php-children`, and a separate `--page-cache-store-path`. Never point a test instance at a production LSAPI socket — two supervisors on one socket corrupt each other's worker accounting. Test pools default their control and generation files *beside* their own socket for exactly this reason.

## 4 · Verify

            **verify** · curl

```
printf 'hello from httpjet\n' > examples/litespeed/example/public/index.html
curl -i -H 'Host: example.test' http://127.0.0.1:8080/

# h2c prior knowledge on the same plain port
curl -i --http2-prior-knowledge -H 'Host: example.test' http://127.0.0.1:8080/

# Prometheus metrics (loopback-only by design)
curl -s http://127.0.0.1:9090/metrics | grep -E '^httpjet_(requests_total|active_connections)'
```

Expect a LiteSpeed-style ETag (`"size-mtime-inode;;;"`), `Vary: Accept-Encoding` on compressible bodies, and — once a listener is secure and QUIC is on — an `Alt-Svc` header advertising h3.

## 5 · Add PHP (optional)

With an LSAPI-capable `lsphp` configured in the XML (` ` or an `lsapi` `extProcessor` plus a `scriptHandler`), drop `--no-php` and let httpjet spawn its own pool on a private socket. For zero-downtime deploys, run the pool as a separate process instead:

            **two processes** · external pool

```
# terminal 1 — the persistent PHP pool
httpjet --root /abs/root lsphp --php-socket /run/httpjet-test/php.sock --php-children 4

# terminal 2 — the web tier dials it and never spawns lsphp itself
httpjet --root /abs/root serve --http-addr 127.0.0.1:8080 --https-addr "" \
  --lsphp-external /run/httpjet-test/php.sock \
  --lsphp-generation-file /run/httpjet-test/php.sock.generation
```

How the pool, the generation file and `lsphp-reload` fit together is on LSAPI & PHP .

## Where to go next

- Configuration — the XML reference, including the httpjet-native directives.

- CLI reference — every `serve` flag, grouped and filterable.

- Operations — systemd socket activation, the PHP pool, deploy gates and rollback.

- Page cache — enabling `--page-cache` safely.

- Migrating from LiteSpeed — the validation-first path for a real tree.

- github.com/faratech/httpjet — browse the Rust workspace source, example configs, and issue tracker on GitHub.
