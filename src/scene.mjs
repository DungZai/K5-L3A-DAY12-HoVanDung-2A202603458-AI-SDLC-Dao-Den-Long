import * as THREE from '/vendor/three.module.js';
import { ISLAND_RADIUS, seededRandom } from './game.mjs';

const GOLD = 0xffa449;
const PALE = 0xffdb86;
const PITCH = 0x121426;
const GOLDEN_WOOD = 0x8b5138;
const stone = new THREE.MeshStandardMaterial({ color: 0x556c6b, flatShading: true });
const wood = new THREE.MeshStandardMaterial({ color: GOLDEN_WOOD, flatShading: true });
const darkWood = new THREE.MeshStandardMaterial({ color: 0x432336, flatShading: true });
const leafMaterials = [0x254449, 0x345754, 0x43655e, 0x576062].map((color) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true }));
const moteGeometry = new THREE.IcosahedronGeometry(0.21, 0);
const shadeGeometry = new THREE.IcosahedronGeometry(0.64, 1);
const ringGeometry = new THREE.RingGeometry(0.91, 1, 72);
const planeGeometry = new THREE.PlaneGeometry(1, 1);

const standard = (color) => new THREE.MeshStandardMaterial({ color, flatShading: true });
const emission = (color) => new THREE.MeshBasicMaterial({ color });

function mesh(parent, geometry, material, x, y, z) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(x, y, z);
  parent.add(object);
  return object;
}

function glowTexture() {
  const image = document.createElement('canvas');
  image.width = image.height = 96;
  const context = image.getContext('2d');
  const gradient = context.createRadialGradient(48, 48, 0, 48, 48, 48);
  gradient.addColorStop(0, '#ffffffff');
  gradient.addColorStop(0.25, '#ffffff82');
  gradient.addColorStop(0.65, '#ffffff24');
  gradient.addColorStop(1, '#ffffff00');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 96, 96);
  return new THREE.CanvasTexture(image);
}

function halo(parent, texture, color, size, y, opacity) {
  const material = new THREE.SpriteMaterial({
    map: texture, color, opacity, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
  const sprite = new THREE.Sprite(material);
  sprite.position.y = y;
  sprite.scale.set(size, size, 1);
  parent.add(sprite);
  return sprite;
}

function groundGlow(parent, texture, color, size, opacity) {
  const material = new THREE.MeshBasicMaterial({
    map: texture, color, opacity, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2
  });
  const pool = mesh(parent, planeGeometry, material, 0, 0.026, 0);
  pool.rotation.x = -Math.PI / 2;
  pool.scale.set(size, size, 1);
  return pool;
}

function lanternModel(parent, texture, size, height) {
  const group = new THREE.Group();
  group.position.y = height;
  group.scale.setScalar(size);
  parent.add(group);
  const paper = mesh(group, new THREE.CylinderGeometry(0.36, 0.42, 0.63, 8), standard(0x524054), 0, 0, 0);
  mesh(group, new THREE.CylinderGeometry(0.09, 0.49, 0.23, 8), darkWood, 0, 0.42, 0);
  mesh(group, new THREE.CylinderGeometry(0.44, 0.29, 0.12, 8), darkWood, 0, -0.36, 0);
  for (let index = 0; index < 8; index++) {
    const angle = (index + 0.5) * Math.PI / 4;
    const rib = mesh(group, new THREE.BoxGeometry(0.027, 0.65, 0.028), wood,
      0.37 * Math.cos(angle), 0, 0.37 * Math.sin(angle));
    rib.rotation.y = -angle;
  }
  const glow = halo(group, texture, GOLD, 3.5, 0, 0.74);
  return { group, paper, glow };
}

function buildLantern(texture) {
  const group = new THREE.Group();
  mesh(group, new THREE.CylinderGeometry(0.76, 1, 0.3, 8), stone, 0, 0.15, 0);
  mesh(group, new THREE.CylinderGeometry(0.095, 0.17, 2.05, 7), wood, 0, 1.22, 0);
  mesh(group, new THREE.BoxGeometry(1.24, 0.1, 0.1), darkWood, 0, 2.12, 0);
  const ring = mesh(group, ringGeometry, new THREE.MeshBasicMaterial({ color: 0xffc775, transparent: true,
    opacity: 0.45, depthWrite: false }), 0, 0.039, 0);
  ring.rotation.x = -Math.PI / 2;
  const pool = groundGlow(group, texture, GOLD, 12, 0.63);
  const lantern = lanternModel(group, texture, 1.23, 2.81);
  const point = new THREE.PointLight(GOLD, 0, 13, 1.5);
  point.position.y = 2.55;
  group.add(point);
  return { group, ring, pool, point, paper: lantern.paper, glow: lantern.glow };
}

function buildMay(texture) {
  const group = new THREE.Group();
  const tunic = standard(0x9c5940);
  const cream = standard(0xffcca0);
  const navy = standard(0x473854);
  const straw = standard(0xd29c54);
  mesh(group, new THREE.CylinderGeometry(0.31, 0.49, 0.65, 9), tunic, 0, 0.77, 0);
  mesh(group, new THREE.CylinderGeometry(0.34, 0.37, 0.11, 9), navy, 0, 0.68, 0);
  mesh(group, new THREE.SphereGeometry(0.3, 10, 8), cream, 0, 1.24, 0);
  mesh(group, new THREE.ConeGeometry(0.62, 0.42, 16), straw, 0, 1.53, 0);
  mesh(group, new THREE.CylinderGeometry(0.63, 0.63, 0.048, 16), wood, 0, 1.33, 0);
  for (const x of [-0.105, 0.105]) {
    mesh(group, new THREE.SphereGeometry(0.027, 7, 6), darkWood, x, 1.24, 0.275);
  }
  const legs = [-0.19, 0.19].map((x) => {
    const leg = new THREE.Group();
    leg.position.set(x, 0.46, 0);
    group.add(leg);
    mesh(leg, new THREE.CylinderGeometry(0.12, 0.105, 0.34, 7), navy, 0, -0.15, 0);
    mesh(leg, new THREE.BoxGeometry(0.24, 0.15, 0.32), darkWood, 0, -0.37, 0.052);
    return leg;
  });
  const fixture = new THREE.Group();
  fixture.position.set(0.51, 1.29, 0.13);
  group.add(fixture);
  mesh(fixture, new THREE.CylinderGeometry(0.013, 0.013, 0.26, 6), darkWood, 0, -0.11, 0);
  lanternModel(fixture, texture, 0.38, -0.34).paper.material = emission(PALE);
  return { group, legs, fixture };
}

function decorate(scene, texture) {
  const random = seededRandom(481);
  const turf = standard(0x31494f);
  const ground = mesh(scene, new THREE.CylinderGeometry(ISLAND_RADIUS, 29.5, 0.8, 72), turf, 0, -0.4, 0);
  ground.rotation.y = Math.PI / 72;
  mesh(scene, new THREE.CylinderGeometry(29.5, 17, 8, 24), standard(0x354257), 0, -4.76, 0);
  mesh(scene, new THREE.CylinderGeometry(17, 2.1, 7, 24), standard(0x272b44), 0, -12.1, 0);
  const trailMaterial = new THREE.MeshStandardMaterial({ color: 0x53645f, flatShading: true });
  mesh(scene, new THREE.CylinderGeometry(3.1, 3.1, 0.033, 12), trailMaterial, 0, 0.016, 0);
  const trailSpot = new THREE.CylinderGeometry(1, 1, 0.025, 6);
  for (let lane = 0; lane < 5; lane++) {
    const angle = (lane + 0.1) * Math.PI * 2 / 5;
    for (let step = 2; step <= 13; step++) {
      const spot = mesh(scene, trailSpot, trailMaterial,
        Math.sin(angle) * step * 1.45, 0.017, Math.cos(angle) * step * 1.45);
      spot.rotation.y = random();
      spot.scale.set(0.58 + random() * 0.4, 1, 0.43 + random() * 0.23);
    }
  }
  const stones = new THREE.DodecahedronGeometry(1, 0);
  const trunk = new THREE.CylinderGeometry(0.14, 0.24, 1.42, 6);
  const crown = new THREE.ConeGeometry(0.85, 1.66, 7);
  for (let index = 0; index < 42; index++) {
    const angle = random() * Math.PI * 2;
    const radius = 19 + random() * 11;
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;
    if (index % 3 === 0) {
      const rock = mesh(scene, stones, stone, x, 0.19, z);
      rock.scale.set(0.55 + random() * 1.1, 0.59 + random() * 0.45, 0.75 + random() * 0.75);
      rock.rotation.y = random() * 6;
    } else {
      const tree = new THREE.Group();
      tree.position.set(x, 0, z);
      tree.scale.setScalar(0.68 + random() * 1.08);
      tree.rotation.y = angle;
      scene.add(tree);
      mesh(tree, trunk, darkWood, 0, 0.7, 0);
      const color = leafMaterials[index % leafMaterials.length];
      mesh(tree, crown, color, 0, 1.44, 0);
      mesh(tree, crown, color, 0, 2.12, 0).scale.setScalar(0.8);
      mesh(tree, crown, color, 0, 2.72, 0).scale.setScalar(0.62);
    }
  }

  const points = [];
  for (let index = 0; index < 740; index++) {
    const angle = random() * Math.PI * 2;
    const radius = 125 + random() * 75;
    points.push(Math.sin(angle) * radius, 3 + random() * 100, Math.cos(angle) * radius);
  }
  const stars = new THREE.BufferGeometry();
  stars.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  scene.add(new THREE.Points(stars, new THREE.PointsMaterial({
    color: 0xc6d4ef, size: 0.27, opacity: 0.83, transparent: true, fog: false
  })));
  const moon = new THREE.Group();
  moon.position.set(18, 11, 72);
  const moonMaterial = new THREE.MeshBasicMaterial({ color: 0xffe3a7, fog: false });
  mesh(moon, new THREE.SphereGeometry(3.9, 30, 18), moonMaterial, 0, 0, 0);
  halo(moon, texture, GOLD, 21, 0, 0.31).material.fog = false;
  scene.add(moon);

  const clouds = new THREE.Group();
  scene.add(clouds);
  for (let index = 0; index < 46; index++) {
    const angle = random() * Math.PI * 2;
    const radius = 31 + random() * 100;
    const cloud = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture, color: index % 2 ? 0xa391bd : 0x7f8fb6,
      opacity: 0.21 + random() * 0.26, depthWrite: false, transparent: true
    }));
    cloud.position.set(Math.sin(angle) * radius, -1.8 - random() * 9, Math.cos(angle) * radius);
    cloud.scale.set(25 + random() * 31, 5 + random() * 6, 1);
    clouds.add(cloud);
  }
  return clouds;
}

export function createScene(container, tuning) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'default' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.37;
  container.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x18213a);
  scene.fog = new THREE.FogExp2(0x192846, 0.012);
  const camera = new THREE.PerspectiveCamera(47, 1, 0.1, 260);
  const texture = glowTexture();
  const clouds = decorate(scene, texture);
  const ambient = new THREE.HemisphereLight(0xbac9ff, 0x66704e, 1.39);
  scene.add(ambient);
  const moon = new THREE.DirectionalLight(0xb5c9ff, 1.68);
  moon.position.set(-9, 16, 20);
  scene.add(moon);
  const fill = new THREE.DirectionalLight(PALE, 0);
  fill.position.set(11, 19, -8);
  scene.add(fill);
  const may = buildMay(texture);
  scene.add(may.group);
  const shadow = mesh(scene, planeGeometry, new THREE.MeshBasicMaterial({
    map: texture, color: PITCH, transparent: true, opacity: 0.74, depthWrite: false
  }), 0, 0.028, 0);
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(2.35, 2, 1);
  const pulseRing = mesh(scene, ringGeometry, new THREE.MeshBasicMaterial({
    color: PALE, transparent: true, depthWrite: false, side: THREE.DoubleSide
  }), 0, 0.075, 0);
  pulseRing.rotation.x = -Math.PI / 2;
  const lamps = Array.from({ length: tuning.lantern_count_night1 }, () => {
    const lamp = buildLantern(texture);
    lamp.ring.scale.setScalar(tuning.interact_radius);
    scene.add(lamp.group);
    return lamp;
  });
  const litPaper = emission(0xffba5d);
  const darkPaper = standard(0x55425a);
  const moteGold = emission(PALE);
  const activeShade = standard(0x251935);
  const stunnedShade = standard(0x745280);
  const eyes = emission(0xd28aff);
  const shadeEyeGeometry = new THREE.SphereGeometry(0.075, 8, 6);
  const motes = new Map();
  const shades = new Map();
  let pulseAge = Infinity;
  let pulseX = 0;
  let pulseZ = 0;
  let elapsed = 0;
  let lastTick;
  let facing = 0;
  let walking = false;
  let previousX = 0;
  let previousZ = 0;

  function sync(entities, visuals, make, update) {
    const present = new Set();
    for (const [index, entity] of entities.entries()) {
      present.add(entity.id);
      if (!visuals.has(entity.id)) {
        const visual = make();
        scene.add(visual.group);
        visuals.set(entity.id, visual);
      }
      update(visuals.get(entity.id), entity, index);
    }
    for (const [id, visual] of visuals) {
      if (present.has(id)) continue;
      scene.remove(visual.group);
      visuals.delete(id);
    }
  }

  function resize() {
    camera.aspect = container.clientWidth / Math.max(1, container.clientHeight);
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight, false);
  }
  window.addEventListener('resize', resize);
  resize();

  return {
    flash(position) {
      [pulseX, , pulseZ] = position;
      pulseAge = 0;
    },
    reset() {
      pulseAge = Infinity;
      previousX = previousZ = facing = 0;
      lastTick = undefined;
    },
    render(night, yaw, seconds) {
      elapsed += seconds;
      pulseAge += seconds;
      const [x, y, z] = night.player.pos;
      if (lastTick !== night.tick) {
        walking = Math.hypot(x - previousX, z - previousZ) > 0.002;
        if (walking) facing = Math.atan2(x - previousX, z - previousZ);
      }
      if (lastTick !== night.tick) {
        previousX = x;
        previousZ = z;
      }
      lastTick = night.tick;
      may.group.position.set(x, y, z);
      may.group.rotation.y = facing;
      may.fixture.rotation.z = Math.sin(elapsed * 7.5) * 0.14;
      may.group.visible = night.tick >= night.player.invulnerableUntil || Math.floor(elapsed * 16) % 3 !== 0;
      for (const [index, leg] of may.legs.entries()) {
        leg.rotation.x = walking ? Math.sin(elapsed * 16 + index * Math.PI) * 0.46 : leg.rotation.x * 0.84;
      }
      shadow.position.x = x;
      shadow.position.z = z;
      shadow.material.opacity = 0.74 / (1 + y);
      pulseRing.visible = pulseAge < 0.5;
      if (pulseRing.visible) {
        pulseRing.position.set(pulseX, 0.075, pulseZ);
        pulseRing.scale.setScalar(tuning.pulse_radius * (0.13 + pulseAge * 1.74));
        pulseRing.material.opacity = 0.88 * (1 - pulseAge * 2);
      }

      let litCount = 0;
      for (const [index, lantern] of night.lanterns.entries()) {
        const lamp = lamps[index];
        lamp.group.position.set(...lantern.pos);
        lamp.paper.material = lantern.lit ? litPaper : darkPaper;
        lamp.glow.visible = lamp.pool.visible = lantern.lit;
        lamp.ring.visible = !lantern.lit;
        lamp.point.intensity = lantern.lit ? 30 + Math.sin(elapsed * 3 + index) * 3 : 0;
        if (lantern.lit) litCount++;
      }
      ambient.intensity = 1.37 + litCount * 0.14;
      fill.intensity = litCount * 0.19;
      clouds.rotation.y = elapsed * 0.012;

      sync(night.motes, motes, () => {
        const group = new THREE.Group();
        const light = mesh(group, moteGeometry, moteGold, 0, 0, 0);
        halo(group, texture, GOLD, 1.27, 0, 0.9);
        return { group, light };
      }, (visual, mote, index) => {
        const [mx, , mz] = mote.pos;
        visual.group.position.set(mx, 0.65 + Math.sin(elapsed * 2.4 + index * 1.7) * 0.19, mz);
        visual.light.rotation.y = elapsed * 1.3 + index;
      });
      sync(night.shades, shades, () => {
        const group = new THREE.Group();
        const body = mesh(group, shadeGeometry, activeShade, 0, 0, 0);
        halo(group, texture, 0x8d4ed0, 3.1, -0.11, 0.56);
        for (const side of [-1, 1]) {
          mesh(group, shadeEyeGeometry, eyes, side * 0.23, 0.14, 0.54);
          const wisp = mesh(group, shadeGeometry, activeShade, side * 0.49, -0.36, 0);
          wisp.scale.set(0.45, 1.05, 0.52);
        }
        return { group, body };
      }, (visual, shade, index) => {
        const [sx, sy, sz] = shade.pos;
        visual.group.position.set(sx, Math.max(0.82, sy) + Math.sin(elapsed * 3 + index) * 0.16, sz);
        visual.group.rotation.y = Math.atan2(x - sx, z - sz);
        visual.body.material = shade.state === 'stunned' ? stunnedShade : activeShade;
      });

      camera.position.set(x - Math.sin(yaw) * 10.8, 6.1 + y * 0.57, z - Math.cos(yaw) * 10.8);
      camera.lookAt(x + Math.sin(yaw) * 5.15, 1.15 + y * 0.46, z + Math.cos(yaw) * 5.15);
      renderer.render(scene, camera);
    }
  };
}
