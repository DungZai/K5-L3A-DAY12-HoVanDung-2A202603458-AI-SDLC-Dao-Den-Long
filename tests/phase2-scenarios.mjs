import { isolated } from './headless.mjs';

export const phase2Cases = {
  dash: {
    scenario: isolated, ticks: 20, snapshot: 1,
    inputs: { frames: [{ tick: 0, jump: true }, { tick: 5, dash: true }] }
  },
  pause: {
    scenario: { ...isolated, player: { pulse_cd_ticks: 60, charm_ticks: 600, invuln_ticks: 8 } },
    ticks: 18, snapshot: 1, inputs: { frames: [
      { tick: 0, move: [0, 1] }, { tick: 4, pause: true },
      { tick: 9, pause: false }, { tick: 14, pause: true }
    ] }
  },
  fall: {
    scenario: { ...isolated, player: { pos: [41, -10.1, 0], carried: 8, invuln_ticks: 90 } },
    ticks: 65, snapshot: 1
  },
  bridge: { night: 2, scenario: { ...isolated, charms: [], player: { pos: [26, 0, 0] } }, ticks: 180, snapshot: 30,
    inputs: { frames: [{ tick: 0, move: [1, 0] }] } },
  'jump-cau': {
    night: 2, scenario: { ...isolated, player: { pos: [20, 0, 18] } }, ticks: 90, snapshot: 3,
    inputs: { frames: [{ tick: 0, move: [-1, 0] }] }
  },
  'jump-chuong': { night: 3, scenario: { ...isolated, player: { pos: [0, 3, 13] } }, ticks: 60, snapshot: 1 },
  ramp: {
    night: 3, scenario: { ...isolated, player: { pos: [30 * Math.cos(Math.PI / 6), 0, 15] } },
    ticks: 66, snapshot: 6, inputs: { frames: [{ tick: 0, move: [-Math.cos(Math.PI / 6), -0.5] }] }
  },
  charm: { night: 2, scenario: { ...isolated, player: { pos: [35, 0, 0] } },
    ticks: 2710, snapshot: 100 },
  drifter: {
    night: 2, scenario: { ...isolated, player: { carried: 10 }, shades: [{ pos: [0, 0.8, 0] }],
      drifters: [{ id: 'D7', pos: [0, 1.1, 0] }] }, ticks: 123, snapshot: 1,
    inputs: { frames: [{ tick: 1, pulse: true }] }
  },
  'drifter-spawn': { night: 2, scenario: { ...isolated, random_drifters: true }, ticks: 2400, snapshot: 600 },
  wind: { seed: 928, night: 3, scenario: { ...isolated, wind_enabled: true }, ticks: 2101, snapshot: 1 },
  performance: { night: 3, ticks: 18000, snapshot: 600, scenario: { wind_enabled: false, random_drifters: false,
    player: { invuln_ticks: 18001 },
    lanterns: [{ id: 'L1', lit: true, pos: [0, 0, 0] }] } }
};
