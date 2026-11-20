import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { arch, cpus, platform, release } from 'node:os';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PHASE2_PLAYWRIGHT || 'playwright');
const cwd = fileURLToPath(new URL('../', import.meta.url));
const proof = fileURLToPath(new URL('../docs/proof/', import.meta.url));
const server = spawn(process.execPath, ['scripts/serve.mjs'], {
  cwd, env: { ...process.env, PORT: '0' }, windowsHide: true, stdio: ['ignore', 'pipe', 'inherit']
});
let browser;

function serverUrl() {
  return new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error('Máy chủ không trả về địa chỉ.')), 6000);
    server.once('error', (error) => { clearTimeout(timeout); reject(error); });
    server.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Máy chủ thoát với mã ${code}.`)); });
    server.stdout.on('data', (chunk) => {
      output += chunk.toString();
      const url = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
      if (url) { clearTimeout(timeout); resolve(url); }
    });
  });
}

async function label(page, id) {
  return page.locator('#' + id).textContent();
}

function click(page, name) {
  return page.getByRole('button', { name, exact: true }).click();
}

async function sampleFps(page) {
  await page.waitForTimeout(1300);
  return page.evaluate(() => new Promise((resolve) => {
    const start = performance.now();
    let frames = 0;
    const sample = (time) => {
      frames++;
      const duration = time - start;
      if (duration < 5000) {
        requestAnimationFrame(sample);
        return;
      }
      resolve({ frames, duration_ms: Math.round(duration), average_fps: Number((1000 * frames / duration).toFixed(2)) });
    };
    requestAnimationFrame(sample);
  }));
}

async function fixture(page, value) {
  await page.evaluate((selected) => { window.__phase2Fixture = selected; }, value);
}

try {
  const base = await serverUrl();
  const args = process.env.PHASE2_SWIFTSHADER === '1'
    ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [];
  browser = await chromium.launch({ executablePath: process.env.PHASE2_BROWSER || undefined, headless: true, args });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (entry) => { if (entry.type() === 'error') errors.push(entry.text()); });
  const source = readFileSync(new URL('../src/game.mjs', import.meta.url), 'utf8');
  const anchor = 'constructor(tuning, seed, scenario = {}, number = 1) {';
  assert.ok(source.includes(anchor), 'Night constructor for browser fixtures');
  const injected = source.replace(anchor, anchor + `
    if (globalThis.__phase2Fixture === 'win') {
      scenario = { random_motes: false, random_shades: false, random_drifters: false, wind_enabled: false,
        player: { carried: 10 },
        lanterns: MAPS[number].lanterns.map((pos, i) => ({
          id: 'L' + (i + 1), lit: i > 0, pos: i === 0 ? [0, 0, 0] : pos
        })) };
    } else if (globalThis.__phase2Fixture === 'lose') {
      scenario = { player: { flames: 0 } };
    } else if (globalThis.__phase2Fixture === 'countdown') {
      scenario = { time_left_s: 10.2, random_motes: false, random_shades: false };
    }
  `);
  await page.route('**/src/game.mjs', (route) => route.fulfill({
    status: 200, contentType: 'text/javascript; charset=utf-8', body: injected
  }));
  const audio = readFileSync(new URL('../src/audio.mjs', import.meta.url), 'utf8');
  const audioAnchor = 'play(name) {';
  assert.ok(audio.includes(audioAnchor), 'Audio event entry point');
  await page.route('**/src/audio.mjs', (route) => route.fulfill({
    status: 200, contentType: 'text/javascript; charset=utf-8',
    body: audio.replace(audioAnchor, audioAnchor + ' (globalThis.__phase2AudioEvents ??= []).push(name);')
  }));

  await page.goto(base, { waitUntil: 'networkidle' });
  await click(page, 'Bắt đầu hành trình');
  await page.getByRole('heading', { name: 'Đảo Bến' }).waitFor();
  await click(page, 'Vào Đêm');
  await page.locator('#hud').waitFor();
  const fps = {};
  const scores = [];
  mkdirSync(proof, { recursive: true });

  await page.keyboard.press('Escape');
  await page.getByRole('heading', { name: 'Tạm dừng' }).waitFor();
  const pausedTime = await label(page, 'timer');
  await page.waitForTimeout(1100);
  assert.equal(await label(page, 'timer'), pausedTime);
  await click(page, 'Cài đặt');
  await page.locator('#volume').focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await page.locator('#sensitivity').focus();
  await page.keyboard.press('End');
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('dao-den-long-settings'))),
    { volume: 1, sensitivity: 200 });
  await click(page, 'Quay lại');
  await click(page, 'Tiếp tục');
  await page.locator('#overlay').waitFor({ state: 'hidden' });
  await page.keyboard.press('Shift');
  await page.waitForFunction(() => / s$/.test(document.querySelector('#dash-status').textContent));
  await page.keyboard.press('p');
  await page.getByRole('heading', { name: 'Tạm dừng' }).waitFor();
  await fixture(page, 'countdown');
  await click(page, 'Chơi lại Đêm');
  await page.locator('#timer.urgent').waitFor();
  await page.waitForFunction(() => window.__phase2AudioEvents?.includes('countdown'));
  await page.keyboard.press('Escape');
  await page.getByRole('heading', { name: 'Tạm dừng' }).waitFor();
  await fixture(page, 'lose');
  await click(page, 'Chơi lại Đêm');
  await page.getByRole('heading', { name: 'Đêm chưa sáng' }).waitFor();
  await fixture(page, null);
  await click(page, 'Chơi lại Đêm');

  for (const [index, title] of ['Đảo Bến', 'Đảo Cau', 'Đảo Chuông'].entries()) {
    const night = index + 1;
    await page.waitForFunction((label) => document.querySelector('#night-label').textContent.includes(label), title);
    assert.equal(await label(page, 'lit'), `0 / ${night + 4}`);
    fps[night] = await sampleFps(page);
    await page.screenshot({ path: proof + `phase-2-night-${night}.png` });

    await page.keyboard.press('Escape');
    await page.getByRole('heading', { name: 'Tạm dừng' }).waitFor();
    await fixture(page, 'win');
    await click(page, 'Chơi lại Đêm');
    await page.waitForFunction(() => document.querySelector('#carried').textContent === '10 / 10');
    await page.keyboard.press('e');
    await page.getByRole('heading', { name: night === 3 ? 'Bình Minh' : 'Đảo đã sáng' }).waitFor();
    scores.push(Number(await label(page, 'score')));
    if (night === 3) {
      assert.ok((await label(page, 'overlay-copy')).includes(`Tổng điểm ${scores.reduce((a, b) => a + b, 0)}.`));
      await page.screenshot({ path: proof + 'phase-2-dawn.png' });
    } else {
      await click(page, 'Đêm kế tiếp');
      await page.getByRole('heading', { name: night === 1 ? 'Đảo Cau' : 'Đảo Chuông' }).waitFor();
      await fixture(page, null);
      await click(page, 'Vào Đêm');
    }
  }

  await click(page, 'Về menu');
  await page.reload({ waitUntil: 'networkidle' });
  await click(page, 'Cài đặt');
  assert.equal(await page.locator('#volume').inputValue(), '1');
  assert.equal(await page.locator('#sensitivity').inputValue(), '200');
  assert.deepEqual(errors, []);
  const gpu = await page.evaluate(() => {
    const canvas = document.querySelector('#world canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER);
  });
  const resolution = await page.locator('#world canvas').evaluate(({ width, height }) => [width, height]);
  assert.deepEqual(resolution, [1280, 720]);
  const result = {
    environment: { os: `${platform()} ${release()} ${arch()}`, cpu: cpus()[0]?.model, node: process.version,
      chromium: browser.version(), gpu, viewport: '1280x720', render_buffer: resolution, device_pixel_ratio: 1 },
    fps, verified: ['menu', 'introductions', 'pause_resume', 'dash_hud', 'loss_and_retry',
      'three_night_progression', 'total_at_dawn', 'settings_persisted', 'urgent_timer_and_countdown_audio'], scores_with_win_fixtures: scores,
    browser_errors: []
  };
  writeFileSync(proof + 'phase-2-browser.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  assert.ok(Object.values(fps).every(({ average_fps }) => average_fps >= 30), '30 FPS trung bình ở mọi Đêm');
} finally {
  if (browser) await browser.close();
  server.kill();
}
