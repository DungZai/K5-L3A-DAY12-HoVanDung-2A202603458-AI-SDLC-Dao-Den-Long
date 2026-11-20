export const HZ = 60;
export const ISLAND_RADIUS = 31;
const DT = 1 / HZ;
const LANTERN_POSITIONS = [[0, 0, 12], [15, 0, 5], [9, 0, -14], [-9, 0, -14], [-15, 0, 5]];
const BUTTONS = ['jump', 'interact', 'pulse'];
const GRAVITY = 18;
const JUMP_SPEED = 6.2;
const WAVE_TICKS = 23 * HZ;
const MAX_SHADES = 5;

const horizontal = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const round = (n) => Math.abs(n) < 1e15 ? Math.round(n * 1000) / 1000 || 0 : n;
const roundPosition = (position) => position.map(round);
const toTicks = (seconds) => Math.ceil(seconds * HZ);

export function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let mixed = Math.imul(value ^ (value >>> 15), 1 | value);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function polar(radius, angle, height = 0) {
  return [Math.sin(angle) * radius, height, Math.cos(angle) * radius];
}

function direction(x, z) {
  const length = Math.hypot(x, z);
  return length ? [x / length, z / length] : [1, 0];
}

export class Night {
  constructor(tuning, seed, scenario = {}) {
    this.tuning = tuning;
    this.random = seededRandom(seed);
    this.tick = 0;
    this.state = 'playing';
    this.duration = scenario.time_left_s ?? tuning.night1_duration_s;
    this.score = 0;
    this.events = [];
    this.previousButtons = {};
    this.player = {
      pos: [...(scenario.player?.pos ?? [0, 0, 0])],
      carried: scenario.player?.carried ?? 0,
      flames: scenario.player?.flames ?? tuning.flames,
      verticalSpeed: 0,
      invulnerableUntil: 0,
      pulseReadyAt: 0
    };
    this.lanterns = LANTERN_POSITIONS.map((pos, index) => {
      const id = `L${index + 1}`;
      const layout = scenario.lanterns?.find((lantern) => lantern.id === id);
      return { id, pos: [...(layout?.pos ?? pos)],
        deposited: layout?.deposited ?? 0, lit: layout?.lit ?? false };
    });
    this.motes = [];
    this.nextMote = 1;
    const motePositions = scenario.motes ?? (scenario.random_motes === false ? [] : this.defaultMotes());
    for (const pos of motePositions) this.addMote(pos);
    this.shades = [];
    this.nextShade = 1;
    this.reservedShadeIds = new Set(scenario.shades?.map((shade) => shade.id).filter(Boolean));
    this.spawnWaves = scenario.random_shades !== false;
    if (scenario.shades) {
      for (const shade of scenario.shades) this.addShade(shade.pos, shade.id);
    } else if (this.spawnWaves) {
      const angle = this.random() * Math.PI * 2;
      this.addShade(polar(24, angle, 0.8));
      this.addShade(polar(26, angle + Math.PI, 0.8));
    }
  }

  get timeLeft() {
    return this.duration - this.tick / HZ;
  }

  defaultMotes() {
    const positions = [];
    for (const [x, , z] of LANTERN_POSITIONS) {
      const length = Math.hypot(x, z);
      for (let index = 1; index <= 5; index++) {
        const distance = index * 2;
        const offset = (this.random() - 0.5) * 0.9;
        positions.push([(x * distance + z * offset) / length, 0, (z * distance - x * offset) / length]);
      }
    }
    for (let index = 0; index < 42; index++) {
      positions.push(polar(6 + Math.sqrt(this.random()) * 22, this.random() * Math.PI * 2));
    }
    return positions;
  }

  addMote(pos) {
    this.motes.push({ id: `M${this.nextMote++}`, pos: [...pos] });
  }

  addShade(pos, id) {
    if (id === undefined) {
      do {
        id = `S${this.nextShade++}`;
      } while (this.reservedShadeIds.has(id));
    }
    this.shades.push({ id, pos: [...pos], state: 'chase', stunnedUntil: 0 });
    return id;
  }

  event(name, data) {
    this.events.push({ type: 'event', tick: this.tick, name, data });
  }

  snapshot() {
    return {
      type: 'snapshot', tick: this.tick, sim_tick: this.tick, state: this.state,
      time_left_s: this.timeLeft, score: this.score,
      player: { pos: roundPosition(this.player.pos), flames: this.player.flames, carried: this.player.carried },
      lanterns: this.lanterns.map(({ id, pos, lit, deposited }) => ({ id, pos: roundPosition(pos), lit, deposited })),
      shades: this.shades.map(({ id, pos, state }) => ({ id, pos: roundPosition(pos), state })),
      motes_active: this.motes.length,
      motes: this.motes.map(({ id, pos }) => ({ id, pos: roundPosition(pos) }))
    };
  }

  step(input = {}) {
    this.events = [];
    if (this.state !== 'playing') return this.events;
    this.tick++;
    const edge = {};
    for (const button of BUTTONS) {
      edge[button] = Boolean(input[button]) && !this.previousButtons[button];
      this.previousButtons[button] = Boolean(input[button]);
    }
    if (!this.finishIfNeeded()) {
      this.movePlayer(input, edge.jump);
      this.pickMotes();
      if (edge.interact) this.deposit();
      if (!this.finishIfNeeded()) {
        if (edge.pulse) this.pulse();
        this.updateShades();
        this.finishIfNeeded();
      }
    }
    return this.events;
  }

  movePlayer(input, jump) {
    const player = this.player;
    const [x, z] = input.move ?? [0, 0];
    const length = Math.max(1, Math.hypot(x, z));
    const angle = ((input.cam_yaw_deg ?? 0) % 360) * Math.PI / 180;
    const distance = this.tuning.player_speed * DT / length;
    const [oldX, height, oldZ] = player.pos;
    let nextX = oldX + (x * Math.cos(angle) + z * Math.sin(angle)) * distance;
    let nextZ = oldZ + (-x * Math.sin(angle) + z * Math.cos(angle)) * distance;
    const islandLimit = Math.max(ISLAND_RADIUS - 0.55, Math.hypot(oldX, oldZ));
    const nextRadius = Math.hypot(nextX, nextZ);
    if (nextRadius > islandLimit) {
      nextX *= islandLimit / nextRadius;
      nextZ *= islandLimit / nextRadius;
    }
    if (jump && height <= 0) player.verticalSpeed = JUMP_SPEED;
    player.verticalSpeed -= GRAVITY * DT;
    const nextY = Math.max(0, height + player.verticalSpeed * DT);
    if (nextY === 0) player.verticalSpeed = 0;
    player.pos = [nextX, nextY, nextZ];
  }

  pickMotes() {
    const player = this.player;
    this.motes = this.motes.filter((mote) => {
      if (player.carried >= this.tuning.carry_capacity
          || horizontal(player.pos, mote.pos) > this.tuning.pickup_radius) return true;
      player.carried++;
      this.score += this.tuning.score.per_mote;
      this.event('mote_picked', { carried: player.carried });
      return false;
    });
  }

  targetLantern() {
    let nearest;
    let nearestDistance = Infinity;
    for (const lantern of this.lanterns) {
      if (lantern.lit) continue;
      const distance = horizontal(this.player.pos, lantern.pos);
      if (distance <= this.tuning.interact_radius && distance < nearestDistance) {
        nearest = lantern;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  deposit() {
    const lantern = this.targetLantern();
    if (!lantern || this.player.carried <= 0) return;
    const amount = Math.min(this.player.carried, this.tuning.lantern_cost - lantern.deposited);
    if (amount <= 0) return;
    lantern.deposited += amount;
    this.player.carried -= amount;
    this.event('deposit', { lantern_id: lantern.id, amount, deposited: lantern.deposited });
    if (lantern.deposited === this.tuning.lantern_cost) {
      lantern.lit = true;
      this.score += this.tuning.score.per_lantern;
      this.event('lantern_lit', { lantern_id: lantern.id });
    }
  }

  pulse() {
    const player = this.player;
    if (player.carried < this.tuning.pulse_cost || this.tick < player.pulseReadyAt) return;
    player.carried -= this.tuning.pulse_cost;
    player.pulseReadyAt = this.tick + toTicks(this.tuning.pulse_cooldown_s);
    const stunnedIds = [];
    for (const shade of this.shades) {
      if (horizontal(player.pos, shade.pos) > this.tuning.pulse_radius) continue;
      const [dx, dz] = direction(shade.pos[0] - player.pos[0], shade.pos[2] - player.pos[2]);
      shade.pos[0] += dx * this.tuning.pulse_push_m;
      shade.pos[2] += dz * this.tuning.pulse_push_m;
      shade.stunnedUntil = this.tick + toTicks(this.tuning.pulse_stun_s);
      shade.state = 'stunned';
      stunnedIds.push(shade.id);
    }
    this.score += stunnedIds.length * this.tuning.score.per_stun;
    this.event('pulse', { stunned_ids: stunnedIds });
  }

  updateShades() {
    const player = this.player;
    const safeLanterns = this.lanterns.filter((lantern) => lantern.lit);
    const playerSafe = safeLanterns.some((lantern) => horizontal(player.pos, lantern.pos) <= this.tuning.safe_radius);
    if (this.spawnWaves && this.tick % WAVE_TICKS === 0 && this.shades.length < MAX_SHADES) {
      const id = this.addShade(polar(28, this.random() * Math.PI * 2, 0.8));
      this.event('shade_spawned', { id });
    }
    for (const shade of this.shades) {
      if (this.tick >= shade.stunnedUntil) {
        this.moveShade(shade, safeLanterns, playerSafe);
      }
      if (shade.state !== 'stunned' && !playerSafe && this.tick >= player.invulnerableUntil
          && horizontal(shade.pos, player.pos) <= this.tuning.shade_hit_radius) {
        this.hitPlayer();
      }
    }
  }

  moveShade(shade, safeLanterns, playerSafe) {
    const [x, y, z] = shade.pos;
    const target = this.player.pos;
    const [dx, dz] = direction(target[0] - x, target[2] - z);
    const distance = Math.min(horizontal(shade.pos, target), this.tuning.shade_speed * DT);
    let next = [x + dx * distance, y, z + dz * distance];
    const blocking = safeLanterns.find((lantern) => horizontal(lantern.pos, next) <= this.tuning.safe_radius);
    shade.state = playerSafe || blocking ? 'avoid' : 'chase';
    if (blocking) {
      const [awayX, awayZ] = direction(next[0] - blocking.pos[0], next[2] - blocking.pos[2]);
      const radius = this.tuning.safe_radius + 0.005;
      next = [blocking.pos[0] + awayX * radius, y, blocking.pos[2] + awayZ * radius];
      if (safeLanterns.some((lantern) => horizontal(lantern.pos, next) < this.tuning.safe_radius - 1e-8)) {
        return;
      }
    }
    shade.pos = next;
  }

  hitPlayer() {
    const player = this.player;
    if (player.flames <= 0) return;
    player.flames--;
    player.invulnerableUntil = this.tick + toTicks(this.tuning.invuln_s);
    const dropped = Math.floor(player.carried * this.tuning.hit_drop_ratio);
    player.carried -= dropped;
    for (let index = 0; index < dropped; index++) {
      const [x, , z] = polar(1.75 + index * 0.12, index * 2.4);
      this.addMote([player.pos[0] + x, 0, player.pos[2] + z]);
    }
    this.event('player_hit', { by: 'shade', flames: player.flames, dropped });
  }

  finishIfNeeded() {
    const reason = this.lanterns.every((lantern) => lantern.lit) ? 'all_lit'
      : this.player.flames === 0 ? 'no_flames'
      : this.timeLeft <= 0 ? 'dawn' : undefined;
    if (!reason) return false;
    this.state = reason === 'all_lit' ? 'won' : 'lost';
    if (this.state === 'won') {
      this.score += Math.max(0, Math.floor(this.timeLeft)) * this.tuning.score.per_second_left
        + this.player.flames * this.tuning.score.per_flame_left;
    }
    this.event('game_over', { result: this.state, reason });
    return true;
  }
}
