import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Night } from '../src/game.mjs';

const { tuning, contract_version } = JSON.parse(readFileSync(new URL('../game.contract.json', import.meta.url), 'utf8'));
if (contract_version !== '1.0') {
  console.error('Dùng tag phase-1 để tạo lại bằng chứng theo Test Contract v1.0.');
  process.exit(1);
}
const script = fileURLToPath(new URL('./headless.mjs', import.meta.url));
const evidence = new URL('../docs/proof/', import.meta.url);
const seed = 1847;
const distance = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const isolated = { random_motes: false, random_shades: false };

// Drive the default layout with ordinary inputs from start to finish with both spawn systems on.
function victoryRoute() {
  const night = new Night(tuning, seed);
  const frames = [];
  let last;
  let objective;
  while (night.state === 'playing') {
    const { pos, carried } = night.player;
    const byDistance = (a, b) => distance(a.pos, pos) - distance(b.pos, pos);
    if (!objective || objective.lit) {
      objective = night.lanterns.filter((lantern) => !lantern.lit).sort(byDistance)[0];
    }
    const ready = carried >= tuning.lantern_cost - objective.deposited;
    const nearbyMotes = night.motes.filter((mote) => Math.hypot(mote.pos[0], mote.pos[2]) < 30);
    const target = ready ? objective : nearbyMotes.sort((a, b) => byDistance(a, b)
      + (distance(a.pos, objective.pos) - distance(b.pos, objective.pos)) * 0.21)[0];
    const interact = ready && night.targetLantern()?.id === objective.id && !last?.interact;
    const pulse = carried >= tuning.pulse_cost + tuning.lantern_cost && !last?.pulse
      && night.shades.some((shade) => shade.state !== 'stunned' && distance(shade.pos, pos) < 1.8);
    const separation = target ? distance(pos, target.pos) : 0;
    const move = separation > 0 && !interact
      ? [0, 2].map((axis) => Number(((target.pos[axis] - pos[axis]) / separation).toFixed(5)))
      : [0, 0];
    const input = { move, interact, pulse };
    if (!last || JSON.stringify(input) !== JSON.stringify(last)) {
      frames.push({ tick: night.tick, ...input });
      last = input;
    }
    night.step(input);
  }
  assert.equal(night.state, 'won', 'Default night must be winnable with ordinary inputs');
  return { frames };
}

function run(directory, label, { scenario, inputs, ticks, snapshot }) {
  const out = join(directory, label + '.jsonl');
  const args = [script, '--seed', String(seed), '--night', '1', '--ticks', String(ticks),
    '--snapshot-every', String(snapshot), '--out', out];
  for (const [key, value] of Object.entries({ scenario, inputs })) {
    if (!value) continue;
    const input = join(directory, `${label}-${key}.json`);
    writeFileSync(input, JSON.stringify(value));
    args.push('--' + key, input);
  }
  const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const raw = readFileSync(out, 'utf8');
  const records = raw.trimEnd().split('\n').map(JSON.parse);
  const events = records.filter(({ type }) => type === 'event');
  return { raw, events, end: records.at(-1) };
}

const directory = mkdtempSync(join(tmpdir(), 'dao-den-long-proof-'));
try {
  const route = victoryRoute();
  const fullOptions = { inputs: route, ticks: 10800, snapshot: 600 };
  const first = run(directory, 'default-night', fullOptions);
  const second = run(directory, 'default-night-repeat', fullOptions);
  assert.equal(first.raw, second.raw);
  assert.equal(first.end.state, 'won');
  assert.equal(first.events.filter(({ name }) => name === 'lantern_lit').length, 5);

  const collisionOptions = {
    ticks: 300,
    snapshot: 10,
    scenario: { ...isolated, player: { carried: 5, flames: 2 }, shades: [{ id: 'INK', pos: [0, 1, 0] }] }
  };
  const collision = run(directory, 'collision', collisionOptions);
  assert.deepEqual(collision.events.map(({ name }) => name), ['player_hit', 'player_hit', 'game_over']);
  assert.equal(collision.events.at(-1).data.reason, 'no_flames');

  const pulseOptions = {
    ticks: 130,
    snapshot: 30,
    scenario: { ...isolated, player: { carried: 4 }, shades: [{ id: 'INK', pos: [3, 1, 0] }] },
    inputs: { frames: [{ tick: 0, pulse: true }, { tick: 2, pulse: false }, { tick: 75, pulse: true }] }
  };
  const pulse = run(directory, 'pulse', pulseOptions);
  assert.equal(pulse.events.filter(({ name }) => name === 'pulse').length, 2);
  assert.deepEqual(pulse.events[0].data.stunned_ids, ['INK']);

  const dawnOptions = { ticks: 100, snapshot: 10, scenario: { ...isolated, time_left_s: 1 } };
  const dawn = run(directory, 'dawn', dawnOptions);
  assert.deepEqual(dawn.events.at(-1).data, { result: 'lost', reason: 'dawn' });

  mkdirSync(evidence, { recursive: true });
  const json = (value) => JSON.stringify(value, null, 2) + '\n';
  const sha256 = createHash('sha256').update(first.raw).digest('hex');
  writeFileSync(new URL('phase-1-route.json', evidence), JSON.stringify(route) + '\n');
  const summary = { seed, contract_version: '1.0', default_night_sha256: sha256,
    repeat_byte_identical: true, default_night: first.end,
    collision: collision.end, pulse: pulse.end, dawn: dawn.end };
  writeFileSync(new URL('phase-1-summary.json', evidence), json(summary));
  for (const [name, result] of Object.entries({ 'default-night': first, collision, pulse, dawn })) {
    writeFileSync(new URL(`phase-1-${name}.jsonl`, evidence), result.raw);
  }
  console.log(json(summary).trimEnd());
} finally {
  rmSync(directory, { recursive: true, force: true });
}
