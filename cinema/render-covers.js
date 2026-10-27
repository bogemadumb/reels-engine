#!/usr/bin/env node
'use strict';
// node cinema/render-covers.js [demo1 demo2 ...] [--out DIR] — 1080x1920 jpg covers from cinema/cover/cover.html
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
let out = path.join(ROOT, 'out', 'cinema'); const ids = [];
for (let i = 0; i < args.length; i++) { if (args[i] === '--out') out = path.resolve(args[++i]); else ids.push(args[i]); }
if (!ids.length) ids.push('demo1', 'demo2');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, 'cinema', 'cover', decodeURIComponent(req.url.split('?')[0]));
  const q = p.startsWith(path.join(ROOT, 'cinema')) && fs.existsSync(p) && fs.statSync(p).isFile();
  if (!q) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const { chromium } = require('playwright');
  const b = await chromium.launch({ args: ['--font-render-hinting=none', '--disable-lcd-text', '--force-color-profile=srgb', '--disable-gpu'] });
  fs.mkdirSync(out, { recursive: true });
  for (const id of ids) {
    const ctx = await b.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
    const pg = await ctx.newPage();
    pg.on('pageerror', e => console.error('pageerror', e.message));
    await pg.goto(`http://127.0.0.1:${server.address().port}/cover.html#${id}`);
    await pg.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 60000 });
    await pg.waitForTimeout(300);
    const f = path.join(out, `cover-${id}.png`);
    await pg.screenshot({ path: f, type: 'png' });
    console.log(f);
    await ctx.close();
  }
  await b.close(); server.close();
})();
