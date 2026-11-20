export const ACTION_LABELS = Object.freeze({
  forward: 'Tiến', backward: 'Lùi', left: 'Sang trái', right: 'Sang phải',
  jump: 'Nhảy', dash: 'Lướt', interact: 'Tương tác', pulse: 'Tỏa Sáng', pause: 'Tạm dừng'
});

export const DEFAULT_KEYS = Object.freeze({
  forward: 'KeyW', backward: 'KeyS', left: 'KeyA', right: 'KeyD',
  jump: 'Space', dash: 'ShiftLeft', interact: 'KeyE', pulse: 'KeyQ', pause: 'Escape'
});

const aliases = { dash: 'ShiftRight', pause: 'KeyP' };
const isKey = (key) => typeof key === 'string' && /^[A-Za-z][A-Za-z0-9]{1,35}$/.test(key) && key !== 'Unidentified';

export function activeKeys(bindings) {
  const map = new Map(Object.entries(bindings).map(([action, key]) => [key, action]));
  for (const [action, key] of Object.entries(aliases)) {
    if (bindings[action] === DEFAULT_KEYS[action] && !map.has(key)) map.set(key, action);
  }
  return map;
}

export function loadKeys(saved) {
  const bindings = {};
  for (const action of Object.keys(DEFAULT_KEYS)) {
    bindings[action] = isKey(saved?.[action]) ? saved[action] : DEFAULT_KEYS[action];
  }
  return new Set(Object.values(bindings)).size === Object.keys(bindings).length ? bindings : { ...DEFAULT_KEYS };
}

export function changeKey(bindings, action, key) {
  if (!Object.hasOwn(DEFAULT_KEYS, action) || !isKey(key)) return { error: 'Phím này không thể dùng.' };
  const existing = activeKeys(bindings).get(key);
  if (existing && existing !== action) return { error: `Phím ${keyLabel(key)} đang dùng cho ${ACTION_LABELS[existing]}.` };
  return { bindings: { ...bindings, [action]: key } };
}

export function keyLabel(code) {
  const labels = { Space: 'Space', Escape: 'Esc', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    ShiftLeft: 'Shift', ShiftRight: 'Shift phải', ControlLeft: 'Ctrl', ControlRight: 'Ctrl phải', Backquote: '`' };
  return labels[code] ?? code.replace(/^(Key|Digit)/, '');
}
