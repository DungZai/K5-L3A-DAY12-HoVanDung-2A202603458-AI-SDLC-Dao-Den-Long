const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isCount = (value) => Number.isSafeInteger(value) && value >= 0;
const isPosition = (value) => Array.isArray(value) && value.length === 3 && value.every(isNumber);
const isId = (value) => typeof value === 'string' && value.length > 0;

function check(valid, name) {
  if (!valid) throw new Error(`Invalid field: ${name}`);
}

function optional(record, field, predicate, path = field) {
  if (Object.hasOwn(record, field)) check(predicate(record[field]), path);
}

export function validateFrames(inputs) {
  check(isRecord(inputs) && Array.isArray(inputs.frames), 'inputs.frames');
  let previousTick = -1;
  for (const frame of inputs.frames) {
    check(isRecord(frame), 'frame');
    check(isCount(frame.tick) && frame.tick > previousTick, 'frame.tick (must increase strictly)');
    previousTick = frame.tick;
    optional(frame, 'move', (value) => Array.isArray(value) && value.length === 2
      && value.every((entry) => isNumber(entry) && Math.abs(entry) <= 1), 'frame.move');
    optional(frame, 'cam_yaw_deg', isNumber, 'frame.cam_yaw_deg');
    for (const button of ['jump', 'interact', 'pulse', 'dash']) {
      optional(frame, button, (value) => typeof value === 'boolean', `frame.${button}`);
    }
  }
  return inputs.frames;
}

function checkEntries(records, path, validate) {
  const ids = new Set();
  for (const entry of records) {
    check(isRecord(entry), path);
    validate(entry);
    if (entry.id !== undefined) {
      check(!ids.has(entry.id), `${path}.id (duplicate)`);
      ids.add(entry.id);
    }
  }
}

export function validateScenario(scenario) {
  check(isRecord(scenario), 'scenario');
  optional(scenario, 'player', isRecord);
  optional(scenario, 'time_left_s', (value) => isNumber(value) && value >= 0);
  for (const field of ['random_motes', 'random_shades']) {
    optional(scenario, field, (value) => typeof value === 'boolean');
  }
  for (const field of ['motes', 'shades', 'lanterns']) optional(scenario, field, Array.isArray);
  if (scenario.player) {
    optional(scenario.player, 'pos', isPosition, 'player.pos');
    optional(scenario.player, 'carried', isCount, 'player.carried');
    optional(scenario.player, 'flames', isCount, 'player.flames');
  }
  if (scenario.motes) check(scenario.motes.every(isPosition), 'motes[]');
  checkEntries(scenario.shades ?? [], 'shades[]', (entry) => {
    check(isPosition(entry.pos), 'shade.pos');
    optional(entry, 'id', isId, 'shade.id');
  });
  checkEntries(scenario.lanterns ?? [], 'lanterns[]', (entry) => {
    check(typeof entry.id === 'string' && /^L[1-5]$/.test(entry.id), 'lantern.id');
    optional(entry, 'pos', isPosition, 'lantern.pos');
    optional(entry, 'deposited', isCount, 'lantern.deposited');
    optional(entry, 'lit', (value) => typeof value === 'boolean', 'lantern.lit');
  });
  return scenario;
}

export class InputTimeline {
  constructor(frames = []) {
    this.frames = frames;
    this.index = 0;
    this.input = {};
  }

  forTick(tick) {
    const frame = this.frames[this.index];
    if (frame?.tick === tick) {
      Object.assign(this.input, frame);
      this.index++;
    }
    return this.input;
  }
}
