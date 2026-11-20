import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { arch, cpus, platform, release } from 'node:os';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.LAB_PLAYWRIGHT || process.env.PHASE2_PLAYWRIGHT || 'playwright');
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
  await page.evaluate((selected) => { window.__labFixture = selected; }, value);
}

try {
  const base = await serverUrl();
  const args = (process.env.LAB_SWIFTSHADER ?? process.env.PHASE2_SWIFTSHADER) === '1'
    ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [];
  browser = await chromium.launch({ executablePath: process.env.LAB_BROWSER || process.env.PHASE2_BROWSER || undefined,
    headless: true, args });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (entry) => { if (entry.type() === 'error') errors.push(entry.text()); });
  const source = readFileSync(new URL('../src/game.mjs', import.meta.url), 'utf8');
  const anchor = 'constructor(tuning, seed, scenario = {}, number = 1) {';
  assert.ok(source.includes(anchor), 'Night constructor for browser fixtures');
  const injected = source.replace(anchor, anchor + `
    if (globalThis.__labFixture === 'win') {
      scenario = { random_motes: false, random_shades: false, random_drifters: false, wind_enabled: false,
        time_left_s: 2.2, player: { carried: 10 },
        lanterns: MAPS[number].lanterns.map((pos, i) => ({
          id: 'L' + (i + 1), lit: i > 0, pos: i === 0 ? [0, 0, 0] : pos
        })) };
    } else if (globalThis.__labFixture === 'lose') {
      scenario = { player: { flames: 0 } };
    } else if (globalThis.__labFixture === 'low-fuel') {
      scenario = { time_left_s: 10.2, random_motes: false, random_shades: false,
        player: { carried: 3, successful_lights: 2 },
        lanterns: [{ id: 'L1', pos: [1.25, 0, 1.15], lit: true, fuel: 28 },
          { id: 'L2', pos: [-2.25, 0, 7] }],
        shades: [{ pos: [2.5, 0.8, 5.3], state: 'stunned', state_ticks_left: 600 }] };
    }
  `);
  await page.route('**/src/game.mjs', (route) => route.fulfill({
    status: 200, contentType: 'text/javascript; charset=utf-8', body: injected
  }));
  const scene = readFileSync(new URL('../src/scene.mjs', import.meta.url), 'utf8');
  const drawAnchor = 'renderer.render(scene, camera);';
  assert.ok(scene.includes(drawAnchor), 'Scene render entry point');
  await page.route('**/src/scene.mjs', (route) => route.fulfill({
    status: 200, contentType: 'text/javascript; charset=utf-8',
    body: scene.replace(drawAnchor, `
      if (globalThis.__labFixture === 'low-fuel') {
        globalThis.__fuelVisuals = {
          rim: rim.color.getHex(), halo: shadeHalo.color.getHex(),
          lamps: layout.lamps.slice(0, 2).map((lamp) => ({
            scale: lamp.housing.scale.x, tears: lamp.tears.visible, safety: lamp.safety.visible,
            bar: lamp.meter.group.visible, fill: lamp.meter.fill.scale.x, bar_opacity: lamp.meter.fill.material.opacity,
            lantern_opacity: lamp.glow.material.opacity
          }))
        };
      }
    ` + drawAnchor)
  }));
  const audio = readFileSync(new URL('../src/audio.mjs', import.meta.url), 'utf8');
  const audioAnchor = 'play(name) {';
  assert.ok(audio.includes(audioAnchor), 'Audio event entry point');
  await page.route('**/src/audio.mjs', (route) => route.fulfill({
    status: 200, contentType: 'text/javascript; charset=utf-8',
    body: audio.replace(audioAnchor, audioAnchor + ' (globalThis.__labAudioEvents ??= []).push(name);')
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
  await page.getByRole('checkbox', { name: 'Bảng màu dễ phân biệt' }).check();
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('dao-den-long-settings'))),
    { volume: 1, sensitivity: 200, colorblind: true });
  await click(page, 'Quay lại');
  await click(page, 'Tiếp tục');
  await page.locator('#overlay').waitFor({ state: 'hidden' });
  await page.keyboard.press('Shift');
  await page.waitForFunction(() => / s$/.test(document.querySelector('#dash-status').textContent));
  await page.keyboard.press('p');
  await page.getByRole('heading', { name: 'Tạm dừng' }).waitFor();
  await fixture(page, 'low-fuel');
  await click(page, 'Chơi lại Đêm');
  await page.locator('#timer.urgent').waitFor();
  await page.waitForFunction(() => window.__labAudioEvents?.includes('countdown'));
  await page.waitForFunction(() => window.__fuelVisuals?.lamps[0].bar_opacity < 0.42);
  const dim = await page.evaluate(() => window.__fuelVisuals);
  await page.waitForFunction(() => window.__fuelVisuals?.lamps[0].bar_opacity > 0.96);
  const bright = await page.evaluate(() => window.__fuelVisuals);
  assert.equal(bright.rim, 0x00b3ff);
  assert.equal(bright.halo, 0x00b3ff);
  assert.ok(bright.lamps[0].lantern_opacity > dim.lamps[0].lantern_opacity);
  assert.equal(bright.lamps[0].bar, true);
  assert.equal(bright.lamps[0].tears, false);
  assert.equal(bright.lamps[0].safety, false);
  assert.equal(bright.lamps[1].bar, false);
  assert.equal(bright.lamps[1].tears, true);
  assert.ok(Math.abs(bright.lamps[1].scale / bright.lamps[0].scale - 0.8) < 1e-8);
  const warning = await page.locator('#timer').evaluate((element) => ({
    color: getComputedStyle(element).color, icon: getComputedStyle(element, '::before').content
  }));
  assert.equal(warning.color, 'rgb(255, 255, 255)');
  assert.match(warning.icon, /⚠/);
  assert.equal(await label(page, 'carried'), '3 / 14');
  assert.equal(await page.locator('#mote-slots i:not([hidden])').count(), 14);
  assert.match(await label(page, 'hint'), /Châm dầu/);
  await page.screenshot({ path: proof + 'phase-3-fuel-and-palette.png' });
  await page.keyboard.press('e');
  await page.waitForFunction(() => window.__fuelVisuals?.lamps[0].safety);
  assert.equal(await label(page, 'carried'), '0 / 14');
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

    await page.keyboard.press('Escape');
    await page.getByRole('heading', { name: 'Tạm dừng' }).waitFor();
    await fixture(page, 'win');
    await click(page, 'Chơi lại Đêm');
    await page.waitForFunction(() => document.querySelector('#carried').textContent === '10 / 10');
    await page.keyboard.press('e');
    await page.waitForFunction((count) => document.querySelector('#lit').textContent === `${count} / ${count}`, night + 4);
    assert.equal(await page.locator('#overlay').isHidden(), true);
    await page.getByRole('heading', { name: night === 3 ? 'Bình Minh' : 'Qua Đêm' }).waitFor();
    scores.push(Number(await label(page, 'score')));
    if (night === 3) {
      assert.ok((await label(page, 'overlay-copy')).includes(`Tổng điểm ${scores.reduce((a, b) => a + b, 0)}.`));
      await page.screenshot({ path: proof + 'phase-3-dawn.png' });
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
  assert.equal(await page.locator('#colorblind').isChecked(), true);
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
    fps, verified: ['menu', 'introductions', 'pause_resume', 'dash_hud', 'loss_and_retry', 'no_early_win',
      'three_night_progression', 'total_at_dawn', 'settings_persisted', 'urgent_timer_and_countdown_audio',
      'fuel_meter_blink', 'torn_collapsed_lantern', 'accessible_colors', 'refuel_restores_safety', 'capacity_hud'],
    palette: { rim_hex: '#00B3FF', warning },
    fuel_fixture: { dim, bright }, scores_with_win_fixtures: scores,
    browser_errors: []
  };
  writeFileSync(proof + 'phase-3-browser.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  assert.ok(Object.values(fps).every(({ average_fps }) => average_fps >= 30), '30 FPS trung bình ở mọi Đêm');
} finally {
  if (browser) await browser.close();
  server.kill();
}
