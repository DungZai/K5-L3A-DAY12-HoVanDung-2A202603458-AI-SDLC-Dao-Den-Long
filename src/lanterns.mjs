// Each fuel unit represents 1/60 of a point, so decay and drain are exact at 60 Hz.
export const FUEL_SCALE = 60;
export const DRAIN_RADIUS = 2;
export const DRAIN_ALERT_RADIUS = 6;
const DRAIN_REPORT_TICKS = 60;

export const fuelUnits = (amount) => Math.round(amount * FUEL_SCALE);
export const fuelAmount = (lantern) => lantern.lit ? Math.round(lantern.fuel * 10 / FUEL_SCALE) / 10 : 0;
export const isWeak = (lantern, tuning) => lantern.lit && lantern.fuel < fuelUnits(tuning.low_fuel_threshold);
export const isSafe = (lantern, tuning) => lantern.lit && !isWeak(lantern, tuning);
export const lightCost = (lantern, tuning) => lantern.everLit ? tuning.relight_cost : tuning.lantern_cost;

export function drainTarget(night, shade) {
  const lantern = night.lanterns.find(({ id }) => id === shade.targetLanternId);
  if (!lantern || !isWeak(lantern, night.tuning)) return null;
  const [x, , z] = shade.pos;
  return Math.hypot(x - lantern.pos[0], z - lantern.pos[2]) <= DRAIN_RADIUS ? lantern : null;
}

export function tickFuel(night) {
  const { tuning } = night;
  const drainers = new Map();
  for (const shade of night.shades) {
    if (shade.state !== 'drain') continue;
    const lantern = drainTarget(night, shade);
    if (!lantern) continue;
    if (!drainers.has(lantern.id)) drainers.set(lantern.id, []);
    drainers.get(lantern.id).push(shade);
    shade.drainTicks++;
  }
  for (const lantern of night.lanterns) {
    if (!lantern.lit) continue;
    const active = drainers.get(lantern.id) ?? [];
    lantern.fuel = Math.max(0, lantern.fuel - tuning.fuel_decay_per_s - active.length * tuning.drain_per_s);
    for (const shade of active) {
      if (shade.drainTicks % DRAIN_REPORT_TICKS === 0) {
        night.event('fuel_drain', { lantern_id: lantern.id, shade_id: shade.id, fuel: fuelAmount(lantern) });
      }
    }
  }
  for (const lantern of night.lanterns) {
    if (!lantern.lit || lantern.fuel > 0) continue;
    lantern.lit = false;
    lantern.deposited = 0;
    lantern.everLit = true;
    night.event('lantern_out', { lantern_id: lantern.id });
  }
}
