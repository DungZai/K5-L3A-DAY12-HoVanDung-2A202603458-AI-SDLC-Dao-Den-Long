const radians = (degrees) => degrees * Math.PI / 180;
const stable = (value) => Math.round(value * 1e9) / 1e9 || 0;

function ring(count, radius, { x = 0, y = 0, z = 0, start = 0, step = 360 / count } = {}) {
  return Array.from({ length: count }, (_, index) => {
    const angle = radians(start + index * step);
    return [stable(x + radius * Math.cos(angle)), y, stable(z + radius * Math.sin(angle))];
  });
}

const island = (x, radius) => ({ x, z: 0, radius });
const launchTo = (pos, target) => {
  const dx = target - pos[0];
  const dz = -pos[2];
  const length = Math.hypot(dx, dz);
  return [dx / length * 24, 14, dz / length * 24];
};

export const MAPS = {
  1: {
    title: 'Đảo Bến',
    introduction: 'Ông Đăng: Hãy lần theo đom đóm. Năm ngọn đèn sẽ chỉ lối qua biển mây.',
    start: [0, 0, 0],
    islands: [island(0, 40)],
    lanterns: [[0, 0, 25], [23.8, 0, 7.7], [14.7, 0, -20.2], [-14.7, 0, -20.2], [-23.8, 0, 7.7]],
    motePoints: [...ring(8, 12), ...ring(16, 33)],
    shadePoints: ring(12, 37, { start: 15 }),
    shadeInterval: 480,
    shadeLimit: 6,
    charms: [],
    pads: []
  },
  2: {
    title: 'Đảo Cau',
    introduction: 'Ông Đăng: Cầu tre nối hai bờ. Khi cần qua nhanh, hãy thử bước lên bục nhảy.',
    start: [0, 0, 0],
    islands: [island(0, 28), island(70, 28)],
    bridge: { minX: 26, maxX: 44, halfWidth: 2 },
    lanterns: [[0, 0, 20], [17, 0, -10], [-17, 0, -10], [70, 0, 20], [87, 0, -10], [53, 0, -10]],
    motePoints: [0, 70].flatMap((x) => [...ring(4, 10, { x }), ...ring(8, 22, { x })]),
    shadePoints: [0, 70].flatMap((x) => ring(8, 26, { x, start: 22.5 })),
    shadeInterval: 420,
    shadeLimit: 8,
    charms: [[35, 0, 0]],
    pads: [[20, 0, 18], [50, 0, -18]].map((pos, index) => ({
      pos, velocity: launchTo(pos, index === 0 ? 70 : 0)
    }))
  },
  3: {
    title: 'Đảo Chuông',
    introduction: 'Ông Đăng: Hãy theo dốc lên vành đá rồi lấy đà trên bục nhảy. Lá bay sẽ báo gió lớn.',
    start: [0, 0, 0],
    islands: [island(0, 45)],
    terrace: { height: 3, minRadius: 12, maxRadius: 24 },
    summit: { height: 6, radius: 8 },
    tower: { radius: 2, minY: 6, maxY: 14 },
    ramps: [30, 150].map((angle) => ({
      angle, x: Math.cos(radians(angle)), z: Math.sin(radians(angle)),
      inner: 24, outer: 30, halfWidth: 1.5, height: 3
    })),
    lanterns: [[0, 6, 6], [18, 3, 10], [-18, 3, 10], [35, 0, -10],
      [-35, 0, -10], [20, 0, -35], [-20, 0, -35]],
    motePoints: [...ring(18, 34), ...ring(8, 18, { y: 3, start: 20, step: 20 }),
      ...ring(4, 5, { y: 6, start: 45 })],
    shadePoints: ring(16, 43),
    shadeInterval: 360,
    shadeLimit: 10,
    charms: [[30, 0, 25], [-30, 0, 25]],
    pads: [{ pos: [0, 3, 13], velocity: [0, 12, -8] }]
  }
};

export function floorAt(map, x, z, ceiling = Infinity) {
  let floor = null;
  const consider = (y) => {
    if (y <= ceiling + 1e-8 && (floor === null || y > floor)) floor = y;
  };
  const radius = Math.hypot(x, z);
  if (map.islands.some((land) => Math.hypot(x - land.x, z - land.z) <= land.radius)) consider(0);
  const { bridge, terrace, summit } = map;
  if (bridge && x >= bridge.minX && x <= bridge.maxX && Math.abs(z) <= bridge.halfWidth) consider(0);
  if (terrace && z > 0 && radius >= terrace.minRadius && radius <= terrace.maxRadius) consider(terrace.height);
  if (summit && radius <= summit.radius) consider(summit.height);
  for (const ramp of map.ramps ?? []) {
    const along = x * ramp.x + z * ramp.z;
    const across = Math.abs(-x * ramp.z + z * ramp.x);
    if (along >= ramp.inner - 0.12 && along <= ramp.outer && across <= ramp.halfWidth) {
      consider(Math.min(ramp.height, (ramp.outer - along) * ramp.height / (ramp.outer - ramp.inner)));
    }
  }
  return floor;
}

export function hitsTower(map, x, y, z) {
  const { tower } = map;
  return Boolean(tower && y >= tower.minY && y <= tower.maxY && Math.hypot(x, z) < tower.radius);
}
