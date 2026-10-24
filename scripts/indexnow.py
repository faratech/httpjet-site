#!/usr/bin/env python3
"""Submit changed httpjet.net URLs to IndexNow (Bing, Yandex, Seznam, Naver, ...).

Reads /web/httpjet/indexnow-state.json (written by docs-src/build.py). A URL is
pending when its content hash differs from the hash recorded at last successful
submission. State advances ONLY on HTTP 200/202. Run AFTER the deploy is live:
the key file must already be reachable at https://httpjet.net/<key>.txt.

  indexnow.py --dry-run     show pending URLs
  indexnow.py               verify key file, submit pending, record receipt
  indexnow.py --all         resubmit every URL
"""
import argparse, json, os, sys, urllib.request, urllib.error, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATE = os.path.join(ROOT, 'indexnow-state.json')
HOST = 'httpjet.net'
ENDPOINT = 'https://api.indexnow.org/indexnow'
KEY = '7b3e5c1a9d4f48e2a6c0b8d1e3f5a79c'
KEY_URL = f'https://{HOST}/{KEY}.txt'

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--all', action='store_true')
    a = ap.parse_args()
    state = json.load(open(STATE))
    pending = [u for u, e in state.items() if a.all or e.get('submitted') != e['hash']]
    if not pending:
        print('indexnow: nothing to submit'); return 0
    print(f'indexnow: {len(pending)} URL(s) pending'); [print('  ' + u) for u in sorted(pending)]
    if a.dry_run: return 0
    try:
        live = urllib.request.urlopen(KEY_URL, timeout=15).read().decode().strip()
    except Exception as e:
        print(f'indexnow: key file not reachable ({e}); deploy first', file=sys.stderr); return 2
    if live != KEY:
        print('indexnow: live key file content mismatch', file=sys.stderr); return 2
    # NOTE: the JSON batch endpoint rejects any host starting with "http" (httpjet.net) as
    # "URL is not valid url" (Bing-side validator bug, verified 2026-10-24: example.net/faratech.dev
    # pass, httpjet.* fail). The per-URL GET form is unaffected, so submit URL-by-URL.
    ok = []
    for u in sorted(pending):
        q = urllib.parse.urlencode({'url': u, 'key': KEY, 'keyLocation': KEY_URL})
        try:
            code = urllib.request.urlopen(f'{ENDPOINT}?{q}', timeout=30).status
        except urllib.error.HTTPError as e:
            code = e.code
        print(f'  HTTP {code} {u}')
        if code in (200, 202): ok.append(u)
    for u in ok: state[u]['submitted'] = state[u]['hash']
    json.dump(state, open(STATE, 'w'), indent=1, sort_keys=True)
    return 0 if len(ok) == len(pending) else 1

if __name__ == '__main__':
    sys.exit(main())
