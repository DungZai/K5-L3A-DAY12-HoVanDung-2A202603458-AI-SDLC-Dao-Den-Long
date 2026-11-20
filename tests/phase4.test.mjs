import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { benchmarkCamera, benchmarkNight, stepBenchmark } from '../src/benchmark-scene.mjs';
import { activeKeys, changeKey, DEFAULT_KEYS, loadKeys } from '../src/controls.mjs';
import { scoreSubmission } from '../src/score-table.mjs';
import { frameMetrics } from '../scripts/bench-metrics.mjs';
import { readLeaderboard, recordScore } from '../scripts/leaderboard-store.mjs';
import { contract, tuning } from './headless.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

function tempFolder(t) {
  const directory = mkdtempSync(join(tmpdir(), 'ddl-release-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('benchmark v1.3 dùng đúng số thực thể, dầu cố định, wander và camera chuẩn', () => {
  assert.equal(contract.contract_version, '1.3');
  assert.equal(contract.bench_cmd, 'node scripts/bench.mjs');
  const night = benchmarkNight(tuning, 42);
  const initial = night.snapshot();
  assert.deepEqual(benchmarkNight(tuning, 42).snapshot(), initial);
  assert.equal(initial.shades.length, 200);
  assert.equal(initial.motes.length, 100);
  assert.deepEqual(benchmarkCamera(0), [30, 15, 0]);
  assert.ok(benchmarkCamera(3.75)[2] > 29.99999);
  assert.ok(Math.abs(benchmarkCamera(15)[0] - 30) < 1e-9);
  for (let index = 0; index < 710; index++) stepBenchmark(night);
  const final = night.snapshot();
  assert.equal(final.shades.length, 200);
  assert.ok(final.shades.every(({ state }) => state === 'wander'));
  assert.notDeepEqual(final.shades, initial.shades);
  assert.deepEqual(final.motes, initial.motes);
  assert.deepEqual(final.lanterns, initial.lanterns);
  assert.deepEqual(final.lanterns.filter(({ lit }) => lit).map(({ id, fuel }) => [id, fuel]),
    [['L1', 100], ['L2', 100], ['L3', 100]]);
  assert.deepEqual(final.player, initial.player);
});

test('FPS trung bình, 1% chậm nhất và phân vị 95 dùng thời gian thực của từng khung', () => {
  assert.deepEqual(frameMetrics([...Array(99).fill(10), 40]), {
    avg_fps: 97.087, p1_low_fps: 25, frame_ms_p95: 10, frames: 100
  });
  assert.equal(frameMetrics([...Array(99).fill(10), 30, 50]).p1_low_fps, 25);
  assert.throws(() => frameMetrics([]), /Không đo được/);
});

test('soak chạy 10 Đêm cùng tiến trình, giữ thứ tự và ghi RSS', (t) => {
  const output = join(tempFolder(t), 'soak.json');
  const result = spawnSync(process.execPath, ['--expose-gc', 'scripts/soak.mjs', '--seed', '7', '--nights', '10', '--out', output],
    { cwd: root, encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.status, 0, result.stderr);
  const data = JSON.parse(readFileSync(output, 'utf8'));
  assert.equal(data.nights, 10);
  assert.equal(data.crashes, 0);
  assert.equal(data.results.length, 10);
  assert.ok(data.results.every((state) => ['lost', 'won'].includes(state)));
  assert.ok(data.mem_start_mb > 0 && data.mem_end_mb > 0 && data.mem_end_mb <= 1.2 * data.mem_start_mb);
});

test('bảng xếp hạng kiểm tra tên, giữ top 10, phá hòa theo giờ và CLI đọc cùng dữ liệu', (t) => {
  const directory = tempFolder(t);
  assert.deepEqual(readLeaderboard(directory), { entries: [] });
  assert.throws(() => scoreSubmission({ name: 'A' }), /Tên cần/);
  assert.throws(() => scoreSubmission({ name: 'May', score: 0, nights_won: 4, seed: 7 }), /không hợp lệ/);
  for (let index = 0; index < 11; index++) {
    recordScore(directory, { name: `May_${index}`, score: index, nights_won: 1, seed: 7 });
  }
  recordScore(directory, { name: 'Den_B', score: 100, nights_won: 3, seed: 42 }, new Date('2026-11-20T02:00:00Z'));
  recordScore(directory, { name: 'Den_A', score: 100, nights_won: 3, seed: 42 }, new Date('2026-11-20T01:00:00Z'));
  const board = readLeaderboard(directory);
  assert.deepEqual(board.entries.slice(0, 2), [
    { name: 'Den_A', score: 100, nights_won: 3, seed: 42, achieved_at: '2026-11-20T01:00:00.000Z' },
    { name: 'Den_B', score: 100, nights_won: 3, seed: 42, achieved_at: '2026-11-20T02:00:00.000Z' }
  ]);
  assert.equal(board.entries.length, 10);
  const path = join(directory, 'export.json');
  const cli = spawnSync(process.execPath, ['scripts/serve.mjs', '--export-leaderboard', path],
    { cwd: root, env: { ...process.env, DDL_DATA_DIR: directory }, encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), board);
});

test('đổi được đủ 9 hành động, phát hiện phím trùng và khôi phục mặc định', () => {
  let keys = loadKeys();
  assert.equal(activeKeys(keys).get('KeyP'), 'pause');
  assert.match(changeKey(keys, 'jump', 'KeyW').error, /đang dùng/);
  assert.match(changeKey(keys, 'interact', 'ShiftRight').error, /đang dùng/);
  for (const [index, action] of Object.keys(DEFAULT_KEYS).entries()) {
    const code = `Digit${index + 1}`;
    keys = changeKey(keys, action, code).bindings;
    assert.equal(activeKeys(keys).get(code), action);
  }
  assert.deepEqual(loadKeys(keys), keys);
  assert.deepEqual(loadKeys({ ...keys, jump: keys.dash }), DEFAULT_KEYS);
  assert.deepEqual(loadKeys(), DEFAULT_KEYS);
});
