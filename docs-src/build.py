#!/usr/bin/env python3
"""Assemble /web/httpjet/docs/*.html from body fragments + rendered mermaid SVGs.

pages/<slug>.html   : the inner content of <main class="content"> (no pager/docfoot)
../mmd/src/<n>.mmd  : mermaid sources;  ../mmd/out/<n>.svg : rendered by render.js
Markers inside a body:  <!--diagram:NAME|caption html-->
"""
import html, json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
PAGES = os.path.join(HERE, 'pages')
MMD_SRC = os.path.join(HERE, 'diagrams')
MMD_OUT = os.path.join(HERE, 'rendered')
DOCS = '/web/httpjet/docs'
ASSETS = os.path.join(DOCS, 'assets')
ESBUILD = os.path.join(HERE, 'node_modules', '.bin', 'esbuild')
VERSION = '20261024b'
GA = 'G-ZR4WV214JT'

CSP = ("default-src 'self'; script-src 'self' 'unsafe-inline' ajax.cloudflare.com static.cloudflareinsights.com https://www.googletagmanager.com; "
       "script-src-elem 'self' 'unsafe-inline' ajax.cloudflare.com static.cloudflareinsights.com https://www.googletagmanager.com; "
       "style-src 'self' 'unsafe-inline'; img-src 'self' data: https://static.cloudflareinsights.com https://www.google-analytics.com https://www.googletagmanager.com; "
       "connect-src 'self' https://static.cloudflareinsights.com https://www.google-analytics.com https://www.googletagmanager.com; "
       "font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests")

# (eyebrow, [(slug, nav title, page <title> suffix, description)])
NAV = [
  ('Guide', [
    ('index', 'Overview', 'documentation', 'httpjet is a from-scratch Rust web server and drop-in LiteSpeed replacement: the same XML configuration, native HTTP/2 and HTTP/3, LSAPI PHP, .htaccess rewriting, reverse proxy and FastCGI gateways, and an opt-in origin page cache.'),
    ('quickstart', 'Quickstart', 'quickstart', 'Build httpjet from source, validate a LiteSpeed-compatible configuration tree with check --strict, and serve it on loopback in ten minutes.'),
    ('architecture', 'Architecture', 'architecture', 'The httpjet workspace: 19 hj-* library crates under one binary, the frozen hj-core contract, the io_uring transport bridge, the request pipeline, and configuration generations.'),
    ('capabilities', 'Capabilities &amp; limits', 'capabilities and limits', 'What httpjet supports today, what is optional behind build features, what is deliberately unsupported, and the fixed operational bounds.'),
  ]),
  ('Internals', [
    ('protocols', 'Protocol stacks', 'protocol stacks', 'HTTP/1.1, native HTTP/2 with zero-allocation HPACK, HTTP/3 over QUIC, sendfile and kTLS egress, PROXY protocol, and Unix-socket listeners on one io_uring transport.'),
    ('certificates', 'TLS, ACME &amp; OCSP', 'TLS, ACME and OCSP', 'Certificate selection, mutual TLS with CRLs, resumption policy, opt-in ACME HTTP-01 and DNS-01 issuance, and opt-in OCSP stapling.'),
    ('lsapi', 'LSAPI &amp; PHP', 'LSAPI and PHP', 'The native LSAPI wire codec, the lsphp supervisor, the zero-downtime external pool with generation tracking, the CGI environment, and the fail-closed jail.'),
    ('gateways', 'Proxy &amp; gateways', 'reverse proxy, upstream groups and FastCGI', 'Reverse proxy over h1/h2/h2s, weighted upstream groups with active health checks, WebSocket and SSE relay, and the opt-in FastCGI gateway.'),
    ('rewrite', 'Rewrite &amp; .htaccess', 'rewrite engine and .htaccess', 'The Apache mod_rewrite engine: per-directory loading, the dense-DFA prefilter, directives and flags, access control, Basic auth, header operations, and the fast-path memo.'),
    ('security', 'Security &amp; access control', 'security and access control', 'Client identity, network ACLs, throttling, GeoIP/ASN rules, PROXY protocol trust, request decompression limits, the body budget, the WAF sidecar, and the PHP jail.'),
    ('page-cache', 'Page cache', 'origin page cache', 'The opt-in LSCache-protocol origin page cache: keys, tiers, admission, purge, the file tier, dictionaries, stale policies, capsules, and generation-scoped namespaces.'),
    ('compression', 'Compression', 'compression', 'Response compression with gzip, brotli and zstd, server-priority negotiation, streaming encoders, precompressed siblings, and bounded request decompression.'),
  ]),
  ('Running it', [
    ('configuration', 'Configuration', 'configuration reference', 'The LiteSpeed-compatible XML reference: server, tuning, security, listeners, external processors, upstream groups, virtual hosts, contexts, and httpjet-native extensions.'),
    ('cli', 'CLI reference', 'CLI reference', 'Every httpjet subcommand and serve flag, grouped and filterable, plus the environment variables the binary reads.'),
    ('operations', 'Operations', 'operations and deployment', 'Systemd socket activation, the persistent PHP pool, safe changes, deploy gates, rollback, kill switches, and the hardened OCI example.'),
    ('observability', 'Observability', 'observability', 'Prometheus metrics, the cache-entries report, access and error logs in text or JSON, syslog, request ids, telemetry, the PHP slow log, OpenTelemetry, and profiling.'),
    ('admin-api', 'Admin API &amp; reload', 'admin API and reload', 'SIGHUP reload semantics, the read-only status API, the transactional configuration API, revisions, and the restart-required boundary.'),
    ('extensions', 'Extending httpjet', 'extending httpjet', 'Compile-time extension hooks, the bounded WAF sidecar contract, and why there is no dynamic plugin ABI.'),
    ('performance', 'Performance', 'performance', 'Measured throughput by regime: loopback three-way benchmarks, the origin cache result, production attribution, sendfile and kTLS receipts, and PGO discipline.'),
    ('conformance', 'Conformance &amp; testing', 'conformance and testing', 'h2spec 146/146, RFC coverage, LiteSpeed parity, the test layers, CI interoperability jobs, fuzzing, and the deploy gates.'),
    ('migration', 'Migrating from LiteSpeed', 'migrating from LiteSpeed', 'A validation-first migration path from LiteSpeed or OpenLiteSpeed: inventory, check --strict, isolated candidate, behavioral proof, caching, cutover and rollback.'),
  ]),
]
ORDER = [p for _, ps in NAV for p in ps]
EYEBROW = {p[0]: g for g, ps in NAV for p in ps}

def unesc(s):
    return html.unescape(s)

def read(p):
    with open(p, encoding='utf-8') as f:
        return f.read()

def diagram(m):
    name, _, caption = m.group(1).partition('|')
    svg_path = os.path.join(MMD_OUT, name + '.svg')
    src_path = os.path.join(MMD_SRC, name + '.mmd')
    if not os.path.exists(svg_path):
        sys.exit(f'missing rendered diagram {name}')
    svg = read(svg_path).strip()
    src = read(src_path).strip()
    # drop mermaid's inline max-width so CSS can size it
    svg = re.sub(r'\sstyle="max-width: [^"]*"', '', svg, count=1)
    wide = ' diagram--wide' if src.lstrip().startswith('sequenceDiagram') else ''
    return (f'<figure class="figure diagram{wide}" data-diagram="{name}">{svg}'
            f'<figcaption>{caption}</figcaption>'
            f'<details class="diagram__src"><summary>diagram source (mermaid)</summary><pre><code>{html.escape(src)}</code></pre></details></figure>')


# ---------------------------------------------------------------- charts
# Horizontal grouped bar charts as inline SVG. {name: (title, subtitle, unit, series, rows, foot)}
# rows = [(label, [v0, v1, ...])]; None = no bar (annotated).
CHARTS = {
 'h2-static': ('HTTP/2 static throughput by concurrency', 'dedicated-host loopback · 2026-08-27 · empty bodies · req/s', 'k rps',
   ['httpjet', 'OpenLiteSpeed', 'nginx'],
   [('c=1 (1 KB)', [58, 50, None]), ('c=50', [908, 793, None]), ('c=200', [937, 687, None]), ('c=1000', [860, 878, None])],
   'nginx could not complete the low-concurrency h2 cells in this harness (blank). Source: bench-results/versus5-dedicated-final-20260827.csv'),
 'heavy-rewrite': ('Heavy .htaccess static (806-line chain, /robots.txt)', 'PGO three-way · 2026-08-28 · c=100 · req/s', 'k rps',
   ['httpjet', 'OpenLiteSpeed', 'nginx'],
   [('HTTP/1.1', [168.7, 169.1, 145.6]), ('HTTP/2', [298.0, 283.3, 125.4])],
   'httpjet runs the full .htaccess pipeline on every static request; the default-on fast-path memo is what closes the gap.'),
 'memo-ab': ('Fast-path memo, same binary A/B', 'forum chain · /robots.txt · c=100 · req/s', 'k rps',
   ['memo off', 'memo on'],
   [('HTTP/1.1', [107, 153]), ('HTTP/2', [137, 248])],
   '+43% h1, +81% h2. Byte-identity gate: scripts/fast_memo_parity_test.sh (192 cells, zero differences).'),
 'php-h1': ('PHP over LSAPI, HTTP/1.1', 'loopback · PGO build · 2026-06 · req/s', 'k rps',
   ['httpjet (c=40)', 'LiteSpeed (c=40)', 'LiteSpeed best (c=60)'],
   [('PHP hello-world', [44.8, 38.5, 41.2])],
   'Same hardware, same lsphp binary; LiteSpeed needed higher concurrency to reach its best.'),
 'cache-vs-php': ('One forum page: cache hit vs full PHP render', 'HTTPS loopback · PGO · 152 KB page · req/s', 'rps',
   ['requests / s'],
   [('page-cache HIT (p50 2 ms)', [19912]), ('full DB-backed PHP render (p50 93 ms)', [196])],
   '≈101× the throughput, ≈46× lower latency. The cache removes the backend from the request entirely.'),
 'attribution': ('Where a production request spends its time', 'live sample · 2026-08-30 · mean request 9.99 ms', 'ms',
   ['milliseconds'],
   [('LSAPI TTFB inside PHP', [8.96]), ('everything else (TLS, h2, rewrite 5.4 µs, cache lookup 3.2 µs, log)', [1.03])],
   'httpjet-side CPU is ~0.2% of user-visible latency; the levers are PHP speed and the cache hit ratio.'),
 'sendfile': ('File egress receipts (1 MiB bodies, c=50)', 'loopback · 2026-09-09 · req/s', 'rps',
   ['req/s'],
   [('plaintext H1 sendfile', [4852.5]), ('TLS 1.3 H1, kTLS off (rustls)', [2999.7]), ('TLS 1.3 H1, kTLS forced on (software, virtual NIC)', [2944.9])],
   'Software kTLS on a virtual GVE NIC is the expected-negative case; --ktls=auto refuses virtual NICs for this reason.'),
}

def fmtnum(v):
    return ('%g' % v) if v < 1000 else format(int(round(v)), ',')

def chart(m):
    name = m.group(1)
    title, sub, unit, series, rows, foot = CHARTS[name]
    W = 760; left = 250; right = 80; top = 8; bh = 14; gap = 3; rgap = 14
    n = len(series)
    raw = max(v for _, vs in rows for v in vs if v is not None)
    import math
    mag = 10 ** math.floor(math.log10(raw / 4))
    step = next(c * mag for c in (1, 2, 2.5, 5, 10) if c * mag * 4 >= raw)
    vmax = step * 4 * 1.06
    rowh = n * bh + (n - 1) * gap + rgap
    H = top + len(rows) * rowh + 24
    sx = (W - left - right) / vmax
    out = [f'<div class="chart" data-chart="{name}"><p class="chart__title">{title}</p><p class="chart__sub">{sub}</p>']
    out.append(f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="{html.escape(title)}">')
    # gridlines
    for i in range(1, 5):
        gx = left + step * i * sx
        out.append(f'<line class="grid" x1="{gx:.1f}" y1="{top}" x2="{gx:.1f}" y2="{H-20}"/>')
        out.append(f'<text class="lbl" x="{gx:.1f}" y="{H-6}" text-anchor="middle" style="font-size:10.5px;fill:#8b95ad">{fmtnum(step*i)} {unit}</text>')
    out.append(f'<line class="axis" x1="{left}" y1="{top}" x2="{left}" y2="{H-20}"/>')
    y = top
    for label, vs in rows:
        cy = y + (n * bh + (n - 1) * gap) / 2
        out.append(f'<text class="lbl" x="{left-10}" y="{cy+4:.1f}" text-anchor="end">{html.escape(label)}</text>')
        for i, v in enumerate(vs):
            by = y + i * (bh + gap)
            if v is None:
                out.append(f'<text class="lbl" x="{left+6}" y="{by+bh-3}" style="fill:#8b95ad;font-size:11px">— not completed</text>')
                continue
            w = max(2, v * sx)
            out.append(f'<g><rect class="bar s{i}" x="{left+1}" y="{by}" width="{w:.1f}" height="{bh}"><title>{html.escape(series[i])} · {html.escape(label)}: {fmtnum(v)} {unit}</title></rect>'
                       f'<text class="val" x="{left+1+w+6:.1f}" y="{by+bh-3}">{fmtnum(v)}</text></g>')
        y += rowh
    out.append('</svg>')
    if n > 1:
        out.append('<div class="chart__legend">' + ''.join(f'<span class="s{i}">{html.escape(sname)}</span>' for i, sname in enumerate(series)) + '</div>')
    out.append(f'<p class="chart__foot">{foot}</p>')
    # table view
    out.append('<details class="chart__table"><summary>table view</summary><div class="tablewrap"><table><thead><tr><th></th>' + ''.join(f'<th>{html.escape(sname)}</th>' for sname in series) + '</tr></thead><tbody>')
    for label, vs in rows:
        out.append('<tr><td>' + html.escape(label) + '</td>' + ''.join('<td>' + ('—' if v is None else fmtnum(v) + ' ' + unit) + '</td>' for v in vs) + '</tr>')
    out.append('</tbody></table></div></details></div>')
    return ''.join(out)

def head(slug, title_suffix, desc, nav_title):
    url = 'https://httpjet.net/docs/' + ('' if slug == 'index' else slug + '.html')
    t = f'httpjet — {title_suffix}'
    return f'''<!doctype html>
<html lang="en" class="no-js">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="{CSP}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{t}</title>
<meta name="description" content="{html.escape(desc, quote=True)}">
<meta property="og:title" content="{t}">
<meta property="og:description" content="{html.escape(desc, quote=True)}">
<meta property="og:image" content="https://httpjet.net/og.jpg">
<meta property="og:image:secure_url" content="https://httpjet.net/og.jpg">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="httpjet — a web server, in Rust">
<meta property="og:url" content="{url}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{t}">
<meta name="twitter:description" content="{html.escape(desc, quote=True)}">
<meta name="twitter:image" content="https://httpjet.net/og.jpg">
<link rel="canonical" href="{url}">
<meta name="theme-color" content="#07090f">
<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="assets/docs.min.css?v={VERSION}">
<script defer src="assets/docs-head.min.js?v={VERSION}"></script>
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id={GA}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){{dataLayer.push(arguments);}}
  gtag('js', new Date());

  gtag('config', '{GA}');
</script>
</head>
<body>
'''

NOTICE = ('<div class="callout gotcha construction-notice" role="note" aria-label="Documentation status"><div class="ico" aria-hidden="true">!</div>'
          '<div class="body"><span class="tag">Under construction</span><p>This documentation is still in progress. Some information may be incomplete or out of date. Please check back later.</p></div></div>')

def pager(i):
    prev = ORDER[i-1] if i > 0 else None
    nxt = ORDER[i+1] if i+1 < len(ORDER) else None
    out = '<nav class="pager" aria-label="Pagination">'
    if prev:
        href = './' if prev[0] == 'index' else prev[0] + '.html'
        out += f'<a class="prev" href="{href}"><div class="dir">← Prev</div><div class="ttl">{prev[1]}</div></a>'
    if nxt:
        href = nxt[0] + '.html'
        out += f'<a class="next" href="{href}"{" style=\"margin-left:auto\"" if not prev else ""}><div class="dir">Next →</div><div class="ttl">{nxt[1]}</div></a>'
    return out + '</nav>'

FOOT = ('<p class="docfoot">httpjet · documentation · synced to the source tree on 2026-10-24 (v0.1.5).<br>'
        'Source: <a href="https://github.com/faratech/httpjet">github.com/faratech/httpjet</a> · Home: <a href="https://httpjet.net/">httpjet.net</a> · Found an error? Open an issue on the repository.</p>')

def build_page(i, entry):
    slug, nav_title, suffix, desc = entry
    body = read(os.path.join(PAGES, slug + '.html'))
    body = re.sub(r'<!--diagram:(.*?)-->', diagram, body, flags=re.S)
    body = re.sub(r'<!--chart:([a-z0-9-]+)-->', chart, body)
    crumbs = '' if slug == 'index' else f'<p class="crumbs"><a href="./">Docs</a><span>/</span>{nav_title}</p>\n'
    eyebrow = '' if slug == 'index' else f'<p class="eyebrow">{EYEBROW[slug]}</p>\n'
    out = head(slug, suffix, unesc(desc), nav_title)
    out += '\n<main class="content">\n' + NOTICE + '\n' + crumbs + eyebrow + body.strip() + '\n\n' + pager(i) + '\n' + FOOT + '\n</main>\n'
    out += f'<script defer src="assets/search-index.min.js?v={VERSION}"></script>\n<script defer src="assets/docs.min.js?v={VERSION}"></script>\n</body>\n</html>\n'
    with open(os.path.join(DOCS, slug + '.html'), 'w', encoding='utf-8') as f:
        f.write(out)
    return body

def headings(body):
    hs = []
    for m in re.finditer(r'<h([23]) id="([^"]+)">(.*?)</h\1>', body, flags=re.S):
        text = re.sub(r'<[^>]+>', '', m.group(3)).strip()
        hs.append({'id': m.group(2), 't': unesc(text)})
    return hs

def main():
    index = []
    for i, entry in enumerate(ORDER):
        body = build_page(i, entry)
        slug, nav_title, suffix, desc = entry
        index.append({'url': './' if slug == 'index' else slug + '.html', 'section': EYEBROW[slug], 'title': unesc(nav_title), 'blurb': unesc(desc), 'headings': headings(body)})
    js = '/* httpjet docs — client-side search index. GENERATED by the docs build; one entry per page. Delivered as a script (not fetched) because the zone CSP has no connect-src for XHR. */\nwindow.DOCS_INDEX = ' + json.dumps(index, ensure_ascii=False, indent=1) + ';\n'
    with open(os.path.join(ASSETS, 'search-index.js'), 'w', encoding='utf-8') as f:
        f.write(js)
    # docs-head.js: rewrite the groups array + version selectors
    dh = read(os.path.join(ASSETS, 'docs-head.js'))
    groups_js = 'const groups = [\n' + ',\n'.join(
        '      [' + json.dumps(g) + ', [' + ', '.join(f"['{p[1]}', '{'./' if p[0]=='index' else p[0]+'.html'}']" for p in ps) + ']]'
        for g, ps in NAV) + ',\n    ];'
    dh = re.sub(r'const groups = \[.*?\n    \];', groups_js, dh, flags=re.S)
    dh = re.sub(r'\?v=\d{8}[a-z]', '?v=' + VERSION, dh)
    with open(os.path.join(ASSETS, 'docs-head.js'), 'w', encoding='utf-8') as f:
        f.write(dh)
    # minify
    for src, dst, loader in [('docs.js', 'docs.min.js', 'js'), ('docs-head.js', 'docs-head.min.js', 'js'), ('search-index.js', 'search-index.min.js', 'js'), ('docs.css', 'docs.min.css', 'css')]:
        subprocess.run([ESBUILD, os.path.join(ASSETS, src), '--minify', '--log-level=warning', '--outfile=' + os.path.join(ASSETS, dst)], check=True)
    print('built', len(ORDER), 'pages; version', VERSION)

if __name__ == '__main__':
    main()
