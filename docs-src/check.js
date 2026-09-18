const puppeteer = require('/web/node_modules/puppeteer');
const pages=['index','quickstart','architecture','capabilities','protocols','certificates','lsapi','gateways','rewrite','security','page-cache','compression','configuration','cli','operations','observability','admin-api','extensions','performance','conformance','migration'];
(async()=>{const b=await puppeteer.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
for(const pg of pages){const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
 await p.setViewport({width:1360,height:900});await p.goto('http://127.0.0.1:18765/docs/'+pg+'.html',{waitUntil:'networkidle0'});
 const r=await p.evaluate(()=>({toc:document.querySelectorAll('.toc a').length,nav:document.querySelectorAll('.nav-link').length,active:!!document.querySelector('.nav-link.active'),tabs:document.querySelectorAll('.tabs').length,diagrams:document.querySelectorAll('.figure.diagram svg').length,charts:document.querySelectorAll('.chart svg').length,scrollW:document.documentElement.scrollWidth,idx:(window.DOCS_INDEX||[]).length}));
 console.log(pg.padEnd(14),JSON.stringify(r),errs.length?'ERR '+errs.join('|'):'');await p.close();}
// functional: search + filter + tabs on cli/page-cache
const p=await b.newPage();await p.goto('http://127.0.0.1:18765/docs/cli.html',{waitUntil:'networkidle0'});
await p.type('.filterbar input','acme');const cnt=await p.$eval('.filterbar .count',e=>e.textContent);
await p.keyboard.press('Escape');await p.click('.searchbtn');await p.type('.search-box input','ocsp');const res=await p.$$eval('.search-res a',a=>a.length);
console.log('filter acme →',cnt,'| search ocsp →',res,'results');await b.close();})();
