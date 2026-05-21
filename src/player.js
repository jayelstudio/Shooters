import * as THREE from 'three';
import { CONFIG, D2R } from './config.js';

// Rigged glTF hands (no baked animation -> moved as a whole). Tunable.
const HAND_MODEL_URL = './8.glb';
const HAND_MODEL_SCALE = 0.5;          // target max dimension in world units
const HAND_MODEL_ROT = [0, 0, 0];      // orientation tuning (radians)
const HAND_MODEL_OFFSET = [0, -0.05, 0.05]; // offset from the ball center

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
    this.useModel = false;
    this._loadHandModel();

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

    // a tapered finger: rounded base + cone + rounded tip (tip thinner than base)
    const makeFinger = (rBase, rTip, len) => {
      const f = new THREE.Group();
      addTo(f, new THREE.CylinderGeometry(rTip, rBase, len, 14, 1), [0, len / 2, 0]);
      addTo(f, new THREE.SphereGeometry(rTip, 12, 10), [0, len, 0]);
      addTo(f, new THREE.SphereGeometry(rBase, 12, 10), [0, 0, 0]);
      return f;
    };

    const makeGlove = (side) => {
      const hand = new THREE.Group();
      const palm = new THREE.SphereGeometry(0.06, 20, 16);
      const cuffGeo = new THREE.SphereGeometry(0.05, 16, 12);

      // slimmer rounded palm (back +z faces camera, palm -z toward ball)
      addTo(hand, palm, [0, 0, 0], null, [1.08, 0.98, 0.6]);

      // four slim, tapered fingers, bases sunk into the palm so they connect
      const fx = [-0.034, -0.011, 0.011, 0.034];
      for (let i = 0; i < 4; i++) {
        const f = makeFinger(0.0165, 0.0105, 0.088);
        f.position.set(fx[i], 0.05, 0.004);
        f.rotation.set(-0.2, 0, -Math.sign(fx[i]) * (0.14 + Math.abs(i - 1.5) * 0.05));
        hand.add(f);
      }

      // tapered thumb sunk into the inner side of the palm
      const thumb = makeFinger(0.019, 0.012, 0.058);
      thumb.position.set(-side * 0.048, 0.004, 0.02);
      thumb.rotation.set(0.15, 0, side * 1.15);
      hand.add(thumb);

      // slim rounded cuff blended into the wrist
      addTo(hand, cuffGeo, [0, -0.055, -0.004], null, [1.0, 0.6, 0.72]);

      // three black darts on the back of the hand
      const dgeo = new THREE.CapsuleGeometry(0.0045, 0.024, 4, 8);
      const dx = [-0.02, 0, 0.02];
      const dz = [0.22, 0, -0.22];
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(dgeo, dartMat);
        m.position.set(dx[i], 0.014, 0.038);
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

    // Rigged glTF hands: move the whole model with the shot (no finger flex).
    if (this.useModel && this.handsModel) {
      this.handsModel.position.set(
        HAND_MODEL_OFFSET[0],
        by + HAND_MODEL_OFFSET[1] + ft * 0.18,
        bz + HAND_MODEL_OFFSET[2] - ft * 0.05
      );
      this.handsModel.rotation.set(HAND_MODEL_ROT[0] + ft * 0.5, HAND_MODEL_ROT[1], HAND_MODEL_ROT[2]);
      return;
    }

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

  // Load the rigged glTF hands; on success swap out the procedural gloves.
  async _loadHandModel() {
    try {
      const { GLTFLoader } = await import(
        'https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/loaders/GLTFLoader.js'
      );
      const gltf = await new GLTFLoader().loadAsync(HAND_MODEL_URL);
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3(); box.getSize(size);
      const center = new THREE.Vector3(); box.getCenter(center);
      model.position.sub(center);
      model.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      const wrap = new THREE.Group();
      wrap.add(model);
      wrap.scale.setScalar(HAND_MODEL_SCALE / Math.max(size.x, size.y, size.z));

      this.arms.remove(this.leftHand, this.rightHand);
      this.handsModel = wrap;
      this.arms.add(wrap);
      this.useModel = true;
      this._applyArmPose(this.pose);
    } catch (e) {
      console.warn('Hand model load failed; keeping procedural gloves.', e);
    }
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

    // smooth arm pose + decaying follow-through snap
    this.pose += (this.targetPose - this.pose) * (1 - Math.pow(0.0001, dt));
    if (this.ft > 0) this.ft = Math.max(0, this.ft - dt * 2.4);
    this._applyArmPose(this.pose);
  }
}
