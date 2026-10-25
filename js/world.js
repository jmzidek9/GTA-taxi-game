/* CROSSTOWN — world: city generation, road graph, sky, lighting, weather */
'use strict';
(function () {
const G = window.G, C = G.CFG, M = G.M, GB = G.GB, T = G.Tex;
const RP = G.roadPos;
const W = G.World = {};
const NN = C.N + 1; // nodes per axis

/* ---------- Districts and lot layout ---------- */
const MERGED = [
  { bi0: 6, bi1: 7, bj0: 4, bj1: 5, kind: 'airport' },
  { bi0: 3, bi1: 4, bj0: 5, bj1: 5, kind: 'park' },
];
function districtOf(bi, bj) {
  if (bj === 7) return 'harbor';
  if (bi <= 2 && bj <= 2) return 'industrial';
  if ((bi >= 3 && bi <= 4 && bj >= 1 && bj <= 4) || (bi === 5 && bj >= 3 && bj <= 4)) return 'downtown';
  if (bi >= 5 && bj <= 2) return 'upscale';
  if (bi <= 2) return 'residential';
  return 'commercial';
}
W.DISTRICT_NAMES = { downtown: 'Financial Core', commercial: 'Market Row', residential: 'Elm Heights', upscale: 'Crown Hill', industrial: 'Ironworks', harbor: 'Harborfront', airport: 'Vale Intl. Airport', park: 'Linden Park' };

W.lots = []; W.nodes = []; W.solids = [];
function buildLayout() {
  const used = {};
  for (const m of MERGED) {
    for (let a = m.bi0; a <= m.bi1; a++) for (let b = m.bj0; b <= m.bj1; b++) used[a + ',' + b] = true;
    W.lots.push(Object.assign({ district: m.kind }, m));
  }
  for (let a = 0; a < C.N; a++) for (let b = 0; b < C.N; b++) if (!used[a + ',' + b]) W.lots.push({ bi0: a, bi1: a, bj0: b, bj1: b, kind: 'block', district: districtOf(a, b) });
  for (const L of W.lots) {
    L.x0 = RP(L.bi0) + C.ROAD / 2; L.x1 = RP(L.bi1 + 1) - C.ROAD / 2;
    L.z0 = RP(L.bj0) + C.ROAD / 2; L.z1 = RP(L.bj1 + 1) - C.ROAD / 2;
    L.cx = (L.x0 + L.x1) / 2; L.cz = (L.z0 + L.z1) / 2;
    W.solids.push({ x0: L.x0, z0: L.z0, x1: L.x1, z1: L.z1, lot: L });
  }
  // nodes
  const removed = {};
  for (const m of MERGED) for (let i = m.bi0 + 1; i <= m.bi1; i++) for (let j = m.bj0 + 1; j <= m.bj1; j++) removed[i + ',' + j] = true;
  for (let i = 0; i < NN; i++) for (let j = 0; j < NN; j++) W.nodes.push({ id: i * NN + j, i, j, x: RP(i), z: RP(j), nb: [], alive: !removed[i + ',' + j] });
  const cut = (i, j, i2, j2) => {
    for (const m of MERGED) {
      if (i === i2 && i > m.bi0 && i <= m.bi1 && Math.min(j, j2) >= m.bj0 && Math.max(j, j2) <= m.bj1 + 1) return true;
      if (j === j2 && j > m.bj0 && j <= m.bj1 && Math.min(i, i2) >= m.bi0 && Math.max(i, i2) <= m.bi1 + 1) return true;
    }
    return false;
  };
  W.edges = [];
  for (let i = 0; i < NN; i++) for (let j = 0; j < NN; j++) {
    const a = W.node(i, j); if (!a.alive) continue;
    if (i + 1 < NN && W.node(i + 1, j).alive && !cut(i, j, i + 1, j)) link(a, W.node(i + 1, j));
    if (j + 1 < NN && W.node(i, j + 1).alive && !cut(i, j, i, j + 1)) link(a, W.node(i, j + 1));
  }
  function link(a, b) { a.nb.push(b.id); b.nb.push(a.id); W.edges.push([a.id, b.id]); }
}
W.node = (i, j) => W.nodes[i * NN + j];
W.hasEdge = (a, b) => W.nodes[a].nb.indexOf(b) >= 0;

/* ---------- Pathfinding (Dijkstra, graph is tiny) ---------- */
W.route = (starts, goals) => {
  // starts/goals: [{id, cost}] ; returns {nodes:[ids], cost}
  const n = W.nodes.length, dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
  for (const s of starts) if (s.cost < dist[s.id]) dist[s.id] = s.cost;
  const goalCost = {}; goals.forEach(g => goalCost[g.id] = g.cost);
  let best = Infinity, bestId = -1;
  for (;;) {
    let u = -1, du = Infinity;
    for (let k = 0; k < n; k++) if (!done[k] && dist[k] < du) { du = dist[k]; u = k; }
    if (u < 0 || du >= best) break;
    done[u] = 1;
    if (goalCost[u] !== undefined && du + goalCost[u] < best) { best = du + goalCost[u]; bestId = u; }
    const A = W.nodes[u];
    for (const v of A.nb) { const B = W.nodes[v]; const d = du + Math.abs(A.x - B.x) + Math.abs(A.z - B.z); if (d < dist[v]) { dist[v] = d; prev[v] = u; } }
  }
  if (bestId < 0) return null;
  const path = []; for (let u = bestId; u >= 0; u = prev[u]) path.push(u);
  path.reverse();
  return { nodes: path, cost: best };
};
// closest road segment to a point -> {a,b,t,x,z,d}
W.nearestEdge = (x, z) => {
  let best = null;
  for (const [a, b] of W.edges) {
    const A = W.nodes[a], B = W.nodes[b];
    const dx = B.x - A.x, dz = B.z - A.z, L2 = dx * dx + dz * dz;
    const t = M.clamp(((x - A.x) * dx + (z - A.z) * dz) / L2, 0, 1);
    const px = A.x + dx * t, pz = A.z + dz * t, d = Math.hypot(x - px, z - pz);
    if (!best || d < best.d) best = { a, b, t, x: px, z: pz, d };
  }
  return best;
};
// full route polyline from a world point to a world point (both on/near roads)
W.routeBetween = (x0, z0, x1, z1) => {
  const e0 = W.nearestEdge(x0, z0), e1 = W.nearestEdge(x1, z1);
  const A0 = W.nodes[e0.a], B0 = W.nodes[e0.b], A1 = W.nodes[e1.a], B1 = W.nodes[e1.b];
  const same = (e0.a === e1.a && e0.b === e1.b);
  const direct = Math.hypot(x0 - x1, z0 - z1);
  const r = W.route(
    [{ id: e0.a, cost: Math.hypot(x0 - A0.x, z0 - A0.z) }, { id: e0.b, cost: Math.hypot(x0 - B0.x, z0 - B0.z) }],
    [{ id: e1.a, cost: Math.hypot(x1 - A1.x, z1 - A1.z) }, { id: e1.b, cost: Math.hypot(x1 - B1.x, z1 - B1.z) }]);
  if (same && (!r || direct <= r.cost)) return { pts: [[x0, z0], [x1, z1]], len: direct };
  if (!r) return { pts: [[x0, z0], [x1, z1]], len: direct };
  const pts = [[e0.x, e0.z]];
  if (Math.hypot(x0 - e0.x, z0 - e0.z) > 0.5) pts.unshift([x0, z0]);
  for (const id of r.nodes) pts.push([W.nodes[id].x, W.nodes[id].z]);
  pts.push([e1.x, e1.z]); pts.push([x1, z1]);
  // remove backtracking first point if it lies between first node and second
  return { pts, len: r.cost };
};

/* ---------- Collision against lots + map edges ---------- */
W.collideCircle = (x, z, r) => {
  // returns {x,z,nx,nz,depth} of the deepest penetration or null
  let res = null;
  for (const s of W.solids) {
    if (x < s.x0 - r || x > s.x1 + r || z < s.z0 - r || z > s.z1 + r) continue;
    const cx = M.clamp(x, s.x0, s.x1), cz = M.clamp(z, s.z0, s.z1);
    let dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz), nx, nz, depth;
    if (d === 0) { // center inside: push out the shortest way
      const opts = [[x - s.x0, -1, 0], [s.x1 - x, 1, 0], [z - s.z0, 0, -1], [s.z1 - z, 0, 1]].sort((p, q) => p[0] - q[0])[0];
      nx = opts[1]; nz = opts[2]; depth = opts[0] + r;
    } else { if (d >= r) continue; nx = dx / d; nz = dz / d; depth = r - d; }
    if (!res || depth > res.depth) res = { nx, nz, depth };
  }
  const H = C.HALF;
  const edge = [[x - r - -H, 1, 0], [H - (x + r), -1, 0], [z - r - -H, 0, 1], [H - (z + r), 0, -1]];
  for (const e of edge) if (e[0] < 0 && (!res || -e[0] > res.depth)) res = { nx: e[1], nz: e[2], depth: -e[0] };
  return res;
};
W.insideSolid = (x, z, m) => { m = m || 0; for (const s of W.solids) if (x > s.x0 + m && x < s.x1 - m && z > s.z0 + m && z < s.z1 - m) return s; return null; };
W.onRoad = (x, z) => Math.abs(x) < C.HALF && Math.abs(z) < C.HALF && !W.insideSolid(x, z, 0);

/* ---------- Named places (pickup / drop-off points) ---------- */
const NAMES = {
  downtown: ['Meridian Tower', 'Halden Exchange', 'Civic Plaza', 'Sterling Building', 'Ardent Trust Tower', 'Union Square Lobby', 'Courthouse Steps', 'Beacon Offices', 'Granite One'],
  commercial: ['Copper Pot Diner', 'Market Row Arcade', 'Lumen Cafe', 'Vale Books', 'Pho Real', 'Atlas Gym', 'Night Owl Cinema', 'Grain Bakery', 'Byte Market', 'Kettle & Co', 'Juniper Florist', 'Orbit Records'],
  residential: ['14 Elm Street', 'Birchwood Court', 'Maple Row Houses', 'Sycamore Lane', 'Linden Terrace', 'Hazel Apartments', 'Cedar Close', 'Willow Walk', 'Ash Grove Flats'],
  upscale: ['Crown Hill Residences', 'The Aurelian Hotel', 'Belvedere Gallery', 'Regent Club', 'Solace Spa', 'Ivory Penthouses', 'Marquis Hotel', 'Opal Lounge'],
  industrial: ['Ironworks Gate 2', 'Foundry Lofts', 'Dock Freight Office', 'Kiln Brewery', 'Steelyard Studios', 'Rail Depot', 'Ironworks Warehouse 9'],
  harbor: ['Pier 3 Ferry', 'Harbor Fish Market', 'Lighthouse Promenade', 'Saltwind Hotel', 'Marina Club', 'Boardwalk Arcade', 'Tidewater Cafe', 'Pier 7 Lookout'],
  airport: ['Vale Intl. Terminal A', 'Vale Intl. Terminal B', 'Airport Car Rental'],
  park: ['Linden Park Gate', 'Park Bandstand', 'Lakeside Pavilion'],
};
W.places = [];
function buildPlaces() {
  const r = M.rng(77); const usedNames = {};
  const takeName = d => { const list = NAMES[d]; for (let k = 0; k < list.length; k++) { const n = list[(k + Math.floor(r() * list.length)) % list.length]; if (!usedNames[n]) { usedNames[n] = 1; return n; } } return null; };
  for (const L of W.lots) {
    const sides = [];
    // north side (z0): road j = bj0, segments i..i+1 for i in bi0..bi1
    for (let i = L.bi0; i <= L.bi1; i++) sides.push({ a: W.node(i, L.bj0), b: W.node(i + 1, L.bj0), side: 'n' });
    for (let i = L.bi0; i <= L.bi1; i++) sides.push({ a: W.node(i, L.bj1 + 1), b: W.node(i + 1, L.bj1 + 1), side: 's' });
    for (let j = L.bj0; j <= L.bj1; j++) sides.push({ a: W.node(L.bi0, j), b: W.node(L.bi0, j + 1), side: 'w' });
    for (let j = L.bj0; j <= L.bj1; j++) sides.push({ a: W.node(L.bi1 + 1, j), b: W.node(L.bi1 + 1, j + 1), side: 'e' });
    const valid = sides.filter(s => s.a.alive && s.b.alive && W.hasEdge(s.a.id, s.b.id));
    const count = L.district === 'airport' ? 3 : (L.district === 'park' ? 2 : 1);
    for (let k = 0; k < count && valid.length; k++) {
      const s = valid.splice(Math.floor(r() * valid.length), 1)[0];
      const name = takeName(L.district); if (!name) break;
      const t = 0.35 + r() * 0.3;
      const mx = M.lerp(s.a.x, s.b.x, t), mz = M.lerp(s.a.z, s.b.z, t);
      let stand, stop, face;
      if (s.side === 'n') { stand = [mx, L.z0 + 1.6]; stop = [mx, L.z0 - C.LANE]; face = Math.PI; }
      if (s.side === 's') { stand = [mx, L.z1 - 1.6]; stop = [mx, L.z1 + C.LANE]; face = 0; }
      if (s.side === 'w') { stand = [L.x0 + 1.6, mz]; stop = [L.x0 - C.LANE, mz]; face = -Math.PI / 2; }
      if (s.side === 'e') { stand = [L.x1 - 1.6, mz]; stop = [L.x1 + C.LANE, mz]; face = Math.PI / 2; }
      // walk-away point deeper into lot
      const inward = [stand[0] + (L.cx - stand[0]) * 0.12, stand[1] + (L.cz - stand[1]) * 0.12];
      W.places.push({ id: W.places.length, name, district: L.district, dname: W.DISTRICT_NAMES[L.district], x: stand[0], z: stand[1], sx: stop[0], sz: stop[1], face, inward, lot: L });
    }
  }
}

/* ---------- Materials ---------- */
const mats = W.mats = {};
function makeMaterials() {
  const fac = T.facades();
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const asphaltTex = T.asphalt(); asphaltTex.repeat.set(C.SIZE / 10, C.SIZE / 10);
  mats.asphalt = std({ map: asphaltTex, roughness: 0.92, metalness: 0.0, color: 0xffffff });
  W.puddleTex = T.puddles();
  mats.sidewalk = std({ map: T.concrete(), roughness: 0.9, vertexColors: true });
  mats.grass = std({ map: T.grass(), roughness: 1, color: 0xffffff });
  mats.roof = std({ map: T.roof(), roughness: 0.95, vertexColors: true });
  const fm = (k, o) => std(Object.assign({ map: fac[k].map, emissiveMap: fac[k].emissive, emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true, roughness: 0.75 }, o || {}));
  mats.glass = fm('glass', { roughness: 0.12, metalness: 0.65 });
  mats.office = fm('office', { roughness: 0.6, metalness: 0.15 });
  mats.brick = fm('brick', { roughness: 0.85 });
  mats.plaster = fm('plaster', { roughness: 0.85 });
  mats.metal = fm('metal', { roughness: 0.55, metalness: 0.35 });
  mats.store = fm('store', { roughness: 0.3, metalness: 0.2 });
  mats.solid = std({ vertexColors: true, roughness: 0.7, metalness: 0.05 });
  mats.metalSolid = std({ vertexColors: true, roughness: 0.35, metalness: 0.7 });
  mats.foliage = std({ vertexColors: true, roughness: 0.9, flatShading: true });
  mats.lamp = std({ color: 0x222222, emissive: 0xffd7a0, emissiveIntensity: 0, roughness: 0.4 });
  const signs = T.signs(); mats.signs = std({ map: signs, emissiveMap: signs, emissive: 0xffffff, emissiveIntensity: 0.3, roughness: 0.4 });
  const ads = T.ads(); mats.ads = std({ map: ads, emissiveMap: ads, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.4 });
  mats.markings = std({ vertexColors: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  mats.pool = new THREE.MeshBasicMaterial({ map: T.radial('rgba(255,214,150,1)'), color: 0xffcf8a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const wt = T.water(); wt.repeat.set(60, 60);
  mats.water = std({ color: 0x1d4a63, roughness: 0.12, metalness: 0.4, map: wt, transparent: false });
  mats.ground = std({ color: 0x3c4a33, roughness: 1 });
  mats.runway = std({ map: asphaltTex.clone(), roughness: 0.85, color: 0x8a8a8a });
  mats.runway.map.repeat.set(8, 8); mats.runway.map.needsUpdate = true;
  // traffic light lamps: axis x state
  ['ns', 'ew'].forEach(ax => ['r', 'y', 'g'].forEach(s => { mats['tl_' + ax + s] = new THREE.MeshBasicMaterial({ color: 0x222222 }); }));
  W.nightMats = [mats.glass, mats.office, mats.brick, mats.plaster, mats.metal];
}

/* ---------- City geometry ---------- */
let BK; // buckets
const tint = (r, base, spread) => { const c = new THREE.Color(base); const hsl = {}; c.getHSL(hsl); c.setHSL(hsl.h + (r() - 0.5) * spread * 0.1, M.clamp(hsl.s + (r() - 0.5) * spread * 0.3, 0, 1), M.clamp(hsl.l + (r() - 0.5) * spread * 0.25, 0, 1)); return c; };

function addTower(r, x, z, w, d, h, facKey, roofTint, opts) {
  opts = opts || {};
  const gb = BK.get(facKey, x, z), roofGb = BK.get('roof', x, z);
  const modW = T.BAY * 4, modH = T.FLOOR * 4;
  gb.setColor(opts.tint || '#ffffff'); roofGb.setColor(roofTint || '#bbbbbb');
  const base = opts.y0 || 0;
  gb.box(x, base, z, w, h, d, { modW, modH, uOff: Math.floor(r() * 4) / 4, vOff: 0, topTo: roofGb, topUV: 8 });
  const trim = BK.get('solid', x, z);
  trim.setColor('#30343a');
  trim.box(x, base + h, z, w + 0.4, 0.6, d + 0.4, {}); // parapet cap
  // rooftop machinery
  const n = 1 + Math.floor(r() * 3);
  for (let k = 0; k < n; k++) {
    trim.setColor(M.pick(r, ['#8b9096', '#6c7178', '#a3a7ab']));
    trim.box(x + (r() - 0.5) * w * 0.6, base + h + 0.6, z + (r() - 0.5) * d * 0.6, 2 + r() * 3, 1.2 + r() * 2.2, 2 + r() * 3, {});
  }
  return base + h;
}
function addSteppedTower(r, x, z, w, d, h, facKey) {
  // base podium + shaft + crown
  const tintC = '#' + tint(r, '#ffffff', 0.4).getHexString();
  const podH = T.FLOOR * 3;
  addTower(r, x, z, w, d, podH, facKey === 'glass' ? 'office' : facKey, '#9a9a9a', { tint: '#dedad2' });
  const sw = w * (0.72 + r() * 0.15), sd = d * (0.72 + r() * 0.15);
  let top = addTower(r, x, z, sw, sd, h - podH, facKey, '#888', { y0: podH, tint: tintC });
  if (h > 70 && r() < 0.8) {
    top = addTower(r, x, z, sw * 0.7, sd * 0.7, 8 + r() * 14, facKey, '#777', { y0: top + 0.6, tint: tintC });
    const t = BK.get('metalSolid', x, z); t.setColor('#c9ced4');
    t.addGeo(new THREE.CylinderGeometry(0.25, 0.4, 10 + r() * 14, 6), G.mat(x, top + 6, z));
    W.beacons.push([x, top + 13, z]);
  }
}
function addHouse(r, x, z, w, d, faceAngle) {
  const wall = '#' + tint(r, M.pick(r, ['#e9dcc4', '#c9d6dc', '#e4c9b4', '#d5dcc8', '#f0e8dc']), 0.6).getHexString();
  const h = T.FLOOR * (r() < 0.5 ? 1.9 : 2.3);
  const gb = BK.get('plaster', x, z); gb.setColor(wall);
  gb.box(x, 0.18, z, w, h, d, { modW: T.BAY * 4, modH: T.FLOOR * 4, uOff: 0, topTo: BK.get('roof', x, z), topUV: 6 });
  // gable roof as extruded triangle
  const roofCol = M.pick(r, ['#5a3b33', '#3e4650', '#6b4a2e', '#4b4b4b']);
  const s = new THREE.Shape(); s.moveTo(-w / 2 - 0.5, 0); s.lineTo(w / 2 + 0.5, 0); s.lineTo(0, 2.6 + r()); s.closePath();
  const rg = new THREE.ExtrudeGeometry(s, { depth: d + 0.8, bevelEnabled: false });
  const sol = BK.get('solid', x, z); sol.setColor(roofCol);
  sol.addGeo(rg, G.mat(x, h + 0.18, z - d / 2 - 0.4));
  // porch + door
  sol.setColor('#5b4636');
  const fx = Math.sin(faceAngle), fz = Math.cos(faceAngle);
  sol.box(x + fx * (d / 2 + 0.05), 0.18, z + fz * (d / 2 + 0.05), Math.abs(fz) > 0.5 ? 1.2 : 0.2, 2.2, Math.abs(fz) > 0.5 ? 0.2 : 1.2, {});
  // chimney
  sol.setColor('#7d4b3a'); sol.box(x + w * 0.25, h, z, 0.8, 3.4, 0.8, {});
}
function tree(r, x, z, scale, palm) {
  const t = BK.get('solid', x, z), f = BK.get('foliage', x, z);
  scale = scale || 1;
  if (palm) {
    t.setColor('#7a6248');
    t.addGeo(new THREE.CylinderGeometry(0.16 * scale, 0.26 * scale, 7 * scale, 6), G.mat(x, 3.5 * scale, z, (r() - 0.5) * 0.15, 0, (r() - 0.5) * 0.15));
    f.setColor(tint(r, '#3f7a3a', 0.6));
    for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; f.addGeo(new THREE.BoxGeometry(0.5 * scale, 0.08, 3.2 * scale), G.mat(x + Math.sin(a) * 1.4 * scale, 7 * scale - 0.4, z + Math.cos(a) * 1.4 * scale, -0.35, a, 0)); }
    return;
  }
  const th = (2.2 + r() * 1.2) * scale;
  t.setColor('#5c4535');
  t.addGeo(new THREE.CylinderGeometry(0.16 * scale, 0.24 * scale, th, 6), G.mat(x, th / 2, z));
  f.setColor(tint(r, M.pick(r, ['#47713a', '#3c6a3f', '#5b7d3a', '#36603a', '#6b8a3e']), 0.8));
  const R = (1.8 + r() * 1.2) * scale;
  const geo = new THREE.IcosahedronGeometry(R, 1);
  f.addGeo(geo, G.mat(x, th + R * 0.7, z, r(), r(), 0, 1, 0.9 + r() * 0.3, 1));
  if (r() < 0.6) f.addGeo(geo, G.mat(x + (r() - 0.5) * R, th + R * 1.2, z + (r() - 0.5) * R, r(), r(), 0, 0.65, 0.6, 0.65));
}
function streetLamp(x, z, ax, az) {
  // ax/az: direction toward road
  const t = BK.get('metalSolid', x, z); t.setColor('#3a3f45');
  t.addGeo(new THREE.CylinderGeometry(0.1, 0.16, 7, 6), G.mat(x, 3.5 + 0.18, z));
  t.box(x + ax * 1.1, 7, z + az * 1.1, Math.abs(ax) * 2.2 + 0.14, 0.14, Math.abs(az) * 2.2 + 0.14, {});
  const hx = x + ax * 2.1, hz = z + az * 2.1;
  BK.get('lamp', x, z).box(hx, 6.75, hz, 0.7, 0.22, 0.7, { bottom: true });
  W.lampHeads.push([hx, 6.7, hz]);
  const p = BK.get('pool', hx, hz); const R = 6;
  p.flat(hx - R, hz - R, hx + R, hz + R, 0.06);
}
// hydrants, bins and newspaper boxes along the curb
function streetProps(r, sol, x, z, district) {
  const k = r();
  if (k < 0.2) {
    sol.setColor(district === 'upscale' ? '#c9a640' : '#b8322a');
    sol.addGeo(new THREE.CylinderGeometry(0.16, 0.19, 0.62, 8), G.mat(x, 0.49, z));
    sol.addGeo(new THREE.SphereGeometry(0.17, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), G.mat(x, 0.8, z));
    sol.addGeo(new THREE.CylinderGeometry(0.06, 0.06, 0.44, 6), G.mat(x, 0.6, z, 0, 0, Math.PI / 2));
  } else if (k < 0.42) {
    sol.setColor(district === 'industrial' ? '#4a4f55' : '#2d4a3a');
    sol.addGeo(new THREE.CylinderGeometry(0.3, 0.26, 0.95, 10), G.mat(x, 0.66, z));
    sol.setColor('#1e2226'); sol.addGeo(new THREE.CylinderGeometry(0.33, 0.33, 0.06, 10), G.mat(x, 1.15, z));
  } else if (k < 0.5 && (district === 'downtown' || district === 'commercial')) {
    sol.setColor(M.pick(r, ['#2f62b3', '#c23b33', '#e0b030']));
    sol.box(x, 0.18, z, 0.5, 1.05, 0.45, {});
  }
}
function bench(x, z, rot) { const t = BK.get('solid', x, z); t.setColor('#5a4535'); t.addGeo(new THREE.BoxGeometry(1.8, 0.1, 0.5), G.mat(x, 0.65, z, 0, rot, 0)); t.addGeo(new THREE.BoxGeometry(1.8, 0.5, 0.08), G.mat(x - Math.sin(rot + Math.PI / 2) * 0, 0.95, z, 0, rot, 0)); t.setColor('#2f3236'); t.addGeo(new THREE.BoxGeometry(1.6, 0.5, 0.4), G.mat(x, 0.43, z, 0, rot, 0)); }

function buildLot(L, r) {
  const sw = BK.get('sidewalk', L.cx, L.cz);
  const inner = { x0: L.x0 + C.SW, z0: L.z0 + C.SW, x1: L.x1 - C.SW, z1: L.z1 - C.SW };
  // curb + sidewalk slab
  sw.setColor(L.district === 'upscale' ? '#d8d2c6' : L.district === 'industrial' ? '#a6a39c' : '#c8c4bb');
  sw.box(L.cx, 0, L.cz, L.x1 - L.x0, 0.18, L.z1 - L.z0, { topUV: 4 });
  const sol = BK.get('solid', L.cx, L.cz);
  // street lamps + trees along sidewalk
  const perim = [['n', L.x0, L.z0 + 0.8, L.x1, L.z0 + 0.8, 0, -1], ['s', L.x0, L.z1 - 0.8, L.x1, L.z1 - 0.8, 0, 1], ['w', L.x0 + 0.8, L.z0, L.x0 + 0.8, L.z1, -1, 0], ['e', L.x1 - 0.8, L.z0, L.x1 - 0.8, L.z1, 1, 0]];
  for (const p of perim) {
    const len = Math.hypot(p[3] - p[1], p[4] - p[2]); const n = Math.max(1, Math.floor(len / 26));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n; const x = M.lerp(p[1], p[3], t), z = M.lerp(p[2], p[4], t);
      if (L.district !== 'airport') streetLamp(x, z, p[5], p[6]);
      if (L.district !== 'industrial' && L.district !== 'airport') {
        const t2 = (k + 1) / n; if (t2 < 0.98) tree(r, M.lerp(p[1], p[3], t2) - p[5] * 0.3, M.lerp(p[2], p[4], t2) - p[6] * 0.3, 0.75, L.district === 'harbor');
      }
      if (r() < 0.25 && L.district !== 'industrial') { sol.setColor('#2e5d3a'); sol.box(M.lerp(p[1], p[3], t + 0.2 / n), 0.18, M.lerp(p[2], p[4], t + 0.2 / n), 0.5, 0.9, 0.5, {}); }
      if (L.district !== 'airport') streetProps(r, sol, M.lerp(p[1], p[3], t + 0.33 / n), M.lerp(p[2], p[4], t + 0.33 / n), L.district);
    }
  }
  const d = L.district;
  const iw = inner.x1 - inner.x0, idp = inner.z1 - inner.z0, icx = (inner.x0 + inner.x1) / 2, icz = (inner.z0 + inner.z1) / 2;
  if (d === 'downtown' || d === 'upscale') {
    // plaza ground
    const split = r() < 0.5 ? 1 : 2;
    for (let k = 0; k < split; k++) {
      const w = split === 1 ? iw * 0.8 : iw * 0.42, dd = idp * (0.6 + r() * 0.25);
      const x = split === 1 ? icx : (k === 0 ? inner.x0 + w / 2 + 1 : inner.x1 - w / 2 - 1), z = icz + (r() - 0.5) * (idp - dd) * 0.5;
      const h = d === 'downtown' ? 55 + r() * 95 : 35 + r() * 55;
      if (d === 'upscale' && r() < 0.35) {
        const gb = BK.get('glass', x, z); gb.setColor('#e6d7b8');
        const R = Math.min(w, dd) * 0.45;
        const cyl = new THREE.CylinderGeometry(R, R, h, 20, 1, true);
        // scale uvs to facade modules
        const uv = cyl.attributes.uv; for (let q = 0; q < uv.count; q++) uv.setXY(q, uv.getX(q) * (2 * Math.PI * R) / (T.BAY * 4), uv.getY(q) * h / (T.FLOOR * 4));
        gb.addGeo(cyl, G.mat(x, h / 2 + 0.18, z));
        const rf = BK.get('solid', x, z); rf.setColor('#c2a66b'); rf.addGeo(new THREE.CylinderGeometry(R + 0.4, R + 0.4, 1.2, 20), G.mat(x, h + 0.7, z));
        rf.setColor('#f0e2c0'); rf.addGeo(new THREE.CylinderGeometry(R * 0.6, R * 0.8, 6, 20), G.mat(x, h + 4, z));
      } else addSteppedTower(r, x, z, w, dd, h, d === 'upscale' ? (r() < 0.6 ? 'glass' : 'office') : (r() < 0.65 ? 'glass' : 'office'));
      if (d === 'upscale') { sol.setColor('#c2a66b'); sol.box(x, 0.18, z + dd / 2 + 2.5, w * 0.5, 3.6, 0.3, {}); }
    }
    // plaza trees + benches
    for (let k = 0; k < 3; k++) tree(r, inner.x0 + 3 + r() * (iw - 6), inner.z1 - 3 - r() * 4, 0.8);
    bench(icx, inner.z1 - 1.6, 0);
    if (r() < 0.5) addBillboard(r, inner.x0 + 4, inner.z0 + 4, 30 + r() * 20);
  } else if (d === 'commercial' || d === 'harbor') {
    // row of shops around perimeter facing streets
    const rowDepth = 16;
    const sides = [['n', inner.x0, inner.x1, inner.z0], ['s', inner.x0, inner.x1, inner.z1], ['w', inner.z0 + rowDepth, inner.z1 - rowDepth, inner.x0], ['e', inner.z0 + rowDepth, inner.z1 - rowDepth, inner.x1]];
    for (const s of sides) {
      let a = s[1];
      while (a < s[2] - 5) {
        const len = Math.min(s[2] - a, 9 + r() * 10);
        const h = d === 'harbor' ? 7 + r() * 9 : 9 + r() * 18;
        const fk = d === 'harbor' ? 'plaster' : M.pick(r, ['brick', 'brick', 'plaster', 'office']);
        const tintC = d === 'harbor' ? M.pick(r, ['#bfe0ea', '#f2d6c2', '#f4ecd4', '#cfe3d2', '#e9c8c8']) : (fk === 'plaster' ? M.pick(r, ['#f0e2c8', '#d9e2e6', '#e8cfc4']) : '#ffffff');
        let x, z, w, dd;
        if (s[0] === 'n' || s[0] === 's') { w = len - 0.4; dd = rowDepth; x = a + len / 2; z = s[0] === 'n' ? s[3] + dd / 2 : s[3] - dd / 2; }
        else { w = rowDepth; dd = len - 0.4; z = a + len / 2; x = s[0] === 'w' ? s[3] + w / 2 : s[3] - w / 2; }
        // storefront ground floor
        const sf = BK.get('store', x, z); sf.setColor('#ffffff');
        sf.box(x, 0.18, z, w, 4.2, dd, { modW: T.BAY * 4, modH: 4.2 * 1.2, top: false });
        addTower(r, x, z, w, dd, h - 4.2, fk, '#9c9c9c', { y0: 4.38, tint: tintC });
        // awning + sign facing the street
        const fx = s[0] === 'w' ? -1 : s[0] === 'e' ? 1 : 0, fz = s[0] === 'n' ? -1 : s[0] === 's' ? 1 : 0;
        const awC = M.pick(r, ['#b23a3a', '#2f6f6a', '#d9a441', '#3d4f8a', '#6b3f6b', '#2d2d2d']);
        sol.setColor(awC);
        const along = fz !== 0 ? w * 0.85 : dd * 0.85;
        sol.addGeo(new THREE.BoxGeometry(fz !== 0 ? along : 1.6, 0.12, fz !== 0 ? 1.6 : along), G.mat(x + fx * (w / 2 + 0.7), 3.6, z + fz * (dd / 2 + 0.7), fz * 0.25, 0, -fx * 0.25));
        addSign(r, x + fx * (w / 2 + 0.06), 5.2, z + fz * (dd / 2 + 0.06), fx, fz, Math.min(along, 7));
        a += len;
      }
    }
    // back-lot parking with a few parked cars handled by vehicles module
    W.parking.push({ x0: inner.x0 + rowDepth + 2, x1: inner.x1 - rowDepth - 2, z0: inner.z0 + rowDepth + 2, z1: inner.z1 - rowDepth - 2 });
    if (r() < 0.6) addBillboard(r, icx, icz, 16 + r() * 10);
    if (d === 'harbor') for (let k = 0; k < 4; k++) tree(r, inner.x0 + r() * iw, L.z1 - 2.5, 0.9, true);
  } else if (d === 'residential') {
    const g = BK.get('grass', L.cx, L.cz); g.flat(inner.x0, inner.z0, inner.x1, inner.z1, 0.2, 6);
    // houses along each side
    const pad = 4;
    const cells = [];
    const nx = 3, nz = 3;
    for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) { if (a === 1 && b === 1) continue; cells.push([a, b]); }
    for (const [a, b] of cells) {
      const cw = iw / nx, cd = idp / nz;
      const x = inner.x0 + cw * (a + 0.5), z = inner.z0 + cd * (b + 0.5);
      const face = b === 0 ? Math.PI : b === 2 ? 0 : a === 0 ? -Math.PI / 2 : Math.PI / 2;
      if (r() < 0.25) { addTower(r, x, z, cw - pad, cd - pad, T.FLOOR * (3 + Math.floor(r() * 3)), 'brick', '#8a8a8a', { tint: M.pick(r, ['#ffffff', '#e8d0c0', '#d0c8c0']) }); continue; }
      addHouse(r, x, z, cw - pad * 2.2, cd - pad * 2.2, face);
      // fence
      sol.setColor('#e8e4dc');
      tree(r, x + (r() - 0.5) * cw * 0.6, z + (r() - 0.5) * cd * 0.6, 0.9);
    }
    tree(r, icx, icz, 1.3); tree(r, icx + 6, icz - 4, 1); tree(r, icx - 5, icz + 5, 1.1);
  } else if (d === 'industrial') {
    const n = r() < 0.5 ? 1 : 2;
    for (let k = 0; k < n; k++) {
      const w = n === 1 ? iw * 0.8 : iw * 0.42, dd = idp * 0.55;
      const x = n === 1 ? icx : (k === 0 ? inner.x0 + w / 2 + 1 : inner.x1 - w / 2 - 1), z = inner.z0 + dd / 2 + 2;
      const h = 9 + r() * 8;
      addTower(r, x, z, w, dd, h, 'metal', '#7a7a7a', { tint: M.pick(r, ['#c8d0d8', '#d8c8b0', '#b8c8c0', '#d0d0d0']) });
      // sawtooth roof
      sol.setColor('#6d737a');
      const teeth = Math.floor(w / 6);
      for (let q = 0; q < teeth; q++) { const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(6, 0); s.lineTo(6, 2.4); s.closePath(); sol.addGeo(new THREE.ExtrudeGeometry(s, { depth: dd - 1, bevelEnabled: false }), G.mat(x - w / 2 + q * 6, h + 0.18, z - dd / 2 + 0.5)); }
    }
    // shipping containers + silos
    const cc = ['#b5482f', '#2f6aa1', '#d39b2a', '#3c7d4f', '#7b7f86', '#8e3b5b'];
    for (let k = 0; k < 7; k++) {
      const x = inner.x0 + 4 + r() * (iw - 8), z = inner.z1 - 5 - r() * 14;
      sol.setColor(M.pick(r, cc)); const st = 1 + Math.floor(r() * 2);
      for (let q = 0; q < st; q++) sol.addGeo(new THREE.BoxGeometry(2.5, 2.6, 6.1), G.mat(x, 0.18 + 1.3 + q * 2.62, z, 0, r() < 0.5 ? 0 : Math.PI / 2, 0));
    }
    if (r() < 0.6) { const m = BK.get('metalSolid', icx, icz); m.setColor('#a9adb1'); for (let q = 0; q < 2; q++) m.addGeo(new THREE.CylinderGeometry(3, 3, 18, 16), G.mat(inner.x1 - 6 - q * 7, 9.2, inner.z1 - 7)); }
    if (r() < 0.5) { sol.setColor('#6b5a50'); sol.addGeo(new THREE.CylinderGeometry(1, 1.4, 34, 10), G.mat(inner.x0 + 5, 17, inner.z1 - 6)); }
  } else if (d === 'park') {
    const g = BK.get('grass', L.cx, L.cz); g.flat(inner.x0, inner.z0, inner.x1, inner.z1, 0.2, 6);
    // pond
    const pond = new THREE.Mesh(new THREE.CircleGeometry(16, 40), mats.water); pond.rotation.x = -Math.PI / 2; pond.position.set(icx + 18, 0.24, icz); pond.scale.set(1.6, 1, 1); W.scene.add(pond);
    sol.setColor('#b8b0a0');
    sol.addGeo(new THREE.RingGeometry(16, 17.5, 40), G.mat(icx + 18, 0.23, icz, -Math.PI / 2, 0, 0, 1.6, 1, 1));
    // paths
    const sw2 = BK.get('sidewalk', icx, icz); sw2.setColor('#d8cfbd');
    sw2.flat(inner.x0, icz - 1.5, inner.x1, icz + 1.5, 0.22, 4); sw2.flat(icx - 30 - 1.5, inner.z0, icx - 30 + 1.5, inner.z1, 0.22, 4);
    // fountain/bandstand
    sol.setColor('#e9e4da'); sol.addGeo(new THREE.CylinderGeometry(5, 5.4, 0.6, 24), G.mat(icx - 30, 0.5, icz));
    sol.addGeo(new THREE.CylinderGeometry(0.6, 0.8, 3, 12), G.mat(icx - 30, 2, icz));
    sol.setColor('#5b6e7a'); sol.addGeo(new THREE.ConeGeometry(6, 2.5, 8), G.mat(icx - 30, 6.2, icz));
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; sol.setColor('#e9e4da'); sol.addGeo(new THREE.CylinderGeometry(0.15, 0.15, 4.4, 6), G.mat(icx - 30 + Math.cos(a) * 4.6, 3, icz + Math.sin(a) * 4.6)); }
    for (let k = 0; k < 40; k++) { const x = inner.x0 + 3 + r() * (iw - 6), z = inner.z0 + 3 + r() * (idp - 6); if (Math.hypot((x - icx - 18) / 1.6, z - icz) < 19 || Math.abs(z - icz) < 3) continue; tree(r, x, z, 0.9 + r() * 0.7); }
    for (let k = 0; k < 6; k++) bench(inner.x0 + 10 + k * 18, icz + 2.8, 0);
  } else if (d === 'airport') {
    const ap = BK.get('sidewalk', icx, icz); ap.setColor('#9fa3a6'); ap.flat(inner.x0, inner.z0, inner.x1, inner.z1, 0.21, 5);
    // terminal: long glass hall with curved roof
    const tw = iw * 0.85, td = 34, tx = icx, tz = inner.z0 + td / 2 + 14;
    const gb = BK.get('glass', tx, tz); gb.setColor('#d6e6f2');
    gb.box(tx, 0.18, tz, tw, 14, td, { modW: T.BAY * 4, modH: T.FLOOR * 4, top: false });
    const RR = td * 0.62;
    const roof = new THREE.CylinderGeometry(RR, RR, tw + 6, 32, 1, true, 0.6, Math.PI - 1.2);
    const m = BK.get('metalSolid', tx, tz); m.setColor('#d9dde0');
    m.addGeo(roof, G.mat(tx, 14.18 - RR * Math.sin(0.6), tz, 0, 0, Math.PI / 2));
    m.setColor('#9aa0a6'); m.box(tx, 6, tz - td / 2 - 3, tw, 0.5, 6, {}); // canopy over curb
    for (let k = 0; k < 8; k++) m.addGeo(new THREE.CylinderGeometry(0.2, 0.2, 6, 8), G.mat(tx - tw / 2 + 4 + k * (tw - 8) / 7, 3, tz - td / 2 - 5.5));
    addSign(r, tx, 10.5, tz - td / 2 - 0.1, 0, -1, 14, 'VALE INTERNATIONAL');
    // control tower
    const ctx = inner.x1 - 12, ctz = inner.z1 - 14;
    m.setColor('#c9cdd2'); m.addGeo(new THREE.CylinderGeometry(2.4, 3.2, 44, 16), G.mat(ctx, 22.2, ctz));
    const cab = BK.get('glass', ctx, ctz); cab.setColor('#9fd0e8'); cab.addGeo(new THREE.CylinderGeometry(5.5, 4.2, 5, 16, 1, true), G.mat(ctx, 46.5, ctz));
    m.setColor('#5a6068'); m.addGeo(new THREE.CylinderGeometry(6, 6, 0.8, 16), G.mat(ctx, 49.4, ctz)); m.addGeo(new THREE.CylinderGeometry(0.2, 0.2, 6, 6), G.mat(ctx, 53, ctz));
    W.beacons.push([ctx, 56, ctz]);
    // apron: parked airliners
    for (let k = 0; k < 2; k++) airliner(inner.x0 + 30 + k * 60, inner.z1 - 30, k === 0 ? 0.3 : -0.2);
    const mk = BK.get('markings', icx, icz); mk.setColor('#e8c547');
    for (let k = 0; k < 2; k++) mk.flat(inner.x0 + 30 + k * 60 - 0.2, inner.z1 - 60, inner.x0 + 30 + k * 60 + 0.2, inner.z1 - 4, 0.23);
  }
}
function airliner(x, z, rot) {
  const s = BK.get('solid', x, z);
  s.setColor('#f2f4f6');
  s.addGeo(new THREE.CylinderGeometry(2.1, 2.1, 30, 16), G.mat(x, 4.2, z, Math.PI / 2, rot, 0));
  s.addGeo(new THREE.SphereGeometry(2.1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), G.mat(x + Math.sin(rot) * 15, 4.2, z + Math.cos(rot) * 15, Math.PI / 2, rot, 0, 1, 1.6, 1));
  s.addGeo(new THREE.ConeGeometry(2.1, 6, 16), G.mat(x - Math.sin(rot) * 18, 4.6, z - Math.cos(rot) * 18, -Math.PI / 2 - 0.08, rot, 0));
  s.addGeo(new THREE.BoxGeometry(34, 0.5, 5), G.mat(x, 3.3, z, 0, rot, 0));
  s.addGeo(new THREE.BoxGeometry(12, 0.35, 3), G.mat(x - Math.sin(rot) * 18, 5.2, z - Math.cos(rot) * 18, 0, rot, 0));
  s.setColor('#ff7ac8');
  s.addGeo(new THREE.BoxGeometry(0.4, 7, 4.5), G.mat(x - Math.sin(rot) * 18.5, 8.3, z - Math.cos(rot) * 18.5, 0, rot, 0));
  s.setColor('#3c4048');
  for (const side of [-1, 1]) { const ox = Math.cos(rot) * 8 * side, oz = -Math.sin(rot) * 8 * side; s.addGeo(new THREE.CylinderGeometry(1, 1, 4, 12), G.mat(x + ox + Math.sin(rot) * 1.5, 2.4, z + oz + Math.cos(rot) * 1.5, Math.PI / 2, rot, 0)); }
  s.addGeo(new THREE.BoxGeometry(0.3, 2, 0.3), G.mat(x + Math.sin(rot) * 11, 1.2, z + Math.cos(rot) * 11));
}
function addSign(r, x, y, z, fx, fz, len, text) {
  if (text) {
    const c = T.canvas(512, 64), cx = c.getContext('2d');
    cx.fillStyle = '#1b2733'; cx.fillRect(0, 0, 512, 64); cx.fillStyle = '#ffffff'; cx.font = 'bold 38px Arial, sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(text, 256, 34, 490);
    const tx = T.make(c); const mm = new THREE.MeshStandardMaterial({ map: tx, emissiveMap: tx, emissive: 0xffffff, emissiveIntensity: 0.6 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(len, len / 8), mm);
    mesh.position.set(x + fx * 0.05, y, z + fz * 0.05); mesh.rotation.y = Math.atan2(fx, fz); W.scene.add(mesh); return;
  }
  const k = Math.floor(r() * 16), u0 = (k % 4) / 4, v1 = 1 - Math.floor(k / 4) / 4, u1 = u0 + 0.25, v0 = v1 - 0.25;
  const gb = BK.get('signs', x, z); const h = len / 2.2 > 1.3 ? 1.3 : len / 2.2, w = h * 2.2;
  const ang = Math.atan2(fx, fz), tx = Math.cos(ang), tz = -Math.sin(ang); // right vector seen from outside
  const px = x + fx * 0.02, pz = z + fz * 0.02;
  gb.quad([px - tx * w / 2, y - h / 2, pz - tz * w / 2], [px + tx * w / 2, y - h / 2, pz + tz * w / 2], [px + tx * w / 2, y + h / 2, pz + tz * w / 2], [px - tx * w / 2, y + h / 2, pz - tz * w / 2], [fx, 0, fz], [u0, v0, u1, v1]);
}
function addBillboard(r, x, z, h) {
  const s = BK.get('metalSolid', x, z); s.setColor('#4a4f55');
  s.addGeo(new THREE.CylinderGeometry(0.4, 0.5, h, 8), G.mat(x, h / 2, z));
  const rot = r() * Math.PI * 2;
  s.addGeo(new THREE.BoxGeometry(12.4, 6.4, 0.5), G.mat(x, h + 3, z, 0, rot, 0));
  const k = Math.floor(r() * 6), u0 = (k % 2) / 2, v1 = 1 - Math.floor(k / 2) / 3, u1 = u0 + 0.5, v0 = v1 - 1 / 3;
  const gb = BK.get('ads', x, z);
  for (const side of [1, -1]) {
    const fx = Math.sin(rot) * side, fz = Math.cos(rot) * side, ang = Math.atan2(fx, fz), tx = Math.cos(ang), tz = -Math.sin(ang);
    const px = x + fx * 0.27, pz = z + fz * 0.27, w = 12, hh = 6, y = h + 3;
    gb.quad([px - tx * w / 2, y - hh / 2, pz - tz * w / 2], [px + tx * w / 2, y - hh / 2, pz + tz * w / 2], [px + tx * w / 2, y + hh / 2, pz + tz * w / 2], [px - tx * w / 2, y + hh / 2, pz - tz * w / 2], [fx, 0, fz], [u0, v0, u1, v1]);
  }
}

function buildTaxiStands() {
  const pole = new G.GB(), sign = new G.GB();
  pole.setColor('#2c3035'); sign.setColor('#ffffff');
  const c = T.canvas(128, 64), x = c.getContext('2d');
  x.fillStyle = '#ffc61a'; x.fillRect(0, 0, 128, 64); x.fillStyle = '#10151c'; x.font = 'bold 40px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('TAXI', 64, 34);
  x.fillStyle = '#10151c'; for (let k = 0; k < 8; k++) x.fillRect(k * 16 + (k % 2) * 0, 0, 8, 6);
  const tex = T.make(c, { clamp: true });
  for (const p of W.places) {
    const fx = Math.sin(p.face), fz = Math.cos(p.face), sx = p.x + fz * 1.6, sz = p.z - fx * 1.6; // beside the stand, along the curb
    pole.addGeo(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), G.mat(sx, 1.48, sz));
    const geo = new THREE.PlaneGeometry(0.7, 0.35);
    sign.addGeo(geo, G.mat(sx + fx * 0.03, 2.55, sz + fz * 0.03, 0, p.face, 0));
    sign.addGeo(geo, G.mat(sx - fx * 0.03, 2.55, sz - fz * 0.03, 0, p.face + Math.PI, 0));
  }
  W.scene.add(new THREE.Mesh(pole.build(), mats.metalSolid));
  mats.taxiStand = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.2, roughness: 0.5 });
  W.scene.add(new THREE.Mesh(sign.build(), mats.taxiStand));
}
function buildRoads() {
  const g = new THREE.Mesh(new THREE.PlaneGeometry(C.SIZE, C.SIZE), mats.asphalt);
  g.rotation.x = -Math.PI / 2; g.receiveShadow = true; W.scene.add(g); W.asphalt = g;
  const mk = new GB();
  const w = C.ROAD / 2;
  for (const [a, b] of W.edges) {
    const A = W.nodes[a], B = W.nodes[b];
    const horiz = A.z === B.z;
    const s0 = (horiz ? Math.min(A.x, B.x) : Math.min(A.z, B.z)) + w + 4, s1 = (horiz ? Math.max(A.x, B.x) : Math.max(A.z, B.z)) - w - 4;
    const c = horiz ? A.z : A.x;
    // dashed double yellow center
    mk.setColor('#e3b836');
    for (let s = s0; s < s1; s += 6) {
      const e = Math.min(s + 3, s1);
      if (horiz) { mk.flat(s, c - 0.22, e, c - 0.08, 0.025); mk.flat(s, c + 0.08, e, c + 0.22, 0.025); }
      else { mk.flat(c - 0.22, s, c - 0.08, e, 0.025); mk.flat(c + 0.08, s, c + 0.22, e, 0.025); }
    }
    // edge lines
    mk.setColor('#d8d8d2');
    for (const off of [-w + 0.5, w - 0.65]) {
      if (horiz) mk.flat(s0, c + off, s1, c + off + 0.15, 0.025); else mk.flat(c + off, s0, c + off + 0.15, s1, 0.025);
    }
    // crosswalks + stop lines at both ends
    for (const end of [0, 1]) {
      const node = end === 0 ? (horiz ? (A.x < B.x ? A : B) : (A.z < B.z ? A : B)) : (horiz ? (A.x < B.x ? B : A) : (A.z < B.z ? B : A));
      if (node.nb.length < 3) continue;
      const base = end === 0 ? s0 - 4 : s1 + 1;
      for (let q = -w + 0.8; q < w - 0.8; q += 1.1) {
        if (horiz) mk.flat(base, c + q, base + 3, c + q + 0.55, 0.026); else mk.flat(c + q, base, c + q + 0.55, base + 3, 0.026);
      }
      const sl = end === 0 ? s0 - 0.6 : s1 + 0.2; // stop line on the incoming lane side
      if (horiz) { if (end === 0) mk.flat(sl, c - w + 0.5, sl + 0.4, c, 0.026); else mk.flat(sl, c, sl + 0.4, c + w - 0.5, 0.026); }
      else { if (end === 0) mk.flat(c, sl, c + w - 0.5, sl + 0.4, 0.026); else mk.flat(c - w + 0.5, sl, c, sl + 0.4, 0.026); }
    }
  }
  const mesh = new THREE.Mesh(mk.build(), mats.markings); mesh.receiveShadow = true; W.scene.add(mesh);
}
function buildTrafficLights() {
  const pole = new GB(); pole.setColor('#2c3035');
  const lamp = {}; ['ns', 'ew'].forEach(a => ['r', 'y', 'g'].forEach(s => lamp[a + s] = new GB()));
  W.signals = []; W.signalHeads = [];
  for (const n of W.nodes) {
    if (!n.alive || n.nb.length < 3) continue;
    W.signals.push(n.id);
    const o = C.ROAD / 2 + 1.0;
    for (const [sx, sz] of [[1, 1], [-1, -1]]) {
      const px = n.x + sx * o, pz = n.z + sz * o;
      pole.addGeo(new THREE.CylinderGeometry(0.12, 0.14, 5.6, 6), G.mat(px, 2.8, pz));
      // arm over the road for NS traffic (cars moving along z) and EW
      pole.box(px - sx * 2.5, 5.4, pz, 5, 0.14, 0.14, {});
      pole.box(px, 5.4, pz - sz * 2.5, 0.14, 0.14, 5, {});
      // heads
      const hx1 = px - sx * 4.6, hz1 = pz; // over z-road lane -> faces z traffic (ns)
      const hx2 = px, hz2 = pz - sz * 4.6; // faces x traffic (ew)
      pole.box(hx1, 4.0, hz1, 0.45, 1.5, 0.5, {}); pole.box(hx2, 4.0, hz2, 0.5, 1.5, 0.45, {});
      W.signalHeads.push({ x: hx1, z: hz1, axis: 'ns' }, { x: hx2, z: hz2, axis: 'ew' });
      ['r', 'y', 'g'].forEach((s, k) => {
        const y = 5.15 - k * 0.45;
        lamp['ns' + s].box(hx1, y - 0.16, hz1, 0.3, 0.32, 0.56, {});
        lamp['ew' + s].box(hx2, y - 0.16, hz2, 0.56, 0.32, 0.3, {});
      });
    }
  }
  const pm = new THREE.Mesh(pole.build(), mats.metalSolid); pm.castShadow = true; W.scene.add(pm);
  for (const k in lamp) W.scene.add(new THREE.Mesh(lamp[k].build(), mats['tl_' + k]));
}
W.lightPhase = 0;
W.lightState = (axis) => { // axis 'ns' (moving along z) or 'ew'
  const t = W.lightPhase % 26; // ns green 0-10, yellow 10-12.5, red all 12.5-13, ew green 13-23, yellow 23-25.5
  if (axis === 'ns') return t < 10 ? 'g' : t < 12.5 ? 'y' : 'r';
  return t >= 13 && t < 23 ? 'g' : t >= 23 && t < 25.5 ? 'y' : 'r';
};
const TLC = { r: 0xff2a1a, y: 0xffb21a, g: 0x22ff88 };
function updateLights() {
  for (const ax of ['ns', 'ew']) { const st = W.lightState(ax); for (const s of ['r', 'y', 'g']) mats['tl_' + ax + s].color.setHex(st === s ? TLC[s] : 0x1c1c1c); }
}

function buildOutskirts(r) {
  // big ground
  const g = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), mats.ground); g.rotation.x = -Math.PI / 2; g.position.y = -0.08; g.receiveShadow = true; W.scene.add(g);
  // water to the south
  const water = new THREE.Mesh(new THREE.PlaneGeometry(4000, 1800), mats.water); water.rotation.x = -Math.PI / 2; water.position.set(0, -1.2, C.HALF + 14 + 900); W.scene.add(water); W.water = water;
  // seawall promenade (solid strip south of the last road)
  const H = C.HALF;
  W.solids.push({ x0: -H - 60, x1: H + 60, z0: H, z1: H + 14 });
  const sw = BK.get('sidewalk', 0, H + 7); sw.setColor('#bdb2a0'); sw.box(0, -0.0, H + 7, C.SIZE + 120, 0.18, 14, { topUV: 4 });
  const sol = BK.get('solid', 0, H + 7);
  sol.setColor('#5d6066'); sol.box(0, -1.2, H + 14.2, C.SIZE + 120, 1.6, 0.4, {});
  sol.setColor('#2f3439');
  for (let x = -H - 50; x < H + 50; x += 3) sol.box(x, 0.18, H + 13.6, 0.08, 1.05, 0.08, {});
  sol.box(0, 1.2, H + 13.6, C.SIZE + 120, 0.08, 0.1, {});
  for (let x = -H; x < H; x += 30) { streetLamp(x + 15, H + 1.2, 0, -1); tree(r, x, H + 8, 0.9, true); }
  // piers + lighthouse
  for (const px of [-220, -40, 160]) {
    sol.setColor('#6e5a45'); sol.box(px, -0.4, H + 14 + 40, 8, 0.5, 80, {});
    for (let k = 0; k < 8; k++) { sol.setColor('#4a3e33'); sol.addGeo(new THREE.CylinderGeometry(0.3, 0.3, 3, 6), G.mat(px - 3.6, -1.6, H + 20 + k * 10)); sol.addGeo(new THREE.CylinderGeometry(0.3, 0.3, 3, 6), G.mat(px + 3.6, -1.6, H + 20 + k * 10)); }
    // moored boat
    sol.setColor(M.pick(r, ['#f2f2ee', '#1e4d6b', '#c94a3a'])); sol.addGeo(new THREE.BoxGeometry(4, 1.6, 11), G.mat(px + 9, -0.6, H + 50));
    sol.setColor('#f2f2ee'); sol.addGeo(new THREE.BoxGeometry(3, 1.6, 4), G.mat(px + 9, 0.8, H + 48));
  }
  const lx = 300, lz = H + 120;
  sol.setColor('#6a6f75'); sol.addGeo(new THREE.CylinderGeometry(9, 11, 3, 16), G.mat(lx, -0.5, lz));
  sol.setColor('#f1f1ec'); sol.addGeo(new THREE.CylinderGeometry(2.2, 3.4, 26, 16), G.mat(lx, 14, lz));
  sol.setColor('#b43b32'); for (let k = 0; k < 3; k++) sol.addGeo(new THREE.CylinderGeometry(2.25 + k * 0.01, 2.5 + k * 0.0, 3, 16, 1, true), G.mat(lx, 6 + k * 8, lz));
  W.beacons.push([lx, 29, lz]); W.lighthouse = [lx, 28.5, lz];
  sol.setColor('#2e3236'); sol.addGeo(new THREE.CylinderGeometry(2.6, 2.6, 1, 16), G.mat(lx, 27.5, lz));
  // outer ring of low-detail buildings (N, E, W)
  const ring = [];
  for (let k = -H; k < H; k += 22) { ring.push([k, -H - 26]); ring.push([-H - 26, k]); ring.push([H + 26, k]); }
  for (const [x, z] of ring) {
    const h = 10 + r() * 40, w = 14 + r() * 6;
    addTower(r, x, z, w, w, h, M.pick(r, ['office', 'brick', 'glass', 'plaster']), '#888', { tint: M.pick(r, ['#ffffff', '#e8e0d0', '#d0d8e0']) });
  }
  W.solids.push({ x0: -H - 60, x1: H + 60, z0: -H - 60, z1: -H }, { x0: -H - 60, x1: -H, z0: -H - 60, z1: H }, { x0: H, x1: H + 60, z0: -H - 60, z1: H });
  const swo = BK.get('sidewalk', 0, -H - 20);
  swo.setColor('#c8c4bb');
  swo.box(0, 0, -H - 30, C.SIZE + 120, 0.18, 60, { topUV: 4 }); swo.box(-H - 30, 0, 0, 60, 0.18, C.SIZE, { topUV: 4 }); swo.box(H + 30, 0, 0, 60, 0.18, C.SIZE, { topUV: 4 });
  // distant skyline and hills
  const far = new GB();
  for (let k = 0; k < 90; k++) {
    const a = r() * Math.PI * 1.2 + Math.PI * 0.9, d = 700 + r() * 500;
    const x = Math.cos(a) * d, z = Math.sin(a) * d; if (z > C.HALF) continue;
    far.setColor(M.pick(r, ['#59626c', '#4c545e', '#666f78']));
    far.box(x, 0, z, 20 + r() * 30, 30 + r() * 120, 20 + r() * 30, {});
  }
  far.setColor('#3e4c3a');
  for (let k = 0; k < 24; k++) { const a = Math.PI + k / 24 * Math.PI, d = 1300; far.addGeo(new THREE.ConeGeometry(160 + r() * 120, 90 + r() * 120, 7), G.mat(Math.cos(a) * d, 40, Math.sin(a) * d * 0.9)); }
  const fm = new THREE.Mesh(far.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })); W.scene.add(fm);
}

/* ---------- Sky + atmosphere ---------- */
const SKY_V = `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p; }`;
const SKY_F = `
uniform vec3 top; uniform vec3 horizon; uniform vec3 ground; uniform vec3 sunColor; uniform vec3 sunDir; uniform float cloud; uniform float night; uniform float time; uniform float haze;
varying vec3 vDir;
float h3(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h2(i),h2(i+vec2(1,0)),f.x), mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*n2(p); p*=2.03; a*=0.5; } return v; }
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(horizon, top, pow(clamp(h,0.0,1.0), 0.5));
  col = mix(col, ground, smoothstep(0.0, -0.2, h));
  float sd = max(dot(d, normalize(sunDir)), 0.0);
  col += sunColor * (pow(sd, 1200.0) * 60.0 * (1.0-cloud*0.8) + pow(sd, 10.0) * 0.35 * (1.0 - night*0.7) + pow(sd, 3.0) * 0.08 * (1.0 - night));
  float md = max(dot(d, normalize(vec3(-sunDir.x, -sunDir.y, sunDir.z) + vec3(0.0, 0.25, 0.0))), 0.0);
  col += vec3(0.85, 0.9, 1.0) * (smoothstep(0.99955, 0.9997, md) * 2.5 + pow(md, 60.0) * 0.12) * night * (1.0 - cloud * 0.85);
  if (h > 0.0) {
    vec3 sp = floor(d * 380.0);
    float s = step(0.9978, h3(sp)) * night * smoothstep(0.0, 0.25, h) * (1.0 - cloud);
    col += vec3(s * 1.4);
    vec2 uv = d.xz / (h + 0.12) * 0.9 + vec2(time * 0.004, time * 0.002);
    float n = fbm(uv);
    float c = smoothstep(0.62 - cloud * 0.45, 0.95 - cloud * 0.3, n) * smoothstep(0.0, 0.2, h);
    vec3 cc = mix(horizon, vec3(1.0), 0.35 + 0.25 * (1.0 - night)) * (1.0 - night * 0.82) + sunColor * 0.12 * pow(sd, 3.0);
    cc *= (1.0 - cloud * 0.35);
    col = mix(col, cc, c * 0.92);
  }
  col = mix(col, horizon, haze * (1.0 - smoothstep(0.0, 0.35, abs(h))));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <encodings_fragment>
}`;
function buildSky() {
  W.skyU = { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, ground: { value: new THREE.Color() }, sunColor: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, cloud: { value: 0.3 }, night: { value: 0 }, time: { value: 0 }, haze: { value: 0 } };
  const mat = new THREE.ShaderMaterial({ uniforms: W.skyU, vertexShader: SKY_V, fragmentShader: SKY_F, side: THREE.BackSide, depthWrite: false, fog: false });
  W.sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 16), mat); W.sky.renderOrder = -1; W.sky.frustumCulled = false; W.scene.add(W.sky);
  W.skyScene = new THREE.Scene(); W.skyScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), mat));
  buildEnvCity();
  // lights
  W.hemi = new THREE.HemisphereLight(0xbfd6ff, 0x4a4036, 0.6); W.scene.add(W.hemi);
  W.sun = new THREE.DirectionalLight(0xffffff, 2); W.sun.castShadow = true;
  const sc = W.sun.shadow.camera; sc.left = -75; sc.right = 75; sc.top = 75; sc.bottom = -75; sc.near = 10; sc.far = 500; if (sc.updateProjectionMatrix) sc.updateProjectionMatrix();
  W.sun.shadow.bias = -0.0006; W.sun.shadow.normalBias = 0.04;
  W.scene.add(W.sun); W.scene.add(W.sun.target);
  W.scene.fog = new THREE.Fog(0xbcd0e0, 150, 900);
  // night glow points (lamp heads + beacons)
  const pts = W.lampHeads.concat(W.beacons);
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
  W.glowMat = new THREE.PointsMaterial({ size: 3.6, map: T.radial(), color: 0xffcf90, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
  W.glow = new THREE.Points(pg, W.glowMat); W.glow.frustumCulled = false; W.scene.add(W.glow);
  // lighthouse sweep beam
  const lb = new THREE.Mesh(new THREE.ConeGeometry(14, 160, 16, 1, true), new THREE.MeshBasicMaterial({ map: T.beam(), color: 0xfff1c0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  lb.geometry.translate(0, -80, 0); lb.geometry.rotateZ(Math.PI / 2);
  W.lhBeam = lb; lb.position.set(W.lighthouse[0], W.lighthouse[1], W.lighthouse[2]); W.scene.add(lb);
}

/* Reflection-only skyline: a ring of facades and dark asphalt around the env-map camera,
   so car paint, glass and wet roads reflect a city instead of bare sky */
function buildEnvCity() {
  const r = M.rng(5150);
  const groups = {};
  const keys = ['glass', 'office', 'brick', 'plaster'];
  for (const k of keys) groups[k] = new G.GB();
  for (let k = 0; k < 44; k++) {
    const a = k / 44 * Math.PI * 2 + r() * 0.05, d = 26 + r() * 14, h = 6 + Math.pow(r(), 1.6) * 38, w = 5 + r() * 7;
    const key = M.pick(r, keys), gb = groups[key];
    gb.addGeo(new THREE.BoxGeometry(w, h, w), G.mat(Math.cos(a) * d, h / 2 - 1.5, Math.sin(a) * d, 0, -a, 0));
  }
  W.envMats = [];
  for (const k of keys) {
    const day = new THREE.MeshBasicMaterial({ map: mats[k].map, color: 0xffffff }), night = new THREE.MeshBasicMaterial({ map: mats[k].emissiveMap, color: 0xffffff });
    const mesh = new THREE.Mesh(groups[k].build(), day); mesh.userData.day = day; mesh.userData.night = night;
    W.skyScene.add(mesh); W.envMats.push(mesh);
  }
  W.envGround = new THREE.Mesh(new THREE.CircleGeometry(48, 24), new THREE.MeshBasicMaterial({ color: 0x2a2b2e }));
  W.envGround.rotation.x = -Math.PI / 2; W.envGround.position.y = -1.5; W.skyScene.add(W.envGround);
}
function tuneEnvCity(sunI, night, dark) {
  if (!W.envMats) return;
  const lit = M.clamp(sunI / 2.3, 0.08, 1) * (1 - dark * 0.5);
  for (const m of W.envMats) {
    m.material = night > 0.55 ? m.userData.night : m.userData.day;
    m.material.color.setScalar(night > 0.55 ? 1.4 : lit * 0.9);
  }
  W.envGround.material.color.setRGB(0.16 * lit + 0.01, 0.165 * lit + 0.01, 0.18 * lit + 0.012);
}

/* Time-of-day keyframes (sRGB hex) */
const KF = [
  [0, '#03060f', '#0b1428', '#8fa3d9', 0.10, 0.20, 1],
  [5, '#060b1f', '#1e2240', '#8fa3d9', 0.10, 0.22, 1],
  [6.3, '#2e4677', '#e59a6c', '#ffa860', 0.6, 0.45, 0.6],
  [8, '#4a82c9', '#b9d3ea', '#ffe1b4', 1.7, 0.75, 0],
  [12, '#3a78cc', '#c3dbf2', '#fff6ea', 2.3, 0.9, 0],
  [16, '#4580c6', '#d0dfec', '#ffe6c4', 2.0, 0.85, 0],
  [18.3, '#3a5893', '#f4a46a', '#ff9a4e', 1.1, 0.6, 0.2],
  [19.4, '#1b2350', '#b0586a', '#ff6e3c', 0.35, 0.35, 0.7],
  [20.6, '#060b1f', '#18203c', '#8fa3d9', 0.10, 0.22, 1],
  [24, '#03060f', '#0b1428', '#8fa3d9', 0.10, 0.20, 1],
];
const WEATHER = {
  clear: { cloud: 0.18, fogMul: 1, dark: 0, wet: 0, rain: 0, haze: 0.05 },
  cloudy: { cloud: 0.75, fogMul: 0.8, dark: 0.3, wet: 0, rain: 0, haze: 0.25 },
  rain: { cloud: 0.95, fogMul: 0.48, dark: 0.5, wet: 1, rain: 1, haze: 0.55 },
  fog: { cloud: 0.6, fogMul: 0.2, dark: 0.25, wet: 0.35, rain: 0, haze: 0.95 },
};
W.WEATHER_LABEL = { clear: 'Clear', cloudy: 'Overcast', rain: 'Rain', fog: 'Fog' };
W.state = { hour: 17.2, weather: 'clear', wx: Object.assign({}, WEATHER.clear), night: 0, nextWeather: 140 };
const _c1 = new THREE.Color(), _c2 = new THREE.Color();
function lerpHex(a, b, t, out) { _c1.set(a); _c2.set(b); return out.copy(_c1).lerp(_c2, t); }
let envTimer = 0, lastEnvHour = -99, lastEnvWx = '';
W.setWeather = (w) => { W.state.weather = w; };
W.refreshEnv = () => { envTimer = 0; lastEnvHour = -99; };
W.update = (dt, focus, renderer) => {
  const S = W.state, set = G.Save.data.settings;
  // time
  const tm = set.timeMode;
  if (tm === 'cycle') S.hour = (S.hour + dt * (24 / 900)) % 24; // 15 real minutes per day
  else { const target = { morning: 8.5, noon: 12.5, sunset: 18.6, night: 22.5 }[tm] || 12; S.hour = target; }
  // weather
  if (set.weatherMode === 'auto') {
    S.nextWeather -= dt;
    if (S.nextWeather <= 0) { S.weather = M.pick(Math.random, ['clear', 'clear', 'cloudy', 'rain', 'fog', 'clear', 'cloudy', 'rain']); S.nextWeather = 120 + Math.random() * 120; }
  } else S.weather = set.weatherMode;
  const tw = WEATHER[S.weather], k = 1 - Math.exp(-dt * 0.35);
  for (const key in tw) S.wx[key] += (tw[key] - S.wx[key]) * k;
  // keyframes
  let i = 0; while (i < KF.length - 2 && KF[i + 1][0] <= S.hour) i++;
  const a = KF[i], b = KF[i + 1], t = M.smooth(M.clamp((S.hour - a[0]) / (b[0] - a[0]), 0, 1));
  const wx = S.wx, dark = wx.dark;
  const top = lerpHex(a[1], b[1], t, W.skyU.top.value), hor = lerpHex(a[2], b[2], t, W.skyU.horizon.value), sunC = lerpHex(a[3], b[3], t, W.skyU.sunColor.value);
  const grey = new THREE.Color().setRGB(0.5, 0.52, 0.55);
  const nightF = M.lerp(a[6], b[6], t); S.night = M.clamp(nightF + dark * 0.25, 0, 1);
  top.lerp(grey.clone().multiplyScalar(0.9 * (1 - nightF * 0.9)), dark * 0.85);
  hor.lerp(grey.clone().multiplyScalar(1.15 * (1 - nightF * 0.85)), dark * 0.8);
  top.convertSRGBToLinear(); hor.convertSRGBToLinear(); sunC.convertSRGBToLinear();
  W.skyU.ground.value.copy(hor).multiplyScalar(0.35);
  W.skyU.cloud.value = wx.cloud; W.skyU.night.value = nightF; W.skyU.time.value += dt; W.skyU.haze.value = wx.haze;
  // sun direction
  const ang = (S.hour - 6) / 12 * Math.PI;
  const sunDir = W.skyU.sunDir.value.set(Math.cos(ang) * 0.75, Math.sin(ang), 0.45).normalize();
  const sunUp = sunDir.y > -0.05;
  const lightDir = sunUp ? sunDir.clone() : new THREE.Vector3(-sunDir.x, -sunDir.y, -sunDir.z * 0.6).normalize();
  lightDir.y = Math.max(lightDir.y, 0.18); lightDir.normalize();
  const si = M.lerp(a[4], b[4], t) * (1 - dark * 0.75);
  W.sun.intensity = si; W.sun.color.copy(sunUp ? sunC : new THREE.Color(0x8fa3d9));
  W.sun.position.set(focus.x + lightDir.x * 200, lightDir.y * 200, focus.z + lightDir.z * 200);
  W.sun.target.position.set(focus.x, 0, focus.z); W.sun.target.updateMatrixWorld();
  W.hemi.intensity = M.lerp(a[5], b[5], t) * (1 - dark * 0.3) + 0.05;
  W.hemi.color.copy(top).lerp(new THREE.Color(1, 1, 1), 0.4); W.hemi.groundColor.setRGB(0.18, 0.16, 0.14);
  // fog
  W.scene.fog.color.copy(hor);
  W.scene.fog.near = 60 * wx.fogMul + 10; W.scene.fog.far = (S.night > 0.6 ? 620 : 900) * wx.fogMul + 80;
  W.sky.position.set(focus.x, 0, focus.z);
  // night lighting
  const nl = S.night;
  for (const m of W.nightMats) m.emissiveIntensity = nl * 1.15;
  mats.store.emissiveIntensity = 0.15 + nl * 1.1;
  mats.lamp.emissiveIntensity = nl * 3;
  mats.signs.emissiveIntensity = 0.25 + nl * 1.4; mats.ads.emissiveIntensity = 0.2 + nl * 1.0;
  if (mats.taxiStand) mats.taxiStand.emissiveIntensity = 0.15 + nl * 1.3;
  mats.pool.opacity = nl * 0.55;
  W.glowMat.opacity = nl * (G.FX && G.FX.post ? 0.35 : 0.9); // bloom already halos the lamps
  W.lhBeam.material.opacity = nl * 0.22 + wx.haze * 0.05 * nl;
  W.lhBeam.rotation.y += dt * 0.6;
  // wet roads
  const wet = wx.wet;
  // puddles: a roughness map only while wet (switching maps recompiles the shader, so do it at a threshold)
  const wantPuddles = wet > 0.12;
  if (wantPuddles !== !!mats.asphalt.roughnessMap) { mats.asphalt.roughnessMap = wantPuddles ? W.puddleTex : null; mats.asphalt.needsUpdate = true; }
  mats.asphalt.roughness = wantPuddles ? M.lerp(1, 0.55, wet) : 0.92; mats.asphalt.metalness = M.lerp(0, 0.3, wet);
  mats.asphalt.color.setScalar(M.lerp(1, 0.42, wet)); mats.asphalt.envMapIntensity = M.lerp(0.4, 1.5, wet) * (1 - S.night * 0.75);
  mats.sidewalk.envMapIntensity = 1 - S.night * 0.6;
  // traffic-signal reflections on wet asphalt
  if (wet > 0.05 && G.FX && G.FX.light) for (const h of W.signalHeads) {
    if (Math.abs(h.x - focus.x) > 120 || Math.abs(h.z - focus.z) > 120) continue;
    const st = W.lightState(h.axis), c = st === 'g' ? [0.1, 1.2, 0.5] : st === 'y' ? [1.3, 0.75, 0.1] : [1.4, 0.12, 0.06];
    G.FX.light(h.x, 4.8, h.z, c[0] * 0.6, c[1] * 0.6, c[2] * 0.6, 0.45);
  }
  mats.sidewalk.roughness = M.lerp(0.9, 0.5, wet);
  if (mats.water.map) { mats.water.map.offset.x += dt * 0.004; mats.water.map.offset.y += dt * 0.006; }
  // traffic lights
  W.lightPhase += dt; updateLights();
  // environment map refresh
  envTimer -= dt;
  if (renderer && envTimer <= 0 && (Math.abs(S.hour - lastEnvHour) > 0.35 || lastEnvWx !== S.weather)) {
    envTimer = 4;
    lastEnvHour = S.hour; lastEnvWx = S.weather;
    try {
      tuneEnvCity(W.sun.intensity, S.night, wx.dark);
      const rt = W.pmrem.fromScene(W.skyScene, 0, 0.1, 100);
      if (W.envRT) W.envRT.dispose();
      W.envRT = rt; W.scene.environment = rt.texture;
    } catch (e) { /* env map is optional */ }
  }
  G.renderer && (G.renderer.toneMappingExposure = 0.95 + nl * 0.25);
};

/* ---------- Build all ---------- */
W.build = (scene, renderer) => {
  W.scene = scene; W.lampHeads = []; W.beacons = []; W.parking = [];
  buildLayout(); buildPlaces();
  makeMaterials();
  BK = new G.Buckets(170);
  const r = M.rng(20261025);
  for (const L of W.lots) buildLot(L, r);
  buildOutskirts(r);
  W.meshes = BK.flush(scene, mats, { pool: { cast: false, receive: false, order: 2 }, markings: { cast: false }, sidewalk: { cast: false }, grass: { cast: false }, foliage: { cast: true }, lamp: { cast: false } });
  buildTaxiStands();
  buildRoads(); buildTrafficLights(); buildSky();
  if (renderer) W.pmrem = new THREE.PMREMGenerator(renderer);
  if (G.FX && G.FX.addStaticLights) G.FX.addStaticLights(W.lampHeads, 1.4, 1.0, 0.62, 0.9);
};

/* ---------- Minimap base image ---------- */
W.mapCanvas = (scale) => {
  const size = Math.ceil((C.SIZE + 80) * scale), c = T.canvas(size, size), x = c.getContext('2d');
  const tx = v => (v + C.HALF + 40) * scale;
  x.fillStyle = '#1b2430'; x.fillRect(0, 0, size, size);
  x.fillStyle = '#123247'; x.fillRect(0, tx(C.HALF + 14), size, size);
  const col = { downtown: '#2b3a4f', commercial: '#33384a', residential: '#2c3d34', upscale: '#3b3650', industrial: '#3a3530', harbor: '#2e3d4a', airport: '#343a40', park: '#2f5134' };
  x.fillStyle = '#4c5866'; x.fillRect(tx(-C.HALF), tx(-C.HALF), C.SIZE * scale, C.SIZE * scale);
  for (const L of W.lots) { x.fillStyle = col[L.district]; x.fillRect(tx(L.x0), tx(L.z0), (L.x1 - L.x0) * scale, (L.z1 - L.z0) * scale); }
  return { canvas: c, scale, offset: C.HALF + 40 };
};
})();
