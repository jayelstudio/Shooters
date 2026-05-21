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
    // Small, chubby child hands: short fingers, soft round palms.
    const skin = new THREE.MeshStandardMaterial({ color: 0xe7af89, roughness: 0.82, metalness: 0 });

    const makeHand = (side) => {
      const hand = new THREE.Group();

      // palm — thin slab whose wide face turns inward toward the ball
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.085, 0.078), skin);
      hand.add(palm);

      // soft heel of the palm (chubby)
      const heel = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), skin);
      heel.scale.set(0.46, 0.62, 1.0);
      heel.position.set(0, -0.03, 0);
      hand.add(heel);

      // four short, fat fingers spread across the top of the palm
      for (let i = 0; i < 4; i++) {
        const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.03, 4, 8), skin);
        f.position.set(0, 0.07, -0.027 + i * 0.018);
        f.rotation.z = side * 0.5;   // curl inward, over the ball
        f.rotation.x = -0.25;        // drape over the top
        hand.add(f);
      }

      // stubby thumb on the near side of the palm
      const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.026, 4, 8), skin);
      thumb.position.set(0, 0.0, 0.047);
      thumb.rotation.x = 0.9;
      thumb.rotation.z = side * 0.4;
      hand.add(thumb);

      // thin child forearm receding down and toward the camera
      const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.26, 6, 12), skin);
      fore.position.set(0, -0.2, 0.06);
      fore.rotation.x = 0.32;
      hand.add(fore);

      hand.traverse((o) => { if (o.isMesh) o.castShadow = true; });
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
