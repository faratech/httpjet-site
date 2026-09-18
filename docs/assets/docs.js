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
