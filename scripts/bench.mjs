import { readFileSync, writeFileSync } from 'node:fs';
import { arch, platform, release } from 'node:os';
import { performance } from 'node:perf_hooks';
import { integer, parseOptions } from './cli-options.mjs';
import { chromiumRuntime, startLocalServer } from './browser-tools.mjs';
import { frameMetrics } from './bench-metrics.mjs';

let server;
let browser;
try {
  const options = parseOptions(process.argv.slice(2), ['seed', 'duration', 'out']);
  const seed = integer(options.seed, 'seed');
  const duration = Number(options.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('--duration phải lớn hơn 0.');
  const contract = JSON.parse(readFileSync(new URL('../game.contract.json', import.meta.url), 'utf8'));
  const { chromium, executablePath } = chromiumRuntime();
  server = await startLocalServer();
  browser = await chromium.launch({
    executablePath,
    headless: process.env.LAB_HEADLESS === '1',
    args: ['--window-size=1280,720', '--disable-frame-rate-limit', '--disable-gpu-vsync']
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const url = new URL('/bench.html', server.url);
  url.search = new URLSearchParams({ seed, duration }).toString();
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(globalThis.__benchResult), undefined, { timeout: (duration + 38) * 1000 });
  const data = await page.evaluate(() => globalThis.__benchResult);
  if (data.error) throw new Error(data.error);
  const result = {
    contract_version: contract.contract_version,
    ...frameMetrics(data.intervals),
    load_ms: Math.max(0, Math.round(data.firstFrameEpoch - performance.timeOrigin)),
    peak_mem_mb: null,
    vsync_off: true,
    renderer: `${data.renderer} · Chromium ${browser.version()}`,
    os: `${platform()} ${release()} ${arch()}`
  };
  writeFileSync(options.out, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server?.close();
}
