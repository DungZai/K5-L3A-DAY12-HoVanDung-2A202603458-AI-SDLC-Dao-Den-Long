import { HZ, Night } from './game.mjs';
import { MAPS } from './maps.mjs';
import { GameSound } from './audio.mjs';
import { fuelAmount, isWeak, lightCost } from './lanterns.mjs';
import { createScene } from './scene.mjs';

const elements = Object.fromEntries(Array.from(document.querySelectorAll('[id]'), (element) => [element.id, element]));
const keyActions = new Map([
  ['Space', 'jump'], ['KeyE', 'interact'], ['KeyQ', 'pulse'], ['ShiftLeft', 'dash'],
  ['ShiftRight', 'dash'], ['Escape', 'pause'], ['KeyP', 'pause']
]);
const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowLeft', 'ArrowRight']);
const sounds = new Set(['mote_picked', 'lantern_lit', 'refuel', 'pulse', 'player_hit', 'dash', 'shade_spawned', 'charm_picked']);
const timeLabel = (seconds) => [Math.floor(seconds / 60), seconds % 60]
  .map((value) => String(value).padStart(2, '0')).join(':');
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const settingsKey = 'dao-den-long-settings';

function readSettings() {
  const defaults = { volume: 65, sensitivity: 100, colorblind: false };
  try {
    const saved = JSON.parse(localStorage.getItem(settingsKey) ?? '{}') ?? {};
    return {
      volume: Number.isFinite(saved.volume) ? clamp(saved.volume, 0, 100) : defaults.volume,
      sensitivity: Number.isFinite(saved.sensitivity) ? clamp(saved.sensitivity, 25, 200) : defaults.sensitivity,
      colorblind: saved.colorblind === true
    };
  } catch {
    return defaults;
  }
}

function setText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

async function startGame() {
  const response = await fetch('/game.contract.json');
  if (!response.ok) throw new Error('Không đọc được cấu hình game.');
  const { tuning } = await response.json();
  const config = readSettings();
  const sound = new GameSound(config.volume / 100);
  const scene = createScene(elements.world, tuning);
  const keys = new Set();
  const pending = new Set();
  const wonScores = [];
  const seeds = [1847, 2471, 3179];
  let night = new Night(tuning, seeds[0]);
  let screen = 'menu';
  let settingsReturn;
  let accumulator = 0;
  let lastTime;
  let timeShown;
  let yaw = 0;
  let pointer;
  let notice = '';
  let noticeUntil = 0;

  const slots = Array.from({ length: tuning.capacity_max }, () => {
    const slot = document.createElement('i');
    elements['mote-slots'].append(slot);
    return slot;
  });
  const flames = Array.from({ length: tuning.flames }, () => {
    const flame = document.createElement('i');
    flame.setAttribute('aria-hidden', 'true');
    elements.flames.append(flame);
    return flame;
  });

  function showOverlay(next, title, description, actions, chapter = '') {
    screen = next;
    elements.overlay.hidden = false;
    elements.overlay.classList.toggle('dawn', next === 'dawn');
    elements.settings.hidden = next !== 'settings';
    setText(elements['overlay-chapter'], chapter);
    setText(elements['overlay-title'], title);
    setText(elements['overlay-copy'], description);
    elements['menu-actions'].replaceChildren();
    for (const [index, [label, action]] of actions.entries()) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      if (index > 0) button.classList.add('secondary');
      button.addEventListener('click', action);
      elements['menu-actions'].append(button);
    }
  }

  function applySettings() {
    elements.volume.value = String(config.volume);
    elements.sensitivity.value = String(config.sensitivity);
    elements.colorblind.checked = config.colorblind;
    setText(elements['volume-value'], `${config.volume}%`);
    setText(elements['sensitivity-value'], `${config.sensitivity}%`);
    sound.setVolume(config.volume / 100);
    document.body.classList.toggle('accessible-palette', config.colorblind);
    scene.setAccessiblePalette(config.colorblind);
    try { localStorage.setItem(settingsKey, JSON.stringify(config)); } catch { /* Storage may be disabled. */ }
  }

  function openSettings(back) {
    settingsReturn = back;
    applySettings();
    showOverlay('settings', 'Cài đặt', '', [['Quay lại', back]]);
  }

  elements.volume.addEventListener('input', () => {
    config.volume = Number(elements.volume.value);
    applySettings();
  });
  elements.sensitivity.addEventListener('input', () => {
    config.sensitivity = Number(elements.sensitivity.value);
    applySettings();
  });
  elements.colorblind.addEventListener('change', () => {
    config.colorblind = elements.colorblind.checked;
    applySettings();
  });

  function newNight(number) {
    night = new Night(tuning, seeds[number - 1], {}, number);
    keys.clear();
    pending.clear();
    yaw = 0;
    accumulator = 0;
    noticeUntil = 0;
    timeShown = undefined;
    scene.reset();
  }

  function menu() {
    sound.stopNight();
    wonScores.length = 0;
    newNight(1);
    elements.hud.hidden = true;
    elements.controls.hidden = true;
    showOverlay('menu', 'Đảo Đèn Lồng', 'Cùng Mây giữ ánh sáng trên ba hòn đảo tới bình minh.', [
      ['Bắt đầu hành trình', () => {
        sound.enable();
        introduction(1);
      }], ['Cài đặt', () => openSettings(menu)]
    ]);
  }

  function introduction(number) {
    sound.stopNight();
    newNight(number);
    elements.hud.hidden = true;
    elements.controls.hidden = true;
    const { title, introduction: greeting } = MAPS[number];
    showOverlay('intro', title, `${greeting} Giữ ít nhất ${night.requiredLights}/${night.lanterns.length} đèn sáng tới bình minh.`,
      [['Vào Đêm', () => enterNight(number)], ['Về menu', menu]], `Đêm ${number}`);
  }

  function enterNight(number) {
    sound.enable();
    newNight(number);
    sound.night(number);
    screen = 'playing';
    elements.overlay.hidden = true;
    elements.hud.hidden = false;
    elements.controls.hidden = false;
  }

  function pauseMenu() {
    showOverlay('paused', 'Tạm dừng', '', [
      ['Tiếp tục', () => pending.add('pause')],
      ['Chơi lại Đêm', () => enterNight(night.number)],
      ['Cài đặt', () => openSettings(pauseMenu)],
      ['Về menu', menu]
    ], `Đêm ${night.number} · ${night.map.title}`);
  }

  function gameOver(result, reason) {
    sound.stopNight();
    sound.play(result);
    keys.clear();
    pending.clear();
    elements.controls.hidden = true;
    const { number, score } = night;
    const chapter = `Đêm ${number} · ${night.map.title}`;
    if (result === 'won') {
      wonScores[number - 1] = score;
      const total = wonScores.reduce((sum, points) => sum + points, 0);
      if (number === 3) {
        showOverlay('dawn', 'Bình Minh', `Mây đã giữ được ánh sáng qua ba Đêm. Tổng điểm ${total}.`,
          [['Về menu', menu]], 'Hoàn thành hành trình');
      } else {
        showOverlay('result', 'Qua Đêm', `Điểm Đêm ${number} là ${score}. Tổng điểm ${total}.`,
          [['Đêm kế tiếp', () => introduction(number + 1)], ['Về menu', menu]], chapter);
      }
    } else {
      const copy = reason === 'dawn' ? `Bình minh đã lên. Cần giữ ít nhất ${night.requiredLights} đèn sáng.`
        : 'Mây đã hết Ngọn Lửa.';
      showOverlay('result', 'Đêm chưa sáng', copy,
        [['Chơi lại Đêm', () => enterNight(number)], ['Về menu', menu]], chapter);
    }
  }

  function hud() {
    const { player } = night;
    const time = Math.max(0, Math.ceil(night.timeLeft));
    const lit = night.lanterns.reduce((sum, lamp) => sum + Number(lamp.lit), 0);
    setText(elements['night-label'], `Đêm ${night.number} · ${night.map.title}`);
    setText(elements.timer, timeLabel(time));
    elements.timer.classList.toggle('urgent', time <= 30);
    setText(elements.lit, `${lit} / ${night.lanterns.length}`);
    setText(elements['light-goal'], `Cần ${night.requiredLights}`);
    setText(elements.score, String(night.score));
    setText(elements.carried, `${player.carried} / ${night.capacity}`);
    elements.flames.setAttribute('aria-label', `${player.flames} / ${tuning.flames} Ngọn Lửa`);
    for (const [index, flame] of flames.entries()) flame.classList.toggle('filled', index < player.flames);
    for (const [index, slot] of slots.entries()) {
      slot.hidden = index >= night.capacity;
      slot.classList.toggle('filled', index < player.carried);
    }
    const ready = (ticks) => ticks > 0 ? `${(ticks / HZ).toFixed(1)} s` : 'Sẵn sàng';
    setText(elements['dash-status'], player.charm > 0 ? `Bùa ${Math.ceil(player.charm / HZ)} s` : ready(player.dashCd));
    setText(elements['pulse-status'], ready(player.pulseCd));
    const target = screen === 'playing' ? night.targetLantern() : null;
    let hint = '';
    if (target) {
      hint = target.lit ? `E — Châm dầu (${fuelAmount(target)}/${tuning.fuel_max})`
        : `E — ${target.everLit ? 'Thắp lại' : 'Nạp ánh sáng'} (${target.deposited}/${lightCost(target, tuning)})`;
    }
    elements.hint.classList.toggle('fuel-warning', Boolean(target && isWeak(target, tuning)));
    setText(elements.hint, hint);
    const wind = night.wind.warning ? 'Lá đang bay. Sắp có gió mạnh.' : night.wind.active ? 'Gió mạnh' : '';
    setText(elements.notice, wind || (night.simTick < noticeUntil ? notice : ''));
  }

  function guide() {
    const arrow = elements['guide-arrow'];
    const [x, , z] = night.player.pos;
    let closest;
    let nearest = Infinity;
    for (const lantern of night.lanterns) {
      const distance = Math.hypot(lantern.pos[0] - x, lantern.pos[2] - z);
      if (!lantern.lit && distance < nearest) {
        closest = lantern;
        nearest = distance;
      }
    }
    arrow.hidden = screen !== 'playing' || !closest || scene.visible(closest.pos);
    if (arrow.hidden) return;
    const dx = closest.pos[0] - x;
    const dz = closest.pos[2] - z;
    const right = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
    const ahead = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    arrow.style.transform = `translateX(-50%) rotate(${Math.atan2(right, ahead)}rad)`;
  }

  function button(action) {
    return !night.previousButtons[action] && pending.delete(action);
  }

  function step() {
    if (screen === 'playing') {
      yaw += (Number(keys.has('ArrowLeft')) - Number(keys.has('ArrowRight'))) * 1.9 / HZ;
    }
    const input = {
      move: [Number(keys.has('KeyA')) - Number(keys.has('KeyD')), Number(keys.has('KeyW')) - Number(keys.has('KeyS'))],
      cam_yaw_deg: yaw * 180 / Math.PI,
      pause: button('pause')
    };
    if (screen === 'playing') {
      for (const action of ['jump', 'dash', 'pulse', 'interact']) input[action] = button(action);
    }
    const lastGrounded = night.player.grounded;
    const warned = night.wind.warning;
    const events = night.step(input);
    for (const { name, data } of events) {
      if (sounds.has(name)) sound.play(name);
      if (name === 'pulse') scene.glow(night.player.pos);
      if (name === 'drifter_steal' || name === 'charm_picked') {
        notice = name === 'drifter_steal'
          ? `Gió Lạc đã cướp ${data.amount} đom đóm.` : 'Bùa Gió · Lướt liên tiếp trong 10 giây.';
        noticeUntil = night.simTick + 150;
      }
      if (name === 'paused') {
        sound.stopNight();
        keys.clear();
        pending.clear();
        pauseMenu();
      }
      if (name === 'resumed') {
        screen = 'playing';
        elements.overlay.hidden = true;
        sound.night(night.number);
      }
      if (name === 'game_over') gameOver(data.result, data.reason);
    }
    if (lastGrounded && !night.player.grounded && night.player.vertical > 0) sound.play('jump');
    if (!warned && night.wind.warning) sound.play('wind_warning');
    const second = Math.ceil(night.timeLeft);
    if (screen === 'playing' && second <= 10 && second > 0 && timeShown !== second) sound.play('countdown');
    timeShown = second;
  }

  window.addEventListener('keydown', (event) => {
    const action = keyActions.get(event.code);
    if (screen === 'settings' && event.code === 'Escape') {
      event.preventDefault();
      settingsReturn();
      return;
    }
    if (screen !== 'playing' && !(screen === 'paused' && action === 'pause')) return;
    if (!movementKeys.has(event.code) && !action) return;
    event.preventDefault();
    if (action && !event.repeat) pending.add(action);
    if (movementKeys.has(event.code)) keys.add(event.code);
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => {
    keys.clear();
    pending.clear();
    pointer = undefined;
  });
  elements.world.addEventListener('pointerdown', (event) => {
    if (screen !== 'playing' || event.button !== 0) return;
    pointer = event.clientX;
    elements.world.setPointerCapture(event.pointerId);
  });
  elements.world.addEventListener('pointermove', (event) => {
    if (pointer === undefined || screen !== 'playing') return;
    yaw += (pointer - event.clientX) * 0.008 * config.sensitivity / 100;
    pointer = event.clientX;
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    elements.world.addEventListener(event, () => { pointer = undefined; });
  }

  function frame(now) {
    const seconds = lastTime === undefined ? 0 : Math.min(0.25, (now - lastTime) / 1000);
    lastTime = now;
    if (['playing', 'paused', 'settings'].includes(screen) && ['playing', 'paused'].includes(night.state)
        && (screen !== 'settings' || night.state === 'paused')) {
      accumulator += seconds;
      while (accumulator >= 1 / HZ && ['playing', 'paused'].includes(night.state)) {
        step();
        accumulator -= 1 / HZ;
      }
    }
    scene.render(night, yaw, night.state === 'paused' ? 0 : seconds);
    if (!elements.hud.hidden) {
      hud();
      guide();
    }
    requestAnimationFrame(frame);
  }

  applySettings();
  menu();
  requestAnimationFrame(frame);
}

startGame().catch((error) => {
  setText(elements['overlay-title'], 'Chưa mở được game');
  setText(elements['overlay-copy'], 'Kiểm tra trình duyệt hỗ trợ WebGL và máy chủ local đang chạy.');
  console.error(error);
});
