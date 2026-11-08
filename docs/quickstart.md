# Quickstart — httpjet Documentation

> Install httpjet and serve your first page.

- **Canonical URL:** https://httpjet.net/docs/quickstart
- **Source Repository:** https://github.com/faratech/httpjet

---

# Quickstart

Install httpjet on a fresh Linux server in a few commands. You can also build it from source and try an example configuration.

Choose the packaged install for a fresh server. Choose the source build for development or testing. The packaged install serves a static welcome page over HTTP and HTTPS.

## Install a published release

Use a fresh Linux server on **amd64/x86-64 or arm64/aarch64**. Run the installer as root. You need Linux **io_uring** and free ports 80 and 443. You need no Rust toolchain, LiteSpeed, PHP or domain name.

           **install** · Linux
```
curl -fsSLo install.sh https://github.com/faratech/httpjet/releases/latest/download/install.sh
sudo sh ./install.sh
```

The installer selects signed DEB/APT or RPM packages on supported systemd systems. It can also select a signed portable archive. It verifies the release before installing. It creates a dedicated `httpjet` account. It starts the service on a fresh install. GitHub Releases also provides DEB, RPM and static archives.

Fresh installs serve `http://SERVER-IP/` on port 80. They serve `https://SERVER-IP/` on port 443. Each install generates its own self-signed certificate. Browsers warn until you configure a trusted certificate. HTTP does not redirect to HTTPS automatically. Open TCP ports 80 and 443 in your firewall for remote access.

           **check** · local welcome page
```
curl -f http://127.0.0.1/
# Accept the self-signed certificate for this loopback check only
curl -fk https://127.0.0.1/
```

Put site files in `/var/www/httpjet`. Find configuration under `/etc/httpjet/conf/`. Find logs under `/var/log/httpjet`. For a trusted certificate, update `keyFile` and `certFile` in `/etc/httpjet/conf/httpd_config.xml`. Run `httpjet --root /etc/httpjet check --strict` next. Restart the service after the check passes. Upgrades preserve existing configuration and certificates. See installation options and service commands .

        i   GitHub attribution
Release files have GitHub Actions publication attestations. Verify the installer with `gh attestation verify ./install.sh --repo faratech/httpjet --signer-workflow faratech/httpjet/.github/workflows/installer-publish-now.yml`. The release's full distribution matrix was not completed.

## Docker and Docker Desktop with WSL 2

Run the published Linux image on Docker Engine. You can also use Docker Desktop with the WSL 2 backend. Docker's default seccomp profile blocks io_uring. Download the Compose file and supplied profile first:

           **container** · Docker Compose
```
curl -fsSLo compose.yaml https://raw.githubusercontent.com/faratech/httpjet/main/packaging/docker/compose.yaml
curl -fsSLo seccomp-httpjet.json https://raw.githubusercontent.com/faratech/httpjet/main/packaging/oci/seccomp-httpjet.json
docker compose up -d
```

Open `http://localhost:8080/` or `https://localhost:8443/`. The container generates a self-signed certificate. The certificate persists in a named volume. Browsers warn until you configure a trusted certificate. Your host kernel and runtime must allow io_uring. See the Docker and WSL 2 guide for details.

## Microsoft WSL Containers (wslc)

httpjet does not support Microsoft WSL Containers (`wslc`) today. See the Docker and WSL guide for the current status.

## Build from source

Build from source only for development or testing. Start with Source-build prerequisites below.

## Source-build prerequisites

You need the items below for a source build. You serve the example on loopback after the build.

| Requirement | Why |

| Linux with **io_uring** | The monoio/io_uring transport is the only transport. Limit: runtimes must allow `io_uring_setup`/`io_uring_enter`/`io_uring_register` (see OCI ). |

| **Rust 1.99.1+**, edition 2024 | The workspace MSRV. Limit: you also need a C toolchain for aws-lc-rs and mimalloc. |

| OpenSSL 3.x headers + pkg-config | Required only for `--features ocsp`. Limit: other builds do not need it. |

| An LSAPI-capable `lsphp` | Required only for PHP. Limit: static, proxy and FastCGI deployments need no PHP. |

## 1 · Build the binary

Clone the public repository from github.com/faratech/httpjet . Compile only the `httpjet` binary crate in release mode:

            **build** · cargo

```
git clone https://github.com/faratech/httpjet.git
cd httpjet

# release build of just the binary crate (the workspace is large — always scope with -p)
cargo build --release -p httpjet        # → target/release/httpjet

# optional build features (each still needs explicit runtime opt-in):
cargo build --release -p httpjet --features acme,ocsp,otel
```

A debug build compiles faster but runs ~5× slower. Use a debug build only for iteration. Use `--locked` for reproducible results.

## 2 · Validate a configuration tree

Configure httpjet with a *server root*. The root holds `conf/httpd_config.xml` and optional `conf/mime.properties`. It also holds the referenced per-vhost XML files. The `examples/litespeed/` tree gives you one listener on `127.0.0.1:8080`. It gives you one static vhost, `example.test`, with scripting and symlinks off.

            **check** · config lint

```
# parse the tree and print a summary (check is also the default subcommand)
target/release/httpjet --root "$PWD/examples/litespeed" check

# strict: exit non-zero on lint errors (warnings never fail) — the deploy gate
target/release/httpjet --root "$PWD/examples/litespeed" check --strict
```

`check --strict` hard-errors on three cases:

- A docroot shared by two vhosts fails.

- A vhost with a missing docroot fails.

- A mapped vhost whose config did not load fails.

Geo rules without a database fail even a plain `check`. Other findings warn without failing. Always use an absolute `--root`. See Configuration and Capabilities & limits for warnings.

## 3 · Serve on loopback

The XML holds persistent policy. The `serve` flags hold operational overrides. The example is HTTP-only, PHP-off and cache-off. You can run it safely beside an existing server.

            **serve** · development

```
target/release/httpjet --root "$PWD/examples/litespeed" serve \
  --http-addr 127.0.0.1:8080 --https-addr "" \
  --workers 1 --no-php
```

For TLS and HTTP/3, add a secure listener first. Set `keyFile`/`certFile` in the XML. Set ` 1 ` next. Pass `--https-addr 127.0.0.1:8443` when you serve. Reach the same port over TCP and UDP. See TLS, ACME & OCSP .

        !   Keep test state isolated
Use alternate ports and a separate `--php-socket`. Use low `--php-children` and a separate `--page-cache-store-path`. Never point a test instance at a production LSAPI socket.

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

Expect a LiteSpeed-style ETag, `"size-mtime-inode;;;"`. Expect `Vary: Accept-Encoding` on compressible bodies. Expect an `Alt-Svc` header once QUIC is on.

## 5 · Add PHP (optional)

Configure an LSAPI-capable `lsphp` in the XML first. Use ` ` or an `lsapi` `extProcessor` plus a `scriptHandler`. Drop `--no-php` to spawn a private pool. For zero-downtime deploys, run the pool separately:

            **two processes** · external pool

```
# terminal 1 — the persistent PHP pool
httpjet --root /abs/root lsphp --php-socket /run/httpjet-test/php.sock --php-children 4

# terminal 2 — the web tier dials it and never spawns lsphp itself
httpjet --root /abs/root serve --http-addr 127.0.0.1:8080 --https-addr "" \
  --lsphp-external /run/httpjet-test/php.sock \
  --lsphp-generation-file /run/httpjet-test/php.sock.generation
```

See LSAPI & PHP for pool and reload details.

## Where to go next

- Configuration — the XML reference.

- CLI reference — every `serve` flag.

- Operations — systemd, PHP pool and rollback.

- Page cache — enable `--page-cache` safely.

- Migrating from LiteSpeed — validate a real tree.

- github.com/faratech/httpjet — source and issue tracker.
