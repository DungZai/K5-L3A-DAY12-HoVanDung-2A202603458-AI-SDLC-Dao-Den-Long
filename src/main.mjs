import { HZ, Night } from './game.mjs';
import { MAPS } from './maps.mjs';
import { GameSound } from './audio.mjs';
import { fuelAmount, isWeak, lightCost } from './lanterns.mjs';
import { createScene } from './scene.mjs';
import { ACTION_LABELS, DEFAULT_KEYS, activeKeys, changeKey, keyLabel, loadKeys } from './controls.mjs';
import { leaderboard } from './leaderboard.mjs';

const elements = Object.fromEntries(Array.from(document.querySelectorAll('[id]'), (element) => [element.id, element]));
const movement = new Set(['forward', 'backward', 'left', 'right']);
const cameraKeys = new Set(['ArrowLeft', 'ArrowRight']);
const sounds = new Set(['mote_picked', 'lantern_lit', 'refuel', 'pulse', 'player_hit', 'dash', 'shade_spawned', 'charm_picked']);
const timeLabel = (seconds) => [Math.floor(seconds / 60), seconds % 60]
  .map((value) => String(value).padStart(2, '0')).join(':');
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const settingsKey = 'dao-den-long-settings';

function readSettings() {
  const defaults = { volume: 65, sensitivity: 100, colorblind: false, largeText: false,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, bindings: loadKeys() };
  try {
    const saved = JSON.parse(localStorage.getItem(settingsKey) ?? '{}') ?? {};
    return {
      volume: Number.isFinite(saved.volume) ? clamp(saved.volume, 0, 100) : defaults.volume,
      sensitivity: Number.isFinite(saved.sensitivity) ? clamp(saved.sensitivity, 25, 200) : defaults.sensitivity,
      colorblind: saved.colorblind === true, largeText: saved.largeText === true,
      reducedMotion: typeof saved.reducedMotion === 'boolean' ? saved.reducedMotion : defaults.reducedMotion,
      bindings: loadKeys(saved.bindings)
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
  let keyActions = activeKeys(config.bindings);
  let pendingBinding = null;
  let scoreCandidate = null;
  let spawnCue = null;
  const dateLabel = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' });

  const bindingButtons = Object.fromEntries(Object.entries(ACTION_LABELS).map(([action, label]) => {
    const row = document.createElement('div');
    const text = document.createElement('span');
    text.textContent = label;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary';
    button.dataset.action = action;
    button.addEventListener('click', () => {
      pendingBinding = action;
      setText(elements['key-feedback'], `Nhấn phím mới cho ${label}.`);
    });
    row.append(text, button);
    elements['key-rows'].append(row);
    return [action, button];
  }));

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
    elements.overlay.classList.toggle('leaderboard-view', next === 'leaderboard');
    elements.settings.hidden = next !== 'settings';
    elements.keybindings.hidden = next !== 'bindings';
    elements.leaderboard.hidden = next !== 'leaderboard';
    elements['score-form'].hidden = true;
    scoreCandidate = null;
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
    elements['reduced-motion'].checked = config.reducedMotion;
    elements['large-text'].checked = config.largeText;
    setText(elements['volume-value'], `${config.volume}%`);
    setText(elements['sensitivity-value'], `${config.sensitivity}%`);
    sound.setVolume(config.volume / 100);
    document.body.classList.toggle('accessible-palette', config.colorblind);
    document.body.classList.toggle('reduced-motion', config.reducedMotion);
    document.documentElement.classList.toggle('large-text', config.largeText);
    scene.setAccessiblePalette(config.colorblind);
    scene.setReducedMotion(config.reducedMotion);
    if (config.reducedMotion) for (const animation of elements['screen-feedback'].getAnimations()) animation.cancel();
    keyActions = activeKeys(config.bindings);
    for (const [action, button] of Object.entries(bindingButtons)) {
      const key = keyLabel(config.bindings[action]);
      setText(button, key);
      button.setAttribute('aria-label', `${ACTION_LABELS[action]} · ${key}`);
    }
    setText(elements['key-guide-move'], ['forward', 'left', 'backward', 'right']
      .map((action) => keyLabel(config.bindings[action])).join(' '));
    for (const action of ['jump', 'dash', 'interact', 'pulse', 'pause']) {
      setText(elements['key-guide-' + action], keyLabel(config.bindings[action]));
    }
    try { localStorage.setItem(settingsKey, JSON.stringify(config)); } catch { /* Storage may be disabled. */ }
  }

  function openSettings(back) {
    settingsReturn = back;
    applySettings();
    showOverlay('settings', 'Cài đặt', '', [['Quay lại', back], ['Đổi phím', bindingsMenu]]);
  }

  function bindingsMenu() {
    pendingBinding = null;
    setText(elements['key-feedback'], 'Chọn hành động rồi nhấn phím mới.');
    showOverlay('bindings', 'Đổi phím', '', [
      ['Quay lại', () => openSettings(settingsReturn)],
      ['Khôi phục mặc định', () => {
        pendingBinding = null;
        config.bindings = { ...DEFAULT_KEYS };
        applySettings();
        setText(elements['key-feedback'], 'Đã khôi phục phím mặc định.');
      }]
    ]);
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
  for (const [id, key] of [['reduced-motion', 'reducedMotion'], ['large-text', 'largeText']]) {
    elements[id].addEventListener('change', () => {
      config[key] = elements[id].checked;
      applySettings();
    });
  }

  function newNight(number) {
    night = new Night(tuning, seeds[number - 1], {}, number);
    keys.clear();
    pending.clear();
    yaw = 0;
    accumulator = 0;
    noticeUntil = 0;
    spawnCue = null;
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
      }], ['Bảng xếp hạng', leaderboardMenu], ['Cài đặt', () => openSettings(menu)]
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
        offerScore();
      } else {
        showOverlay('result', 'Qua Đêm', `Điểm Đêm ${number} là ${score}. Tổng điểm ${total}.`,
          [['Đêm kế tiếp', () => introduction(number + 1)], ['Về menu', menu]], chapter);
      }
    } else {
      const copy = reason === 'dawn' ? `Bình minh đã lên. Cần giữ ít nhất ${night.requiredLights} đèn sáng.`
        : 'Mây đã hết Ngọn Lửa.';
      showOverlay('result', 'Đêm chưa sáng', copy,
        [['Chơi lại Đêm', () => enterNight(number)], ['Về menu', menu]], chapter);
      offerScore();
    }
  }

  function offerScore() {
    scoreCandidate = { score: wonScores.reduce((sum, score) => sum + score, 0), nights_won: wonScores.length, seed: seeds[0] };
    elements['score-form'].hidden = false;
    elements['score-name'].value = '';
    elements['score-submit'].disabled = false;
    setText(elements['score-feedback'], `${scoreCandidate.score} điểm · Dùng 3–12 chữ cái, chữ số hoặc dấu gạch dưới.`);
  }

  elements['score-form'].addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!scoreCandidate) return;
    const candidate = scoreCandidate;
    elements['score-submit'].disabled = true;
    try {
      const entries = await leaderboard({ ...candidate, name: elements['score-name'].value });
      if (scoreCandidate === candidate) {
        const saved = entries.some((entry) => entry.name === elements['score-name'].value
          && entry.score === candidate.score && entry.nights_won === candidate.nights_won);
        setText(elements['score-feedback'], saved ? 'Đã ghi điểm vào bảng xếp hạng.' : 'Điểm nằm ngoài 10 hạng đầu.');
        scoreCandidate = null;
      }
    } catch (error) {
      if (scoreCandidate !== candidate) return;
      setText(elements['score-feedback'], error.message);
      elements['score-submit'].disabled = false;
    }
  });

  async function leaderboardMenu() {
    showOverlay('leaderboard', 'Bảng xếp hạng', '', [['Về menu', menu]]);
    elements['leaderboard-rows'].replaceChildren();
    setText(elements['leaderboard-status'], 'Đang đọc điểm đã lưu…');
    try {
      const entries = await leaderboard();
      if (screen !== 'leaderboard') return;
      for (const [index, entry] of entries.entries()) {
        const row = document.createElement('tr');
        for (const value of [index + 1, entry.name, entry.score, `${entry.nights_won}/3`, dateLabel.format(new Date(entry.achieved_at))]) {
          const cell = document.createElement('td');
          cell.textContent = String(value);
          row.append(cell);
        }
        elements['leaderboard-rows'].append(row);
      }
      setText(elements['leaderboard-status'], entries.length ? '' : 'Chưa có điểm được lưu.');
    } catch (error) {
      if (screen === 'leaderboard') setText(elements['leaderboard-status'], error.message);
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
      const key = keyLabel(config.bindings.interact);
      hint = target.lit ? `${key} — Châm dầu (${fuelAmount(target)}/${tuning.fuel_max})`
        : `${key} — ${target.everLit ? 'Thắp lại' : 'Nạp ánh sáng'} (${target.deposited}/${lightCost(target, tuning)})`;
    }
    elements.hint.classList.toggle('fuel-warning', Boolean(target && isWeak(target, tuning)));
    setText(elements.hint, hint);
    setText(elements.notice, night.simTick < noticeUntil ? notice : '');
    const alerts = [];
    if (spawnCue && night.simTick < spawnCue.until) alerts.push('Bóng Mực xuất hiện');
    if (night.wind.warning) alerts.push('Sắp có gió mạnh');
    else if (night.wind.active) alerts.push('Gió mạnh');
    if (time > 0 && time <= 10) alerts.push(`Còn ${time} giây`);
    const weak = night.lanterns.filter((lamp) => isWeak(lamp, tuning)).map(({ id }) => id);
    if (weak.length) alerts.push(`Ít dầu ở ${weak.join(', ')}`);
    setText(elements['visual-notices'], alerts.join(' · '));
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

  function shadeGuide() {
    const arrow = elements['shade-arrow'];
    arrow.hidden = screen !== 'playing' || !spawnCue || night.simTick >= spawnCue.until;
    if (arrow.hidden) return;
    const dx = spawnCue.pos[0] - night.player.pos[0];
    const dz = spawnCue.pos[2] - night.player.pos[2];
    const right = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
    const ahead = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    const horizontal = Math.abs(right) / 45;
    const vertical = Math.abs(ahead) / 39;
    const edge = Math.max(horizontal, vertical, 0.001);
    arrow.style.left = `${50 + right / edge}%`;
    arrow.style.top = `${50 - ahead / edge}%`;
    arrow.style.transform = `translate(-50%, -50%) rotate(${Math.atan2(right, ahead)}rad)`;
  }

  function flash(color) {
    if (config.reducedMotion) return;
    elements['screen-feedback'].animate([{ backgroundColor: color }, { backgroundColor: 'transparent' }],
      { duration: 170, easing: 'ease-out' });
  }

  function button(action) {
    return !night.previousButtons[action] && pending.delete(action);
  }

  function step() {
    if (screen === 'playing') {
      yaw += (Number(keys.has('ArrowLeft') && !keyActions.has('ArrowLeft'))
        - Number(keys.has('ArrowRight') && !keyActions.has('ArrowRight'))) * 1.9 / HZ;
    }
    const held = (action) => Number(keys.has(config.bindings[action]));
    const input = {
      move: [held('left') - held('right'), held('forward') - held('backward')],
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
      if (name === 'pulse') {
        scene.glow(night.player.pos);
        flash('#ffe9b026');
      }
      if (name === 'player_hit') {
        scene.bump();
        flash('#ff5a5f36');
      }
      if (name === 'shade_spawned') {
        const shade = night.shades.find(({ id }) => id === data.id);
        if (shade) spawnCue = { pos: [...shade.pos], until: night.simTick + 180 };
      }
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
    if (screen === 'bindings' && pendingBinding) {
      event.preventDefault();
      if (event.repeat) return;
      const next = changeKey(config.bindings, pendingBinding, event.code);
      if (next.error) {
        setText(elements['key-feedback'], next.error);
      } else {
        config.bindings = next.bindings;
        applySettings();
        setText(elements['key-feedback'], `Đã đổi phím ${ACTION_LABELS[pendingBinding]} thành ${keyLabel(event.code)}.`);
        pendingBinding = null;
      }
      return;
    }
    if (screen === 'settings' && event.code === 'Escape') {
      event.preventDefault();
      settingsReturn();
      return;
    }
    if (screen === 'bindings' && event.code === 'Escape') {
      event.preventDefault();
      openSettings(settingsReturn);
      return;
    }
    if (screen !== 'playing' && !(screen === 'paused' && action === 'pause')) return;
    if (!cameraKeys.has(event.code) && !action) return;
    event.preventDefault();
    if (movement.has(action) || !action && cameraKeys.has(event.code)) keys.add(event.code);
    else if (action && !event.repeat) pending.add(action);
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
      shadeGuide();
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
