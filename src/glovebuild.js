import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Single source of truth for the glove shape (used by preview, tuner, and game).
export const DEFAULT_P = {
  palmW: 0.128, palmH: 0.103, palmD: 0.092, palmR: 0.034,
  fingerCount: 3, fingerLen: 0.075, fingerRad: 0.022, fingerSpread: 0.041, fingerFan: 0.1,
  fingerBaseCurl: 0.32, fingerMidCurl: 0.5,
  knuckleRad: 0.032,
  thumbLen: 0.051, thumbRad: 0.025, thumbAngle: 0.79, thumbX: 0.06, thumbY: 0.001, thumbCurl: 0.4,
  cuffR: 0.05, cuffTube: 0.014,
  dartLen: 0.03, dartRad: 0.006, dartSpread: 0.018, dartY: 0.011, dartFan: 0.16,
};

const glove = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.8, metalness: 0 });
const dartMat = new THREE.MeshStandardMaterial({ color: 0x202020, roughness: 0.6 });
const holeMat = new THREE.MeshBasicMaterial({ color: 0x141414, side: THREE.DoubleSide });

const mesh = (geo) => { const m = new THREE.Mesh(geo, glove); m.castShadow = true; return m; };

// A two-segment digit with a knuckle joint. Returns { group, base, mid }:
// base = MCP pivot (finger root), mid = PIP pivot (the knuckle).
function makeDigit(rad, len, baseCurl, midCurl) {
  const proxLen = len * 0.5, distLen = len * 0.5;
  const base = new THREE.Group();
  base.rotation.x = -baseCurl;
  const prox = mesh(new THREE.CapsuleGeometry(rad, proxLen, 8, 16));
  prox.position.y = proxLen / 2 + rad * 0.3;
  base.add(prox);
  // knuckle bump where the segments meet
  const knob = mesh(new THREE.SphereGeometry(rad * 1.02, 12, 10));
  knob.position.y = proxLen + rad * 0.45;
  base.add(knob);
  const mid = new THREE.Group();
  mid.position.y = proxLen + rad * 0.45;
  mid.rotation.x = -midCurl;
  const dist = mesh(new THREE.CapsuleGeometry(rad * 0.92, distLen, 8, 16));
  dist.position.y = distLen / 2 + rad * 0.3;
  mid.add(dist);
  base.add(mid);
  return { group: base, base, mid };
}

// Build one glove (clean parametric parts). side: -1 left, +1 right.
export function buildHand(p, side) {
  const hand = new THREE.Group();

  // palm (rounded box; back faces +z, palm -z)
  hand.add(mesh(new RoundedBoxGeometry(p.palmW, p.palmH, p.palmD, 5, p.palmR)));
  // knuckle ridge across the top so finger bases fuse smoothly
  const knuck = mesh(new THREE.CapsuleGeometry(p.knuckleRad, p.palmW * 0.62, 6, 14));
  knuck.rotation.z = Math.PI / 2; knuck.position.set(0, p.palmH * 0.42, 0.004);
  hand.add(knuck);

  // articulated fingers
  const baseY = p.palmH * 0.42;
  const n = p.fingerCount;
  const fingers = [];
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * p.fingerSpread;
    const d = makeDigit(p.fingerRad, p.fingerLen, p.fingerBaseCurl, p.fingerMidCurl);
    d.base.position.set(x, baseY, 0.006);
    d.base.rotation.z = -Math.sign(x || 1) * (Math.abs(x) / p.fingerSpread) * p.fingerFan;
    hand.add(d.base);
    fingers.push(d);
  }

  // articulated thumb (overlaps the palm, with a base fillet to connect)
  const thumb = makeDigit(p.thumbRad, p.thumbLen, 0, p.thumbCurl);
  thumb.base.position.set(-side * p.thumbX, p.thumbY, 0.014);
  thumb.base.rotation.set(-0.15, 0, side * p.thumbAngle);
  hand.add(thumb.base);
  const tfill = mesh(new THREE.SphereGeometry(p.thumbRad * 1.15, 12, 10));
  tfill.position.set(-side * (p.thumbX + 0.005), p.thumbY + 0.008, 0.012);
  hand.add(tfill);

  // thin rolled cuff + flat opening
  const cuff = mesh(new THREE.TorusGeometry(p.cuffR, p.cuffTube, 14, 30));
  cuff.position.set(0, -p.palmH * 0.5 - p.cuffTube * 0.4, 0);
  cuff.rotation.x = Math.PI / 2 - 0.18;
  hand.add(cuff);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(p.cuffR - p.cuffTube * 0.5, 24), holeMat);
  hole.position.copy(cuff.position); hole.position.z += 0.002; hole.rotation.x = Math.PI / 2 - 0.18;
  hand.add(hole);

  // darts on the flat back (z = +palmD/2), long thin slits, fanned
  const backZ = p.palmD / 2 + 0.002;
  const dxs = [-p.dartSpread, 0, p.dartSpread];
  const dfan = [p.dartFan, 0, -p.dartFan];
  dxs.forEach((dx, i) => {
    const d = new THREE.Mesh(new THREE.CapsuleGeometry(p.dartRad, p.dartLen, 6, 12), dartMat);
    d.scale.z = 0.35;
    d.position.set(dx, p.dartY, backZ);
    d.rotation.z = dfan[i];
    hand.add(d);
  });

  // expose joints for animation (finger/knuckle flex during the shot)
  hand.userData.fingers = fingers;
  hand.userData.thumb = thumb;
  return hand;
}

// Drive finger/knuckle curl. curl 1 = fully wrapped (rest), 0 = extended (flick).
export function setHandCurl(hand, p, curl) {
  const u = hand.userData;
  if (!u || !u.fingers) return;
  for (const f of u.fingers) {
    f.base.rotation.x = -p.fingerBaseCurl * curl;
    f.mid.rotation.x = -p.fingerMidCurl * curl;
  }
  if (u.thumb) u.thumb.mid.rotation.x = -p.thumbCurl * curl;
}
