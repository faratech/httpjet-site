# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`/web/httpjet` is the **public website for httpjet.net** — a static marketing teaser plus a multi-page documentation site. It is *not* the httpjet web-server source code; the Rust server lives in a separate repo (`github.com/faratech/httpjet`). Nothing here is server code — only HTML/CSS/JS for the public site.

This directory is **not tracked in the `/web` monorepo git** (`git ls-files` returns nothing for it; it is untracked, not ignored). It is a standalone deployable that happens to live on the production filesystem. Do not expect `/web` git history or commits to cover changes here.

The site is dogfooded: per `/web/CLAUDE.md` the httpjet Rust server is what serves production `:80`/`:443`, and it honors `.htaccess` — so this site is served by the very server it documents.

## No build system — minified siblings are committed by hand

There is no `package.json`, bundler, `Makefile`, or build step anywhere in this tree. Instead, **every source asset has a committed minified sibling, and the HTML loads the `.min.*` version**:

| Source (edit this) | Shipped (HTML loads this) |
|---|---|
| `index.js` / `index.css` | `index.min.js` / `index.min.css` |
| `docs/assets/docs.js` / `docs.css` | `docs/assets/docs.min.js` / `docs.min.css` |
| `docs/assets/docs-head.js` | `docs/assets/docs-head.min.js` |
| `docs/assets/search-index.js` | `docs/assets/search-index.min.js` |
| `analytics-helper.js` | `analytics-helper.min.js` |

The `.min.*` files are single-line, whitespace-stripped versions. **Editing a source file alone changes nothing in production** — you must regenerate its `.min` sibling (no in-repo tool; minify by hand or with an external minifier preserving behavior). When in doubt, verify the `.min` file reflects your edit before considering the change done.

> **Landing CSS exception (perf):** `index.html` no longer loads `index.min.css` via a `<link>` — the minified landing CSS is **inlined** in a `<style>` block in `<head>` to eliminate the render-blocking stylesheet request (this is what makes the landing a 100/100 PageSpeed page; see `PERFORMANCE.md`). So the landing CSS now has a **three-step** chain: edit `index.css` → minify to `index.min.css` → **paste that minified content into the `<style>` block in `index.html`** (replacing everything between the style tags). `index.min.css` is kept as the canonical source-of-minified but is no longer fetched by the landing page. The docs CSS (`docs/assets/docs.min.css`) is unchanged — still loaded via `<link>`.

## Cache busting (assets are immutable for a year)

`.htaccess` serves `.css`/`.js` with `Cache-Control: public, max-age=31536000, immutable`. The only way a client picks up a changed asset is the **`?v=YYYYMMDD<letter>`** query string on every `<link>`/`<script>`. Bump it on *every* asset edit.

- Landing: only `index.min.js` still uses `?v=` (the landing CSS is inlined, so it has no cache-bust query — it ships inside the HTML, which is `max-age=3600`). Docs assets use `?v=`. The two surfaces version independently.
- After editing landing files, the HTML is cached at the edge (`max-age=3600`) — purge the Cloudflare cache for the httpjet.net zone to make changes live immediately (Cloudflare dash → Caching → Purge, or the API).
- **Gotcha:** the docs version string is also hardcoded inside `docs/assets/docs-head.js` (the `body.querySelector('script[src="assets/search-index.min.js?v=20260621n"]')` selector at ~line 85). If you bump the docs `?v=` in the HTML heads, update that selector too or the search overlay injection silently breaks.

## Two surfaces

**Landing (`/` → `index.html`)** — a single-page teaser driven by `index.js` + `index.css`: rotating taglines, animated counter chips, competitor-logo "flyby" animation (`assets/logos/`), a canvas FX background, and an "epic mode" procedural Web Audio synth player. Self-contained; no shared chrome with the docs.

**Docs (`/docs/` → `docs/index.html` + 11 sibling pages)** — content-only pages. Each docs HTML file is a bare `<main class="content">` of `<section>`s. **The header, sidebar nav, on-page TOC, and search overlay are injected at runtime by `docs-head.js`** — they are *not* duplicated in each page's HTML. Consequences:

- The **sidebar nav is single-sourced** in the `groups` array inside `docs-head.js`. To add/rename/reorder a docs page in the nav, edit that array (and the header's primary `<nav>` if it's a top-level link) — do not hand-edit nav markup in each page.
- The **client-side search index is hand-maintained** in `docs/assets/search-index.js` (`window.DOCS_INDEX`, one entry per page with its headings). It is delivered as a `<script>` (assigning a global), **not** fetched, because the zone CSP forbids `connect-src` — so the search index cannot be loaded via `fetch`/XHR. Add a new docs page → add its entry here by hand.

**Adding a docs page** therefore takes three coordinated edits: (1) create `docs/<page>.html` (copy an existing page's `<head>` + `<main class="content">` skeleton), (2) add it to the `groups` array in `docs-head.js` (and bump/minify), (3) add its entry to `search-index.js` (and minify).

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
