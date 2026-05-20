import * as THREE from 'three';

function canvas(size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

// Hardwood floor: warm planks + grain + subtle sheen.
export function woodTexture() {
  const size = 1024;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#b07a3c';
  ctx.fillRect(0, 0, size, size);

  const plankH = size / 16;
  for (let i = 0; i < 16; i++) {
    const y = i * plankH;
    const base = 150 + Math.floor(Math.random() * 40);
    ctx.fillStyle = `rgb(${base + 30},${Math.floor(base * 0.62)},${Math.floor(base * 0.3)})`;
    ctx.fillRect(0, y, size, plankH);
    // grain streaks
    for (let g = 0; g < 60; g++) {
      ctx.strokeStyle = `rgba(${60 + Math.random() * 40},${30 + Math.random() * 30},10,${0.04 + Math.random() * 0.06})`;
      ctx.lineWidth = 0.5 + Math.random() * 1.5;
      ctx.beginPath();
      const gy = y + Math.random() * plankH;
      ctx.moveTo(0, gy);
      ctx.bezierCurveTo(size * 0.33, gy + (Math.random() - 0.5) * 6, size * 0.66, gy + (Math.random() - 0.5) * 6, size, gy + (Math.random() - 0.5) * 4);
      ctx.stroke();
    }
    // plank seam
    ctx.fillStyle = 'rgba(40,22,8,0.6)';
    ctx.fillRect(0, y, size, 1.5);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// Basketball: orange pebbled leather with black seams.
export function ballTextures() {
  const size = 512;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  // base orange gradient
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, '#e8772a');
  grad.addColorStop(0.5, '#d4641d');
  grad.addColorStop(1, '#b9520f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  // pebble speckle
  for (let i = 0; i < 14000; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    const v = Math.random();
    ctx.fillStyle = v > 0.5 ? 'rgba(255,200,140,0.10)' : 'rgba(80,30,0,0.10)';
    ctx.fillRect(x, y, 1.4, 1.4);
  }
  // seams: equirectangular-ish lines. Vertical seams + two horizontal curves.
  ctx.strokeStyle = '#15100c';
  ctx.lineWidth = 5;
  for (const fx of [0.25, 0.5, 0.75, 1.0]) {
    ctx.beginPath(); ctx.moveTo(size * fx, 0); ctx.lineTo(size * fx, size); ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(0, size * 0.5);
  ctx.bezierCurveTo(size * 0.25, size * 0.34, size * 0.75, size * 0.66, size, size * 0.5);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// Crowd: dark stands speckled with colored blobs (people).
export function crowdTexture() {
  const w = 1024, h = 512;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0a0c12';
  ctx.fillRect(0, 0, w, h);
  // row seating shading
  for (let r = 0; r < 24; r++) {
    const y = (r / 24) * h;
    ctx.fillStyle = `rgba(255,255,255,${0.02 + (r / 24) * 0.03})`;
    ctx.fillRect(0, y, w, h / 48);
  }
  const cols = ['#c0392b', '#2980b9', '#27ae60', '#f1c40f', '#ecf0f1', '#8e44ad', '#e67e22', '#bdc3c7', '#34495e'];
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h * 0.96;
    ctx.fillStyle = cols[(Math.random() * cols.length) | 0];
    ctx.globalAlpha = 0.55 + Math.random() * 0.4;
    const s = 2 + Math.random() * 3;
    ctx.beginPath();
    ctx.arc(x, y, s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Simple skin-tone material for arms.
export function skinMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0x8a5a3b, roughness: 0.7, metalness: 0.0 });
}

// Procedural environment for reflections (gradient sky-ish).
export function environment(renderer) {
  const w = 256, h = 128;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#3a4a66');
  g.addColorStop(0.45, '#20242e');
  g.addColorStop(0.5, '#15171c');
  g.addColorStop(1, '#0a0b0e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // bright ceiling light strips for nice specular highlights
  ctx.fillStyle = 'rgba(255,255,245,0.9)';
  for (let i = 0; i < 5; i++) {
    ctx.fillRect((i + 0.5) * (w / 5) - 6, 6, 12, 10);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(tex).texture;
  tex.dispose();
  pmrem.dispose();
  return env;
}
