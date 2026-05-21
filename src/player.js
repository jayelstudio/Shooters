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

    const makeGlove = (side) => {
      const hand = new THREE.Group();
      const palm = new THREE.SphereGeometry(0.066, 20, 16);
      const fingerGeo = new THREE.CapsuleGeometry(0.023, 0.05, 8, 16);
      const cuffGeo = new THREE.SphereGeometry(0.055, 16, 12);

      // rounded mitten palm (back +z faces camera, palm -z toward ball)
      addTo(hand, palm, [0, 0, 0], null, [1.18, 1.0, 0.8]);

      // four smooth fingers, close together with their bases sunk into the palm
      // so they read as one connected glove (small grooves between them)
      const fx = [-0.039, -0.013, 0.013, 0.039];
      for (let i = 0; i < 4; i++) {
        addTo(hand, fingerGeo, [fx[i], 0.07, 0.004],
          [-0.2, 0, -Math.sign(fx[i]) * (0.14 + Math.abs(i - 1.5) * 0.05)],
          [0.92, 1.0, 0.92]);
      }

      // thumb sunk into the inner side of the palm
      addTo(hand, fingerGeo, [-side * 0.055, 0.006, 0.02], [0.15, 0, side * 1.15], [1.0, 0.82, 1.0]);

      // rounded cuff blended into the wrist
      addTo(hand, cuffGeo, [0, -0.058, -0.004], null, [1.08, 0.62, 0.96]);

      // three black darts on the back of the hand
      const dgeo = new THREE.CapsuleGeometry(0.0045, 0.024, 4, 8);
      const dx = [-0.02, 0, 0.02];
      const dz = [0.22, 0, -0.22];
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(dgeo, dartMat);
        m.position.set(dx[i], 0.014, 0.046);
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
