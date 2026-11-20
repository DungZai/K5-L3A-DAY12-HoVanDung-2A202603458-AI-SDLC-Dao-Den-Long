import { MAPS, floorAt } from './maps.mjs';
import { createPlayer, movePlayer, tickPlayerTimers } from './player.mjs';
import {
  activatePulse, compareIds, distanceXZ, moveDrifters, moveShades,
  resolveContacts, tickHazardTimers, updateSafety
} from './hazards.mjs';

export const HZ = 60;
const BUTTONS = ['pause', 'jump', 'dash', 'interact', 'pulse'];
const MOTE_INTERVAL = 240;
const MOTE_START = 20;
const MOTE_LIMIT = 30;
const MOTE_TTL = 480;
const SHADE_FIRST_TICK = 300;
const DRIFTER_INTERVAL = 1200;
const CHARM_EFFECT = 600;
const CHARM_RESPAWN = 2700;
const WIND_INTERVAL = 1800;
const WIND_DURATION = 300;
const WIND_WARNING = 120;
const rounded = (n) => Math.abs(n) < 1e15 ? Math.round(n * 1000) / 1000 || 0 : n;
const roundedPos = (pos) => pos.map(rounded);

export function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let mixed = Math.imul(value ^ (value >>> 15), 1 | value);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function takeRandom(points, random) {
  const index = Math.floor(random() * points.length);
  return points.splice(index, 1)[0];
}

function positionsMatch(a, b) {
  return Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6 && Math.abs(a[2] - b[2]) < 1e-6;
}

function nextId(prefix, used, counter) {
  let id;
  do { id = prefix + counter.value++; } while (used.has(id));
  used.add(id);
  return id;
}

export class Night {
  constructor(tuning, seed, scenario = {}, number = 1) {
    this.number = number;
    this.map = MAPS[number];
    this.tuning = tuning;
    this.random = seededRandom(seed);
    this.windRandom = seededRandom(seed ^ 0x73c62a11);
    this.duration = scenario.time_left_s ?? tuning[`night${number}_duration_s`];
    this.tick = 0;
    this.simTick = 0;
    this.state = 'playing';
    this.score = 0;
    this.events = [];
    this.previousButtons = {};
    this.windEnabled = scenario.wind_enabled ?? (number === 3);
    this.wind = { active: false, dir_deg: 0, warning: false };
    this.player = createPlayer(this.map, tuning, scenario.player);
    this.lanterns = this.map.lanterns.map((pos, index) => {
      const id = `L${index + 1}`;
      const entry = scenario.lanterns?.find((item) => item.id === id);
      return { id, pos: [...(entry?.pos ?? pos)], deposited: entry?.deposited ?? 0, lit: entry?.lit ?? false };
    });
    this.safeLights = [];
    this.playerSafe = false;
    this.randomMotes = scenario.random_motes !== false;
    this.randomShades = scenario.random_shades !== false;
    this.randomDrifters = number >= 2 && scenario.random_drifters !== false;
    this.nextMote = 1;
    this.motes = [];
    if (scenario.motes) {
      for (const pos of scenario.motes) this.addMote(pos);
    } else if (this.randomMotes) {
      const points = [...this.map.motePoints];
      for (let index = 0; index < MOTE_START; index++) this.addMote(takeRandom(points, this.random));
    }
    this.shades = [];
    this.shadeIds = new Set(scenario.shades?.map(({ id }) => id).filter(Boolean));
    this.shadeCounter = { value: 1 };
    for (const shade of scenario.shades ?? []) this.addShade(shade);
    this.drifters = [];
    this.drifterIds = new Set(scenario.drifters?.map(({ id }) => id).filter(Boolean));
    this.drifterCounter = { value: 1 };
    for (const drifter of scenario.drifters ?? []) this.addDrifter(drifter);
    const sourceCharms = scenario.charms ?? this.map.charms.map((pos) => ({ pos }));
    const charmIds = new Set(sourceCharms.map(({ id }) => id).filter(Boolean));
    const charmCounter = { value: 1 };
    this.charms = sourceCharms
      .map((charm) => {
        const id = charm.id ?? nextId('C', charmIds, charmCounter);
        const mapIndex = Number(id.slice(1)) - 1;
        const respawn = charm.respawn_ticks ?? Math.round((charm.respawn_s ?? 0) * HZ);
        return { id, pos: [...(charm.pos ?? this.map.charms[mapIndex] ?? this.map.start)],
          respawn: charm.available === false && respawn === 0 ? CHARM_RESPAWN : respawn };
      }).sort(compareIds);
  }

  get timeLeft() {
    return this.duration - this.simTick / HZ;
  }

  event(name, data) {
    this.events.push({ type: 'event', tick: this.tick, name, data });
  }

  addMote(pos, kind = 'random', ttl = null) {
    this.motes.push({ id: `M${this.nextMote++}`, pos: [...pos], kind, ttl, availableAt: this.simTick + 1 });
  }

  dropMote(pos) {
    const [x, y, z] = pos;
    this.addMote([x, floorAt(this.map, x, z, y) ?? y, z], 'dropped', MOTE_TTL);
  }

  scatterMotes(pos, count) {
    if (count === 0) return;
    const angle = this.random() * Math.PI * 2;
    for (let index = 0; index < count; index++) {
      const bearing = angle + index * Math.PI * 2 / count;
      const distance = 1.5 + this.random();
      this.dropMote([pos[0] + distance * Math.cos(bearing), pos[1], pos[2] + distance * Math.sin(bearing)]);
    }
  }

  addShade({ id = nextId('S', this.shadeIds, this.shadeCounter), pos, state = 'wander', state_ticks_left }) {
    const remaining = state_ticks_left ?? { spawning: 1, stunned: 120, recoil: 60 }[state] ?? 0;
    this.shades.push({ id, pos: [...pos], state, remaining, tracking: state === 'chase',
      angle: this.random() * Math.PI * 2, impulse: null, ejection: null, ejectedThisTick: false });
    this.shades.sort(compareIds);
    return id;
  }

  addDrifter({ id = nextId('D', this.drifterIds, this.drifterCounter), pos, state = 'idle', state_ticks_left, stolen = 0 }) {
    const angle = this.random() * Math.PI * 2;
    this.drifters.push({ id, pos: [...pos], state, stolen, angle,
      remaining: state_ticks_left ?? (state === 'flee' ? 240 : 0),
      heading: [Math.cos(angle), Math.sin(angle)] });
    this.drifters.sort(compareIds);
  }

  snapshot() {
    const { player } = this;
    return {
      type: 'snapshot', tick: this.tick, sim_tick: this.simTick, state: this.state, night: this.number,
      time_left_s: this.timeLeft, score: this.score,
      wind: { active: this.wind.active, dir_deg: this.wind.dir_deg },
      player: { pos: roundedPos(player.pos), vel: roundedPos(player.vel), grounded: player.grounded,
        flames: player.flames, carried: player.carried, invuln: player.invuln > 0,
        dash_cd_s: player.dashCd / HZ, pulse_cd_s: player.pulseCd / HZ, charm_s: player.charm / HZ },
      lanterns: this.lanterns.map(({ id, pos, lit, deposited }) => ({ id, pos: roundedPos(pos), lit, deposited })),
      shades: this.shades.map(({ id, pos, state }) => ({ id, pos: roundedPos(pos), state })),
      motes_active: this.motes.length,
      motes: this.motes.map(({ id, pos, kind, ttl }) => ({ id, pos: roundedPos(pos), kind, ttl_s: ttl === null ? null : ttl / HZ })),
      drifters: this.drifters.map(({ id, pos, state, stolen }) => ({ id, pos: roundedPos(pos), state, stolen })),
      charms: this.charms.map(({ id, respawn }) => ({ id, available: respawn === 0, respawn_s: respawn / HZ }))
    };
  }

  step(input = {}) {
    this.events = [];
    if (this.state === 'won' || this.state === 'lost') return this.events;
    this.tick++;
    const edge = {};
    for (const button of BUTTONS) {
      edge[button] = Boolean(input[button]) && !this.previousButtons[button];
      this.previousButtons[button] = Boolean(input[button]);
    }
    if (edge.pause) {
      this.state = this.state === 'paused' ? 'playing' : 'paused';
      this.event(this.state === 'paused' ? 'paused' : 'resumed', {});
    }
    if (this.state === 'paused') return this.events;

    this.simTick++;
    this.updateTimers();
    const active = movePlayer(this, input, edge);
    if (active) {
      this.pickItems();
      if (edge.interact) this.deposit();
    }
    updateSafety(this);
    if (active && edge.pulse) activatePulse(this);
    moveShades(this);
    moveDrifters(this);
    if (active) resolveContacts(this);
    this.spawn();
    this.finishIfNeeded();
    return this.events;
  }

  updateTimers() {
    tickPlayerTimers(this.player);
    tickHazardTimers(this);
    this.motes = this.motes.filter((mote) => mote.ttl === null || --mote.ttl > 0);
    for (const charm of this.charms) if (charm.respawn > 0) charm.respawn--;
    if (!this.windEnabled) return;
    const phase = this.simTick % WIND_INTERVAL;
    if (phase === WIND_INTERVAL - WIND_WARNING) this.wind.dir_deg = Math.floor(this.windRandom() * 360);
    this.wind.warning = phase >= WIND_INTERVAL - WIND_WARNING;
    this.wind.active = this.simTick >= WIND_INTERVAL && phase < WIND_DURATION;
  }

  pickItems() {
    const { player, tuning } = this;
    const nearby = (pos) => distanceXZ(player.pos, pos) <= tuning.pickup_radius
      && Math.abs(player.pos[1] - pos[1]) <= tuning.pickup_height;
    if (player.carried < tuning.carry_capacity) {
      this.motes = this.motes.filter((mote) => {
        if (player.carried >= tuning.carry_capacity || mote.availableAt > this.simTick || !nearby(mote.pos)) return true;
        this.event('mote_picked', { carried: ++player.carried });
        return false;
      });
    }
    for (const charm of this.charms) {
      if (charm.respawn > 0 || !nearby(charm.pos)) continue;
      player.charm = CHARM_EFFECT;
      player.dashCd = 0;
      charm.respawn = CHARM_RESPAWN;
      this.event('charm_picked', { charm_id: charm.id, charm_ticks: CHARM_EFFECT });
    }
  }

  targetLantern() {
    let nearest = null;
    let distance = Infinity;
    for (const lantern of this.lanterns) {
      if (lantern.lit) continue;
      const separation = distanceXZ(this.player.pos, lantern.pos);
      if (separation <= this.tuning.interact_radius && separation < distance) {
        nearest = lantern;
        distance = separation;
      }
    }
    return nearest;
  }

  deposit() {
    const target = this.targetLantern();
    if (!target) return;
    const amount = Math.min(this.player.carried, this.tuning.lantern_cost - target.deposited);
    if (amount <= 0) return;
    target.deposited += amount;
    this.player.carried -= amount;
    this.score += amount * this.tuning.score.per_mote;
    this.event('deposit', { lantern_id: target.id, amount, deposited: target.deposited });
    if (target.deposited === this.tuning.lantern_cost) {
      target.lit = true;
      this.score += this.tuning.score.per_lantern;
      this.event('lantern_lit', { lantern_id: target.id });
    }
  }

  spawn() {
    const { simTick, map } = this;
    if (this.randomMotes && simTick % MOTE_INTERVAL === 0 && this.motes.length < MOTE_LIMIT) {
      const available = map.motePoints.filter((pos) => !this.motes.some((mote) => positionsMatch(mote.pos, pos)));
      if (available.length) this.addMote(takeRandom(available, this.random));
    }
    if (this.randomShades && simTick >= SHADE_FIRST_TICK && (simTick - SHADE_FIRST_TICK) % map.shadeInterval === 0) {
      const available = map.shadePoints.filter((pos) => distanceXZ(pos, this.player.pos) >= 15
        && !this.shades.some((shade) => distanceXZ(shade.pos, pos) < 1));
      const batch = Math.min(simTick === SHADE_FIRST_TICK ? 2 : 1, map.shadeLimit - this.shades.length, available.length);
      for (let index = 0; index < batch; index++) {
        const [x, y, z] = takeRandom(available, this.random);
        const id = this.addShade({ pos: [x, y + 0.8, z], state: 'spawning', state_ticks_left: 1 });
        this.event('shade_spawned', { id });
      }
    }
    if (this.randomDrifters && simTick % DRIFTER_INTERVAL === 0 && this.drifters.length < 2) {
      const available = map.shadePoints.filter((pos) =>
        !this.drifters.some((drifter) => distanceXZ(drifter.pos, pos) < 1.2));
      if (available.length) {
        const [x, y, z] = takeRandom(available, this.random);
        this.addDrifter({ pos: [x, y + 1.1, z] });
      }
    }
  }

  finishIfNeeded() {
    const reason = this.player.flames <= 0 ? 'no_flames'
      : this.lanterns.every(({ lit }) => lit) ? 'all_lit'
      : this.timeLeft <= 0 ? 'dawn' : null;
    if (!reason) return;
    this.state = reason === 'all_lit' ? 'won' : 'lost';
    if (this.state === 'won') {
      this.score += Math.max(0, Math.floor(this.timeLeft)) * this.tuning.score.per_second_left
        + this.player.flames * this.tuning.score.per_flame_left;
    }
    this.event('game_over', { result: this.state, reason });
  }
}
