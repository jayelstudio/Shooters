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

    // pose: 0 = rest, 1 = raised set point. ft: follow-through snap (1 -> 0 after release)
    this.pose = 0;
    this.targetPose = 0;
    this.ft = 0;

    const s = this.spots[this.index];
    camera.position.set(s.x, s.y, s.z);
    camera.lookAt(this.lookTarget);
  }

  _buildArms() {
    // White gloves: soft smooth shading, no outline, three dark darts, a cuff.
    const glove = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.9, metalness: 0 });
    const dartMat = new THREE.MeshBasicMaterial({ color: 0x111111, toneMapped: false });

    const addTo = (parent, geo, pos, rot, scale) => {
      const m = new THREE.Mesh(geo, glove);
      if (pos) m.position.set(pos[0], pos[1], pos[2]);
      if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
      if (scale) m.scale.set(scale[0], scale[1], scale[2]);
      m.castShadow = true;
      parent.add(m);
    };

    const fProx = new THREE.CapsuleGeometry(0.019, 0.026, 6, 12);
    const fDist = new THREE.CapsuleGeometry(0.017, 0.02, 6, 12);

    // a two-segment digit that curls toward the palm (-z) so it wraps the ball
    const makeDigit = (curl) => {
      const f = new THREE.Group();
      addTo(f, fProx, [0, 0.02, 0]);
      const tip = new THREE.Group();
      tip.position.set(0, 0.04, 0);
      tip.rotation.x = -curl; // bend at the knuckle toward the palm
      addTo(tip, fDist, [0, 0.016, 0]);
      f.add(tip);
      return f;
    };

    const makeGlove = (side) => {
      const hand = new THREE.Group();
      const palm = new THREE.SphereGeometry(0.058, 16, 12);
      const cuff = new THREE.CylinderGeometry(0.05, 0.05, 0.03, 16);

      // puffy rounded palm; back (with darts) faces +z, palm faces -z
      addTo(hand, palm, [0, 0, 0], null, [1.1, 0.95, 0.72]);

      // four fingers, spread wide and lying along the ball's surface (gentle cup)
      const fx = [-0.042, -0.014, 0.014, 0.042];
      for (let i = 0; i < 4; i++) {
        const f = makeDigit(0.38);
        f.position.set(fx[i], 0.048, 0.006);
        f.rotation.set(-0.18, 0, -Math.sign(fx[i]) * (0.22 + Math.abs(i - 1.5) * 0.06));
        hand.add(f);
      }

      // thumb (also a curling digit) on the inner side
      const thumb = makeDigit(0.35);
      thumb.scale.set(1.15, 0.9, 1.15);
      thumb.position.set(-side * 0.05, -0.005, 0.012);
      thumb.rotation.set(-0.12, 0, side * 1.05);
      hand.add(thumb);

      // rolled cuff at the wrist
      addTo(hand, cuff, [0, -0.062, 0]);

      // three black darts on the back of the hand
      const dgeo = new THREE.CapsuleGeometry(0.0045, 0.024, 4, 8);
      const dx = [-0.02, 0, 0.02];
      const dz = [0.22, 0, -0.22];
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(dgeo, dartMat);
        m.position.set(dx[i], 0.014, 0.045);
        m.rotation.set(0, 0, dz[i]);
        hand.add(m);
      }
      return hand;
    };

    this.leftHand = makeGlove(-1);
    this.rightHand = makeGlove(1);
    this.leftHand.scale.setScalar(0.8);  // 20% smaller
    this.rightHand.scale.setScalar(0.8);
    this.arms.add(this.leftHand, this.rightHand);
    this._applyArmPose(0);
  }

  // Both gloves grip the ball from the sides (palms turned onto it, fingers
  // spread over the top, thumbs toward each other) per the reference grip.
  // The right (shooting) hand snaps up/forward on release; the left peels off.
  _applyArmPose(p) {
    const ft = this.ft;
    const by = THREE.MathUtils.lerp(-0.38, -0.12, p);
    const bz = THREE.MathUtils.lerp(-0.71, -0.66, p);
    const tiltOver = -0.35 - p * 0.1; // fingers tip back over the top of the ball

    // LEFT (guide) glove: grips the left side; peels away on release
    this.leftHand.position.set(-0.12 - ft * 0.12, by - 0.02 - ft * 0.05, bz + 0.05);
    this.leftHand.rotation.set(tiltOver, -1.15 - ft * 0.3, -0.08 + ft * 0.35);

    // RIGHT (shooting) glove: palm resting on the front-center of the ball,
    // wrist rotated back a touch; gooseneck snap up/forward on release
    this.rightHand.position.set(0.045, by - 0.03 + ft * 0.20, bz + 0.155 - ft * 0.04);
    this.rightHand.rotation.set(tiltOver + 0.22 + ft * 1.2, 0.4 - ft * 0.4, 0.05 - ft * 0.2);
  }

  // Kick off the release follow-through (decays back to 0 in update()).
  startFollowThrough() { this.ft = 1; }

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

    // smooth arm pose + decaying follow-through snap
    this.pose += (this.targetPose - this.pose) * (1 - Math.pow(0.0001, dt));
    if (this.ft > 0) this.ft = Math.max(0, this.ft - dt * 2.4);
    this._applyArmPose(this.pose);
  }
}
