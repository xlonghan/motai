import http from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePdf, PdfError } from './pdf.mjs';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const {version}=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
const port = Number(process.env.MARKDOWN_DESK_PORT || 4318);
const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.eot': 'application/vnd.ms-fontobject',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
};

if (!existsSync(path.join(root, 'index.html'))) {
  console.error('尚未构建，请先运行 npm install 和 npm run build。');
  process.exit(1);
}

const server = http.createServer(async (request, response) => {
  if (request.url === '/api/pdf' && request.method === 'POST') {
    try {
      const origin = request.headers.origin;
      if (origin !== `http://127.0.0.1:${port}`) throw new PdfError('仅接受本机编辑器发起的 PDF 请求', 403);
      if (!request.headers['content-type']?.startsWith('application/json')) throw new PdfError('请求格式不正确', 415);
      let bytes = 0;
      const chunks = [];
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > 30 * 1024 * 1024) throw new PdfError('文档与图片合计超过 30 MB，请缩小图片后重试', 413);
        chunks.push(chunk);
      }
      const { html } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (typeof html !== 'string' || !html.startsWith('<!doctype html>')) throw new PdfError('缺少有效的文档内容', 400);
      const pdf = await generatePdf(html);
      response.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': pdf.length, 'Cache-Control': 'no-store' });
      response.end(pdf);
    } catch (error) {
      response.writeHead(error.status || 500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ error: error.message || 'PDF 生成失败' }));
    }
    return;
  }
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405); response.end(); return;
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/__health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ app: 'markdown-desk', version, localOnly: true }));
      return;
    }
    const filename = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    const relative = path.relative(root, filename);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      response.writeHead(403); response.end('Forbidden'); return;
    }
    const info = await stat(filename);
    if (!info.isFile()) { response.writeHead(404); response.end('Not found'); return; }
    response.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(filename)] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(filename).pipe(response);
  } catch {
    response.writeHead(404); response.end('Not found');
  }
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') console.error(`端口 ${port} 已被占用。如果墨台已经运行，直接打开 http://127.0.0.1:${port}/ 。`);
  else console.error(error.message);
  process.exit(1);
});
server.listen(port, '127.0.0.1', () => {
  console.log(`\n  墨台 · 本地 Markdown 工作台\n\n  http://127.0.0.1:${port}/\n\n  仅监听本机；按 Ctrl+C 停止。\n`);
});
process.on('SIGINT', () => server.close(() => process.exit(0)));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
