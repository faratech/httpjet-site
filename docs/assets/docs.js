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
