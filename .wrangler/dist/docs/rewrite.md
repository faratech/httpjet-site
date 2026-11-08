# Rewrite & .htaccess — httpjet Documentation

> How .htaccess rules rewrite and protect requests.

- **Canonical URL:** https://httpjet.net/docs/rewrite
- **Source Repository:** https://github.com/faratech/httpjet

---

# Rewrite engine & .htaccess

`hj-rewrite` is httpjet's Apache **mod_rewrite** / `.htaccess` engine. It depends only on `hj-compress`, so `.htaccess` and XML expiry share one `A/M` time grammar.

        resolve    acl    rewrite    cache    dispatch    finalize    store

## Overview

Run inline ` ` rules first, then the `.htaccess` chain (OpenLiteSpeed order). `evaluate()` returns one outcome per pass: `Rewritten`, `Redirect`, `Proxy`, `Forbidden`, `Gone` or `Unchanged`.

> [Diagram: rewrite-eval] One evaluation pass. A rewrite that crosses into another directory reloads the destination chain and evaluates again; a terminal flag stops the walk; an exhausted chain returns Unchanged and dispatch falls through to suffix routing.

## Per-directory loading

`HtaccessCache` loads each directory's file (`accessFileName`, default `.htaccess`; bare names only). **mtime invalidation** re-stats at most once a second, so edits land within a second. The parsed form holds directives, regexes, scopes, the auth map and the memo verdict. The chain caps at **64** levels, then a deny-all sentinel applies.

Since 2026-09-16 an unreadable, unparseable or over-16 MiB `.htaccess` fails closed to that sentinel. Non-UTF-8 bytes decode lossily. Set ` 0` to disable the chain; `autoLoadHtaccess` alone loads without overrides. Each generation owns its caches, so reloads never revive stale results.

## The dense-DFA prefilter

See Matching . The prefilter now lives there.

## Matching

Compile eligible patterns once into **one dense DFA** (`regex_automata::dfa::dense`). Search it once to learn which rules could match. Run only those rules for real. A dense DFA holds no lazy state, so the search is **cacheless**. You pay no per-search allocation and no cross-thread pool lock.

           **hot path** · prefilter, then evaluate
```
let hits = prefilter.search(path);          // which rules *could* match — one DFA pass
for rule in hits {
    if let Some(m) = rule.regex.find(path) { return rule.apply(m); }   // substitute + flags
}
Outcome::Unchanged
```

Each flagged rule runs through `CompiledRegex`. Prefer `regex_automata::meta::Regex` (per-pattern thread-local cache). Fall back to `fancy-regex` only where the linear engine cannot express a construct. Accepted patterns match identically under both.

| Pattern shape | Engine | Why |

| Anchors, classes, alternation, repetition | `regex_automata::meta` | Linear time. Limit: per-pattern thread-local cache, no shared lock. |

| Lookahead `(?=…)` / `(?!…)`, lookbehind | `fancy-regex` | Not a finite automaton. Limit: backtracking only here. |

| In-pattern backreference `\1` | `fancy-regex` | Requires backtracking. Limit: backtracking only here. |

| Pure lookahead conjunction `^(?=.*A)(?=.*B)…` | `regex_automata::meta` per part | One linear search per part. Limit: `fancy-regex` only for captures (0.1.10: 29 → 1 µs). |

A regex error at match time **fails closed toward the rule's polarity**. A failing deny counts as matched; a failing allow is withheld (hardened 2026-09-06).

## Rewrite-outcome cache & UA classification

See Two caches . Outcome caching now lives there.

## Two caches

**Outcome cache.** Memoize the rewrite decision for path-cacheable chains (`--rewrite-outcome-ttl-ms`, default 1000 ms; 0 disables). Key on vhost, scheme, method, host, path, query and keyable headers. Count with `httpjet_rewrite_outcome_{hits,misses,uncacheable}_total`.

**UA classification.** Enable `--rewrite-ua-classify` (default off) to key UA chains by RewriteCond bitmap, when analysis proves that dependence. Since 2026-09-06 header collection continues past it, so Origin/Accept chains still key correctly (`httpjet_rewrite_ua_classify_entries`).

**Finished-response memo.** Serve repeat cookieless static GETs without the pipeline (default on; `--no-fast-memo` / `HJ_FAST_MEMO=0`). Per thread, 1 s TTL, 64 MiB/worker. Store only 200 full bodies without `Set-Cookie`, after one full pass per key.

Eligibility is a **parse-time verdict** (`MemoClass`, fail-closed) that `httpjet check` prints per vhost. Note: `%{TIME*}` evaluates to the empty string, and chains reading it are ineligible for this memo.

> [Diagram: memo-eligibility] Memo eligibility. A chain that reads anything the memo key cannot carry — client/server addresses, protocol, IP/env/host access operands, REDIRECT_STATUS, %{HTTP_COOKIE}, %{TIME*} — is ineligible and pays the full pipeline every time. Eligible chains memoize with a VARY-SET of every header the chain reads (raw Origin, UA bitmap …), so an 800-line forum chain still memoizes.

        ⎁   Measured
Same-binary A/B on the forum's 806-line chain (`/robots.txt`, c=100): **h2 137k → 248k req/s (+81%)**, **h1 107k → 153k (+43%)**. Gate `scripts/fast_memo_parity_test.sh` diffs UA × Origin × Accept-Encoding × scheme (192 cells, zero differences).
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

Evaluate `SetEnvIf`/`SetEnvIfNoCase` with **lazy header access**: materialize only referenced headers, compare case-insensitively. No match costs nothing. Since 2026-09-16 you cannot set server-computed CGI names (`REMOTE_ADDR`, `HTTPS`, `CONTENT_LENGTH`, …) this way.

           **.htaccess** · SetEnvIf
```
SetEnvIfNoCase User-Agent "bot|crawler" is_bot=1
SetEnvIf Request_URI "\.(?:png|jpg|css|js)$" is_asset=1
RewriteCond %{ENV:is_bot} =1
RewriteRule ^/expensive/ - [E=no-cache:1]      # [E=no-cache] also bypasses the page cache
```

## Front-controller routing

XenForo and WordPress rewrite every URL to `/index.php`. Keep the **original `REQUEST_URI`**; pin `SCRIPT_FILENAME` via `LsapiScript` and `SCRIPT_NAME`/`QUERY_STRING` via env. Hence the page-cache original-URI key .

## Access control

` `/` `/` `/` `/` ` carry `Order`/`Allow from`/`Deny from`/`Require`, ANDed across blocks. A ` ` deny covers everything beneath it. Only `Require all granted` grants; other predicates (`ip`, `host`, `env`, `expr`, `method`, …) **fail closed to deny** (403). Directory patterns accept mapped or docroot-relative paths.

## HTTP Basic auth

Protect a subtree with `AuthType Basic` + `AuthName` + `AuthUserFile` + `Require valid-user | user …`:

- Resolve requirements in scope order. Limit: metadata-only sections cannot erase inherited requirements; explicit `Require` replaces them.

- Enforce before cache lookup, on original/rewritten/index/script targets. Limit: valid credentials set `REMOTE_USER`; failures return 401.

- Fail closed on unsupported auth. Limit: exact usernames stay preserved.

           **.htaccess** · a protected subtree
```
AuthType Basic
AuthName "Staging"
AuthUserFile /srv/example.test/conf/htpasswd
Require valid-user
```

Accepted htpasswd hashes — verify each in constant time:

- **bcrypt** (`$2y$`/`$2b$`/`$2a$`, `htpasswd -B`). Limit: cost capped at 14; higher is refused before hashing.

- **APR1-MD5** (`$apr1$`), **MD5-crypt** (`$1$`) and `{SHA}`.

- Plaintext, DES, `$5$` and `$6$` `crypt()`. Limit: these verify *false* with a parse-time warning.

An unknown user pays dummy bcrypt/MD5 work at the file's recorded cost. Charge Basic-auth attempts per client before hashing. Refuse repeated `Authorization` headers.

Resolve `AuthUserFile` **inside the docroot**, or under `--auth-user-file-roots`. Check the descriptor's real path; cap reads at 1 MiB. An unreadable or out-of-root file returns 500, never a silent 401; `check` warns. Authenticated statics get `Cache-Control: private, no-store` without an explicit policy (#414).

Note: the 2026-09-06 review split parsed policy from the effective realm; the rules above carry its outcome.

## Directives reference

| Directive | Status | Notes |

| RewriteEngine · RewriteBase | supported | Toggle and base-path resolution. |

| RewriteCond · RewriteRule | supported | - Flags: `L END R R=code F G P PT E= N NC QSA QSD NE C S=n B B=chars BNE= BNP BCTLS UnsafeAllow3F`; `OR` on conditions. - File tests: `-f/-F -d -e -l/-L/-h -s -x` (`-U` always matches). - Variables: `REQUEST_URI REQUEST_FILENAME REQUEST_METHOD REQUEST_SCHEME QUERY_STRING THE_REQUEST HTTPS HTTP_HOST HTTP_USER_AGENT HTTP_COOKIE HTTP_REFERER HTTP_ACCEPT REMOTE_ADDR REMOTE_PORT SERVER_ADDR SERVER_NAME SERVER_PORT SERVER_PROTOCOL DOCUMENT_ROOT SCRIPT_FILENAME`, `%{HTTP:Name}`, `%{ENV:NAME}`, `%{LA-U:…}`/`%{LA-F:…}`. - `%{TIME*}` yields the empty string. - `RewriteMap`, `${map:key}`, `T=`/`H=` fail closed at parse time. Limit: other flags (e.g. `DPI`, `CO=`) are ignored. |

| SetEnvIf · SetEnvIfNoCase | supported | Lazy header access. Limit: server-computed CGI names stay protected. |

| Order · Allow from · Deny from | supported | Apache accumulation per scope. Limit: `env=`, host and CIDR operands make the chain memo-ineligible. |

| Require | partial | `all granted`, `valid-user`, `user …`. Limit: everything else fails closed to deny. |

| AuthType · AuthName · AuthUserFile | supported | Basic only. Limit: bcrypt, APR1 (`$apr1$`), MD5-crypt (`$1$`) and `{SHA}` only. |

| Header set / add / append / merge / unset | supported | - Guards: `always`/`onsuccess`, `env=`/`env=!`, `%{NAME}e`. - Scopes merge directory, then ` `, then ` `. Limit: applied in `finalize`; CR/LF rejected. |

| Header echo | partial | Parses without error. Limit: emits nothing. |

| Header edit / edit* / note / setifempty / echo · RequestHeader * | ignored | Line ignored. Limit: see `docs/header-directive-compatibility.md` for the exact boundary. |

| Header condition expr= / value expr= | partial | Only `%{REQUEST_URI} =~ / !~` conjunctions evaluate. Limit: value expressions are not implemented. |

| ErrorDocument | supported | Path, inline and external forms. Limit: never clobbers an app's own JSON error body. |

| DirectoryIndex | supported | Including the `Disabled` form. |

| SetHandler · AddHandler · AddType · ForceType · RemoveHandler · RemoveType | supported | `application/x-httpd-php` forces PHP. Limit: other handlers and `Remove*` record a non-PHP reset; `AddType`/`ForceType` override `Content-Type`. |

| CacheLookup · CacheEnable · CacheDisable · CacheKeyModify | supported | LSCache directives for the page cache . Limit: `CacheKeyModify` strips query parameters from the key. |

| php_value · php_admin_value · php_flag · php_admin_flag | supported | Per-request PHP ini overrides. Limit: LSAPI special-env path only. |

|             | partial | Common scopes honored. Limit: ` ` only for the modeled REQUEST_URI shape; ` ` bodies evaluate. |

| FileETag · H2EarlyHints · esi · AddOutputFilterByType · AllowOverride · Options | no-op | Recognized and dropped. |

| ExpiresActive · ExpiresDefault · ExpiresByType | supported | Scoped across directory, ` ` and ` `. Limit: shares the `A/M` grammar; overrides vhost XML ` ` when active. |

Unrecognized directives are ignored, so vendor files stay loadable.

## Per-context overrides & sub_filter

See Configuration → Contexts . Per-context overrides and `sub_filter` now live there.

## Reproducible checks

           **tests**
```
cargo test -p hj-rewrite                                   # parser, evaluator, access, auth, cache directives
cargo test -p hj-rewrite --test header_compat              # characterization fixtures for the Header boundary
cargo test -p hj-rewrite --test redirect_repro
bash scripts/fast_memo_parity_test.sh                      # memo-on vs memo-off byte identity on a real chain
```
