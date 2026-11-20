import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAPS, floorAt } from '../src/maps.mjs';
import { Night } from '../src/game.mjs';
import { cli, contract, tuning, isolated } from './headless.mjs';
import { phase2Cases } from './phase2-scenarios.mjs';

function scenario(name) {
  const result = cli(phase2Cases[name]);
  assert.equal(result.status, 0, result.stderr);
  return { ...result, at: (tick) => result.snapshots.find((entry) => entry.tick === tick) };
}

const near = (actual, expected, epsilon = 0.002) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);

test('contract v1.1 và số chuẩn, 3 bản đồ và hình học chuẩn', () => {
  assert.equal(contract.contract_version, '1.1');
  assert.deepEqual([tuning.dash_speed, tuning.dash_duration_s, tuning.dash_cooldown_s], [14, 0.2, 1.5]);
  assert.deepEqual([tuning.night1_duration_s, tuning.night2_duration_s, tuning.night3_duration_s], [300, 330, 360]);
  for (const number of [1, 2, 3]) {
    const zero = cli({ night: number, ticks: 0 });
    assert.equal(zero.status, 0, zero.stderr);
    const [start] = zero.snapshots;
    assert.equal(start.night, number);
    assert.deepEqual(start.lanterns.map(({ pos }) => pos), MAPS[number].lanterns);
    assert.equal(start.motes.length, 20);
    assert.equal(new Set(start.motes.map(({ pos }) => pos.join(','))).size, 20);
    assert.equal(start.shades.length, 0);
  }
  assert.deepEqual(MAPS[3].motePoints.reduce((acc, [, y]) => {
    acc[y] = (acc[y] ?? 0) + 1;
    return acc;
  }, {}), { 0: 18, 3: 8, 6: 4 });
  assert.equal(floorAt(MAPS[1], 40, 0), 0);
  assert.equal(floorAt(MAPS[1], 40.01, 0), null);
  assert.equal(floorAt(MAPS[2], 35, 2), 0);
  assert.equal(floorAt(MAPS[2], 35, 2.01), null);
  assert.equal(floorAt(MAPS[3], 0, 13), 3);
  assert.equal(floorAt(MAPS[3], 0, -13), 0);
  assert.equal(floorAt(MAPS[3], 0, 7), 6);
});

test('headless Lướt 12 tick, giữ độ cao, hướng ban đầu +Z, hồi chiêu 90 tick', () => {
  const run = scenario('dash');
  const dash = run.events.find(({ name }) => name === 'dash');
  assert.equal(dash.tick, 6);
  assert.deepEqual(dash.data, {});
  assert.equal(run.at(6).player.vel[2], 14);
  assert.equal(run.at(6).player.dash_cd_s, 1.5);
  assert.equal(run.at(17).player.pos[1], run.at(5).player.pos[1]);
  assert.equal(run.at(17).player.pos[2], 2.8);
  assert.ok(run.at(18).player.pos[1] > run.at(17).player.pos[1]);
});

test('Lướt dùng hướng đang di chuyển, và không cấp bất tử', () => {
  const result = cli({ scenario: { ...isolated, shades: [{ pos: [0.5, 0.8, 0] }] },
    ticks: 2, snapshot: 1, inputs: { frames: [{ tick: 0, move: [1, 0], dash: true }] } });
  assert.equal(result.snapshots[1].player.vel[0], 14);
  assert.equal(result.snapshots[1].player.flames, 2);
  assert.deepEqual(result.events.map(({ name }) => name), ['night_start', 'dash', 'player_hit']);
});

test('Lướt khi đang bay từ bục giữ độ cao và theo hướng phóng nếu buông phím', () => {
  const run = cli({ night: 3, ticks: 30, snapshot: 1,
    scenario: { ...isolated, player: { pos: [0, 3, 13] } },
    inputs: { frames: [{ tick: 10, dash: true }] } });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.snapshots[11].player.vel[2], -14);
  assert.equal(run.snapshots[22].player.pos[1], run.snapshots[10].player.pos[1]);
  assert.equal(run.snapshots[23].player.vel[2], -8);
});

test('pause giữ sim_tick, vị trí, thời gian, bùa, bất tử và cooldown', () => {
  const run = scenario('pause');
  assert.deepEqual(run.events.slice(1).map(({ tick, name }) => [tick, name]), [[5, 'paused'], [15, 'resumed']]);
  assert.equal(run.at(14).state, 'paused');
  assert.equal(run.at(14).sim_tick, 4);
  assert.equal(run.at(14).time_left_s, run.at(4).time_left_s);
  assert.deepEqual(run.at(14).player, run.at(4).player);
  assert.equal(run.at(15).sim_tick, 5);
  assert.equal(run.at(15).state, 'playing');
  const staticPause = cli({ scenario: isolated, ticks: 480, snapshot: 240,
    inputs: { frames: [{ tick: 0, pause: true }] } });
  assert.equal(staticPause.end.state, 'paused');
  assert.equal(staticPause.snapshots.at(-1).sim_tick, 0);
});

test('rơi bỏ qua bất tử, mất hết đom đóm, 60 tick hồi sinh và vận tốc về 0', () => {
  const run = scenario('fall');
  const hits = run.events.filter(({ name }) => name === 'player_hit');
  assert.deepEqual(hits, [{ type: 'event', tick: 1, name: 'player_hit',
    data: { by: 'fall', flames: 2, dropped: 0, lost: 8 } }]);
  assert.ok(run.at(60).player.pos[1] < -10);
  assert.deepEqual(run.at(61).player.pos, [0, 0, 0]);
  assert.deepEqual(run.at(61).player.vel, [0, 0, 0]);
  assert.equal(run.at(61).player.grounded, true);
  assert.equal(run.at(61).player.invuln, true);
});

test('mote sinh mỗi 240 tick khi còn điểm, Bóng Mực 2 con tick 300 rồi đúng lịch', () => {
  const run = cli({ ticks: 1500, snapshot: 60,
    scenario: { lanterns: [{ id: 'L1', lit: true, pos: [0, 0, 0] }] } });
  assert.equal(run.status, 0, run.stderr);
  const byTick = (tick) => run.snapshots.find((entry) => entry.tick === tick);
  assert.equal(byTick(180).motes.length, 20);
  assert.equal(byTick(240).motes.length, 21);
  assert.equal(byTick(480).motes.length, 22);
  assert.equal(byTick(1440).motes.length, 24);
  assert.deepEqual(run.events.filter(({ name }) => name === 'shade_spawned').map(({ tick, data }) => [tick, data.id]),
    [[300, 'S1'], [300, 'S2'], [780, 'S3'], [1260, 'S4']]);
  assert.ok(byTick(300).shades.every(({ state }) => state === 'spawning'));
});

test('cầu tre và bục nhảy Đảo Cau giữ hướng phóng bất chấp input', () => {
  const bridge = scenario('bridge');
  assert.deepEqual(bridge.at(180).player.pos, [44, 0, 0]);
  assert.equal(bridge.at(180).player.grounded, true);
  const pad = scenario('jump-cau');
  assert.ok(pad.at(30).player.pos[0] > 30);
  assert.ok(pad.at(30).player.pos[1] > 4.4);
  assert.equal(pad.at(84).player.grounded, true);
  assert.ok(pad.at(84).player.pos[0] > 50);
});

test('Đảo Chuông đi lên bằng dốc, bục đưa lên tầng 2 và tháp chặn', () => {
  const ramp = scenario('ramp');
  assert.equal(ramp.at(66).player.pos[1], 3);
  const pad = scenario('jump-chuong');
  assert.equal(pad.at(51).player.pos[1], 6);
  assert.equal(pad.at(51).player.grounded, true);
  const result = cli({ night: 3, ticks: 50, snapshot: 50, scenario: { ...isolated, player: { pos: [0, 6, 3] } },
    inputs: { frames: [{ tick: 0, move: [0, -1] }] } });
  assert.ok(result.snapshots.at(-1).player.pos[2] >= 2);
  assert.equal(result.snapshots.at(-1).player.pos[1], 6);
});

test('Bùa Gió nhặt lại sau 2700 tick, tốc độ 7.2 và hai lần Lướt không hồi chiêu', () => {
  const run = scenario('charm');
  assert.deepEqual(run.events.filter(({ name }) => name === 'charm_picked').map(({ tick, data }) => [tick, data.charm_ticks]),
    [[1, 600], [2701, 600]]);
  assert.equal(run.at(600).player.charm_s, 1 / 60);
  assert.equal(run.at(700).player.charm_s, 0);
  const result = cli({ ticks: 25, snapshot: 1, scenario: { ...isolated, player: { charm_ticks: 600 } },
    inputs: { frames: [
      { tick: 0, move: [1, 0] }, { tick: 1, dash: true }, { tick: 2, dash: false }, { tick: 3, dash: true },
      { tick: 4, dash: false }, { tick: 13, dash: true }
    ] } });
  assert.equal(result.snapshots[1].player.vel[0], 7.2);
  assert.equal(result.snapshots[2].player.dash_cd_s, 0);
  assert.deepEqual(result.events.filter(({ name }) => name === 'dash').map(({ tick }) => tick), [2, 14]);
});

test('Gió Lạc cướp trước Bóng Mực, pulse lấy lại đồ, rồi Gió Lạc biến mất', () => {
  const run = scenario('drifter');
  const events = run.events.filter(({ tick }) => tick === 1);
  assert.deepEqual(events.map(({ name }) => name), ['drifter_steal', 'player_hit']);
  assert.equal(events[0].data.amount, 3);
  assert.equal(events[1].data.dropped, 3);
  assert.equal(run.at(1).drifters[0].stolen, 3);
  const drop = run.events.find(({ name }) => name === 'drifter_drop');
  assert.deepEqual(drop.data, { drifter_id: 'D7', amount: 3 });
  assert.equal(drop.tick, 2);
  assert.equal(run.at(2).motes.filter(({ kind }) => kind === 'dropped').length, 6);
  assert.equal(run.at(122).drifters.length, 0);
});

test('Gió Lạc xuất hiện theo lịch, pulse xua khi chase và bất tử vẫn có thể bị cướp', () => {
  const run = scenario('drifter-spawn');
  assert.deepEqual(run.at(1200).drifters.map(({ id }) => id), ['D1']);
  assert.deepEqual(run.at(2400).drifters.map(({ id }) => id), ['D1', 'D2']);
  const nearDrifter = { ...isolated, player: { carried: 6, invuln_ticks: 90 },
    drifters: [{ pos: [0, 1, 0], state: 'chase' }] };
  const pulse = cli({ night: 2, snapshot: 1, ticks: 2, scenario: nearDrifter,
    inputs: { frames: [{ tick: 0, pulse: true }] } });
  assert.equal(pulse.snapshots[1].drifters[0].state, 'flee');
  assert.equal(pulse.snapshots[1].drifters[0].stolen, 0);
  const steal = cli({ night: 2, snapshot: 1, ticks: 2, scenario: nearDrifter });
  assert.equal(steal.events[1].name, 'drifter_steal');
  assert.equal(steal.snapshots[1].player.flames, 3);
});

test('gió Đảo Chuông bắt đầu tick 1800, đẩy 2 m/s và hết sau 5 giây', () => {
  const run = scenario('wind');
  assert.equal(run.at(1799).wind.active, false);
  assert.deepEqual(run.at(1799).player.pos, [0, 0, 0]);
  assert.equal(run.at(1800).wind.active, true);
  assert.equal(run.at(2099).wind.active, true);
  assert.equal(run.at(2100).wind.active, false);
  const [x, , z] = run.at(1800).player.pos;
  const angle = run.at(1800).wind.dir_deg * Math.PI / 180;
  near(x, 2 * Math.cos(angle) / 60);
  near(z, 2 * Math.sin(angle) / 60);
  near(Math.hypot(run.at(2100).player.pos[0], run.at(2100).player.pos[2]), 10);
});

test('chạy đầy đủ 21.600 tick trong tối đa 30 giây', () => {
  const run = scenario('performance');
  assert.equal(run.end.ticks, 21600);
  assert.equal(run.end.state, 'lost');
  assert.ok(run.elapsedMs <= 30000, String(run.elapsedMs));
  assert.equal(run.snapshots.at(-1).sim_tick, 21600);
});

test('đom đóm rơi hết TTL nếu không nhặt', () => {
  const night = new Night(tuning, 39, { ...isolated, player: { carried: 5 },
    shades: [{ pos: [0, 0, 0] }] });
  night.step();
  assert.equal(night.motes[0].availableAt, 2);
  night.shades.length = 0;
  while (night.simTick < 480) night.step();
  assert.equal(night.motes[0].ttl, 1);
  night.step();
  assert.equal(night.motes.length, 0);
});
