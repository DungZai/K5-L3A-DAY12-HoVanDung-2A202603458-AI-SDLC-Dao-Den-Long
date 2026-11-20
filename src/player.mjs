import { floorAt, hitsTower } from './maps.mjs';

const DT = 1 / 60;
const STEP_HEIGHT = 0.3;
const PAD_RADIUS = 1;
const RESPAWN_TICKS = 60;
const WIND_SPEED = 2;
const CHARM_SPEED = 7.2;

export function createPlayer(map, tuning, setup = {}) {
  const pos = [...(setup.pos ?? map.start)];
  const floor = floorAt(map, pos[0], pos[2], pos[1]);
  return {
    pos, vel: [0, 0, 0], face: [0, 1], vertical: 0,
    grounded: floor !== null && Math.abs(floor - pos[1]) < 1e-8,
    carried: setup.carried ?? 0, flames: setup.flames ?? tuning.flames,
    invuln: setup.invuln_ticks ?? 0, dashCd: setup.dash_cd_ticks ?? 0,
    pulseCd: setup.pulse_cd_ticks ?? 0, charm: setup.charm_ticks ?? 0,
    respawn: 0, dashTicks: 0, dashVector: [0, 1], launch: null
  };
}

export function tickPlayerTimers(player) {
  for (const key of ['invuln', 'dashCd', 'pulseCd', 'charm']) {
    if (player[key] > 0) player[key]--;
  }
}

function lookMovement(input) {
  const [x, z] = input.move ?? [0, 0];
  const magnitude = Math.hypot(x, z);
  if (!magnitude) return { direction: null, strength: 0 };
  const yaw = ((input.cam_yaw_deg ?? 0) % 360) * Math.PI / 180;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return { direction: [(x * cos + z * sin) / magnitude, (-x * sin + z * cos) / magnitude],
    strength: Math.min(1, magnitude) };
}

function triggerPad(player, map) {
  if (!player.grounded) return false;
  const [x, y, z] = player.pos;
  const pad = map.pads.find(({ pos }) =>
    Math.abs(y - pos[1]) < 0.01 && Math.hypot(x - pos[0], z - pos[2]) <= PAD_RADIUS);
  if (!pad) return false;
  const [vx, vy, vz] = pad.velocity;
  player.launch = [vx, vz];
  const horizontalSpeed = Math.hypot(vx, vz);
  player.face = [vx / horizontalSpeed, vz / horizontalSpeed];
  player.vertical = vy;
  player.vel = [...pad.velocity];
  player.grounded = false;
  return true;
}

export function movePlayer(night, input, edge) {
  const { map, tuning, player, wind } = night;
  if (player.respawn > 0) {
    player.respawn--;
    if (player.respawn === 0) {
      player.pos = [...map.start];
      player.vel = [0, 0, 0];
      player.vertical = 0;
      player.grounded = true;
      player.invuln = tuning.invuln_s * 60;
      player.face = [0, 1];
    }
    return false;
  }
  if (player.flames <= 0) return false;

  const { direction, strength } = lookMovement(input);
  if (direction && player.dashTicks === 0 && !player.launch) player.face = direction;
  const launched = triggerPad(player, map);
  if (!launched && edge.jump && player.grounded && !player.dashTicks) {
    player.vertical = tuning.jump_speed;
    player.grounded = false;
  }
  if (edge.dash && player.dashTicks === 0 && (player.dashCd === 0 || player.charm > 0)) {
    player.dashTicks = Math.round(tuning.dash_duration_s * 60);
    player.dashCd = player.charm > 0 ? 0 : Math.round(tuning.dash_cooldown_s * 60);
    player.dashVector = direction ?? player.face;
    player.face = player.dashVector;
    night.event('dash', {});
  }

  const [x, y, z] = player.pos;
  const speed = player.charm > 0 ? CHARM_SPEED : tuning.player_speed;
  const running = direction ? direction.map((part) => part * speed * strength) : [0, 0];
  const dashing = player.dashTicks > 0;
  let [vx, vz] = dashing ? player.dashVector.map((part) => part * tuning.dash_speed)
    : player.launch ?? running;
  if (wind.active) {
    const angle = wind.dir_deg * Math.PI / 180;
    vx += WIND_SPEED * Math.cos(angle);
    vz += WIND_SPEED * Math.sin(angle);
  }
  let nx = x + vx * DT;
  let nz = z + vz * DT;
  if (hitsTower(map, nx, y, nz)) {
    if (hitsTower(map, nx, y, z)) nx = x;
    if (hitsTower(map, nx, y, nz)) nz = z;
  }

  let ny = y;
  let vy = 0;
  const support = floorAt(map, nx, nz, y + STEP_HEIGHT);
  if (player.grounded && support !== null && Math.abs(y - support) <= STEP_HEIGHT) {
    ny = support;
    player.vertical = 0;
  } else {
    player.grounded = false;
    if (!dashing) {
      const nextVertical = player.vertical + tuning.gravity * DT;
      ny += (player.vertical + nextVertical) * DT / 2;
      player.vertical = nextVertical;
      vy = nextVertical;
      const landing = floorAt(map, nx, nz, y + 1e-8);
      if (landing !== null && nextVertical <= 0 && ny <= landing + 1e-8) {
        ny = landing;
        vy = player.vertical = 0;
        player.grounded = true;
        player.launch = null;
      }
    }
  }
  player.pos = [nx, ny, nz];
  player.vel = [nx === x ? 0 : vx, vy, nz === z ? 0 : vz];
  if (dashing) player.dashTicks--;
  if (!dashing && !launched) triggerPad(player, map);

  if (ny >= -10) return true;
  const lost = player.carried;
  player.flames--;
  player.carried = 0;
  player.vel = [0, 0, 0];
  player.vertical = 0;
  player.launch = null;
  player.dashTicks = 0;
  player.respawn = player.flames > 0 ? RESPAWN_TICKS : 0;
  night.event('player_hit', { by: 'fall', flames: player.flames, dropped: 0, lost });
  return false;
}
