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
VERSION = '20261024n'
GA = 'G-ZR4WV214JT'
SITE = 'https://httpjet.net'
ROOT = '/web/httpjet'
STATE_PATH = os.path.join(ROOT, 'indexnow-state.json')  # committed; NOT deployed (dist is allow-listed)
INDEXNOW_KEY = '7b3e5c1a9d4f48e2a6c0b8d1e3f5a79c'      # public by design (served at /<key>.txt)
import hashlib, datetime
STATE = {}  # url -> {hash, lastmod, submitted}

def load_state():
    global STATE
    try:
        STATE = json.load(open(STATE_PATH))
    except Exception:
        STATE = {}

def touch(url, content):
    """Record a content hash; lastmod only moves when the hash does. Returns lastmod."""
    h = hashlib.sha256(content.encode('utf-8')).hexdigest()
    e = STATE.get(url)
    today = datetime.date.today().isoformat()
    if not e:
        STATE[url] = {'hash': h, 'lastmod': today, 'submitted': None}
    elif e['hash'] != h:
        e.update(hash=h, lastmod=today)
    return STATE[url]['lastmod']

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

def head(slug, title_suffix, desc, nav_title, docs_min_css, lastmod):
    url = 'https://httpjet.net/docs/' + ('' if slug == 'index' else slug)
    nt = unesc(nav_title)
    if slug == 'index':
        t = 'httpjet Documentation — Rust Web Server, LiteSpeed XML, LSAPI PHP & HTTP/3'
    elif nt.lower() == title_suffix.lower():
        t = f'{nt} — httpjet Documentation (Rust Web Server)'
    else:
        ts = title_suffix[:1].upper() + title_suffix[1:]
        t = f'{nt} — httpjet {ts}'
    today = lastmod
    crumbs_ld = [
        {"@type": "ListItem", "position": 1, "name": "httpjet", "item": "https://httpjet.net/"},
        {"@type": "ListItem", "position": 2, "name": "Docs", "item": "https://httpjet.net/docs/"}
    ]
    if slug != 'index':
        crumbs_ld.append({"@type": "ListItem", "position": 3, "name": nt, "item": url})
    graph = [
        {
            "@type": "TechArticle",
            "@id": url + "#article",
            "headline": t,
            "name": nt,
            "articleSection": EYEBROW[slug],
            "description": desc,
            "url": url,
            "datePublished": "2026-06-01",
            "dateModified": today,
            "inLanguage": "en-US",
            "proficiencyLevel": "Expert",
            "author": {"@type": "Organization", "name": "httpjet", "url": "https://httpjet.net/"},
            "publisher": {"@type": "Organization", "name": "httpjet", "url": "https://httpjet.net/"},
            "isPartOf": {"@id": "https://httpjet.net/#website"},
            "about": {"@id": "https://httpjet.net/#software"},
            "image": "https://httpjet.net/og.jpg"
        },
        {
            "@type": "BreadcrumbList",
            "@id": url + "#breadcrumb",
            "itemListElement": crumbs_ld
        }
    ]
    if slug == 'index':
        graph.append({
            "@type": "FAQPage",
            "@id": url + "#faq",
            "mainEntity": [
                {
                    "@type": "Question",
                    "name": "Is httpjet a drop-in replacement for LiteSpeed Web Server?",
                    "acceptedAnswer": {
                        "@type": "Answer",
                        "text": "Yes. httpjet reads the same LiteSpeed XML configuration tree (conf/httpd_config.xml and vhosts/*.xml), speaks the native LSAPI wire protocol to lsphp, evaluates Apache .htaccess files (mod_rewrite, Basic auth, access control, Header, ErrorDocument, LSCache directives), and provides an LSCache-compatible origin page cache."
                    }
                },
                {
                    "@type": "Question",
                    "name": "What transport and HTTP protocols does httpjet support?",
                    "acceptedAnswer": {
                        "@type": "Answer",
                        "text": "httpjet runs on Linux over a single pure-io_uring (monoio) transport and natively serves HTTP/1.1, HTTP/2 (146/146 h2spec conformance with zero-allocation HPACK), and HTTP/3 over QUIC, plus Unix domain sockets and PROXY protocol v1/v2."
                    }
                },
                {
                    "@type": "Question",
                    "name": "How fast is httpjet compared to LiteSpeed, OpenLiteSpeed, and nginx?",
                    "acceptedAnswer": {
                        "@type": "Answer",
                        "text": "In dedicated-host loopback benchmarks, httpjet reaches ~908k–965k req/s on HTTP/2 static workloads (vs OpenLiteSpeed ~793k–878k req/s), 298k–316k req/s on an 806-line .htaccess chain over HTTP/2 (vs OpenLiteSpeed 283.3k and nginx 125.4k), 44.8k–48.6k req/s on PHP over LSAPI (vs LiteSpeed 6.3.5 38.5k–41.2k), and 19,912 req/s on a 152 KB XenForo origin page-cache hit (101x faster than an uncached PHP render)."
                    }
                }
            ]
        })
    elif slug == 'quickstart':
        graph.append({
            "@type": "HowTo",
            "@id": url + "#howto",
            "name": "How to build, validate, and run httpjet from source",
            "description": "Compile the httpjet Rust binary, validate a LiteSpeed-compatible configuration tree with check --strict, and serve on loopback.",
            "step": [
                {"@type": "HowToStep", "position": 1, "name": "Build the binary", "text": "Clone https://github.com/faratech/httpjet.git and run cargo build --release -p httpjet."},
                {"@type": "HowToStep", "position": 2, "name": "Validate configuration", "text": "Run target/release/httpjet --root \"$PWD/examples/litespeed\" check --strict to lint topology and directives."},
                {"@type": "HowToStep", "position": 3, "name": "Serve on loopback", "text": "Run target/release/httpjet --root \"$PWD/examples/litespeed\" serve --http-addr 127.0.0.1:8080 --https-addr \"\" --workers 1 --no-php."},
                {"@type": "HowToStep", "position": 4, "name": "Verify responses and metrics", "text": "Test HTTP/1.1 and h2c responses with curl against 127.0.0.1:8080 and inspect Prometheus metrics on 127.0.0.1:9090/metrics."}
            ]
        })
    elif slug == 'migration':
        graph.append({
            "@type": "HowTo",
            "@id": url + "#howto",
            "name": "How to migrate from LiteSpeed or OpenLiteSpeed to httpjet",
            "description": "A validation-first migration workflow from an existing LiteSpeed XML tree to httpjet with instant rollback.",
            "step": [
                {"@type": "HowToStep", "position": 1, "name": "Inventory the existing XML tree", "text": "Audit listeners, vhosts, .htaccess chains, external processors, and LSCache usage."},
                {"@type": "HowToStep", "position": 2, "name": "Run check --strict", "text": "Run httpjet --root /usr/local/lsws check --strict and resolve any unsupported directives or topology warnings."},
                {"@type": "HowToStep", "position": 3, "name": "Run an isolated candidate on alternate ports", "text": "Start httpjet on alternate loopback ports with a separate --php-socket and HTTPJET_LOG_DIR."},
                {"@type": "HowToStep", "position": 4, "name": "Prove behavioral parity", "text": "Compare status codes, headers, rewrites, and PHP responses between LiteSpeed and the httpjet candidate."},
                {"@type": "HowToStep", "position": 5, "name": "Cut over and monitor", "text": "Switch listener sockets to httpjet + httpjet-lsphp and monitor Prometheus metrics and error logs."}
            ]
        })
    ld = {
        "@context": "https://schema.org",
        "@graph": graph
    }
    ld_json = json.dumps(ld, ensure_ascii=False, separators=(',', ':'))
    esc_t = html.escape(t, quote=True)
    esc_desc = html.escape(desc, quote=True)
    return f'''<!doctype html>
<html lang="en" class="js revealed">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="{CSP}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc_t}</title>
<meta name="description" content="{esc_desc}">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">
<meta property="og:title" content="{esc_t}">
<meta property="og:description" content="{esc_desc}">
<meta property="og:site_name" content="httpjet">
<meta property="og:locale" content="en_US">
<meta property="og:image" content="https://httpjet.net/og.jpg">
<meta property="og:image:secure_url" content="https://httpjet.net/og.jpg">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="{esc_t}">
<meta property="og:url" content="{url}">
<meta property="og:type" content="article">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{esc_t}">
<meta name="twitter:description" content="{esc_desc}">
<meta name="twitter:image" content="https://httpjet.net/og.jpg">
<link rel="canonical" href="{url}">
<link rel="alternate" type="text/markdown" href="{slug}.md" title="{esc_t} (Markdown)">
<link rel="manifest" href="/site.webmanifest">
<script type="application/ld+json">{ld_json}</script>
<meta name="theme-color" content="#07090f">
<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
<style id="hj-docs-css">{docs_min_css}</style>
<!-- Google tag (gtag.js) -->
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){{dataLayer.push(arguments);}}
  gtag('js', new Date());
  gtag('config', '{GA}');
  (function(){{
    var _ap = HTMLHeadElement.prototype.appendChild;
    HTMLHeadElement.prototype.appendChild = function(el){{
      if (el && el.tagName === 'SCRIPT' && /\\/cdn-cgi\\/challenge-platform\\//.test(el.src || '')) return el;
      return _ap.call(this, el);
    }};
    var loaded = false;
    function loadGtag(){{
      if (loaded) return;
      loaded = true;
      var s = document.createElement('script');
      s.async = true;
      s.src = 'https://www.googletagmanager.com/gtag/js?id={GA}';
      _ap.call(document.head, s);
    }}
    ['pointerdown','keydown','touchstart','mousemove','wheel'].forEach(function(ev){{
      window.addEventListener(ev, loadGtag, {{once:true, passive:true}});
    }});
  }})();
</script>
</head>
<body>
'''

HEADER_HTML = '''<a class="skip-link" href="#main-content">Skip to main content</a>
<header class="hdr">
  <div class="wordmark"><a href="./"><b>httpjet</b></a> <span class="seg">·docs</span></div>
  <div class="grow"></div>
  <nav aria-label="Primary">
    <a href="./">Overview</a>
    <a href="quickstart.html" class="hide-sm">Quickstart</a>
    <a href="architecture.html" class="hide-sm">Architecture</a>
    <a href="page-cache.html" class="hide-sm">Page cache</a>
    <a href="cli.html" class="hide-sm">CLI</a>
    <a href="performance.html" class="hide-sm">Performance</a>
    <a href="https://httpjet.net/" class="ext repo">httpjet.net</a>
  </nav>
  <div class="hdr-audio" id="epicPlayer" style="--track-progress:0%" role="group" aria-label="Synth soundtrack player">
    <button class="abtn nav" id="audioPrev" type="button" aria-label="Previous epic track" title="Previous epic track">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h2v14H6zM10 12l8-7v14z"/></svg>
    </button>
    <button class="abtn main" id="audio" type="button" aria-label="Play epic music" aria-pressed="false" title="Epic mode synth soundtrack">
      <span class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
    </button>
    <button class="abtn nav" id="audioNext" type="button" aria-label="Next epic track" title="Next epic track">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 5h2v14h-2zM6 5l8 7-8 7z"/></svg>
    </button>
    <div class="audio-meta">
      <span class="track" id="audioTrack">10-track sequence</span>
      <span class="time" id="audioTime">2-5 min synths</span>
    </div>
    <label class="volume" title="Volume">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.1-3.8v7.6a4.5 4.5 0 0 0 2.1-3.8z"/></svg>
      <input id="audioVolume" type="range" min="0" max="6" step="0.1" value="6" aria-label="Volume">
    </label>
  </div>
  <a class="ghbtn" href="https://github.com/faratech/httpjet" aria-label="GitHub repository" title="faratech/httpjet on GitHub"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg><span>GitHub</span></a>
  <button class="searchbtn" aria-label="Search docs">search <kbd>/</kbd></button>
  <button class="menubtn" aria-label="Menu" aria-expanded="false">☰</button>
</header>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<div class="scrim" aria-hidden="true"></div>'''

TOC_HTML = '''<aside class="tocwrap">
  <div class="toc-title">On this page</div>
  <nav class="toc" aria-label="On this page"></nav>
</aside>'''

SEARCH_OV_HTML = '''<div class="search-ov" role="dialog" aria-modal="true" aria-label="Search docs">
  <div class="search-box">
    <input type="text" placeholder="Search the docs…" aria-label="Search the docs" autocomplete="off" spellcheck="false">
    <div class="search-res"></div>
  </div>
</div>'''

def sidebar_html(active_slug):
    parts = ['<nav class="sidebar" aria-label="Documentation sections">']
    for eyebrow, links in NAV:
        parts.append(f'<div class="nav-group"><span class="nav-eyebrow">{eyebrow}</span>')
        for p_slug, label, _, _ in links:
            href = './' if p_slug == 'index' else p_slug
            act = ' active' if p_slug == active_slug else ''
            parts.append(f'<a class="nav-link{act}" href="{href}">{label}</a><div class="nav-sub"></div>')
        parts.append('</div>')
    parts.append('<div class="nav-group"><span class="nav-eyebrow">Source</span><a class="nav-link" href="https://github.com/faratech/httpjet">GitHub · faratech/httpjet ↗</a></div>')
    parts.append('</nav>')
    return ''.join(parts)

def pager(i):
    prev = ORDER[i-1] if i > 0 else None
    nxt = ORDER[i+1] if i+1 < len(ORDER) else None
    out = '<nav class="pager" aria-label="Pagination">'
    if prev:
        href = './' if prev[0] == 'index' else prev[0]
        out += f'<a class="prev" href="{href}"><div class="dir">← Prev</div><div class="ttl">{prev[1]}</div></a>'
    if nxt:
        href = nxt[0]
        out += f'<a class="next" href="{href}"{" style=\"margin-left:auto\"" if not prev else ""}><div class="dir">Next →</div><div class="ttl">{nxt[1]}</div></a>'
    return out + '</nav>'

FOOT = ('<p class="docfoot">httpjet · documentation · synced to the source tree on 2026-10-24 (v0.1.5).<br>'
        'Source: <a href="https://github.com/faratech/httpjet">github.com/faratech/httpjet</a> · Home: <a href="https://httpjet.net/">httpjet.net</a> · Found an error? Open an issue on the repository.</p>')

SLUGS = None
def canon_links(h):
    """Rewrite internal doc links to their canonical extensionless URLs so no click costs a 308."""
    global SLUGS
    if SLUGS is None:
        SLUGS = '|'.join(re.escape(x[0]) for x in ORDER)
    def sub(m):
        slug, frag = m.group(2), m.group(3) or ''
        return f'{m.group(1)}"' + ('./' if slug == 'index' else slug) + frag + '"'
    return re.sub(r'((?:xlink:)?href=)"(?:/docs/)?(' + SLUGS + r')\.html(#[^"]*)?"', sub, h)

def build_page(i, entry, docs_min_css):
    slug, nav_title, suffix, desc = entry
    raw_body = read(os.path.join(PAGES, slug + '.html'))
    body = re.sub(r'<!--diagram:(.*?)-->', diagram, raw_body, flags=re.S)
    body = re.sub(r'<!--chart:([a-z0-9-]+)-->', chart, body)
    body = canon_links(body)
    crumbs = f'<p class="crumbs"><a href="./">Docs</a><span>/</span>{nav_title}</p>'
    eyebrow = '' if slug == 'index' else f'<p class="eyebrow">{EYEBROW[slug]}</p>'
    page_bar = (
        f'<div class="page-bar">'
        f'<div class="page-bar__left">{crumbs}{eyebrow}</div>'
        f'<div class="page-tools">'
        f'<button type="button" class="mdcopy" data-md="{slug}.md" title="Copy clean Markdown of this page for LLMs">Copy Markdown</button>'
        f'<a class="mdraw" href="{slug}.md" target="_blank" rel="noopener" title="View raw Markdown (.md)">Raw .md</a>'
        f'</div></div>\n'
    )
    page_url = SITE + '/docs/' + ('' if slug == 'index' else slug)
    lastmod = touch(page_url, nav_title + '\0' + desc + '\0' + body)
    out = head(slug, suffix, unesc(desc), nav_title, docs_min_css, lastmod)
    out += canon_links(HEADER_HTML) + '\n<div class="shell">\n' + sidebar_html(slug) + '\n<main class="content" id="main-content">\n' + page_bar + body.strip() + '\n\n' + pager(i) + '\n' + FOOT + '\n</main>\n' + TOC_HTML + '\n</div>\n' + SEARCH_OV_HTML + '\n'
    out += f'<script defer src="assets/docs.min.js?v={VERSION}"></script>\n</body>\n</html>\n'
    with open(os.path.join(DOCS, slug + '.html'), 'w', encoding='utf-8') as f:
        f.write(out)
    # Write individual per-page .md endpoint
    loc = 'https://httpjet.net/docs/' if slug == 'index' else f'https://httpjet.net/docs/{slug}'
    md_doc = (
        f'# {unesc(nav_title)} — httpjet Documentation\n\n'
        f'> {unesc(desc)}\n\n'
        f'- **Canonical URL:** {loc}\n'
        f'- **Source Repository:** https://github.com/faratech/httpjet\n\n'
        f'---\n\n'
        + html_to_md(raw_body) + '\n'
    )
    with open(os.path.join(DOCS, slug + '.md'), 'w', encoding='utf-8') as f:
        f.write(md_doc)
    return body, raw_body

def html_to_md(raw_html):
    s = re.sub(r'<!--diagram:([a-z0-9-]+)\|(.*?)-->', lambda m: f'\n> [Diagram: {m.group(1)}] {unesc(re.sub(r"<[^>]+>", "", m.group(2)))}\n', raw_html, flags=re.S)
    s = re.sub(r'<!--chart:([a-z0-9-]+)-->', lambda m: f'\n> [Benchmark Chart: {m.group(1)} — {CHARTS[m.group(1)][0]} ({CHARTS[m.group(1)][1]})]\n', s)
    s = re.sub(r'<div class="(?:rail|filterbar|bexp__fallback)"[^>]*>.*?</div>', '', s, flags=re.S)
    s = re.sub(r'<h1[^>]*>(.*?)</h1>', lambda m: '\n# ' + unesc(re.sub(r'<[^>]+>', '', m.group(1))).strip() + '\n', s, flags=re.S)
    s = re.sub(r'<h2[^>]*>(.*?)</h2>', lambda m: '\n## ' + unesc(re.sub(r'<[^>]+>', '', m.group(1))).strip() + '\n', s, flags=re.S)
    s = re.sub(r'<h3[^>]*>(.*?)</h3>', lambda m: '\n### ' + unesc(re.sub(r'<[^>]+>', '', m.group(1))).strip() + '\n', s, flags=re.S)
    s = re.sub(r'<h4[^>]*>(.*?)</h4>', lambda m: '\n#### ' + unesc(re.sub(r'<[^>]+>', '', m.group(1))).strip() + '\n', s, flags=re.S)
    s = re.sub(r'<pre><code>(.*?)</code></pre>', lambda m: '\n```\n' + unesc(re.sub(r'<[^>]+>', '', m.group(1))).strip() + '\n```\n', s, flags=re.S)
    s = re.sub(r'<code>(.*?)</code>', lambda m: '`' + unesc(re.sub(r'<[^>]+>', '', m.group(1))) + '`', s, flags=re.S)
    s = re.sub(r'<strong>(.*?)</strong>|<b>(.*?)</b>', lambda m: '**' + unesc(re.sub(r'<[^>]+>', '', m.group(1) or m.group(2) or '')) + '**', s, flags=re.S)
    s = re.sub(r'<em>(.*?)</em>|<i>(.*?)</i>', lambda m: '*' + unesc(re.sub(r'<[^>]+>', '', m.group(1) or m.group(2) or '')) + '*', s, flags=re.S)
    s = re.sub(r'<li[^>]*>(.*?)</li>', lambda m: '\n- ' + ' '.join(unesc(re.sub(r'<[^>]+>', ' ', m.group(1))).split()), s, flags=re.S)
    s = re.sub(r'<tr[^>]*>(.*?)</tr>', lambda m: '\n| ' + ' | '.join(' '.join(unesc(re.sub(r'<[^>]+>', ' ', c)).split()) for c in re.findall(r'<t[hd][^>]*>(.*?)</t[hd]>', m.group(1), flags=re.S)) + ' |', s, flags=re.S)
    s = re.sub(r'<dt[^>]*>(.*?)</dt>\s*<dd[^>]*>(.*?)</dd>', lambda m: '\n- **' + unesc(re.sub(r'<[^>]+>', '', m.group(1))).strip() + '**: ' + ' '.join(unesc(re.sub(r'<[^>]+>', ' ', m.group(2))).split()), s, flags=re.S)
    s = re.sub(r'<p[^>]*>(.*?)</p>', lambda m: '\n' + ' '.join(unesc(re.sub(r'<[^>]+>', ' ', m.group(1))).split()) + '\n', s, flags=re.S)
    s = re.sub(r'<[^>]+>', ' ', s)
    s = unesc(s)
    lines = [ln.rstrip() for ln in s.splitlines()]
    cleaned = []
    blank = 0
    for ln in lines:
        if not ln.strip():
            blank += 1
            if blank <= 1:
                cleaned.append('')
        else:
            blank = 0
            cleaned.append(ln)
    return '\n'.join(cleaned).strip()

def headings(body):
    hs = []
    matches = list(re.finditer(r'<h([23]) id="([^"]+)">(.*?)</h\1>', body, flags=re.S))
    for idx, m in enumerate(matches):
        text = re.sub(r'<[^>]+>', '', m.group(3)).strip()
        start = m.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(body)
        chunk = body[start:end]
        # Extract code tokens (flags, directives, metrics, crates) from this section
        seen = []
        seen_set = set()
        for cm in re.finditer(r'<code>(.*?)</code>', chunk, flags=re.S):
            raw = unesc(re.sub(r'<[^>]+>', '', cm.group(1))).strip()
            if not raw or len(raw) > 64 or '\n' in raw:
                continue
            for tok in re.findall(r'--[a-z0-9-]+|[A-Za-z_][A-Za-z0-9_.:-]{2,}', raw):
                tl = tok.lower()
                if tl not in seen_set:
                    seen_set.add(tl)
                    seen.append(tok)
        entry = {'id': m.group(2), 't': unesc(text)}
        if seen:
            entry['kw'] = ' '.join(seen[:48])
        hs.append(entry)
    return hs

def main():
    load_state()
    # minify docs.css first so we can inline docs.min.css into every page <head>
    subprocess.run([ESBUILD, os.path.join(ASSETS, 'docs.css'), '--minify', '--log-level=warning', '--outfile=' + os.path.join(ASSETS, 'docs.min.css')], check=True)
    docs_min_css = read(os.path.join(ASSETS, 'docs.min.css')).strip()
    index = []
    raw_pages = []
    for i, entry in enumerate(ORDER):
        body, raw_body = build_page(i, entry, docs_min_css)
        slug, nav_title, suffix, desc = entry
        raw_pages.append((slug, unesc(nav_title), unesc(desc), raw_body))
        index.append({'url': './' if slug == 'index' else slug, 'section': EYEBROW[slug], 'title': unesc(nav_title), 'blurb': unesc(desc), 'headings': headings(body)})
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
    # sync 404.html asset version
    p404 = '/web/httpjet/404.html'
    if os.path.exists(p404):
        s404 = re.sub(r'docs\.min\.css\?v=[^"]+', 'docs.min.css?v=' + VERSION, read(p404))
        with open(p404, 'w', encoding='utf-8') as f:
            f.write(s404)
    # landing page: hash index.html with cache-bust queries stripped so a pure version bump is not a "change"
    landing = re.sub(r'\?v=\w+', '', read(os.path.join(ROOT, 'index.html')))
    touch(SITE + '/', landing)
    # generate canonical sitemap.xml: lastmod = real content-change date (not build date)
    smap = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    urls = [SITE + '/'] + [SITE + '/docs/' + ('' if slug == 'index' else slug) for slug, _, _, _ in ORDER]
    for loc in urls:
        smap.append(f'  <url>\n    <loc>{loc}</loc>\n    <lastmod>{STATE[loc]["lastmod"]}</lastmod>\n  </url>')
    smap.append('</urlset>\n')
    with open(os.path.join(ROOT, 'sitemap.xml'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(smap))
    # IndexNow key file (must live at /<key>.txt on the host) + persist state
    with open(os.path.join(ROOT, INDEXNOW_KEY + '.txt'), 'w') as f:
        f.write(INDEXNOW_KEY)
    for k in [k for k in STATE if k not in urls]:
        del STATE[k]
    with open(STATE_PATH, 'w') as f:
        json.dump(STATE, f, indent=1, sort_keys=True)
    # generate /llms.txt and /llms-full.txt for AI search engines
    llms = [
        '# httpjet',
        '',
        '> httpjet is a from-scratch Linux web server written in Rust (v0.1.5, Rust 1.99.1+, edition 2024, GPL-3.0-only) built as a drop-in replacement for LiteSpeed Web Server (LSWS 6.3.5) and OpenLiteSpeed. It reads the same LiteSpeed XML configuration (`httpd_config.xml` + per-vhost XML), speaks native LSAPI to `lsphp`, evaluates Apache `.htaccess` (`mod_rewrite`, Basic auth, access control, headers, expires, LSCache directives) with a dense-DFA prefilter and on-core `fast_memo`, and serves HTTP/1.1, HTTP/2 (146/146 `h2spec`), and HTTP/3 (QUIC) over a single pure-`io_uring` (`monoio`) transport with an LSCache-equivalent origin page cache.',
        '',
        '## Key Facts & Benchmarks',
        '',
        '- **HTTP/2 Static Throughput (loopback, c=50 / c=200):** ~908k–937k req/s vs OpenLiteSpeed ~793k req/s',
        '- **Heavy 806-line `.htaccess` Static (c=100, PGO):** 298k req/s HTTP/2, 168.7k req/s HTTP/1.1 (vs nginx 125.4k / 145.6k)',
        '- **Origin Page Cache Hit vs Full PHP Render:** 19,912 req/s (p50 2 ms) vs 196 req/s (p50 93 ms) — 101× speedup',
        '- **PHP over LSAPI (HTTP/1.1, c=40, PGO):** 44.8k req/s vs LiteSpeed 6.3.5 38.5k req/s (41.2k at c=60)',
        '- **Production Latency Attribution:** httpjet CPU is ~0.2% of request wall time (~138 µs/req, ~38 µs/cache hit); PHP renders account for 86.5–98.8%',
        '- **Full Documentation Corpus (single file):** [https://httpjet.net/llms-full.txt](https://httpjet.net/llms-full.txt)',
        '- **Source Repository:** [https://github.com/faratech/httpjet](https://github.com/faratech/httpjet)',
        ''
    ]
    for group_name, entries in NAV:
        llms.append(f'## {group_name}')
        llms.append('')
        for slug, nav_title, _, desc in entries:
            loc = 'https://httpjet.net/docs/' if slug == 'index' else f'https://httpjet.net/docs/{slug}'
            llms.append(f'- [{unesc(nav_title)}]({loc}): {unesc(desc)}')
        llms.append('')
    with open('/web/httpjet/llms.txt', 'w', encoding='utf-8') as f:
        f.write('\n'.join(llms))

    llms_full = [
        '# httpjet — Complete Technical Documentation (v0.1.5)',
        '',
        'Canonical URL: https://httpjet.net/docs/',
        'Source Repository: https://github.com/faratech/httpjet',
        ''
    ]
    for slug, nav_title, desc, raw_body in raw_pages:
        loc = 'https://httpjet.net/docs/' if slug == 'index' else f'https://httpjet.net/docs/{slug}'
        llms_full.append('=' * 78)
        llms_full.append(f'PAGE: {nav_title} ({loc})')
        llms_full.append(f'SUMMARY: {desc}')
        llms_full.append('=' * 78)
        llms_full.append('')
        llms_full.append(html_to_md(raw_body))
        llms_full.append('')
    with open('/web/httpjet/llms-full.txt', 'w', encoding='utf-8') as f:
        f.write('\n'.join(llms_full))

    # minify JS assets
    for src, dst, loader in [('docs.js', 'docs.min.js', 'js'), ('docs-head.js', 'docs-head.min.js', 'js'), ('search-index.js', 'search-index.min.js', 'js')]:
        subprocess.run([ESBUILD, os.path.join(ASSETS, src), '--minify', '--log-level=warning', '--outfile=' + os.path.join(ASSETS, dst)], check=True)

    # stage clean Cloudflare Pages bundle in /web/httpjet/.wrangler/dist (excludes docs-src, CLAUDE.md, .htaccess, unminified sources)
    import shutil
    dist = '/web/httpjet/.wrangler/dist'
    if os.path.exists(dist):
        shutil.rmtree(dist)
    os.makedirs(os.path.join(dist, 'assets', 'logos'), exist_ok=True)
    os.makedirs(os.path.join(dist, 'docs', 'assets'), exist_ok=True)
    for rf in ('index.html', '404.html', 'index.min.css', 'index.min.js', 'og.jpg', 'robots.txt', 'sitemap.xml', 'llms.txt', 'llms-full.txt', 'site.webmanifest', INDEXNOW_KEY + '.txt', '_headers', '_redirects'):
        src_p = os.path.join('/web/httpjet', rf)
        if os.path.exists(src_p):
            shutil.copy2(src_p, os.path.join(dist, rf))
    for lf in os.listdir('/web/httpjet/assets/logos'):
        shutil.copy2(os.path.join('/web/httpjet/assets/logos', lf), os.path.join(dist, 'assets', 'logos', lf))
    for df in os.listdir(DOCS):
        if df.endswith(('.html', '.md')):
            shutil.copy2(os.path.join(DOCS, df), os.path.join(dist, 'docs', df))
    for af in ('docs.min.css', 'docs.min.js', 'search-index.min.js', 'favicon.svg'):
        shutil.copy2(os.path.join(ASSETS, af), os.path.join(dist, 'docs', 'assets', af))

    print('built', len(ORDER), 'pages + clean Pages dist; version', VERSION)

if __name__ == '__main__':
    main()
