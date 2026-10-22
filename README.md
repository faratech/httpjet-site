# httpjet-site — the httpjet.net website

This repository is the **public website and documentation site for
[httpjet](https://httpjet.net/)**, live at <https://httpjet.net/>.

It contains only HTML, CSS, and JavaScript for the public site. It does
**not** contain the httpjet web-server source code. The Rust server lives
in a separate repository,
[github.com/faratech/httpjet](https://github.com/faratech/httpjet).

The site has two surfaces:

- **Landing page (`/`)** — a single-page teaser at `index.html` with
  rotating taglines, animated counters, a canvas background, competitor-logo
  flybys, and an "epic mode" Web Audio synth player. It is driven by
  `index.js` and `index.css` and shares no chrome with the docs.
- **Documentation (`/docs/`)** — 21 pages under `docs/`, generated from the
  fragments and tooling in `docs-src/`. The header, sidebar nav, on-page
  table of contents, and search overlay are injected at runtime by
  `docs/assets/docs-head.js`; they are not duplicated in each page's HTML.

Further reading in this repo:

- [CLAUDE.md](CLAUDE.md) — maintainer notes for working in this repo
  (build models, cache busting, CSP, analytics).
- [PERFORMANCE.md](PERFORMANCE.md) — how the landing page reaches a
  100/100 Lighthouse score and how to keep it there.
- [docs-src/README.md](docs-src/README.md) — docs build tooling and
  mermaid gotchas.

## Repository layout

### Top level

| Path | What it is |
| --- | --- |
| `index.html` | Landing page. Ships with the landing CSS inlined in a `<style>` block (see [Performance](#performance)). |
| `index.css`, `index.js` | Landing sources. Edit these, then regenerate their `.min` siblings (see [Editing the landing page](#editing-the-landing-page)). |
| `index.min.css`, `index.min.js` | Checked-in minified landing assets. `index.min.js` is still fetched by `index.html` (with a `?v=` cache-buster); `index.min.css` is no longer fetched — its contents are pasted into `index.html`. |
| `analytics-helper.js`, `analytics-helper.min.js` | Standalone Google Analytics loader (injects `gtag.js` from a `data-ga-measurement-id` script attribute). Pages also wire `gtag` inline; see [CLAUDE.md](CLAUDE.md). |
| `404.html` | Styled 404 page served via `ErrorDocument 404 /404.html`. |
| `assets/logos/` | Landing flyby logos (`httpjet.svg`, `nginx.svg`, `apache-http-server.svg`, `litespeed.png`). |
| `og.jpg` | Open Graph / Twitter card image (1200×630). |
| `robots.txt`, `sitemap.xml` | Crawler policy and sitemap (root + 21 docs URLs). |
| `_headers` | [Cloudflare Pages](#deployment) response headers (security headers, cache rules). |
| `_redirects` | Cloudflare Pages redirects (currently a single rule: `/docs/index.html` → `/docs/ 301`). |
| `.htaccess` | Apache/LiteSpeed/httpjet rules kept for local servers: the docs-index redirect, `ErrorDocument 404`, per-extension `Content-Type` and `Cache-Control`, and a `Content-Security-Policy` header. |
| `CLAUDE.md`, `PERFORMANCE.md` | Maintainer and performance notes. |

### Documentation: source vs. generated

Docs pages are **generated**. Edit the sources and rebuild; do not
hand-edit the output.

| Edit this (source) | To change |
| --- | --- |
| `docs-src/pages/<slug>.html` | A page's body — the inner content of `<main class="content">` only. The page shell, breadcrumbs, pager, and footer are added by the build. |
| `docs-src/build.py` → `NAV` | Sidebar groups, page order and pager, each page's `<title>` suffix and meta description, and the search index. |
| `docs-src/build.py` → `CHARTS` | The inline SVG bar charts, referenced from a page as `<!--chart:name-->`. |
| `docs-src/build.py` → `VERSION` | The `?v=YYYYMMDD<letter>` cache-buster stamped on every docs asset. Bump it on every asset change. |
| `docs-src/diagrams/<name>.mmd` | A mermaid diagram, referenced from a page as `<!--diagram:<name>|caption-->`; re-render after editing (see [Building the docs](#building-the-docs)). |
| `docs/assets/docs.css`, `docs/assets/docs.js` | Docs styles and behavior (including the `.widget` cache-key explorer and budget calculator bound by element id). The build minifies these. |
| `docs/assets/docs-head.js` | Docs header/sidebar/search behavior. Note the build rewrites its `groups` array and every `?v=` string from `NAV` and `VERSION` — those parts are generated, the rest is source. |

| Do not hand-edit (generated) | Produced by |
| --- | --- |
| `docs/*.html` (all 21 pages, including `docs/index.html`) | `docs-src/build.py` wrapping a fragment from `docs-src/pages/` |
| `docs/assets/search-index.js` and `search-index.min.js` | The build, from each page's `h2`/`h3` ids (`window.DOCS_INDEX`, one entry per page). It is delivered as a `<script>`, not fetched, because the zone CSP forbids `connect-src` for XHR. |
| `docs/assets/docs.min.css`, `docs.min.js`, `docs-head.min.js` | `esbuild --minify` run by the build |
| `docs-src/rendered/<name>.svg` | `docs-src/render.js` rendering `docs-src/diagrams/<name>.mmd` to a dark-theme inline SVG. Diagrams are pre-rendered because the CSP is `script-src 'self'` — there is no mermaid at runtime. |

Other `docs-src/` contents:

| Path | What it is |
| --- | --- |
| `docs-src/build.py` | The docs assembler: shell template, `NAV`, `CHARTS`, diagram/chart expansion, search-index generation, `docs-head.js` rewriting, and minification. |
| `docs-src/render.js` | Renders every `diagrams/*.mmd` to `rendered/*.svg` with headless Chrome via puppeteer + mermaid. Accepts an optional name-prefix argument to render a subset. |
| `docs-src/check.js`, `docs-src/shot.js` | Puppeteer smoke helpers: page/TOC/nav/search checks against a locally served copy, and a single-SVG screenshot helper. |
| `docs-src/serve-help.txt`, `docs-src/serve-flags.html` | Snapshots the CLI reference page was generated from (`httpjet serve --help`). |
| `docs-src/.htaccess` | `Require all denied` — `docs-src/` is never served over HTTP. |

> **Working-copy note:** [CLAUDE.md](CLAUDE.md) describes the maintainer's
> `/web/httpjet` checkout, where `docs-src/` is a local-only directory
> "not in any git repo". In this standalone `httpjet-site` repository,
> `docs-src/` **is** tracked (sources, rendered SVGs, and tooling are all
> committed), which is what makes the docs rebuild possible from a clone —
> subject to the tooling caveats in [Building the docs](#building-the-docs).

## Previewing locally

The site is plain static files — there is no framework and no dev server
to install. Serve the repository root with any static HTTP server:

```bash
python3 -m http.server 8000
# then open http://localhost:8000/ and http://localhost:8000/docs/
```

That is enough to browse the landing page and every docs page. Two
caveats, both because a bare static server is not the production stack:

- `.htaccess` rules (the styled 404, the `/docs/index.html` → `/docs/`
  redirect, and the cache/CSP headers) are only applied by an
  Apache/LiteSpeed-compatible server, not by `python3 -m http.server`.
- Production is [Cloudflare Pages](#deployment); `_headers` and
  `_redirects` only take effect there.

## Editing the landing page

The landing has **no build system**. Minification and inlining are manual:

1. Edit `index.css` and/or `index.js`.
2. Re-minify into `index.min.css` / `index.min.js`.
3. If you changed the CSS, paste the new `index.min.css` contents into the
   inline `<style>` block in `index.html` (replacing everything between
   the `<style>` tags). `index.min.css` itself is no longer fetched by the
   landing page — this inline step is what ships the styles.
4. Bump the `?v=YYYYMMDD<letter>` query string on the `index.min.js`
   `<script>` tag in `index.html`. Assets are cached immutably for a year,
   so the query string is the only way clients pick up a changed asset.
5. Previews are styled only if step 3 was done; verify with the local
   server above, then see the purge step in
   [PERFORMANCE.md](PERFORMANCE.md) before expecting the change live.

`analytics-helper.js` follows the same source-plus-`.min` pattern as the
other root assets.

## Editing the documentation

### Page conventions

A docs page source is a body fragment, not a full HTML document. Follow
the shape used throughout `docs-src/pages/`:

```html
<h1>Page title</h1>
<p class="lede">One-paragraph summary of the page.</p>

<section>
  <h2 id="some-anchor">Section title</h2>
  <p>…</p>
</section>
```

Conventions to match:

- First element is `<h1>`, usually followed by `<p class="lede">`.
- Each topic is a `<section>` whose `<h2 id="…">` carries a stable,
  lowercase anchor id. The build collects `h2`/`h3` ids into the search
  index and the runtime TOC, so keep ids unique and stable — other pages
  deep-link to them (for example `operations.html#oci`).
- Inner pages get breadcrumbs and an eyebrow (the `NAV` group name) from
  the build; the `index` page is special-cased (no crumbs/eyebrow). Do not
  add your own shell, `<head>`, header, nav, pager, or footer to a
  fragment.
- Diagrams: put a mermaid source in `docs-src/diagrams/<name>.mmd` and
  reference it as `<!--diagram:<name>|caption HTML-->`. Charts: reference
  `<!--chart:<name>-->` and define `<name>` in `CHARTS` in
  `docs-src/build.py`. See [docs-src/README.md](docs-src/README.md) for
  mermaid gotchas (`;` is a statement separator in sequence diagrams;
  prefer `("rounded")` over `(["stadium"])`; keep long flowcharts `TB`).
- Interactive components available in every page (defined in
  `docs/assets/docs.css` / `docs.js`): `.tabs`, a filterable `.flagtable`
  paired with `.filterbar[data-filter="<table id>"]`, `.steps`, `.kv`,
  `.badge`, and `.widget`.
- Content facts originate from the httpjet server tree (its `CLAUDE.md`,
  `ARCHITECTURE.md`, `RESULTS.md`, `docs/*.md`, and `serve --help`), per
  [CLAUDE.md](CLAUDE.md) — keep site claims synced to that source.

### Editing an existing page

1. Edit `docs-src/pages/<slug>.html`.
2. If you renamed or removed an `h2`/`h3` id, update any pages that link
   to the old anchor.
3. Rebuild (below) and preview `docs/<slug>.html`.

### Adding a new page

1. Create `docs-src/pages/<slug>.html` as a body fragment following the
   conventions above.
2. Add its tuple to `NAV` in `docs-src/build.py`, in the right group and
   position — `(slug, nav title, <title> suffix, meta description)`.
   `NAV` order is also the sidebar order, the prev/next pager order, and
   the search-index order.
3. Bump `VERSION` in `docs-src/build.py`.
4. Rebuild and preview. The new page appears in the sidebar and search
   automatically; you may also want to link it from related pages and add
   it to `sitemap.xml`.

### Building the docs

The builder's own instructions live in [CLAUDE.md](CLAUDE.md) and
[docs-src/README.md](docs-src/README.md). In the maintainer's working
copy:

```bash
cd /web/httpjet/docs-src
npm install     # once: mermaid + esbuild (puppeteer comes from /web/node_modules)
node render.js  # only when a diagrams/*.mmd changed (needs /usr/bin/google-chrome)
python3 build.py
```

`python3 build.py` writes the 21 `docs/*.html` pages, regenerates
`docs/assets/search-index.js`, rewrites the `groups` array and `?v=`
strings in `docs/assets/docs-head.js`, and minifies
`docs.{css,js}`, `docs-head.js`, and `search-index.js` to their `.min`
siblings with `esbuild`.

**Read this before running the build from a fresh clone.** This
repository deliberately does not pin the Node toolchain:

- There is **no `package.json`** anywhere in the repo (only
  `node_modules/` is git-ignored), so `npm install` has nothing to
  install from — the `mermaid` and `esbuild` packages, and the
  `node_modules/.bin/esbuild` binary the build invokes, must be provided
  from outside this repo.
- `docs-src/render.js` (and `check.js` / `shot.js`) `require()` puppeteer
  from the absolute path `/web/node_modules/puppeteer` and launch
  `/usr/bin/google-chrome`. Both paths must exist, or the scripts must be
  adapted, before diagrams can be re-rendered.
- `docs-src/build.py` writes to the hardcoded path `/web/httpjet/docs`
  (`DOCS = '/web/httpjet/docs'`), not to a `docs/` relative to the clone.
  Run it from a `/web/httpjet` checkout, symlink that path to your clone,
  or adjust `DOCS` — otherwise the build updates a different tree than
  the one you preview.

If you only changed page prose (no diagram, no `NAV`/`VERSION` change),
you still need the `python3 build.py` step for the change to reach
`docs/`; editing a fragment alone does not change the served site. After
any docs-asset change, also bump `VERSION` — see the `docs-head.js`
selector gotcha in [CLAUDE.md](CLAUDE.md#cache-busting-assets-are-immutable-for-a-year).

## Performance

The landing page scores **100/100** on Lighthouse (warm Cloudflare edge
cache; a cold origin fetch measures 99). [PERFORMANCE.md](PERFORMANCE.md)
is the full record; the short version:

- The ~8 KB landing CSS is inlined into `index.html`, removing the only
  render-blocking request (LCP 839 ms → 450 ms, FCP 583 ms → 384 ms,
  Speed Index 688 ms → 488 ms, CLS 0).
- The decorative flyby logos use `fetchpriority="low"` and
  `decoding="async"` — deliberately **not** `loading="lazy"`, because
  they sit off-viewport at `left:112%` and move via `transform`, so lazy
  loading could prevent them from ever loading.
- `gtag.js` is intentionally left loading eagerly: total blocking time
  was already ~7 ms, so deferring analytics would buy no score and lose
  coverage.
- To re-verify: rebuild the `.min` siblings, re-paste the inline CSS,
  purge the Cloudflare cache for the `httpjet.net` zone (HTML is cached
  `max-age=3600`), then run Lighthouse/GTmetrix against
  `https://httpjet.net/` twice and read the warm run.

Docs assets are versioned with `?v=YYYYMMDD<letter>` and served with a
one-year immutable cache, so the version bump is part of every change
(see [CLAUDE.md](CLAUDE.md#cache-busting-assets-are-immutable-for-a-year)).

## Deployment

Production traffic for `httpjet.net` and `www.httpjet.net` is served by
**Cloudflare Pages** (project `httpjet-site`; both domains are CNAME'd to
`httpjet-site.pages.dev`). There is no server-side application to deploy —
the repository root is the published static tree.

Deploys happen either by pushing to this repository
(`github.com/faratech/httpjet-site`, `main`) or directly with Wrangler:

```bash
cd /web/httpjet
# after rebuilding docs:
source /web/.env
CLOUDFLARE_API_KEY="$CLOUDFLARE_GLOBAL_TOKEN" \
CLOUDFLARE_EMAIL="$CLOUDFLARE_EMAIL" \
npx wrangler pages deploy . --project-name httpjet-site --branch main
```

(See [CLAUDE.md](CLAUDE.md#deployment). Credentials come from the
maintainer's environment; no secrets are stored in this repo.)

Edge behavior is declared in three places — keep them consistent:

- **`_headers`** (Cloudflare Pages): security headers on `/*`
  (`X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy`, and a `Content-Security-Policy`), plus
  `Cache-Control: public, max-age=31536000, immutable` for `/*.css`,
  `/*.js`, and `/assets/*`, and `max-age=600` for `/robots.txt`.
- **`_redirects`** (Cloudflare Pages): currently a single canonical
  redirect, `/docs/index.html` → `/docs/ 301`.
- **`.htaccess`** (Apache/LiteSpeed/httpjet, for local/self-hosted
  serving): the same docs-index redirect, `ErrorDocument 404 /404.html`,
  per-extension charset and cache rules (HTML `max-age=3600,
  must-revalidate`; CSS/JS/media one-year immutable; `robots.txt`
  10 minutes), and a `Content-Security-Policy` header.

The CSP is defined in more than one place — a
`<meta http-equiv="Content-Security-Policy">` in every HTML `<head>`,
the `Header always set` line in `.htaccess`, and `_headers` — and
browsers enforce the intersection, so the stricter copy wins per
directive. The copies currently diverge slightly (for example, the
`.htaccess` policy omits `googletagmanager.com` from `script-src` while
the pages' meta tags include it). Update all copies together when
touching analytics, third-party scripts, or CSP. See
[CLAUDE.md](CLAUDE.md#csp-is-defined-twice--keep-them-in-sync).

Because HTML is edge-cached for an hour, purge the Cloudflare cache for
the `httpjet.net` zone after deploying if a change must be live
immediately.

## License

No `LICENSE` file is present in this repository. Until a license is
added, no reuse rights are granted — please do not copy or redistribute
the site's content or assets on the assumption that they are open
source. (The httpjet server is a separate project; check
[github.com/faratech/httpjet](https://github.com/faratech/httpjet) for
its own licensing.)
