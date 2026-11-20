import { isolated } from './headless.mjs';

const lanternAt = (id, pos, fuel) => ({ id, pos, lit: true, ...(fuel === undefined ? {} : { fuel }) });
const drainAt = (id, pos, target_lantern_id = 'L1') => ({ id, pos, state: 'drain', target_lantern_id });

export const phase3Cases = {
  relight: {
    scenario: { ...isolated, player: { carried: 5 }, lanterns: [lanternAt('L1', [0, 0, 0])] },
    inputs: { frames: [{ tick: 5999, interact: true }] }, ticks: 6000, snapshot: 60
  },
  refuel: {
    scenario: { ...isolated, player: { carried: 7 },
      lanterns: [lanternAt('L1', [1, 0, 0], 91), { id: 'L2', pos: [-1, 0, 0] }] },
    inputs: { frames: [{ tick: 0, interact: true }] }, ticks: 3, snapshot: 1
  },
  drain: {
    scenario: { ...isolated, lanterns: [lanternAt('L1', [15, 0, 0], 29)],
      shades: [drainAt('S1', [15, 0.8, 0]), drainAt('S2', [16, 0.8, 0])] },
    ticks: 160, snapshot: 1
  },
  'restore-safety': {
    scenario: { ...isolated, player: { carried: 1 },
      lanterns: [lanternAt('L1', [0, 0, 0], 21)],
      shades: [drainAt('S1', [0, 0.8, 0]), drainAt('S2', [1, 0.8, 0])] },
    inputs: { frames: [{ tick: 0, interact: true }] }, ticks: 33, snapshot: 1
  },
  'pulse-drain': {
    scenario: { ...isolated, player: { carried: 3 }, lanterns: [lanternAt('L1', [3, 0, 0], 29)],
      shades: [drainAt('S1', [3, 0.8, 0]), { id: 'S2', pos: [4, 0.8, 0] }] },
    inputs: { frames: [{ tick: 0, pulse: true }] }, ticks: 122, snapshot: 1
  },
  dawn: {
    scenario: { ...isolated, time_left_s: 1,
      lanterns: [lanternAt('L1', [0, 0, 0]), lanternAt('L2', [8, 0, 8], 60.8), lanternAt('L3', [16, 0, 16], 30.4)] },
    ticks: 120, snapshot: 15
  },
  'dawn-out': {
    scenario: { ...isolated, time_left_s: 1 / 60,
      lanterns: [lanternAt('L1', [0, 0, 0]), lanternAt('L2', [8, 0, 8]), lanternAt('L3', [16, 0, 16], 1 / 60)] },
    ticks: 2, snapshot: 1
  },
  'pause-fuel': {
    scenario: { ...isolated, lanterns: [lanternAt('L1', [14, 0, 0], 29)], shades: [drainAt('S1', [14, 0.8, 0])] },
    inputs: { frames: [{ tick: 30, pause: true }, { tick: 31, pause: false }, { tick: 90, pause: true }] },
    ticks: 121, snapshot: 1
  },
  capacity: {
    scenario: { ...isolated, player: { carried: 5, successful_lights: 4 },
      lanterns: [{ id: 'L1', pos: [0, 0, 0], ever_lit: true }, lanternAt('L2', [15, 0, 0])] },
    inputs: { frames: [{ tick: 0, interact: true }] }, ticks: 3, snapshot: 1
  }
};
