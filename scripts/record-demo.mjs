import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromiumRuntime, repoRoot, startLocalServer } from './browser-tools.mjs';

const ffmpeg = process.env.LAB_FFMPEG || 'ffmpeg';
const dist = join(repoRoot, 'dist');
mkdirSync(dist, { recursive: true });
const video = join(dist, 'demo.mp4');
const output = join(dist, 'demo-headless.jsonl');
let server;
let browser;
let encoder;
let captureTimer;
const held = new Set();

function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: repoRoot, encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

const testOutput = run(['--test', 'tests/phase1.test.mjs', 'tests/phase2.test.mjs', 'tests/phase3.test.mjs', 'tests/phase4.test.mjs']);
run(['scripts/headless.mjs', '--seed', '42', '--night', '1', '--ticks', '300', '--out', output]);
const last = readFileSync(output, 'utf8').trimEnd().split('\n').at(-1);
const bench = JSON.parse(readFileSync(join(repoRoot, 'bench.json'), 'utf8'));
const soak = JSON.parse(readFileSync(join(repoRoot, 'soak.json'), 'utf8'));

async function hold(page, next) {
  for (const key of held) {
    if (next.includes(key)) continue;
    await page.keyboard.up(key);
    held.delete(key);
  }
  for (const key of next) {
    if (held.has(key)) continue;
    await page.keyboard.down(key);
    held.add(key);
  }
}

const distance = (from, to) => Math.hypot(from[0] - to[0], from[2] - to[2]);

function toward(from, to) {
  const x = to[0] - from[0];
  const z = to[2] - from[2];
  const keys = [];
  if (Math.abs(x) > 0.18 && Math.abs(x) >= Math.abs(z) * 0.42) keys.push(x > 0 ? 'a' : 'd');
  if (Math.abs(z) > 0.18 && Math.abs(z) >= Math.abs(x) * 0.42) keys.push(z > 0 ? 'w' : 's');
  return keys;
}

async function play(page) {
  await page.getByRole('button', { name: 'Bắt đầu hành trình', exact: true }).click();
  await page.waitForTimeout(2100);
  await page.getByRole('button', { name: 'Vào Đêm', exact: true }).click();
  await page.waitForFunction(() => globalThis.__demoState?.tick > 0);
  const end = Date.now() + 36000;
  let jumped = false;
  let dashed = false;
  let lit;
  while (Date.now() < end) {
    const state = await page.evaluate(() => globalThis.__demoState);
    if (state.state !== 'playing') break;
    const { player } = state;
    const carryingEnough = player.carried >= 10;
    const candidates = (carryingEnough ? state.lanterns.filter(({ lit }) => !lit) : state.motes)
      .filter(({ pos }) => Math.hypot(pos[0], pos[2]) <= 35);
    candidates.sort((a, b) => distance(player.pos, a.pos) - distance(player.pos, b.pos));
    const goal = candidates[0];
    if (carryingEnough && goal && distance(player.pos, goal.pos) <= 1.65) {
      await hold(page, []);
      await page.keyboard.press('e');
      await page.waitForTimeout(800);
      lit = await page.evaluate(() => globalThis.__demoState.lanterns.filter(({ lit }) => lit).length);
      if (lit) break;
    } else {
      await hold(page, goal ? toward(player.pos, goal.pos) : []);
    }
    if (!jumped && state.tick > 70) {
      await page.keyboard.press('Space');
      jumped = true;
    }
    if (!dashed && state.tick > 200) {
      await page.keyboard.press('Shift');
      dashed = true;
    }
    if (player.carried >= 3 && !carryingEnough && player.pulse_cd_s === 0
        && state.shades.some((shade) => distance(player.pos, shade.pos) <= 2.2)) {
      await page.keyboard.press('q');
    }
    await page.waitForTimeout(115);
  }
  await hold(page, []);
  const state = await page.evaluate(() => globalThis.__demoState);
  console.log(JSON.stringify({ demo: 'real_game_input', tick: state.tick,
    carried: state.player.carried, lamps_lit: state.lanterns.filter(({ lit }) => lit).length }));
  await page.waitForTimeout(850);
}

try {
  server = await startLocalServer();
  const { chromium, executablePath } = chromiumRuntime();
  browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const script = readFileSync(new URL('../src/main.mjs', import.meta.url), 'utf8');
  const anchor = "scene.render(night, yaw, night.state === 'paused' ? 0 : seconds);";
  assert.ok(script.includes(anchor));
  await page.route('**/src/main.mjs', (route) => route.fulfill({
    status: 200, contentType: 'text/javascript; charset=utf-8',
    body: script.replace(anchor, anchor + ' globalThis.__demoState = night.snapshot();')
  }));
  await page.goto(server.url, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Bắt đầu hành trình', exact: true }).waitFor();
  const cdp = await page.context().newCDPSession(page);
  encoder = spawn(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '30',
    '-c:v', 'mjpeg', '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-preset', 'veryfast',
    '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', video],
  { stdio: ['pipe', 'ignore', 'inherit'], windowsHide: true });
  const finished = new Promise((resolve, reject) => {
    encoder.once('error', reject);
    encoder.stdin.once('error', reject);
    encoder.once('close', (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg thoát với mã ${code}.`)));
  });
  void finished.catch(() => {});
  let frame;
  let frames = 0;
  cdp.on('Page.screencastFrame', ({ data, sessionId }) => {
    frame = Buffer.from(data, 'base64');
    void cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 78, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 });
  captureTimer = setInterval(() => {
    if (frame && !encoder.stdin.destroyed && !encoder.stdin.writableNeedDrain) {
      encoder.stdin.write(frame);
      frames++;
    }
  }, 1000 / 30);
  await page.waitForTimeout(2000);
  await play(page);

  const passLines = testOutput.split(/\r?\n/).filter((line) => /^\s*(?:ℹ|#) (?:tests|pass|fail)\s/.test(line));
  assert.ok(passLines.length >= 3, 'Thiếu tóm tắt kết quả chạy test.');
  await page.evaluate(({ passLines, last, bench, soak }) => {
    const slide = document.createElement('section');
    slide.style.cssText = 'position:fixed;inset:0;z-index:100;background:#10162b;color:#f5f1e6;padding:38px 58px;font:22px system-ui';
    const header = document.createElement('h1');
    header.textContent = 'Kiểm chứng bản phát hành v1.0.0';
    header.style.cssText = 'margin:0 0 18px;color:#ffe9b0;font:600 42px Georgia';
    const log = document.createElement('pre');
    log.style.cssText = 'font:19px/1.55 monospace;white-space:pre-wrap;margin:0';
    log.textContent = [
      '> npm test', passLines.join('\n'), '',
      '> node scripts/headless.mjs --seed 42 --night 1 --ticks 300 --out run.jsonl', last, '',
      '> node scripts/bench.mjs --seed 42 --duration 30 --out bench.json',
      `FPS trung bình: ${bench.avg_fps}  |  1% thấp: ${bench.p1_low_fps} FPS  |  Tải: ${bench.load_ms} ms`,
      `Khung: ${bench.frames}  |  P95: ${bench.frame_ms_p95} ms  |  Chromium · 1280×720`, '',
      '> node --expose-gc scripts/soak.mjs --seed 7 --nights 10 --out soak.json',
      `${soak.nights} Đêm  |  ${soak.crashes} lỗi  |  RSS: ${soak.mem_start_mb} → ${soak.mem_end_mb} MB`
    ].join('\n');
    slide.append(header, log);
    document.body.append(slide);
  }, { passLines, last, bench, soak });
  await page.waitForTimeout(11500);
  await cdp.send('Page.stopScreencast');
  clearInterval(captureTimer);
  encoder.stdin.end();
  await finished;
  assert.ok(frames >= 450 && frames < 9000, `Độ dài video ngoài phạm vi: ${frames} khung`);
  console.log(`Demo: ${frames} khung, ${(frames / 30).toFixed(1)} giây.`);
} finally {
  clearInterval(captureTimer);
  if (encoder && encoder.exitCode === null) encoder.kill();
  if (browser) await browser.close();
  server?.close();
}
