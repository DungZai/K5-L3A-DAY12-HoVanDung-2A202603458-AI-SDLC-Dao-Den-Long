import { floorAt, hitsTower } from './maps.mjs';

const DT = 1 / 60;
const EJECT_TICKS = 30;
const PULSE_PUSH_TICKS = 15;
const RECOIL_TICKS = 60;
const DRIFTER_FLEE_TICKS = 240;
const DRIFTER_AFTER_DROP_TICKS = 120;
const DRIFTER_SPEED = 7;
const DRIFTER_IDLE_SPEED = 2;

export const distanceXZ = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const distance3D = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const heading = (angle) => [Math.cos(angle), Math.sin(angle)];

export function direction(from, to) {
  const x = to[0] - from[0];
  const z = to[2] - from[2];
  const length = Math.hypot(x, z);
  return length ? [x / length, z / length] : [1, 0];
}

export function compareIds(a, b) {
  const first = /^(\D+)(\d+)$/.exec(a.id);
  const second = /^(\D+)(\d+)$/.exec(b.id);
  if (first && second && first[1] === second[1]) return Number(first[2]) - Number(second[2]);
  return a.id < b.id ? -1 : Number(a.id > b.id);
}

export function tickHazardTimers(night) {
  for (const shade of night.shades) if (shade.remaining > 0) shade.remaining--;
  for (const drifter of night.drifters) {
    if (drifter.state === 'flee' && drifter.remaining > 0) drifter.remaining--;
  }
}

function escapePoint(pos, lights, radius) {
  let best = null;
  let shortest = Infinity;
  for (const light of lights) {
    if (distanceXZ(pos, light.pos) > radius) continue;
    const [x, z] = direction(light.pos, pos);
    const outward = Math.atan2(z, x);
    for (let index = 0; index < 40; index++) {
      const [dx, dz] = heading(outward + index * Math.PI / 20);
      const candidate = [light.pos[0] + dx * (radius + 0.002), pos[1], light.pos[2] + dz * (radius + 0.002)];
      const distance = distanceXZ(pos, candidate);
      if (distance >= shortest || lights.some((other) => distanceXZ(other.pos, candidate) <= radius)) continue;
      shortest = distance;
      best = candidate;
    }
  }
  return best;
}

export function updateSafety(night) {
  const { lanterns, tuning, player } = night;
  night.safeLights = lanterns.filter((lantern) => lantern.lit);
  night.playerSafe = night.safeLights.some((lantern) => distanceXZ(lantern.pos, player.pos) <= tuning.safe_radius);
  for (const shade of night.shades) {
    shade.ejectedThisTick = false;
    if (!night.safeLights.some((lantern) => distanceXZ(lantern.pos, shade.pos) <= tuning.safe_radius)) {
      shade.ejection = null;
    } else if (!shade.ejection || night.safeLights.some((lantern) =>
      distanceXZ(lantern.pos, shade.ejection.target) <= tuning.safe_radius)) {
      const target = escapePoint(shade.pos, night.safeLights, tuning.safe_radius);
      shade.ejection = target ? { target, left: EJECT_TICKS } : null;
    }
  }
}

function clipToLight(from, dx, dz, safeLights, radius) {
  const squared = dx * dx + dz * dz;
  if (!squared) return 1;
  let fraction = 1;
  for (const { pos } of safeLights) {
    const x = from[0] - pos[0];
    const z = from[2] - pos[2];
    const dot = x * dx + z * dz;
    if (dot >= 0) continue;
    const discriminant = dot * dot - squared * (x * x + z * z - radius * radius);
    if (discriminant <= 0) continue;
    const boundary = (-dot - Math.sqrt(discriminant)) / squared;
    if (boundary <= fraction) fraction = Math.max(0, boundary - 0.001 / Math.sqrt(squared));
  }
  return fraction;
}

function moveShade(night, shade, dx, dz) {
  const { map, safeLights, tuning } = night;
  const [x, y, z] = shade.pos;
  const fraction = clipToLight(shade.pos, dx, dz, safeLights, tuning.safe_radius);
  const nx = x + dx * fraction;
  const nz = z + dz * fraction;
  const oldFloor = floorAt(map, x, z, y);
  const nextFloor = floorAt(map, nx, nz, (oldFloor ?? y) + 0.3);
  if (oldFloor !== null && (nextFloor === null || Math.abs(nextFloor - oldFloor) > 0.3)) return false;
  const ny = oldFloor === null || nextFloor === null ? y : y + nextFloor - oldFloor;
  if (hitsTower(map, nx, ny, nz)) return false;
  shade.pos = [nx, ny, nz];
  return fraction === 1;
}

function flee(drifter, player, ticks) {
  drifter.state = 'flee';
  drifter.remaining = ticks;
  drifter.heading = direction(player.pos, drifter.pos);
}

export function activatePulse(night) {
  const { player, tuning } = night;
  if (player.carried < tuning.pulse_cost || player.pulseCd > 0) return;
  player.carried -= tuning.pulse_cost;
  player.pulseCd = Math.round(tuning.pulse_cooldown_s * 60);
  const center = [player.pos[0], player.pos[1] + 0.8, player.pos[2]];
  const stunnedIds = [];
  for (const shade of night.shades) {
    if (shade.state === 'spawning' && shade.remaining > 0) continue;
    if (distance3D(center, shade.pos) > tuning.pulse_radius) continue;
    shade.state = 'stunned';
    shade.remaining = Math.round(tuning.pulse_stun_s * 60);
    shade.impulse = { direction: direction(center, shade.pos), left: PULSE_PUSH_TICKS,
      step: tuning.pulse_push_m / PULSE_PUSH_TICKS };
    stunnedIds.push(shade.id);
  }
  night.score += stunnedIds.length * tuning.score.per_stun;
  night.event('pulse', { stunned_ids: stunnedIds });
  for (const drifter of night.drifters) {
    if (distance3D(center, drifter.pos) > tuning.pulse_radius) continue;
    if (drifter.state === 'chase') {
      flee(drifter, player, DRIFTER_FLEE_TICKS);
    } else if (drifter.state === 'flee' && drifter.remaining > 0 && drifter.stolen > 0) {
      const amount = drifter.stolen;
      drifter.stolen = 0;
      drifter.remaining = DRIFTER_AFTER_DROP_TICKS;
      for (let index = 0; index < amount; index++) night.dropMote(drifter.pos);
      night.event('drifter_drop', { drifter_id: drifter.id, amount });
    }
  }
}

export function moveShades(night) {
  const { tuning, player, number } = night;
  const speed = number === 3 ? tuning.shade_speed_night3 : tuning.shade_speed;
  for (const shade of night.shades) {
    if (shade.ejection) {
      const { target, left } = shade.ejection;
      shade.pos = shade.pos.map((value, axis) => value + (target[axis] - value) / left);
      shade.ejectedThisTick = true;
      if (--shade.ejection.left === 0) shade.ejection = null;
      continue;
    }
    if (shade.impulse) {
      const impulse = shade.impulse;
      const [dx, dz] = impulse.direction;
      const clear = moveShade(night, shade, dx * impulse.step, dz * impulse.step);
      if (!clear || --impulse.left === 0) shade.impulse = null;
      if (shade.remaining === 0 && shade.impulse === null) shade.state = 'wander';
      continue;
    }
    if (shade.remaining > 0 && ['spawning', 'stunned', 'recoil'].includes(shade.state)) continue;
    const distance = distanceXZ(shade.pos, player.pos);
    const limit = shade.tracking ? tuning.shade_lose_radius : tuning.shade_detect_radius;
    shade.tracking = distance <= limit && player.respawn === 0;
    shade.state = shade.tracking ? 'chase' : 'wander';
    if (shade.state === 'chase') {
      const [dx, dz] = direction(shade.pos, player.pos);
      const move = Math.min(speed * DT, distance);
      moveShade(night, shade, dx * move, dz * move);
    } else {
      const [dx, dz] = heading(shade.angle);
      if (!moveShade(night, shade, dx * speed * DT, dz * speed * DT)) {
        shade.angle += Math.PI * (0.7 + night.random() * 0.6);
      }
    }
  }
}

export function moveDrifters(night) {
  const { player } = night;
  for (const drifter of night.drifters) {
    if (drifter.state === 'removed') continue;
    const distance = distanceXZ(drifter.pos, player.pos);
    if (drifter.state !== 'flee') {
      drifter.state = player.respawn === 0 && player.carried >= 5 && distance <= 15 ? 'chase' : 'idle';
    }
    let [dx, dz] = drifter.heading;
    let travel = DRIFTER_SPEED * DT;
    if (drifter.state === 'idle') {
      drifter.angle += 0.55 * DT;
      [dx, dz] = heading(drifter.angle);
      travel = DRIFTER_IDLE_SPEED * DT;
    } else if (drifter.state === 'chase') {
      [dx, dz] = direction(drifter.pos, player.pos);
      travel = Math.min(travel, distance);
    }
    drifter.pos[0] += dx * travel;
    drifter.pos[2] += dz * travel;
    if (drifter.state === 'flee' && drifter.remaining === 0) drifter.state = 'removed';
  }
  night.drifters = night.drifters.filter(({ state }) => state !== 'removed');
}

export function resolveContacts(night) {
  const { player, tuning } = night;
  for (const drifter of night.drifters) {
    if (drifter.state === 'flee' || player.carried === 0 || distanceXZ(drifter.pos, player.pos) > 1.2) continue;
    const amount = Math.min(player.carried, 3);
    player.carried -= amount;
    drifter.stolen = amount;
    flee(drifter, player, DRIFTER_FLEE_TICKS);
    night.event('drifter_steal', { drifter_id: drifter.id, amount, carried: player.carried });
  }
  if (player.invuln > 0 || night.playerSafe) return;
  const hitter = night.shades.find((shade) => !shade.ejection && !shade.ejectedThisTick
    && (shade.state === 'chase' || shade.state === 'wander')
    && distanceXZ(shade.pos, player.pos) <= tuning.shade_hit_radius
    && Math.abs(player.pos[1] - shade.pos[1]) <= tuning.shade_hit_height);
  if (!hitter) return;
  player.flames--;
  player.invuln = tuning.invuln_s * 60;
  const dropped = Math.floor(player.carried * tuning.hit_drop_ratio);
  player.carried -= dropped;
  night.scatterMotes(player.pos, dropped);
  hitter.state = 'recoil';
  hitter.remaining = RECOIL_TICKS;
  hitter.impulse = { direction: direction(player.pos, hitter.pos), left: RECOIL_TICKS, step: 2 / RECOIL_TICKS };
  night.event('player_hit', { by: 'shade', flames: player.flames, dropped });
}
