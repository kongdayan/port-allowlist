import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { parseArgs } from 'node:util';
const { values } = parseArgs({ options: { port: { type: 'string', default: '8810' } } });
const root = resolve('site-dist');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};
http
  .createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      const pathname =
        decodeURIComponent(url.pathname).replace(/^\/port-allowlist(?=\/|$)/, '') || '/';
      let path = resolve(root, '.' + pathname);
      if (path !== root && !path.startsWith(root + sep)) throw Error('Invalid path');
      if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html');
      const data = await readFile(path);
      response.writeHead(200, {
        'Content-Type': types[extname(path)] || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(data);
    } catch {
      response.writeHead(404);
      response.end('Not found');
    }
  })
  .listen(Number(values.port), 'localhost', () =>
    console.log('Static docs and demo: http://localhost:' + values.port + '/port-allowlist/'),
  );
