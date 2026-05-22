import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';

// Seamless skinned glove: one continuous metaball surface bound to a finger
// skeleton, so it deforms with no joint seams. Same GloveRig API as gloves.js.
// Field coord f maps to mesh vertex coord (2f - 1).
//
// Fully config-driven so preview/tuner.html can rebuild it live from sliders.

const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];

function leatherNormal() {
  const s = 256;
  const c = document.createElement('canvas'); c.width = c.height = s;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgb(128,128,255)'; ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 2200; i++) {
    const x = Math.random() * s, y = Math.random() * s, r = 1 + Math.random() * 2.4;
    const a = Math.random() * Math.PI * 2;
    const nx = (128 + Math.cos(a) * 46) | 0, ny = (128 + Math.sin(a) * 46) | 0;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgb(${nx},${ny},255)`);
    g.addColorStop(1, 'rgba(128,128,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 4);
  return t;
}

// shared (expensive procedural texture; reused across rigs)
let _normalMap = null;
function normalMap() { return _normalMap || (_normalMap = leatherNormal()); }

// All tunable parameters. The tuner edits a deep clone of this and rebuilds.
// Field space is [0,1]; y is up (fingers point +y), x across, z depth.
export const DEFAULTS = {
  res: 112,
  isolation: 98,
  subtract: 12,
  fingerN: 14,            // balls per finger
  taperA: 0.21,           // linear taper toward tip
  taperB: 0.26,           // quadratic taper toward tip
  knuckleStr: 0.075,      // ridge that fuses finger bases (low = fingers split early)
  webStr: 0.04,           // thumb webbing fill
  curlRoot: 1.05,
  curlMid: 1.25,
  skinR: 0.22,            // skin-weight falloff radius (out space)
  // palm slab + wrist stump (the body of the hand below the knuckles)
  palm: {
    str: 0.26,           // central palm mass
    width: 0.13,         // half-width (side balls offset from center)
    y: 0.41,             // palm vertical center
    top: 0.46,           // upper palm (blends into the knuckles)
    wristStr: 0.24,      // wrist stump mass
    wristY: 0.34,        // upper wrist y
    wristLen: 0.05,      // how far the wrist extends down
  },
  // finger layout. dir = normalize(sin(fanX), cos(fanX), fanZ); base z = 0.5 + dz
  fingers: {
    index:  { x: 0.38,  base: 0.49,  len: 0.32,  str: 0.060, fanX: -0.08, fanZ: -0.02, dz: 0.0 },
    middle: { x: 0.46,  base: 0.50,  len: 0.35,  str: 0.074, fanX: 0.03,  fanZ: 0.0,   dz: 0.0 },
    ring:   { x: 0.555, base: 0.50,  len: 0.31,  str: 0.060, fanX: -0.02, fanZ: 0.0,   dz: 0.0 },
    pinky:  { x: 0.635, base: 0.485, len: 0.225, str: 0.046, fanX: 0.02,  fanZ: 0.0,   dz: 0.0 },
    thumb:  { x: 0.345, base: 0.40,  len: 0.20,  str: 0.064, fanX: -0.42, fanZ: 0.20,  dz: -0.01 },
  },
  material: {
    color: 0xeeebe3, roughness: 0.62, clearcoat: 0.25, clearcoatRoughness: 0.5,
    envMapIntensity: 0.7, normalScale: 0.35, sheen: 0.3, sheenRoughness: 0.7,
  },
};

function cloneCfg(c) { return JSON.parse(JSON.stringify(c)); }
function mergeCfg(base, over) {
  const out = cloneCfg(base);
  if (!over) return out;
  for (const k of Object.keys(over)) {
    if (k === 'fingers' || k === 'material') Object.assign(out[k], over[k]);
    else out[k] = over[k];
  }
  if (over.fingers) for (const n of Object.keys(over.fingers)) Object.assign(out.fingers[n], over.fingers[n]);
  return out;
}

function toOut(v) { return new THREE.Vector3(2 * v.x - 1, 2 * v.y - 1, 2 * v.z - 1); }

class FingerJoints {
  constructor() { this.curl = 0; this.targetCurl = 0; }
}

export class GloveRig {
  constructor(config) {
    this.cfg = mergeCfg(DEFAULTS, config);
    this.group = new THREE.Group();
    this.grip = 0;
    this.state = 'idle';
    this.ballPos = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this.joints = {};
    this._build();
  }

  _build() {
    const cfg = this.cfg;
    const mat = new THREE.MeshPhysicalMaterial({
      color: cfg.material.color, roughness: cfg.material.roughness, metalness: 0,
      clearcoat: cfg.material.clearcoat, clearcoatRoughness: cfg.material.clearcoatRoughness,
      envMapIntensity: cfg.material.envMapIntensity,
      normalMap: normalMap(), normalScale: new THREE.Vector2(cfg.material.normalScale, cfg.material.normalScale),
      sheen: cfg.material.sheen, sheenColor: new THREE.Color(0xffffff), sheenRoughness: cfg.material.sheenRoughness,
    });
    this.material = mat;

    const mc = new MarchingCubes(cfg.res, mat, true, false, 900000);
    mc.isolation = cfg.isolation;
    mc.reset();
    const SUB = cfg.subtract;
    const add = (x, y, z, s) => mc.addBall(x, y, z, s, SUB);

    // palm slab (rounded, ends at the wrist - no cuff)
    const P = cfg.palm;
    add(0.5, P.y, 0.5, P.str);
    add(0.5 - P.width, P.y + 0.01, 0.5, P.str * 0.72);
    add(0.5 + P.width, P.y + 0.01, 0.5, P.str * 0.72);
    add(0.5 - P.width * 0.5, P.y, 0.5, P.str * 0.62);
    add(0.5 + P.width * 0.5, P.y, 0.5, P.str * 0.62);
    add(0.5, P.top, 0.5, P.str * 0.45);          // upper palm, blends to knuckles
    // wrist stump (wide + rounded, ends at the wrist)
    add(0.5, P.wristY, 0.5, P.wristStr);
    add(0.5 - P.width * 0.5, P.wristY, 0.5, P.wristStr * 0.72);
    add(0.5 + P.width * 0.5, P.wristY, 0.5, P.wristStr * 0.72);
    add(0.5, P.wristY - P.wristLen, 0.5, P.wristStr * 0.95);
    // knuckle ridge across the four finger bases (low strength so fingers split early)
    [cfg.fingers.index.x, cfg.fingers.middle.x, cfg.fingers.ring.x, cfg.fingers.pinky.x]
      .forEach((x) => add(x, P.top + 0.025, 0.5, cfg.knuckleStr));

    // bone rest endpoints in field space, recorded for skinning + skeleton
    const segs = {}; // name -> { root, mid, tip }
    for (const name of FINGERS) {
      const f = cfg.fingers[name];
      const dir = new THREE.Vector3(Math.sin(f.fanX), Math.cos(f.fanX), f.fanZ || 0).normalize();
      const root = new THREE.Vector3(f.x, f.base, 0.5 + (f.dz || 0));
      const mid = root.clone().addScaledVector(dir, f.len * 0.5);
      const tip = root.clone().addScaledVector(dir, f.len);
      segs[name] = { root, mid, tip };
      const N = cfg.fingerN;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const p = root.clone().addScaledVector(dir, f.len * t);
        const taper = 1 - cfg.taperA * t - cfg.taperB * t * t;
        add(p.x, p.y, p.z, f.str * taper);
      }
    }
    // thumb webbing: fill the gap between thumb base and index base
    {
      const tb = segs.thumb.root, ib = segs.index.root;
      const wmid = tb.clone().lerp(ib, 0.5);
      add(wmid.x, wmid.y, wmid.z, cfg.webStr);
    }
    mc.update();

    // extract a clean single BufferGeometry (positions/normals/uvs) in out space
    const count = mc.count;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(mc.positionArray.slice(0, count * 3), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(mc.normalArray.slice(0, count * 3), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(mc.uvArray.slice(0, count * 2), 2));

    // ---- skeleton (out space) ----
    const wristOut = toOut(new THREE.Vector3(0.5, 0.40, 0.5));
    const wrist = new THREE.Bone(); wrist.position.copy(wristOut);
    const boneList = [wrist];
    const fingerBones = {};
    for (const name of FINGERS) {
      const s = segs[name];
      const rootOut = toOut(s.root), midOut = toOut(s.mid), tipOut = toOut(s.tip);
      const rootBone = new THREE.Bone();
      rootBone.position.copy(rootOut).sub(wristOut);
      const midBone = new THREE.Bone();
      midBone.position.copy(midOut).sub(rootOut);
      rootBone.add(midBone); wrist.add(rootBone);
      boneList.push(rootBone, midBone);
      fingerBones[name] = { rootBone, midBone, rootOut, midOut, tipOut };
      this.joints[name] = new FingerJoints();
    }

    // ---- skin weights: nearest finger segment, wrist as fallback ----
    const pos = geo.attributes.position;
    const si = new Uint16Array(count * 4);
    const sw = new Float32Array(count * 4);
    const boneIndex = new Map(); boneList.forEach((b, i) => boneIndex.set(b, i));
    const v = new THREE.Vector3();
    const distToSeg = (p, a, b) => {
      const ab = b.clone().sub(a); const t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
      return p.distanceTo(a.clone().addScaledVector(ab, t));
    };
    const R = cfg.skinR;
    const lowY = toOut(new THREE.Vector3(0, 0.46, 0)).y;
    for (let i = 0; i < count; i++) {
      v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
      const cands = [{ b: 0, w: 0.18 }];
      for (const name of FINGERS) {
        const fb = fingerBones[name];
        const dp = distToSeg(v, fb.rootOut, fb.midOut);
        const dd = distToSeg(v, fb.midOut, fb.tipOut);
        const wp = Math.max(0, 1 - dp / R); const wd = Math.max(0, 1 - dd / R);
        if (wp > 0) cands.push({ b: boneIndex.get(fb.rootBone), w: wp * wp });
        if (wd > 0) cands.push({ b: boneIndex.get(fb.midBone), w: wd * wd });
      }
      if (v.y < lowY) cands[0].w += 0.6;
      cands.sort((a, b) => b.w - a.w);
      const top = cands.slice(0, 4);
      let sum = top.reduce((a, c) => a + c.w, 0) || 1;
      for (let k = 0; k < 4; k++) {
        si[i * 4 + k] = top[k] ? top[k].b : 0;
        sw[i * 4 + k] = top[k] ? top[k].w / sum : 0;
      }
    }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));

    const mesh = new THREE.SkinnedMesh(geo, mat);
    mesh.castShadow = true;
    mesh.add(wrist);
    mesh.bind(new THREE.Skeleton(boneList));
    this.mesh = mesh;
    this.fingerBones = fingerBones;

    // size + recenter into hand-local meters
    geo.computeBoundingBox();
    const size = new THREE.Vector3(); geo.boundingBox.getSize(size);
    const center = new THREE.Vector3(); geo.boundingBox.getCenter(center);
    const S = 0.3 / Math.max(size.x, size.y, size.z);
    this.group.add(mesh);
    this.group.scale.setScalar(S);
    this.group.position.set(-center.x * S, -center.y * S, -center.z * S);
  }

  setGrip(v) {
    this.grip = THREE.MathUtils.clamp(v, 0, 1);
    const b = this.grip;
    this.joints.index.targetCurl = b;
    this.joints.middle.targetCurl = b;
    this.joints.ring.targetCurl = b * 0.95;
    this.joints.pinky.targetCurl = b * 0.9;
    this.joints.thumb.targetCurl = b * 0.6;
  }

  setTension(v) { this.setGrip(0.62 + v * 0.3); }
  snapOpen() { this.state = 'snap'; this.setGrip(0); }

  update(dt, ballObject) {
    if (ballObject) {
      ballObject.getWorldPosition(this.ballPos);
      for (const name of FINGERS) {
        const fb = this.fingerBones[name];
        fb.midBone.getWorldPosition(this._tmp);
        const inf = THREE.MathUtils.clamp(1 - this._tmp.distanceTo(this.ballPos) / 0.16, 0, 1);
        this.joints[name].targetCurl = Math.max(this.joints[name].targetCurl, this.grip * 0.6 + inf * 0.45);
      }
    }
    for (const name of FINGERS) {
      const j = this.joints[name];
      j.curl += (j.targetCurl - j.curl) * Math.min(1, 14 * dt);
      const fb = this.fingerBones[name];
      fb.rootBone.rotation.x = -j.curl * this.cfg.curlRoot;
      fb.midBone.rotation.x = -j.curl * this.cfg.curlMid;
    }
  }
}

export const GloveFactory = {
  create(side, config) {
    const rig = new GloveRig(config);
    if (side === 'left' || side === -1) rig.group.scale.x *= -1;
    return rig;
  },
};
