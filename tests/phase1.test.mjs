import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HZ, Night } from '../src/game.mjs';
import { validateFrames, validateScenario } from '../src/scenario.mjs';
import { cli, tuning, isolated } from './headless.mjs';

const newNight = (scenario) => new Night(tuning, 42, { ...isolated, ...scenario });
const near = (value, expected) => assert.ok(Math.abs(value - expected) < 1e-8, `${value} != ${expected}`);

test('hồi quy tick 0, +Z, input giữ giá trị, xoay camera và cadence', () => {
  const result = cli({ scenario: isolated, ticks: 125, snapshot: 30,
    inputs: { frames: [{ tick: 0, move: [0, 1] }, { tick: 60, cam_yaw_deg: 90 }] } });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.snapshots.map(({ tick }) => tick), [0, 30, 60, 90, 120]);
  assert.deepEqual(result.snapshots[0].player.pos, [0, 0, 0]);
  assert.deepEqual(result.snapshots[2].player.pos, [0, 0, 6]);
  assert.deepEqual(result.snapshots[4].player.pos, [6, 0, 6]);
  assert.equal(result.snapshots[4].time_left_s, 298);
  assert.equal(result.snapshots[4].sim_tick, 120);
  assert.deepEqual(result.end, { type: 'end', ticks: 125, state: 'playing', score: 0 });
});

test('hồi quy chuẩn hóa chéo, nhấn một lần, chỉ nhảy từ mặt đất', () => {
  const night = newNight();
  night.step({ move: [1, 1], jump: true });
  near(Math.hypot(night.player.pos[0], night.player.pos[2]), 6 / HZ);
  assert.ok(night.player.pos[1] > 0);
  for (let index = 0; index < HZ; index++) night.step({ jump: true });
  assert.equal(night.player.pos[1], 0);
  night.step();
  night.step({ jump: true });
  assert.ok(night.player.pos[1] > 0);
});

test('nhặt trong bán kính và chiều cao chuẩn, sức chứa 10, điểm chỉ cộng lúc nạp', () => {
  const night = newNight({ player: { carried: 1 },
    motes: [[1, 1.5, 0], [0, 1.501, 0], [1.001, 0, 0], ...Array.from({ length: 10 }, () => [0, 0, 0])] });
  const events = night.step();
  assert.equal(events.filter(({ name }) => name === 'mote_picked').length, 9);
  assert.equal(night.player.carried, 10);
  assert.equal(night.score, 0);
  assert.deepEqual(night.motes.slice(0, 2).map(({ id }) => id), ['M2', 'M3']);
});

test('nạp nhiều lần, đèn nhớ tiến độ, ID nhỏ hơn thắng khi hòa khoảng cách', () => {
  const night = newNight({ player: { carried: 2 },
    lanterns: [{ id: 'L2', pos: [-2, 0, 0] }, { id: 'L1', pos: [2, 0, 0] }] });
  assert.deepEqual(night.step({ interact: true })[0].data, { lantern_id: 'L1', amount: 2, deposited: 2 });
  for (let index = 0; index < 8; index++) night.addMote([0, 0, 0]);
  assert.equal(night.step({ interact: true }).length, 8);
  night.step();
  assert.deepEqual(night.step({ interact: true }).map(({ name }) => name), ['deposit', 'lantern_lit']);
  assert.equal(night.lanterns[0].lit, true);
  assert.equal(night.lanterns[1].lit, false);
  assert.equal(night.score, 200);
});

test('Tỏa Sáng dùng khoảng cách 3D, đẩy 4 m trong 15 tick, choáng và hồi chiêu', () => {
  const night = newNight({ player: { carried: 6 }, shades: [
    { id: 'S1', pos: [3, 4.8, 0] }, { id: 'S2', pos: [0, 6, 0], state: 'stunned' }
  ] });
  const event = night.step({ pulse: true })[0];
  assert.equal(event.tick, 1);
  assert.deepEqual(event.data, { stunned_ids: ['S1'] });
  assert.equal(night.player.carried, 3);
  assert.equal(night.player.pulseCd, 180);
  assert.notEqual(night.shades[0].pos[0], 7);
  while (night.simTick < 15) night.step();
  near(night.shades[0].pos[0], 7);
  assert.equal(night.shades[0].state, 'stunned');
  assert.equal(night.score, 5);
  assert.ok(!night.step({ pulse: true }).some(({ name }) => name === 'pulse'));
  while (night.simTick < 121) night.step();
  assert.notEqual(night.shades[0].state, 'stunned');
});

test('chạm xét ID theo số, mất một Ngọn Lửa, đom đóm rơi và recoil có đúng thời lượng', () => {
  const night = newNight({ player: { carried: 5 }, shades: [{ id: 'S10', pos: [0, 0.8, 0] }, { id: 'S2', pos: [0, 0.8, 0] }] });
  assert.deepEqual(night.step().map(({ data }) => data), [{ by: 'shade', flames: 2, dropped: 2 }]);
  assert.equal(night.shades[0].id, 'S2');
  assert.equal(night.shades[0].state, 'recoil');
  assert.equal(night.shades[1].state, 'chase');
  for (const mote of night.motes) {
    assert.ok(Math.hypot(mote.pos[0], mote.pos[2]) >= 1.5);
    assert.ok(Math.hypot(mote.pos[0], mote.pos[2]) <= 2.5);
    assert.equal(mote.ttl, 480);
  }
  while (night.simTick < 61) night.step();
  near(night.shades[0].pos[0], 2);
  while (night.simTick < 90) night.step();
  assert.equal(night.player.flames, 2);
  night.step();
  assert.equal(night.player.flames, 1);
});

test('vùng đèn ngăn chạm và đẩy Bóng Mực đang ở trong ra trong 30 tick', () => {
  const night = newNight({ player: { carried: 10 }, lanterns: [{ id: 'L1', pos: [0, 0, 0] }],
    shades: [{ pos: [0, 0.8, 0] }, { pos: [6.3, 0.8, 0] }] });
  night.step({ interact: true });
  for (let index = 0; index < 29; index++) night.step();
  assert.equal(night.player.flames, 3);
  assert.ok(night.shades.every(({ pos }) => Math.hypot(pos[0], pos[2]) >= 6));
  assert.equal(night.score, 200);
});

test('thắng đúng tick bình minh, mất hết Ngọn Lửa ưu tiên hơn đủ đèn', () => {
  const lanterns = [1, 2, 3, 4, 5].map((index) => ({ id: 'L' + index, pos: [0, 0, 0], lit: index > 1 }));
  const result = cli({ ticks: 20, snapshot: 1, inputs: { frames: [{ tick: 0, interact: true }] },
    scenario: { ...isolated, player: { carried: 10 }, lanterns, time_left_s: 1 / 60 } });
  assert.equal(result.snapshots[0].score, 0);
  assert.equal(result.snapshots[0].lanterns.length, 5);
  assert.deepEqual(result.events.map(({ name, tick }) => [name, tick]),
    [['night_start', 0], ['deposit', 1], ['lantern_lit', 1], ['game_over', 1]]);
  assert.deepEqual(result.end, { type: 'end', ticks: 1, state: 'won', score: 350 });
  const lost = newNight({ player: { flames: 1, pos: [45, -11, 0], invuln_ticks: 90 },
    lanterns: lanterns.map((lamp) => ({ ...lamp, lit: true })) });
  assert.deepEqual(lost.step().at(-1).data, { result: 'lost', reason: 'no_flames' });
});

test('bình minh, thời gian giữa hai tick, và 0 tick', () => {
  const end = cli({ ticks: 100, snapshot: 1, scenario: { ...isolated, time_left_s: 0.01 } });
  assert.deepEqual(end.events.at(-1).data, { result: 'lost', reason: 'dawn' });
  near(end.snapshots.at(-1).time_left_s, 0.01 - 1 / HZ);
  const zero = cli({ ticks: 0 });
  assert.equal(zero.snapshots.length, 1);
  assert.equal(zero.snapshots[0].motes_active, 20);
  assert.equal(zero.end.ticks, 0);
});

test('JSONL cùng seed giống từng byte và ID tự sinh ổn định', () => {
  const scenario = { ...isolated, random_shades: true,
    lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true }],
    shades: [{ pos: [12, 0, 5] }, { pos: [14, 0, 7], id: 'S1' }] };
  const first = cli({ scenario, ticks: 1450, snapshot: 120, seed: -42 });
  const next = cli({ scenario, ticks: 1450, snapshot: 120, seed: -42 });
  assert.equal(first.status, 0, first.stderr);
  assert.ok(first.events.some(({ name }) => name === 'shade_spawned'));
  assert.deepEqual(first.snapshots[0].shades.map(({ id }) => id), ['S1', 'S2']);
  assert.equal(first.raw, next.raw);
});

test('lỗi schema trả mã 2 và stderr; --night hỗ trợ đúng 1, 2, 3', () => {
  assert.throws(() => validateScenario({ lanterns: [{ id: 'L7' }] }), /lantern.id/);
  assert.throws(() => validateFrames({ frames: [{ tick: 0, move: [2, 0] }] }), /frame.move/);
  for (const options of [
    { scenario: { shades: [{ pos: [0, 0] }] } }, { scenario: { shades: [{ pos: [0, 0, 0], state: 'avoid' }] } },
    { inputs: { frames: [{ tick: 0 }, { tick: 0 }] } }, { inputs: { frames: [{ tick: 0, pause: 1 }] } }
  ]) {
    const bad = cli(options);
    assert.equal(bad.status, 2);
    assert.match(bad.stderr, /Invalid field/);
    assert.equal(bad.stdout, '');
  }
  assert.equal(cli({ night: 4 }).status, 1);
});
