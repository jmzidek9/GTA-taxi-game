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
  } else {
    h.phase += dt * 1.5; reset();
    h.hips.position.y = 0.92 + Math.sin(h.phase) * 0.006;
    h.armL.rotation.x = Math.sin(h.phase * 0.7) * 0.04;
  }
};

/* ---------- Sidewalk pedestrians ---------- */
const Peds = P.Peds = { list: [], scene: null };
function loopFor(L) { const o = 2.2; return { x0: L.x0 + o, z0: L.z0 + o, x1: L.x1 - o, z1: L.z1 - o }; }
function perimPos(lp, s) {
  const w = lp.x1 - lp.x0, d = lp.z1 - lp.z0, per = 2 * (w + d);
  s = ((s % per) + per) % per;
  if (s < w) return [lp.x0 + s, lp.z0, 0];
  if (s < w + d) return [lp.x1, lp.z0 + (s - w), 1];
  if (s < 2 * w + d) return [lp.x1 - (s - w - d), lp.z1, 2];
  return [lp.x0, lp.z1 - (s - 2 * w - d), 3];
}
Peds.place = (p, focus, near) => {
  const cand = W.lots.filter(L => L.district !== 'airport' && M.dist(L.cx, L.cz, focus.x, focus.z) < (near ? 150 : 210));
  const L = cand.length ? M.pick(Math.random, cand) : W.lots[0];
  p.loop = loopFor(L); const lp = p.loop;
  p.per = 2 * (lp.x1 - lp.x0 + lp.z1 - lp.z0);
  p.s = Math.random() * p.per; p.dir = Math.random() < 0.5 ? 1 : -1; p.speed = 1.05 + Math.random() * 0.6;
  p.pause = 0;
};
Peds.init = (scene, count, focus) => {
  Peds.scene = scene;
  for (const p of Peds.list) scene.remove(p.h.root);
  Peds.list = [];
  const r = M.rng(4242);
  for (let k = 0; k < count; k++) {
    const h = P.makeHuman(r); scene.add(h.root);
    const p = { h }; Peds.place(p, focus, true); Peds.list.push(p);
  }
};
const SEG_HEAD = [Math.PI / 2, 0, -Math.PI / 2, Math.PI]; // heading for +s on each segment (n,e,s,w)
Peds.update = (dt, focus) => {
  for (const p of Peds.list) {
    const pos = perimPos(p.loop, p.s);
    if (M.dist(pos[0], pos[1], focus.x, focus.z) > 230) { Peds.place(p, focus, false); continue; }
    const far = M.dist(pos[0], pos[1], focus.x, focus.z) > 120;
    if (p.pause > 0) { p.pause -= dt; if (!far) P.pose(p.h, 'idle', dt); }
    else {
      p.s += p.dir * p.speed * dt;
      if (Math.random() < dt * 0.02) p.pause = 2 + Math.random() * 4;
      if (!far) P.pose(p.h, 'walk', dt, p.speed / 1.3);
    }
    const q = perimPos(p.loop, p.s);
    p.h.root.position.set(q[0], 0.18, q[1]);
    p.h.root.rotation.y = SEG_HEAD[q[2]] + (p.dir < 0 ? Math.PI : 0);
    p.h.root.visible = !far || M.dist(q[0], q[1], focus.x, focus.z) < 200;
  }
};
})();
