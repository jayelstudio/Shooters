import * as THREE from 'three';
import { CONFIG, D2R } from './config.js';
import { skinMaterial } from './materials.js';

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
    const mat = skinMaterial();
    const sleeve = new THREE.MeshStandardMaterial({ color: 0xb02a37, roughness: 0.6 });

    const makeArm = (side) => {
      const arm = new THREE.Group();
      // upper sleeve
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.085, 0.42, 12), sleeve);
      upper.position.set(0, -0.21, 0);
      arm.add(upper);
      // forearm
      const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.4, 12), mat);
      fore.position.set(0, 0.2, 0);
      arm.add(fore);
      // hand
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), mat);
      hand.scale.set(1, 0.7, 1.1);
      hand.position.set(0, 0.42, 0);
      arm.add(hand);
      arm.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      arm.userData.side = side;
      return arm;
    };

    this.leftArm = makeArm(-1);
    this.rightArm = makeArm(1);
    this.arms.add(this.leftArm, this.rightArm);
    this._applyArmPose(0);
  }

  // Interpolated arm placement in camera-local space.
  _applyArmPose(p) {
    // rest: hands low and wide; raised: hands up near top-center (shooting set point)
    const restL = new THREE.Vector3(-0.34, -0.78, -0.55);
    const raisedL = new THREE.Vector3(-0.16, -0.30, -0.62);
    const restR = new THREE.Vector3(0.34, -0.78, -0.55);
    const raisedR = new THREE.Vector3(0.16, -0.30, -0.62);

    this.leftArm.position.lerpVectors(restL, raisedL, p);
    this.rightArm.position.lerpVectors(restR, raisedR, p);
    // rotate forearms upward as they raise
    this.leftArm.rotation.set(-0.5 - p * 0.9, 0.25 - p * 0.25, 0.15 - p * 0.15);
    this.rightArm.rotation.set(-0.5 - p * 0.9, -0.25 + p * 0.25, -0.15 + p * 0.15);
  }

  // World-space point where the ball sits in the hands, given pose p.
  handBallPosition(p, out = new THREE.Vector3()) {
    const low = new THREE.Vector3(0, -0.62, -0.62);
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
