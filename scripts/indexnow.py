#!/usr/bin/env python3
"""Submit changed https://httpjet.net URLs to IndexNow.

IndexNow is a shared protocol: submitting to any participating engine propagates
across the network (Bing, Yandex, Seznam, Naver, Yep, etc.).

Submission strategy:
1. Batch POST JSON to Yandex IndexNow (https://yandex.com/indexnow) which accepts
   multi-URL payloads and fans out across the IndexNow network.
2. Per-URL GET to the central IndexNow endpoint (https://api.indexnow.org/indexnow)
   with full key verification (api.indexnow.org POST parser has a known bug rejecting
   hosts starting with "http" as invalid URLs, whereas GET succeeds 200).
3. Cloudflare Crawler Hints is also active on the zone to broadcast edge updates.

All submitted URLs and keyLocation are strictly HTTPS (https://httpjet.net/...).

  indexnow.py --dry-run     show pending URLs
  indexnow.py               verify key file, submit pending, record receipt
  indexnow.py --all         resubmit every URL
"""
import argparse, json, os, sys, urllib.request, urllib.error, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATE = os.path.join(ROOT, 'indexnow-state.json')
HOST = 'httpjet.net'
KEY = '7b3e5c1a9d4f48e2a6c0b8d1e3f5a79c'
KEY_URL = f'https://{HOST}/{KEY}.txt'
PRIMARY_ENDPOINT = 'https://api.indexnow.org/indexnow'
BATCH_ENDPOINTS = [
    'https://yandex.com/indexnow',
    'https://search.seznam.cz/indexnow',
]

def submit_batch(urls):
    payload = json.dumps({
        'host': HOST,
        'key': KEY,
        'keyLocation': KEY_URL,
        'urlList': urls,
    }).encode('utf-8')
    for ep in BATCH_ENDPOINTS:
        try:
            req = urllib.request.Request(
                ep,
                data=payload,
                headers={'Content-Type': 'application/json; charset=utf-8'},
            )
            resp = urllib.request.urlopen(req, timeout=15)
            print(f'  batch POST {ep} -> HTTP {resp.status}')
        except Exception as e:
            print(f'  batch POST {ep} failed: {e}', file=sys.stderr)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--all', action='store_true')
    a = ap.parse_args()
    state = json.load(open(STATE))
    pending = [u for u, e in state.items() if a.all or e.get('submitted') != e['hash']]
    if not pending:
        print('indexnow: nothing to submit'); return 0
    print(f'indexnow: {len(pending)} URL(s) pending (HTTPS)'); [print('  ' + u) for u in sorted(pending)]
    if a.dry_run: return 0

    try:
        live = urllib.request.urlopen(KEY_URL, timeout=15).read().decode().strip()
    except Exception as e:
        print(f'indexnow: key file not reachable ({e}); deploy first', file=sys.stderr); return 2
    if live != KEY:
        print('indexnow: live key file content mismatch', file=sys.stderr); return 2

    # 1. Multi-URL batch submission to IndexNow network participants
    submit_batch(sorted(pending))

    # 2. Individual URL submission to central api.indexnow.org
    ok = []
    for u in sorted(pending):
        q = urllib.parse.urlencode({'url': u, 'key': KEY, 'keyLocation': KEY_URL})
        try:
            code = urllib.request.urlopen(f'{PRIMARY_ENDPOINT}?{q}', timeout=30).status
        except urllib.error.HTTPError as e:
            code = e.code
        print(f'  GET {PRIMARY_ENDPOINT} -> HTTP {code} {u}')
        if code in (200, 202): ok.append(u)

    for u in ok: state[u]['submitted'] = state[u]['hash']
    json.dump(state, open(STATE, 'w'), indent=1, sort_keys=True)
    return 0 if len(ok) == len(pending) else 1

if __name__ == '__main__':
    sys.exit(main())
