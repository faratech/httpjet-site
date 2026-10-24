#!/usr/bin/env bash
# Build -> deploy to Cloudflare Pages -> purge edge cache -> validate sitemap -> IndexNow ping.
set -euo pipefail
cd "$(dirname "$0")/.."
python3 docs-src/build.py
source /web/.env
CLOUDFLARE_API_KEY="$CLOUDFLARE_GLOBAL_TOKEN" CLOUDFLARE_EMAIL="$CLOUDFLARE_EMAIL" \
  npx wrangler pages deploy .wrangler/dist --project-name httpjet-site --branch main --commit-dirty=true
curl -fsS -X POST "https://api.cloudflare.com/client/v4/zones/eca70844e857e4536077875d442b2d79/purge_cache" \
  -H "X-Auth-Email: $CLOUDFLARE_EMAIL" -H "X-Auth-Key: $CLOUDFLARE_GLOBAL_TOKEN" \
  -H "Content-Type: application/json" --data '{"purge_everything":true}' >/dev/null
sleep 5
python3 scripts/validate_sitemap.py --live
python3 scripts/indexnow.py
