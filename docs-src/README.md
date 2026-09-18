# httpjet.net/docs — build tooling

The public docs under `../docs/` are assembled from this directory. It is
**not served** (`.htaccess` denies everything) and is not part of any git repo.

```
pages/<slug>.html   hand-authored body of each page (inner content of <main>, no pager/footer)
diagrams/<n>.mmd    mermaid sources; referenced from a page as  <!--diagram:<n>|caption html-->
rendered/<n>.svg    mermaid pre-rendered to SVG (dark theme matching docs.css) — generated
build.py            NAV (sidebar groups, page order, titles, descriptions), charts, page shell,
                    search-index.js + docs-head.js groups, esbuild minification
render.js           renders diagrams/*.mmd → rendered/*.svg with puppeteer + mermaid
serve-help.txt      `httpjet serve --help` snapshot the CLI page table was generated from
```

## Rebuild

```bash
cd /web/httpjet/docs-src
npm install                              # mermaid + esbuild (puppeteer comes from /web/node_modules)
node render.js [name-prefix]             # only when a .mmd changed (needs /usr/bin/google-chrome)
python3 build.py                         # writes ../docs/*.html, assets/search-index.js, docs-head.js, *.min.*
```

Bump `VERSION` in `build.py` (the `?v=` cache-buster) on every asset change, then
purge the Cloudflare cache for httpjet.net. Charts are defined in `CHARTS` inside
`build.py` and referenced as `<!--chart:<name>-->`; the categorical palette
(`#0891b2`, `#d97706`, `#a855f7`) was validated for CVD separation on the dark surface.

Mermaid gotchas: `;` inside a sequence-diagram message is a statement separator
(use `—`); prefer `("rounded")` over `(["stadium"])` (stadium nodes render as
multi-kilobyte paths); keep long flowcharts `TB` so they fit the 760 px column.

Facts on the pages come from `/usr/local/httpjet` (CLAUDE.md, ARCHITECTURE.md,
RESULTS.md, docs/*.md, `serve --help`) — that tree is the only authority.
