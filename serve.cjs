/* Loopback-only static game server. Run: node dog-dash/serve.cjs
 * Brotli/gzip compression keeps startup light; source assets remain authoritative.
 * This server has no dependencies. Directly opening index.html still works.
 */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const root = __dirname;
const port = Number(process.env.PORT || 8081);
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.md': 'text/plain' };
const cache = new Map();
const server = http.createServer((req, res) => {
  res.sendDate = false;
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
  let relative;
  try { relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400).end(); return; }
  const file = path.resolve(root, '.' + (relative.endsWith('/') ? relative + 'index.html' : relative));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) { res.writeHead(404).end('Not found'); return; }
    const accepted = req.headers['accept-encoding'] || '';
    const text = ['.html', '.css', '.js', '.json', '.svg', '.md'].includes(path.extname(file));
    const encoding = text && /\bbr\b/.test(accepted) ? 'br' : text && /\bgzip\b/.test(accepted) ? 'gzip' : '';
    const key = file + '|' + encoding;
    let entry = cache.get(key);
    if (!entry || entry.modified !== stat.mtimeMs) {
      try {
        const source = fs.readFileSync(file);
        const body = encoding === 'br' ? zlib.brotliCompressSync(source) : encoding === 'gzip' ? zlib.gzipSync(source) : source;
        entry = { modified: stat.mtimeMs, body }; cache.set(key, entry);
      } catch { res.writeHead(500).end('Unable to read asset'); return; }
    }
    const headers = { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Content-Length': entry.body.length, 'Cache-Control': 'no-store' };
    if (encoding) { headers['Content-Encoding'] = encoding; headers.Vary = 'Accept-Encoding'; }
    res.writeHead(200, headers); res.end(req.method === 'HEAD' ? undefined : entry.body);
  });
});
server.on('error', error => { console.error(`Could not start game server: ${error.message}`); process.exitCode = 1; });
module.exports = server;
if (require.main === module) server.listen(port, '127.0.0.1', () => console.log(`Good Dog Dash: http://localhost:${server.address().port}/`));
