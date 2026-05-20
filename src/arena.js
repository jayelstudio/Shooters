import * as THREE from 'three';
import { CONFIG, D2R } from './config.js';
import { woodTexture, crowdTexture, environment } from './materials.js';

// Thin flat white line (a stretched box) from a->b on the floor.
function lineSeg(parent, ax, az, bx, bz, width = 0.05) {
  const dx = bx - ax, dz = bz - az;
  const len = Math.hypot(dx, dz);
  const geo = new THREE.BoxGeometry(len, 0.012, width);
  const mat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 });
  const m = new THREE.Mesh(geo, mat);
  m.position.set((ax + bx) / 2, 0.012, (az + bz) / 2);
  m.rotation.y = -Math.atan2(dz, dx);
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

export function buildArena(scene, renderer) {
  scene.background = new THREE.Color(0x05060a);
  scene.environment = environment(renderer);
  scene.fog = new THREE.Fog(0x05060a, 22, 55);

  const group = new THREE.Group();
  scene.add(group);

  // ---- Floor ----
  const wood = woodTexture();
  wood.repeat.set(6, 6);
  const floorMat = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.45, metalness: 0.0 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = 7;
  floor.receiveShadow = true;
  group.add(floor);

  // ---- Court markings (world-space, guaranteed alignment) ----
  const lines = new THREE.Group();
  group.add(lines);
  const baselineZ = -1.6;
  const halfCourtW = 7.5;
  // baseline + sidelines + halfcourt-ish boundary
  lineSeg(lines, -halfCourtW, baselineZ, halfCourtW, baselineZ);
  lineSeg(lines, -halfCourtW, baselineZ, -halfCourtW, 14);
  lineSeg(lines, halfCourtW, baselineZ, halfCourtW, 14);
  lineSeg(lines, -halfCourtW, 14, halfCourtW, 14);

  // the paint / key
  const keyHalf = 2.44, ftZ = 4.42;
  lineSeg(lines, -keyHalf, baselineZ, -keyHalf, ftZ);
  lineSeg(lines, keyHalf, baselineZ, keyHalf, ftZ);
  lineSeg(lines, -keyHalf, ftZ, keyHalf, ftZ);

  // free-throw circle
  const ftRing = new THREE.Mesh(
    new THREE.RingGeometry(1.78, 1.83, 48),
    new THREE.MeshStandardMaterial({ color: 0xf2f2f2, side: THREE.DoubleSide, roughness: 0.5 })
  );
  ftRing.rotation.x = -Math.PI / 2;
  ftRing.position.set(0, 0.013, ftZ);
  lines.add(ftRing);

  // 3-point arc (centered on basket, opening toward player +z)
  const arc = new THREE.Mesh(
    new THREE.RingGeometry(6.73, 6.8, 96, 1, 200 * D2R, 140 * D2R),
    new THREE.MeshStandardMaterial({ color: 0xf2f2f2, side: THREE.DoubleSide, roughness: 0.5 })
  );
  arc.rotation.x = -Math.PI / 2;
  arc.position.set(0, 0.013, 0);
  lines.add(arc);
  // straight corner segments of the 3pt line
  const cornerX = 6.75 * Math.sin(70 * D2R);
  const cornerZ = 6.75 * Math.cos(70 * D2R);
  lineSeg(lines, cornerX, cornerZ, cornerX, baselineZ);
  lineSeg(lines, -cornerX, cornerZ, -cornerX, baselineZ);

  // ---- Hoop assembly ----
  buildHoop(group);

  // ---- Stands / crowd + arena shell ----
  buildCrowd(group);
  buildLightRig(group);

  // ---- Lights ----
  const ambient = new THREE.AmbientLight(0xbfcad6, 0.55);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0xfff4e0, 1.4);
  key.position.set(4, 12, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 40;
  key.shadow.camera.left = -12;
  key.shadow.camera.right = 12;
  key.shadow.camera.top = 14;
  key.shadow.camera.bottom = -4;
  key.shadow.bias = -0.0005;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x88aaff, 0.4);
  fill.position.set(-6, 8, 4);
  scene.add(fill);

  const hoopSpot = new THREE.SpotLight(0xffffff, 30, 14, Math.PI / 5, 0.4, 1.2);
  hoopSpot.position.set(0, 8, 2);
  hoopSpot.target.position.set(0, 3, 0);
  scene.add(hoopSpot);
  scene.add(hoopSpot.target);

  return { group };
}

function buildHoop(group) {
  const hoop = new THREE.Group();
  group.add(hoop);
  const { rim, backboard } = CONFIG;

  // Backboard (glass)
  const boardMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, transmission: 0.9, transparent: true, opacity: 0.35,
    roughness: 0.08, metalness: 0, thickness: 0.05, ior: 1.4,
    clearcoat: 1, clearcoatRoughness: 0.05,
  });
  const boardW = backboard.halfW * 2, boardH = backboard.top - backboard.bottom;
  const board = new THREE.Mesh(new THREE.BoxGeometry(boardW, boardH, 0.04), boardMat);
  board.position.set(0, (backboard.top + backboard.bottom) / 2, backboard.z - 0.02);
  hoop.add(board);

  // Board border + shooter's square
  const paint = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.4 });
  const red = new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.4 });
  const borderFrame = frameRect(boardW, boardH, 0.05, paint);
  borderFrame.position.set(0, (backboard.top + backboard.bottom) / 2, backboard.z);
  hoop.add(borderFrame);
  const sq = frameRect(0.59, 0.45, 0.04, red);
  sq.position.set(0, rim.center.y + 0.225, backboard.z);
  hoop.add(sq);

  // Rim
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: 0.35, metalness: 0.7 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(rim.radius, rim.tube, 16, 48), rimMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(rim.center.x, rim.center.y, rim.center.z);
  ring.castShadow = true;
  hoop.add(ring);

  // Rim connector to board
  const conn = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.18), rimMat);
  conn.position.set(0, rim.center.y, backboard.z - 0.08 + 0.09);
  hoop.add(conn);

  // Net (hanging strands forming a cone)
  hoop.add(buildNet());

  // Pole / stanchion
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.5, metalness: 0.6 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 3.2, 16), poleMat);
  pole.position.set(0, 1.6, backboard.z - 1.0);
  pole.castShadow = true;
  hoop.add(pole);
  const armBar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.0), poleMat);
  armBar.position.set(0, 3.2, backboard.z - 0.55);
  hoop.add(armBar);
  const padMat = new THREE.MeshStandardMaterial({ color: 0x111418, roughness: 0.9 });
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 2.0, 16), padMat);
  pad.position.set(0, 1.0, backboard.z - 1.0);
  hoop.add(pad);
}

function frameRect(w, h, t, mat) {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(w, t, 0.03), mat);
  top.position.y = h / 2;
  const bot = top.clone(); bot.position.y = -h / 2;
  const left = new THREE.Mesh(new THREE.BoxGeometry(t, h, 0.03), mat);
  left.position.x = -w / 2;
  const right = left.clone(); right.position.x = w / 2;
  g.add(top, bot, left, right);
  return g;
}

function buildNet() {
  const net = new THREE.Group();
  net.name = 'net';
  const { rim } = CONFIG;
  const top = rim.radius * 0.95;
  const bottom = rim.radius * 0.45;
  const depth = 0.45;
  const strands = 12;
  const mat = new THREE.LineBasicMaterial({ color: 0xf0f0f0, transparent: true, opacity: 0.85 });
  const rings = 5;
  const pts = [];
  for (let s = 0; s < strands; s++) {
    const a0 = (s / strands) * Math.PI * 2;
    const a1 = ((s + 1) / strands) * Math.PI * 2;
    for (let r = 0; r < rings; r++) {
      const t0 = r / rings, t1 = (r + 1) / rings;
      const rad0 = top + (bottom - top) * t0;
      const rad1 = top + (bottom - top) * t1;
      const y0 = -depth * t0, y1 = -depth * t1;
      // vertical-ish strand (zig-zag to neighbor)
      pts.push(new THREE.Vector3(Math.cos(a0) * rad0, y0, Math.sin(a0) * rad0));
      pts.push(new THREE.Vector3(Math.cos(a1) * rad1, y1, Math.sin(a1) * rad1));
    }
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const seg = new THREE.LineSegments(geo, mat);
  seg.name = 'netMesh';
  seg.position.set(rim.center.x, rim.center.y, rim.center.z);
  net.add(seg);
  return net;
}

// Candidate paths for the user-supplied arena photo (case-sensitive on most hosts).
const CROWD_IMG_CANDIDATES = [
  './game-arena.PNG', './game-arena.png',
  './arena.png', './arena.jpg', './assets/arena.png', './assets/arena.jpg',
];
// Full-photo backdrop placed behind the basket. In portrait the horizontal view
// is narrow, so one flat plane fills the whole back of the arena with no
// repetition or distortion. Tunable from a screenshot.
const BACKDROP = {
  z: -14,         // distance behind the basket
  yCenter: 1.0,   // vertical center of the photo plane
  width: 96,      // ~native aspect (1854x848 -> 2.18) at this height
  height: 44,
  brightness: 1.0,
  toneMapped: true,
};

function buildCrowd(group) {
  loadFirstTexture(
    CROWD_IMG_CANDIDATES,
    (tex) => buildArenaBackdrop(group, tex),
    () => buildProceduralStands(group)
  );
}

// Single full-photo backdrop — the real arena fills the back of the scene.
function buildArenaBackdrop(group, tex) {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  const mat = new THREE.MeshBasicMaterial({
    map: tex, side: THREE.DoubleSide, toneMapped: BACKDROP.toneMapped, fog: false,
  });
  if (BACKDROP.brightness !== 1) mat.color.setScalar(BACKDROP.brightness);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(BACKDROP.width, BACKDROP.height), mat);
  plane.position.set(0, BACKDROP.yCenter, BACKDROP.z);
  plane.name = 'arenaBackdrop';
  group.add(plane);
}

// Fallback when no photo is supplied: the original tiled procedural crowd bowl.
function buildProceduralStands(group) {
  const crowdTex = crowdTexture();
  function stand(x, z, rotY, w) {
    const tex = crowdTex.clone();
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(w / 4, 2);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 9),
      new THREE.MeshStandardMaterial({
        map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.5,
        roughness: 1, side: THREE.DoubleSide,
      }));
    m.position.set(x, 4, z);
    m.rotation.y = rotY;
    m.rotation.x = -0.32;
    group.add(m);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 2, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x111419, roughness: 0.9 }));
    wall.position.set(x, 1, z);
    wall.rotation.y = rotY;
    group.add(wall);
  }
  stand(0, -9.5, 0, 30);
  stand(0, 22, Math.PI, 30);
  stand(-13, 6, Math.PI / 2, 34);
  stand(13, 6, -Math.PI / 2, 34);

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({ color: 0x070809, roughness: 1 }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = 16;
  group.add(ceil);
}

// Try each path in order; skip empty/invalid files; call onLoad with the first
// real image, or onFail if none load.
function loadFirstTexture(paths, onLoad, onFail) {
  const loader = new THREE.TextureLoader();
  let i = 0;
  const tryNext = () => {
    if (i >= paths.length) { onFail && onFail(); return; }
    const p = paths[i++];
    loader.load(
      p,
      (tex) => {
        const img = tex.image;
        const w = (img && (img.naturalWidth || img.width)) || 0;
        const h = (img && (img.naturalHeight || img.height)) || 0;
        if (w < 8 || h < 8) { tryNext(); return; }
        onLoad(tex);
      },
      undefined,
      () => tryNext()
    );
  };
  tryNext();
}

function buildLightRig(group) {
  const fixtureMat = new THREE.MeshStandardMaterial({
    color: 0x222222, emissive: 0xfff6e0, emissiveIntensity: 1.6, roughness: 0.4,
  });
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.25, 1.6), fixtureMat);
      f.position.set(i * 6, 13.5, 4 + j * 7);
      group.add(f);
    }
  }
}
