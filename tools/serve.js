// Tiny static server for local preview: node tools/serve.js  → http://localhost:5180
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.mp4': 'video/mp4' };
// /ticks stands in for the Google Apps Script (tools/ticks.gs) while previewing: same rules, in memory
const ticks = {}, KEY = /^[a-z0-9-]{1,40}\|[a-z0-9]{1,20}\|[a-z0-9]{1,20}$/;
const json = (res, o) => { res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(o)); };
http.createServer((req, res) => {
  if (req.url.split('?')[0] === '/ticks') {
    if (req.method !== 'POST') return json(res, ticks);
    let body = '';
    req.on('data', c => { body += c; });
    return req.on('end', () => {
      let b = {}; try { b = JSON.parse(body); } catch (e) { return json(res, { error: 'bad json' }); }
      if (!KEY.test(b.key || '')) return json(res, { error: 'bad key' });
      ticks[b.key] = { paid: !!b.paid, kr: Number(b.kr) || 0, at: new Date().toISOString() };
      json(res, ticks);
    });
  }
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || f.includes('_private')) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(d);
  });
}).listen(5180, () => console.log('http://localhost:5180'));
