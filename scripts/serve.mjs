import { createReadStream, existsSync } from 'node:fs';
import { createServer } from 'node:http';

const root = new URL('../', import.meta.url);
const files = new Map([
  ['/', 'index.html'],
  ['/styles.css', 'styles.css'],
  ['/game.contract.json', 'game.contract.json'],
  ['/src/main.mjs', 'src/main.mjs'],
  ['/src/game.mjs', 'src/game.mjs'],
  ['/src/maps.mjs', 'src/maps.mjs'],
  ['/src/player.mjs', 'src/player.mjs'],
  ['/src/hazards.mjs', 'src/hazards.mjs'],
  ['/src/audio.mjs', 'src/audio.mjs'],
  ['/src/scene.mjs', 'src/scene.mjs'],
  ['/vendor/three.module.js', 'node_modules/three/build/three.module.js']
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
const server = createServer((request, response) => {
  const route = request.url.split('?')[0];
  const file = files.get(route);
  if (!file || !['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(404).end();
    return;
  }
  const stream = createReadStream(new URL(file, root));
  stream.on('error', () => response.writeHead(404).end());
  stream.on('open', () => {
    response.setHeader('Content-Type', contentTypes[file.split('.').at(-1)]);
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
