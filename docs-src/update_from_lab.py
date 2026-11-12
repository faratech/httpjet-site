#!/usr/bin/env python3
"""Regenerate site performance data from a collected lab run.

Usage: python3 docs-src/update_from_lab.py /var/tmp/lab-results/<timestamp>

Reads raw/<tag>/*.log (bench-sweep) and extended/*.log (bench-extended) from
the collected lab tar, then:
  * writes docs/assets/release-sweep-<date>.tsv (per-round rows)
  * writes docs/assets/lab-threeway-<date>.tsv and lab-perf-<date>.tsv
  * rewrites the Release Speed Curve points in docs/assets/docs.js
  * inserts/updates the 'lab-threeway' chart in docs-src/build.py CHARTS

It does NOT touch: cache-vs-php (real XenForo, production-only), the
dedicated-client three-way (different regime, kept as its own dated chart),
or the pre-release build slides (historical experiments).
"""
import os
import re
import statistics
import sys

TAGS = ["v0.0.1", "v0.0.2", "v0.0.3", "v0.0.9", "v0.0.10",
        "v0.1.2", "v0.1.5", "v0.1.10", "v0.1.11", "v0.1.12", "v0.2.0",
        "v0.2.1", "v0.2.2"]
SWEEP_WLS = ["static-h2", "static-h1", "heavy-h2", "heavy-h1",
             "php-h1", "cache-h2", "empty-h2", "big-h2"]
NOTES = {6: "fast_memo + 3-way", 7: "sendfile + kTLS", 8: "openat2 + H3 PGO",
         9: "access-rule memo", 10: "TLS idle + dict L3",
         11: "Recycled task pools", 12: "BODY_BUFS zero-fault",
         13: "Bug/perf bash", 14: "Coop + memo defaults",
         15: "Hot-path reductions", 16: "Audit fixes + cold-start",
         17: "Admission fix + fuzz", 18: "Second review pass"}


def ms(v):
    m = re.match(r"([0-9.]+)(us|ms|s)$", v)
    x = float(m.group(1))
    return x / 1000 if m.group(2) == "us" else x if m.group(2) == "ms" else x * 1000


def parse_h2load(path):
    txt = open(path).read()
    rps = re.search(r"finished in [^,]*, ([0-9.]+) req/s", txt)
    if not rps:
        return None
    row = re.search(r"^request\s+:\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)", txt, re.M)
    tot = re.search(r"requests:.*?(\d+) total", txt)
    codes = {c: int(re.search(rf"(\d+) {c}", txt).group(1)) for c in ("2xx", "4xx", "5xx")}
    return dict(rps=float(rps.group(1)), p50=ms(row.group(3)), p95=ms(row.group(4)),
                p99=ms(row.group(5)), mean=ms(row.group(6)),
                total=int(tot.group(1)), **codes)


def parse_wrk(path):
    m = re.search(r"Requests/sec:\s+([0-9.]+)", open(path).read())
    return float(m.group(1)) if m else None


def main():
    results = sys.argv[1]
    site = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    assets = os.path.join(site, "docs", "assets")
    date = re.search(r"(\d{4})(\d{2})(\d{2})-", os.path.basename(results.rstrip("/")))
    datestr = f"{date.group(1)}-{date.group(2)}-{date.group(3)}" if date else "unknown"

    # ---- sweep TSV + medians
    rows = ["round\tversion\tworkload\trps\tp50_ms\tp95_ms\tp99_ms\tmean_ms\trequests_total\tstatus_2xx\tstatus_4xx\tstatus_5xx\traw_log"]
    med = {}
    for t in TAGS:
        for w in SWEEP_WLS:
            vals = []
            for r in (1, 2, 3):
                f = os.path.join(results, "raw", t, f"{w}-r{r}.log")
                if not os.path.exists(f):
                    continue
                d = parse_h2load(f)
                if d is None:
                    print(f"WARNING no result {f}")
                    continue
                vals.append(d["rps"] / 1000)
                rows.append(f"{r}\t{t}\t{w}\t{d['rps']:.1f}\t{d['p50']:.3f}\t{d['p95']:.3f}\t{d['p99']:.3f}\t{d['mean']:.3f}\t{d['total']}\t{d['2xx']}\t{d['4xx']}\t{d['5xx']}\trelease-sweep-{datestr}/{t}/{w}-r{r}.log")
            if vals:
                med[(t, w)] = round(statistics.median(vals), 1)
    tsv_name = f"release-sweep-{datestr}.tsv"
    open(os.path.join(assets, tsv_name), "w").write("\n".join(rows) + "\n")
    print(f"wrote {tsv_name}: {len(rows) - 1} rows")

    # ---- copy raw logs (sweep + extended + checks) under the sweep dir
    import shutil
    sweep_dir = os.path.join(assets, f"release-sweep-{datestr}")
    for sub in ("raw", "extended", "checks", "bench-logs"):
        src = os.path.join(results, sub)
        if os.path.isdir(src):
            dst = os.path.join(sweep_dir, sub)
            if os.path.exists(dst):
                shutil.rmtree(dst)
            shutil.copytree(src, dst)
    for extra in ("bench-main.log",):
        src = os.path.join(results, extra)
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(sweep_dir, extra))
    checks_src = os.path.join(results, "checks", "checks.tsv")
    checks = []
    if os.path.exists(checks_src):
        checks = open(checks_src).read().strip().splitlines()[1:]
        shutil.copy2(checks_src, os.path.join(assets, f"lab-checks-{datestr}.tsv"))
        print(f"wrote lab-checks-{datestr}.tsv: {len(checks)} versions")

    # ---- regenerate the sweep index page with medians + checks
    wl_head = "".join(f"<th>{w}</th>" for w in SWEEP_WLS)
    body_rows = ""
    for t in TAGS:
        cells = "".join(f"<td>{med.get((t, w), '-')}</td>" for w in SWEEP_WLS)
        body_rows += f"<tr><td>{t}</td>{cells}</tr>\n"
    check_rows = ""
    for line in checks:
        f = line.split("\t")
        check_rows += "<tr>" + "".join(f"<td>{c}</td>" for c in f) + "</tr>\n"
    index = f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Release sweep {datestr} — raw benchmark logs</title>
<style>body{{font-family:ui-monospace,Menlo,monospace;background:#0b1220;color:#dbe7f3;margin:2rem auto;max-width:64rem;padding:0 1rem;line-height:1.55}}a{{color:#22d3ee}}table{{border-collapse:collapse}}td,th{{border:1px solid #263650;padding:.3rem .6rem;text-align:right}}th:first-child,td:first-child{{text-align:left}}.mini{{color:#8fa8c0;font-size:.85em}}code{{color:#a5f3fc}}</style>
</head><body>
<h1>Release sweep {datestr} — raw logs and checks</h1>
<p>Every release from v0.0.1 to v0.2.2, measured under <strong>identical conditions</strong> on a dedicated lab VM
(Google Cloud <code>c4-highmem-8</code>, Ubuntu 26.10 — the production x86 origin's machine type). No production host was loaded:
server and load generator both ran inside the VM, over its loopback, server pinned to cores 0-3
(<code>--workers 4</code>), <code>h2load</code> to cores 4-7. Each release was PGO-built from its tag with one
unified gather profile (Rust 1.99.1) and served with uniform production flags. Three rounds per build in
rotated order; tables show medians. Per-round data: <a href="../release-sweep-{datestr}.tsv">release-sweep-{datestr}.tsv</a>.</p>
<p>Workloads: <code>static</code> = 1 KiB file (h2 c=32 m=10 / h1 c=100); <code>empty</code> = 0-byte file (h2);
<code>big</code> = 64 KiB file (h2, n=20k); <code>heavy</code> = <code>/robots.txt</code> through the real 806-line forum
<code>.htaccess</code> chain; <code>php</code> = <code>bench.php?n=50</code> over the real <code>lsphp</code> (h1 c=40);
<code>cache</code> = 37 KB PHP fixture page (<code>cachebench.php</code>) through the real origin page cache (h2 c=32 m=32) —
the lab has no XenForo database, so the cache workload is a fixture, not a forum page. PHP for v0.0.1-v0.0.3 measures cold-pool ramp: those builds grow their lsphp pool slowly from a cold start (single request: ~3 ms; warm pool measured separately at ~32k req/s on v0.0.1, see extended/php-warm-v0.0.1.log), so compare their PHP line with that in mind.
TLS used a lab self-signed RSA-2048 certificate; heavy H2 is connection-bound on it (~110k for every build), so read its H1 line for trend.</p>
<h2>Median results (k req/s)</h2>
<table><tr><th>Build</th>{wl_head}</tr>
{body_rows}</table>
<p class="mini">Round spreads overlap between neighbouring builds on most workloads; treat small median gaps as noise.</p>
<h2>Functional checks (same harness, every version)</h2>
<p>Each binary was started fresh and given the same requests. Full table:
<a href="../lab-checks-{datestr}.tsv">lab-checks-{datestr}.tsv</a>; per-version logs in <code>checks/</code>.</p>
<table><tr><th>tag</th><th>binary</th><th>match</th><th>static</th><th>heavy</th><th>php</th><th>cache hit</th><th>empty</th><th>64k</th><th>config check</th></tr>
{check_rows}</table>
<h2>Files</h2>
<p><code>raw/&lt;tag&gt;/</code> — 312 raw <code>h2load</code> logs (8 workloads x 3 rounds per build) ·
<code>extended/</code> — three-way (nginx/OpenLiteSpeed) + <code>perf stat</code> raw output ·
<code>checks/</code> — per-version check logs · <code>bench-logs/</code> — server logs, primes, run order.</p>
<p id="links">Generating file links…</p>
<script>
var tags = {TAGS};
var wls = {SWEEP_WLS};
var h = "";
tags.forEach(function (t) {{
  h += "<strong>" + t + "</strong>: ";
  wls.forEach(function (w) {{
    h += w + " ";
    for (var r = 1; r <= 3; r++) h += '<a href="raw/' + t + "/" + w + "-r" + r + '.log">r' + r + "</a> ";
    h += "· ";
  }});
  h += '<a href="checks/' + t + '.log">check log</a><br>';
}});
document.getElementById("links").innerHTML = h;
</script>
</body></html>
"""
    open(os.path.join(sweep_dir, "index.html"), "w").write(index)
    print(f"wrote {sweep_dir}/index.html")

    # ---- patch docs.js CURVES positionally (heavy, static, php/cache)
    docs_js = os.path.join(assets, "docs.js")
    s = open(docs_js).read()

    def pts(pairs, keys):
        out = []
        for i, (tag, vals) in enumerate(zip(TAGS, pairs)):
            idx = 6 + i
            kv = ", ".join(f"{k}: {v}" for k, v in zip(keys, vals))
            out.append(f'            {{ idx: {idx}, tag: "{tag}", {kv}, note: "{NOTES[idx]}" }}')
        return "pts: [\n" + ",\n".join(out) + "\n          ],"

    blocks = [
        ([(med.get((t, "heavy-h2"), 0), med.get((t, "heavy-h1"), 0)) for t in TAGS], ["h2", "h1"]),
        ([(med.get((t, "static-h2"), 0), med.get((t, "static-h1"), 0)) for t in TAGS], ["h2", "h1"]),
        ([(med.get((t, "php-h1"), 0), med.get((t, "cache-h2"), 0)) for t in TAGS], ["php", "cache"]),
    ]
    pat = re.compile(r"pts: \[\n(?:.*\n)*?          \],", re.M)
    pos = 0
    for pairs, keys in blocks:
        m = pat.search(s, pos)
        assert m, keys
        new = pts(pairs, keys)
        s = s[:m.start()] + new + s[m.end():]
        pos = m.start() + len(new)
    # newest-build slide chart: v0.2.1 vs v0.2.2 lab medians
    def row(label, w):
        a = med.get(("v0.2.1", w), 0); b = med.get(("v0.2.2", w), 0)
        return f'["{label}", [{a}, {b}]]'
    pairs = [("Static 1 KiB H2 c=32x10", "static-h2"), ("Static 1 KiB H1 c=100", "static-h1"),
             ("Heavy .htaccess H2 c=32x10", "heavy-h2"), ("Heavy .htaccess H1 c=100", "heavy-h1"),
             ("PHP/LSAPI H1 c=40", "php-h1"), ("Page-cache hit H2 c=32x32", "cache-h2")]
    new_rows = ",\n            ".join(row(l, w) for l, w in pairs)
    s, n = re.subn(r'(\["Static 1 KiB H2 c=32x10", \[[\d.]+, [\d.]+\]\],\n            \["Static 1 KiB H1 c=100", \[[\d.]+, [\d.]+\]\],\n            \["Heavy .htaccess H2 c=32x10", \[[\d.]+, [\d.]+\]\],\n            \["Heavy .htaccess H1 c=100", \[[\d.]+, [\d.]+\]\],\n            \["PHP/LSAPI H1 c=40", \[[\d.]+, [\d.]+\]\],\n            \["Page-cache hit H2 c=32x32", \[[\d.]+, [\d.]+\]\])', new_rows, s, count=1)
    print(f"b16 rows patched: {n}")
    open(docs_js, "w").write(s)
    print("patched docs.js CURVES")

    # ---- three-way TSV + build.py chart
    ext = os.path.join(results, "extended")
    servers = ["v0.2.1", "v0.2.2", "nginx", "ols"]
    tw_wls = ["empty-h2", "static-h2", "big-h2", "static-h1", "heavy-h2", "wrk-h1"]
    tw_rows = ["server\tworkload\tmedian_rps\trounds_rps"]
    tw_med = {}
    for srv in servers:
        for w in tw_wls:
            vals = []
            for r in (1, 2, 3):
                f = os.path.join(ext, f"tw-{srv}-{w}-r{r}.log")
                if not os.path.exists(f):
                    continue
                v = parse_wrk(f) if w == "wrk-h1" else (parse_h2load(f) or {}).get("rps")
                if v:
                    vals.append(v)
            if vals:
                tw_med[(srv, w)] = statistics.median(vals)
                tw_rows.append(f"{srv}\t{w}\t{statistics.median(vals):.1f}\t{','.join(f'{v:.0f}' for v in vals)}")
    tw_name = f"lab-threeway-{datestr}.tsv"
    open(os.path.join(assets, tw_name), "w").write("\n".join(tw_rows) + "\n")
    print(f"wrote {tw_name}: {len(tw_rows) - 1} rows")

    labels = {"v0.2.1": "httpjet v0.2.1", "v0.2.2": "httpjet v0.2.2",
              "nginx": "nginx", "ols": "OpenLiteSpeed"}
    present = [srv for srv in servers if any((srv, w) in tw_med for w in tw_wls)]
    if present:
        series = [labels[srv] for srv in present]
        chart_rows = []
        for w, label in [("empty-h2", "h2 empty"), ("static-h2", "h2 1 KiB"),
                         ("big-h2", "h2 64 KiB"), ("static-h1", "h1 1 KiB (h2load)"),
                         ("heavy-h2", "h2 /robots.txt (.htaccess chain*)")]:
            vals = [round(tw_med[(srv, w)] / 1000, 1) if (srv, w) in tw_med else "null" for srv in present]
            chart_rows.append(f"('{label}', [{', '.join(str(v) for v in vals)}])")
        wrk_bits = ", ".join(f"{labels[srv]} {tw_med[(srv, 'wrk-h1')]:,.0f}" for srv in present if (srv, "wrk-h1") in tw_med)
        entry = (
            f" 'lab-threeway': ('Lab three-way, same-host loopback (httpjet vs nginx vs OpenLiteSpeed)', "
            f"'dedicated lab VM c4-highmem-8 \\u00b7 server cores 0-3 / loadgen cores 4-7 \\u00b7 h2load c=32 x10 (64 KiB: n=20k) \\u00b7 median of 3 rounds \\u00b7 {datestr} \\u00b7 req/s', 'k rps',\n"
            f"   {series},\n   [{', '.join(chart_rows)}],\n"
            f"   'Loopback lab numbers, not a capacity claim. *Only httpjet runs the full 806-line .htaccess chain; nginx ignores .htaccess and OpenLiteSpeed applies its subset, so that row is not like-for-like. wrk cross-check (h1 1 KiB, c=100, 15 s): {wrk_bits} req/s. Raw logs: assets/release-sweep-{datestr}/ ../extended in the lab results; per-round data: assets/{tw_name}.'),\n"
        )
        bp = os.path.join(site, "docs-src", "build.py")
        b = open(bp).read()
        if "'lab-threeway':" in b:
            b = re.sub(r" 'lab-threeway': .*?\n(?= 'cache-vs-php':)", lambda _m: entry, b, count=1, flags=re.S)
        else:
            anchor = " 'cache-vs-php':"
            assert anchor in b
            b = b.replace(anchor, entry + anchor, 1)
        open(bp, "w").write(b)
        print("patched build.py lab-threeway chart:", series)

    # ---- perf TSV (receipts; site lenses keep their historical series)
    perf_rows = ["version\tworkload\tminor_faults_per_1k_req\tcontext_switches_per_1k_req\trequests\tnote"]
    for t in TAGS:
        stat = os.path.join(ext, f"perf-{t}.stat")
        hl = os.path.join(ext, f"perf-{t}.h2load.log")
        if not (os.path.exists(stat) and os.path.exists(hl)):
            continue
        txt = open(stat).read()
        def ev(name):
            m = re.search(rf"([\d,]+)\s+{name}", txt)
            return int(m.group(1).replace(",", "")) if m else None
        d = parse_h2load(hl)
        n = d["total"] if d else 0
        mf, cs = ev("minor-faults"), ev("context-switches")
        ins = ev("instructions")
        note = "PMU cycles/instructions not exposed by this VM" if not ins else ""
        if n and mf is not None:
            perf_rows.append(f"{t}\tstatic-h2-c32x10\t{mf / n * 1000:.2f}\t{cs / n * 1000:.1f}\t{n}\t{note}")
    perf_name = f"lab-perf-{datestr}.tsv"
    open(os.path.join(assets, perf_name), "w").write("\n".join(perf_rows) + "\n")
    print(f"wrote {perf_name}: {len(perf_rows) - 1} rows")

    print("\nmedians (k req/s): static-h2 static-h1 heavy-h2 heavy-h1 php cache empty big")
    for t in TAGS:
        print(t, *[med.get((t, w), "-") for w in SWEEP_WLS[:6]],
              med.get((t, "empty-h2"), "-"), med.get((t, "big-h2"), "-"))


if __name__ == "__main__":
    main()
