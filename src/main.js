import * as THREE from 'three';
import { buildArena } from './arena.js';
import { Player } from './player.js';
import { Ball } from './ball.js';
import { AudioEngine } from './audio.js';
import { Game } from './game.js';

const canvas = document.getElementById('scene');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
scene.add(camera);

buildArena(scene, renderer);

const audio = new AudioEngine();
const player = new Player(camera);
const ball = new Ball(scene, player, audio);
const game = new Game({ scene, camera, renderer, player, ball, audio });

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  const aspect = w / h;
  camera.aspect = aspect;
  // widen vertical FOV on tall/narrow portrait screens so the hoop stays framed
  camera.fov = aspect < 0.62 ? 74 : aspect < 0.8 ? 66 : 58;
  camera.updateProjectionMatrix();

  // landscape warning for phones
  const rotate = document.getElementById('rotate');
  if (aspect > 1.15 && Math.min(w, h) < 820) rotate.classList.remove('hidden');
  else rotate.classList.add('hidden');
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
resize();

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Keep audio alive when returning to tab.
document.addEventListener('visibilitychange', () => { if (!document.hidden) audio.resume(); });
