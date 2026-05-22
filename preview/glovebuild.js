import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Single source of truth for the glove shape (used by preview, tuner, and game).
export const DEFAULT_P = {
  palmW: 0.135, palmH: 0.12, palmD: 0.072, palmR: 0.032,
  fingerCount: 3, fingerLen: 0.115, fingerRad: 0.031, fingerSpread: 0.05, fingerFan: 0.1, fingerTilt: -0.12,
  knuckleRad: 0.033,
  thumbLen: 0.075, thumbRad: 0.034, thumbAngle: 0.8, thumbX: 0.04, thumbY: -0.005,
  cuffR: 0.062, cuffTube: 0.016,
  dartLen: 0.058, dartRad: 0.0062, dartSpread: 0.027, dartY: 0.012, dartFan: 0.16,
};

const glove = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.8, metalness: 0 });
const dartMat = new THREE.MeshStandardMaterial({ color: 0x202020, roughness: 0.6 });
const holeMat = new THREE.MeshBasicMaterial({ color: 0x141414, side: THREE.DoubleSide });

// Build one glove (clean parametric parts). side: -1 left, +1 right.
export function buildHand(p, side) {
  const hand = new THREE.Group();
  const mesh = (geo) => { const m = new THREE.Mesh(geo, glove); m.castShadow = true; return m; };

  // palm (rounded box; back faces +z, palm -z)
  hand.add(mesh(new RoundedBoxGeometry(p.palmW, p.palmH, p.palmD, 5, p.palmR)));
  // knuckle fillet across the top so finger bases fuse smoothly
  const knuck = mesh(new THREE.CapsuleGeometry(p.knuckleRad, p.palmW * 0.62, 6, 14));
  knuck.rotation.z = Math.PI / 2; knuck.position.set(0, p.palmH * 0.42, 0.004);
  hand.add(knuck);

  // fingers
  const baseY = p.palmH * 0.42;
  const n = p.fingerCount;
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * p.fingerSpread;
    const f = new THREE.Group();
    const cap = mesh(new THREE.CapsuleGeometry(p.fingerRad, p.fingerLen, 8, 16));
    cap.position.y = p.fingerLen / 2 + p.fingerRad;
    f.add(cap);
    f.position.set(x, baseY, 0.006);
    f.rotation.z = -Math.sign(x || 1) * (Math.abs(x) / p.fingerSpread) * p.fingerFan;
    f.rotation.x = p.fingerTilt;
    hand.add(f);
  }

  // thumb (overlaps the palm to connect, plus a base fillet)
  const thumb = new THREE.Group();
  const tcap = mesh(new THREE.CapsuleGeometry(p.thumbRad, p.thumbLen, 8, 16));
  tcap.position.y = p.thumbLen / 2;
  thumb.add(tcap);
  thumb.position.set(-side * p.thumbX, p.thumbY, 0.014);
  thumb.rotation.z = side * p.thumbAngle;
  thumb.rotation.x = -0.15;
  hand.add(thumb);
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
  return hand;
}
