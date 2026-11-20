import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Night } from '../src/game.mjs';
import { fuelUnits } from '../src/lanterns.mjs';
import { cli, contract, isolated, tuning } from './headless.mjs';
import { phase3Cases } from './phase3-scenarios.mjs';

const run = (key) => cli(phase3Cases[key]);
const lantern = (result, tick, index = 0) => result.snapshots.find((snapshot) => snapshot.tick === tick).lanterns[index];
const events = (result, name) => result.events.filter((event) => event.name === name);

test('v1.2 khai đủ thông số dầu, giá thắp lại, ngưỡng thắng và sức chứa', () => {
  assert.equal(contract.contract_version, '1.2');
  for (const [key, expected] of Object.entries({ fuel_max: 100, fuel_decay_per_s: 1, fuel_per_mote: 10,
    relight_cost: 5, win_ratio: 0.6, drain_per_s: 5, low_fuel_threshold: 30, capacity_max: 20 })) {
    assert.equal(tuning[key], expected, key);
  }
});

test('dầu mặc định 100, hết đúng tick 6000 và thắp lại ngay trong cùng tick', () => {
  const result = run('relight');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(lantern(result, 0), { id: 'L1', pos: [0, 0, 0], lit: true, deposited: 0,
    fuel: 100, ever_lit: true, relit_count: 0 });
  assert.equal(lantern(result, 60).fuel, 99);
  assert.equal(lantern(result, 5940).fuel, 1);
  assert.deepEqual(result.events.filter(({ tick }) => tick === 6000).map(({ name, data }) => [name, data]), [
    ['lantern_out', { lantern_id: 'L1' }], ['deposit', { lantern_id: 'L1', amount: 5, deposited: 5 }],
    ['lantern_lit', { lantern_id: 'L1', relight: true }]
  ]);
  assert.deepEqual(lantern(result, 6000), { id: 'L1', pos: [0, 0, 0], lit: true, deposited: 5,
    fuel: 100, ever_lit: true, relit_count: 1 });
  assert.equal(result.end.score, 65);
  assert.equal(result.snapshots.at(-1).player.capacity, 12);
});

test('châm dầu chọn đèn gần nhất bằng ID, dùng ceil và không chọn đèn đang đầy', () => {
  const result = run('refuel');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(events(result, 'refuel').map(({ data }) => data), [{ lantern_id: 'L1', amount: 1, fuel: 100 }]);
  assert.equal(result.snapshots[1].player.carried, 6);
  assert.equal(result.end.score, 5);
  assert.equal(lantern(result, 1, 1).deposited, 0);
  const night = new Night(tuning, 17, {
    ...isolated, player: { carried: 5 }, lanterns: [{ id: 'L1', lit: true, pos: [0, 0, 0] }]
  });
  assert.equal(night.targetLantern(), null);
  night.deposit();
  assert.equal(night.events.length, 0);
  assert.equal(night.player.carried, 5);
});

test('hai Bóng Mực hút cộng dồn, báo theo cặp đèn/bóng đủ 60 tick, rồi đèn tắt', () => {
  const result = run('drain');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(events(result, 'fuel_drain').map(({ tick, data }) => [tick, data.shade_id, data.fuel]), [
    [60, 'S1', 18], [60, 'S2', 18], [120, 'S1', 7], [120, 'S2', 7]
  ]);
  assert.deepEqual(lantern(result, 159), { id: 'L1', pos: [15, 0, 0], lit: false, deposited: 0,
    fuel: 0, ever_lit: true, relit_count: 0 });
  assert.equal(events(result, 'lantern_out')[0].tick, 159);
  assert.ok(result.snapshots[159].shades.every(({ state }) => state === 'wander'));
});

test('wander chọn đèn yếu gần nhất theo ID, chase tiếp tục đuổi Mây', () => {
  const setup = { ...isolated, lanterns: [
    { id: 'L2', pos: [20, 0, -2], lit: true, fuel: 28 },
    { id: 'L1', pos: [20, 0, 2], lit: true, fuel: 28 },
    { id: 'L3', pos: [20, 0, 0] }
  ], shades: [{ id: 'S1', pos: [20, 0.8, 0] }, { id: 'S2', pos: [15, 0.8, 0], state: 'chase' }] };
  const result = cli({ scenario: setup, ticks: 62, snapshot: 1 });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.snapshots[1].shades.map(({ state }) => state), ['drain', 'chase']);
  assert.deepEqual(result.snapshots[1].shades[0].pos, [20, 0.8, 0]);
  assert.deepEqual(events(result, 'fuel_drain').map(({ tick, data }) => [tick, data.lantern_id]), [[61, 'L1']]);
});

test('chính xác fuel 30 vẫn an toàn; châm trở lại ngưỡng đẩy bóng ra đúng hạn', () => {
  const threshold = new Night(tuning, 42, { ...isolated, lanterns: [{ id: 'L1', pos: [0, 0, 0],
    lit: true, fuel: 30 + 1 / 60 }], shades: [{ pos: [0, 0.8, 0] }] });
  threshold.step();
  assert.equal(threshold.lanterns[0].fuel, fuelUnits(30));
  assert.equal(threshold.safeLights.length, 1);
  threshold.step();
  assert.equal(threshold.safeLights.length, 0);
  assert.equal(threshold.player.flames, 2);
  const result = run('restore-safety');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.snapshots[1].shades[0].state, 'wander');
  assert.equal(result.snapshots[30].player.flames, 3);
  assert.ok(result.snapshots[30].shades.every(({ pos }) => Math.hypot(pos[0], pos[2]) >= 6));
});

test('drain chỉ chuyển chase trong 6 m, pulse cộng 15 cho drain và 5 cho bóng thường', () => {
  const result = run('pulse-drain');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(events(result, 'pulse')[0].data.stunned_ids, ['S1', 'S2']);
  assert.equal(lantern(result, 1).fuel, 28.9);
  assert.equal(result.snapshots[120].shades[0].state, 'stunned');
  assert.equal(result.snapshots[121].shades[0].state, 'wander');
  assert.equal(result.end.score, 20);
  const night = new Night(tuning, 42, { ...isolated, lanterns: [{ id: 'L1', pos: [10, 0, 0], lit: true, fuel: 25 }],
    shades: [{ pos: [10, 0.8, 0], state: 'drain', target_lantern_id: 'L1' }] });
  night.step();
  assert.equal(night.shades[0].state, 'drain');
  night.player.pos = [4, 0, 0];
  night.step();
  assert.equal(night.shades[0].state, 'chase');
});

test('sức chứa phụ thuộc lần thắp do người chơi, giới hạn 20, đặt lại mỗi Đêm', () => {
  const result = run('capacity');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.snapshots[0].player.capacity, 18);
  assert.equal(result.snapshots[1].player.capacity, 20);
  assert.equal(result.snapshots[1].lanterns[0].relit_count, 1);
  const next = new Night(tuning, 42, { ...isolated }, 2);
  assert.equal(next.capacity, 10);
});

test('bình minh tính đủ ngưỡng, bonus dầu floor và không thắng sớm', () => {
  const result = run('dawn');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.snapshots.find(({ tick }) => tick === 45).state, 'playing');
  assert.deepEqual(result.events.at(-1).data, { result: 'won', reason: 'dawn_survived' });
  assert.deepEqual(result.end, { type: 'end', ticks: 60, state: 'won', score: 487 });
  for (const [number, threshold] of [[1, 3], [2, 4], [3, 5]]) {
    for (const count of [threshold - 1, threshold, number + 4]) {
      const night = new Night(tuning, 42, { ...isolated, time_left_s: 2 / 60,
        lanterns: Array.from({ length: count }, (_, index) => ({ id: `L${index + 1}`, lit: true })) }, number);
      night.step();
      assert.equal(night.state, 'playing');
      night.step();
      assert.equal(night.state, count < threshold ? 'lost' : 'won');
    }
  }
});

test('pause đóng băng dầu và nhịp báo hút dầu dùng sim_tick', () => {
  const result = run('pause-fuel');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.snapshots[90].sim_tick, 30);
  assert.deepEqual(result.snapshots[90].lanterns, result.snapshots[30].lanterns);
  assert.equal(events(result, 'fuel_drain')[0].tick, 120);
});

test('đèn vừa cạn ở tick bình minh không được tính vào ngưỡng thắng', () => {
  const result = run('dawn-out');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.snapshots[1].lanterns.filter(({ lit }) => lit).length, 2);
  assert.deepEqual(result.events.slice(1).map(({ tick, name, data }) => [tick, name, data]), [
    [1, 'lantern_out', { lantern_id: 'L3' }],
    [1, 'game_over', { result: 'lost', reason: 'dawn' }]
  ]);
  assert.equal(result.end.score, 0);
});

test('scenario từ chối dầu và đích hút ngoài schema', () => {
  assert.equal(cli({ scenario: { lanterns: [{ id: 'L1', lit: true, fuel: 101 }] } }).status, 2);
  assert.equal(cli({ scenario: { shades: [{ pos: [0, 0, 0], state: 'drain', target_lantern_id: 'L6' }] } }).status, 2);
});
