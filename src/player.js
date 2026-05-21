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
    // Cartoon look: flat cel shading + bold dark outlines (inverted hull),
    // with soft rounded forms for chubby child hands.
    const ramp = new Uint8Array([70, 140, 235, 255]); // 4-band toon ramp
    const gradient = new THREE.DataTexture(ramp, ramp.length, 1, THREE.RedFormat);
    gradient.needsUpdate = true;
    gradient.minFilter = gradient.magFilter = THREE.NearestFilter;

    const skin = new THREE.MeshToonMaterial({ color: 0xf3b78c, gradientMap: gradient });
    const outline = new THREE.MeshBasicMaterial({ color: 0x2b1a10, side: THREE.BackSide });
    const shineMat = new THREE.MeshBasicMaterial({ color: 0xffe3c6, toneMapped: false });
    const creaseMat = new THREE.MeshBasicMaterial({ color: 0xb9794f, toneMapped: false });
    const OUTLINE = 1.2;

    const makeHand = (side) => {
      const hand = new THREE.Group();
      // each part is drawn twice: cel-shaded skin + a slightly larger dark shell
      const add = (geo, pos, rot, scale) => {
        const m = new THREE.Mesh(geo, skin);
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

      const ball = new THREE.SphereGeometry(0.05, 16, 12);
      const finger = new THREE.CapsuleGeometry(0.016, 0.026, 6, 12);
      const thumb = new THREE.CapsuleGeometry(0.018, 0.02, 6, 12);
      const fore = new THREE.CapsuleGeometry(0.034, 0.24, 8, 14);

      // rounded palm (thin in x, tall in y, wide in z), facing inward
      add(ball, [0, 0, 0], null, [0.6, 1.2, 1.0]);
      // four short chubby fingers curling inward over the ball
      for (let i = 0; i < 4; i++) {
        add(finger, [0, 0.072, -0.027 + i * 0.018], [-0.2, 0, side * 0.5]);
      }
      // stubby thumb on the near side
      add(thumb, [0, 0.0, 0.05], [0.9, 0, side * 0.45]);
      // thin child forearm receding down and toward the camera
      add(fore, [0, -0.2, 0.06], [0.32, 0, 0]);

      // --- flat cartoon details on the back of the hand (no outline) ---
      const detail = (geo, mat, pos, rot, scale) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(pos[0], pos[1], pos[2]);
        if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
        if (scale) m.scale.set(scale[0], scale[1], scale[2]);
        hand.add(m);
      };
      const bx = side * 0.032; // back-of-hand surface that faces the camera
      const knuckle = new THREE.SphereGeometry(0.011, 10, 8);
      for (let i = 0; i < 4; i++) detail(knuckle, skin, [bx, 0.052, -0.027 + i * 0.018]);
      // knuckle crease across the back of the hand
      detail(new THREE.CapsuleGeometry(0.004, 0.05, 4, 8), creaseMat, [bx, 0.04, 0], [Math.PI / 2, 0, 0]);
      // flat illustrated highlight
      detail(new THREE.SphereGeometry(0.02, 12, 10), shineMat, [bx + side * 0.002, 0.01, 0.008], null, [0.25, 0.95, 0.7]);

      return hand;
    };

    this.leftHand = makeHand(-1);
    this.rightHand = makeHand(1);
    this.arms.add(this.leftHand, this.rightHand);
    this._applyArmPose(0);
  }

  // Place both hands flanking the ball; raise them with the shot pose.
  _applyArmPose(p) {
    const by = THREE.MathUtils.lerp(-0.38, -0.12, p);
    const bz = THREE.MathUtils.lerp(-0.71, -0.66, p);
    const hx = 0.10;
    this.leftHand.position.set(-hx, by - 0.04, bz + 0.04);
    this.rightHand.position.set(hx, by - 0.04, bz + 0.04);
    const tilt = -0.1 - p * 0.35;
    this.leftHand.rotation.set(tilt, -0.18, 0);
    this.rightHand.rotation.set(tilt, 0.18, 0);
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
