import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { HZ, Night } from '../src/game.mjs';
import { validateFrames, validateScenario } from '../src/scenario.mjs';

const contract = JSON.parse(readFileSync(new URL('../game.contract.json', import.meta.url), 'utf8'));
const { tuning } = contract;
const isolated = { random_motes: false, random_shades: false };
const newNight = (scenario) => new Night(tuning, 42, { ...isolated, ...scenario });
const near = (value, expected) => assert.ok(Math.abs(value - expected) < 1e-9, `${value} != ${expected}`);
const headless = fileURLToPath(new URL('../scripts/headless.mjs', import.meta.url));

function cli(t, { scenario, inputs, ticks = 100, snapshot = 10 } = {}) {
  const folder = mkdtempSync(join(tmpdir(), 'dao-den-long-'));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const output = join(folder, 'output.jsonl');
  const args = [headless, '--seed', '-42', '--night', '1', '--ticks', String(ticks),
    '--out', output, '--snapshot-every', String(snapshot)];
  for (const [name, data] of Object.entries({ scenario, inputs })) {
    if (data === undefined) continue;
    const path = join(folder, name + '.json');
    writeFileSync(path, JSON.stringify(data));
    args.push('--' + name, path);
  }
  const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
  if (result.status !== 0) return result;
  const raw = readFileSync(output, 'utf8');
  return { ...result, raw, records: raw.trimEnd().split('\n').map(JSON.parse) };
}

test('tick 0, +Z movement, partial frames, yaw and non-dividing snapshot cadence', (t) => {
  const result = cli(t, { scenario: isolated, ticks: 125, snapshot: 30,
    inputs: { frames: [{ tick: 0, move: [0, 1] }, { tick: 60, cam_yaw_deg: 90 }] } });
  assert.equal(result.status, 0, result.stderr);
  const snapshots = result.records.filter(({ type }) => type === 'snapshot');
  assert.deepEqual(snapshots.map(({ tick }) => tick), [0, 30, 60, 90, 120]);
  assert.deepEqual(snapshots[0].player.pos, [0, 0, 0]);
  assert.deepEqual(snapshots[2].player.pos, [0, 0, 6]);
  assert.deepEqual(snapshots[4].player.pos, [6, 0, 6]);
  near(snapshots[4].time_left_s, tuning.night1_duration_s - 2);
  assert.equal(snapshots[4].sim_tick, 120);
  assert.deepEqual(result.records.at(-1), { type: 'end', ticks: 125, state: 'playing', score: 0 });
});

test('diagonal normalization, jump on the rising edge, and landing', () => {
  const night = newNight();
  night.step({ move: [1, 1], jump: true });
  near(Math.hypot(night.player.pos[0], night.player.pos[2]), tuning.player_speed / HZ);
  assert.ok(night.player.pos[1] > 0);
  for (let index = 0; index < HZ; index++) night.step({ jump: true });
  assert.equal(night.player.pos[1], 0);
  night.step({ jump: false });
  night.step({ jump: true });
  assert.ok(night.player.pos[1] > 0);
});

test('pickup uses XZ inclusively and respects capacity', () => {
  const night = newNight({ player: { carried: tuning.carry_capacity - 1 },
    motes: [[tuning.pickup_radius, 10, 0], [0, 0, 0], [tuning.pickup_radius + 0.01, 0, 0]] });
  assert.equal(night.snapshot().score, 0);
  const events = night.step();
  assert.deepEqual(events, [{ type: 'event', tick: 1, name: 'mote_picked', data: { carried: tuning.carry_capacity } }]);
  assert.deepEqual(night.motes.map(({ id }) => id), ['M2', 'M3']);
});

test('partial deposit, held button, inclusivity and exactly one lantern score', () => {
  const night = newNight({ player: { carried: 2 }, lanterns: [{ id: 'L1', pos: [tuning.interact_radius, 4, 0] }] });
  assert.deepEqual(night.step({ interact: true })[0].data, { lantern_id: 'L1', amount: 2, deposited: 2 });
  night.addMote([0, 0, 0]);
  night.addMote([0, 0, 0]);
  assert.deepEqual(night.step({ interact: true }).map(({ name }) => name), ['mote_picked', 'mote_picked']);
  night.step();
  assert.deepEqual(night.step({ interact: true }).map(({ name }) => name), ['deposit', 'lantern_lit']);
  assert.equal(night.lanterns[0].lit, true);
  assert.equal(night.score, 2 * tuning.score.per_mote + tuning.score.per_lantern);
});

test('pulse hits only in range, pushes, stuns, costs light, and has cooldown', () => {
  const night = newNight({ player: { carried: 6 }, shades: [
    { id: 'ink', pos: [tuning.pulse_radius, 1, 0] },
    { pos: [0, 1, tuning.pulse_radius + 0.01] }
  ] });
  const event = night.step({ pulse: true })[0];
  assert.deepEqual(event.data, { stunned_ids: ['ink'] });
  near(night.shades[0].pos[0], tuning.pulse_radius + tuning.pulse_push_m);
  assert.equal(night.snapshot().shades[0].state, 'stunned');
  assert.equal(night.score, tuning.score.per_stun);
  assert.equal(night.player.carried, 6 - tuning.pulse_cost);
  night.step();
  assert.ok(!night.step({ pulse: true }).some(({ name }) => name === 'pulse'));
  while (night.tick < 1 + tuning.pulse_stun_s * HZ) night.step();
  assert.equal(night.shades[0].state, 'chase');
  assert.ok(night.step({ pulse: true }).some(({ name }) => name === 'pulse'));
});

test('damage drops motes, immunity expires precisely, and no-flames ends the run', (t) => {
  const { records } = cli(t, { ticks: 300, scenario: { ...isolated,
    player: { carried: 5, flames: 2 }, shades: [{ pos: [0, 3, 0] }] } });
  const hits = records.filter(({ name }) => name === 'player_hit');
  assert.deepEqual(hits.map(({ tick }) => tick), [1, 1 + tuning.invuln_s * HZ]);
  assert.deepEqual(hits.map(({ data }) => data), [
    { by: 'shade', flames: 1, dropped: 2 }, { by: 'shade', flames: 0, dropped: 1 }
  ]);
  assert.deepEqual(records.at(-2).data, { result: 'lost', reason: 'no_flames' });
  assert.equal(records.at(-1).state, 'lost');
});

test('an already lit lantern protects the player and blocks pursuit', () => {
  const night = newNight({ lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true }],
    shades: [{ id: 'S1', pos: [tuning.safe_radius + 0.15, 0, 0] }] });
  for (let index = 0; index < 240; index++) night.step();
  assert.equal(night.player.flames, tuning.flames);
  assert.equal(night.score, 0);
  assert.equal(night.shades[0].state, 'avoid');
  assert.ok(night.shades[0].pos[0] > tuning.safe_radius);
});

test('winning stops early and scores only actions plus victory bonuses', (t) => {
  const { records } = cli(t, { ticks: 600, snapshot: 1, inputs: { frames: [{ tick: 0, interact: true }] },
    scenario: { ...isolated, player: { carried: 4 }, time_left_s: 12,
      lanterns: [1, 2, 3, 4, 5].map((index) => ({ id: 'L' + index, pos: [0, 0, 0], lit: index > 1 })) } });
  assert.equal(records[0].score, 0);
  assert.equal(records[0].lanterns.length, 5);
  assert.deepEqual(records.slice(1, 4).map(({ name, tick }) => [name, tick]),
    [['deposit', 1], ['lantern_lit', 1], ['game_over', 1]]);
  assert.deepEqual(records[3].data, { result: 'won', reason: 'all_lit' });
  assert.deepEqual(records.at(-1), { type: 'end', ticks: 1, state: 'won',
    score: tuning.score.per_lantern + 11 * tuning.score.per_second_left + tuning.flames * tuning.score.per_flame_left });
});

test('dawn, zero ticks, and valid defaults produce the required ending', (t) => {
  const { records } = cli(t, { ticks: 100, scenario: { ...isolated, time_left_s: 1 / 30 } });
  assert.deepEqual(records.at(-2), {
    type: 'event', tick: 2, name: 'game_over', data: { result: 'lost', reason: 'dawn' }
  });
  const partial = cli(t, { snapshot: 1, scenario: { ...isolated, time_left_s: 0.01 } });
  near(partial.records.at(-2).time_left_s, 0.01 - 1 / HZ);
  const zero = cli(t, { ticks: 0 });
  assert.equal(zero.records.length, 2);
  assert.equal(zero.records[0].motes_active, 67);
  assert.equal(zero.records.at(-1).ticks, 0);
});

test('seeded JSONL is byte-identical with a spawned shade and generated entity IDs', (t) => {
  const scenario = { ...isolated, random_shades: true,
    lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true }],
    shades: [{ pos: [12, 0, 5] }, { pos: [14, 0, 7], id: 'S1' }] };
  const first = cli(t, { scenario, ticks: 1450, snapshot: 120 });
  const next = cli(t, { scenario, ticks: 1450, snapshot: 120 });
  assert.equal(first.status, 0, first.stderr);
  assert.ok(first.records.some(({ name }) => name === 'shade_spawned'));
  assert.deepEqual(first.records[0].shades.map(({ id }) => id), ['S2', 'S1']);
  assert.equal(first.raw, next.raw);
});

test('invalid files exit with code 2 and write an error to stderr', (t) => {
  assert.throws(() => validateScenario({ lanterns: [{ id: 'L7' }] }), /lantern.id/);
  assert.throws(() => validateFrames({ frames: [{ tick: 0, move: [2, 0] }] }), /frame.move/);
  for (const data of [
    { scenario: { shades: [{ pos: [0, 0] }] } },
    { inputs: { frames: [{ tick: 0 }, { tick: 0 }] } }
  ]) {
    const bad = cli(t, data);
    assert.equal(bad.status, 2);
    assert.match(bad.stderr, /Invalid field/);
    assert.equal(bad.stdout, '');
  }
});
