/**
 * E2E용 작은 정적 서버. 저장소 루트를 GitHub Pages처럼 그대로 보여 준다.
 *   node tests/e2e/server.mjs [포트]   (기본 4173, 127.0.0.1)
 * 점으로 시작하는 파일·폴더(.env.local 등)와 비밀 설정(*.secret.json), node_modules 는 보여 주지 않는다.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const PORT = Number(process.argv[2] || process.env.LW_E2E_PORT || 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

function blocked(rel) {
  const parts = rel.split(/[\\/]+/).filter(Boolean);
  return parts.some((p) => p.startsWith('.') || p === 'node_modules') || /\.secret\.json$/i.test(rel);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = normalize(join(ROOT, rel));
    if (!(file === ROOT || file.startsWith(ROOT + sep)) || blocked(rel)) {
      res.writeHead(404).end('not found');
      return;
    }
    const st = await stat(file).catch(() => null);
    if (!st || !st.isFile()) {
      res.writeHead(404).end('not found');
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (e) {
    res.writeHead(500).end('error');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`정적 서버: http://127.0.0.1:${PORT}/ (루트 ${ROOT})`);
});
