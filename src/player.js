import * as THREE from 'three';
import { CONFIG, D2R, HAND_LAYER } from './config.js';
import { buildHand, DEFAULT_P, setHandCurl } from './glovebuild.js';

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

    // shot zoom: brief camera dolly toward the rim on release
    this.shotZoom = 0;
    this._zoomT = 0;
    this._zooming = false;
    this._fwd = new THREE.Vector3();

    const s = this.spots[this.index];
    camera.position.set(s.x, s.y, s.z);
    camera.lookAt(this.lookTarget);
  }

  _buildArms() {
    // Clean parametric Mickey gloves (shared builder; tuned in preview/hands.html).
    this.leftHand = buildHand(DEFAULT_P, -1);
    this.rightHand = buildHand(DEFAULT_P, 1);
    this.leftHand.scale.setScalar(0.85);
    this.rightHand.scale.setScalar(0.85);
    this.arms.add(this.leftHand, this.rightHand);
    // also light the gloves with the dedicated hand/ball shadow light
    for (const h of [this.leftHand, this.rightHand]) {
      h.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.layers.enable(HAND_LAYER); } });
    }
    this._applyArmPose(0);

    // Dedicated light over the hands so the gloves cast crisp shadows onto the
    // ball. Isolated to HAND_LAYER so it doesn't brighten the rest of the court.
    const hl = new THREE.DirectionalLight(0xffffff, 1.4);
    hl.layers.set(HAND_LAYER);
    hl.castShadow = true;
    hl.position.set(0.32, 0.12, -0.26);   // camera-local: above & toward the front
    hl.target.position.set(0, -0.38, -0.71); // camera-local: the held-ball spot
    const sh = hl.shadow;
    sh.mapSize.set(1024, 1024);
    sh.camera.near = 0.05; sh.camera.far = 1.6;
    sh.camera.left = -0.32; sh.camera.right = 0.32; sh.camera.top = 0.32; sh.camera.bottom = -0.32;
    sh.bias = -0.0008;
    this.camera.add(hl);
    this.camera.add(hl.target);
    this.handLight = hl;
  }

  // Both gloves grip the ball from the sides (palms turned onto it, fingers
  // spread over the top, thumbs toward each other) per the reference grip.
  // The right (shooting) hand snaps up/forward on release; the left peels off.
  _applyArmPose(p) {
    const ft = this.ft;
    const by = THREE.MathUtils.lerp(-0.342, -0.108, p); // raised 10%
    const bz = THREE.MathUtils.lerp(-0.71, -0.66, p);
    const tiltOver = -0.35 - p * 0.1; // fingers tip back over the top of the ball

    // LEFT (guide) glove: grips the left side; peels away on release
    this.leftHand.position.set(-0.12 - ft * 0.12, by - 0.02 - ft * 0.05, bz + 0.05);
    this.leftHand.rotation.set(tiltOver, -1.15 - ft * 0.3, -0.08 + ft * 0.35);

    // RIGHT (shooting) glove: palm resting on the front-center of the ball,
    // wrist rotated back a touch; gooseneck snap up/forward on release
    this.rightHand.position.set(0.045, by - 0.03 + ft * 0.20, bz + 0.155 - ft * 0.04);
    this.rightHand.rotation.set(tiltOver + 0.22 + ft * 1.2, 0.4 - ft * 0.4, 0.05 - ft * 0.2);

    // fingers wrap the ball at rest and flick straighter on the release snap
    const curl = 1 - 0.55 * ft;
    setHandCurl(this.leftHand, DEFAULT_P, curl);
    setHandCurl(this.rightHand, DEFAULT_P, curl);
  }

  // Kick off the release follow-through (decays back to 0 in update()).
  startFollowThrough() { this.ft = 1; }

  // Kick off a subtle dolly toward the rim (eases in then back out).
  startShotZoom() { this._zoomT = 0; this._zooming = true; }

  // World-space point where the ball sits in the hands, given pose p.
  handBallPosition(p, out = new THREE.Vector3()) {
    const low = new THREE.Vector3(0, -0.342, -0.71);
    const high = new THREE.Vector3(0, -0.108, -0.66);
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

    // shot zoom: ease a dolly in toward the rim (~20% of the way) then back out
    if (this._zooming) {
      this._zoomT += dt / 1.3;
      if (this._zoomT >= 1) { this._zooming = false; this.shotZoom = 0; }
      else this.shotZoom = Math.sin(this._zoomT * Math.PI);
    }
    if (this.shotZoom > 0) {
      this._fwd.set(this.lookTarget.x - this.camera.position.x, 0, this.lookTarget.z - this.camera.position.z);
      const distH = this._fwd.length();
      if (distH > 0.001) this.camera.position.addScaledVector(this._fwd.multiplyScalar(1 / distH), this.shotZoom * 0.2 * distH);
    }
    this.camera.lookAt(this.lookTarget);

    // smooth arm pose + decaying follow-through snap
    this.pose += (this.targetPose - this.pose) * (1 - Math.pow(0.0001, dt));
    if (this.ft > 0) this.ft = Math.max(0, this.ft - dt * 2.4);
    this._applyArmPose(this.pose);
  }
}
