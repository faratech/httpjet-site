const puppeteer = require('/web/node_modules/puppeteer');
const fs=require('fs');
(async()=>{const b=await puppeteer.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});const p=await b.newPage();await p.setViewport({width:1000,height:700});
const svg=fs.readFileSync(process.argv[2],'utf8');await p.setContent(`<body style="background:#0e1424;margin:20px"><div style="width:760px">${svg}</div></body>`);await p.screenshot({path:process.argv[3],fullPage:true});await b.close();})();
