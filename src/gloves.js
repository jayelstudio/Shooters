import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Procedural 5-finger glove rig (adapted from the ChatGPT structure: two-bone
// fingers with smoothed curl + grip/tension/snap states + ball-aware deform),
// with the visible glove mesh attached to the bones (which the original lacked).
// Orientation here: fingers point +Y, curl about X toward the palm (-Z).

const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];

// Soft molded-vinyl glove: clearcoat sheen + environment reflections read far
// more "real" than flat matte. (Uses scene.environment for reflections.)
const gloveMat = new THREE.MeshPhysicalMaterial({
  color: 0xf3f3f3, roughness: 0.48, metalness: 0,
  clearcoat: 0.6, clearcoatRoughness: 0.45, envMapIntensity: 0.9,
  sheen: 0.3, sheenColor: new THREE.Color(0xffffff), sheenRoughness: 0.6,
});
const holeMat = new THREE.MeshBasicMaterial({ color: 0x161616, side: THREE.DoubleSide });

const mk = (geo, mat = gloveMat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; return m; };

class FingerBone {
  constructor(length, rad) {
    this.length = length;
    this.rad = rad;
    this.curl = 0;
    this.targetCurl = 0;
    const seg = length * 0.5;
    this.root = new THREE.Object3D();
    this.mid = new THREE.Object3D();
    this.root.add(this.mid);
    this.mid.position.y = seg;
    // proximal segment on root, knuckle bump at the joint, distal on mid
    // base fillet blends the finger into the palm/knuckle so there's no seam
    const baseFill = mk(new THREE.SphereGeometry(rad * 1.12, 12, 10));
    this.root.add(baseFill);
    const prox = mk(new THREE.CapsuleGeometry(rad, seg * 1.1, 8, 14));
    prox.position.y = seg / 2;
    this.root.add(prox);
    const knob = mk(new THREE.SphereGeometry(rad * 1.05, 12, 10));
    knob.position.y = seg;
    this.root.add(knob);
    const dist = mk(new THREE.CapsuleGeometry(rad * 0.9, seg * 0.92, 8, 14));
    dist.position.y = seg / 2 + rad * 0.15;
    this.mid.add(dist);
    const tip = mk(new THREE.SphereGeometry(rad * 0.9, 12, 10));
    tip.position.y = seg + rad * 0.3;
    this.mid.add(tip);
  }

  setCurl(v) { this.targetCurl = THREE.MathUtils.clamp(v, 0, 1); }

  update(dt) {
    this.curl += (this.targetCurl - this.curl) * Math.min(1, 14 * dt);
    this.root.rotation.x = -this.curl * 1.1;
    this.mid.rotation.x = -this.curl * 1.3;
  }
}

export class GloveRig {
  constructor() {
    this.group = new THREE.Group();
    this.grip = 0;
    this.tension = 0;
    this.state = 'idle';
    this.ballPos = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this.fingers = {
      thumb: new FingerBone(0.07, 0.02),
      index: new FingerBone(0.085, 0.02),
      middle: new FingerBone(0.092, 0.021),
      ring: new FingerBone(0.083, 0.02),
      pinky: new FingerBone(0.068, 0.018),
    };
    this._build();
  }

  _build() {
    // palm (rounded box; back +Z faces camera, palm -Z toward the ball)
    const palmW = 0.12, palmH = 0.1, palmD = 0.07;
    this.group.add(mk(new RoundedBoxGeometry(palmW, palmH, palmD, 5, 0.03)));
    // knuckle ridge so finger bases fuse into the palm
    const ridge = mk(new THREE.CapsuleGeometry(0.026, palmW * 0.66, 6, 14));
    ridge.rotation.z = Math.PI / 2; ridge.position.set(-0.004, palmH * 0.42, 0.004);
    this.group.add(ridge);

    // four fingers along the knuckle row (slight fan), middle longest/centered
    const topY = palmH * 0.42;
    const xs = { index: -0.036, middle: -0.012, ring: 0.013, pinky: 0.038 };
    const fan = { index: 0.16, middle: 0.05, ring: -0.06, pinky: -0.18 };
    ['index', 'middle', 'ring', 'pinky'].forEach((n) => {
      const f = this.fingers[n];
      f.root.position.set(xs[n], topY, 0.006);
      f.root.rotation.z = fan[n];
      f.root.rotation.x = -0.12; // slight forward set
      this.group.add(f.root);
    });

    // thumb: lower on the side, angled out and forward
    const t = this.fingers.thumb;
    t.root.position.set(-0.058, -0.012, 0.02);
    t.root.rotation.set(-0.2, 0.1, 0.95);
    this.group.add(t.root);
    const tfill = mk(new THREE.SphereGeometry(0.026, 12, 10));
    tfill.position.set(-0.052, 0.0, 0.018);
    this.group.add(tfill);

    // thin rolled cuff + dark opening
    const cuff = mk(new THREE.TorusGeometry(0.055, 0.016, 14, 30));
    cuff.position.set(0, -palmH * 0.5 - 0.008, 0);
    cuff.rotation.x = Math.PI / 2 - 0.18;
    this.group.add(cuff);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.04, 24), holeMat);
    hole.position.set(0, -palmH * 0.5 - 0.01, 0.002);
    hole.rotation.x = Math.PI / 2 - 0.18;
    this.group.add(hole);

    // grip anchor (ball sits here)
    this.gripPoint = new THREE.Object3D();
    this.gripPoint.position.set(0, 0.02, -0.12);
    this.group.add(this.gripPoint);
  }

  // 0 = open hand, 1 = full grip. Per-finger weighting like the reference.
  setGrip(v) {
    this.grip = THREE.MathUtils.clamp(v, 0, 1);
    const b = this.grip;
    this.fingers.index.setCurl(b);
    this.fingers.middle.setCurl(b);
    this.fingers.ring.setCurl(b * 0.95);
    this.fingers.pinky.setCurl(b * 0.9);
    this.fingers.thumb.setCurl(b * 0.6);
  }

  setTension(v) { this.tension = v; this.setGrip(0.62 + v * 0.3); }
  snapOpen() { this.state = 'snap'; this.setGrip(0); }

  // Pull finger tips toward the ball surface (ball-aware grip deformation).
  _applyBallInfluence() {
    for (const n of FINGERS) {
      const f = this.fingers[n];
      f.mid.getWorldPosition(this._tmp);
      const dist = this._tmp.distanceTo(this.ballPos);
      const influence = THREE.MathUtils.clamp(1 - dist / 0.14, 0, 1);
      f.setCurl(Math.max(f.targetCurl, this.grip * 0.6 + influence * 0.45));
    }
  }

  update(dt, ballObject) {
    if (ballObject) {
      ballObject.getWorldPosition(this.ballPos);
      this._applyBallInfluence();
    }
    for (const n of FINGERS) this.fingers[n].update(dt);
  }
}

export const GloveFactory = {
  create(side) {
    const rig = new GloveRig();
    if (side === 'left' || side === -1) rig.group.scale.x = -1;
    return rig;
  },
};
