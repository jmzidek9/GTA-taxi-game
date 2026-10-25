/* CROSSTOWN — traffic AI: lane following, turns, signals, car-following, parked cars */
'use strict';
(function () {
const G = window.G, M = G.M, C = G.CFG, W = G.World, GB = G.GB;
const TR = G.Traffic = { cars: [], scene: null };
const COLORS = ['#e8e8ea', '#1b1d22', '#8a8f96', '#c0392b', '#2d3e50', '#3b5bdb', '#1f7a5c', '#d8cfc0', '#6d2b3a', '#f0f0f0', '#4a4f55', '#b5651d'];
const TYPES = ['sedan', 'sedan', 'sedan', 'suv', 'suv', 'sport', 'lux'];
const STOP = 12.2; // distance from node center to a stopped car's center (bumper just behind the crosswalk)
let paintMat = null;

function laneFrame(a, b) {
  const A = W.nodes[a], B = W.nodes[b];
  const dx = B.x - A.x, dz = B.z - A.z, len = Math.hypot(dx, dz);
  const fx = dx / len, fz = dz / len;
  return { A, B, fx, fz, rx: -fz, rz: fx, len };
}
function lanePoint(f, s) { return [f.A.x + f.fx * s + f.rx * C.LANE, f.A.z + f.fz * s + f.rz * C.LANE]; }
function chooseNext(a, b) {
  const nb = W.nodes[b].nb.filter(n => n !== a);
  if (!nb.length) return a;
  return nb[Math.floor(Math.random() * nb.length)];
}
function makeTurn(car) {
  const f1 = laneFrame(car.a, car.b), f2 = laneFrame(car.b, car.next);
  const P0 = lanePoint(f1, f1.len - STOP), P2 = lanePoint(f2, STOP);
  let P1;
  const straight = Math.abs(f1.fx * f2.fx + f1.fz * f2.fz) > 0.9;
  const uturn = f1.fx * f2.fx + f1.fz * f2.fz < -0.9;
  if (straight) P1 = [(P0[0] + P2[0]) / 2, (P0[1] + P2[1]) / 2];
  else if (uturn) P1 = [W.nodes[car.b].x + f1.fx * 6, W.nodes[car.b].z + f1.fz * 6];
  else P1 = Math.abs(f1.fx) > 0.5 ? [P2[0], P0[1]] : [P0[0], P2[1]];
  let len = 0, px = P0[0], pz = P0[1];
  for (let k = 1; k <= 10; k++) { const p = bez(P0, P1, P2, k / 10); len += Math.hypot(p[0] - px, p[1] - pz); px = p[0]; pz = p[1]; }
  car.curve = { P0, P1, P2, len, straight };
  car.t = 0; car.mode = 'turn';
}
function bez(a, b, c, t) { const u = 1 - t; return [u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1]]; }
function bezTan(a, b, c, t) { const u = 1 - t; return [2 * u * (b[0] - a[0]) + 2 * t * (c[0] - b[0]), 2 * u * (b[1] - a[1]) + 2 * t * (c[1] - b[1])]; }

function newCar(police) {
  const type = police ? 'sedan' : M.pick(Math.random, TYPES), color = M.pick(Math.random, COLORS);
  let m;
  if (police) m = G.Police.buildModel();
  else {
    m = G.buildCar(type, color, { simple: true, paintMat });
    m.root.add(G.FX.blob(m.dims.W + 0.9, m.dims.L + 1.1));
    m.beams = new THREE.Mesh(G.FX.beamGeometry(m.dims, 14), G.FX.beamMaterial()); m.beams.visible = false; m.root.add(m.beams);
  }
  TR.scene.add(m.root);
  return { model: m, type, color, police: !!police, x: 0, z: 0, heading: 0, speed: 0, target: 12, cruise: 10 + Math.random() * 5, mode: 'edge', a: 0, b: 0, s: 0, wait: 0, honkT: 0 };
}
function placeCar(car, focus, minD, maxD) {
  for (let tries = 0; tries < 40; tries++) {
    const e = W.edges[Math.floor(Math.random() * W.edges.length)];
    const rev = Math.random() < 0.5;
    const a = rev ? e[1] : e[0], b = rev ? e[0] : e[1];
    const f = laneFrame(a, b);
    const s = STOP + Math.random() * (f.len - 2 * STOP);
    const p = lanePoint(f, s);
    const d = M.dist(p[0], p[1], focus.x, focus.z);
    if (d < minD || d > maxD) continue;
    if (TR.cars.some(o => o !== car && M.dist(o.x, o.z, p[0], p[1]) < 14)) continue;
    // never pop in right in front of the player's camera
    if (focus.fx !== undefined && d < 120) { const dot = ((p[0] - focus.x) * focus.fx + (p[1] - focus.z) * focus.fz) / d; if (dot > 0.6) continue; }
    car.a = a; car.b = b; car.s = s; car.mode = 'edge'; car.next = chooseNext(a, b);
    car.x = p[0]; car.z = p[1]; car.heading = Math.atan2(f.fx, f.fz); car.speed = car.cruise * 0.7; car.wait = 0;
    car.model.root.visible = true;
    return true;
  }
  car.model.root.visible = false; car.parked = true;
  return false;
}
TR.init = (scene, count, focus) => {
  TR.scene = scene;
  if (!paintMat) paintMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.32, envMapIntensity: 1.1 });
  for (const c of TR.cars) scene.remove(c.model.root);
  TR.cars = [];
  for (let k = 0; k < count; k++) { const c = newCar(k < 2); TR.cars.push(c); placeCar(c, focus, 30, 230); }
  // headlight / taillight glow sprites
  if (!TR.glow) {
    const n = 80 * 4;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    TR.glowMat = new THREE.PointsMaterial({ size: 2.4, map: G.Tex.radial(), vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    TR.glow = new THREE.Points(g, TR.glowMat); TR.glow.frustumCulled = false; scene.add(TR.glow);
  }
};
TR.buildParked = (scene) => {
  const gbs = { paint: new GB(), glass: new GB(), dark: new GB(), head: new GB(), tail: new GB() };
  const r = M.rng(99);
  const tmp = new THREE.Matrix4();
  for (const p of W.parking) {
    const w = p.x1 - p.x0; if (w < 6 || p.z1 - p.z0 < 6) continue;
    const n = Math.floor(w / 3);
    for (let k = 0; k < n; k++) {
      if (r() < 0.35) continue;
      const type = M.pick(r, TYPES), color = M.pick(r, COLORS);
      const m = G.buildCar(type, color, { simple: true });
      const x = p.x0 + 1.5 + k * 3, z = (p.z0 + p.z1) / 2 + (r() < 0.5 ? -3 : 3);
      const rot = r() < 0.5 ? 0 : Math.PI;
      const meshes = m.body.children; const keys = ['paint', 'glass', 'dark', 'head', 'tail'];
      tmp.copy(G.mat(x, 0.18, z, 0, rot, 0));
      meshes.forEach((mesh, i) => gbs[keys[i]].addGeo(mesh.geometry, tmp, true));
      // paint color is stored in vertex colors of the merged geometry
      meshes.forEach(mesh => mesh.geometry.dispose());
    }
  }
  const S = G.carShared();
  const pm = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.32 });
  const list = [[gbs.paint, pm], [gbs.glass, S.glass], [gbs.dark, S.dark], [gbs.head, S.trafficHead], [gbs.tail, S.trafficTail]];
  for (const [gb, mat] of list) { if (gb.empty()) continue; const mesh = new THREE.Mesh(gb.build(), mat); mesh.castShadow = mat === pm; scene.add(mesh); }
};
// Follow-that-car: mark a car ahead of the player as the target
TR.pickChaseTarget = (player) => {
  const fx = Math.sin(player.heading), fz = Math.cos(player.heading);
  let best = null, bs = Infinity;
  for (const c of TR.cars) {
    if (!c.model.root.visible || c.chase || c.police) continue;
    const dx = c.x - player.x, dz = c.z - player.z, d = Math.hypot(dx, dz);
    if (d < 25 || d > 120) continue;
    const ahead = (dx * fx + dz * fz) / d, score = d * (1.6 - ahead);
    if (score < bs) { bs = score; best = c; }
  }
  if (!best) return null;
  best.chase = true; best.runsReds = Math.random() < 0.6; best.wait = 0;
  return best;
};
TR.releaseChase = (c) => { if (c) { c.chase = false; c.runsReds = false; } };
// player-facing collision circles
TR.circles = () => {
  const out = [];
  for (const c of TR.cars) {
    if (!c.model.root.visible) continue;
    const d = c.model.dims, fx = Math.sin(c.heading), fz = Math.cos(c.heading), o = d.L / 2 - d.W / 2;
    const hit = (imp) => {
      c.wait = Math.max(c.wait, 2.5); c.speed *= 0.3; if (imp > 2 && c.honkT <= 0) { c.honkT = 4; G.Audio.horn(); }
      if (G.player.speed < 5) return;
      if (c.police && imp > 4) G.Police.offense('ramCop', G.player); else if (imp > 6) G.Police.offense('crash', G.player);
    };
    out.push([c.x + fx * o, c.z + fz * o, d.W / 2, c.speed * fx, c.speed * fz, hit], [c.x - fx * o, c.z - fz * o, d.W / 2, c.speed * fx, c.speed * fz, hit]);
  }
  return out;
};
TR.update = (dt, focus, player, night) => {
  const peds = G.People.Peds.obstacles();
  const pfx = Math.sin(player.heading), pfz = Math.cos(player.heading);
  focus.fx = pfx; focus.fz = pfz;
  for (const car of TR.cars) {
    if (!car.model.root.visible) { placeCar(car, focus, 90, 240); continue; }
    if (M.dist(car.x, car.z, focus.x, focus.z) > (car.chase ? 520 : 270)) { if (car.chase && TR.onLost) TR.onLost(car); placeCar(car, focus, 90, 240); continue; }
    car.honkT -= dt;
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    let target = car.mode === 'turn' && !car.curve.straight ? (car.chase ? 9 : 6.5) : car.chase ? 18 : car.cruise;
    if (G.World.state.wx.wet > 0.5) target *= 0.85;
    // signals
    if (car.mode === 'edge') {
      const f = laneFrame(car.a, car.b), dist = f.len - STOP - car.s;
      if (W.signals.indexOf(car.b) >= 0 && !(car.chase && car.runsReds)) {
        const axis = Math.abs(f.fz) > 0.5 ? 'ns' : 'ew', st = W.lightState(axis);
        if (st !== 'g' && dist > -0.5) {
          const committed = st === 'y' && dist < car.speed * 1.1;
          if (!committed) target = Math.min(target, Math.sqrt(Math.max(0, 2 * 4.5 * (dist - 0.3))));
        }
      }
    }
    // car following (other cars + player)
    let gapV = Infinity;
    const check = (ox, oz, ov) => {
      const dx = ox - car.x, dz = oz - car.z, proj = dx * fx + dz * fz;
      if (proj <= 0 || proj > 30) return;
      const lat = Math.abs(-dx * fz + dz * fx);
      if (lat > 2.3) return;
      const gap = proj - 6;
      gapV = Math.min(gapV, Math.sqrt(Math.max(0, 2 * 5 * (gap - 0.5))) + Math.max(0, ov) * 0.6);
    };
    for (const o of TR.cars) if (o !== car && o.model.root.visible) check(o.x, o.z, o.speed * (Math.sin(o.heading) * fx + Math.cos(o.heading) * fz));
    if (!car.chase) check(player.x, player.z, player.vx * fx + player.vz * fz);
    for (const ped of peds) check(ped.x, ped.z, 0);
    if (G.Police) for (const u of G.Police.units) check(u.x, u.z, u.speed * (Math.sin(u.heading) * fx + Math.cos(u.heading) * fz));
    target = Math.min(target, gapV);
    car.target = target;
    if (car.wait > 0) { car.wait -= dt; target = 0; }
    car.speed = target > car.speed ? Math.min(target, car.speed + 3.2 * dt) : Math.max(target, car.speed - 8 * dt);
    // advance
    let adv = car.speed * dt;
    if (car.mode === 'edge') {
      const f = laneFrame(car.a, car.b);
      car.s += adv;
      if (car.s >= f.len - STOP) { const over = car.s - (f.len - STOP); makeTurn(car); car.t = Math.min(1, over / car.curve.len); }
      else { const p = lanePoint(f, car.s); car.x = p[0]; car.z = p[1]; car.heading = Math.atan2(f.fx, f.fz); }
    }
    if (car.mode === 'turn') {
      const cv = car.curve;
      car.t += adv / cv.len;
      if (car.t >= 1) {
        const over = (car.t - 1) * cv.len;
        car.a = car.b; car.b = car.next; car.next = chooseNext(car.a, car.b); car.mode = 'edge'; car.s = STOP + over;
        const f = laneFrame(car.a, car.b), p = lanePoint(f, car.s); car.x = p[0]; car.z = p[1]; car.heading = Math.atan2(f.fx, f.fz);
      } else {
        const p = bez(cv.P0, cv.P1, cv.P2, car.t), tg = bezTan(cv.P0, cv.P1, cv.P2, car.t);
        car.x = p[0]; car.z = p[1]; car.heading = Math.atan2(tg[0], tg[1]);
      }
    }
    car.model.root.position.set(car.x, 0, car.z); car.model.root.rotation.y = car.heading;
    car.model.body.rotation.x = M.damp(car.model.body.rotation.x, car.speed < target - 0.5 ? -0.012 : car.speed > target + 0.5 ? 0.02 : 0, 6, dt);
  }
  // glows
  const pos = TR.glow.geometry.attributes.position, col = TR.glow.geometry.attributes.color;
  let k = 0;
  const beamOn = night > 0.15;
  for (const car of TR.cars) car.model.beams.visible = beamOn && car.model.root.visible && M.dist(car.x, car.z, focus.x, focus.z) < 160;
  if (night > 0.05) {
    for (const car of TR.cars) {
      if (!car.model.root.visible || k >= pos.count - 4) continue;
      const near = M.dist(car.x, car.z, focus.x, focus.z) < 140;
      const d = car.model.dims, fx = Math.sin(car.heading), fz = Math.cos(car.heading), rx = -fz, rz = fx;
      const braking = car.speed < car.target - 0.5;
      for (const sx of [-1, 1]) {
        const hx = car.x + fx * (d.L / 2 + 0.1) + rx * sx * (d.W / 2 - 0.33), hz = car.z + fz * (d.L / 2 + 0.1) + rz * sx * (d.W / 2 - 0.33);
        pos.setXYZ(k, hx, d.belt - d.nose - 0.12, hz); col.setXYZ(k, 1, 0.93, 0.8); k++;
        if (near && sx > 0) G.FX.light(car.x + fx * (d.L / 2 + 0.1), 0.7, car.z + fz * (d.L / 2 + 0.1), 1.2 * night, 1.1 * night, 0.9 * night, 0.9);
        const tx = car.x - fx * (d.L / 2 + 0.05) + rx * sx * (d.W / 2 - 0.3), tz = car.z - fz * (d.L / 2 + 0.05) + rz * sx * (d.W / 2 - 0.3);
        pos.setXYZ(k, tx, d.belt - 0.2, tz); col.setXYZ(k, braking ? 1 : 0.6, 0.05, 0.03); k++;
        if (near && sx > 0) G.FX.light(car.x - fx * (d.L / 2), 0.8, car.z - fz * (d.L / 2), (braking ? 1.5 : 0.7) * night, 0.04, 0.02, 0.8);
      }
    }
  }
  for (let q = k; q < pos.count; q++) pos.setXYZ(q, 0, -100, 0);
  pos.needsUpdate = true; col.needsUpdate = true;
  TR.glowMat.opacity = night * 0.85;
  G.FX.beamMaterial().uniforms.strength.value = night * (0.07 + W.state.wx.haze * 0.16 + W.state.wx.rain * 0.1);
};
})();
