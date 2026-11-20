import { createReadStream, existsSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLeaderboard, recordScore } from './leaderboard-store.mjs';
import { scoreSubmission } from '../src/score-table.mjs';

const root = new URL('../', import.meta.url);
const scoreDir = process.env.DDL_DATA_DIR ? resolve(process.env.DDL_DATA_DIR) : fileURLToPath(new URL('.data/', root));
const args = process.argv.slice(2);
if (args.length) {
  try {
    if (args.length !== 2 || args[0] !== '--export-leaderboard') {
      throw new Error('Dùng --export-leaderboard <tệp.json> để xuất bảng xếp hạng.');
    }
    writeFileSync(args[1], JSON.stringify(readLeaderboard(scoreDir), null, 2) + '\n');
    process.exit(0);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

const vendor = existsSync(new URL('vendor/three.module.js', root))
  ? 'vendor/three.module.js' : 'node_modules/three/build/three.module.js';
const files = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/bench.html', 'bench.html'],
  ['/styles.css', 'styles.css'],
  ['/game.contract.json', 'game.contract.json'],
  ['/src/main.mjs', 'src/main.mjs'],
  ['/src/game.mjs', 'src/game.mjs'],
  ['/src/maps.mjs', 'src/maps.mjs'],
  ['/src/player.mjs', 'src/player.mjs'],
  ['/src/hazards.mjs', 'src/hazards.mjs'],
  ['/src/lanterns.mjs', 'src/lanterns.mjs'],
  ['/src/audio.mjs', 'src/audio.mjs'],
  ['/src/scene.mjs', 'src/scene.mjs'],
  ['/src/score-table.mjs', 'src/score-table.mjs'],
  ['/src/controls.mjs', 'src/controls.mjs'],
  ['/src/leaderboard.mjs', 'src/leaderboard.mjs'],
  ['/src/bench-page.mjs', 'src/bench-page.mjs'],
  ['/src/benchmark-scene.mjs', 'src/benchmark-scene.mjs'],
  ['/vendor/three.module.js', vendor]
]);
const contentTypes = {
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8'
};

if (!existsSync(new URL(files.get('/vendor/three.module.js'), root))) {
  console.error('Thiếu Three.js. Chạy npm ci trước.');
  process.exit(1);
}

const port = Number(process.env.PORT ?? 8080);
const localHost = (request) => /^(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(request.headers.host ?? '');
const json = (response, status, data) => response.writeHead(status, {
  'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'
}).end(JSON.stringify(data));

async function scores(request, response) {
  if (request.method === 'GET') return json(response, 200, readLeaderboard(scoreDir));
  if (request.method !== 'POST') return json(response, 405, { error: 'Phương thức không được hỗ trợ.' });
  if (request.headers.origin && request.headers.origin !== 'http://' + request.headers.host) {
    return json(response, 403, { error: 'Chỉ lưu điểm từ game trên máy này.' });
  }
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) {
    return json(response, 415, { error: 'Cần dữ liệu JSON.' });
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size <= 2048) chunks.push(chunk);
  }
  if (size > 2048) return json(response, 413, { error: 'Dữ liệu quá lớn.' });
  let entry;
  try {
    entry = scoreSubmission(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  } catch (error) {
    return json(response, 400, { error: error instanceof SyntaxError ? 'Dữ liệu JSON không hợp lệ.' : error.message });
  }
  return json(response, 201, recordScore(scoreDir, entry));
}

const server = createServer((request, response) => {
  const route = request.url.split('?')[0];
  if (!localHost(request)) {
    response.writeHead(403).end();
    return;
  }
  if (route === '/api/leaderboard') {
    void scores(request, response).catch(() => {
      json(response, 500, { error: 'Không đọc hoặc ghi được bảng xếp hạng.' });
    });
    return;
  }
  const file = files.get(route);
  if (!file || !['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(404).end();
    return;
  }
  const stream = createReadStream(new URL(file, root));
  stream.on('error', () => response.writeHead(404).end());
  stream.on('open', () => {
    response.setHeader('Content-Type', contentTypes[file.split('.').at(-1)]);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (request.method === 'HEAD') {
      stream.destroy();
      response.end();
    } else {
      stream.pipe(response);
    }
  });
});
server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE'
    ? `Cổng ${port} đang được sử dụng. Mở phiên hiện có hoặc khởi chạy với biến PORT khác.`
    : error.message);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => console.log(`Đảo Đèn Lồng · http://127.0.0.1:${server.address().port}`));
