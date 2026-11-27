"""Check documentation inputs before rendering the public site."""
import csv
import html
from pathlib import Path
import re
from statistics import median


def validate_pages(source, slugs, charts):
    pages = source / "pages"
    if {p.stem for p in pages.glob("*.html")} != set(slugs):
        raise ValueError("Documentation pages and navigation are out of sync")
    diagrams = set()
    for slug in slugs:
        markup = (pages / f"{slug}.html").read_text()
        names = re.findall(r"<!--diagram:([\w-]+)\|[^\n]+?-->", markup)
        if len(names) != markup.count("<!--diagram:") or len(names) != len(set(names)):
            raise ValueError(f"Malformed or duplicated diagram reference in {slug}")
        diagrams.update(names)
        for name in re.findall(r"<!--chart:([\w-]+)-->", markup):
            if name not in charts:
                raise ValueError(f"Unknown chart {name} in {slug}")
    for directory, suffix in (("diagrams", "mmd"), ("rendered", "svg")):
        files = {p.stem for p in (source / directory).glob(f"*.{suffix}")}
        if files != diagrams:
            raise ValueError(f"{directory}: unreferenced {files - diagrams}, missing {diagrams - files}")


def validate_cli(source):
    serve_help = (source / "serve-help.txt").read_text()
    documented = {}
    for group, flag, default in re.findall(
        r'<tr data-group="([^"]+)"><th class="wrap">(--[\w-]+).*?</th><td class="def">(.*?)</td>',
        (source / "pages/cli.html").read_text(),
    ):
        if flag in documented:
            raise ValueError(f"Duplicate CLI row: {flag}")
        documented[flag] = (group, html.unescape(re.sub(r"<[^>]+>", "", default)).strip())
    options = re.split(r"^      (--[\w-]+)(?=[\s,])", serve_help, flags=re.M)
    shipped = dict(zip(options[1::2], options[2::2], strict=True))
    extra = {f for f, (g, _) in documented.items() if f not in shipped and g not in {"acme", "ocsp"}}
    if missing := set(shipped) - set(documented) - {"--help"}:
        raise ValueError(f"Missing CLI rows: {sorted(missing)}")
    if extra:
        raise ValueError(f"Unexpected CLI rows: {sorted(extra)}")
    for flag in set(shipped) & set(documented):
        match = re.search(r"\[default: ([^\]]*)\]", shipped[flag])
        if match:
            expected = "(empty)" if match[1] == '""' else match[1]
            if documented[flag][1] != expected:
                raise ValueError(f"{flag}: expected {expected!r}, found {documented[flag][1]!r}")


WORKLOADS = {
    "H2 empty body": "empty-h2",
    "H2 static 1 KiB": "static-h2",
    "H2 static 64 KiB": "big-h2",
    "H2 heavy .htaccess": "heavy-h2",
    "H2 page-cache hit": "cache-h2",
    "H2 cookied cache": "cache-cookie-h2",
    "H1 static 1 KiB": "static-h1",
    "H1 heavy .htaccess": "heavy-h1",
    "H1 PHP/LSAPI": "php-h1",
    "H2 PHP/LSAPI": "php-h2",
    "H1 static 1 KiB (wrk)": "wrk-h1",
    "H3 empty body": "empty-h3",
    "H3 static 1 KiB": "static-h3",
    "H3 heavy .htaccess": "heavy-h3",
    "H3 page-cache hit": "cache-h3",
    "H3 cookied cache": "cache-cookie-h3",
    "H3 PHP/LSAPI": "php-h3",
    "H3 static 64 KiB": "big-h3",
}


def validate_benchmarks(assets, charts):
    sweeps = {}
    extended = {}
    for day in (21, 22, 23):
        with (assets / f"release-sweep-2026-11-{day}.tsv").open(newline="") as f:
            sweeps[day] = list(csv.DictReader(f, delimiter="\t"))
        filename = "lab-threeway" if day == 21 else "lab-extended"
        with (assets / f"{filename}-2026-11-{day}.tsv").open(newline="") as f:
            extended[day] = list(csv.DictReader(f, delimiter="\t"))
    with (assets / "release-matched-2026-11-26.tsv").open(newline="") as f:
        matched_26 = list(csv.DictReader(f, delimiter="\t"))
    with (assets / "release-matched-2026-11-27.tsv").open(newline="") as f:
        matched_27 = list(csv.DictReader(f, delimiter="\t"))
    with (assets / "release-matched-h3-2026-11-27.tsv").open(newline="") as f:
        matched_27_h3 = list(csv.DictReader(f, delimiter="\t"))
    chart_checks = [
        ("v025", ("throughput", "p99", "static-servers")),
        ("v026", ("throughput", "p99", "static-servers")),
        ("v027", ("throughput", "p99", "static-servers")),
        ("v028", ("throughput", "p99", "h3-throughput")),
    ]
    for version, metrics in chart_checks:
        for metric in metrics:
            name = f"{version}-{metric}"
            _, _, unit, series, rows, _ = charts[name]
            expected_unit = "ms" if metric == "p99" else "k req/s"
            if unit != expected_unit:
                raise ValueError(f"{name}: expected unit {expected_unit}")
            for label, values in rows:
                for entry, value in zip(series, values, strict=True):
                    workload = WORKLOADS[label]
                    if entry.endswith(" · Nov 27 Matched"):
                        server = "v" + entry.split(" · ")[0]
                        field, divisor = ("median_p99_ms", 1) if metric == "p99" else ("median_rps", 1000)
                        samples = [float(r[field]) / divisor for r in matched_27
                                   if r["version"] == server and r["workload"] == workload]
                        expected_count = 1
                    elif entry.endswith(" · H3 Matched"):
                        server = "v" + entry.split(" · ")[0]
                        field, divisor = ("median_p99_ms", 1) if metric == "p99" else ("median_rps", 1000)
                        samples = [float(r[field]) / divisor for r in matched_27_h3
                                   if r["version"] == server and r["workload"] == workload]
                        expected_count = 1
                    elif entry.endswith(" · Matched"):
                        server = "v" + entry.split(" · ")[0]
                        field, divisor = ("median_p99_ms", 1) if metric == "p99" else ("median_rps", 1000)
                        samples = [float(r[field]) / divisor for r in matched_26
                                   if r["version"] == server and r["workload"] == workload]
                        expected_count = 1
                    else:
                        server, date = entry.split(" · Nov ")
                        day = int(date)
                        server = server if server == "nginx" else "v" + server
                        if metric == "static-servers":
                            samples = [float(r["median_rps"]) / 1000 for r in extended[day]
                                       if r["server"] == server and r["workload"] == workload]
                            expected_count = 1
                        else:
                            field, divisor = ("p99_ms", 1) if metric == "p99" else ("rps", 1000)
                            samples = [float(r[field]) / divisor for r in sweeps[day]
                                       if r["version"] == server and r["workload"] == workload]
                            expected_count = 3
                    tolerance = 0.00051 if metric == "p99" else 0.0501
                    if len(samples) != expected_count or abs(median(samples) - value) > tolerance:
                        raise ValueError(f"{name}: {entry} / {label} = {value}; receipts: {samples}")

    # The interactive view uses the same receipts, grouped by release
    # and workload. Require every series point so deleting data also fails.
    curve_workloads = {
        "c-rewrite": {"h1": "heavy-h1", "h2": "heavy-h2"},
        "c-static": {"h1": "static-h1", "h2": "static-h2"},
        "c-php": {"php": "php-h1", "cache": "cache-h2"},
    }
    samples_by_run = {}
    for run in sweeps.values():
        for row in run:
            key = (row["version"], row["workload"])
            samples_by_run.setdefault(key, []).append(float(row["rps"]) / 1000)
    for row in matched_26:
        if row["version"] == "v0.2.7":
            key = (row["version"], row["workload"])
            samples_by_run[key] = [float(row["median_rps"]) / 1000] * 3
    script = (assets / "docs.js").read_text()
    start = script.index("var CURVES = [")
    end = script.index("var curCurve =", start)
    curves = dict(re.findall(r'id: "(c-[\w-]+)".*?pts: \[(.*?)\]', script[start:end], re.S))
    if curves.keys() != curve_workloads.keys():
        raise ValueError("Release curve inventory differs from the receipt mapping")
    for name, workloads in curve_workloads.items():
        seen = set()
        for point in re.findall(r"\{([^{}]+)\}", curves[name]):
            version = re.search(r'"?tag"?\s*:\s*"([^"]+)"', point)[1]
            if version in seen:
                raise ValueError(f"{name}: duplicate point for {version}")
            seen.add(version)
            for key, workload in workloads.items():
                value = float(re.search(rf'"?{key}"?\s*:\s*([\d.]+)', point)[1])
                samples = samples_by_run.get((version, workload), [])
                if len(samples) != 3 or abs(median(samples) - value) > 0.0501:
                    raise ValueError(f"{name}: {version} / {workload} = {value}; receipts: {samples}")
        expected = {version for version, workload in samples_by_run if workload in workloads.values()}
        if seen != expected:
            raise ValueError(f"{name}: unexpected releases {seen - expected}, missing {expected - seen}")
