import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';

// Seamless skinned glove: one continuous metaball surface bound to a finger
// skeleton, so it deforms with no joint seams. Same GloveRig API as gloves.js.
// Field coord f maps to mesh vertex coord (2f - 1).

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

const normalMap = leatherNormal();
const gloveMat = new THREE.MeshPhysicalMaterial({
  color: 0xeeebe3, roughness: 0.62, metalness: 0,
  clearcoat: 0.25, clearcoatRoughness: 0.5, envMapIntensity: 0.7,
  normalMap, normalScale: new THREE.Vector2(0.35, 0.35),
  sheen: 0.3, sheenColor: new THREE.Color(0xffffff), sheenRoughness: 0.7,
});
const holeMat = new THREE.MeshBasicMaterial({ color: 0x141414, side: THREE.DoubleSide });

// finger layout in field space [0,1]: base x, length, ball radius/strength.
// Wide spacing + small strength so fingers stay distinct (no mitten).
const LAYOUT = {
  index: { x: 0.375, base: 0.50, len: 0.30, str: 0.082, fan: 0.10 },
  middle: { x: 0.465, base: 0.50, len: 0.33, str: 0.085, fan: 0.03 },
  ring: { x: 0.555, base: 0.50, len: 0.285, str: 0.082, fan: -0.05 },
  pinky: { x: 0.64, base: 0.485, len: 0.235, str: 0.072, fan: -0.13 },
  thumb: { x: 0.285, base: 0.45, len: 0.21, str: 0.10, fan: 0.62 },
};

function toOut(v) { return new THREE.Vector3(2 * v.x - 1, 2 * v.y - 1, 2 * v.z - 1); }

class FingerJoints {
  constructor() { this.curl = 0; this.targetCurl = 0; }
}

export class GloveRig {
  constructor() {
    this.group = new THREE.Group();
    this.grip = 0;
    this.state = 'idle';
    this.ballPos = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this.joints = {};
    this._build();
  }

  _build() {
    const res = 88;
    const mc = new MarchingCubes(res, gloveMat, true, false, 320000);
    mc.isolation = 80;
    mc.reset();
    const SUB = 12;
    const add = (x, y, z, s) => mc.addBall(x, y, z, s, SUB);

    // palm slab + knuckle ridge (fuses finger bases, fingers separate higher up)
    add(0.5, 0.40, 0.5, 0.2); add(0.40, 0.41, 0.5, 0.15); add(0.60, 0.41, 0.5, 0.15);
    add(0.46, 0.40, 0.5, 0.13); add(0.54, 0.40, 0.5, 0.13);
    add(0.5, 0.45, 0.5, 0.10);
    add(0.5, 0.35, 0.5, 0.18);
    // knuckle ridge across the finger bases (low strength so fingers split early)
    [0.375, 0.465, 0.555, 0.64].forEach((x) => add(x, 0.485, 0.5, 0.055));

    // bone rest endpoints in field space, recorded for skinning + skeleton
    const segs = {}; // name -> { root, mid, tip } field-space Vector3
    for (const name of FINGERS) {
      const f = LAYOUT[name];
      const dir = new THREE.Vector3(Math.sin(f.fan), Math.cos(f.fan), 0); // fan in x
      const root = new THREE.Vector3(f.x, f.base, 0.5);
      const mid = root.clone().addScaledVector(dir, f.len * 0.5);
      const tip = root.clone().addScaledVector(dir, f.len);
      segs[name] = { root, mid, tip };
      // dense balls along the finger for a smooth clean tube
      const N = 14;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const p = root.clone().addScaledVector(dir, f.len * t);
        // slim, gently tapered toward the rounded tip
        const taper = 1 - 0.12 * t - 0.18 * t * t;
        add(p.x, p.y, p.z, f.str * taper);
      }
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
    const fingerBones = {}; // name -> { rootBone, midBone, rootOut, midOut, tipOut }
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
    const R = 0.22;
    for (let i = 0; i < count; i++) {
      v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
      const cands = [{ b: 0, w: 0.18 }]; // small wrist baseline
      for (const name of FINGERS) {
        const fb = fingerBones[name];
        const dp = distToSeg(v, fb.rootOut, fb.midOut);
        const dd = distToSeg(v, fb.midOut, fb.tipOut);
        const wp = Math.max(0, 1 - dp / R); const wd = Math.max(0, 1 - dd / R);
        if (wp > 0) cands.push({ b: boneIndex.get(fb.rootBone), w: wp * wp });
        if (wd > 0) cands.push({ b: boneIndex.get(fb.midBone), w: wd * wd });
      }
      // palm/cuff verts (low y, far from fingers) lean to wrist
      if (v.y < toOut(new THREE.Vector3(0, 0.46, 0)).y) cands[0].w += 0.6;
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

    const mesh = new THREE.SkinnedMesh(geo, gloveMat);
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

    // separate rolled cuff (rigid) at the wrist
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.12, 14, 30), gloveMat);
    cuff.position.copy(toOut(new THREE.Vector3(0.5, 0.31, 0.5)));
    cuff.rotation.x = Math.PI / 2 - 0.18; cuff.castShadow = true;
    mesh.add(cuff);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.3, 24), holeMat);
    hole.position.copy(cuff.position); hole.position.y -= 0.04; hole.rotation.x = Math.PI / 2 - 0.18;
    mesh.add(hole);
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
      fb.rootBone.rotation.x = -j.curl * 1.05;
      fb.midBone.rotation.x = -j.curl * 1.25;
    }
  }
}

export const GloveFactory = {
  create(side) {
    const rig = new GloveRig();
    if (side === 'left' || side === -1) rig.group.scale.x *= -1;
    return rig;
  },
};
