import { Night, seededRandom } from './game.mjs';
import { moveShades, updateSafety } from './hazards.mjs';

const TAU = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function scatter(random, count, y) {
  const rotation = random() * TAU;
  return Array.from({ length: count }, (_, index) => {
    const radius = 39.5 * Math.sqrt((index + random()) / count);
    const angle = rotation + index * GOLDEN_ANGLE + (random() - 0.5) * 0.11;
    return [radius * Math.cos(angle), y, radius * Math.sin(angle)];
  });
}

export function benchmarkNight(tuning, seed) {
  const random = seededRandom(seed);
  const night = new Night(tuning, seed, {
    random_motes: false, random_shades: false, random_drifters: false, wind_enabled: false,
    lanterns: ['L1', 'L2', 'L3'].map((id) => ({ id, lit: true, fuel: 100 })),
    motes: scatter(random, 100, 0),
    shades: scatter(random, 200, 0.8).map((pos) => ({ pos, state: 'wander' }))
  });
  updateSafety(night);
  return night;
}

export function stepBenchmark(night) {
  night.tick++;
  night.simTick++;
  moveShades(night, false);
}

export function benchmarkCamera(seconds) {
  const angle = TAU * seconds / 15;
  return [30 * Math.cos(angle), 15, 30 * Math.sin(angle)];
}
