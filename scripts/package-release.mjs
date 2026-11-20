import { cpSync, copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const target = resolve(root, 'dist', `dao-den-long-v${version}`);

function copy(from, to = from) {
  const destination = join(target, to);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(join(root, from), destination);
}

for (const file of [
  'index.html', 'bench.html', 'styles.css', 'game.contract.json', 'LICENSE', 'CREDITS.md', 'CHANGELOG.md',
  'scripts/serve.mjs', 'scripts/leaderboard-store.mjs', 'scripts/headless.mjs', 'scripts/cli-options.mjs',
  'scripts/soak.mjs', 'scripts/bench.mjs', 'scripts/bench-metrics.mjs', 'scripts/browser-tools.mjs'
]) copy(file);
cpSync(join(root, 'src'), join(target, 'src'), { recursive: true });
copy('docs/release-run.md', 'README.md');
copy('node_modules/three/build/three.module.js', 'vendor/three.module.js');
copy('node_modules/three/LICENSE', 'vendor/THREE-LICENSE.txt');
console.log(target);
