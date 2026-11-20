import * as THREE from '/vendor/three.module.js';
import { seededRandom } from './game.mjs';
import { FUEL_SCALE, isSafe, isWeak } from './lanterns.mjs';

const COLORS = {
  sky: 0x0e1430, fog: 0x1b2350, grass: 0x2f5d50, sand: 0xc9b48a, wood: 0x6b4a2f,
  cloud: 0x12384a, lamp: 0xffb347, core: 0xffe9b0, unlit: 0x5b5f6e,
  mote: 0xfff6c2, moteHalo: 0xffe58a, ink: 0x120a1a, rim: 0x7a3cff,
  stunned: 0x3a3450, coat: 0xe8e2d0, cloth: 0xc8102e, gold: 0xf2c14e, drifter: 0x8fa3b8,
  rimAccessible: 0x00b3ff
};
const solid = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });
const light = (color) => new THREE.MeshBasicMaterial({ color });
const grass = light(COLORS.grass);
const grassColor = new THREE.Color(COLORS.grass);
const sand = solid(COLORS.sand);
const wood = solid(COLORS.wood);
const dark = solid(0x323044);
const bronze = solid(0x7c694e);
const wick = light(COLORS.core);
const lampOn = light(COLORS.lamp);
const lampOff = solid(COLORS.unlit);
const moteLight = light(COLORS.mote);
const ink = solid(COLORS.ink);
const rim = light(COLORS.rim);
const ribbon = solid(COLORS.drifter);
const charmGold = light(COLORS.gold);
const charmCloth = light(COLORS.cloth);
const ring = new THREE.RingGeometry(0.96, 1, 64);
const plane = new THREE.PlaneGeometry(1, 1);
const ember = new THREE.IcosahedronGeometry(0.18, 0);
const shadeBody = new THREE.IcosahedronGeometry(0.58, 1);
const lampScale = 1.13;
const meterWidth = 1.42;
const shadeColors = { ink: new THREE.Color(COLORS.ink), stunned: new THREE.Color(COLORS.stunned) };

function mesh(parent, geometry, material, x = 0, y = 0, z = 0) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(x, y, z);
  parent.add(object);
  return object;
}

function glowTexture() {
  const image = document.createElement('canvas');
  image.width = image.height = 64;
  const context = image.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, '#ffffffff');
  gradient.addColorStop(0.24, '#ffffff9a');
  gradient.addColorStop(0.63, '#ffffff28');
  gradient.addColorStop(1, '#ffffff00');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(image);
}

function beam(texture, color, opacity) {
  return new THREE.SpriteMaterial({ map: texture, color, opacity, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending });
}

function sprite(parent, material, size, y = 0) {
  const glow = new THREE.Sprite(material);
  glow.position.y = y;
  glow.scale.set(size, size, 1);
  parent.add(glow);
  return glow;
}

function groundGlow(parent, texture, color, size, opacity, additive = true) {
  const material = new THREE.MeshBasicMaterial({ map: texture, color, opacity, transparent: true,
    depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    polygonOffset: true, polygonOffsetFactor: -2 });
  const pool = mesh(parent, plane, material, 0, 0.028, 0);
  pool.rotation.x = -Math.PI / 2;
  pool.scale.set(size, size, 1);
  return pool;
}

function groundRing(parent, color, radius, opacity) {
  const material = new THREE.MeshBasicMaterial({ color, opacity, transparent: true,
    depthWrite: false, side: THREE.DoubleSide });
  const outline = mesh(parent, ring, material, 0, 0.044, 0);
  outline.rotation.x = -Math.PI / 2;
  outline.scale.setScalar(radius);
  return outline;
}

function lanternModel(parent, texture, size, height) {
  const group = new THREE.Group();
  parent.add(group);
  group.position.y = height;
  group.scale.setScalar(size);
  const paper = mesh(group, new THREE.CylinderGeometry(0.36, 0.42, 0.69, 8), lampOff);
  const core = mesh(group, new THREE.CylinderGeometry(0.37, 0.412, 0.23, 8), wick);
  mesh(group, new THREE.CylinderGeometry(0.11, 0.49, 0.24, 8), wood, 0, 0.44);
  mesh(group, new THREE.CylinderGeometry(0.44, 0.29, 0.12, 8), dark, 0, -0.37);
  const ribs = new THREE.BoxGeometry(0.027, 0.69, 0.025);
  const ribPoses = [];
  for (let index = 0; index < 8; index++) {
    const angle = (index + 0.5) * Math.PI / 4;
    ribPoses.push([0.382 * Math.cos(angle), 0, 0.382 * Math.sin(angle), 1, -angle]);
  }
  stamp(group, ribs, wood, ribPoses);
  return { housing: group, paper, core, glow: sprite(group, beam(texture, COLORS.lamp, 0.78), 3.8) };
}

function buildTears(housing) {
  const tears = new THREE.Group();
  housing.add(tears);
  const tear = new THREE.Shape();
  tear.moveTo(-0.14, 0.28);
  tear.lineTo(-0.02, 0.15);
  tear.lineTo(-0.09, 0.12);
  tear.lineTo(0.067, -0.2);
  tear.lineTo(-0.018, 0.06);
  tear.lineTo(0.054, 0.09);
  tear.closePath();
  const geometry = new THREE.ShapeGeometry(tear);
  const exposed = light(0x191823);
  for (let i = 0; i < 4; i++) {
    const angle = Math.PI / 8 + i * Math.PI / 2;
    const patch = mesh(tears, geometry, exposed, 0.382 * Math.sin(angle), 0.024, 0.382 * Math.cos(angle));
    patch.rotation.set(-0.078, angle, 0, 'YXZ');
  }
  return tears;
}

function buildFuelMeter(parent) {
  const group = new THREE.Group();
  parent.add(group);
  group.position.y = 4.08;
  const material = (color) => new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false });
  const track = mesh(group, plane, material(0x191823));
  track.scale.set(meterWidth + 0.1, 0.21, 1);
  const fill = mesh(group, plane, material(COLORS.gold), 0, 0, 0.002);
  fill.scale.y = 0.13;
  return { group, track, fill };
}

function buildLamp(parent, texture, tuning) {
  const group = new THREE.Group();
  parent.add(group);
  mesh(group, new THREE.CylinderGeometry(0.72, 0.95, 0.3, 8), sand, 0, 0.15);
  mesh(group, new THREE.CylinderGeometry(0.095, 0.15, 2.28, 7), wood, 0, 1.19);
  mesh(group, new THREE.BoxGeometry(1.26, 0.1, 0.12), wood, 0, 2.38);
  const lightModel = lanternModel(group, texture, lampScale, 2.94);
  return { group, ...lightModel, tears: buildTears(lightModel.housing),
    meter: buildFuelMeter(group), dimPaper: light(COLORS.lamp), dimCore: light(COLORS.core),
    interaction: groundRing(group, COLORS.gold, tuning.interact_radius, 0.44),
    safety: groundRing(group, COLORS.lamp, tuning.safe_radius, 0.17),
    pool: groundGlow(group, texture, COLORS.lamp, 13, 0.74) };
}

function buildMay(parent, texture) {
  const group = new THREE.Group();
  parent.add(group);
  mesh(group, new THREE.CylinderGeometry(0.31, 0.49, 0.65, 9), solid(COLORS.coat), 0, 0.77);
  mesh(group, new THREE.CylinderGeometry(0.3, 0.34, 0.15, 9), solid(COLORS.cloth), 0, 1.02);
  mesh(group, new THREE.BoxGeometry(0.18, 0.41, 0.035), solid(COLORS.cloth), 0.16, 0.84, -0.3).rotation.z = 0.26;
  mesh(group, new THREE.SphereGeometry(0.29, 12, 8), solid(0xffcca0), 0, 1.25);
  mesh(group, new THREE.ConeGeometry(0.62, 0.45, 18), sand, 0, 1.54);
  mesh(group, new THREE.CylinderGeometry(0.63, 0.63, 0.05, 18), wood, 0, 1.34);
  for (const x of [-0.106, 0.106]) mesh(group, ember, dark, x, 1.25, 0.271).scale.setScalar(0.16);
  const legs = [-0.19, 0.19].map((x) => {
    const leg = new THREE.Group();
    group.add(leg);
    leg.position.set(x, 0.46, 0);
    mesh(leg, new THREE.CylinderGeometry(0.12, 0.103, 0.34, 7), dark, 0, -0.15);
    mesh(leg, new THREE.BoxGeometry(0.24, 0.15, 0.32), wood, 0, -0.36, 0.052);
    return leg;
  });
  const fixture = new THREE.Group();
  group.add(fixture);
  fixture.position.set(0.51, 1.29, 0.08);
  mesh(fixture, new THREE.CylinderGeometry(0.015, 0.015, 0.26, 6), dark, 0, -0.13);
  const smallLamp = lanternModel(fixture, texture, 0.39, -0.33);
  smallLamp.paper.material = lampOn;
  return { group, legs, fixture };
}

function stamp(parent, geometry, material, poses) {
  const instances = new THREE.InstancedMesh(geometry, material, poses.length);
  const transform = new THREE.Object3D();
  for (const [index, [x, y, z, scale, angle]] of poses.entries()) {
    transform.position.set(x, y, z);
    transform.scale.setScalar(scale);
    transform.rotation.y = angle;
    transform.updateMatrix();
    instances.setMatrixAt(index, transform.matrix);
  }
  parent.add(instances);
}

function movingMeshes(scene, geometry, material, capacity) {
  const instances = new THREE.InstancedMesh(geometry, material, capacity);
  instances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  instances.frustumCulled = false;
  instances.count = 0;
  scene.add(instances);
  return instances;
}

function movingHalos(scene, texture, color, size, opacity, capacity) {
  const positions = new Float32Array(capacity * 3);
  const geometry = new THREE.BufferGeometry();
  const attribute = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', attribute);
  geometry.setDrawRange(0, 0);
  const material = new THREE.PointsMaterial({ map: texture, color, size, opacity, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);
  return { geometry, attribute, material };
}

function buildTerrain(map, benchmark) {
  const group = new THREE.Group();
  const random = seededRandom(481);
  const trunks = [];
  const foliage = [];
  const rocks = [];
  for (const { x, z, radius } of map.islands) {
    mesh(group, new THREE.CylinderGeometry(radius, radius - 0.6, 0.66, 72), [sand, grass, sand], x, -0.33, z);
    mesh(group, new THREE.CylinderGeometry(radius - 0.6, radius * 0.48, 8, 28), solid(0x32475a), x, -4.66, z);
    mesh(group, new THREE.CylinderGeometry(radius * 0.48, 2, 7, 28), solid(0x292d45), x, -12.16, z);
    if (benchmark) continue;
    for (let index = 0; index < 34; index++) {
      const angle = random() * Math.PI * 2;
      const distance = radius - 1.3 - random() * 6;
      const tx = x + distance * Math.cos(angle);
      const tz = z + distance * Math.sin(angle);
      const size = 0.55 + random() * 0.85;
      if (index % 3 === 0 || map.bridge && Math.abs(tz) < 2.5) {
        rocks.push([tx, 0.24, tz, size * 0.83, angle]);
      } else {
        trunks.push([tx, size * 0.71, tz, size, angle]);
        foliage.push([tx, size * 1.72, tz, size, angle], [tx, size * 2.51, tz, size * 0.74, angle]);
      }
    }
  }
  if (!benchmark) {
    stamp(group, new THREE.CylinderGeometry(0.12, 0.2, 1.4, 6), wood, trunks);
    stamp(group, new THREE.ConeGeometry(0.86, 1.6, 7), solid(0x375c54), foliage);
    stamp(group, new THREE.DodecahedronGeometry(0.93, 0), solid(0x657073), rocks);
    const trail = new THREE.CylinderGeometry(0.75, 0.7, 0.022, 7);
    const paths = [];
    for (const [x, y, z] of map.lanterns) {
      if (y !== 0) continue;
      const origin = map.islands.reduce((best, land) => Math.abs(land.x - x) < Math.abs(best.x - x) ? land : best);
      for (let part = 2; part < 8; part++) {
        paths.push([origin.x + (x - origin.x) * part / 9, 0.014,
          origin.z + (z - origin.z) * part / 9, 0.6 + random() * 0.3, random() * 3]);
      }
    }
    stamp(group, trail, solid(0xa79a75), paths);
  }
  if (map.bridge) {
    const { minX, maxX, halfWidth } = map.bridge;
    const planks = [];
    for (let x = minX + 0.25; x < maxX; x += 0.5) planks.push([x, -0.12, 0, 1, 0]);
    stamp(group, new THREE.BoxGeometry(0.49, 0.24, halfWidth * 2), wood, planks);
  }
  if (map.terrace) {
    const { minRadius, maxRadius, height } = map.terrace;
    const shape = new THREE.Shape();
    for (let index = 0; index <= 64; index++) {
      const angle = index / 64 * Math.PI;
      shape[index === 0 ? 'moveTo' : 'lineTo'](maxRadius * Math.cos(angle), maxRadius * Math.sin(angle));
    }
    for (let index = 64; index >= 0; index--) {
      const angle = index / 64 * Math.PI;
      shape.lineTo(minRadius * Math.cos(angle), minRadius * Math.sin(angle));
    }
    shape.closePath();
    mesh(group, new THREE.ExtrudeGeometry(shape, { depth: 0.62, bevelEnabled: false }),
      [grass, sand], 0, height, 0).rotation.x = Math.PI / 2;
    for (const ramp of map.ramps) {
      const corners = [[ramp.outer, 0, -1], [ramp.outer, 0, 1],
        [ramp.inner, ramp.height, 1], [ramp.inner, ramp.height, -1]].flatMap(([d, y, side]) =>
        [d * ramp.x - side * ramp.z * ramp.halfWidth, y, d * ramp.z + side * ramp.x * ramp.halfWidth]);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(corners, 3));
      geometry.setIndex([0, 1, 2, 0, 2, 3]);
      geometry.computeVertexNormals();
      const rampMaterial = solid(COLORS.sand);
      rampMaterial.side = THREE.DoubleSide;
      mesh(group, geometry, rampMaterial);
    }
    const { radius, height: summit } = map.summit;
    const underside = new THREE.MeshBasicMaterial({ visible: false });
    mesh(group, new THREE.CylinderGeometry(radius, radius, 0.77, 64), [sand, grass, underside], 0, summit - 0.385);
    mesh(group, new THREE.CylinderGeometry(1.86, 2, 8, 16), wood, 0, 10);
    for (const y of [7.2, 10.2, 13.2]) mesh(group, new THREE.CylinderGeometry(2.04, 2.04, 0.22, 16), bronze, 0, y);
    mesh(group, new THREE.ConeGeometry(2.12, 0.72, 16), wood, 0, 13.64);
  }
  for (const { pos } of map.pads) {
    const pad = new THREE.Group();
    group.add(pad);
    pad.position.set(...pos);
    mesh(pad, new THREE.CylinderGeometry(1, 1, 0.075, 16), sand, 0, 0.03);
    const border = groundRing(pad, COLORS.gold, 0.89, 0.93);
    border.position.y = 0.075;
    mesh(pad, new THREE.ConeGeometry(0.22, 0.43, 7), charmGold, 0, 0.26);
  }
  return group;
}

function decorateSky(scene, texture) {
  const random = seededRandom(212);
  const stars = [];
  for (let index = 0; index < 560; index++) {
    const angle = random() * Math.PI * 2;
    const radius = 135 + random() * 110;
    stars.push(Math.sin(angle) * radius, 6 + random() * 92, Math.cos(angle) * radius);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(stars, 3));
  scene.add(new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xd4d7eb, size: 0.31, fog: false })));
  const moon = new THREE.Group();
  moon.position.set(19, 10.8, 96);
  scene.add(moon);
  const moonMaterial = new THREE.MeshBasicMaterial({ color: COLORS.core, fog: false });
  mesh(moon, new THREE.SphereGeometry(4.6, 24, 16), moonMaterial);
  const halo = beam(texture, COLORS.core, 0.28);
  halo.fog = false;
  sprite(moon, halo, 19.5);
  const clouds = new THREE.Group();
  scene.add(clouds);
  const cloudMaterial = new THREE.SpriteMaterial({ map: texture, color: COLORS.cloud, opacity: 0.53,
    depthWrite: false, transparent: true });
  for (let index = 0; index < 14; index++) {
    const angle = random() * Math.PI * 2;
    const radius = 53 + random() * 86;
    const cloud = sprite(clouds, cloudMaterial, 25, -2 - random() * 7);
    cloud.position.x = Math.sin(angle) * radius;
    cloud.position.z = Math.cos(angle) * radius;
    cloud.scale.set(23 + random() * 26, 6 + random() * 6, 1);
  }
  return clouds;
}

export function createScene(container, tuning, { benchmark = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.sky);
  scene.fog = new THREE.Fog(COLORS.fog, 26, 139);
  const camera = new THREE.PerspectiveCamera(51, 1, 0.1, 280);
  const texture = glowTexture();
  const clouds = decorateSky(scene, texture);
  const ambient = new THREE.HemisphereLight(0xbac9ff, 0x657c65, 0.15);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0xcbd7ff, 1.67);
  key.position.set(-9, 16, -16);
  scene.add(key);
  const may = buildMay(scene, texture);
  const shadow = groundGlow(scene, texture, 0x151727, 2.45, 0.72, false);
  const pulse = groundRing(scene, COLORS.core, 1, 1);
  const layouts = new Map();
  const drifters = new Map();
  const charms = new Map();
  const moteBodies = movingMeshes(scene, ember, moteLight, 128);
  const moteGlow = movingHalos(scene, texture, COLORS.moteHalo, 1.4, 0.91, 128);
  const shadeBodies = movingMeshes(scene, shadeBody, solid(0xffffff), 200);
  const shadeWisps = movingMeshes(scene, shadeBody, ink, 400);
  const shadeEyes = movingMeshes(scene, ember, rim, 400);
  const shadeGlow = movingHalos(scene, texture, COLORS.rim, 2.7, 0.47, 200);
  const shadeHalo = shadeGlow.material;
  const pose = new THREE.Object3D();
  const charmHalo = beam(texture, COLORS.gold, 0.57);
  const leavesGeometry = new THREE.BufferGeometry();
  const leafPositions = new Float32Array(33 * 3);
  leavesGeometry.setAttribute('position', new THREE.BufferAttribute(leafPositions, 3));
  const leaves = new THREE.Points(leavesGeometry, new THREE.PointsMaterial({ color: COLORS.gold, size: 0.11 }));
  leaves.frustumCulled = false;
  scene.add(leaves);
  let layout;
  let total = 0;
  let pulseAge = Infinity;
  let pulsePos;
  let shake = 0;
  let reduceMotion = false;

  function resize() {
    camera.aspect = container.clientWidth / Math.max(1, container.clientHeight);
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight, false);
  }
  window.addEventListener('resize', resize);
  resize();

  function sync(entities, visuals, make, update) {
    const ids = new Set();
    for (const [index, entity] of entities.entries()) {
      ids.add(entity.id);
      if (!visuals.has(entity.id)) {
        const visual = make();
        scene.add(visual.group);
        visuals.set(entity.id, visual);
      }
      update(visuals.get(entity.id), entity, index);
    }
    for (const [id, visual] of visuals) {
      if (ids.has(id)) continue;
      scene.remove(visual.group);
      visuals.delete(id);
    }
  }

  function setMap(night) {
    if (layout?.map === night.map) return;
    if (layout) scene.remove(layout.terrain);
    if (!layouts.has(night.number)) {
      const terrain = buildTerrain(night.map, benchmark);
      layouts.set(night.number, { map: night.map, terrain,
        lamps: night.lanterns.map(() => buildLamp(terrain, texture, tuning)) });
    }
    layout = layouts.get(night.number);
    scene.add(layout.terrain);
  }

  function writePose(batch, index, x, y, z, yaw, sx, sy = sx, sz = sx) {
    pose.position.set(x, y, z);
    pose.rotation.y = yaw;
    pose.scale.set(sx, sy, sz);
    pose.updateMatrix();
    batch.setMatrixAt(index, pose.matrix);
  }

  function drawMotes(motes) {
    for (const [index, { pos }] of motes.entries()) {
      const y = pos[1] + 0.65 + Math.sin(total * 2.7 + index) * 0.19;
      writePose(moteBodies, index, pos[0], y, pos[2], total * 2 + index, 1);
      moteGlow.attribute.setXYZ(index, pos[0], y, pos[2]);
    }
    moteBodies.count = motes.length;
    moteBodies.instanceMatrix.needsUpdate = true;
    moteGlow.geometry.setDrawRange(0, motes.length);
    moteGlow.attribute.needsUpdate = true;
  }

  function drawShades(shades, playerX, playerZ) {
    for (const [index, { pos, state }] of shades.entries()) {
      const [x, baseY, z] = pos;
      const y = baseY + Math.sin(total * 3 + index) * 0.13;
      const angle = Math.atan2(playerX - x, playerZ - z);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const size = state === 'spawning' ? 0.4 : 1;
      writePose(shadeBodies, index, x, y, z, angle, size);
      shadeBodies.setColorAt(index, state === 'stunned' ? shadeColors.stunned : shadeColors.ink);
      shadeGlow.attribute.setXYZ(index, x, y, z);
      for (const side of [-1, 1]) {
        const attached = index * 2 + Number(side === 1);
        writePose(shadeEyes, attached, x + (side * 0.21 * cos + 0.5 * sin) * size,
          y + 0.14 * size, z + (-side * 0.21 * sin + 0.5 * cos) * size, angle, 0.34 * size);
        writePose(shadeWisps, attached, x + side * 0.48 * cos * size, y - 0.27 * size,
          z - side * 0.48 * sin * size, angle, 0.51 * size, 0.84 * size, 0.53 * size);
      }
    }
    shadeBodies.count = shades.length;
    shadeWisps.count = shadeEyes.count = 2 * shades.length;
    for (const batch of [shadeBodies, shadeWisps, shadeEyes]) batch.instanceMatrix.needsUpdate = true;
    if (shadeBodies.instanceColor) shadeBodies.instanceColor.needsUpdate = true;
    shadeGlow.geometry.setDrawRange(0, shades.length);
    shadeGlow.attribute.needsUpdate = true;
  }

  const projected = new THREE.Vector3();
  return {
    glow(position) { pulseAge = 0; pulsePos = [...position]; },
    reset() { pulseAge = Infinity; shake = 0; },
    setReducedMotion(enabled) {
      reduceMotion = enabled;
      if (enabled) shake = 0;
    },
    bump() { if (!reduceMotion) shake = 1; },
    setAccessiblePalette(enabled) {
      const color = enabled ? COLORS.rimAccessible : COLORS.rim;
      rim.color.setHex(color);
      shadeHalo.color.setHex(color);
    },
    visible(position) {
      projected.set(position[0], position[1] + 1.8, position[2]).project(camera);
      return Math.abs(projected.x) < 0.94 && Math.abs(projected.y) < 0.9 && projected.z < 1 && projected.z > -1;
    },
    render(night, yaw, seconds, orbitPosition = null) {
      setMap(night);
      total += seconds;
      pulseAge += seconds;
      shake = Math.max(0, shake - seconds * 4);
      const { player } = night;
      const [x, y, z] = player.pos;
      may.group.position.set(x, y, z);
      may.group.rotation.y = Math.atan2(player.face[0], player.face[1]);
      may.group.visible = player.respawn === 0 && (player.invuln === 0 || Math.floor(total * 16) % 3 !== 0);
      may.fixture.rotation.z = Math.sin(total * 7.5) * 0.16;
      const running = player.grounded && Math.hypot(player.vel[0], player.vel[2]) > 0.1;
      for (const [index, leg] of may.legs.entries()) {
        leg.rotation.x = running ? Math.sin(total * 17 + index * Math.PI) * 0.45 : 0;
      }
      shadow.position.set(x, y + 0.028, z);
      shadow.visible = player.grounded && player.respawn === 0;
      pulse.visible = pulseAge < 0.46;
      if (pulse.visible) {
        pulse.position.set(pulsePos[0], pulsePos[1] + 0.15, pulsePos[2]);
        pulse.scale.setScalar(tuning.pulse_radius * (0.2 + pulseAge * 1.7));
        pulse.material.opacity = 1 - pulseAge * 2.15;
      }
      let litCount = 0;
      for (const [index, lantern] of night.lanterns.entries()) {
        const lamp = layout.lamps[index];
        const weak = isWeak(lantern, tuning);
        const intensity = weak ? 0.68 + 0.32 * Math.cos(2 * Math.PI * night.simTick / 60) : 1;
        const ratio = lantern.fuel / (tuning.fuel_max * FUEL_SCALE);
        lamp.group.position.set(...lantern.pos);
        lamp.housing.scale.setScalar(lampScale * (lantern.lit ? 1 : 0.8));
        lamp.tears.visible = !lantern.lit;
        lamp.paper.material = lantern.lit ? (weak ? lamp.dimPaper : lampOn) : lampOff;
        lamp.core.material = weak ? lamp.dimCore : wick;
        if (weak) {
          lamp.dimPaper.color.copy(lampOn.color).multiplyScalar(intensity);
          lamp.dimCore.color.copy(wick.color).multiplyScalar(intensity);
        }
        lamp.glow.visible = lamp.core.visible = lamp.pool.visible = lamp.meter.group.visible = lantern.lit;
        lamp.glow.material.opacity = 0.78 * intensity;
        lamp.pool.material.opacity = 0.74 * intensity;
        lamp.safety.visible = isSafe(lantern, tuning);
        lamp.interaction.visible = !lantern.lit;
        lamp.meter.track.material.opacity = 0.88 * intensity;
        lamp.meter.fill.material.opacity = intensity;
        lamp.meter.fill.scale.x = meterWidth * ratio;
        lamp.meter.fill.position.x = (lamp.meter.fill.scale.x - meterWidth) / 2;
        if (lantern.lit) litCount++;
      }
      ambient.intensity = 0.15 + 0.55 * litCount / night.lanterns.length;
      grass.color.copy(grassColor).multiplyScalar(0.6 + ambient.intensity);
      clouds.rotation.y = total * 0.008;

      drawMotes(night.motes);
      drawShades(night.shades, x, z);
      sync(night.drifters, drifters, () => {
        const group = new THREE.Group();
        const tail = [0, 1, 2].map((index) => mesh(group, new THREE.BoxGeometry(0.46 - index * 0.09, 0.065, 0.67),
          ribbon, 0, 0, -index * 0.55));
        return { group, tail };
      }, ({ group, tail }, { pos }, index) => {
        group.position.set(pos[0], pos[1] + 0.35 + Math.sin(total * 5 + index) * 0.21, pos[2]);
        group.rotation.y = Math.atan2(x - pos[0], z - pos[2]);
        for (const [part, strip] of tail.entries()) strip.rotation.z = Math.sin(total * 8 - part) * 0.56;
      });
      sync(night.charms.filter(({ respawn }) => respawn === 0), charms, () => {
        const group = new THREE.Group();
        mesh(group, new THREE.BoxGeometry(0.56, 0.92, 0.06), charmGold);
        mesh(group, new THREE.BoxGeometry(0.43, 0.77, 0.08), charmCloth);
        sprite(group, charmHalo, 1.7);
        return { group };
      }, ({ group }, { pos }) => {
        group.position.set(pos[0], pos[1] + 1.03 + Math.sin(total * 2.8) * 0.12, pos[2]);
        group.rotation.y = 0.7 + total * 1.4;
      });
      leaves.visible = night.wind.warning || night.wind.active;
      if (leaves.visible) {
        const angle = night.wind.dir_deg * Math.PI / 180;
        for (let index = 0; index < leafPositions.length; index += 3) {
          const elapsed = (total * 5 + index * 2.7) % 23 - 11.5;
          const across = Math.sin(index * 3.3) * 13;
          leafPositions[index] = x + Math.cos(angle) * elapsed - Math.sin(angle) * across;
          leafPositions[index + 1] = Math.max(0, y) + 0.4 + (index % 19) * 0.13;
          leafPositions[index + 2] = z + Math.sin(angle) * elapsed + Math.cos(angle) * across;
        }
        leavesGeometry.attributes.position.needsUpdate = true;
      }

      const underSummit = night.number === 3 && y < 3 && Math.hypot(x, z) < 11;
      const eye = underSummit ? 3.55 : 6.25;
      if (orbitPosition) {
        camera.position.set(...orbitPosition);
        camera.lookAt(0, 0, 0);
      } else {
        camera.position.set(x - Math.sin(yaw) * 10.5 + Math.sin(total * 65) * shake * 0.21,
          Math.max(1.1, y + eye) + Math.cos(total * 74) * shake * 0.15, z - Math.cos(yaw) * 10.5);
        camera.lookAt(x + Math.sin(yaw) * 5.2, Math.max(0, y) + (underSummit ? 0.72 : 1.16), z + Math.cos(yaw) * 5.2);
      }
      for (const lamp of layout.lamps) {
        if (lamp.meter.group.visible) lamp.meter.group.quaternion.copy(camera.quaternion);
      }
      renderer.render(scene, camera);
    }
  };
}
