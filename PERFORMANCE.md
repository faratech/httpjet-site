# PERFORMANCE.md — httpjet.net landing page

How the landing page (`/` → `index.html`) reaches a **100/100** Lighthouse / GTmetrix
performance score, what was changed to get there, and how to keep it.

## Result

| Metric | Baseline (2026-06-23) | After |
|---|---|---|
| **Lighthouse Performance** | 99 | **100** |
| Largest Contentful Paint | 839 ms | **450 ms** |
| First Contentful Paint | 583 ms | **384 ms** |
| Total Blocking Time | 7 ms | ~30 ms (Good) |
| Cumulative Layout Shift | 0 | 0 |
| Speed Index | 688 ms | **488 ms** |
| Requests / weight | 9 / 219 KB | 8 / 218 KB |

Measured with GTmetrix (Lighthouse, desktop Chrome, Seattle). The score is
TTFB-sensitive: a request that misses the Cloudflare edge cache (cold origin
fetch, ~340 ms TTFB) measures 99; a warm cache hit (~100 ms TTFB) measures 100.

## What was already good (left alone)

The page is a single static HTML file with a small CSS/JS pair and no framework,
so FCP/LCP and TBT were already excellent. Notably:

- **Google tag (`gtag.js`, `G-ZR4WV214JT`) was left loading eagerly on purpose.**
  TBT was only 7 ms, so deferring analytics to first-interaction (as was done on
  bsod.windowsforum.com, where third-party JS was the bottleneck) would buy ~0
  score here while losing analytics coverage on non-interacting visits. Wrong
  fix for this page.
- The Cloudflare **"Google tag gateway for advertisers"** was already disabled on
  the httpjet.net zone (it had been serving a first-party Google tag at `/bgzh`
  and running ~180 ms of JS per load). Re-enabling it would regress this score.

## Changes made (in `index.html`)

1. **Inlined the landing CSS** — `index.min.css` was a render-blocking
   `<link rel="stylesheet">` costing ~436 ms in the Lighthouse lab (the one thing
   keeping the page at 99). It's only ~8 KB, so it's now inlined in a `<style>`
   block in `<head>`. This removes the render-blocking request entirely and, on a
   dark-themed page, avoids any flash of unstyled content.
   - **Maintenance:** see CLAUDE.md "Landing CSS exception". Edit `index.css` →
     minify to `index.min.css` → paste that into the `<style>` block in
     `index.html`. `index.min.css` is no longer fetched by the landing page.

2. **Deprioritized the decorative flyby logos** — added
   `fetchpriority="low" decoding="async"` to the five `.flybys img` tags so the
   competitor logos never compete with the critical render.
   - **Deliberately NOT `loading="lazy"`:** those images sit at `left:112%` and
     move via `transform`, so they never enter the layout viewport — `lazy` could
     keep the browser from ever loading them and break the flyby animation.

## Remaining Lighthouse items (all Minor, intentionally not chased)

- *Serve static assets with an efficient cache policy* (~4.5 KB): entirely the
  third-party gtag / Cloudflare Insights scripts — their cache TTL is not ours to
  set. Unfixable, negligible.
- *Defer offscreen images* (~22 KB): the flyby logos. Addressed via
  `fetchpriority=low` instead of `lazy` for the animation reason above; Lighthouse
  still lists it but it does not cost score.
- *JS execution time* (~140 ms): the landing `index.min.js` (canvas FX, taglines,
  counters, Web Audio synth) plus gtag. TBT stays "Good", so not worth splitting.

## How to re-verify

1. Make changes, regenerate `.min` siblings, and (for landing CSS) re-paste into
   the inline `<style>`.
2. **Purge the Cloudflare cache** for the httpjet.net zone (the HTML is edge-cached
   `max-age=3600`, so changes aren't live until purged).
3. Run a Lighthouse / GTmetrix test against `https://httpjet.net/`. Use a warm run
   (run twice; the second hits the edge cache) for the representative score.
4. Locally: `python3 -m http.server` from this dir and load `/` — confirm the page
   renders styled (CSS inlined), the flyby logos still animate, and `index.min.js`
   still loads. (`.htaccess` rules — 404, redirects, headers — only apply under
   the real server.)
