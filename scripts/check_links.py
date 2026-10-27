#!/usr/bin/env python3
"""Offline internal-link check over the staged Cloudflare Pages bundle (.wrangler/dist).

Every href/src/srcset in every HTML page that points at httpjet.net (relative, root-relative
or https://httpjet.net/...) must resolve to a file in the bundle the way Pages serves it
(`/docs/cli` -> docs/cli.html, `/docs/` -> docs/index.html), and a #fragment must match an
id/name on the target page. Links that Pages would answer with a redirect (`.html` suffix,
`/index`) count as defects too, same as `validate_sitemap.py --live`.

Usage: python3 scripts/check_links.py [dist dir]   (exit 1 on any problem)
"""
import os, re, sys
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse, unquote

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, '.wrangler', 'dist'))
SITE = 'https://httpjet.net'
HOSTS = ('httpjet.net', 'www.httpjet.net')


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.refs, self.ids = [], set()

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        for k in ('id', 'name'):
            if a.get(k) and (k == 'id' or tag == 'a'):
                self.ids.add(a[k])
        if tag == 'meta':  # og:url / og:image / twitter:image point at our own host
            if (a.get('property') or a.get('name') or '').endswith((':url', ':image')) and a.get('content'):
                self.refs.append(a['content'])
            return
        for k in ('href', 'src'):
            if a.get(k):
                self.refs.append(a[k])
        if a.get('srcset'):
            self.refs += [c.strip().split()[0] for c in a['srcset'].split(',') if c.strip()]


def url_of(rel):  # file path inside dist -> the URL Pages serves it at
    u = '/' + rel.replace(os.sep, '/')
    if u.endswith('/index.html'):
        return u[:-len('index.html')]
    return u[:-len('.html')] if u.endswith('.html') else u


def resolve(path):  # URL path -> (file inside dist or None, redirect reason or None)
    p = unquote(path)
    if p.endswith('.html'):
        return None, 'Pages redirects *.html to the extensionless URL'
    if p.endswith('/index') or p == '/index':
        return None, 'Pages redirects /index to the directory URL'
    cands = [p + 'index.html'] if p.endswith('/') else [p, p + '.html']
    for c in cands:
        f = os.path.join(DIST, c.lstrip('/'))
        if os.path.isfile(f):
            return f, None
    if not p.endswith('/') and os.path.isfile(os.path.join(DIST, p.lstrip('/'), 'index.html')):
        return None, 'Pages redirects a directory without a trailing slash'
    return None, None


def main():
    if not os.path.isdir(DIST):
        sys.exit(f'FAIL no bundle at {DIST} — run docs-src/build.py first')
    pages = {}
    for d, _, fs in os.walk(DIST):
        for fn in fs:
            if fn.endswith('.html'):
                f = os.path.join(d, fn)
                p = Page()
                with open(f, encoding='utf-8') as fh:
                    p.feed(fh.read())
                pages[f] = p
    errs, checked = [], 0
    for f, p in sorted(pages.items()):
        rel = os.path.relpath(f, DIST)
        base = SITE + url_of(rel)
        for ref in p.refs:
            if ref.startswith(('mailto:', 'tel:', 'data:', 'javascript:', 'blob:')):
                continue
            u = urlparse(urljoin(base, ref))
            if u.scheme not in ('http', 'https') or u.hostname not in HOSTS:
                continue
            if u.path == '/404.html':  # served by Pages as the not-found page, never linked to
                continue
            checked += 1
            if u.path == url_of(rel) or (not u.path and not ref.startswith('/')):
                target, why = f, None
            else:
                target, why = resolve(u.path or '/')
            if why:
                errs.append(f'{rel}: {ref} — {why}')
            elif not target:
                errs.append(f'{rel}: {ref} — no such file in the bundle')
            elif u.fragment and target in pages and unquote(u.fragment) not in pages[target].ids:
                errs.append(f'{rel}: {ref} — no id="{unquote(u.fragment)}" on {os.path.relpath(target, DIST)}')
    for e in errs:
        print('FAIL', e)
    print(f'{len(pages)} pages, {checked} internal references checked, {len(errs)} broken')
    sys.exit(1 if errs else 0)


if __name__ == '__main__':
    main()
