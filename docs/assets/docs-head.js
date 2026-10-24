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
  <button class="searchbtn" aria-label="Search docs">search <kbd>/</kbd></button>
  <button class="menubtn" aria-label="Menu" aria-expanded="false">☰</button>
</header>
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
  const searchSlot = body.querySelector('script[src="assets/search-index.min.js?v=20261024i"]') || body.querySelector('script[src="assets/docs.min.js?v=20261024i"]');
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
