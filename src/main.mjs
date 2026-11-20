import { HZ, Night } from './game.mjs';
import { createScene } from './scene.mjs';

const elements = Object.fromEntries(
  ['world', 'flames', 'carried', 'lit', 'timer', 'score', 'objective', 'hint',
    'overlay', 'overlay-title', 'overlay-copy', 'begin'].map((id) => [id, document.getElementById(id)])
);
const messages = {
  all_lit: ['Đảo đã bừng sáng!', 'Mây đã thắp lại cả năm chiếc đèn lồng.'],
  no_flames: ['Ánh sáng đã tắt', 'Bóng Mực đã làm Mây cạn sinh lực.'],
  dawn: ['Bình minh đã lên', 'Các đèn lồng còn dang dở.']
};
const timeFormat = (seconds) => {
  const remaining = Math.max(0, Math.ceil(seconds));
  return [Math.floor(remaining / 60), remaining % 60].map((value) => String(value).padStart(2, '0')).join(':');
};

async function startGame() {
  const response = await fetch('/game.contract.json');
  if (!response.ok) throw new Error('Không đọc được cấu hình của game.');
  const { tuning } = await response.json();
  const scene = createScene(elements.world, tuning);
  const seed = 1847;
  const keys = new Set();
  const actionKeys = new Map([['Space', 'jump'], ['KeyE', 'interact'], ['KeyQ', 'pulse']]);
  const queued = new Set();
  const released = new Set();
  const controls = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowLeft', 'ArrowRight', ...actionKeys.keys()]);
  let night = new Night(tuning, seed);
  let started = false;
  let yaw = 0;
  let accumulator = 0;
  let lastTime;
  let pointer;
  let notice;
  let noticeUntil = 0;

  const showNotice = (text) => {
    notice = text;
    noticeUntil = night.tick + HZ * 2;
  };

  function updateHud() {
    const { player } = night;
    const lit = night.lanterns.filter((lantern) => lantern.lit).length;
    const values = {
      flames: `${player.flames} / ${tuning.flames}`,
      carried: `${player.carried} / ${tuning.carry_capacity}`,
      lit: `${lit} / ${tuning.lantern_count_night1}`,
      timer: timeFormat(night.timeLeft),
      score: String(night.score)
    };
    for (const [key, value] of Object.entries(values)) {
      if (elements[key].textContent !== value) elements[key].textContent = value;
    }
    const target = night.targetLantern();
    const missing = target ? tuning.lantern_cost - target.deposited : 0;
    const hint = !started ? '' : night.tick < noticeUntil ? notice : target
      ? player.carried > 0 ? `E để nạp đèn · Còn thiếu ${missing} đom đóm` : `Đèn gần Mây cần ${missing} đom đóm`
      : '';
    if (elements.hint.textContent !== hint) elements.hint.textContent = hint;
  }

  function gameOver(reason) {
    const [title, copy] = messages[reason];
    elements['overlay-title'].textContent = title;
    elements['overlay-copy'].textContent = `${copy} Điểm của bạn là ${night.score}.`;
    elements.overlay.hidden = false;
    elements.begin.textContent = 'Chơi lại';
    elements.begin.focus();
  }

  elements.begin.disabled = false;
  elements.begin.textContent = 'Bắt đầu';
  elements.begin.addEventListener('click', () => {
    night = new Night(tuning, seed);
    started = true;
    yaw = 0;
    noticeUntil = 0;
    accumulator = 0;
    keys.clear();
    queued.clear();
    released.clear();
    scene.reset();
    elements.overlay.hidden = true;
    elements.begin.blur();
    updateHud();
  });

  window.addEventListener('keydown', (event) => {
    if (!started || night.state !== 'playing' || !controls.has(event.code)) return;
    event.preventDefault();
    if (!event.repeat && actionKeys.has(event.code)) {
      const action = actionKeys.get(event.code);
      queued.add(action);
    }
    keys.add(event.code);
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
    if (actionKeys.has(event.code)) released.add(actionKeys.get(event.code));
  });
  window.addEventListener('blur', () => {
    keys.clear();
    queued.clear();
    released.clear();
    pointer = undefined;
  });
  elements.world.addEventListener('pointerdown', (event) => {
    if (!started || event.button !== 0) return;
    pointer = event.clientX;
    elements.world.setPointerCapture(event.pointerId);
  });
  elements.world.addEventListener('pointermove', (event) => {
    if (pointer === undefined) return;
    yaw += (pointer - event.clientX) * 0.008;
    pointer = event.clientX;
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    elements.world.addEventListener(event, () => { pointer = undefined; });
  }

  function step() {
    yaw += (Number(keys.has('ArrowLeft')) - Number(keys.has('ArrowRight'))) * 1.95 / HZ;
    const input = {
      move: [Number(keys.has('KeyA')) - Number(keys.has('KeyD')),
        Number(keys.has('KeyW')) - Number(keys.has('KeyS'))],
      cam_yaw_deg: yaw * 180 / Math.PI
    };
    for (const [key, action] of actionKeys) {
      if (queued.has(action) && released.has(action) && night.previousButtons[action]) {
        input[action] = false;
      } else {
        input[action] = queued.delete(action) || keys.has(key);
      }
      released.delete(action);
    }
    const pulsePressed = input.pulse && !night.previousButtons.pulse;
    const events = night.step(input);
    for (const event of events) {
      if (event.name === 'lantern_lit') showNotice('Một đèn lồng đã sáng.');
      if (event.name === 'player_hit') showNotice('Bóng Mực chạm Mây! Về gần đèn đã sáng để trú.');
      if (event.name === 'pulse') {
        scene.flash(night.player.pos);
        showNotice(event.data.stunned_ids.length ? 'Bóng Mực đã bị xua đi.' : 'Mây đã tỏa sáng.');
      }
      if (event.name === 'game_over') gameOver(event.data.reason);
    }
    if (pulsePressed && !events.some((event) => event.name === 'pulse')
        && night.player.carried < tuning.pulse_cost && night.state === 'playing') {
      showNotice(`Tỏa sáng cần ${tuning.pulse_cost} đom đóm.`);
    }
  }

  function frame(now) {
    const seconds = lastTime === undefined ? 0 : Math.min((now - lastTime) / 1000, 0.25);
    lastTime = now;
    if (started && night.state === 'playing') {
      accumulator += seconds;
      while (accumulator >= 1 / HZ && night.state === 'playing') {
        step();
        accumulator -= 1 / HZ;
      }
    }
    updateHud();
    scene.render(night, yaw, seconds);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

startGame().catch((error) => {
  elements['overlay-title'].textContent = 'Chưa mở được game';
  elements['overlay-copy'].textContent = 'Kiểm tra trình duyệt hỗ trợ WebGL và máy chủ local đang chạy.';
  elements.begin.hidden = true;
  console.error(error);
});
