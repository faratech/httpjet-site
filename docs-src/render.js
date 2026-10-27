// Render every *.mmd in ./src to ./out/<name>.svg with a dark theme matching docs.css.
const puppeteer = require(process.env.PUPPETEER_PATH || '/web/node_modules/puppeteer');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'diagrams');
const OUT = path.join(__dirname, 'rendered');
fs.mkdirSync(OUT, { recursive: true });
const mermaidJs = fs.readFileSync(path.join(__dirname, 'node_modules/mermaid/dist/mermaid.min.js'), 'utf8');

const themeVariables = {
  darkMode: true,
  background: '#0e1424',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '13px',
  primaryColor: '#141b2e',
  primaryTextColor: '#e8ecf6',
  primaryBorderColor: '#2c3856',
  secondaryColor: '#13203a',
  secondaryTextColor: '#e8ecf6',
  secondaryBorderColor: '#818cf8',
  tertiaryColor: '#0e1424',
  tertiaryTextColor: '#c2cadd',
  tertiaryBorderColor: '#222c44',
  lineColor: '#5b6b93',
  textColor: '#e8ecf6',
  mainBkg: '#141b2e',
  nodeBorder: '#2c3856',
  clusterBkg: '#0a0d17',
  clusterBorder: '#222c44',
  titleColor: '#e8ecf6',
  edgeLabelBackground: '#0a0d17',
  // sequence
  actorBkg: '#141b2e', actorBorder: '#818cf8', actorTextColor: '#e8ecf6', actorLineColor: '#2c3856',
  signalColor: '#c2cadd', signalTextColor: '#e8ecf6',
  labelBoxBkgColor: '#13203a', labelBoxBorderColor: '#818cf8', labelTextColor: '#e8ecf6',
  loopTextColor: '#e8ecf6', noteBkgColor: '#1a2140', noteBorderColor: '#fbbf73', noteTextColor: '#e8ecf6',
  activationBkgColor: '#1e2a4a', activationBorderColor: '#22d3ee',
  sequenceNumberColor: '#07090f',
  // state
  labelColor: '#e8ecf6', altBackground: '#0a0d17',
  // pie / others
  pie1: '#22d3ee', pie2: '#818cf8', pie3: '#e879f9', pie4: '#fbbf73', pie5: '#34d399', pie6: '#5b6b93',
  pieTitleTextColor: '#e8ecf6', pieSectionTextColor: '#07090f', pieLegendTextColor: '#e8ecf6', pieStrokeColor: '#07090f',
  // git / class / er
  attributeBackgroundColorOdd: '#0e1424', attributeBackgroundColorEven: '#141b2e',
  // xychart
  xyChart: { backgroundColor: '#0e1424', titleColor: '#e8ecf6', xAxisLabelColor: '#c2cadd', xAxisTitleColor: '#c2cadd', xAxisTickColor: '#2c3856', xAxisLineColor: '#2c3856', yAxisLabelColor: '#c2cadd', yAxisTitleColor: '#c2cadd', yAxisTickColor: '#2c3856', yAxisLineColor: '#2c3856', plotColorPalette: '#22d3ee, #818cf8, #e879f9, #fbbf73' },
};

(async () => {
  const browser = await puppeteer.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body style="background:#0e1424"></body></html>');
  await page.addScriptTag({ content: mermaidJs });
  await page.evaluate((tv) => {
    window.mermaid.initialize({ startOnLoad: false, theme: 'base', themeVariables: tv, securityLevel: 'loose', flowchart: { htmlLabels: false, curve: 'basis', padding: 10, nodeSpacing: 30, rankSpacing: 40, wrappingWidth: 320 }, sequence: { useMaxWidth: true, mirrorActors: false, boxMargin: 8, messageMargin: 30, actorMargin: 40 }, state: { useMaxWidth: true }, themeCSS: '.edgeLabel rect{fill:#0a0d17;} .edgeLabel{color:#c2cadd} .label text, span{fill:#e8ecf6;} .cluster-label text{fill:#8b95ad;font-size:11px;letter-spacing:.06em} .node rect,.node polygon,.node circle,.node path{stroke-width:1.2px}' });
  }, themeVariables);

  const files = fs.readdirSync(SRC).filter(f => f.endsWith('.mmd'));
  const only = process.argv[2];
  for (const f of files) {
    if (only && !f.startsWith(only)) continue;
    const src = fs.readFileSync(path.join(SRC, f), 'utf8');
    const id = 'd' + f.replace(/[^a-z0-9]/gi, '');
    try {
      const svg = await page.evaluate(async (id, src) => {
        const { svg } = await window.mermaid.render(id, src);
        return svg;
      }, id, src);
      // strip fixed id-based style scoping to avoid collisions across multiple inline SVGs: keep as-is (ids are unique per file)
      fs.writeFileSync(path.join(OUT, f.replace(/\.mmd$/, '.svg')), svg);
      console.log('ok', f, (svg.length / 1024).toFixed(1) + 'K');
    } catch (e) {
      console.error('FAIL', f, e.message.slice(0,400));
    }
  }
  await browser.close();
})();
