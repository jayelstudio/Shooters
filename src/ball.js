import * as THREE from 'three';
import { CONFIG, HAND_LAYER } from './config.js';
import { ballTextures } from './materials.js';

const STATE = { HELD: 'held', FLYING: 'flying', DEAD: 'dead' };

export class Ball {
  constructor(scene, player, audio) {
    this.scene = scene;
    this.player = player;
    this.audio = audio;
    this.r = CONFIG.ball.radius;

    // Visual root group (physics moves this); the textured sphere is its child
    // so backspin (on the group) stays independent of the seam orientation.
    this.mesh = new THREE.Group();
    const ballTex = ballTextures();           // thick procedural seams
    const ramp = new Uint8Array([195, 230, 255]); // bright toon ramp
    const grad = new THREE.DataTexture(ramp, ramp.length, 1, THREE.RedFormat);
    grad.needsUpdate = true;
    grad.minFilter = grad.magFilter = THREE.NearestFilter;
    const mat = new THREE.MeshToonMaterial({
      map: ballTex, gradientMap: grad,
      emissive: 0xffffff, emissiveMap: ballTex, emissiveIntensity: 0.32, // brighter
    });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(this.r, 48, 32), mat);
    ball.castShadow = true;
    ball.receiveShadow = true;
    ball.layers.enable(HAND_LAYER);           // lit by the dedicated glove-shadow light
    ball.rotation.set(0, (3 * Math.PI) / 2, THREE.MathUtils.degToRad(35)); // matches loaded model
    this._tempBall = ball;                    // fallback until the model loads
    this.mesh.add(ball);
    scene.add(this.mesh);
    this._loadBallModel();

    this.vel = new THREE.Vector3();
    this.pos = new THREE.Vector3();
    this.prev = new THREE.Vector3();
    this.spin = new THREE.Vector3();

    this.state = STATE.HELD;
    this.scored = false;
    this.flightTime = 0;
    this.floorBounces = 0;

    this.net = scene.getObjectByName('netMesh');
    this._netTimer = 0;

    // callbacks
    this.onScore = () => {};
    this.onResolved = () => {};

    this.holdAtHands();
  }

  holdAtHands() {
    this.state = STATE.HELD;
    this.vel.set(0, 0, 0);
    this.scored = false;
    this.mesh.rotation.set(0, 0, 0); // clear accumulated spin (seam orientation lives on the child)
  }

  // Load the uploaded basketball (OBJ + pebble color/normal maps; "rubber"
  // material = seams), toon-shade it to match the game, and swap it in.
  async _loadBallModel() {
    try {
      const { OBJLoader } = await import(
        'https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/loaders/OBJLoader.js'
      );
      const tl = new THREE.TextureLoader();
      const colorMap = await tl.loadAsync('./ball/basketball.jpg');
      colorMap.colorSpace = THREE.SRGBColorSpace; colorMap.anisotropy = 8;
      const normMap = await tl.loadAsync('./ball/basketball_NORM.jpg'); normMap.anisotropy = 8;

      const ramp = new Uint8Array([195, 230, 255]);
      const grad = new THREE.DataTexture(ramp, ramp.length, 1, THREE.RedFormat);
      grad.needsUpdate = true; grad.minFilter = grad.magFilter = THREE.NearestFilter;
      const matFor = (name) => /rubber/i.test(name || '')
        ? new THREE.MeshToonMaterial({ color: 0x140f0b, gradientMap: grad }) // seams
        : new THREE.MeshToonMaterial({
            map: colorMap, normalMap: normMap, gradientMap: grad, color: 0xffc89a,
            emissive: 0xffffff, emissiveMap: colorMap, emissiveIntensity: 0.25, // brighter
          });

      const obj = await new OBJLoader().loadAsync('./ball/basketball.obj');
      obj.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry.computeVertexNormals(); // OBJ has no normals
        o.castShadow = true; o.receiveShadow = true; o.layers.enable(HAND_LAYER);
        o.material = Array.isArray(o.material) ? o.material.map((m) => matFor(m.name)) : matFor(o.material && o.material.name);
      });

      const box = new THREE.Box3().setFromObject(obj);
      const size = new THREE.Vector3(); box.getSize(size);
      const center = new THREE.Vector3(); box.getCenter(center);
      obj.position.sub(center);
      const wrap = new THREE.Group();
      wrap.add(obj);
      wrap.scale.setScalar((this.r * 2) / Math.max(size.x, size.y, size.z));
      // Orient so the seams read horizontal and the texture's pole pinch is
      // turned to the back / under the hands (out of view).
      wrap.rotation.set(0, (3 * Math.PI) / 2, THREE.MathUtils.degToRad(35));

      this.mesh.remove(this._tempBall);
      this.mesh.add(wrap);
    } catch (e) {
      console.warn('basketball OBJ load failed; keeping procedural ball.', e);
    }
  }

  isHeld() { return this.state === STATE.HELD; }
  isLive() { return this.state === STATE.FLYING; }

  // Ideal launch speed for a clean swish from current release point.
  _idealSpeed(releasePos) {
    const { rim, gravity } = CONFIG;
    const a = CONFIG.launchAngleDeg * Math.PI / 180;
    const dx = rim.center.x - releasePos.x;
    const dz = rim.center.z - releasePos.z;
    const d = Math.hypot(dx, dz);
    const dy = rim.center.y - releasePos.y;
    const denom = 2 * Math.cos(a) * Math.cos(a) * (d * Math.tan(a) - dy);
    const v2 = (gravity * d * d) / Math.max(0.001, denom);
    return { v: Math.sqrt(Math.max(0, v2)), dx, dz, d, a };
  }

  // factor: speed multiple of ideal (1=perfect). lateral: radians of aim error.
  shoot(factor = 1, lateral = 0) {
    if (this.isHeld() === false) return;
    // release position = ball in raised hands
    const release = this.player.handBallPosition(this.player.pose, new THREE.Vector3());
    this.pos.copy(release);
    const { v, dx, dz, a } = this._idealSpeed(release);
    let dirx = dx, dirz = dz;
    const dlen = Math.hypot(dirx, dirz) || 1;
    dirx /= dlen; dirz /= dlen;
    // apply lateral aim error (rotate horizontal dir)
    if (lateral) {
      const c = Math.cos(lateral), s = Math.sin(lateral);
      const nx = dirx * c - dirz * s;
      const nz = dirx * s + dirz * c;
      dirx = nx; dirz = nz;
    }
    const speed = v * factor;
    const horiz = speed * Math.cos(a);
    this.vel.set(dirx * horiz, speed * Math.sin(a), dirz * horiz);
    this.state = STATE.FLYING;
    this.scored = false;
    this.flightTime = 0;
    this.floorBounces = 0;
    // backspin scaled by shot force (+x = top rotates back toward shooter, ball travels -z)
    this.spin.set(speed * 1.5, (Math.random() - 0.5) * 0.4, 0);
    this.touchedRim = false;
    this.touchedBackboard = false;
    this.missReason = 'other';
    this._missAnnounced = false; // miss sound plays once, at the first floor bounce
  }

  update(dt, audio) {
    if (this.state === STATE.HELD) {
      this.player.handBallPosition(this.player.pose, this.pos);
      this.mesh.position.copy(this.pos);
      return; // ball stays still in the hands (no idle spin)
    }
    if (this.state === STATE.FLYING) {
      this.flightTime += dt;
      const h = 1 / 240;
      let rem = dt;
      while (rem > 0) {
        const step = Math.min(h, rem);
        this._integrate(step, audio);
        rem -= step;
      }
      this.mesh.position.copy(this.pos);
      this.mesh.rotation.x += this.spin.x * dt;
      this.mesh.rotation.z += this.spin.z * dt;

      this._maybeSettle();
    }
    if (this._netTimer > 0) {
      this._netTimer -= dt;
      if (this.net) {
        const k = Math.max(0, this._netTimer / 0.4);
        this.net.scale.y = 1 + k * 0.5;
      }
    }
  }

  _integrate(h, audio) {
    const { gravity, rim, backboard, ball } = CONFIG;
    this.prev.copy(this.pos);
    this.vel.y -= gravity * h;
    this.pos.addScaledVector(this.vel, h);

    // ---- score: downward crossing of the rim plane, inside the ring ----
    if (!this.scored && this.prev.y >= rim.center.y && this.pos.y < rim.center.y && this.vel.y < 0) {
      const hx = this.pos.x - rim.center.x;
      const hz = this.pos.z - rim.center.z;
      if (Math.hypot(hx, hz) < rim.radius - this.r + 0.03) {
        this.scored = true;
        this._scoreFlightTime = this.flightTime;
        this._netTimer = 0.4;
        // net catches the ball: kill most horizontal speed so it drops straight
        this.vel.x *= 0.35; this.vel.z *= 0.35; this.vel.y *= 0.7;
        if (this.touchedRim) audio.rimScore(); else audio.swish();
        this.onScore();
      }
    }

    // ---- rim ring collision (skip once it's already through) ----
    if (!this.scored) {
      const hx = this.pos.x - rim.center.x;
      const hz = this.pos.z - rim.center.z;
      const hd = Math.hypot(hx, hz);
      if (hd > 0.001) {
        const px = rim.center.x + (hx / hd) * rim.radius;
        const pz = rim.center.z + (hz / hd) * rim.radius;
        const dx = this.pos.x - px;
        const dy = this.pos.y - rim.center.y;
        const dz = this.pos.z - pz;
        const dist = Math.hypot(dx, dy, dz);
        const minDist = this.r + rim.tube;
        if (dist < minDist && dist > 0.0001) {
          const nx = dx / dist, ny = dy / dist, nz = dz / dist;
          const push = minDist - dist;
          this.pos.x += nx * push; this.pos.y += ny * push; this.pos.z += nz * push;
          const vn = this.vel.x * nx + this.vel.y * ny + this.vel.z * nz;
          if (vn < 0) {
            const e = ball.restitutionRim;
            this.vel.x -= (1 + e) * vn * nx;
            this.vel.y -= (1 + e) * vn * ny;
            this.vel.z -= (1 + e) * vn * nz;
            this.vel.multiplyScalar(0.9);
            this.touchedRim = true;
            if (Math.abs(vn) > 0.4) audio.rim();
          }
        }
      }
    }

    // ---- backboard collision (front face, region check) ----
    if (!this.scored &&
        this.prev.z > backboard.z + this.r && this.pos.z <= backboard.z + this.r &&
        this.pos.y > backboard.bottom && this.pos.y < backboard.top &&
        Math.abs(this.pos.x) < backboard.halfW && this.vel.z < 0) {
      this.pos.z = backboard.z + this.r;
      this.vel.z = -this.vel.z * ball.restitutionBoard;
      this.vel.x *= 0.85; this.vel.y *= 0.92;
      this.touchedBackboard = true;
      if (Math.abs(this.vel.z) > 0.3) audio.backboard();
    }

    // ---- floor ----
    if (this.pos.y - this.r < 0) {
      this.pos.y = this.r;
      if (this.vel.y < 0) {
        const speed = Math.abs(this.vel.y);
        this.vel.y = speed * ball.restitutionFloor;
        this.vel.x *= ball.frictionBounce;
        this.vel.z *= ball.frictionBounce;
        this.floorBounces++;
        if (speed > 0.5) audio.bounceFloor(Math.min(1, speed / 4));
        // First floor contact decides the miss sound (short vs long), immediately.
        if (this.floorBounces === 1 && !this.scored && !this._missAnnounced) {
          this.missReason = (this.touchedBackboard || this.pos.z <= 0.15) ? 'long' : 'short';
          this._missAnnounced = true;
          audio.playMiss(this.missReason);
        }
        if (this.vel.y < 0.6) { this.vel.y = 0; }
      }
    }
  }

  _maybeSettle() {
    const speed = this.vel.length();
    const resting = this.pos.y <= this.r + 0.02 && speed < 0.6;
    const offCourt = Math.abs(this.pos.x) > 11 || this.pos.z > 17 || this.pos.z < -5 || this.pos.y > 12;
    const madeAndDropped = this.scored && (this.flightTime - this._scoreFlightTime) > 1.2;
    if ((resting && this.floorBounces >= 1) || offCourt || madeAndDropped || this.flightTime > 6) {
      this.state = STATE.DEAD;
      // Fallback for misses that never bounced on the floor (e.g. sailed off-court).
      if (!this.scored && !this._missAnnounced) {
        this.missReason = (this.touchedBackboard || this.pos.z <= 0.15) ? 'long' : 'short';
        this._missAnnounced = true;
        this.audio.playMiss(this.missReason);
      }
      this.onResolved(this.scored);
    }
  }
}
