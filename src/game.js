import * as THREE from 'three';
import { CONFIG } from './config.js';

const $ = (id) => document.getElementById(id);

export class Game {
  constructor({ scene, camera, renderer, player, ball, audio }) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.player = player;
    this.ball = ball;
    this.audio = audio;

    this.state = 'idle'; // idle | ready | charging | shot | resetting | over
    this.level = 1;
    this.score = 0;
    this.lives = CONFIG.game.startLives;
    this.makes = 0;
    this.required = CONFIG.game.baseRequired;
    this.streak = 0;

    this.targetIndex = 2;

    // meter
    this.m = 0;
    this.mDir = 1;
    this.mSpeed = CONFIG.meter.baseSpeed;
    this.perfectTol = CONFIG.meter.basePerfectTol;

    this._resetTimer = 0;
    this._bannerTimer = 0;

    this._buildMarker();
    this._buildHUD3D();
    this._wireBall();
    this._wireInput();
    this._refreshHUD();
  }

  // Stats as 3D panels at the court's depth: LEVEL/SCORE stacked on the left,
  // LIVES/MAKES stacked on the right.
  _buildHUD3D() {
    const group = new THREE.Group();
    group.position.set(0, 7.2, -2); // lowered 10% from 8.0
    this.scene.add(group);
    const W = 1.9, H = 1.12, vGap = 0.16, colX = 1.05;
    const columns = [
      { x: -colX, items: [
        { key: 'level', label: 'LEVEL', color: '#ffffff' },
        { key: 'score', label: 'SCORE', color: '#ffffff' },
      ] },
      { x: colX, items: [
        { key: 'lives', label: 'LIVES', color: '#ffffff' },
        { key: 'makes', label: 'MAKES', color: '#ff7a18' },
      ] },
    ];
    this.hud3d = [];
    for (const col of columns) {
      col.items.forEach((d, row) => {
        const canvas = document.createElement('canvas');
        canvas.width = 320; canvas.height = 188;
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        const mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(W, H),
          new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
        );
        mesh.position.set(col.x, (0.5 - row) * (H + vGap), 0);
        mesh.renderOrder = 10;
        group.add(mesh);
        this.hud3d.push({ ...d, canvas, ctx: canvas.getContext('2d'), tex });
      });
    }
    // redraw once the web font is ready so the panels use Oswald
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => this._refreshHUD());
    }
  }

  _buildMarker() {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.62, 40),
      new THREE.MeshStandardMaterial({
        color: 0x39d0ff, emissive: 0x39d0ff, emissiveIntensity: 1.2,
        transparent: true, opacity: 0.8, side: THREE.DoubleSide,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    this.marker = ring;
    this.scene.add(ring);
    this._placeMarker();
  }

  _placeMarker() {
    const s = this.player.spots[this.targetIndex];
    this.marker.position.set(s.x, 0.02, s.z);
  }

  _wireBall() {
    this.ball.onScore = () => this._onMake();
    this.ball.onResolved = (scored) => this._onResolved(scored);
  }

  _wireInput() {
    const press = (el, down, up) => {
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); down(); });
      el.addEventListener('pointerup', (e) => { e.preventDefault(); up && up(); });
      el.addEventListener('pointercancel', (e) => { e.preventDefault(); up && up(); });
      el.addEventListener('pointerleave', (e) => { if (e.buttons) { up && up(); } });
    };

    const shootEl = $('btn-shoot');
    press(shootEl,
      () => { shootEl.classList.add('pressed'); shootEl.classList.remove('release'); this._startCharge(); },
      () => { shootEl.classList.remove('pressed'); shootEl.classList.add('release'); this._release(); });
    shootEl.addEventListener('animationend', () => shootEl.classList.remove('release'));

    $('btn-timeout').addEventListener('click', () => this.pause());
    $('btn-continue').addEventListener('click', () => this.resumeGame());
    $('btn-endgame').addEventListener('click', () => this.endGame());

    $('btn-left').addEventListener('pointerdown', (e) => { e.preventDefault(); this._move(-1); });
    $('btn-right').addEventListener('pointerdown', (e) => { e.preventDefault(); this._move(1); });

    const startEl = $('overlay-start');
    startEl.addEventListener('click', () => this.start());
    startEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') this.start();
    });
    $('btn-restart').addEventListener('click', () => this.restart());
  }

  start() {
    this.audio.init();
    this.audio.resume();
    this.audio.playRandomMusic();
    $('overlay-start').classList.add('hidden');
    this.state = 'ready';
    this.player.setPose(0);
    this._pickTarget(true);
    this._banner(`Level ${this.level}`, 1.4);
  }

  restart() {
    this.level = 1;
    this.score = 0;
    this.lives = CONFIG.game.startLives;
    this.makes = 0;
    this.required = CONFIG.game.baseRequired;
    this.streak = 0;
    this.mSpeed = CONFIG.meter.baseSpeed;
    this.perfectTol = CONFIG.meter.basePerfectTol;
    $('overlay-over').classList.add('hidden');
    this.ball.holdAtHands();
    this.state = 'ready';
    this.audio.playRandomMusic();
    this._pickTarget(true);
    this._refreshHUD();
    this._banner(`Level ${this.level}`, 1.4);
  }

  pause() {
    if (['paused', 'over', 'idle'].includes(this.state)) return;
    this._prevState = this.state;
    this.state = 'paused';
    $('meter').classList.remove('active');
    $('dir-arrow').classList.add('hidden');
    $('shoot-cue').classList.add('hidden');
    $('btn-shoot').classList.remove('pressed');
    $('overlay-pause').classList.remove('hidden');
    this.audio.pauseMusic();
  }

  resumeGame() {
    if (this.state !== 'paused') return;
    $('overlay-pause').classList.add('hidden');
    this.audio.resumeMusic();
    // a charge in progress is cancelled — return the ball to the hands
    if (this._prevState === 'charging') {
      this.ball.holdAtHands();
      this.player.setPose(0);
      this.state = 'ready';
    } else {
      this.state = this._prevState || 'ready';
    }
  }

  endGame() {
    $('overlay-pause').classList.add('hidden');
    this.audio.pauseMusic();
    this.state = 'idle';
    this.level = 1;
    this.score = 0;
    this.lives = CONFIG.game.startLives;
    this.makes = 0;
    this.required = CONFIG.game.baseRequired;
    this.streak = 0;
    this.mSpeed = CONFIG.meter.baseSpeed;
    this.perfectTol = CONFIG.meter.basePerfectTol;
    this.ball.holdAtHands();
    this.player.setPose(0);
    $('meter').classList.remove('active');
    $('dir-arrow').classList.add('hidden');
    $('shoot-cue').classList.add('hidden');
    this._refreshHUD();
    $('overlay-start').classList.remove('hidden');
  }

  _move(dir) {
    if (this.state !== 'ready') return;
    if (dir < 0) this.player.moveLeft(); else this.player.moveRight();
  }

  _startCharge() {
    if (this.state !== 'ready' || !this.ball.isHeld()) return;
    this.state = 'charging';
    this.m = 0;
    this.mDir = 1;
    this.player.setPose(1);
    $('meter').classList.add('active');
  }

  _release() {
    if (this.state !== 'charging') return;
    this.state = 'shot';
    $('meter').classList.remove('active');

    const off = this.m - 0.5;
    const aoff = Math.abs(off);
    const { spread } = CONFIG.meter;
    let factor, lateral, perfect = false;
    if (aoff <= this.perfectTol) {
      factor = 1;
      lateral = (Math.random() - 0.5) * 0.004;
      perfect = true;
    } else {
      const sign = Math.sign(off);
      const t = (aoff - this.perfectTol) / (0.5 - this.perfectTol);
      factor = 1 + sign * spread * t;
      lateral = (Math.random() - 0.5) * 0.05 * t;
    }
    this.lastPerfect = perfect;
    this.lastFromTarget = this.player.index === this.targetIndex;
    this.ball.shoot(factor, lateral);
    this.audio.grunt(); // random effort grunt on release
    this.player.startFollowThrough();
    this.player.startShotZoom(); // subtle dolly toward the rim on release
  }

  _onMake() {
    let pts = CONFIG.game.pointsMake;
    if (this.lastPerfect) pts += CONFIG.game.pointsPerfect;
    this.streak++;
    if (this.streak >= 3) pts += this.streak - 2; // small streak bonus
    this.score += pts;

    this._popup(this.lastPerfect ? 'SWISH! +' + pts : 'BUCKET +' + pts, '#39ff9e');
    this.audio.cheer(this.lastPerfect);

    if (this.lastFromTarget) {
      this.makes++;
      this._pickTarget(false);
      if (this.makes >= this.required) this._levelUp();
    }
    this._refreshHUD();
  }

  _onResolved(scored) {
    if (!scored) {
      this.streak = 0;
      this.lives--;
      this._popup('MISS', '#ff5a6a');
      this.audio.miss();
      this._refreshHUD();
      if (this.lives <= 0) { this._gameOver(); return; }
    }
    this.state = 'resetting';
    this._resetTimer = scored ? 0.9 : 0.8;
  }

  _levelUp() {
    this.level++;
    this.makes = 0;
    this.required = CONFIG.game.baseRequired + (this.level - 1) * CONFIG.game.requiredPerLevel;
    this.mSpeed = CONFIG.meter.baseSpeed + (this.level - 1) * CONFIG.meter.speedPerLevel;
    this.perfectTol = Math.max(
      CONFIG.meter.minPerfectTol,
      CONFIG.meter.basePerfectTol - (this.level - 1) * CONFIG.meter.tolPerLevel
    );
    this.audio.levelUp();
    this.audio.playRandomMusic(); // switch to a new random track each level
    this._banner(`Level ${this.level}!`, 1.6);
    this._pickTarget(true);
  }

  _gameOver() {
    this.state = 'over';
    this.audio.pauseMusic();
    this.audio.buzzer();
    let best = this.score;
    try {
      best = Math.max(this.score, parseInt(localStorage.getItem('buckets.best') || '0', 10) || 0);
      localStorage.setItem('buckets.best', String(best));
    } catch (_) { /* storage unavailable */ }
    $('final-score').textContent = `Score ${this.score} · Best ${best} · Level ${this.level}`;
    $('overlay-over').classList.remove('hidden');
  }

  _pickTarget(allowSame) {
    let next = this.targetIndex;
    const n = this.player.spots.length;
    if (!allowSame) {
      while (next === this.targetIndex) next = (Math.random() * n) | 0;
    } else {
      next = (Math.random() * n) | 0;
    }
    this.targetIndex = next;
    this._placeMarker();
  }

  // Bright orange arrow beside the backboard, or "SHOOT!" once on the spot.
  // Positions are projected from the backboard's 3D location each frame.
  _updateCues() {
    const arrow = $('dir-arrow');
    const cue = $('shoot-cue');
    if (this.state !== 'ready') {
      arrow.classList.add('hidden');
      cue.classList.add('hidden');
      return;
    }
    const W = window.innerWidth, H = window.innerHeight;
    const bb = CONFIG.backboard;
    if (this.player.index === this.targetIndex) {
      // on the spot: orange "SHOOT!" cue above the backboard
      arrow.classList.add('hidden');
      const p = this._project(0, bb.top + 0.15, bb.z, W, H);
      cue.style.left = p.x + 'px';
      cue.style.top = (p.y - 10) + 'px';
      cue.classList.remove('hidden');
    } else {
      // off the spot: orange arrow beside the backboard pointing the way to move
      cue.classList.add('hidden');
      const goRight = this.targetIndex > this.player.index;
      arrow.textContent = goRight ? '▶' : '◀';
      const midY = (bb.top + bb.bottom) / 2;
      const e = this._project(goRight ? bb.halfW : -bb.halfW, midY, bb.z, W, H);
      arrow.style.left = (e.x + (goRight ? 52 : -52)) + 'px';
      arrow.style.top = e.y + 'px';
      arrow.classList.remove('hidden');
    }
  }

  _project(x, y, z, W, H) {
    const v = new THREE.Vector3(x, y, z);
    v.project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H };
  }

  _banner(text, dur) {
    const b = $('banner');
    b.textContent = text;
    b.classList.add('show');
    this._bannerTimer = dur;
  }

  _popup(text, color) {
    const p = $('popup');
    p.textContent = text;
    p.style.color = color;
    p.classList.remove('show');
    void p.offsetWidth; // restart animation
    p.classList.add('show');
  }

  _refreshHUD() {
    const vals = {
      level: this.level, score: this.score,
      makes: `${this.makes}/${this.required}`, lives: this.lives,
    };
    if (!this.hud3d) return;
    for (const p of this.hud3d) {
      const ctx = p.ctx, w = p.canvas.width, h = p.canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(0,0,0,0.82)';
      ctx.beginPath();
      ctx.roundRect(5, 5, w - 10, h - 10, h * 0.14);
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = `700 ${Math.round(h * 0.2)}px Oswald, 'Arial Narrow', sans-serif`;
      ctx.fillText(p.label, w / 2, h * 0.3);
      ctx.fillStyle = p.color;
      ctx.font = `700 ${Math.round(h * 0.5)}px Oswald, 'Arial Narrow', sans-serif`;
      ctx.fillText(String(vals[p.key]), w / 2, h * 0.86);
      p.tex.needsUpdate = true;
    }
  }

  update(dt) {
    if (this.state === 'paused') return; // frozen while the time-out overlay is up

    // marker pulse
    if (this.marker) {
      const t = performance.now() * 0.004;
      const k = 1 + Math.sin(t) * 0.12;
      this.marker.scale.set(k, k, k);
      const onSpot = this.player.index === this.targetIndex;
      this.marker.material.color.setHex(onSpot ? 0x39ff9e : 0x39d0ff);
      this.marker.material.emissive.setHex(onSpot ? 0x39ff9e : 0x39d0ff);
    }

    // charging meter ping-pong
    if (this.state === 'charging') {
      this.m += this.mDir * this.mSpeed * dt;
      if (this.m >= 1) { this.m = 1; this.mDir = -1; }
      else if (this.m <= 0) { this.m = 0; this.mDir = 1; }
      this._updateMeterUI();
    }

    // banner fade
    if (this._bannerTimer > 0) {
      this._bannerTimer -= dt;
      if (this._bannerTimer <= 0) $('banner').classList.remove('show');
    }

    // reset after a resolved shot
    if (this.state === 'resetting') {
      this._resetTimer -= dt;
      if (this._resetTimer <= 0) {
        this.ball.holdAtHands();
        this.player.setPose(0);
        this.state = 'ready';
      }
    }

    this.player.update(dt);
    this.camera.updateMatrixWorld();
    this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();
    this._updateCues();
    this.ball.update(dt, this.audio);
  }

  _updateMeterUI() {
    $('meter-fill').style.height = (this.m * 100) + '%';
    $('meter-indicator').style.bottom = (this.m * 100) + '%';
    const zone = $('meter-zone');
    zone.style.bottom = (50 - this.perfectTol * 100) + '%';
    zone.style.height = (this.perfectTol * 200) + '%';
  }
}
