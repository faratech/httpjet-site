# Rewrite & .htaccess — httpjet Documentation

> The Apache mod_rewrite engine: per-directory loading, the dense-DFA prefilter, directives and flags, access control, Basic auth, header operations, and the fast-path memo.

- **Canonical URL:** https://httpjet.net/docs/rewrite
- **Source Repository:** https://github.com/faratech/httpjet

---

# Rewrite engine & .htaccess

`hj-rewrite` is httpjet's Apache **mod_rewrite** / `.htaccess` engine — depending only on `hj-compress` so `.htaccess` and XML expiry directives share one `A/M` time grammar. It prefers a linear-time regex engine and falls back to **`fancy-regex`** only for the lookaround and backreferences real `.htaccess` files use. The same crate enforces per-directory access control, scoped Basic auth, header operations, expiry rules and the LSCache directives.

        resolve    acl    rewrite    cache    dispatch    finalize    store

## Overview

The rewrite stage runs the vhost's inline ` ` rules first, then the `.htaccess` chain for the resolved directory — OpenLiteSpeed's order. One entry point, `evaluate()`, returns exactly one outcome per pass: `Rewritten`, `Redirect`, `Proxy`, `Forbidden`, `Gone` or `Unchanged`.

> [Diagram: rewrite-eval] One evaluation pass. A rewrite that crosses into another directory reloads the destination chain and evaluates again; a terminal flag stops the walk; an exhausted chain returns Unchanged and dispatch falls through to suffix routing.

## Per-directory loading

An `HtaccessCache` loads each directory's file (name from `accessFileName`, default `.htaccess`; bare file names only — `/` and `..` are rejected) with **mtime invalidation**, so an edit takes effect on the next request without a reload. The parsed form holds the directive list, compiled regexes, scoping blocks, a per-file memo of which access rules match, the auth realm map and the memo-eligibility verdict. The chain from docroot to the request's directory is bounded at **64** levels; past that a deny-all sentinel applies. Since 2026-09-16 an **unreadable or non-UTF-8 `.htaccess` also fails closed** to that sentinel rather than being skipped.

Vhost-level switches: ` 0` disables the whole chain (even with `autoLoadHtaccess`), while `autoLoadHtaccess` alone loads files without enabling general overrides. Candidate configuration generations own their own htaccess, rewrite-outcome and UA caches, so a reload never reintroduces stale results.

## The dense-DFA prefilter

Rather than test every rule's regex per request, the eligible patterns compile once into **one fully-determinized dense DFA** (`regex_automata::dfa::dense`) searched a single time to learn *which* rules could match. Only those run for real. A dense DFA holds no lazy transition state, so the search is **cacheless**: no per-search cache allocation and no cross-thread pool lock — one mutex fewer on the request path at high concurrency.

           **hot path** · prefilter, then evaluate
```
let hits = prefilter.search(path);          // which rules *could* match — one DFA pass
for rule in hits {
    if let Some(m) = rule.regex.find(path) { return rule.apply(m); }   // substitute + flags
}
Outcome::Unchanged
```

## Linear vs backtracking matching

A flagged rule runs through a `CompiledRegex` that prefers `regex_automata::meta::Regex` with an explicit thread-local cache keyed per pattern, and falls back to `fancy-regex` only for constructs the linear engine cannot express. The split is exact, not approximate: a pattern the linear engine accepts has identical match semantics under both, so the choice is invisible.

| Pattern shape | Engine | Why |

| Anchors, classes, alternation, repetition | `regex_automata::meta` | Linear time; per-pattern thread-local cache, no shared lock. |

| Lookahead `(?=…)` / `(?!…)`, lookbehind | `fancy-regex` | Not expressible as a finite automaton. |

| In-pattern backreference `\1` | `fancy-regex` | Requires backtracking. |

A regex that errors at match time **fails closed toward the rule's polarity**: a deny that cannot evaluate counts as matched; an allow that cannot evaluate is withheld (hardened 2026-09-06 alongside the spoofing checks).

## Rewrite-outcome cache & UA classification

For chains whose inputs are *path-cacheable*, the whole rewrite decision is memoized for `--rewrite-outcome-ttl-ms` (default 1000 ms — which also bounds `-f`/`-d` filesystem staleness and lets `.htaccess` edits land within a second; 0 disables). The key is vhost/scheme/method/host/path/query plus any keyable header variables the chain reads. Counters: `httpjet_rewrite_outcome_{hits,misses,uncacheable}_total`.

`--rewrite-ua-classify` (default off, a deploy-time decision) keys User-Agent-reading chains by the *bitmap of matching UA RewriteConds* instead of the raw UA string, when parse-time analysis proves the outcome depends on the UA only through those matches. Real-world UA diversity collapses onto a handful of entries (`httpjet_rewrite_ua_classify_entries`). Since 2026-09-06 header-dependency collection continues past the UA classification so a chain that also reads Origin or Accept keys correctly.

## The fast-path memo and chain eligibility

The on-core **finished-response memo** (default on; `--no-fast-memo` / `HJ_FAST_MEMO=0`) serves repeat cookieless static GETs without running the pipeline at all — per thread, 1 s TTL, 64 MiB/worker, only for 200 full bodies without `Set-Cookie`, and only after each distinct key has passed the full pipeline once. Whether a docroot's chain is eligible is a **parse-time verdict** (`MemoClass`, fail-closed) that `httpjet check` prints per vhost.

> [Diagram: memo-eligibility] Memo eligibility. A chain that reads anything the memo key cannot carry — client/server addresses, protocol, IP/env/host access operands, REDIRECT_STATUS, %{HTTP_COOKIE}, %{TIME*} — is ineligible and pays the full pipeline every time. Eligible chains memoize with a VARY-SET of every header the chain reads (raw Origin, UA bitmap …), so an 800-line forum chain still memoizes.

        ⎁   Measured
Same-binary A/B on the forum's 806-line docroot chain (`/robots.txt`, c=100): **h2 137k → 248k req/s (+81%)**, **h1 107k → 153k (+43%)**. The byte-identity gate `scripts/fast_memo_parity_test.sh` diffs a UA × Origin × Accept-Encoding × scheme matrix memo-on vs memo-off (192 cells, zero differences at the last three review rounds).
 PGO · 2026-08-28 · parity re-run 2026-09-16

Interactive · `.htaccess` & `fast_memo` readiness inspector

         Paste or edit an `.htaccess` snippet to inspect `MemoClass` eligibility, `VARY-SET` headers, regex engine split, and directive support:
           RewriteEngine On
SetEnvIfNoCase User-Agent "SemrushBot|AhrefsBot|MJ12bot" bad_bot=1
RewriteCond %{ENV:bad_bot} =1
RewriteRule ^ - [F,L]

Header always set Access-Control-Allow-Origin "https://windowsforum.com" env=CORS_OK
RewriteCond %{HTTP:Origin} ^https://(www\.)?windowsforum\.com$ [NC]
RewriteRule ^ - [E=CORS_OK:1]

RewriteCond %{REQUEST_FILENAME} -f [OR]
RewriteCond %{REQUEST_FILENAME} -d
RewriteRule ^ - [L]
RewriteRule ^ index.php [L]

Mirrors the parse-time `MemoClass` analysis printed by `httpjet --root /usr/local/lsws check`.

## SetEnvIf & lazy headers

`SetEnvIf` / `SetEnvIfNoCase` evaluate with **lazy header access**: the engine hands each rule a callback that materializes headers only if the rule references one, and the attribute compare is case-insensitive without allocating a lowercased copy. A request matching no rule pays nothing. Since 2026-09-16, `SetEnvIf`/`[E=]` cannot set server-computed CGI names (`REMOTE_ADDR`, `HTTPS`, `CONTENT_LENGTH`, …) — those writes are denied.

           **.htaccess** · SetEnvIf
```
SetEnvIfNoCase User-Agent "bot|crawler" is_bot=1
SetEnvIf Request_URI "\.(?:png|jpg|css|js)$" is_asset=1
RewriteCond %{ENV:is_bot} =1
RewriteRule ^/expensive/ - [E=no-cache:1]      # [E=no-cache] also bypasses the page cache
```

## Front-controller routing

XenForo, WordPress and most PHP frameworks rewrite *every* URL to `/index.php`. The engine keeps the **original `REQUEST_URI`** and pins the resolved script separately (`SCRIPT_FILENAME` via the `LsapiScript` extension, `SCRIPT_NAME`/`QUERY_STRING` into the env). PHP sees the front controller; everything downstream still sees the URL the visitor asked for — which is why the page cache keys by the original URI .

## Access control

` ` / ` ` / ` ` / ` ` / ` ` scoping carries `Order` / `Allow from` / `Deny from` and `Require`, ANDed across every enclosing block. A ` ` deny applies to the directory **and everything beneath it**. `Require all granted` grants; `Require all denied` and every other predicate (`ip`, `host`, `env`, `expr`, `method`, …) **fails closed to deny** rather than being approximated — a shipped auth file that httpjet cannot honor 403s rather than opening up. Directory patterns accept mapped filesystem paths as well as the docroot-relative convention.

## HTTP Basic auth

`AuthType Basic` + `AuthName` + `AuthUserFile` + `Require valid-user | user …` protect a subtree. Since the 2026-09-06 review the model separates parsed policy from the effective realm: requirements resolve in order across scopes, a metadata-only section cannot erase an inherited requirement, an explicit `Require` replaces it, exact usernames are preserved, and the realm is enforced against the original, rewritten, index, script/PATH_INFO and canonical filesystem targets **before cache lookup**, with a served-target backstop. Unsupported or incomplete active auth fails closed. Valid credentials set `REMOTE_USER`; failures return 401 with the challenge.

           **.htaccess** · a protected subtree
```
AuthType Basic
AuthName "Staging"
AuthUserFile /srv/example.test/conf/htpasswd
Require valid-user
```

htpasswd hashes: **bcrypt** (`$2y$`/`$2b$`/`$2a$`, `htpasswd -B`, cost capped at 14 — a higher cost is refused before hashing), **APR1-MD5** (`$apr1$`), **MD5-crypt** (`$1$`) and `{SHA}`, verified in constant time; an unknown user pays dummy bcrypt/MD5 work at the file's recorded cost, so user enumeration costs nothing, and Basic-auth attempts are charged per client before hashing (repeated `Authorization` headers are refused). Plaintext entries and traditional DES / `$5$` / `$6$` `crypt()` hashes verify *false* with a parse-time warning. The `AuthUserFile` must resolve **inside the vhost docroot** — or a directory listed in `--auth-user-file-roots` — checked on the opened descriptor's real path (symlinks followed, `.`/`..` rejected in relative paths, read capped at 1 MiB, a planted FIFO cannot block the open); an unreadable or out-of-root file is a 500 with an error-log entry, never a silent 401, and `check` warns about out-of-root paths. Authenticated static responses get `Cache-Control: private, no-store` from automatic expiry when no explicit policy exists (#414).

## Directives reference

| Directive | Status | Notes |

| RewriteEngine · RewriteBase | supported | Toggle and base-path resolution. |

| RewriteCond · RewriteRule | supported | Flags: `L END R R=code F G P PT E= N NC QSA QSD NE C S=n`, `OR` on conditions; `-f -d -l -s -x` file tests. Variables: `REQUEST_URI REQUEST_FILENAME REQUEST_METHOD REQUEST_SCHEME QUERY_STRING THE_REQUEST HTTPS HTTP_HOST HTTP_USER_AGENT HTTP_COOKIE HTTP_REFERER HTTP_ACCEPT REMOTE_ADDR REMOTE_PORT SERVER_ADDR SERVER_NAME SERVER_PORT SERVER_PROTOCOL DOCUMENT_ROOT SCRIPT_FILENAME`, `%{HTTP:Name}`, `%{ENV:NAME}`, `%{LA-U:…}`/`%{LA-F:…}`. `%{TIME*}` and map lookups yield the empty string. Unknown flags are ignored, as Apache does. |

| SetEnvIf · SetEnvIfNoCase | supported | Lazy header access; server-computed CGI names are protected. |

| Order · Allow from · Deny from | supported | Apache accumulation per scope; `env=`, host and CIDR operands (host/env/IP operands make the chain memo-ineligible). |

| Require | partial | `all granted`, `valid-user`, `user …`. Everything else fails closed to deny. |

| AuthType · AuthName · AuthUserFile | supported | Basic only; bcrypt, APR1 (`$apr1$`), MD5-crypt (`$1$`) and `{SHA}` hashes. |

| Header set / add / append / merge / unset / setifempty | supported | `always`/`onsuccess`, case-insensitive `env=`/`env=!` guards, `%{NAME}e` interpolation, ` `/` `/` ` scopes (merged in Apache order: directory-level across the chain, then ` ` against the resolved target file, then ` `). `merge` deduplicates trimmed comma-separated values. Applied in `finalize`, before cache storage and compression. CR/LF rejected. |

| Header echo | partial | Parses without error; emits nothing. |

| Header edit / edit* / note · RequestHeader * | ignored | Line ignored. See the header-directive compatibility inventory in the source tree (`docs/header-directive-compatibility.md`) for the exact boundary and the executable fixtures. |

| Header condition expr= / value expr= | partial | Only a conjunction of `%{REQUEST_URI} =~ / !~` is evaluated; other expressions are not. Value expressions are not implemented. |

| ErrorDocument | supported | Path, inline and external forms; never clobbers an application's own JSON error body. |

| DirectoryIndex | supported | Including the `Disabled` form. |

| SetHandler · AddHandler · AddType · ForceType · RemoveHandler · RemoveType | supported | `application/x-httpd-php` forces PHP handling / records the mapping; other handlers and `Remove*` record a non-PHP reset; `AddType`/`ForceType` override response `Content-Type`. |

| CacheLookup · CacheEnable · CacheDisable · CacheKeyModify | supported | The LSCache directives driving the page cache ; `CacheKeyModify` strips query parameters from the key. |

| php_value · php_admin_value · php_flag · php_admin_flag | supported | Per-request PHP ini overrides on the LSAPI special-env path. |

|             | partial | Common scopes honored; ` ` only for the modeled REQUEST_URI shape; ` ` bodies are evaluated. |

| FileETag · H2EarlyHints · esi · AddOutputFilterByType · AllowOverride · Options | no-op | Recognized and dropped. |

| ExpiresActive · ExpiresDefault · ExpiresByType | supported | Scoped across directory, ` ` and ` ` blocks; shares `hj-compress`'s `A/M` time grammar and overrides the vhost XML ` ` defaults when active. |

Unrecognized directives are ignored leniently so vendor `.htaccess` files remain loadable. The planned first step for the header family is making unsupported forms visible in `check --strict` before adding more mutation behavior.

## Per-context overrides & sub_filter

Alongside the per-directory chain, XML contexts rewrite *responses* and override limits for a URI prefix (reference: Configuration → Contexts ):

- **`subFilter`** — literal `SEARCH => REPLACEMENT` substitution between the expires and compress stages, 200 responses only, un-encoded bodies of matching `subFilterTypes` (default `text/html`). Buffered bodies and streams both cap filtered output at `subFilterMaxBody` (4 MiB default); a stream past the cap passes through raw, never half-filtered. `Content-Length` is recomputed, ETag dropped, Last-Modified off unless kept. sub_filter paths bypass the page cache (whose hits re-enter transforms), while eligible static responses may use the fast-path memo (which stores and replays finalized bytes without re-filtering).

- **`maxReqBodySize`** — per-context body cap enforced at dispatch for all terminals (413).

- **`responseTimeout`** (proxy paths) and **`bandwidthLimit`** — override the backend deadline and the server-wide egress rate.

## Reproducible checks

           **tests**
```
cargo test -p hj-rewrite                                   # parser, evaluator, access, auth, cache directives
cargo test -p hj-rewrite --test header_compat              # characterization fixtures for the Header boundary
cargo test -p hj-rewrite --test redirect_repro
bash scripts/fast_memo_parity_test.sh                      # memo-on vs memo-off byte identity on a real chain
```
