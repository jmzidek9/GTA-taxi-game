/* CROSSTOWN — core: config, math helpers, geometry builder, textures, save, audio */
'use strict';
(function () {
const G = window.G = window.G || {};

/* ---------- City config (meters) ---------- */
const C = G.CFG = { BLOCK: 70, ROAD: 14, N: 8, SW: 4, LANE: 3.5 };
C.CELL = C.BLOCK + C.ROAD;
C.SIZE = C.N * C.CELL + C.ROAD;
C.HALF = C.SIZE / 2;
G.roadPos = i => -C.HALF + C.ROAD / 2 + i * C.CELL;

/* ---------- Tiny event bus (fare done, ped hit, escaped police...) ---------- */
const handlers = {};
G.on = (ev, fn) => { (handlers[ev] = handlers[ev] || []).push(fn); };
G.emit = (ev, data) => { (handlers[ev] || []).forEach(fn => { try { fn(data); } catch (e) { console.error(e); } }); };

/* ---------- Math helpers ---------- */
const M = G.M = {
  clamp: (v, a, b) => v < a ? a : v > b ? b : v,
  lerp: (a, b, t) => a + (b - a) * t,
  damp: (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt)),
  smooth: t => t * t * (3 - 2 * t),
  wrapAngle: a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; },
  dist: (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz),
  rng(seed) { let s = seed >>> 0; return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; },
  pick: (r, arr) => arr[Math.floor(r() * arr.length) % arr.length],
  range: (r, a, b) => a + (b - a) * r(),
};

/* ---------- Geometry builder: merges many primitives into one BufferGeometry ---------- */
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _m3 = new THREE.Matrix3(), _col = new THREE.Color();
class GB {
  constructor() { this.p = []; this.n = []; this.u = []; this.c = []; this.i = []; this.vc = 0; this.color = [1, 1, 1]; }
  setColor(c) { if (c === undefined || c === null) { this.color = [1, 1, 1]; return this; } _col.set(c); this.color = [_col.r, _col.g, _col.b]; return this; }
  vert(x, y, z, nx, ny, nz, u, v) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.u.push(u, v); this.c.push(this.color[0], this.color[1], this.color[2]); return this.vc++; }
  // quad from 4 corners (CCW seen from outside), normal n, uvs [u0,v0,u1,v1] mapped BL,BR,TR,TL
  quad(a, b, c, d, n, uv) {
    uv = uv || [0, 0, 1, 1];
    const i0 = this.vert(a[0], a[1], a[2], n[0], n[1], n[2], uv[0], uv[1]);
    const i1 = this.vert(b[0], b[1], b[2], n[0], n[1], n[2], uv[2], uv[1]);
    this.vert(c[0], c[1], c[2], n[0], n[1], n[2], uv[2], uv[3]);
    this.vert(d[0], d[1], d[2], n[0], n[1], n[2], uv[0], uv[3]);
    this.i.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  }
  // horizontal quad facing up
  flat(x0, z0, x1, z1, y, uvScale) {
    const s = uvScale || 0;
    const uv = s ? [x0 / s, -z1 / s, x1 / s, -z0 / s] : [0, 0, 1, 1];
    // CCW viewed from above (+y): (x0,z1) -> (x1,z1) -> (x1,z0) -> (x0,z0)
    this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], uv);
  }
  // axis-aligned box; opts: {top:true,bottom:false, modW, modH, uOff, vOff, sides:true}
  box(cx, y0, cz, w, h, d, o) {
    o = o || {};
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, y1 = y0 + h;
    const mw = o.modW || 0, mh = o.modH || 0, uo = o.uOff || 0, vo = o.vOff || 0;
    const uvs = (len) => mw ? [uo, vo, uo + len / mw, vo + h / mh] : [0, 0, 1, 1];
    if (o.sides !== false) {
      this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], uvs(w));
      this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], uvs(w));
      this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], uvs(d));
      this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], uvs(d));
    }
    if (o.top !== false) {
      const tb = o.topTo || this;
      const s = o.topUV || 0;
      tb.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], s ? [x0 / s, z0 / s, x1 / s, z1 / s] : [0, 0, 1, 1]);
    }
    if (o.bottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
  }
  // merge any THREE BufferGeometry with transform matrix
  addGeo(geo, m, useSrcColor) {
    const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv, sc = useSrcColor ? geo.attributes.color : null;
    _m3.getNormalMatrix(m);
    const base = this.vc;
    for (let k = 0; k < pos.count; k++) {
      _v.fromBufferAttribute(pos, k).applyMatrix4(m);
      if (nor) _n.fromBufferAttribute(nor, k).applyMatrix3(_m3).normalize(); else _n.set(0, 1, 0);
      this.p.push(_v.x, _v.y, _v.z); this.n.push(_n.x, _n.y, _n.z);
      if (uv) this.u.push(uv.getX(k), uv.getY(k)); else this.u.push(0, 0);
      if (sc) this.c.push(sc.getX(k), sc.getY(k), sc.getZ(k)); else this.c.push(this.color[0], this.color[1], this.color[2]);
    }
    if (geo.index) { const ix = geo.index; for (let k = 0; k < ix.count; k++) this.i.push(base + ix.getX(k)); }
    else for (let k = 0; k < pos.count; k++) this.i.push(base + k);
    this.vc += pos.count;
  }
  empty() { return this.vc === 0; }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.vc > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere(); g.computeBoundingBox && g.computeBoundingBox();
    return g;
  }
}
G.GB = GB;
const _mat4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
G.mat = (x, y, z, rx, ry, rz, sx, sy, sz) => {
  _e.set(rx || 0, ry || 0, rz || 0); _q.setFromEuler(_e);
  _p.set(x, y, z); _s.set(sx === undefined ? 1 : sx, sy === undefined ? (sx === undefined ? 1 : sx) : sy, sz === undefined ? (sx === undefined ? 1 : sx) : sz);
  return _mat4.compose(_p, _q, _s);
};
/* Bucketed geometry: one mesh per (material, chunk) for batching + frustum culling */
class Buckets {
  constructor(chunk) { this.map = new Map(); this.chunk = chunk || 170; }
  get(matKey, x, z) {
    const cx = Math.floor((x + C.HALF + 200) / this.chunk), cz = Math.floor((z + C.HALF + 200) / this.chunk);
    const key = matKey + '|' + cx + ',' + cz;
    let b = this.map.get(key);
    if (!b) { b = { gb: new GB(), mat: matKey }; this.map.set(key, b); }
    return b.gb;
  }
  flush(scene, mats, opts) {
    const out = [];
    for (const [, b] of this.map) {
      if (b.gb.empty()) continue;
      const mat = mats[b.mat];
      const mesh = new THREE.Mesh(b.gb.build(), mat);
      const o = (opts && opts[b.mat]) || {};
      mesh.castShadow = o.cast !== false; mesh.receiveShadow = o.receive !== false;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      if (o.order !== undefined) mesh.renderOrder = o.order;
      scene.add(mesh); out.push(mesh);
    }
    this.map.clear();
    return out;
  }
}
G.Buckets = Buckets;

/* ---------- Procedural canvas textures ---------- */
const T = G.Tex = {};
T.canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
T.make = (canvas, opts) => {
  const t = new THREE.CanvasTexture(canvas);
  opts = opts || {};
  t.wrapS = t.wrapT = opts.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  if (opts.srgb !== false) t.encoding = THREE.sRGBEncoding;
  t.anisotropy = G.maxAniso || 4;
  return t;
};
function noise(ctx, w, h, amt, base) {
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  for (let k = 0; k < d.length; k += 4) { const n = (Math.random() - 0.5) * amt; d[k] += n; d[k + 1] += n; d[k + 2] += n; }
  ctx.putImageData(img, 0, 0);
}
T.asphalt = () => {
  const c = T.canvas(512, 512), x = c.getContext('2d');
  x.fillStyle = '#3a3c40'; x.fillRect(0, 0, 512, 512);
  for (let k = 0; k < 2600; k++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.08})`; const s = Math.random() * 3 + 0.5; x.fillRect(Math.random() * 512, Math.random() * 512, s, s); }
  x.strokeStyle = 'rgba(20,20,22,0.35)'; x.lineWidth = 1;
  for (let k = 0; k < 14; k++) { x.beginPath(); let px = Math.random() * 512, py = Math.random() * 512; x.moveTo(px, py); for (let j = 0; j < 8; j++) { px += (Math.random() - 0.5) * 40; py += (Math.random() - 0.5) * 40; x.lineTo(px, py); } x.stroke(); }
  for (let k = 0; k < 10; k++) { x.fillStyle = 'rgba(25,26,28,0.18)'; x.beginPath(); x.ellipse(Math.random() * 512, Math.random() * 512, 20 + Math.random() * 50, 10 + Math.random() * 30, Math.random() * 3, 0, 7); x.fill(); }
  noise(x, 512, 512, 18);
  return T.make(c);
};
T.concrete = () => {
  const c = T.canvas(256, 256), x = c.getContext('2d');
  x.fillStyle = '#9d9b96'; x.fillRect(0, 0, 256, 256);
  noise(x, 256, 256, 22);
  x.strokeStyle = 'rgba(60,58,55,0.45)'; x.lineWidth = 2;
  for (let k = 0; k <= 4; k++) { x.beginPath(); x.moveTo(k * 64, 0); x.lineTo(k * 64, 256); x.stroke(); x.beginPath(); x.moveTo(0, k * 64); x.lineTo(256, k * 64); x.stroke(); }
  return T.make(c);
};
T.grass = () => {
  const c = T.canvas(256, 256), x = c.getContext('2d');
  x.fillStyle = '#4f6b34'; x.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 4000; k++) { const g = 80 + Math.random() * 60; x.fillStyle = `rgba(${g * 0.6},${g},${g * 0.4},0.5)`; x.fillRect(Math.random() * 256, Math.random() * 256, 1, 2 + Math.random() * 3); }
  return T.make(c);
};
T.roof = () => {
  const c = T.canvas(128, 128), x = c.getContext('2d');
  x.fillStyle = '#55565a'; x.fillRect(0, 0, 128, 128); noise(x, 128, 128, 40); return T.make(c);
};
T.water = () => {
  const c = T.canvas(256, 256), x = c.getContext('2d');
  x.fillStyle = '#808080'; x.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 300; k++) { x.strokeStyle = `rgba(255,255,255,${Math.random() * 0.25})`; x.beginPath(); const px = Math.random() * 256, py = Math.random() * 256; x.moveTo(px, py); x.quadraticCurveTo(px + 8, py - 3, px + 16, py); x.stroke(); }
  return T.make(c, { srgb: false });
};
T.radial = (inner, outer) => {
  const c = T.canvas(128, 128), x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner || 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.45)'); g.addColorStop(1, outer || 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return T.make(c, { clamp: true });
};
T.beam = () => {
  const c = T.canvas(64, 256), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 256, 0, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.25, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 256);
  const h = x.createLinearGradient(0, 0, 64, 0);
  h.addColorStop(0, 'rgba(0,0,0,0.6)'); h.addColorStop(0.5, 'rgba(0,0,0,0)'); h.addColorStop(1, 'rgba(0,0,0,0.6)');
  x.globalCompositeOperation = 'destination-out'; x.fillStyle = h; x.fillRect(0, 0, 64, 256);
  return T.make(c, { clamp: true });
};
T.arrows = () => {
  const c = T.canvas(64, 128), x = c.getContext('2d');
  x.clearRect(0, 0, 64, 128);
  x.fillStyle = 'rgba(255,255,255,0.9)';
  x.beginPath(); x.moveTo(8, 70); x.lineTo(32, 40); x.lineTo(56, 70); x.lineTo(56, 88); x.lineTo(32, 58); x.lineTo(8, 88); x.closePath(); x.fill();
  const t = T.make(c, { srgb: false }); t.wrapS = THREE.ClampToEdgeWrapping; return t;
};
T.puddles = () => {
  // roughness map (green channel): dark = mirror-like puddle, light = damp asphalt
  const c = T.canvas(512, 512), x = c.getContext('2d');
  x.fillStyle = 'rgb(150,150,150)'; x.fillRect(0, 0, 512, 512);
  for (let k = 0; k < 26; k++) {
    const px = Math.random() * 512, py = Math.random() * 512, r = 18 + Math.random() * 60;
    for (let q = 0; q < 6; q++) { const g = x.createRadialGradient(px + (Math.random() - 0.5) * r, py + (Math.random() - 0.5) * r, 0, px, py, r); g.addColorStop(0, 'rgba(18,18,18,0.9)'); g.addColorStop(0.6, 'rgba(30,30,30,0.6)'); g.addColorStop(1, 'rgba(40,40,40,0)'); x.fillStyle = g; x.beginPath(); x.ellipse(px, py, r * (0.6 + Math.random()), r * (0.4 + Math.random() * 0.6), Math.random() * 3, 0, 7); x.fill(); }
  }
  noise(x, 512, 512, 30);
  return T.make(c, { srgb: false });
};
/* Facade styles. Each texture = one module of cols x rows window bays. */
const BAY = 3.6, FLOOR = 3.5;
T.BAY = BAY; T.FLOOR = FLOOR;
function facade(style) {
  const S = 512, c = T.canvas(S, S), x = c.getContext('2d');
  const e = T.canvas(S, S), ex = e.getContext('2d');
  ex.fillStyle = '#000'; ex.fillRect(0, 0, S, S);
  const cols = 4, rows = 4, cw = S / cols, rh = S / rows;
  const lit = (px, py, w, h, p) => {
    if (Math.random() < p) { const warm = Math.random(); ex.fillStyle = warm < 0.7 ? `rgb(255,${200 + Math.random() * 40 | 0},${130 + Math.random() * 60 | 0})` : `rgb(${190 + Math.random() * 40 | 0},${215 + Math.random() * 30 | 0},255)`; ex.globalAlpha = 0.55 + Math.random() * 0.45; ex.fillRect(px, py, w, h); ex.globalAlpha = 1; }
  };
  if (style === 'glass') {
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
      const g = x.createLinearGradient(0, r * rh, 0, (r + 1) * rh);
      const b = 70 + Math.random() * 25;
      g.addColorStop(0, `rgb(${b * 0.55},${b * 0.85},${b * 1.15})`); g.addColorStop(1, `rgb(${b * 0.35},${b * 0.55},${b * 0.8})`);
      x.fillStyle = g; x.fillRect(k * cw, r * rh, cw, rh);
      lit(k * cw + 4, r * rh + 10, cw - 8, rh - 14, 0.42);
    }
    x.fillStyle = '#c7ccd2'; for (let k = 0; k <= cols; k++) x.fillRect(k * cw - 3, 0, 6, S);
    x.fillStyle = '#2b3138'; for (let r = 0; r <= rows; r++) x.fillRect(0, r * rh - 6, S, 10);
  } else if (style === 'office') {
    x.fillStyle = '#d6d3cc'; x.fillRect(0, 0, S, S); noise(x, S, S, 14);
    for (let r = 0; r < rows; r++) {
      x.fillStyle = '#1d2933'; x.fillRect(0, r * rh + 40, S, rh - 62);
      for (let k = 0; k < cols * 2; k++) { x.fillStyle = 'rgba(140,170,200,0.18)'; x.fillRect(k * cw / 2 + 4, r * rh + 44, cw / 2 - 8, 20); lit(k * cw / 2 + 2, r * rh + 40, cw / 2 - 4, rh - 62, 0.38); }
      x.fillStyle = '#9a978f'; for (let k = 0; k <= cols * 2; k++) x.fillRect(k * cw / 2 - 2, r * rh + 40, 4, rh - 62);
    }
  } else if (style === 'brick') {
    x.fillStyle = '#8a4b38'; x.fillRect(0, 0, S, S);
    for (let yy = 0; yy < S; yy += 12) for (let xx = (yy / 12 % 2) * 14; xx < S; xx += 28) { const v = Math.random() * 30 - 15; x.fillStyle = `rgb(${140 + v},${72 + v * 0.6},${55 + v * 0.5})`; x.fillRect(xx, yy, 26, 10); }
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
      const wx = k * cw + 26, wy = r * rh + 26, ww = cw - 52, wh = rh - 48;
      x.fillStyle = '#e8e2d6'; x.fillRect(wx - 6, wy - 6, ww + 12, wh + 16);
      x.fillStyle = '#26303a'; x.fillRect(wx, wy, ww, wh);
      x.fillStyle = 'rgba(160,190,215,0.2)'; x.fillRect(wx, wy, ww, wh * 0.4);
      x.fillStyle = '#e8e2d6'; x.fillRect(wx + ww / 2 - 2, wy, 4, wh); x.fillRect(wx, wy + wh / 2 - 2, ww, 4);
      lit(wx, wy, ww, wh, 0.45);
    }
  } else if (style === 'plaster') {
    x.fillStyle = '#ece6dc'; x.fillRect(0, 0, S, S); noise(x, S, S, 10);
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
      const wx = k * cw + 34, wy = r * rh + 30, ww = cw - 68, wh = rh - 56;
      x.fillStyle = '#3c4650'; x.fillRect(wx, wy, ww, wh);
      x.fillStyle = 'rgba(180,205,225,0.25)'; x.fillRect(wx, wy, ww, wh * 0.45);
      x.fillStyle = '#7a8a86'; x.fillRect(wx - 16, wy, 13, wh); x.fillRect(wx + ww + 3, wy, 13, wh);
      x.fillStyle = '#d2cabd'; x.fillRect(wx - 6, wy + wh, ww + 12, 8);
      lit(wx, wy, ww, wh, 0.5);
    }
  } else if (style === 'metal') {
    for (let k = 0; k < S; k += 8) { const v = 120 + (k / 8 % 2) * 22; x.fillStyle = `rgb(${v * 0.92},${v},${v * 1.02})`; x.fillRect(k, 0, 8, S); }
    noise(x, S, S, 18);
    x.fillStyle = 'rgba(90,60,40,0.25)'; for (let k = 0; k < 30; k++) x.fillRect(Math.random() * S, Math.random() * S, 3, 30 + Math.random() * 80);
    for (let k = 0; k < cols; k++) { x.fillStyle = '#28323a'; x.fillRect(k * cw + 20, 20, cw - 40, 50); lit(k * cw + 20, 20, cw - 40, 50, 0.4); x.fillRect(k * cw + 20, 276, cw - 40, 50); lit(k * cw + 20, 276, cw - 40, 50, 0.3); }
  } else if (style === 'store') {
    x.fillStyle = '#2a2f36'; x.fillRect(0, 0, S, S);
    for (let k = 0; k < cols; k++) {
      x.fillStyle = '#7c858f'; x.fillRect(k * cw, 0, cw, S);
      x.fillStyle = '#1b2026'; x.fillRect(k * cw + 10, S * 0.18, cw - 20, S * 0.8);
      const g = x.createLinearGradient(0, S * 0.2, 0, S);
      g.addColorStop(0, 'rgba(255,230,190,0.35)'); g.addColorStop(1, 'rgba(255,240,215,0.05)');
      x.fillStyle = g; x.fillRect(k * cw + 10, S * 0.18, cw - 20, S * 0.8);
      x.fillStyle = 'rgba(30,30,30,0.6)'; for (let s = 0; s < 3; s++) x.fillRect(k * cw + 20, S * (0.45 + s * 0.17), cw - 40, 6);
      ex.fillStyle = `rgb(255,${210 + Math.random() * 40 | 0},${150 + Math.random() * 60 | 0})`; ex.fillRect(k * cw + 10, S * 0.18, cw - 20, S * 0.8);
    }
  }
  return { map: T.make(c), emissive: T.make(e) };
}
T.facades = () => { const out = {}; ['glass', 'office', 'brick', 'plaster', 'metal', 'store'].forEach(s => out[s] = facade(s)); return out; };
/* Signs atlas: 4x4 cells of invented brand names */
T.SIGNS = ['LUMEN CAFE', 'BYTE MARKET', 'OKRA & RYE', 'PHO REAL', 'VALE BOOKS', 'ATLAS GYM', 'NORI BAR', 'KETTLE & CO', 'PIXEL FIX', 'JUNIPER', 'MOON WASH', 'GRAIN BAKERY', 'HALCYON', 'DRIFT DINER', 'COPPER POT', 'NOVA MOBILE'];
T.signs = () => {
  const c = T.canvas(1024, 512), x = c.getContext('2d');
  const pal = ['#ff4f5e', '#ffd166', '#4ad3c4', '#9b8cff', '#ff8a3d', '#7ee081', '#f4f1e6', '#5ec2ff'];
  T.SIGNS.forEach((s, k) => {
    const cx = (k % 4) * 256, cy = Math.floor(k / 4) * 128;
    x.fillStyle = '#121418'; x.fillRect(cx + 4, cy + 4, 248, 120);
    x.fillStyle = pal[k % pal.length]; x.font = 'bold 34px "Arial Narrow", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = pal[k % pal.length]; x.shadowBlur = 12; x.fillText(s, cx + 128, cy + 64, 230); x.shadowBlur = 0;
  });
  return T.make(c);
};
T.ADS = [['VOLTA', 'Charge in 9 minutes', '#38e0b0'], ['CROSSTOWN CAB', 'Ride the whole harbor', '#ffc61a'], ['HARBOR DAYS', 'Pier festival · Sat', '#ff6b4a'], ['NOVA 7', 'The phone that listens less', '#8f8cff'], ['MERIDIAN BANK', 'Your money, plainly', '#59b6ff'], ['ORCHID AIR', 'Vale Intl → Everywhere', '#ff7ac8']];
T.ads = () => {
  const c = T.canvas(1024, 768), x = c.getContext('2d');
  T.ADS.forEach((a, k) => {
    const cx = (k % 2) * 512, cy = Math.floor(k / 2) * 256;
    const g = x.createLinearGradient(cx, cy, cx + 512, cy + 256); g.addColorStop(0, '#0d1117'); g.addColorStop(1, a[2]);
    x.fillStyle = g; x.fillRect(cx, cy, 512, 256);
    x.fillStyle = '#fff'; x.font = 'bold 70px Arial, sans-serif'; x.textAlign = 'left'; x.textBaseline = 'alphabetic';
    x.fillText(a[0], cx + 30, cy + 130, 460);
    x.font = '30px Arial, sans-serif'; x.globalAlpha = 0.85; x.fillText(a[1], cx + 32, cy + 190, 460); x.globalAlpha = 1;
    x.fillStyle = a[2]; x.fillRect(cx + 30, cy + 40, 60, 8);
  });
  return T.make(c);
};
T.taxiSign = () => {
  const c = T.canvas(256, 64), x = c.getContext('2d');
  x.fillStyle = '#fff6d6'; x.fillRect(0, 0, 256, 64);
  x.fillStyle = '#16181c'; x.font = 'bold 40px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('CROSSTOWN', 128, 34, 240);
  return T.make(c);
};

/* ---------- Save system ---------- */
const DEFAULT_SETTINGS = { quality: 'auto', volume: 0.7, radioVol: 0.5, station: 0, sens: 1, units: 'mph', fov: 68, shake: true, timeMode: 'cycle', weatherMode: 'auto', showFps: false, assist: true, post: true };
const SAVE_VERSION = 3;
const STARTER_CAR = 'sport', STARTER_PAINT = '#1b1d22'; // black Vanta GT
// Each step upgrades a save from version k to k + 1. Never edit a step once shipped; add a new one.
const MIGRATIONS = {
  1: d => { d.damage = d.damage || {}; d.fines = d.fines || 0; d.daily = null; d.tutorial = { done: (d.stats && d.stats.fares > 0) || false }; },
  // the cab is now a black Vanta GT for everyone; the old sedan stays in the garage
  2: d => { d.owned = Array.isArray(d.owned) ? d.owned : ['sedan']; if (d.owned.indexOf('sport') < 0) d.owned.push('sport'); d.current = 'sport'; d.paint = d.paint || {}; d.paint.sport = STARTER_PAINT; },
};
G.Save = {
  key: 'crosstown.save.v1', // key kept from v1 so existing careers carry over; the format version lives inside
  version: SAVE_VERSION,
  data: null,
  fresh() {
    return { version: SAVE_VERSION, cash: 250, xp: 0, owned: ['sedan', STARTER_CAR], current: STARTER_CAR, upgrades: {}, paint: { [STARTER_CAR]: STARTER_PAINT }, damage: {}, fines: 0, daily: null, tutorial: { done: false },
      stats: { fares: 0, earned: 0, failed: 0, bestStreak: 0, pedsHit: 0, escapes: 0, busted: 0, goals: 0 }, streak: 0, trip: 1, started: false, settings: Object.assign({}, DEFAULT_SETTINGS) };
  },
  migrate(d) {
    let v = typeof d.version === 'number' ? d.version : 1;
    if (v > SAVE_VERSION) return d; // written by a newer build: keep what we understand
    while (v < SAVE_VERSION) { if (MIGRATIONS[v]) MIGRATIONS[v](d); v++; }
    d.version = SAVE_VERSION;
    return d;
  },
  load() {
    let d = null;
    try { const s = localStorage.getItem(this.key); if (s) d = JSON.parse(s); } catch (e) { d = null; }
    if (!d || typeof d !== 'object') d = null;
    else { try { d = this.migrate(d); } catch (e) { d = null; } }
    const f = this.fresh();
    this.data = Object.assign(f, d || {});
    this.data.settings = Object.assign({}, DEFAULT_SETTINGS, (d && d.settings) || {});
    this.data.stats = Object.assign(this.fresh().stats, (d && d.stats) || {});
    // repair anything a hand-edited or half-written save could break
    const S = this.data;
    if (!isFinite(S.cash)) S.cash = 250;
    if (!isFinite(S.xp)) S.xp = 0;
    if (!Array.isArray(S.owned)) S.owned = ['sedan'];
    S.owned = S.owned.filter(k => G.VEHICLES ? !!G.VEHICLES[k] : true);
    if (S.owned.indexOf('sedan') < 0) S.owned.unshift('sedan');
    if (S.owned.indexOf(S.current) < 0) S.current = 'sedan';
    ['upgrades', 'paint', 'damage'].forEach(k => { if (!S[k] || typeof S[k] !== 'object') S[k] = {}; });
    if (!S.tutorial || typeof S.tutorial !== 'object') S.tutorial = { done: false };
    return this.data;
  },
  write() { try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) { /* storage unavailable: progress lives for this session */ } },
  hasProgress() { return !!(this.data && this.data.started); },
  reset() { const s = this.data.settings; this.data = this.fresh(); this.data.settings = s; this.write(); },
};
G.level = xp => Math.floor(Math.sqrt(xp / 120)) + 1;
G.levelXp = lv => (lv - 1) * (lv - 1) * 120;

/* ---------- Procedural audio ---------- */
const A = G.Audio = {
  ctx: null, ok: false,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const ctx = this.ctx = new AC();
      const master = this.master = ctx.createGain(); master.gain.value = G.Save.data.settings.volume; master.connect(ctx.destination);
      const comp = ctx.createDynamicsCompressor(); comp.connect(master); this.out = comp;
      // white noise buffer
      const nb = this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = nb.getChannelData(0);
      for (let k = 0; k < nd.length; k++) nd[k] = Math.random() * 2 - 1;
      const brown = this.brownBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), bd = brown.getChannelData(0); let last = 0;
      for (let k = 0; k < bd.length; k++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; bd[k] = last * 3.5; }
      const loop = (buf) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };
      // engine
      this.eGain = ctx.createGain(); this.eGain.gain.value = 0;
      this.eFilter = ctx.createBiquadFilter(); this.eFilter.type = 'lowpass'; this.eFilter.frequency.value = 600; this.eFilter.Q.value = 3;
      this.o1 = ctx.createOscillator(); this.o1.type = 'sawtooth';
      this.o2 = ctx.createOscillator(); this.o2.type = 'square';
      this.o3 = ctx.createOscillator(); this.o3.type = 'sine';
      const g1 = ctx.createGain(); g1.gain.value = 0.35; const g2 = ctx.createGain(); g2.gain.value = 0.18; const g3 = ctx.createGain(); g3.gain.value = 0.6;
      this.o1.connect(g1).connect(this.eFilter); this.o2.connect(g2).connect(this.eFilter); this.o3.connect(g3).connect(this.eFilter);
      this.eFilter.connect(this.eGain).connect(comp);
      [this.o1, this.o2, this.o3].forEach(o => o.start());
      // tires
      this.tGain = ctx.createGain(); this.tGain.gain.value = 0;
      const tf = ctx.createBiquadFilter(); tf.type = 'bandpass'; tf.frequency.value = 1500; tf.Q.value = 4;
      loop(this.noiseBuf).connect(tf).connect(this.tGain).connect(comp);
      // road / wind
      this.wGain = ctx.createGain(); this.wGain.gain.value = 0;
      const wf = ctx.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 700;
      loop(this.brownBuf).connect(wf).connect(this.wGain).connect(comp);
      // rain
      this.rGain = ctx.createGain(); this.rGain.gain.value = 0;
      const rf = ctx.createBiquadFilter(); rf.type = 'highpass'; rf.frequency.value = 1200;
      loop(this.noiseBuf).connect(rf).connect(this.rGain).connect(comp);
      // city ambience
      this.aGain = ctx.createGain(); this.aGain.gain.value = 0.05;
      const af = ctx.createBiquadFilter(); af.type = 'lowpass'; af.frequency.value = 380;
      loop(this.brownBuf).connect(af).connect(this.aGain).connect(comp);
      this.ok = true;
    } catch (e) { this.ok = false; }
  },
  setVolume(v) { if (this.master) this.master.gain.value = v; },
  update(s) {
    if (!this.ok) return;
    const t = this.ctx.currentTime, k = 0.08;
    const f = 38 + s.rpm * 0.028;
    this.o1.frequency.setTargetAtTime(f, t, k); this.o2.frequency.setTargetAtTime(f * 0.5, t, k); this.o3.frequency.setTargetAtTime(f * 0.5, t, k);
    this.eFilter.frequency.setTargetAtTime(380 + s.rpm * 0.22 + s.throttle * 900, t, k);
    this.eGain.gain.setTargetAtTime(s.active ? 0.05 + s.throttle * 0.07 + s.rpm / 7000 * 0.05 : 0, t, 0.15);
    this.tGain.gain.setTargetAtTime(s.active ? M.clamp((s.slip - 2.5) / 8, 0, 0.22) : 0, t, 0.05);
    this.wGain.gain.setTargetAtTime(s.active ? M.clamp(s.speed / 50, 0, 1) * 0.35 : 0, t, 0.2);
    this.rGain.gain.setTargetAtTime(s.rain * 0.12, t, 0.5);
  },
  env(type, freq, dur, vol, slide) {
    if (!this.ok) return; const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + dur + 0.05);
  },
  burst(dur, vol, freq, q) {
    if (!this.ok) return; const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq || 400; f.Q.value = q || 1;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.out); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  },
  crash(i) { this.burst(0.35, M.clamp(i / 12, 0.1, 0.9), 220, 0.7); this.env('square', 70, 0.25, M.clamp(i / 30, 0.05, 0.3), 40); },
  door(open) { this.burst(0.12, 0.35, open ? 900 : 300, 2); if (!open) this.env('sine', 90, 0.18, 0.4, 50); },
  chime(kind) {
    const seq = { accept: [660, 880], board: [523, 659, 784], done: [523, 659, 784, 1046], fail: [440, 330], ui: [880], gps: [988, 740], buy: [784, 1046, 1318] }[kind] || [880];
    seq.forEach((f, k) => setTimeout(() => this.env('sine', f, 0.28, 0.16), k * 110));
  },
  horn() { this.env('square', 392, 0.35, 0.12); this.env('square', 466, 0.35, 0.1); },
  thud(i) { this.burst(0.18, M.clamp(i / 14, 0.15, 0.7), 160, 1.2); this.env('sine', 110, 0.2, M.clamp(i / 20, 0.1, 0.4), 45); },
  // police siren: a wailing two-oscillator voice; vol 0 silences it
  siren(vol, t) {
    if (!this.ok) return; const ctx = this.ctx, now = ctx.currentTime;
    if (!this.sGain) {
      this.sGain = ctx.createGain(); this.sGain.gain.value = 0;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 0.8;
      this.s1 = ctx.createOscillator(); this.s1.type = 'sawtooth'; this.s2 = ctx.createOscillator(); this.s2.type = 'square';
      const g2 = ctx.createGain(); g2.gain.value = 0.35;
      this.s1.connect(f); this.s2.connect(g2).connect(f); f.connect(this.sGain).connect(this.out);
      this.s1.start(); this.s2.start();
    }
    const fr = 720 + 380 * Math.sin(t * 2.4);
    this.s1.frequency.setTargetAtTime(fr, now, 0.03); this.s2.frequency.setTargetAtTime(fr * 1.5, now, 0.03);
    this.sGain.gain.setTargetAtTime(vol * 0.09, now, 0.15);
  },
};
})();
