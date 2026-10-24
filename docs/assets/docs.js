/* httpjet docs — progressive enhancement only. The site is fully readable without this file.
   Adds: mobile drawer, on-page TOC + scroll-spy, copy-code, heading anchors, client-side search. */
(function () {
  "use strict";
  var doc = document, root = doc.documentElement;

  /* landing reveal: html.js is already set by the inline head script; flip to .revealed */
  requestAnimationFrame(function () { root.classList.add("revealed"); });

  /* ---------- mobile drawer ---------- */
  var sidebar = doc.querySelector(".sidebar"),
      menuBtn = doc.querySelector(".menubtn"),
      scrim = doc.querySelector(".scrim");
  function closeDrawer(focusMenu) {
    if (sidebar) sidebar.classList.remove("open");
    if (scrim) scrim.classList.remove("show");
    if (menuBtn) menuBtn.setAttribute("aria-expanded", "false");
    if (focusMenu && menuBtn) menuBtn.focus();
  }
  if (menuBtn && sidebar) {
    menuBtn.addEventListener("click", function () {
      var open = sidebar.classList.toggle("open");
      if (scrim) scrim.classList.toggle("show", open);
      menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) sidebar.focus({ preventScroll: true });
    });
  }
  if (sidebar) sidebar.setAttribute("tabindex", "-1");
  if (scrim) scrim.addEventListener("click", function () { closeDrawer(true); });
  if (sidebar) sidebar.addEventListener("click", function (e) { if (e.target.closest("a")) closeDrawer(); });

  /* ---------- heading anchors + TOC build ---------- */
  var content = doc.querySelector(".content");
  var heads = content ? Array.prototype.slice.call(content.querySelectorAll("h2[id], h3[id]")) : [];

  heads.forEach(function (h) {
    if (h.querySelector(".anchor")) return;
    var a = doc.createElement("a");
    a.className = "anchor"; a.href = "#" + h.id; a.textContent = "#";
    a.setAttribute("aria-hidden", "true");
    a.setAttribute("tabindex", "-1");
    h.appendChild(a);
  });

  /* right-rail TOC */
  var toc = doc.querySelector(".toc");
  if (toc && heads.length) {
    heads.forEach(function (h) {
      var a = doc.createElement("a");
      a.href = "#" + h.id; a.textContent = h.textContent.replace(/#$/, "").trim();
      if (h.tagName === "H3") a.className = "sub";
      a.dataset.id = h.id;
      toc.appendChild(a);
    });
  }

  /* sidebar sub-anchors under the active page (h2 only, to stay tidy) */
  var activeLink = doc.querySelector(".nav-link.active");
  var navSub = activeLink && activeLink.nextElementSibling && activeLink.nextElementSibling.classList.contains("nav-sub")
      ? activeLink.nextElementSibling : null;
  if (navSub) {
    heads.filter(function (h) { return h.tagName === "H2"; }).forEach(function (h) {
      var a = doc.createElement("a");
      a.href = "#" + h.id; a.textContent = h.textContent.replace(/#$/, "").trim(); a.dataset.id = h.id;
      navSub.appendChild(a);
    });
  }

  /* ---------- scroll-spy ---------- */
  if (heads.length && (toc || navSub)) {
    var spyTargets = {};
    (toc ? Array.prototype.slice.call(toc.querySelectorAll("a")) : []).forEach(function (a) {
      (spyTargets[a.dataset.id] = spyTargets[a.dataset.id] || []).push(a);
    });
    (navSub ? Array.prototype.slice.call(navSub.querySelectorAll("a")) : []).forEach(function (a) {
      (spyTargets[a.dataset.id] = spyTargets[a.dataset.id] || []).push(a);
    });
    var current = null;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) current = en.target.id;
      });
      Object.keys(spyTargets).forEach(function (id) {
        spyTargets[id].forEach(function (a) { a.classList.toggle("cur", id === current); });
      });
    }, { rootMargin: "-12% 0px -72% 0px", threshold: 0 });
    heads.forEach(function (h) { io.observe(h); });
  }

  /* ---------- copy-code ---------- */
  Array.prototype.slice.call(doc.querySelectorAll(".codeframe")).forEach(function (frame) {
    var pre = frame.querySelector("pre");
    if (!pre) return;
    var bar = frame.querySelector(".codeframe__bar");
    if (!bar) return;
    var btn = doc.createElement("button");
    btn.className = "copy"; btn.type = "button"; btn.textContent = "copy"; btn.setAttribute("aria-label", "Copy code");
    bar.appendChild(btn);
    btn.addEventListener("click", function () {
      var text = pre.innerText;
      var done = function () { btn.textContent = "copied"; btn.classList.add("ok"); setTimeout(function () { btn.textContent = "copy"; btn.classList.remove("ok"); }, 1400); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, done);
      else { var t = doc.createElement("textarea"); t.value = text; doc.body.appendChild(t); t.select(); try { doc.execCommand("copy"); } catch (e) {} doc.body.removeChild(t); done(); }
    });
  });


  /* ---------- tabs ---------- */
  Array.prototype.slice.call(doc.querySelectorAll(".tabs")).forEach(function (tabs) {
    var btns = Array.prototype.slice.call(tabs.querySelectorAll(".tabs__bar button")),
        panels = Array.prototype.slice.call(tabs.querySelectorAll(".tabs__panel"));
    function show(i) {
      btns.forEach(function (b, j) { b.setAttribute("aria-selected", i === j ? "true" : "false"); });
      panels.forEach(function (p, j) { p.classList.toggle("on", i === j); });
    }
    btns.forEach(function (b, i) { b.addEventListener("click", function () { show(i); }); });
    show(0);
  });

  /* ---------- filterable tables (CLI flags, directives, metrics) ---------- */
  Array.prototype.slice.call(doc.querySelectorAll("[data-filter]")).forEach(function (bar) {
    var table = doc.getElementById(bar.getAttribute("data-filter"));
    if (!table) return;
    var input = bar.querySelector("input"), count = bar.querySelector(".count"),
        chips = Array.prototype.slice.call(bar.querySelectorAll(".fchip")),
        rows = Array.prototype.slice.call(table.querySelectorAll("tbody tr")).filter(function (r) { return !r.classList.contains("grouphead"); }),
        heads = Array.prototype.slice.call(table.querySelectorAll("tbody tr.grouphead")),
        group = "";
    function apply() {
      var q = (input ? input.value : "").trim().toLowerCase(), n = 0;
      rows.forEach(function (r) {
        var ok = (!q || r.textContent.toLowerCase().indexOf(q) > -1) && (!group || r.getAttribute("data-group") === group);
        r.hidden = !ok; if (ok) n++;
      });
      heads.forEach(function (h) {
        var g = h.getAttribute("data-group"), any = rows.some(function (r) { return !r.hidden && r.getAttribute("data-group") === g; });
        h.hidden = !any;
      });
      if (count) count.textContent = n + " of " + rows.length;
    }
    if (input) input.addEventListener("input", apply);
    chips.forEach(function (c) {
      c.addEventListener("click", function () {
        var g = c.getAttribute("data-group");
        group = (group === g) ? "" : g;
        chips.forEach(function (x) { x.setAttribute("aria-pressed", x.getAttribute("data-group") === group ? "true" : "false"); });
        apply();
      });
    });
    apply();
  });

  /* ---------- widget: page-cache key & tier explorer ---------- */
  var ck = doc.getElementById("cachekey");
  if (ck) {
    var q = function (sel) { return ck.querySelector(sel); };
    var out = q(".widget__out");
    function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }
    function render() {
      var method = q("[name=method]").value, scheme = q("[name=scheme]").value, host = q("[name=host]").value || "example.test",
          path = q("[name=path]").value || "/", query = q("[name=query]").value,
          member = q("[name=member]").checked, priv = q("[name=private]").checked, shared = q("[name=shared]").checked,
          style = q("[name=style]").value, hdr = q("[name=hdr]").value, origin = q("[name=origin]").checked;
      var lines = [];
      if (method !== "GET" && method !== "HEAD") { lines.push('<span class="bad">bypass</span> — only GET/HEAD are looked up or stored (POST caching is not implemented).'); out.innerHTML = lines.join("\n"); return; }
      var tier = "public";
      if (member) {
        if (shared) tier = "public (shared-paths allowlist, sticky canary)";
        else if (priv) tier = "private";
        else { lines.push('<span class="bad">bypass</span> — a member-cookie request without <b>--page-cache-private</b> never touches the public tier.'); out.innerHTML = lines.join("\n"); return; }
      }
      var key = ["epoch·gen", "vhost(" + esc(host) + ")", scheme, esc(host), esc(path) + (query ? "?" + esc(query) : "")];
      if (style) key.push("vary:xf_style_id=" + esc(style));
      if (origin) key.push("origin:<request Origin>");
      if (tier === "private") key.push("session:<xf_session value>");
      lines.push("tier    : <b>" + tier + "</b>");
      lines.push("key     : " + key.join(" · "));
      lines.push("identity: host=" + esc(host) + " raw-path=" + esc(path) + "  (guard: a collision is a miss, never wrong content)");
      var h = hdr.trim();
      if (!h) lines.push('<span class="warn">not stored</span> — the response carries no accepted cache header (opt-in is the app\'s job).');
      else if (/no-cache|no-store/i.test(h)) lines.push('<span class="bad">not stored</span> — ' + esc(h));
      else if (/private/i.test(h) && tier !== "private") lines.push('<span class="warn">not stored on the public tier</span> — a private opt-in needs a member request and --page-cache-private.');
      else if (/public/i.test(h) && tier === "private") lines.push('<span class="warn">stored PRIVATE</span> — a member request stores under its session even for a public opt-in (never into the public tier).');
      else {
        var m = /max-age=(\d+)/i.exec(h);
        lines.push('<span class="good">store candidate</span> — TTL ' + (m ? m[1] + " s" : "default expireInSeconds") + ", subject to W-TinyLFU admission (threshold 2 by default → stored on the 2nd sighting) and the status/Set-Cookie/self-redirect guards.");
      }
      out.innerHTML = lines.join("\n");
    }
    Array.prototype.slice.call(ck.querySelectorAll("input,select")).forEach(function (el) { el.addEventListener("input", render); el.addEventListener("change", render); });
    render();
  }

  /* ---------- widget: page-cache budget calculator ---------- */
  var bw = doc.getElementById("budget");
  if (bw) {
    var g = function (n) { return parseFloat(bw.querySelector("[name=" + n + "]").value) || 0; };
    var bo = bw.querySelector(".widget__out");
    function fmt(mb) { return mb >= 1024 ? (mb / 1024).toFixed(1) + " GiB" : Math.round(mb) + " MiB"; }
    function calc() {
      var mem = g("mem"), disk = g("disk"), hot = g("hot"), ratio = g("ratio"), page = g("page"), meta = 6;
      var ram = mem + hot;
      var entriesByDisk = disk * 1024 / (page / ratio);
      var entriesByMeta = mem * 1024 / meta;
      var entries = Math.min(entriesByDisk, entriesByMeta);
      var identity = entries * page / 1024;
      var b = [];
      b.push("process RAM reserved for the cache : <b>" + fmt(ram) + "</b> (index " + fmt(mem) + " + hot tier " + fmt(hot) + ")");
      b.push("tmpfs footprint cap (also RAM)      : <b>" + fmt(disk) + "</b>");
      b.push("≈ entries the file tier holds       : <b>" + Math.round(entriesByDisk).toLocaleString() + "</b> at " + (page / ratio).toFixed(0) + " KB stored per " + page + " KB page (" + ratio + "× dictionary ratio)");
      b.push("≈ entries the index can describe    : <b>" + Math.round(entriesByMeta).toLocaleString() + "</b> at ~" + meta + " KB of metadata each");
      b.push("effective capacity                  : <b>" + Math.round(entries).toLocaleString() + " pages ≈ " + fmt(identity) + " of identity HTML</b>");
      if (entriesByMeta < entriesByDisk) b.push('<span class="warn">the RAM index is the binding cap — raise --page-cache-mem or lower --page-cache-disk-mem.</span>');
      else b.push('<span class="good">the tmpfs budget is the binding cap (the usual shape).</span>');
      bo.innerHTML = b.join("\n");
    }
    Array.prototype.slice.call(bw.querySelectorAll("input")).forEach(function (el) { el.addEventListener("input", calc); });
    calc();
  }

  /* ---------- interactive build-by-build performance explorer ---------- */
  var bexp = doc.getElementById("build-explorer");
  if (bexp) {
    var BUILDS = [
      {
        id: "b01", tag: "0.0.1", short: "Baseline", date: "2026-06-01", commit: "dcf4ca1e", era: 0, eraName: "Phase 1–7 Foundation",
        regime: "loopback A/B · release build vs live LSWS 6.3.5",
        title: "0.0.1 — Phase 1–7 Clean-Room Baseline",
        summary: "First full-stack release build benchmarked head-to-head against commercial LiteSpeed Web Server 6.3.5 on the same x86_64 host and XML configuration.",
        kpis: [
          { v: "135.4k rps", d: "0.74× vs LSWS (182.7k)", n: true, l: "Light .htaccess H1 (c=100)" },
          { v: "95.8k rps", d: "0.60× vs LSWS (160.9k)", n: true, l: "477-line .htaccess H1 (c=100)" },
          { v: "~128k rps", d: "0.58× vs LSWS (220.5k)", n: true, l: "H2 1 KB static (c=50)" },
          { v: "11 / 11", d: "byte-identical parity", n: false, l: "ETag, LSAPI, .htaccess & rewrite flags" }
        ],
        chart: {
          title: "0.0.1 Baseline vs Commercial LiteSpeed 6.3.5",
          sub: "loopback A/B · 2026-06-01 · ab -k -n 30000 -c 100 / h2load c=50 · k req/s",
          unit: "k rps",
          series: ["httpjet 0.0.1", "LiteSpeed 6.3.5"],
          rows: [
            ["Light .htaccess H1 (/robots.txt)", [135.4, 182.7]],
            ["Heavy 477-line .htaccess H1", [95.8, 160.9]],
            ["H2 static 1 KB (c=50)", [128.0, 220.5]],
            ["PHP/LSAPI H1 (c=40)", [31.0, 38.5]]
          ],
          foot: "Source: RESULTS.md Phase 7 baseline & scripts/bench-results/litespeed-*-run1.csv"
        },
        notes: [
          "Functional parity was complete across all 7 phases, but every request rebuilt RewriteInput, ran un-prefiltered regex rules, and called statx on every .htaccess directory.",
          "Identified three primary gaps: per-request filesystem statx syscalls, regex engine contention, and default glibc allocator overhead."
        ]
      },
      {
        id: "b02", tag: "Tier A", short: "StatCache + DFA", date: "2026-06-04", commit: "2e1db15", era: 0, eraName: "Phase 1–7 Foundation",
        regime: "loopback A/B · interleaved vs LSWS 6.3.5",
        title: "Tier A — StatCache, FileCache TTL & RegexSet Prefilter",
        summary: "Coalesced per-request filesystem metadata probes behind a 1-second TTL and introduced a dense RegexSet DFA prefilter so non-matching RewriteRules never run captures.",
        kpis: [
          { v: "0.63–0.70×", d: "up from 0.46× on heavy chain", n: false, l: "windowsforum /robots.txt vs LSWS" },
          { v: "0.90–0.99×", d: "parity on 66 KB asset", n: false, l: "og-image.png static serving vs LSWS" },
          { v: "1 s TTL", d: "statx coalesced", n: false, l: ".htaccess, FileCache & StatCache (-f/-d)" }
        ],
        chart: {
          title: "Tier A Relative Ratio vs LiteSpeed (×100%)",
          sub: "loopback A/B · 2026-06-04 · % of LiteSpeed 6.3.5 throughput",
          unit: "% of LSWS",
          series: ["Pre-Tier A", "Tier A (StatCache + DFA)"],
          rows: [
            ["Heavy .htaccess /robots.txt (median)", [46, 63]],
            ["Heavy .htaccess /robots.txt (peak)", [52, 70]],
            ["66 KB static image (og-image.png)", [78, 99]]
          ],
          foot: "Source: RESULTS.md Tier A campaign (A1 build-once RewriteInput + A2 rule-less skip + A3 1s statx TTL)"
        },
        notes: [
          "A1 built RewriteInput once per chain instead of per rule; A2 bypassed the engine on rule-less vhosts.",
          "A3 added a 1 s TTL to .htaccess statx checks and RewriteCond -f/-d StatCache (32,768 soft cap), bringing 66 KB static files to parity with LiteSpeed."
        ]
      },
      {
        id: "b03", tag: "Batches 1–5", short: "Micro-Opts + Zstd", date: "2026-06-06", commit: "2d80a25", era: 0, eraName: "Phase 1–7 Foundation",
        regime: "same-session loopback A/B (prod live, ±10% noise floor)",
        title: "Batches 1–5 — Multi-Codec Egress, OR-Folding & Lazy Headers",
        summary: "Five source-level micro-optimization batches: lazy header map access, Cow CGI env keys, literal-prefix rule filtering, zstd > br > gzip negotiation, and OR-condition regex folding.",
        kpis: [
          { v: "31.3k rps", d: "+1% vs 31.0k (c=40)", n: true, l: "PHP/LSAPI H1 throughput" },
          { v: "28 → 1", d: "regex evals per bot block", n: false, l: "OR-condition regex folding" },
          { v: "78.6k rps", d: "vs 72.3k old (within noise)", n: true, l: "Heavy .htaccess H1 A/B" }
        ],
        chart: {
          title: "Batches 1–5 Same-Session Loopback A/B (2d80a25 vs 8c74fe4)",
          sub: "loopback ab -k -n 30000 -c 100 · 2026-06-06 · k req/s",
          unit: "k rps",
          series: ["Pre-opts (8c74fe4)", "Batches 1–5 (2d80a25)"],
          rows: [
            ["windowsforum (heavy, uncacheable)", [72.3, 78.6]],
            ["moontimenow (heavy, cacheable)", [83.0, 85.1]],
            ["mcp (light static)", [87.6, 88.8]],
            ["PHP/LSAPI H1 (c=40)", [31.0, 31.3]]
          ],
          foot: "Source: RESULTS.md Batches 1–5 — proved remaining gap was allocator + codegen fixed cost, not regex eval"
        },
        notes: [
          "Honest negative/neutral throughput result: once the DFA prefilter was in place, 302-rule evaluation was no longer the bottleneck.",
          "Proved that the remaining deficit was per-request fixed cost (glibc malloc contention and generic x86-64-v1 codegen), directly motivating Batch 6."
        ]
      },
      {
        id: "b04", tag: "Batch 6", short: "PGO + mimalloc", date: "2026-06-07", commit: "5091dfc", era: 0, eraName: "Phase 1–7 Foundation",
        regime: "controlled same-session loopback A/B · exact-PID isolation",
        title: "Batch 6 — Codegen Tier: Native ISA, mimalloc & PGO",
        summary: "Switched global allocator to mimalloc, enabled -C target-cpu=native (AVX-512 on x86_64, Neoverse-N1 on ARM64), and built with 3-step Profile-Guided Optimization (scripts/build-pgo.sh).",
        kpis: [
          { v: "84.3k rps", d: "+11.8% vs baseline (75.4k)", n: false, l: "Heavy .htaccess H1 (matches LSWS 84.3k)" },
          { v: "93.0k rps", d: "+5.2% vs baseline (88.3k)", n: false, l: "Light static H1 (/robots.txt)" },
          { v: "mimalloc", d: "per-thread heaps", n: false, l: "Eliminated glibc arena mutex contention" }
        ],
        chart: {
          title: "Batch 6 Codegen Tier A/B (5091dfc vs 8c74fe4) + LiteSpeed Reference",
          sub: "loopback ab -k -n 30000 -c 100 · 2026-06-07 · k req/s",
          unit: "k rps",
          series: ["Baseline (8c74fe4)", "Codegen Tier (5091dfc)", "LiteSpeed 6.3.5"],
          rows: [
            ["windowsforum (heavy .htaccess H1)", [75.4, 84.3, 84.3]],
            ["mcp (light static H1)", [88.3, 93.0, 87.8]]
          ],
          foot: "Source: RESULTS.md Batch 6 — first above-noise raw-serving win, closing the H1 rewrite gap with LiteSpeed"
        },
        notes: [
          "Heavy .htaccess gained +11.8% because its allocation-heavy per-request fixed cost was directly reduced by mimalloc thread-local heaps and PGO branch layout.",
          "Established the rule: a non-PGO build is not a valid benchmark (~10% layout delta alone)."
        ]
      },
      {
        id: "b05", tag: "LSCache + H2 Fix", short: "Single-Flight & Cache", date: "2026-06-07", commit: "dc38d640", era: 1, eraName: "Cache & Transport Breakthroughs",
        regime: "loopback PGO suite · scripts/bench-report.py",
        title: "Single-Flight Wakeup Fix, H2 Work-Stealing & Origin Page Cache",
        summary: "Fixed a single-flight follower lost-wakeup that serialized concurrent misses, added H2 single-connection stream fan-out across idle cores, cached open_beneath resolution (1s TTL), and shipped hj-pagecache.",
        kpis: [
          { v: "19,912 rps", d: "101× vs uncached PHP (196 rps)", n: false, l: "152 KB forum homepage cache HIT (p50 2ms)" },
          { v: "165.9k rps", d: "up from 2,939 rps (56×)", n: false, l: "Heavy .htaccess H2 at c=50" },
          { v: "250.8k rps", d: "ahead of LSWS (220.5k)", n: false, l: "H2 1 KB static at c=50 (PGO retrained)" },
          { v: "44.8k rps", d: "ahead of LSWS (38.5k at c=40)", n: false, l: "PHP/LSAPI H1 hello-world" }
        ],
        chart: {
          title: "Post-Fix PGO Build vs Commercial LiteSpeed 6.3.5",
          sub: "loopback HTTPS PGO · 2026-06-07 · k req/s",
          unit: "k rps",
          series: ["httpjet (PGO 2026-06-07)", "LiteSpeed 6.3.5"],
          rows: [
            ["H2 static empty (c=50)", [266.9, 244.5]],
            ["H2 static 1 KB (c=50)", [250.8, 220.5]],
            ["H2 light rewrite (/robots.txt, c=100)", [230.3, 193.7]],
            ["H2 heavy rewrite (/robots.txt, c=100)", [161.0, 206.8]],
            ["H1 static 1 KB (c=50)", [94.7, 82.4]],
            ["H1 heavy rewrite (/robots.txt, c=100)", [87.3, 84.3]],
            ["PHP/LSAPI GET H1 (c=40)", [44.8, 38.5]]
          ],
          foot: "Source: scripts/bench-results/httpjet-sweep-fixed.csv, httpjet-rewrite-fixed.csv, httpjet-php-fixed.csv"
        },
        notes: [
          "Registering followers on the single-flight leader's Notify before pre-wait lookup eliminated 10s tail stalls on uncacheable misses (H1 c=50 jumped 298 → 72,371 RPS; H2 jumped 2,939 → 165,939 RPS).",
          "H2 single-connection fan-out (spawning stream handlers when live connections < workers) lifted 1-conn 64-stream heavy rewrite from 52.5k → 116k RPS (2.2×, 0.97 → 4.42 cores).",
          "1s open_beneath serve cache dropped openat syscalls from 20,000 → 0 per window (+12% static, +11% heavy rewrite)."
        ]
      },
      {
        id: "b06", tag: "io_uring", short: "monoio Transport", date: "2026-06-21", commit: "30b7fda", era: 1, eraName: "Cache & Transport Breakthroughs",
        regime: "loopback transport A/B · monoio io_uring vs tokio/epoll",
        title: "Unconditional Pure-io_uring (monoio) Transport",
        summary: "Replaced the tokio/epoll TCP and tokio/quinn UDP adapters with a thread-per-core monoio io_uring transport across H1, native H2, and QUIC/H3, plus an on-core static/cache fast path.",
        kpis: [
          { v: "+19%", d: "vs tokio/epoll H1", n: false, l: "HTTP/1.1 throughput gain" },
          { v: "+22%", d: "vs tokio/epoll H2", n: false, l: "HTTP/2 (h2c / TLS) throughput gain" },
          { v: "+14–20%", d: "vs tokio/quinn H3", n: false, l: "HTTP/3 over io_uring UDP gain" },
          { v: "0 syscalls", d: "on-core fast path", n: false, l: "Hot-tier cache & memo serves stay on core" }
        ],
        chart: {
          title: "Pure io_uring (monoio) Transport Relative Gain over Tokio/Epoll",
          sub: "loopback smoke A/B · 2026-06-21 · relative throughput index (tokio = 100%)",
          unit: "% index",
          series: ["tokio / epoll + quinn", "monoio io_uring"],
          rows: [
            ["HTTP/1.1 keep-alive", [100, 119]],
            ["HTTP/2 multiplexed", [100, 122]],
            ["HTTP/3 over QUIC (UDP)", [100, 117]]
          ],
          foot: "Source: CLAUDE.md / RESULTS.md 2026-06-21 transport cutover; vendored monoio-rustls adds real vectored writev"
        },
        notes: [
          "Each worker pins one monoio io_uring runtime per SO_REUSEPORT listener fd; cheap work (H1 codec, native hj-h2, QUIC driver, fast-path memo, static files, and page-cache hits) never crosses threads.",
          "Vendored monoio-rustls fork added real vectored writev so all queued TLS records flush in a single socket write."
        ]
      },
      {
        id: "b07", tag: "v0.0.1", short: "3-Way + Fast Memo", date: "2026-08-28", commit: "456711f5", era: 2, eraName: "Dedicated 3-Way & Egress Receipts",
        regime: "dedicated-host PGO 3-way (quiet box) + live prod telemetry",
        title: "v0.0.1 — Dedicated 3-Way vs OLS/nginx, Fast-Path Memo & Prod Telemetry",
        summary: "Added the default-on per-worker finished-response memo (fast_memo, 1s TTL, header/UA vary-set) and ran an uncontended dedicated-host 3-way benchmark against OpenLiteSpeed and nginx.",
        kpis: [
          { v: "937.0k rps", d: "vs OLS 687.2k (+36%)", n: false, l: "H2 empty static at c=200 (907.7k at c=50)" },
          { v: "298.0k rps", d: "vs OLS 283.3k / nginx 125.4k", n: false, l: "806-line .htaccess H2 (c=100, PGO)" },
          { v: "+81% H2", d: "137k → 248k rps (+43% H1)", n: false, l: "Fast-path memo A/B on forum chain" },
          { v: "0.2% CPU", d: "138 µs/req · 1.55 IPC", n: false, l: "httpjet share of 9.99 ms prod latency" }
        ],
        chart: {
          title: "Dedicated-Host 3-Way PGO: httpjet vs OpenLiteSpeed vs nginx",
          sub: "quiet dedicated host · 2026-08-27..28 · k req/s",
          unit: "k rps",
          series: ["httpjet v0.0.1", "OpenLiteSpeed", "nginx"],
          rows: [
            ["H2 static empty (c=50)", [907.7, 792.8, null]],
            ["H2 static empty (c=200)", [937.0, 687.2, null]],
            ["H2 static 1 KB (c=200)", [803.9, 790.5, null]],
            ["H2 heavy 806-line .htaccess (c=100)", [298.0, 283.3, 125.4]],
            ["H1 heavy 806-line .htaccess (c=100)", [168.7, 169.1, 145.6]],
            ["H1 static empty (c=1000)", [202.1, 183.4, null]]
          ],
          foot: "Source: bench-results/versus5-dedicated-final-20260827.csv & compare-rewrite-memo-vary-pgo.csv"
        },
        notes: [
          "Fast-path memo (per-worker, 1s TTL, 64 MiB/worker) caches finished 200 responses keyed by listener, scheme, vhost, URI, Accept-Encoding, and the parse-time .htaccess header/UA vary-set (+43% H1, +81% H2, verified byte-identical across 192 parity cells).",
          "Live production telemetry (2026-08-30): mean request 9.99 ms = 8.96 ms LSAPI PHP TTFB (89.7%) + 1.03 ms everything else (httpjet CPU ~138 µs/req, cache hit ~38 µs, rewrite 5.4 µs, cache lookup 3.2 µs)."
        ]
      },
      {
        id: "b08", tag: "v0.0.2", short: "sendfile & kTLS", date: "2026-09-23", commit: "f987d7cd", era: 2, eraName: "Dedicated 3-Way & Egress Receipts",
        regime: "loopback 1 MiB egress receipts (c=50) + per-vhost dict tuning",
        title: "v0.0.2 — Nonblocking sendfile(2), Hardware-Gated kTLS & Dict L6",
        summary: "Shipped bounded nonblocking sendfile(2) for plain H1 and hardware-offload-gated kernel TLS (--ktls=auto) for TLS 1.3 H1, plus per-vhost zstd dictionary level tuning (windowsforum.com=6).",
        kpis: [
          { v: "4,852.5 rps", d: "38.8 Gbps · 10.08 ms mean", n: false, l: "1 MiB plaintext H1 sendfile (c=50)" },
          { v: "2,999.7 rps", d: "vs 2,944.9 forced sw-kTLS", n: false, l: "1 MiB TLS 1.3 H1 rustls (--ktls=off)" },
          { v: "−50% CPU", d: "for +4% tmpfs footprint", n: false, l: "windowsforum.com=6 dict zstd level" }
        ],
        chart: {
          title: "1 MiB File Egress Receipts at c=50 (5,000 requests)",
          sub: "loopback · 2026-09-09 · req/s",
          unit: "rps",
          series: ["httpjet v0.0.2"],
          rows: [
            ["Plaintext H1 sendfile(2)", [4852.5]],
            ["TLS 1.3 H1 rustls (kTLS off)", [2999.7]],
            ["TLS 1.3 H1 software kTLS (virtual GVE NIC)", [2944.9]]
          ],
          foot: "Source: bench-results/httpjet-sendfile-sendfile-release.csv & httpjet-ktls-sendfile-*-20260909.csv"
        },
        notes: [
          "--ktls=auto inspects ethtool tls-hw-tx-offload on the default route NIC and refuses virtual NICs (such as GCE gve) because software kTLS adds per-record kernel transitions without saving AEAD work.",
          "Lowering windowsforum.com internal dictionary zstd level from 12 to 6 halved background encode CPU while adding only +4% page-rounded tmpfs footprint."
        ]
      },
      {
        id: "b09", tag: "v0.0.3", short: "openat2 + H3 PGO", date: "2026-09-27", commit: "6e36d652", era: 2, eraName: "Dedicated 3-Way & Egress Receipts",
        regime: "6-pair ABBA loopback PGO A/B (H2 warm/nodict + H3 20k req)",
        title: "v0.0.3 — Rooted openat2 File-Tier Opens & HTTP/3 QPACK PGO",
        summary: "Replaced multi-step hot file-tier opens with rooted openat2(RESOLVE_BENEATH | RESOLVE_NO_SYMLINKS) and expanded PGO training to drive HTTP/3 QPACK dynamic-table paths.",
        kpis: [
          { v: "28.7k rps", d: "+0.64% ABBA · p50 0.43 ms", n: false, l: "HTTP/3 QUIC cache-hit (20k req)" },
          { v: "+11.7%", d: "/help/cookies/ no-dict A/B", n: false, l: "H2 file-tier cold/no-dict serve" },
          { v: "+4.46%", d: "/help/smilies/ warm dict A/B", n: false, l: "H2 warm dict-backed cache hit" }
        ],
        chart: {
          title: "v0.0.3 vs v0.0.2 Interleaved ABBA Pairs",
          sub: "loopback PGO · 2026-09-27 · req/s",
          unit: "k rps",
          series: ["v0.0.2 (previous)", "v0.0.3 (openat2 + H3 PGO)"],
          rows: [
            ["H3 QUIC static/cache (peak pair)", [26.9, 28.7]],
            ["H2 warm dict /help/cookies/ (pair 5)", [13.1, 13.5]],
            ["H2 warm dict /help/smilies/ (pair 5)", [6.6, 8.0]]
          ],
          foot: "Source: bench-results/httpjet-0.0.3-vs-previous-h2-warm-20260927.csv & -h3-20260927.csv"
        },
        notes: [
          "Hot file-tier opens now issue a single rooted openat2(RESOLVE_BENEATH | RESOLVE_NO_SYMLINKS) syscall against the pinned store directory fd.",
          "HJPC v3 container format bumped to reject pre-#539 symlinked cache artifacts once at boot."
        ]
      },
      {
        id: "b10", tag: "v0.0.9", short: "CPU & PMU Campaign", date: "2026-10-18", commit: "d4a4e333", era: 3, eraName: "CPU, TLS & Zero-Fault Campaign",
        regime: "PMU hardware counters (x86 + ARM64) + live prod telemetry",
        title: "v0.0.9 — Early Bridge, .htaccess Access Memo & Idle Ticker Parking",
        summary: "Six targeted CPU reductions (#958–#964): parked idle access-log tickers, skipped /proc/self/fd readlink when openat2 proves no symlinks, bypassed fast-path double lookup on cookied PHP routes, and memoized per-file .htaccess access-rule matches.",
        kpis: [
          { v: "−54..63%", d: "TLS-core wakes 32/s → 0", n: false, l: "Idle process CPU reduction" },
          { v: "13.0% → 2.7%", d: "−79% share of process CPU", n: false, l: "access_decision_for_request CPU" },
          { v: "−30% / −44%", d: "cookied guest / PHP TLS CPU", n: false, l: "Early bridge + access memo (x86)" },
          { v: "−18% instr", d: "ARM64 PMU instructions/req", n: false, l: "Voidrune PHP path (−11% guest, −8.5% hit)" }
        ],
        chart: {
          title: "v0.0.9 Relative CPU & PMU Instruction Reductions vs v0.0.8",
          sub: "x86_64 CPU/req & ARM64 (voidrune) PMU instructions/req · 2026-10-18 · % of v0.0.8 (lower is better)",
          unit: "% of v0.0.8",
          series: ["v0.0.8 baseline (100%)", "v0.0.9 (#958–#964)"],
          rows: [
            ["x86 TLS PHP request CPU/req", [100, 56]],
            ["x86 TLS cookied guest page CPU/req", [100, 70]],
            ["x86 idle process CPU", [100, 41]],
            ["ARM64 PMU instructions/req (W2 PHP)", [100, 82]],
            ["ARM64 PMU instructions/req (W6 cookied)", [100, 89]],
            ["ARM64 PMU instructions/req (W1 cache hit)", [100, 91.5]]
          ],
          foot: "Source: RESULTS.md 2026-10-18 v0.0.9 campaign; live x86 prod CPU/req dropped 970 µs → 921 µs at 24.5 rps"
        },
        notes: [
          "Cookied front-controller requests previously ran the on-core static fast path (missing on /threads/*) and then re-ran resolution after bridging to tokio; early-bridging them cut cookied guest CPU by 14.5% (30% over TLS).",
          "Per-file .htaccess access-rule match memo (#963) dropped access_decision_for_request from 13.0% to 2.7% of process CPU."
        ]
      },
      {
        id: "b11", tag: "v0.0.10", short: "TLS Idle + Dict L3", date: "2026-10-18", commit: "f73fcedf", era: 3, eraName: "CPU, TLS & Zero-Fault Campaign",
        regime: "live production x86_64 + ARM64 (voidrune) metrics & tokio CPU",
        title: "v0.0.10 — Certified-Peer TLS Idle Window & ARM64 Dict Level 3",
        summary: "Extended the idle timeout to 1800s for mTLS-verified Cloudflare peers (--trusted-proxy-idle-secs), disabled unused TLS 1.3 post-handshake tickets (--tls-session-tickets 0), and tuned ARM64 dictionary zstd level to 3.",
        kpis: [
          { v: "−78%", d: "0.77 → 0.169 handshakes/req", n: false, l: "ARM64 full TLS handshakes (voidrune)" },
          { v: "−28%", d: "0.052 → 0.0365 (idle closes → 0)", n: false, l: "x86_64 full TLS handshakes" },
          { v: "5.3× faster", d: "3.53 ms → 0.66 ms/page", n: false, l: "moontimenow.com dict zstd L3 encode" },
          { v: "50% → 11%", d: "of voidrune tokio CPU", n: false, l: "Background dictionary recompress share" }
        ],
        chart: {
          title: "v0.0.10 Dictionary Encode Time & TLS Handshake Rate",
          sub: "live production x86_64 & ARM64 · 2026-10-18 · relative % of pre-tuning cost (lower is better)",
          unit: "% cost",
          series: ["Pre-v0.0.10 (100%)", "v0.0.10 tuned"],
          rows: [
            ["moontimenow.com dict encode (3.53 → 0.66 ms)", [100, 18.7]],
            ["thisdayinhistory.ai dict encode (2.11 → 0.41 ms)", [100, 19.4]],
            ["ARM64 full TLS handshakes/req (0.77 → 0.169)", [100, 21.9]],
            ["x86_64 full TLS handshakes/req (0.052 → 0.0365)", [100, 70.2]]
          ],
          foot: "Source: CLAUDE.md / RESULTS.md #486, #489, #967 — zero tmpfs 4 KiB page footprint change on ARM64"
        },
        notes: [
          "Cloudflare never resumes TLS sessions to origins (resumed_total = 0), so closing an idle origin connection after 90s forced a full ECDHE+mTLS handshake; --trusted-proxy-idle-secs 1800 eliminated idle closes.",
          "Setting --tls-session-tickets 0 saved two post-handshake records and ~5% server CPU per handshake."
        ]
      },
      {
        id: "b12", tag: "v0.1.2–0.1.3", short: "Task & LSAPI Pools", date: "2026-10-24", commit: "2f259201", era: 3, eraName: "CPU, TLS & Zero-Fault Campaign",
        regime: "PGO ABBA on x86_64 & ARM64 · perf stat minor-faults & CPU/req",
        title: "v0.1.2 & v0.1.3 — Recycled Task Boxes, LSAPI Pools & Zstd-Only Refresh",
        summary: "Under MIMALLOC_PURGE_DELAY=0 (the #295 swap fix), freed mimalloc pages return to the OS immediately and fault back in on the next request. v0.1.2 pooled H2 stream futures, bridge futures, LSAPI buffers, and codec scratch; v0.1.3 skipped quality-9 brotli on internal refreshes under --cf-send-zstd.",
        kpis: [
          { v: "0.80 → 0.0005", d: "−99.9% faults · −22..32% CPU", n: false, l: "W3s1 H2 static 1 KiB minor faults/req" },
          { v: "1.61 → 0.05", d: "−97% faults · −19..25% CPU", n: false, l: "W3rh2 H2 heavy .htaccess faults/req" },
          { v: "0.41 → 0.001", d: "−99.7% faults · −6% CPU", n: false, l: "W1 H2 page-cache hit faults/req" },
          { v: "−8k faults", d: "& −10 ms per refreshed page", n: false, l: "v0.1.3 zstd-only background refresh" }
        ],
        chart: {
          title: "v0.1.2 Minor Page Faults per 1,000 Requests (v0.1.1 vs v0.1.2)",
          sub: "PGO loopback under MIMALLOC_PURGE_DELAY=0 · 2026-10-24 · minor faults per 1,000 req (lower is better)",
          unit: "faults/1k req",
          series: ["v0.1.1 (unpooled)", "v0.1.2 (Recycled + LSAPI pools)"],
          rows: [
            ["W3rh2 H2 heavy .htaccess (1,610 → 50)", [1610, 50]],
            ["W3s64 H2 static 64 KiB (1,600 → 26)", [1600, 26]],
            ["W3s1 H2 static 1 KiB (800 → 0.5)", [800, 0.5]],
            ["W1 H2 page-cache hit (410 → 1)", [410, 1]],
            ["W2 H2 uncached PHP (250 → 1)", [250, 1]],
            ["W6 H2 cookied hit (190 → 5)", [190, 5]]
          ],
          foot: "Source: PR #1157 (v0.1.2) & commit 0c10fdc4 (v0.1.3)"
        },
        notes: [
          "hj_core::recycle::Recycled<T> pools H2 stream task allocations and uring::bridge task slots per thread so stream teardown never releases pages to the OS.",
          "v0.1.3 eliminated the 60,000-fault bursts every 10 minutes caused by background cache refreshes running quality-9 brotli 16 MiB ring allocations when --cf-send-zstd only ever serves zstd."
        ]
      },
      {
        id: "b13", tag: "v0.1.5", short: "BODY_BUFS Zero-Fault", date: "2026-10-24", commit: "16ed92f9", era: 3, eraName: "CPU, TLS & Zero-Fault Campaign",
        regime: "PGO ABBA on x86_64 & ARM64 · 3,019 workspace tests green",
        title: "v0.1.5 — BODY_BUFS TieredPool, Zero-Copy LSAPI & MAP_POPULATE",
        summary: "Completed the zero-fault campaign (#1163): BODY_BUFS TieredPool<Vec<u8>> (64 KiB/256 KiB/1 MiB) frozen into Bytes via Bytes::from_owner, zero-copy LSAPI PacketReader slices, spawn_blocking variant/dict fills, per-thread PageDict DCtx, MAP_POPULATE tmpfs mmaps, and per-core TLS record size-class retention.",
        kpis: [
          { v: "1.80 → 0.106", d: "−94% minor faults/req", n: false, l: "Streamed 117 KB /login/ over H2" },
          { v: "0.0005", d: "down from 0.0325 in 0.1.4", n: false, l: "W1 H2 page-cache hit faults/req" },
          { v: "0.0002", d: "down from 0.185 in 0.1.4", n: false, l: "W3s1 H2 static 1 KiB faults/req" },
          { v: "125–132 MB", d: "down from 165–195 MB RSS", n: false, l: "500-URL miss→store RSS footprint" }
        ],
        chart: {
          title: "v0.1.5 Minor Page Faults per 1,000 Requests (v0.1.1 → v0.1.4 → v0.1.5)",
          sub: "PGO loopback under MIMALLOC_PURGE_DELAY=0 · 2026-10-24 · minor faults per 1,000 req (lower is better)",
          unit: "faults/1k req",
          series: ["v0.1.1", "v0.1.4", "v0.1.5 (BODY_BUFS + zero-copy)"],
          rows: [
            ["Streamed /login/ 117 KB H2", [1800, 1600, 106]],
            ["W3s1 H2 static 1 KiB", [800, 185, 0.2]],
            ["W1 H2 page-cache hit", [410, 32.5, 0.5]],
            ["Miss→store (500 fresh URLs ×2, per 100 req)", [760, 760, 580]]
          ],
          foot: "Source: PR #1163 (commit 16ed92f9, v0.1.5) — deployed PGO to x86_64 and voidrune (ARM64)"
        },
        notes: [
          "BODY_BUFS.freeze(buf) wraps pooled Vec<u8> buffers in a ref-counted owner via Bytes::from_owner; slicing and cloning stay zero-copy and the underlying capacity returns to the thread-local pool when the last Bytes slice drops.",
          "LSAPI PacketReader::take_body_bytes hands out zero-copy Bytes slices when a response fits the pooled 64 KiB read buffer, eliminating per-chunk heap allocations.",
          "File-tier HJPC mmaps now pass MAP_POPULATE so page tables prefault in one kernel pass instead of per-PTE faults during zstd dictionary decode."
        ]
      }
    ];

    var LENSES = [
      {
        id: "l-rewrite", name: "Heavy .htaccess RPS",
        title: "Heavy .htaccess Static Throughput Across Builds (windowsforum.com/robots.txt)",
        sub: "progression from 0.0.1 baseline through single-flight fix and v0.0.1 fast-path memo · k req/s (higher is better)",
        unit: "k rps",
        series: ["HTTP/1.1", "HTTP/2"],
        rows: [
          ["0.0.1 Baseline (2026-06-01)", [95.8, null]],
          ["Batches 1–5 Micro-Opts (2026-06-06)", [78.6, null]],
          ["Batch 6 Codegen PGO + mimalloc (2026-06-07)", [84.3, null]],
          ["Single-Flight Bug (pre-fix c=50, 2026-06-07)", [0.3, 2.9]],
          ["Post Single-Flight + Serve Memo (2026-06-07)", [87.3, 165.9]],
          ["v0.0.1 Fast-Memo OFF (2026-08-28, c=100)", [107.0, 137.0]],
          ["v0.0.1 Fast-Memo ON (2026-08-28, c=100 PGO)", [168.7, 298.0]],
          ["LiteSpeed 6.3.5 Reference (2026-06-01)", [84.3, 206.8]],
          ["OpenLiteSpeed Reference (2026-08-28, c=100)", [169.1, 283.3]],
          ["nginx Reference (2026-08-28, c=100)", [145.6, 125.4]]
        ],
        foot: "Note: 2026-06-01..07 runs were on shared host; 2026-08-28 3-way was on quiet dedicated host with 806-line chain."
      },
      {
        id: "l-h2", name: "H2 Static RPS",
        title: "HTTP/2 Small-Object Static Throughput Across Builds",
        sub: "1 KB and empty static bodies at c=50..200 · k req/s (higher is better)",
        unit: "k rps",
        series: ["H2 1 KB (c=50)", "H2 empty (c=50)", "H2 empty (c=200)"],
        rows: [
          ["0.0.1 Pre-PGO Retrain (2026-06-01)", [128.0, null, null]],
          ["Post-Fix PGO + Serve Memo (2026-06-07)", [250.8, 266.9, 107.5]],
          ["v0.0.1 Dedicated io_uring + Fast Memo (2026-08-27)", [781.7, 907.7, 937.0]],
          ["LiteSpeed 6.3.5 Reference (2026-06-01)", [220.5, 244.5, 109.6]],
          ["OpenLiteSpeed Reference (2026-08-27)", [749.6, 792.8, 687.2]]
        ],
        foot: "Source: httpjet-sweep-fixed.csv (2026-06-07) and versus5-dedicated-final-20260827.csv (2026-08-27)."
      },
      {
        id: "l-cache", name: "Page Cache & PHP",
        title: "Origin Page Cache Offload & PHP/LSAPI Throughput",
        sub: "loopback PGO · req/s across PHP and cache tiers (higher is better)",
        unit: "k rps",
        series: ["Throughput (k req/s)"],
        rows: [
          ["Full DB-backed XenForo PHP render (196 rps, p50 93ms)", [0.2]],
          ["Origin Page Cache HIT — RAM hot tier (19,912 rps, p50 2ms)", [19.9]],
          ["Origin Page Cache HIT — jetcache tmpfs tier (18,211 rps)", [18.2]],
          ["v0.0.3 HTTP/3 QUIC cache HIT (28,653 rps, p50 0.43ms)", [28.7]],
          ["PHP/LSAPI bench.php H1 — 0.0.1 Baseline (c=40)", [31.0]],
          ["PHP/LSAPI bench.php H1 — Post-Fix PGO (c=40)", [44.8]],
          ["PHP/LSAPI bench.php H1 — LiteSpeed 6.3.5 (c=40)", [38.5]]
        ],
        foot: "Cache hit replaces an 8.96 ms PHP render with a ~38 µs memory/tmpfs serve (101× throughput, 46× lower latency)."
      },
      {
        id: "l-cpu", name: "CPU & Instructions/Req",
        title: "CPU & PMU Instruction Reductions Across the October 2026 Campaign",
        sub: "relative CPU / instruction cost vs v0.0.8 baseline (100% = v0.0.8; lower is better)",
        unit: "% of v0.0.8",
        series: ["v0.0.8 Baseline", "v0.0.9 (#958–#964)", "v0.1.2 (+Recycled Pools)"],
        rows: [
          ["H2 static 1 KiB (W3s1) CPU/req", [100, 96, 68]],
          ["H2 heavy .htaccess (W3rh2) CPU/req", [100, 88, 66]],
          ["TLS cookied guest page (W6) CPU/req", [100, 70, 63]],
          ["TLS uncached PHP (W2) CPU/req", [100, 56, 54.5]],
          ["H2 page-cache hit (W1) CPU/req", [100, 93.5, 88]],
          ["Idle process CPU (ticker parking)", [100, 41, 41]]
        ],
        foot: "Source: RESULTS.md v0.0.9 (#958–#964) and PR #1157 (v0.1.2) PGO A/B measurements."
      },
      {
        id: "l-faults", name: "Minor Page Faults/Req",
        title: "Minor Page Fault Elimination Under MIMALLOC_PURGE_DELAY=0 (v0.1.1 → v0.1.5)",
        sub: "minor page faults per 1,000 requests · PGO loopback (lower is better; 0 = zero-fault steady state)",
        unit: "faults/1k req",
        series: ["v0.1.1 (unpooled)", "v0.1.2 (task+LSAPI pools)", "v0.1.5 (+BODY_BUFS & zero-copy)"],
        rows: [
          ["Streamed 117 KB /login/ over H2", [1800, 1600, 106]],
          ["W3rh2 H2 heavy .htaccess", [1610, 50, 45]],
          ["W3s64 H2 static 64 KiB", [1600, 26, 15]],
          ["W3s1 H2 static 1 KiB", [800, 0.5, 0.2]],
          ["W1 H2 page-cache hit", [410, 1.0, 0.5]],
          ["W2 H2 uncached PHP", [250, 1.0, 0.8]],
          ["W6 H2 cookied cache hit", [190, 5.0, 3.0]]
        ],
        foot: "Source: PR #1157 (v0.1.2) and PR #1163 (v0.1.5) under production MIMALLOC_PURGE_DELAY=0."
      }
    ];

    function esc(s) {
      return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }
    function fmtVal(v) {
      if (v === null || v === undefined) return "—";
      if (v >= 1000) return Math.round(v).toLocaleString();
      return String(v);
    }
    function renderSvgChart(cfg) {
      var W = 740, left = 255, right = 85, top = 8, bh = 14, gap = 3, rgap = 14;
      var series = cfg.series, rows = cfg.rows, unit = cfg.unit;
      var n = series.length;
      var raw = 0;
      rows.forEach(function (r) { r[1].forEach(function (v) { if (v !== null && v > raw) raw = v; }); });
      if (raw <= 0) raw = 1;
      var mag = Math.pow(10, Math.floor(Math.log10(raw / 4)));
      var cands = [1, 2, 2.5, 5, 10], step = cands[4] * mag;
      for (var ci = 0; ci < cands.length; ci++) {
        if (cands[ci] * mag * 4 >= raw) { step = cands[ci] * mag; break; }
      }
      var vmax = step * 4 * 1.06;
      var rowh = n * bh + (n - 1) * gap + rgap;
      var H = top + rows.length * rowh + 24;
      var sx = (W - left - right) / vmax;
      var out = [];
      out.push('<div class="chart" style="margin:14px 0 0"><p class="chart__title">' + esc(cfg.title) + '</p><p class="chart__sub">' + esc(cfg.sub) + '</p>');
      out.push('<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(cfg.title) + '">');
      for (var i = 1; i <= 4; i++) {
        var gx = left + step * i * sx;
        var gv = Number((step * i).toPrecision(6));
        out.push('<line class="grid" x1="' + gx.toFixed(1) + '" y1="' + top + '" x2="' + gx.toFixed(1) + '" y2="' + (H - 20) + '"/>');
        out.push('<text class="lbl" x="' + gx.toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle" style="font-size:10.5px;fill:#8b95ad">' + fmtVal(gv) + ' ' + esc(unit) + '</text>');
      }
      out.push('<line class="axis" x1="' + left + '" y1="' + top + '" x2="' + left + '" y2="' + (H - 20) + '"/>');
      var y = top;
      rows.forEach(function (r) {
        var label = r[0], vs = r[1];
        var cy = y + (n * bh + (n - 1) * gap) / 2;
        out.push('<text class="lbl" x="' + (left - 10) + '" y="' + (cy + 4).toFixed(1) + '" text-anchor="end">' + esc(label) + '</text>');
        for (var si = 0; si < n; si++) {
          var v = vs[si];
          var by = y + si * (bh + gap);
          if (v === null || v === undefined) {
            out.push('<text class="lbl" x="' + (left + 6) + '" y="' + (by + bh - 3) + '" style="fill:#8b95ad;font-size:11px">— not measured in this regime</text>');
            continue;
          }
          var w = Math.max(2, v * sx);
          out.push('<g><rect class="bar s' + (si % 5) + '" x="' + (left + 1) + '" y="' + by + '" width="' + w.toFixed(1) + '" height="' + bh + '"><title>' + esc(series[si]) + ' · ' + esc(label) + ': ' + fmtVal(v) + ' ' + esc(unit) + '</title></rect>');
          out.push('<text class="val" x="' + (left + 1 + w + 6).toFixed(1) + '" y="' + (by + bh - 3) + '">' + fmtVal(v) + '</text></g>');
        }
        y += rowh;
      });
      out.push('</svg>');
      if (n > 1) {
        out.push('<div class="chart__legend">');
        series.forEach(function (s, idx) { out.push('<span class="s' + (idx % 5) + '">' + esc(s) + '</span>'); });
        out.push('</div>');
      }
      if (cfg.foot) out.push('<p class="chart__foot">' + esc(cfg.foot) + '</p>');
      out.push('</div>');
      return out.join("");
    }

    var curIdx = BUILDS.length - 1; /* start on latest build v0.1.5 or allow user to step from 0 */
    curIdx = 0; /* start at slide 1 (0.0.1) so the user can step chronologically through the story */
    var curMode = "deck";
    var curLens = 0;
    var cmpA = 0, cmpB = BUILDS.length - 1;

    var mount = bexp.querySelector(".bexp__interactive");
    if (mount) {
      function renderExplorer() {
        var h = [];
        h.push('<div class="bexp__top">');
        h.push('<div class="bexp__modes" role="tablist" aria-label="Presentation view mode">');
        h.push('<button type="button" class="bexp__mode" role="tab" data-bmode="deck" aria-selected="' + (curMode === "deck") + '">1 · Build Slide Deck (13)</button>');
        h.push('<button type="button" class="bexp__mode" role="tab" data-bmode="traj" aria-selected="' + (curMode === "traj") + '">2 · Workload Trajectories (5)</button>');
        h.push('<button type="button" class="bexp__mode" role="tab" data-bmode="cmp" aria-selected="' + (curMode === "cmp") + '">3 · Build-vs-Build Diff</button>');
        h.push('</div>');
        if (curMode === "deck") {
          h.push('<div class="bexp__nav">');
          h.push('<button type="button" class="bexp__btn" data-bnav="-1"' + (curIdx === 0 ? " disabled" : "") + '>← Prev</button>');
          h.push('<span class="bexp__pos">Build ' + (curIdx + 1) + ' / ' + BUILDS.length + '</span>');
          h.push('<button type="button" class="bexp__btn" data-bnav="1"' + (curIdx === BUILDS.length - 1 ? " disabled" : "") + '>Next →</button>');
          h.push('</div>');
        }
        h.push('</div>');

        if (curMode === "deck") {
          h.push('<div class="bexp__rail" role="tablist" aria-label="Build timeline">');
          BUILDS.forEach(function (b, idx) {
            h.push('<button type="button" role="tab" class="bexp__pill era-' + b.era + '" data-bidx="' + idx + '" aria-selected="' + (idx === curIdx) + '">');
            h.push('<span class="p-tag"><span class="p-dot"></span>' + esc(b.tag) + '</span>');
            h.push('<span class="p-sub">' + esc(b.short) + ' · ' + esc(b.date.slice(5)) + '</span>');
            h.push('</button>');
          });
          h.push('</div>');

          var b = BUILDS[curIdx];
          h.push('<div class="bexp__slide">');
          h.push('<div class="bexp__head">');
          h.push('<h3 class="bexp__title">' + esc(b.title) + '</h3>');
          h.push('<div class="bexp__meta"><span class="badge hj">' + esc(b.eraName) + '</span><span class="badge">' + esc(b.date) + '</span><span class="badge ok">' + esc(b.commit) + '</span></div>');
          h.push('</div>');
          h.push('<p class="bexp__summary">' + esc(b.summary) + '</p>');
          h.push('<div class="bexp__kpis">');
          b.kpis.forEach(function (k) {
            h.push('<div class="bexp__kpi"><div class="bexp__kpi-v">' + esc(k.v) + '</div><span class="bexp__kpi-d' + (k.n ? " neutral" : "") + '">' + esc(k.d) + '</span><div class="bexp__kpi-l">' + esc(k.l) + '</div></div>');
          });
          h.push('</div>');
          h.push(renderSvgChart(b.chart));
          h.push('<ul class="bexp__notes">');
          b.notes.forEach(function (nt) { h.push('<li>' + esc(nt) + '</li>'); });
          h.push('</ul>');
          h.push('<div class="bexp__foot"><span>Regime: ' + esc(b.regime) + '</span><span>Tip: use ← / → arrow keys or click any build pill above</span></div>');
          h.push('</div>');
        } else if (curMode === "traj") {
          h.push('<div class="bexp__lenses" role="toolbar" aria-label="Workload trajectory lenses">');
          LENSES.forEach(function (l, idx) {
            h.push('<button type="button" class="bexp__lens" data-blens="' + idx + '" aria-pressed="' + (idx === curLens) + '">' + esc(l.name) + '</button>');
          });
          h.push('</div>');
          var lens = LENSES[curLens];
          h.push(renderSvgChart(lens));
          h.push('<div class="bexp__foot"><span>Cross-build trajectory lens ' + (curLens + 1) + ' of ' + LENSES.length + '</span><span>Switch lenses above to inspect RPS, cache offload, CPU, or page faults</span></div>');
        } else if (curMode === "cmp") {
          h.push('<div class="bexp__cmp-row">');
          h.push('<label>Baseline Build (A)<select data-bcmp="a">');
          BUILDS.forEach(function (b, idx) {
            h.push('<option value="' + idx + '"' + (idx === cmpA ? " selected" : "") + '>' + esc(b.tag + " — " + b.short + " (" + b.date + ")") + '</option>');
          });
          h.push('</select></label>');
          h.push('<label>Target Build (B)<select data-bcmp="b">');
          BUILDS.forEach(function (b, idx) {
            h.push('<option value="' + idx + '"' + (idx === cmpB ? " selected" : "") + '>' + esc(b.tag + " — " + b.short + " (" + b.date + ")") + '</option>');
          });
          h.push('</select></label>');
          h.push('</div>');
          var ba = BUILDS[cmpA], bb = BUILDS[cmpB];
          h.push('<div class="two" style="margin:10px 0 14px">');
          h.push('<div><h4>A · ' + esc(ba.title) + '</h4><p class="mini" style="margin:0 0 8px">' + esc(ba.date + " · " + ba.commit + " · " + ba.regime) + '</p><p style="font-size:13.5px;margin:0">' + esc(ba.summary) + '</p></div>');
          h.push('<div><h4>B · ' + esc(bb.title) + '</h4><p class="mini" style="margin:0 0 8px">' + esc(bb.date + " · " + bb.commit + " · " + bb.regime) + '</p><p style="font-size:13.5px;margin:0">' + esc(bb.summary) + '</p></div>');
          h.push('</div>');
          h.push(renderSvgChart(ba.chart));
          h.push(renderSvgChart(bb.chart));
        }

        mount.innerHTML = h.join("");
        var activePill = mount.querySelector('.bexp__pill[aria-selected="true"]');
        if (activePill && activePill.scrollIntoView) {
          activePill.scrollIntoView({ block: "nearest", inline: "nearest" });
        }
      }

      bexp.addEventListener("click", function (e) {
        var modeBtn = e.target.closest("[data-bmode]");
        if (modeBtn) { curMode = modeBtn.getAttribute("data-bmode"); renderExplorer(); return; }
        var navBtn = e.target.closest("[data-bnav]");
        if (navBtn) {
          var d = parseInt(navBtn.getAttribute("data-bnav"), 10);
          curIdx = Math.max(0, Math.min(BUILDS.length - 1, curIdx + d));
          renderExplorer();
          return;
        }
        var pillBtn = e.target.closest("[data-bidx]");
        if (pillBtn) {
          curIdx = parseInt(pillBtn.getAttribute("data-bidx"), 10);
          renderExplorer();
          return;
        }
        var lensBtn = e.target.closest("[data-blens]");
        if (lensBtn) {
          curLens = parseInt(lensBtn.getAttribute("data-blens"), 10);
          renderExplorer();
          return;
        }
      });

      bexp.addEventListener("change", function (e) {
        var sel = e.target.closest("[data-bcmp]");
        if (!sel) return;
        if (sel.getAttribute("data-bcmp") === "a") cmpA = parseInt(sel.value, 10);
        else cmpB = parseInt(sel.value, 10);
        renderExplorer();
      });

      bexp.addEventListener("keydown", function (e) {
        if (curMode !== "deck") return;
        if (e.key === "ArrowRight") { e.preventDefault(); if (curIdx < BUILDS.length - 1) { curIdx++; renderExplorer(); } }
        else if (e.key === "ArrowLeft") { e.preventDefault(); if (curIdx > 0) { curIdx--; renderExplorer(); } }
      });

      renderExplorer();
    }
  }

  /* ---------- fullscreen viewport expand / minimize for diagrams, charts & explorer ---------- */
  var EXP_ICO = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4"/></svg><span>Expand</span>';
  var MIN_ICO = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4"/></svg><span>Minimize (Esc)</span>';
  var activeExpanded = null;

  function setExpanded(el, expand) {
    if (!el) return;
    var btn = el.querySelector(":scope > .expbtn");
    if (expand) {
      if (activeExpanded && activeExpanded !== el) setExpanded(activeExpanded, false);
      el.classList.add("is-expanded");
      doc.body.classList.add("has-expanded");
      if (btn) { btn.innerHTML = MIN_ICO; btn.setAttribute("aria-expanded", "true"); btn.setAttribute("title", "Minimize back to page (Esc)"); }
      activeExpanded = el;
    } else {
      el.classList.remove("is-expanded");
      doc.body.classList.remove("has-expanded");
      if (btn) { btn.innerHTML = EXP_ICO; btn.setAttribute("aria-expanded", "false"); btn.setAttribute("title", "Expand to full viewport"); }
      if (activeExpanded === el) activeExpanded = null;
    }
  }

  function attachExpandButtons(root) {
    var targets = Array.prototype.slice.call((root || doc).querySelectorAll(".figure, .chart, .bexp"));
    targets.forEach(function (el) {
      if (el.querySelector(":scope > .expbtn")) return;
      var btn = doc.createElement("button");
      btn.type = "button";
      btn.className = "expbtn";
      btn.setAttribute("aria-expanded", "false");
      btn.setAttribute("aria-label", "Toggle full-viewport view");
      btn.setAttribute("title", "Expand to full viewport");
      btn.innerHTML = EXP_ICO;
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        setExpanded(el, !el.classList.contains("is-expanded"));
      });
      el.insertBefore(btn, el.firstChild);
    });
  }
  attachExpandButtons(doc);
  if (bexp) {
    bexp.addEventListener("click", function () { setTimeout(function () { attachExpandButtons(bexp); }, 0); });
    bexp.addEventListener("change", function () { setTimeout(function () { attachExpandButtons(bexp); }, 0); });
  }
  doc.addEventListener("dblclick", function (e) {
    var fig = e.target.closest(".figure svg, .chart svg");
    if (!fig) return;
    var box = fig.closest(".figure, .chart");
    if (box) setExpanded(box, !box.classList.contains("is-expanded"));
  });

  /* ---------- client-side search ---------- */
  var ov = doc.querySelector(".search-ov"),
      sbtn = doc.querySelector(".searchbtn"),
      input = ov ? ov.querySelector("input") : null,
      results = ov ? ov.querySelector(".search-res") : null;
  /* The zone CSP sets connect-src 'none', so the index is delivered as a script
     (assets/search-index.js sets window.DOCS_INDEX) — script-src 'self' allows it. No fetch. */
  var index = (window.DOCS_INDEX && window.DOCS_INDEX.length) ? window.DOCS_INDEX : null, sel = -1;

  var lastFocus = null;

  function openSearch() {
    if (!ov) return;
    if (!index && window.DOCS_INDEX) index = window.DOCS_INDEX;
    lastFocus = doc.activeElement;
    ov.classList.add("open");
    if (input) { input.value = ""; input.focus(); }
    render("");
  }
  function closeSearch(focusBack) {
    if (ov) ov.classList.remove("open");
    sel = -1;
    if (focusBack && lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function msg(text) { results.textContent = ""; var d = doc.createElement("div"); d.className = "search-empty"; d.textContent = text; results.appendChild(d); }
  function safeRel(u) { /* only allow same-origin relative doc links */ return /^[\w./#-]+$/.test(u || "") ? u : "#"; }

  function render(q) {
    if (!results) return;
    q = (q || "").trim().toLowerCase();
    if (!index) { msg("Loading index…"); return; }
    var out = [];
    if (q) {
      index.forEach(function (pg) {
        if (pg.title.toLowerCase().indexOf(q) > -1)
          out.push({ url: pg.url, page: pg.section, title: pg.title, x: pg.blurb || "" });
        (pg.headings || []).forEach(function (h) {
          if (h.t.toLowerCase().indexOf(q) > -1) out.push({ url: pg.url + "#" + h.id, page: pg.title, title: h.t, x: "" });
        });
      });
    }
    out = out.slice(0, 24);
    sel = -1;
    if (!q) { msg("Type to search the docs."); return; }
    if (!out.length) { msg("No matches for “" + q + "”."); return; }
    /* build with DOM nodes (textContent) — no innerHTML, no XSS surface */
    results.textContent = "";
    out.forEach(function (r) {
      var a = doc.createElement("a"); a.href = safeRel(r.url);
      var p = doc.createElement("span"); p.className = "p"; p.textContent = r.page; a.appendChild(p);
      var t = doc.createElement("div"); t.className = "t"; t.textContent = r.title; a.appendChild(t);
      if (r.x) { var x = doc.createElement("div"); x.className = "x"; x.textContent = r.x; a.appendChild(x); }
      results.appendChild(a);
    });
  }

  if (sbtn) sbtn.addEventListener("click", openSearch);
  if (input) input.addEventListener("input", function () { render(input.value); });
  if (ov) ov.addEventListener("click", function (e) { if (e.target === ov) closeSearch(true); });
  if (results) results.addEventListener("mousemove", function () { /* allow hover selection */ });

  function shouldOpenSearchFromUrl() {
    if (window.location.hash === "#search") return true;
    try {
      return new URLSearchParams(window.location.search).get("search") === "1";
    } catch (e) {
      return /(?:^|[?&])search=1(?:&|$)/.test(window.location.search);
    }
  }
  if (shouldOpenSearchFromUrl()) setTimeout(openSearch, 0);

  doc.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && activeExpanded) { e.preventDefault(); setExpanded(activeExpanded, false); return; }
    if ((e.key === "/" && !/^(INPUT|TEXTAREA)$/.test(doc.activeElement.tagName)) ||
        ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) { e.preventDefault(); openSearch(); return; }
    if (e.key === "Escape" && sidebar && sidebar.classList.contains("open")) { closeDrawer(true); return; }
    if (!ov || !ov.classList.contains("open")) return;
    if (e.key === "Escape") { closeSearch(true); return; }
    if (e.key === "Tab") {
      var f = Array.prototype.slice.call(ov.querySelectorAll('input, a[href], button, [tabindex]:not([tabindex="-1"])')).filter(function (el) {
        return !el.disabled && el.offsetParent !== null;
      });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
      return;
    }
    var items = results ? Array.prototype.slice.call(results.querySelectorAll("a")) : [];
    if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(sel + 1, items.length - 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(sel - 1, 0); }
    else if (e.key === "Enter" && sel > -1 && items[sel]) { window.location.href = items[sel].getAttribute("href"); return; }
    items.forEach(function (a, i) { a.classList.toggle("sel", i === sel); if (i === sel) a.scrollIntoView({ block: "nearest" }); });
  });
})();
