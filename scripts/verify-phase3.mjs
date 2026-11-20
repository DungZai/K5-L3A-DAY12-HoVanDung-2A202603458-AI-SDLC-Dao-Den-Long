import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release } from 'node:os';
import { cli, contract } from '../tests/headless.mjs';
import { phase2Cases } from '../tests/phase2-scenarios.mjs';
import { phase3Cases } from '../tests/phase3-scenarios.mjs';

assert.equal(contract.contract_version, '1.2');

const sampleTicks = {
  relight: [0, 60, 5940, 6000],
  refuel: [0, 1, 3],
  drain: [0, 60, 120, 158, 159, 160],
  'restore-safety': [0, 1, 30, 33],
  'pulse-drain': [0, 1, 15, 120, 121, 122],
  dawn: [0, 15, 45, 60],
  'dawn-out': [0, 1],
  'pause-fuel': [0, 30, 31, 90, 91, 120, 121],
  capacity: [0, 1, 3]
};

const cases = {};
for (const [name, options] of Object.entries(phase3Cases)) {
  const run = cli(options);
  assert.equal(run.status, 0, run.stderr);
  cases[name] = { request: options, snapshots: run.snapshots.filter(({ tick }) => sampleTicks[name].includes(tick)),
    events: run.events, end: run.end };
}
assert.equal(cases.relight.events.find(({ name }) => name === 'lantern_out')?.tick, 6000);
assert.equal(cases.dawn.events.at(-1)?.data.reason, 'dawn_survived');
assert.equal(cases.capacity.snapshots[1].player.capacity, 20);

const baseline = { ...phase3Cases['pause-fuel'], seed: 1847 };
const first = cli(baseline);
const second = cli(baseline);
assert.equal(first.status, 0, first.stderr);
assert.equal(second.status, 0, second.stderr);
assert.equal(first.raw, second.raw);
const full = cli(phase2Cases.performance);
assert.equal(full.status, 0, full.stderr);
assert.equal(full.end.ticks, 18000);
assert.ok(full.elapsedMs <= 30000);

const dir = new URL('../docs/proof/', import.meta.url);
mkdirSync(dir, { recursive: true });
const summary = {
  contract_version: contract.contract_version,
  environment: { os: `${platform()} ${release()} ${arch()}`, cpu: cpus()[0]?.model, node: process.version },
  measurements: { full_night_ticks: full.end.ticks, elapsed_ms: Math.round(full.elapsedMs) },
  determinism: { request: baseline, sha256: createHash('sha256').update(first.raw).digest('hex'), repeat_byte_identical: true },
  cases
};
writeFileSync(new URL('phase-3-headless.json', dir), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ ...summary.measurements, sha256: summary.determinism.sha256,
  repeat_byte_identical: true, cases: Object.keys(cases) }, null, 2));
