import { readFileSync, writeFileSync } from 'node:fs';
import { Night, HZ, seededRandom } from '../src/game.mjs';
import { integer, parseOptions } from './cli-options.mjs';

const MB = 1024 ** 2;
const round = (number) => Math.round(number * 100) / 100;
const { tuning } = JSON.parse(readFileSync(new URL('../game.contract.json', import.meta.url), 'utf8'));

function runNight(night, random) {
  const input = { move: [0, 0], jump: false, dash: false, pulse: false, interact: false };
  const limit = tuning[`night${night.number}_duration_s`] * HZ;
  while (night.state === 'playing' && night.simTick < limit) {
    if (night.simTick % 30 === 0) {
      const angle = random() * Math.PI * 2;
      input.move[0] = Math.cos(angle);
      input.move[1] = Math.sin(angle);
    }
    input.jump = random() < 0.05;
    input.dash = random() < 0.03;
    input.pulse = random() < 0.02;
    input.interact = random() < 0.1;
    night.step(input);
  }
  return night.state;
}

try {
  const options = parseOptions(process.argv.slice(2), ['seed', 'nights', 'out']);
  const seed = integer(options.seed, 'seed');
  const count = integer(options.nights, 'nights', 1);
  const start = performance.now();
  const results = [];
  let crashes = 0;
  let startBytes;
  for (let index = 0; index < count; index++) {
    try {
      const nightSeed = seed + index;
      const night = new Night(tuning, nightSeed, {}, index % 3 + 1);
      if (index === 0) {
        globalThis.gc?.();
        startBytes = process.memoryUsage.rss();
      }
      results.push(runNight(night, seededRandom(nightSeed ^ 0x267217f9)));
    } catch (error) {
      crashes++;
      results.push('crashed');
      console.error(`Đêm ${index + 1}: ${error.message}`);
    }
  }
  globalThis.gc?.();
  const payload = { nights: count, crashes, results,
    mem_start_mb: startBytes === undefined ? null : round(startBytes / MB),
    mem_end_mb: round(process.memoryUsage.rss() / MB),
    duration_s: round((performance.now() - start) / 1000) };
  writeFileSync(options.out, JSON.stringify(payload, null, 2) + '\n');
  console.log(JSON.stringify(payload));
  if (crashes) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
