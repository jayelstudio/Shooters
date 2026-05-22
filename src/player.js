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
    this._buildBlendedGloves(); // fuse the glove parts into one smooth surface

    const s = this.spots[this.index];
    camera.position.set(s.x, s.y, s.z);
    camera.lookAt(this.lookTarget);
  }

  _buildArms() {
    // Mickey-style white gloves: smooth matte white, three dark darts, rolled cuff.
    const glove = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.82, metalness: 0 });
    const dartMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.7 });
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a, side: THREE.DoubleSide });
    this.gloveMat = glove; this.dartMat = dartMat; this.holeMat = holeMat;

    const addTo = (parent, geo, pos, rot, scale) => {
      const m = new THREE.Mesh(geo, glove);
      if (pos) m.position.set(pos[0], pos[1], pos[2]);
      if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
      if (scale) m.scale.set(scale[0], scale[1], scale[2]);
      m.castShadow = true;
      parent.add(m);
    };

    // a plump rounded finger (fat capsule with rounded tip), pivot at the base
    const fingerGeo = new THREE.CapsuleGeometry(0.024, 0.05, 10, 18);
    const makeFinger = (geo) => {
      const f = new THREE.Group();
      addTo(f, geo, [0, 0.028, 0]); // base sits at the group's pivot
      return f;
    };

    const makeGlove = (side) => {
      const hand = new THREE.Group();

      // plump rounded hand mass (back +z faces camera, palm -z toward the ball)
      addTo(hand, new THREE.SphereGeometry(0.062, 24, 18), [0, 0, 0], null, [1.3, 1.18, 0.74]);

      // three plump fingers, bases sunk into the hand, gentle cup curl + slight fan
      const fx = [-0.032, 0, 0.032];
      for (let i = 0; i < 3; i++) {
        const f = makeFinger(fingerGeo);
        f.position.set(fx[i], 0.055, 0.005);
        f.rotation.set(-0.22, 0, -Math.sign(fx[i]) * (0.12 + Math.abs(i - 1) * 0.05));
        hand.add(f);
      }

      // plump thumb on the inner side
      const thumb = makeFinger(new THREE.CapsuleGeometry(0.026, 0.038, 10, 18));
      thumb.position.set(-side * 0.052, 0.0, 0.022);
      thumb.rotation.set(0.2, 0, side * 1.12);
      hand.add(thumb);

      // rolled cuff: a puffy torus ring at the wrist with a dark opening
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.044, 0.021, 16, 30), glove);
      cuff.position.set(0, -0.064, -0.006);
      cuff.rotation.x = Math.PI / 2 - 0.25; // opening faces down/back toward the wrist
      cuff.castShadow = true;
      hand.add(cuff);
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.034, 24), holeMat);
      hole.position.set(0, -0.07, -0.012);
      hole.rotation.x = Math.PI / 2 - 0.25;
      hand.add(hole);

      // three dark darts on the back of the hand (fanned)
      const dgeo = new THREE.CapsuleGeometry(0.005, 0.03, 6, 10);
      const dx = [-0.022, 0, 0.022];
      const dz = [0.2, 0, -0.2];
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(dgeo, dartMat);
        m.position.set(dx[i], 0.02, 0.046);
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

  // Add the rolled cuff (torus + dark opening) and three darts to a hand group,
  // A small teardrop (rounded base + pointed cone), flattened to lie on the glove.
  _teardrop(mat) {
    const g = new THREE.Group();
    const r = 0.0075;
    g.add(new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mat));
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, r * 4.2, 14), mat);
    cone.position.y = r * 2.3;
    g.add(cone);
    g.scale.set(1, 1, 0.35);
    return g;
  }

  // Fuse the palm/fingers/thumb into one smooth surface with metaballs so the
  // glove reads as a single molded piece. Falls back to the primitive gloves.
  async _buildBlendedGloves() {
    try {
      const { MarchingCubes } = await import(
        'https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/objects/MarchingCubes.js'
      );
      const left = this._makeBlendedHand(MarchingCubes, -1);
      const right = this._makeBlendedHand(MarchingCubes, 1);
      if (!left || !right) return;
      left.scale.setScalar(0.8);
      right.scale.setScalar(0.8);
      this.arms.remove(this.leftHand, this.rightHand);
      this.leftHand = left;
      this.rightHand = right;
      this.arms.add(left, right);
      this._applyArmPose(this.pose);
    } catch (e) {
      console.warn('Blended gloves unavailable; keeping primitive gloves.', e);
    }
  }

  _makeBlendedHand(MarchingCubes, side) {
    const mc = new MarchingCubes(80, this.gloveMat, true, false, 120000);
    mc.isolation = 80;
    mc.reset();
    const add = (x, y, z, s) => mc.addBall(x, y, z, s, 12);
    // palm slab
    add(0.5, 0.40, 0.5, 0.55); add(0.42, 0.40, 0.5, 0.45); add(0.58, 0.40, 0.5, 0.45);
    add(0.5, 0.45, 0.5, 0.45); add(0.46, 0.44, 0.5, 0.34); add(0.54, 0.44, 0.5, 0.34);
    // three fingers, wide spacing for deep grooves
    const fx = [0.38, 0.5, 0.62];
    const fy = [0.50, 0.555, 0.61, 0.665, 0.715];
    const fs = [0.15, 0.14, 0.13, 0.11, 0.09];
    fx.forEach((x) => fy.forEach((y, i) => add(x, y, 0.5, fs[i])));
    // thumb (mirrored per hand), bigger and angled out/forward so it reads in the grip
    add(0.5 - side * 0.12, 0.40, 0.53, 0.2);
    add(0.5 - side * 0.165, 0.44, 0.55, 0.16);
    add(0.5 - side * 0.20, 0.485, 0.57, 0.12);
    mc.update();

    // Use the MarchingCubes mesh directly (avoid fragile geometry extraction).
    const geo = mc.geometry;
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    if (!bb) return null;
    const size = new THREE.Vector3(); bb.getSize(size);
    const center = new THREE.Vector3(); bb.getCenter(center);
    const maxd = Math.max(size.x, size.y, size.z);
    if (!(maxd > 0) || !isFinite(maxd)) return null;
    const s = 0.3 / maxd;            // target max dimension
    const sx = s * 0.765, sz = s * 0.765; // ~25% thinner in width and depth

    mc.position.set(-center.x, -center.y, -center.z);
    mc.castShadow = true;
    const inner = new THREE.Group();
    inner.add(mc);
    inner.scale.set(sx, s, sz);

    const hand = new THREE.Group();
    hand.add(inner);

    // small rolled cuff at the wrist (sized from width, not height)
    const W = size.x * sx, Hh = size.y * s;
    const cuffR = W * 0.34, tube = W * 0.13, bottomY = -Hh / 2;
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(cuffR, tube, 14, 28), this.gloveMat);
    cuff.position.set(0, bottomY + tube * 0.5, 0);
    cuff.rotation.x = Math.PI / 2 - 0.2;
    cuff.castShadow = true;
    hand.add(cuff);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(cuffR * 0.8, 22), this.holeMat);
    hole.position.set(0, bottomY + tube * 0.2, 0.004);
    hole.rotation.x = Math.PI / 2 - 0.2;
    hand.add(hole);

    // teardrop darts placed on the actual back surface via raycast
    hand.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    const spots = [[-0.028, 0.03], [0, 0.045], [0.028, 0.03]];
    const fan = [0.22, 0, -0.22];
    spots.forEach(([dxv, dyv], i) => {
      ray.set(new THREE.Vector3(dxv, dyv, 0.6), new THREE.Vector3(0, 0, -1));
      const hit = ray.intersectObject(mc, false)[0];
      if (!hit) return;
      const n = hit.face.normal.clone().transformDirection(mc.matrixWorld).normalize();
      const d = this._teardrop(this.dartMat);
      d.position.copy(hit.point).addScaledVector(n, 0.002);
      d.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
      d.rotateZ(fan[i]);
      hand.add(d);
    });
    return hand;
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
