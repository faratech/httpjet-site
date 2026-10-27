(() => {
  document.documentElement.classList.add('js');

  if (document.querySelector('header.hdr') || document.querySelector('.search-ov')) return;

  const content = document.querySelector('main.content');
  if (!content) return;

  const toNodes = html => {
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    return Array.from(tpl.content.childNodes);
  };

  const appendNodes = (target, nodes) => {
    for (const node of nodes) {
      target.appendChild(node);
    }
  };

  const header = `
<header class="hdr">
  <div class="wordmark"><a href="./"><b>httpjet</b></a> <span class="seg">·docs</span></div>
  <div class="grow"></div>
  <nav aria-label="Primary">
    <a href="./">Overview</a>
    <a href="quickstart.html" class="hide-sm">Quickstart</a>
    <a href="architecture.html" class="hide-sm">Architecture</a>
    <a href="page-cache.html" class="hide-sm">Page cache</a>
    <a href="cli.html" class="hide-sm">CLI</a>
    <a href="performance.html" class="hide-sm">Performance</a>
    <a href="https://httpjet.net/" class="ext repo">httpjet.net</a>
  </nav>
  <div class="hdr-audio" id="epicPlayer" style="--track-progress:0%" role="group" aria-label="Synth soundtrack player">
    <button class="abtn nav" id="audioPrev" type="button" aria-label="Previous epic track" title="Previous epic track">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h2v14H6zM10 12l8-7v14z"/></svg>
    </button>
    <button class="abtn main" id="audio" type="button" aria-label="Play epic music" aria-pressed="false" title="Epic mode synth soundtrack">
      <span class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
    </button>
    <button class="abtn nav" id="audioNext" type="button" aria-label="Next epic track" title="Next epic track">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 5h2v14h-2zM6 5l8 7-8 7z"/></svg>
    </button>
    <div class="audio-meta">
      <span class="track" id="audioTrack">10-track sequence</span>
      <span class="time" id="audioTime">2-5 min synths</span>
    </div>
    <label class="volume" title="Volume">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.1-3.8v7.6a4.5 4.5 0 0 0 2.1-3.8z"/></svg>
      <input id="audioVolume" type="range" min="0" max="6" step="0.1" value="6" aria-label="Volume">
    </label>
  </div>
  <button class="searchbtn" aria-label="Search docs">search <kbd>/</kbd></button>
  <button class="menubtn" aria-label="Menu" aria-expanded="false">☰</button>
</header>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<div class="scrim" aria-hidden="true"></div>
`;

  const sidebar = (() => {
    const groups = [
      ["Guide", [['Overview', './'], ['Quickstart', 'quickstart.html'], ['Architecture', 'architecture.html'], ['Capabilities &amp; limits', 'capabilities.html']]],
      ["Internals", [['Protocol stacks', 'protocols.html'], ['TLS, ACME &amp; OCSP', 'certificates.html'], ['LSAPI &amp; PHP', 'lsapi.html'], ['Proxy &amp; gateways', 'gateways.html'], ['Rewrite &amp; .htaccess', 'rewrite.html'], ['Security &amp; access control', 'security.html'], ['Page cache', 'page-cache.html'], ['Compression', 'compression.html']]],
      ["Running it", [['Configuration', 'configuration.html'], ['CLI reference', 'cli.html'], ['Operations', 'operations.html'], ['Observability', 'observability.html'], ['Admin API &amp; reload', 'admin-api.html'], ['Extending httpjet', 'extensions.html'], ['Performance', 'performance.html'], ['Conformance &amp; testing', 'conformance.html'], ['Migrating from LiteSpeed', 'migration.html']]],
    ];

    let html = '<nav class="sidebar" aria-label="Documentation sections">';
    for (const [eyebrow, links] of groups) {
      html += `<div class="nav-group"><span class="nav-eyebrow">${eyebrow}</span>`;
      for (const [label, href] of links) {
        html += `<a class="nav-link" href="${href}">${label}</a><div class="nav-sub"></div>`;
      }
      html += '</div>';
    }
    return html + '</nav>';
  })();

  const toc = `
<aside class="tocwrap">
  <div class="toc-title">On this page</div>
  <nav class="toc" aria-label="On this page"></nav>
</aside>
`;

  const searchOverlay = `
<div class="search-ov" role="dialog" aria-modal="true" aria-label="Search docs">
  <div class="search-box">
    <input type="text" placeholder="Search the docs…" aria-label="Search the docs" autocomplete="off" spellcheck="false">
    <div class="search-res"></div>
  </div>
</div>
`;

  const shell = document.createElement('div');
  shell.className = 'shell';
  const parent = content.parentElement;
  parent.insertBefore(shell, content);
  appendNodes(shell, toNodes(sidebar));
  shell.appendChild(content);
  appendNodes(shell, toNodes(toc));

  const body = document.body;
  const top = document.createDocumentFragment();
  appendNodes(top, toNodes(header));
  body.insertBefore(top, shell);
  const searchSlot = body.querySelector('script[src="assets/search-index.min.js?v=20261027f"]') || body.querySelector('script[src="assets/docs.min.js?v=20261027f"]');
  if (searchSlot) {
    const fragment = document.createDocumentFragment();
    appendNodes(fragment, toNodes(searchOverlay));
    body.insertBefore(fragment, searchSlot);
  } else {
    appendNodes(body, toNodes(searchOverlay));
  }

  const cleanPath = location.pathname.replace(/\/+$/, '');
  const lastSeg = cleanPath.split('/').pop() || '';
  const slug = (!lastSeg || lastSeg === 'docs' || lastSeg === 'index' || lastSeg === 'index.html')
    ? 'index.html'
    : (lastSeg.endsWith('.html') ? lastSeg : lastSeg + '.html');
  const links = shell.querySelectorAll('.nav-link');
  for (const link of links) {
    if ((slug === 'index.html' && link.getAttribute('href') === './') || link.getAttribute('href') === slug) {
      link.classList.add('active');
      break;
    }
  }
})();
