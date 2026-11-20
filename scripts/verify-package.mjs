import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromiumRuntime, startLocalServer } from './browser-tools.mjs';

const extracted = resolve(process.argv[2] ?? 'dist/dao-den-long-v1.0.0');
const archive = resolve(process.argv[3] ?? 'dist/dao-den-long-v1.0.0-web.zip');
const dataDir = mkdtempSync(join(tmpdir(), 'ddl-verify-package-'));
let browser;
let web;
try {
  assert.ok(!existsSync(join(extracted, 'node_modules')));
  assert.ok(existsSync(join(extracted, 'vendor', 'THREE-LICENSE.txt')));
  const contract = JSON.parse(readFileSync(join(extracted, 'game.contract.json'), 'utf8'));
  assert.equal(contract.contract_version, '1.3');
  web = await startLocalServer({ cwd: extracted, dataDir });
  const { chromium, executablePath } = chromiumRuntime();
  browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(web.url);
  await page.getByRole('button', { name: 'Bắt đầu hành trình', exact: true }).click();
  await page.getByRole('button', { name: 'Vào Đêm', exact: true }).click();
  await page.locator('#hud').waitFor();
  assert.equal(await page.locator('#world canvas').count(), 1);
  assert.equal(await page.locator('#lit').textContent(), '0 / 5');
  assert.deepEqual(errors, []);

  const result = await fetch(new URL('/api/leaderboard', web.url), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Zip_Thu', score: 41, nights_won: 1, seed: 42 })
  });
  assert.equal(result.status, 201);
  const saved = await result.json();
  web.close();
  web = await startLocalServer({ cwd: extracted, dataDir });
  const reloaded = await fetch(new URL('/api/leaderboard', web.url)).then((response) => response.json());
  assert.deepEqual(reloaded, saved);

  const exportPath = join(dataDir, 'export.json');
  const cli = spawnSync(process.execPath, ['scripts/serve.mjs', '--export-leaderboard', exportPath],
    { cwd: extracted, env: { ...process.env, DDL_DATA_DIR: dataDir }, encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.deepEqual(JSON.parse(readFileSync(exportPath, 'utf8')), saved);
  const bytes = readFileSync(archive);
  const proof = {
    contract_version: contract.contract_version, archive_bytes: bytes.length,
    archive_sha256: createHash('sha256').update(bytes).digest('hex'), node: process.version, os: process.platform,
    verified: ['package_without_node_modules', 'bundled_three_license', 'served_webgl_and_entered_night',
      'leaderboard_after_server_restart', 'export_matches_disk'], browser_errors: errors
  };
  writeFileSync(new URL('../docs/proof/phase-4-package.json', import.meta.url), JSON.stringify(proof, null, 2) + '\n');
  console.log(JSON.stringify(proof, null, 2));
} finally {
  if (browser) await browser.close();
  web?.close();
  rmSync(dataDir, { recursive: true, force: true });
}
