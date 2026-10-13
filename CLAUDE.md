# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`/web/httpjet` is the **public website for httpjet.net** — a static marketing teaser plus a multi-page documentation site. It is *not* the httpjet web-server source code; the Rust server lives in a separate repo (`github.com/faratech/httpjet`). Nothing here is server code — only HTML/CSS/JS for the public site.

This directory is tracked as a Git submodule mapped to **`github.com/faratech/httpjet-site`** (`branch = main`).

### Cloudflare Pages Hosting

Production public traffic for `httpjet.net` and `www.httpjet.net` is served directly via **Cloudflare Pages** (project: `httpjet-site`, custom domains `httpjet.net` & `www.httpjet.net` CNAME'd to `httpjet-site.pages.dev`). Edge routing, 404 handling, and caching rules are declared in:
- `_headers`: Caching headers (`max-age=31536000, immutable` for static assets, 1 hour for HTML) and CSP headers.
- `_redirects`: Canonical redirects (e.g. `/docs/index.html` -> `/docs/ 301`).
- `.htaccess`: Maintained locally for backward-compatibility with local Apache/LiteSpeed/httpjet servers.

### Deployment

Deploying changes to Cloudflare Pages can be done either via Git push to `faratech/httpjet-site` or via Wrangler CLI:

```bash
cd /web/httpjet
# After rebuilding docs:
source /web/.env
CLOUDFLARE_API_KEY="$CLOUDFLARE_GLOBAL_TOKEN" \
CLOUDFLARE_EMAIL="$CLOUDFLARE_EMAIL" \
npx wrangler pages deploy . --project-name httpjet-site --branch main
```


## Two surfaces, two build models

**Landing (`/`)** has no build system: `index.js`/`index.css` are minified by hand into
`index.min.js`/`index.min.css`, and the landing CSS is additionally **inlined** into a
`<style>` block in `index.html` (perf, see `PERFORMANCE.md`). Edit source → minify →
paste. Nothing in the repo does this for you.

**Docs (`/docs/`) are GENERATED — do not hand-edit `docs/*.html`.** Since 2026-09-17 the
docs are assembled by `docs-src/build.py` (a directory that is denied over HTTP and not
in any git repo):

| Edit this | To change |
|---|---|
| `docs-src/pages/<slug>.html` | a page's body (inner content of `<main>`; the shell, crumbs, pager and footer are added by the build) |
| `docs-src/build.py` → `NAV` | the sidebar groups, page order/pager, `<title>` and meta descriptions, the search index |
| `docs-src/build.py` → `CHARTS` | the SVG bar charts (`<!--chart:name-->` in a page) |
| `docs-src/diagrams/<n>.mmd` | a mermaid diagram (`<!--diagram:<n>|caption-->` in a page); run `node render.js` after editing |
| `docs/assets/docs.css`, `docs.js`, `docs-head.js` | styles/behavior/header — the build minifies them and rewrites the `groups` array + `?v=` in `docs-head.js` |
| `docs-src/build.py` → `VERSION` | the `?v=YYYYMMDDx` cache-buster on every docs asset |

```bash
cd /web/httpjet/docs-src && npm install     # once; mermaid + esbuild (puppeteer from /web/node_modules)
node render.js                              # diagrams/*.mmd → rendered/*.svg (headless Chrome)
python3 build.py                            # writes docs/*.html, search-index(.min).js, docs-head(.min).js, docs.min.{css,js}
```

Diagrams are pre-rendered to inline SVG (the zone CSP is `script-src 'self'`, so no
mermaid at runtime); `search-index.js` is generated from the pages' `h2`/`h3` ids; the
`docs-head.js` version selector is rewritten by the build. `docs-src/README.md` has the
mermaid gotchas. Content facts come only from `/usr/local/httpjet` — re-sync from
`CLAUDE.md`, `ARCHITECTURE.md`, `RESULTS.md`, `docs/*.md` and `serve --help` there.

## Cache busting (assets are immutable for a year)

`.htaccess` serves `.css`/`.js` with `Cache-Control: public, max-age=31536000, immutable`. The only way a client picks up a changed asset is the **`?v=YYYYMMDD<letter>`** query string on every `<link>`/`<script>`. Bump it on *every* asset edit.

- Landing: only `index.min.js` still uses `?v=` (the landing CSS is inlined, so it has no cache-bust query — it ships inside the HTML, which is `max-age=3600`). Docs assets use `?v=`. The two surfaces version independently.
- After editing landing files, the HTML is cached at the edge (`max-age=3600`) — purge the Cloudflare cache for the httpjet.net zone to make changes live immediately (Cloudflare dash → Caching → Purge, or the API).
- **Gotcha:** the docs version string is also hardcoded inside `docs/assets/docs-head.js` (the `body.querySelector('script[src="assets/search-index.min.js?v=…"]')` selector). `docs-src/build.py` rewrites it from `VERSION`; if you ever bump `?v=` by hand, update that selector too or the search overlay injection silently breaks.

## Two surfaces

**Landing (`/` → `index.html`)** — a single-page teaser driven by `index.js` + `index.css`: rotating taglines, animated counter chips, competitor-logo "flyby" animation (`assets/logos/`), a canvas FX background, and an "epic mode" procedural Web Audio synth player. Self-contained; no shared chrome with the docs.

**Docs (`/docs/` → `docs/index.html` + 20 sibling pages, generated from `docs-src/`)** — content-only pages. Each docs HTML file is a bare `<main class="content">` of `<section>`s. **The header, sidebar nav, on-page TOC, and search overlay are injected at runtime by `docs-head.js`** — they are *not* duplicated in each page's HTML. Consequences:

- The **sidebar nav is single-sourced** in `NAV` in `docs-src/build.py`, which rewrites the `groups` array inside `docs-head.js` on every build (the header's primary `<nav>` is still hand-edited in `docs-head.js`).
- The **client-side search index is generated** into `docs/assets/search-index.js` (`window.DOCS_INDEX`, one entry per page with its `h2`/`h3` headings) by the build. It is delivered as a `<script>` (assigning a global), **not** fetched, because the zone CSP forbids `connect-src` — so the search index cannot be loaded via `fetch`/XHR.

**Adding a docs page**: create `docs-src/pages/<slug>.html` (body only), add its tuple to `NAV` in `docs-src/build.py`, bump `VERSION`, run `python3 build.py`. Interactive components available in every page: `.tabs`, filterable `.flagtable` with a `.filterbar[data-filter=<table id>]`, `.steps`, `.kv`, `.badge`, `.widget` (the cache-key explorer and budget calculator in `docs.js` are bound by element id).

## CSP is defined twice — keep them in sync

The Content-Security-Policy is set in two independent places that must agree:
1. A `<meta http-equiv="Content-Security-Policy">` in **every** HTML `<head>`.
2. `Header always set Content-Security-Policy` in `.htaccess`.

Both are enforced (browsers apply the intersection, so the stricter one wins per-directive). They currently diverge — e.g. the `.htaccess` policy omits `googletagmanager.com` from `script-src` while the meta tags include it. When touching analytics, third-party scripts, or CSP, update both copies together.

## `.htaccess` behavior

- `ErrorDocument 404 /404.html` — the styled 404 page.
- `RewriteRule ^docs/index\.html$ /docs/ [R=301,L]` — canonicalizes the docs index URL.
- Per-extension `Content-Type` + `Cache-Control` (HTML: `max-age=3600, must-revalidate`; CSS/JS: 1-year immutable; `robots.txt`: 10 min).

## Analytics

Google Analytics (gtag, measurement ID `G-ZR4WV214JT`) is wired inline in each page `<head>`, plus Cloudflare Insights. `analytics-helper.js` is a standalone loader that injects gtag from a `data-ga-measurement-id` script attribute (an alternative to the inline snippet). Whatever you change, the GA/CF hosts must remain allowed in *both* CSP copies.

## Previewing locally

It is pure static files — serve the directory over any static HTTP server (e.g. `python3 -m http.server` from `/web/httpjet`) and open `/` and `/docs/`. Note that `.htaccess` rules (404 page, the `/docs/index.html` redirect, headers) are only applied by an Apache/LiteSpeed-compatible server, not by a bare static server.
