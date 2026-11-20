import { closeSync, openSync, readFileSync, writeSync } from 'node:fs';
import { Night } from '../src/game.mjs';
import { InputTimeline, validateFrames, validateScenario } from '../src/scenario.mjs';

const contract = JSON.parse(readFileSync(new URL('../game.contract.json', import.meta.url), 'utf8'));
const options = new Set(['seed', 'night', 'scenario', 'inputs', 'ticks', 'out', 'snapshot-every']);

function parseArguments(args) {
  const values = Object.create(null);
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index].startsWith('--') && args[index].slice(2);
    const value = args[index + 1];
    if (!options.has(key) || Object.hasOwn(values, key) || !value || value.startsWith('--')) {
      throw new Error(`Invalid option: ${args[index]}`);
    }
    values[key] = value;
  }
  for (const required of ['seed', 'night', 'ticks', 'out']) {
    if (!Object.hasOwn(values, required)) throw new Error(`Missing --${required}`);
  }
  if (!['1', '2', '3'].includes(values.night)) throw new Error('--night must be 1, 2, or 3');
  values.night = Number(values.night);
  for (const [key, min] of [['seed', Number.MIN_SAFE_INTEGER], ['ticks', 0], ['snapshot-every', 1]]) {
    const value = values[key] ?? '10';
    if (!/^[+-]?\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < min) {
      throw new Error(`Invalid --${key}: ${value}`);
    }
    values[key] = Number(value);
  }
  return values;
}

class InputFileError extends Error {}

function readInput(file, validate, fallback) {
  if (!file) return fallback;
  try {
    const text = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    return validate(JSON.parse(text));
  } catch (error) {
    throw new InputFileError(`${file}: ${error.message}`);
  }
}

try {
  const args = parseArguments(process.argv.slice(2));
  const scenario = readInput(args.scenario, (input) => validateScenario(input, args.night), {});
  const timeline = new InputTimeline(readInput(args.inputs, validateFrames, []));
  const night = new Night(contract.tuning, args.seed, scenario, args.night);
  const output = openSync(args.out, 'w');
  const write = (record) => writeSync(output, JSON.stringify(record) + '\n');
  try {
    write(night.snapshot());
    write({ type: 'event', tick: 0, name: 'night_start', data: { night: args.night } });
    while (night.tick < args.ticks && (night.state === 'playing' || night.state === 'paused')) {
      for (const event of night.step(timeline.forTick(night.tick))) write(event);
      if (night.tick % args['snapshot-every'] === 0) write(night.snapshot());
    }
    write({ type: 'end', ticks: night.tick, state: night.state, score: night.score });
  } finally {
    closeSync(output);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = error instanceof InputFileError ? 2 : 1;
}
