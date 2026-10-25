/* CROSSTOWN — people: procedural humans, walk cycles, sidewalk pedestrians */
'use strict';
(function () {
const G = window.G, M = G.M, GB = G.GB, W = G.World;
const P = G.People = {};
P.SKIN = ['#f1c9a5', '#e3b48f', '#c98e66', '#a86f4c', '#7a4a2e', '#5a3622'];
P.HAIR = ['#1d1612', '#3b2a1e', '#6b4a2b', '#a77c4b', '#d9c08a', '#9a9a9a', '#2a1d18', '#7a2e1e'];
P.TOPS = ['#2b4c7e', '#a23b3b', '#e0dcd2', '#2f2f33', '#3f6b4a', '#c98a2b', '#6a4a8a', '#d86f8f', '#1f6f78', '#8a8f96', '#e3c35a'];
P.PANTS = ['#1f2530', '#2c3e5a', '#4a4036', '#2a2a2a', '#6b6b70', '#3b4a3a', '#7a6650'];
P.FIRST = ['Maya', 'Leon', 'Priya', 'Owen', 'Sofia', 'Malik', 'Hana', 'Theo', 'Rosa', 'Jonah', 'Ines', 'Caleb', 'Amara', 'Felix', 'Nadia', 'Ruben', 'Yuki', 'Grace', 'Darius', 'Lena', 'Omar', 'Clara', 'Wes', 'Aiko'];
P.LAST = ['R.', 'K.', 'D.', 'T.', 'M.', 'S.', 'B.', 'A.', 'V.', 'L.', 'O.', 'P.'];

let MAT = null;
P.material = () => MAT || (MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.02 }));

const geoCache = {};
const cyl = (rt, rb, h, s) => { const k = rt + ',' + rb + ',' + h + ',' + s; return geoCache[k] || (geoCache[k] = new THREE.CylinderGeometry(rt, rb, h, s || 8)); };
const sph = (r, ws, hs, ps, pl, ts, tl) => { const k = 's' + r + ',' + ws + ',' + (ts || 0) + ',' + (tl || 0); return geoCache[k] || (geoCache[k] = new THREE.SphereGeometry(r, ws || 10, hs || 8, ps || 0, pl || Math.PI * 2, ts || 0, tl || Math.PI)); };
const box = (w, h, d) => { const k = 'b' + w + ',' + h + ',' + d; return geoCache[k] || (geoCache[k] = new THREE.BoxGeometry(w, h, d)); };

P.makeHuman = (r, o) => {
  o = o || {};
  r = r || Math.random;
  const skin = o.skin || M.pick(r, P.SKIN), hair = o.hair || M.pick(r, P.HAIR), top = o.top || M.pick(r, P.TOPS), pants = o.pants || M.pick(r, P.PANTS);
  const female = r() < 0.5, suit = !!o.suit;
  const mat = P.material();
  const root = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = 0.92; root.add(hips);
  // torso, head
  const b = new GB();
  b.setColor(pants); b.addGeo(cyl(0.19, 0.18, 0.2, 10), G.mat(0, 0.02, 0, 0, 0, 0, 1, 1, 0.75));
  b.setColor(top); b.addGeo(cyl(female ? 0.17 : 0.2, 0.18, 0.56, 10), G.mat(0, 0.38, 0, 0, 0, 0, 1, 1, 0.68));
  b.addGeo(sph(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), G.mat(0, 0.64, 0, 0, 0, 0, female ? 0.85 : 1, 0.45, 0.66));
  if (suit) { b.setColor('#e9e9e9'); b.addGeo(box(0.1, 0.3, 0.02), G.mat(0, 0.5, 0.135)); b.setColor('#7a1f2a'); b.addGeo(box(0.04, 0.26, 0.022), G.mat(0, 0.48, 0.14)); }
  b.setColor(skin); b.addGeo(cyl(0.05, 0.055, 0.12, 6), G.mat(0, 0.72, 0));
  b.addGeo(sph(0.115, 12, 10), G.mat(0, 0.86, 0.005, 0, 0, 0, 0.92, 1.08, 1));
  b.addGeo(box(0.03, 0.05, 0.03), G.mat(0, 0.85, 0.115)); // nose
  b.setColor('#1a1a1a'); b.addGeo(box(0.025, 0.018, 0.01), G.mat(0.04, 0.89, 0.105)); b.addGeo(box(0.025, 0.018, 0.01), G.mat(-0.04, 0.89, 0.105));
  b.setColor(hair);
  b.addGeo(sph(0.125, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), G.mat(0, 0.875, -0.01, -0.25, 0, 0, 0.95, 1, 1.05));
  if (female && r() < 0.7) b.addGeo(box(0.2, 0.26, 0.08), G.mat(0, 0.76, -0.08));
  if (r() < 0.15) { b.setColor(M.pick(r, ['#2a2a2a', '#7a2a2a', '#2a4a7a'])); b.addGeo(cyl(0.13, 0.13, 0.06, 12), G.mat(0, 0.96, 0)); b.addGeo(box(0.22, 0.015, 0.12), G.mat(0, 0.94, 0.1)); }
  if (o.bag || r() < 0.3) { b.setColor(M.pick(r, ['#3a2b20', '#1c1c1c', '#6b4a2e'])); b.addGeo(box(0.24, 0.3, 0.12), G.mat(0, 0.42, -0.17)); }
  const body = new THREE.Mesh(b.build(), mat); body.castShadow = true; hips.add(body);
  const mkLeg = (x) => {
    const g = new THREE.Group(); g.position.set(x, 0, 0);
    const lb = new GB(); lb.setColor(pants);
    lb.addGeo(cyl(0.08, 0.06, 0.86, 8), G.mat(0, -0.43, 0));
    lb.setColor(M.pick(r, ['#1a1a1a', '#f0f0f0', '#5a3a2a', '#2a2a40'])); lb.addGeo(box(0.11, 0.08, 0.26), G.mat(0, -0.89, 0.05));
    const m = new THREE.Mesh(lb.build(), mat); m.castShadow = true; g.add(m); hips.add(g); return g;
  };
  const mkArm = (x) => {
    const g = new THREE.Group(); g.position.set(x, 0.58, 0);
    const ab = new GB(); ab.setColor(top); ab.addGeo(cyl(0.06, 0.05, 0.56, 7), G.mat(0, -0.28, 0));
    ab.setColor(skin); ab.addGeo(sph(0.05, 8, 6), G.mat(0, -0.6, 0));
    const m = new THREE.Mesh(ab.build(), mat); m.castShadow = true; g.add(m); hips.add(g); return g;
  };
  const h = { root, hips, body, legL: mkLeg(0.1), legR: mkLeg(-0.1), armL: mkArm(female ? 0.21 : 0.24), armR: mkArm(female ? -0.21 : -0.24), phase: r() * 6, name: M.pick(r, P.FIRST) + ' ' + M.pick(r, P.LAST) };
  return h;
};
// mode: 'idle'|'walk'|'wave'|'sit'|'enter'; t: global time; amt: walk speed factor
P.pose = (h, mode, dt, amt) => {
  amt = amt === undefined ? 1 : amt;
  const reset = () => { h.armL.rotation.set(0, 0, 0.06); h.armR.rotation.set(0, 0, -0.06); h.legL.rotation.set(0, 0, 0); h.legR.rotation.set(0, 0, 0); h.hips.position.y = 0.92; h.body.rotation.x = 0; };
  if (mode === 'walk') {
    h.phase += dt * 7.2 * amt;
    const s = Math.sin(h.phase);
    reset();
    h.legL.rotation.x = s * 0.55; h.legR.rotation.x = -s * 0.55;
    h.armL.rotation.x = -s * 0.45; h.armR.rotation.x = s * 0.45;
    h.hips.position.y = 0.92 + Math.abs(Math.cos(h.phase)) * 0.035;
    h.body.rotation.y = s * 0.06;
  } else if (mode === 'sit') {
    reset();
    h.legL.rotation.x = -1.42; h.legR.rotation.x = -1.42; h.legL.rotation.z = 0.05; h.legR.rotation.z = -0.05;
    h.armL.rotation.x = -0.75; h.armR.rotation.x = -0.75; h.body.rotation.x = -0.08;
  } else if (mode === 'wave') {
    h.phase += dt * 9;
    reset();
    h.armR.rotation.z = -2.55 + Math.sin(h.phase) * 0.3;
    h.hips.position.y = 0.92 + Math.sin(h.phase * 0.5) * 0.005;
  } else if (mode === 'enter') {
    // amt: 0..1 progress of ducking into a seat
    const k = Math.sin(amt * Math.PI);
    reset();
    h.body.rotation.x = 0.55 * k;
    h.legL.rotation.x = -1.42 * M.smooth(amt); h.legR.rotation.x = -1.2 * M.smooth(Math.min(1, amt * 1.3));
    h.armL.rotation.x = -0.6 * k; h.armR.rotation.x = -0.9 * k;
    h.hips.position.y = 0.92 - 0.25 * k;
  } else if (mode === 'run') {
    h.phase += dt * 11 * amt;
    const s = Math.sin(h.phase);
    reset();
    h.legL.rotation.x = s * 0.95; h.legR.rotation.x = -s * 0.95;
    h.armL.rotation.x = -s * 0.9; h.armR.rotation.x = s * 0.9;
    h.hips.position.y = 0.92 + Math.abs(Math.cos(h.phase)) * 0.07;
    h.body.rotation.x = 0.18;
  } else if (mode === 'flinch') {
    reset();
    h.armL.rotation.set(-2.2, 0, 0.5); h.armR.rotation.set(-2.2, 0, -0.5);
    h.body.rotation.x = -0.25; h.legL.rotation.x = 0.4; h.legR.rotation.x = -0.3;
  } else if (mode === 'down') {
    reset();
    h.armL.rotation.set(-2.6, 0, 0.9); h.armR.rotation.set(-2.4, 0, -1.1);
    h.legL.rotation.set(0.2, 0, 0.25); h.legR.rotation.set(-0.15, 0, -0.2);
  } else {
    h.phase += dt * 1.5; reset();
    h.hips.position.y = 0.92 + Math.sin(h.phase) * 0.006;
    h.armL.rotation.x = Math.sin(h.phase * 0.7) * 0.04;
  }
};

/* ---------- Pedestrians: sidewalk loops, crosswalks on the signal, jaywalking, dodging, knockdowns ---------- */
const Peds = P.Peds = { list: [], scene: null, onHit: null, onBump: null };
const C = G.CFG;
const LOOP_IN = 2.2, CROSS_IN = 1.5, CROSS_SPEED = 1.9;
function loopFor(L) { const o = LOOP_IN; return { x0: L.x0 + o, z0: L.z0 + o, x1: L.x1 - o, z1: L.z1 - o, L }; }
function perimPos(lp, s) {
  const w = lp.x1 - lp.x0, d = lp.z1 - lp.z0, per = 2 * (w + d);
  s = ((s % per) + per) % per;
  if (s < w) return [lp.x0 + s, lp.z0, 0];
  if (s < w + d) return [lp.x1, lp.z0 + (s - w), 1];
  if (s < 2 * w + d) return [lp.x1 - (s - w - d), lp.z1, 2];
  return [lp.x0, lp.z1 - (s - 2 * w - d), 3];
}
function sOn(lp, x, z) { // nearest loop arc-length for a point
  const w = lp.x1 - lp.x0, d = lp.z1 - lp.z0;
  const dn = Math.abs(z - lp.z0), de = Math.abs(x - lp.x1), ds = Math.abs(z - lp.z1), dw = Math.abs(x - lp.x0), m = Math.min(dn, de, ds, dw);
  if (m === dn) return M.clamp(x - lp.x0, 0, w);
  if (m === de) return w + M.clamp(z - lp.z0, 0, d);
  if (m === ds) return w + d + M.clamp(lp.x1 - x, 0, w);
  return 2 * w + d + M.clamp(lp.z1 - z, 0, d);
}
const NORMAL = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // outward normal per loop segment
function lotAt(x, z) { for (const L of W.lots) if (x > L.x0 + 1 && x < L.x1 - 1 && z > L.z0 + 1 && z < L.z1 - 1) return L; return null; }
function nodeNear(x, z) {
  const i = Math.round((x + C.HALF - C.ROAD / 2) / C.CELL), j = Math.round((z + C.HALF - C.ROAD / 2) / C.CELL);
  return i >= 0 && j >= 0 && i <= C.N && j <= C.N ? W.node(i, j) : null;
}
Peds.place = (p, focus, near) => {
  const cand = W.lots.filter(L => L.district !== 'airport' && M.dist(L.cx, L.cz, focus.x, focus.z) < (near ? 150 : 210));
  const L = cand.length ? M.pick(Math.random, cand) : W.lots[0];
  p.loop = loopFor(L); const lp = p.loop;
  p.per = 2 * (lp.x1 - lp.x0 + lp.z1 - lp.z0);
  p.s = Math.random() * p.per; p.dir = Math.random() < 0.5 ? 1 : -1; p.speed = 1.05 + Math.random() * 0.6;
  p.pause = 0; p.mode = 'loop'; p.down = null; p.dodgeT = 0; p.fleeT = 0; p.cross = null; p.decideCD = 3 + Math.random() * 6;
  const q = perimPos(lp, p.s); p.x = q[0]; p.z = q[1]; p.seg = q[2]; p.h.root.rotation.set(0, 0, 0);
};
Peds.init = (scene, count, focus) => {
  Peds.scene = scene;
  for (const p of Peds.list) scene.remove(p.h.root);
  Peds.list = [];
  const r = M.rng(4242);
  for (let k = 0; k < count; k++) {
    const h = P.makeHuman(r); h.root.rotation.order = 'YXZ'; scene.add(h.root);
    if (G.FX && G.FX.blob) h.root.add(G.FX.blob(0.9, 0.9, { y: 0.02 }));
    const p = { h }; Peds.place(p, focus, true); Peds.list.push(p);
  }
};
// plan a crossing from the current spot: at a corner use the crosswalk, mid-block it's a jaywalk
function planCross(p, cars, player) {
  const lp = p.loop, w = lp.x1 - lp.x0, d = lp.z1 - lp.z0, s = ((p.s % p.per) + p.per) % p.per;
  const corners = [0, w, w + d, 2 * w + d, p.per];
  const atCorner = corners.some(c => Math.abs(s - c) < 0.6);
  const seg = perimPos(lp, s)[2];
  let opts = [];
  const span = C.ROAD + 2 * LOOP_IN;
  if (atCorner) {
    // the two segments meeting here; cross along either outward normal
    const prev = (seg + 3) % 4;
    for (const [a, b] of [[seg, prev], [prev, seg]]) {
      const n = NORMAL[a], o = NORMAL[b];
      const sx = p.x + o[0] * (LOOP_IN - CROSS_IN), sz = p.z + o[1] * (LOOP_IN - CROSS_IN);
      opts.push({ sx, sz, tx: sx + n[0] * span, tz: sz + n[1] * span, n, crosswalk: true });
    }
  } else if (Math.random() < 0.3) {
    const n = NORMAL[seg];
    opts.push({ sx: p.x, sz: p.z, tx: p.x + n[0] * span, tz: p.z + n[1] * span, n, crosswalk: false });
  }
  opts = opts.filter(o => { const L = lotAt(o.tx, o.tz); return L && L !== lp.L && L.district !== 'airport' && Math.abs(o.tx) < C.HALF && Math.abs(o.tz) < C.HALF; });
  if (!opts.length) return null;
  const o = M.pick(Math.random, opts);
  o.L2 = lotAt(o.tx, o.tz);
  o.axis = Math.abs(o.n[0]) > 0.5 ? 'ns' : 'ew'; // traffic on the road being crossed
  const mid = nodeNear(o.sx + o.n[0] * span / 2, o.sz + o.n[1] * span / 2);
  o.signal = o.crosswalk && mid && W.signals.indexOf(mid.id) >= 0;
  return o;
}
function walkSignal(axis) {
  // start only in the first seconds of red so the crossing finishes before traffic gets green
  const t = W.lightPhase % 26;
  return axis === 'ns' ? (t >= 12.6 && t < 15.6) : (t < 3 || t >= 25.6);
}
function roadClear(o, cars, player) {
  const mx = (o.sx + o.tx) / 2, mz = (o.sz + o.tz) / 2;
  for (const c of cars) if (c.model.root.visible && c.speed > 1.5 && M.dist(c.x, c.z, mx, mz) < 38) return false;
  if (player && player.speed > 1.5 && M.dist(player.x, player.z, mx, mz) < 45) return false;
  return true;
}
// obstacles in the roadway, for traffic to brake for
Peds.obstacles = () => { const out = []; for (const p of Peds.list) if (p.mode === 'cross' || p.down) out.push(p); return out; };
function stepTo(p, tx, tz, sp, dt) {
  const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
  if (d < 0.05) return true;
  const st = Math.min(d, sp * dt); p.x += dx / d * st; p.z += dz / d * st;
  p.face = Math.atan2(dx, dz);
  return false;
}
const SEG_HEAD = [Math.PI / 2, 0, -Math.PI / 2, Math.PI]; // heading for +s on each segment (n,e,s,w)
Peds.update = (dt, focus, player, cars) => {
  cars = cars || [];
  const psp = player ? player.speed : 0;
  const pcirc = player && psp > 0.5 ? player.circles() : null;
  for (const p of Peds.list) {
    const dFocus = M.dist(p.x, p.z, focus.x, focus.z);
    if (dFocus > 230 && !p.down) { Peds.place(p, focus, false); continue; }
    const far = dFocus > 120;
    const h = p.h;
    let pose = 'idle', amt = 1;
    if (p.down) {
      // knocked over: slide, lie still, get up, then run off
      const D = p.down; D.t += dt;
      const fr = Math.exp(-dt * 3.2); D.vx *= fr; D.vz *= fr;
      p.x += D.vx * dt; p.z += D.vz * dt;
      const fall = M.smooth(Math.min(1, D.t / 0.35)), rise = D.t > 2.8 ? M.smooth(Math.min(1, (D.t - 2.8) / 0.7)) : 0;
      h.root.rotation.x = -1.5 * fall * (1 - rise);
      h.root.rotation.y = D.face;
      pose = rise > 0 ? 'idle' : 'down';
      if (D.t > 3.5) {
        // a crossing ped finishes crossing; anyone else walks back to their sidewalk loop
        p.down = null; h.root.rotation.x = 0; p.fleeT = 5;
        if (p.mode !== 'cross') p.mode = 'join';
      }
    } else if (p.dodgeT > 0) {
      p.dodgeT -= dt; p.x += p.dvx * dt; p.z += p.dvz * dt; pose = 'flinch';
    } else if (p.mode === 'loop') {
      if (p.pause > 0) { p.pause -= dt; pose = 'idle'; }
      else {
        p.s += p.dir * p.speed * (p.fleeT > 0 ? 2.3 : 1) * dt;
        if (Math.random() < dt * 0.02 && p.fleeT <= 0) p.pause = 2 + Math.random() * 4;
        pose = p.fleeT > 0 ? 'run' : 'walk'; amt = p.speed / 1.3;
      }
      const q = perimPos(p.loop, p.s); p.x = q[0]; p.z = q[1];
      p.face = SEG_HEAD[q[2]] + (p.dir < 0 ? Math.PI : 0);
      p.decideCD -= dt;
      if (p.decideCD <= 0 && !far && p.fleeT <= 0) {
        p.decideCD = 1.5 + Math.random() * 4;
        if (Math.random() < 0.45) { const o = planCross(p, cars, player); if (o) { p.cross = o; p.mode = 'toCurb'; } }
      }
    } else if (p.mode === 'toCurb') {
      const o = p.cross;
      if (stepTo(p, o.sx, o.sz, p.speed, dt)) { p.mode = 'wait'; p.waitT = 0; }
      pose = 'walk';
    } else if (p.mode === 'wait') {
      const o = p.cross; p.waitT += dt; pose = 'idle';
      p.face = Math.atan2(o.n[0], o.n[1]);
      const go = o.signal ? walkSignal(o.axis) && roadClear(o, [], player) : roadClear(o, cars, player);
      if (go) p.mode = 'cross';
      else if (p.waitT > 40) { p.mode = 'join'; p.cross = null; }
    } else if (p.mode === 'cross') {
      const o = p.cross;
      if (stepTo(p, o.tx, o.tz, CROSS_SPEED * (p.fleeT > 0 ? 1.8 : 1), dt)) {
        p.loop = loopFor(o.L2); p.per = 2 * (p.loop.x1 - p.loop.x0 + p.loop.z1 - p.loop.z0); p.cross = null; p.mode = 'join';
      }
      pose = p.fleeT > 0 ? 'run' : 'walk'; amt = 1.3;
    } else if (p.mode === 'join') {
      const s = sOn(p.loop, p.x, p.z), q = perimPos(p.loop, s);
      if (stepTo(p, q[0], q[1], p.speed * (p.fleeT > 0 ? 2.3 : 1), dt)) { p.s = s; p.mode = 'loop'; }
      pose = 'walk';
    }
    if (p.fleeT > 0) p.fleeT -= dt;
    // --- the player's car: dodge, bump, knock down ---
    if (pcirc && !p.down) {
      const rx = p.x - player.x, rz = p.z - player.z, rd = Math.hypot(rx, rz);
      if (rd < 30 && psp > 5 && p.dodgeT <= 0) {
        const vx = player.vx / psp, vz = player.vz / psp, along = rx * vx + rz * vz, lat = -rx * vz + rz * vx;
        if (along > 0 && along < psp * 1.0 && Math.abs(lat) < 2.6 && Math.random() < dt * 9) {
          const side = Math.abs(lat) < 0.2 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(lat);
          p.dodgeT = 0.42; p.dvx = -vz * side * 5.2; p.dvz = vx * side * 5.2;
          if (Peds.onScare) Peds.onScare(p, psp);
        }
      }
      if (rd < 4.5) {
        for (const c of pcirc) {
          const dx = p.x - c[0], dz = p.z - c[1], dd = Math.hypot(dx, dz), rr = c[2] + 0.32;
          if (dd >= rr) continue;
          const nx = dd > 0.001 ? dx / dd : 1, nz = dd > 0.001 ? dz / dd : 0;
          p.x = c[0] + nx * rr; p.z = c[1] + nz * rr;
          if (psp > 3.5) {
            p.down = { t: 0, vx: player.vx * 0.75 + nx * 2.5, vz: player.vz * 0.75 + nz * 2.5, face: Math.atan2(-player.vx, -player.vz) };
            p.dodgeT = 0;
            if (Peds.onHit) Peds.onHit(p, psp);
          } else if (Peds.onBump && !p.bumpCD) { p.bumpCD = 1.5; Peds.onBump(p, psp); }
          break;
        }
      }
    }
    if (p.bumpCD) { p.bumpCD -= dt; if (p.bumpCD <= 0) p.bumpCD = 0; }
    // apply
    const onWalk = W.insideSolid(p.x, p.z, 0.2);
    h.root.position.set(p.x, M.damp(h.root.position.y, onWalk ? 0.18 : 0.0, 14, dt), p.z);
    if (!p.down) h.root.rotation.y += M.wrapAngle(p.face - h.root.rotation.y) * Math.min(1, dt * 12);
    h.root.visible = dFocus < 200;
    if (!far) P.pose(h, pose, dt, amt);
  }
};
})();
