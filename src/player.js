import * as THREE from 'three';
import { CONFIG, D2R } from './config.js';

// Computes the 5 shooting-spot positions along the 3pt arc.
export function buildSpots() {
  const { rim, spotRadius, spotAnglesDeg, eyeHeight } = CONFIG;
  return spotAnglesDeg.map((deg) => {
    const a = deg * D2R;
    const x = rim.center.x + spotRadius * Math.sin(a);
    const z = rim.center.z + spotRadius * Math.cos(a);
    return { x, y: eyeHeight, z, angle: a };
  });
}

export class Player {
  constructor(camera) {
    this.camera = camera;
    this.spots = buildSpots();
    this.index = 2; // start center
    this.target = new THREE.Vector3();
    this.lookTarget = new THREE.Vector3(CONFIG.rim.center.x, 2.45, CONFIG.rim.center.z);

    // Arms rig parented to the camera so they stay in view.
    this.arms = new THREE.Group();
    camera.add(this.arms);
    this._buildArms();

    // pose: 0 = rest/dribble-ready, 1 = fully raised (release follow-through)
    this.pose = 0;
    this.targetPose = 0;

    const s = this.spots[this.index];
    camera.position.set(s.x, s.y, s.z);
    camera.lookAt(this.lookTarget);
  }

  _buildArms() {
    // Cartoon white gloves (Mickey style): cel shading + bold dark outline,
    // puffy rounded forms, three dark darts on the back, a rolled cuff.
    const ramp = new Uint8Array([110, 180, 245, 255]); // 4-band toon ramp (kept bright for white)
    const gradient = new THREE.DataTexture(ramp, ramp.length, 1, THREE.RedFormat);
    gradient.needsUpdate = true;
    gradient.minFilter = gradient.magFilter = THREE.NearestFilter;

    const glove = new THREE.MeshToonMaterial({ color: 0xf4f4f4, gradientMap: gradient });
    const outline = new THREE.MeshBasicMaterial({ color: 0x141414, side: THREE.BackSide });
    const dartMat = new THREE.MeshBasicMaterial({ color: 0x111111, toneMapped: false });
    const OUTLINE = 1.16;

    const makeGlove = (side) => {
      const hand = new THREE.Group();
      // glove part: drawn twice (white toon + slightly larger dark shell for the outline)
      const add = (geo, pos, rot, scale) => {
        const m = new THREE.Mesh(geo, glove);
        m.position.set(pos[0], pos[1], pos[2]);
        if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
        if (scale) m.scale.set(scale[0], scale[1], scale[2]);
        m.castShadow = true;
        hand.add(m);
        const o = new THREE.Mesh(geo, outline);
        o.position.copy(m.position);
        o.rotation.copy(m.rotation);
        o.scale.copy(m.scale).multiplyScalar(OUTLINE);
        hand.add(o);
      };
      const dart = (geo, pos, rot) => {
        const m = new THREE.Mesh(geo, dartMat);
        m.position.set(pos[0], pos[1], pos[2]);
        if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
        hand.add(m);
      };

      const palm = new THREE.SphereGeometry(0.058, 16, 12);
      const finger = new THREE.CapsuleGeometry(0.02, 0.045, 6, 12);
      const thumbG = new THREE.CapsuleGeometry(0.022, 0.036, 6, 12);
      const cuff = new THREE.CylinderGeometry(0.052, 0.052, 0.03, 16);

      // puffy rounded palm (back faces +z), four fat fingers, fat thumb
      add(palm, [0, 0, 0], null, [1.1, 0.95, 0.72]);
      const fx = [-0.036, -0.012, 0.012, 0.036];
      for (let i = 0; i < 4; i++) add(finger, [fx[i], 0.078, 0], [0, 0, -Math.sign(fx[i]) * 0.12]);
      add(thumbG, [-side * 0.05, 0.01, 0.012], [0.2, 0, side * 0.9]);
      // rolled cuff at the wrist
      add(cuff, [0, -0.062, 0], null, null);

      // three black darts on the back of the hand
      const dgeo = new THREE.CapsuleGeometry(0.0045, 0.024, 4, 8);
      const dx = [-0.02, 0, 0.02];
      const dz = [0.22, 0, -0.22];
      for (let i = 0; i < 3; i++) dart(dgeo, [dx[i], 0.014, 0.045], [0, 0, dz[i]]);

      return hand;
    };

    this.leftHand = makeGlove(-1);
    this.rightHand = makeGlove(1);
    this.arms.add(this.leftHand, this.rightHand);
    this._applyArmPose(0);
  }

  // Left glove cups the ball from the side; right glove rests on top of it.
  _applyArmPose(p) {
    const by = THREE.MathUtils.lerp(-0.38, -0.12, p);
    const bz = THREE.MathUtils.lerp(-0.71, -0.66, p);
    // left: beside the ball, fingers up (stays put)
    this.leftHand.position.set(-0.12, by - 0.03, bz + 0.04);
    this.leftHand.rotation.set(-0.1 - p * 0.3, -0.18, 0);
    // right: on top of the ball, fingers draping over the far side
    this.rightHand.position.set(0.01, by + 0.11, bz - 0.01);
    this.rightHand.rotation.set(-1.95 - p * 0.1, 0.0, 0.12);
  }

  // World-space point where the ball sits in the hands, given pose p.
  handBallPosition(p, out = new THREE.Vector3()) {
    const low = new THREE.Vector3(0, -0.38, -0.71);
    const high = new THREE.Vector3(0, -0.12, -0.66);
    out.lerpVectors(low, high, p);
    this.camera.localToWorld(out);
    return out;
  }

  moveLeft() { this._moveTo(Math.max(0, this.index - 1)); }
  moveRight() { this._moveTo(Math.min(this.spots.length - 1, this.index + 1)); }

  _moveTo(i) {
    if (i === this.index) return false;
    this.index = i;
    this._moving = true;
    return true;
  }

  setPose(target) { this.targetPose = target; }

  currentSpot() { return this.spots[this.index]; }

  update(dt) {
    const s = this.spots[this.index];
    this.target.set(s.x, s.y, s.z);
    // smooth glide to the active spot
    this.camera.position.lerp(this.target, 1 - Math.pow(0.0008, dt));
    this.camera.lookAt(this.lookTarget);

    // smooth arm pose
    this.pose += (this.targetPose - this.pose) * (1 - Math.pow(0.0001, dt));
    this._applyArmPose(this.pose);
  }
}
