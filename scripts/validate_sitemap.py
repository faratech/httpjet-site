#!/usr/bin/env python3
"""Validate sitemap.xml: schema shape, limits, canonical locs, lastmod format,
and (with --live) that every <loc> answers 200 with no redirect and a matching
canonical tag. Also cross-checks robots.txt and the IndexNow key file."""
import re, sys, urllib.request, urllib.error, xml.etree.ElementTree as ET
from datetime import date

NS = '{http://www.sitemaps.org/schemas/sitemap/0.9}'
SITE = 'https://httpjet.net'
live = '--live' in sys.argv
errs = []

def fail(m): errs.append(m); print('FAIL', m)

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None
opener = urllib.request.build_opener(NoRedirect)

def fetch(u):
    try:
        r = opener.open(urllib.request.Request(u, headers={'User-Agent': 'sitemap-validate'}), timeout=20)
        return r.status, r.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        return e.code, ''

src = fetch(SITE + '/sitemap.xml')[1] if live else open('/web/httpjet/sitemap.xml').read()
try:
    root = ET.fromstring(src)
except ET.ParseError as e:
    sys.exit(f'FAIL not well-formed XML: {e}')
if root.tag != NS + 'urlset': fail('root is not sitemap urlset')
locs = []
for u in root:
    loc = u.findtext(NS + 'loc'); lm = u.findtext(NS + 'lastmod')
    locs.append(loc)
    if not loc or not loc.startswith(SITE + '/'): fail(f'bad loc {loc}')
    if loc and (loc.endswith('.html') or '?' in loc or '#' in loc): fail(f'non-canonical loc {loc}')
    if not lm or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', lm): fail(f'bad lastmod {loc}: {lm}')
    elif date.fromisoformat(lm) > date.today(): fail(f'future lastmod {loc}')
if len(locs) != len(set(locs)): fail('duplicate <loc>')
if len(locs) > 50000 or len(src.encode()) > 50 * 1024 * 1024: fail('exceeds sitemap limits')
print(f'{len(locs)} URLs, {len(src)} bytes')

if live:
    for l in locs:
        code, html = fetch(l)
        if code != 200: fail(f'{l} -> HTTP {code}'); continue
        m = re.search(r'<link rel="canonical" href="([^"]+)"', html)
        if not m or m.group(1) != l: fail(f'{l} canonical mismatch: {m and m.group(1)}')
        if 'noindex' in html.lower().split('</head>')[0] and re.search(r'name="robots"[^>]*noindex', html): fail(f'{l} is noindex')
    rb = fetch(SITE + '/robots.txt')[1]
    if f'Sitemap: {SITE}/sitemap.xml' not in rb: fail('robots.txt missing Sitemap line')
    key = re.search(r"INDEXNOW_KEY = '(\w+)'", open('/web/httpjet/docs-src/build.py').read()).group(1)
    code, body = fetch(f'{SITE}/{key}.txt')
    if code != 200 or body.strip() != key: fail('IndexNow key file not live / mismatched')
print('OK' if not errs else f'{len(errs)} problem(s)')
sys.exit(1 if errs else 0)
