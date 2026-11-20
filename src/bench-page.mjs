import { REVISION } from '/vendor/three.module.js';
import { HZ } from './game.mjs';
import { benchmarkCamera, benchmarkNight, stepBenchmark } from './benchmark-scene.mjs';
import { createScene } from './scene.mjs';

async function runBenchmark() {
  const query = new URLSearchParams(location.search);
  const seed = Number(query.get('seed') ?? 42);
  const duration = 1000 * Number(query.get('duration') ?? 30);
  const response = await fetch('/game.contract.json');
  if (!response.ok) throw new Error('Không mở được Test Contract.');
  const { tuning } = await response.json();
  const world = document.getElementById('world');
  const night = benchmarkNight(tuning, seed);
  const scene = createScene(world, tuning, { benchmark: true });
  const canvas = world.querySelector('canvas');
  if (canvas.width !== 1280 || canvas.height !== 720) throw new Error('Bộ đệm phải là 1280×720.');
  const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
  const intervals = [];
  const warmup = 3000;
  let first;
  let previous;
  let measureStart;
  let measureEnd;
  let movementTime = 0;
  let firstFrameEpoch;
  function draw(now) {
    if (first === undefined) first = now;
    const ms = now - first;
    const delta = previous === undefined ? 0 : now - previous;
    const targetTick = Math.floor(ms * HZ / 1000);
    while (night.simTick < targetTick) stepBenchmark(night);
    movementTime += delta / 1000;
    scene.render(night, 0, delta / 1000, benchmarkCamera(movementTime));
    const drawn = performance.now();
    if (firstFrameEpoch === undefined) {
      firstFrameEpoch = performance.timeOrigin + drawn;
      measureStart = drawn + warmup;
      measureEnd = measureStart + duration;
    }
    if (drawn >= measureStart && drawn <= measureEnd && previousDraw >= measureStart) {
      intervals.push(drawn - previousDraw);
    }
    if (drawn >= measureEnd) {
      globalThis.__benchResult = { firstFrameEpoch, intervals, renderer: `Three.js r${REVISION} · WebGL · ${gpu}` };
      return;
    }
    previous = now;
    previousDraw = drawn;
    requestAnimationFrame(draw);
  }
  let previousDraw;
  requestAnimationFrame(draw);
}

runBenchmark().catch((error) => { globalThis.__benchResult = { error: error.message }; });
