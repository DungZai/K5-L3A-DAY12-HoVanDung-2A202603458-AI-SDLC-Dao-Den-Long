import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release } from 'node:os';
import { cli, contract } from '../tests/headless.mjs';
import { phase2Cases } from '../tests/phase2-scenarios.mjs';

assert.equal(contract.contract_version, '1.1', 'Dùng tag phase-2 để tạo lại bằng chứng theo Test Contract v1.1.');

const sampleTicks = {
  dash: [0, 5, 6, 17, 18],
  pause: [0, 4, 5, 14, 15, 18],
  fall: [0, 1, 60, 61, 65],
  bridge: [0, 90, 180],
  'jump-cau': [0, 30, 84, 90],
  'jump-chuong': [0, 30, 51, 60],
  ramp: [0, 30, 60, 66],
  charm: [0, 100, 600, 700, 2700],
  drifter: [0, 1, 2, 3, 121, 122],
  'drifter-spawn': [0, 1200, 2400],
  wind: [0, 1680, 1799, 1800, 2099, 2100],
  performance: [0, 3000, 12000, 21600]
};

const results = {};
for (const [name, options] of Object.entries(phase2Cases)) {
  const run = cli(options);
  assert.equal(run.status, 0, run.stderr);
  const selected = new Set(sampleTicks[name]);
  results[name] = { request: options,
    snapshots: run.snapshots.filter(({ tick }) => selected.has(tick)),
    events: run.events, end: run.end,
    ...(name === 'performance' ? { elapsed_ms: Math.round(run.elapsedMs) } : {}) };
}

const baseline = { night: 3, seed: 1847, ticks: 2400, snapshot: 30,
  scenario: { lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true }] } };
const first = cli(baseline);
const second = cli(baseline);
assert.equal(first.status, 0, first.stderr);
assert.equal(second.status, 0, second.stderr);
assert.equal(first.raw, second.raw);
assert.equal(results.performance.end.ticks, 21600);
assert.ok(results.performance.elapsed_ms <= 30000);

const directory = new URL('../docs/proof/', import.meta.url);
mkdirSync(directory, { recursive: true });
const summary = {
  contract_version: contract.contract_version,
  environment: { os: `${platform()} ${release()} ${arch()}`, cpu: cpus()[0]?.model, node: process.version },
  determinism: { request: baseline, ticks: first.end.ticks,
    sha256: createHash('sha256').update(first.raw).digest('hex'), repeat_byte_identical: true },
  measurements: { full_night_ticks: results.performance.end.ticks, elapsed_ms: results.performance.elapsed_ms },
  cases: results
};
writeFileSync(new URL('phase-2-headless.json', directory), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ contract: summary.contract_version, ...summary.measurements,
  determinism: summary.determinism, cases: Object.keys(results) }, null, 2));
