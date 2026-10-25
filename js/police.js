/* CROSSTOWN — police: wanted level, offenses, red-light cameras, fines, pursuit AI, busted / escaped */
'use strict';
(function () {
const G = window.G, M = G.M, C = G.CFG, W = G.World;
const PO = G.Police = { heat: 0, stars: 0, units: [], escapeT: 0, bustT: 0, searching: false, time: 0 };
const STAR_AT = [1, 3, 6, 10, 15];            // heat needed for 1..5 stars
const SPEED_LIMIT = 22.4;                      // 50 mph; only matters in front of police
const FINES = { redlight: 60, speeding: 90 };
PO.starsFor = h => STAR_AT.filter(t => h >= t).length;

/* ---------- Model: two-tone cruiser with a light bar ---------- */
let barRed, barBlue;
PO.buildModel = () => {
  const m = G.buildCar('sedan', '#f3f4f6', { simple: true });
  const d = m.dims;
  if (!barRed) {
    barRed = new THREE.MeshBasicMaterial({ color: 0x330000 }); barBlue = new THREE.MeshBasicMaterial({ color: 0x000833 });
    PO.barRed = barRed; PO.barBlue = barBlue;
  }
  const dark = G.carShared().dark;
  const lower = new THREE.Mesh(new THREE.BoxGeometry(d.W + 0.03, 0.42, d.wb - 0.5), new THREE.MeshStandardMaterial({ color: 0x101318, metalness: 0.5, roughness: 0.35 }));
  lower.position.set(0, d.c + 0.42, 0); m.body.add(lower);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(d.W - 0.3, 0.03, 1.0), lower.material); hood.position.set(0, d.belt - d.nose + 0.06, d.L / 2 - 0.65); hood.rotation.x = 0.06; m.body.add(hood);
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.08, 0.32), dark); base.position.set(0, d.roof + 0.04, (d.roofR + d.roofF) / 2); m.body.add(base);
  // separate per-unit materials so each car can strobe on its own
  const red = barRed.clone(), blue = barBlue.clone();
  const r = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.13, 0.28), red); r.position.set(0.32, d.roof + 0.14, (d.roofR + d.roofF) / 2); m.body.add(r);
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.13, 0.28), blue); b.position.set(-0.32, d.roof + 0.14, (d.roofR + d.roofF) / 2); m.body.add(b);
  m.bar = { red, blue };
  m.root.add(G.FX.blob(d.W + 0.9, d.L + 1.1));
  m.beams = new THREE.Mesh(G.FX.beamGeometry(d, 14), G.FX.beamMaterial()); m.beams.visible = false; m.root.add(m.beams);
  return m;
};
PO.strobe = (m, on, t) => {
  if (!on) { m.bar.red.color.setRGB(0.25, 0.02, 0.02); m.bar.blue.color.setRGB(0.02, 0.03, 0.25); return 0; }
  const ph = (t * 7.5) % 2, a = ph < 1 ? (Math.sin(ph * Math.PI * 3) > 0 ? 1 : 0) : 0, b = ph >= 1 ? (Math.sin(ph * Math.PI * 3) > 0 ? 1 : 0) : 0;
  m.bar.red.color.setRGB(0.25 + a * 9, 0.02 + a * 0.6, 0.02 + a * 0.4); m.bar.blue.color.setRGB(0.02 + b * 0.5, 0.06 + b * 1.6, 0.25 + b * 10);
  return a ? 1 : b ? -1 : 0;
};

let scene, light;
PO.init = (sc, q) => {
  scene = sc;
  for (const u of PO.units) scene.remove(u.model.root);
  PO.units = [];
  PO.maxUnits = q && q.traffic < 14 ? 3 : 5;
  if (!light) { light = new THREE.PointLight(0xff2020, 0, 26, 2); light.position.set(0, -50, 0); scene.add(light); }
};
PO.reset = () => {
  PO.heat = 0; PO.stars = 0; PO.escapeT = 0; PO.bustT = 0; PO.searching = false;
  for (const u of PO.units) scene.remove(u.model.root);
  PO.units = [];
  if (light) light.intensity = 0;
  G.Audio.siren(0, 0);
};

/* ---------- Witnesses and offenses ---------- */
function nearestCop(x, z) {
  let best = Infinity;
  for (const u of PO.units) best = Math.min(best, M.dist(u.x, u.z, x, z));
  for (const c of G.Traffic.cars) if (c.police && c.model.root.visible) best = Math.min(best, M.dist(c.x, c.z, x, z));
  return best;
}
PO.nearestCop = nearestCop;
const cd = {};
function cool(key, t) { const now = PO.time; if (cd[key] && now < cd[key]) return false; cd[key] = now + t; return true; }
PO.addHeat = (h, why) => {
  const before = PO.stars;
  PO.heat = Math.min(STAR_AT[4] + 4, PO.heat + h);
  PO.stars = PO.starsFor(PO.heat);
  PO.escapeT = 0;
  if (PO.stars > before) { G.UI.wanted(PO.stars, why); G.emit('wanted', PO.stars); }
};
PO.fine = (amount, label) => {
  const S = G.Save.data; S.fines = (S.fines || 0) + amount; G.Save.write();
  G.UI.toast(`${label} · ${G.UI.money(-amount)} fine`, 'bad');
  G.Audio.chime('fail');
};
PO.offense = (kind, car, extra) => {
  if (PO.cleared > PO.time) return; // brief grace after a bust
  const cop = nearestCop(car.x, car.z);
  if (kind === 'redlight') {
    if (cop < 90) PO.addHeat(1.4, 'Ran a red light in front of police');
    else if (cool('cam' + extra, 20)) PO.fine(FINES.redlight, 'Red light camera');
  } else if (kind === 'speeding') {
    if (cop < 55 && cool('speed', 10)) { PO.addHeat(1, 'Speeding past police'); }
  } else if (kind === 'ped') {
    PO.addHeat(2.6, 'Hit a pedestrian');
  } else if (kind === 'crash') {
    if (cop < 120 && cool('crash', 3)) PO.addHeat(0.8, 'Reckless driving');
  } else if (kind === 'ramCop') {
    if (cool('ram', 2)) PO.addHeat(2, 'Rammed a police car');
  }
};

/* ---------- Red light detection for the player ---------- */
let inNode = -1;
function checkRedLight(car) {
  const i = Math.round((car.x + C.HALF - C.ROAD / 2) / C.CELL), j = Math.round((car.z + C.HALF - C.ROAD / 2) / C.CELL);
  const n = (i >= 0 && j >= 0 && i <= C.N && j <= C.N) ? W.node(i, j) : null;
  const inside = n && Math.abs(car.x - n.x) < C.ROAD / 2 && Math.abs(car.z - n.z) < C.ROAD / 2;
  if (inside && inNode !== n.id) {
    inNode = n.id;
    if (W.signals.indexOf(n.id) >= 0 && car.speed > 4) {
      const axis = Math.abs(car.vz) > Math.abs(car.vx) ? 'ns' : 'ew';
      if (W.lightState(axis) === 'r') { PO.offense('redlight', car, n.id); G.emit('redlight', n.id); }
    }
  } else if (!inside) inNode = -1;
}

/* ---------- Pursuit units ---------- */
function spawnUnit(player, fromPatrol) {
  const m = PO.buildModel(); scene.add(m.root);
  const u = { model: m, x: 0, z: 0, heading: 0, speed: 0, path: null, repathT: 0, stuckT: 0, revT: 0, mode: 'chase', life: 0 };
  if (fromPatrol) {
    u.x = fromPatrol.x; u.z = fromPatrol.z; u.heading = fromPatrol.heading; u.speed = fromPatrol.speed;
    fromPatrol.model.root.visible = false; // the traffic module re-places it later
  } else {
    const pfx = Math.sin(player.heading), pfz = Math.cos(player.heading);
    let ok = false;
    for (let t = 0; t < 60 && !ok; t++) {
      const e = W.edges[Math.floor(Math.random() * W.edges.length)], A = W.nodes[e[0]], B = W.nodes[e[1]];
      const s = 0.2 + Math.random() * 0.6, x = M.lerp(A.x, B.x, s), z = M.lerp(A.z, B.z, s), d = M.dist(x, z, player.x, player.z);
      if (d < 100 || d > 180) continue;
      if (((x - player.x) * pfx + (z - player.z) * pfz) / d > 0.4 && t < 45) continue; // prefer behind the player
      if (PO.units.some(o => M.dist(o.x, o.z, x, z) < 15)) continue;
      u.x = x; u.z = z; u.heading = Math.atan2(player.x - x, player.z - z); u.speed = 12; ok = true;
    }
    if (!ok) { scene.remove(m.root); return null; }
  }
  PO.units.push(u);
  return u;
}
function pointAlong(pts, dist) {
  let acc = 0;
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-6) continue;
    if (acc + L >= dist) { const t = (dist - acc) / L; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
    acc += L;
  }
  return pts[pts.length - 1];
}
function unitCircles(u) {
  const d = u.model.dims, fx = Math.sin(u.heading), fz = Math.cos(u.heading), o = d.L / 2 - d.W / 2, r = d.W / 2;
  return [[u.x + fx * o, u.z + fz * o, r], [u.x, u.z, r], [u.x - fx * o, u.z - fz * o, r]];
}
function driveUnit(u, dt, player) {
  u.life += dt;
  const dPlayer = M.dist(u.x, u.z, player.x, player.z);
  let tx, tz, vmax;
  if (u.mode === 'chase') {
    u.repathT -= dt;
    if (u.repathT <= 0 || !u.path) { u.repathT = 0.45; u.path = W.routeBetween(u.x, u.z, player.x, player.z).pts; }
    if (dPlayer < 32) { tx = player.x + player.vx * 0.45; tz = player.z + player.vz * 0.45; }
    else { const p = pointAlong(u.path, 9 + u.speed * 0.55); tx = p[0]; tz = p[1]; }
    vmax = 25 + PO.stars * 2.2;
    if (dPlayer < 9) vmax = player.speed * 0.9; // pull up alongside instead of ramming
    else if (dPlayer < 14) vmax = Math.max(player.speed + 3, 8);
  } else { // leaving: keep going straight-ish, then vanish
    const fx = Math.sin(u.heading), fz = Math.cos(u.heading); tx = u.x + fx * 30; tz = u.z + fz * 30; vmax = 14;
  }
  const want = Math.atan2(tx - u.x, tz - u.z), diff = M.wrapAngle(want - u.heading);
  if (u.revT > 0) {
    u.revT -= dt; u.speed = M.damp(u.speed, -6, 4, dt); u.heading -= diff * dt * 1.2 * Math.sign(u.speed);
  } else {
    const turn = M.clamp(10 / Math.max(u.speed, 4), 0.8, 2.6);
    u.heading = M.wrapAngle(u.heading + M.clamp(diff, -turn * dt, turn * dt));
    const target = vmax * (1 - Math.min(1, Math.abs(diff) / 1.3) * 0.65);
    u.speed = target > u.speed ? Math.min(target, u.speed + 11 * dt) : Math.max(target, u.speed - 22 * dt);
  }
  u.x += Math.sin(u.heading) * u.speed * dt; u.z += Math.cos(u.heading) * u.speed * dt;
  // world collisions: slide along buildings
  for (const c of unitCircles(u)) {
    const hit = W.collideCircle(c[0], c[1], c[2]);
    if (hit) { u.x += hit.nx * hit.depth; u.z += hit.nz * hit.depth; u.speed *= 0.96; }
  }
  // keep apart from other units
  for (const o of PO.units) if (o !== u) { const dx = u.x - o.x, dz = u.z - o.z, d = Math.hypot(dx, dz); if (d > 0 && d < 4.2) { u.x += dx / d * (4.2 - d) * 0.5; u.z += dz / d * (4.2 - d) * 0.5; } }
  if (u.mode === 'chase' && Math.abs(u.speed) < 1.2 && dPlayer > 10) { u.stuckT += dt; if (u.stuckT > 2.2) { u.stuckT = 0; u.revT = 1.3; } } else u.stuckT = 0;
  const m = u.model; m.root.position.set(u.x, 0, u.z); m.root.rotation.y = u.heading;
  m.body.rotation.z = M.damp(m.body.rotation.z, -M.clamp(diff, -0.5, 0.5) * Math.min(1, u.speed / 20) * 0.08, 6, dt);
}

/* ---------- Per-frame update ---------- */
PO.update = (dt, player, night, active) => {
  PO.time += dt;
  if (!active) { G.Audio.siren(0, PO.time); return; }
  checkRedLight(player);
  if (player.speed > SPEED_LIMIT) PO.offense('speeding', player);
  // dispatch units to match the wanted level
  const want = PO.stars ? Math.min(PO.maxUnits, PO.stars) : 0;
  const chasing = PO.units.filter(u => u.mode === 'chase');
  if (chasing.length < want && (!PO.spawnCD || PO.spawnCD < PO.time)) {
    PO.spawnCD = PO.time + 2.5;
    const patrol = G.Traffic.cars.find(c => c.police && c.model.root.visible && M.dist(c.x, c.z, player.x, player.z) < 160);
    spawnUnit(player, patrol);
  }
  // drive
  let nearest = Infinity, nearU = null;
  for (const u of PO.units) {
    driveUnit(u, dt, player);
    const d = M.dist(u.x, u.z, player.x, player.z);
    if (d < nearest && u.mode === 'chase') { nearest = d; nearU = u; }
    const ph = PO.strobe(u.model, u.mode === 'chase', PO.time + u.life * 0.37);
    u.model.beams.visible = night > 0.15;
    if (ph && d < 120) G.FX.light(u.x, 1.6, u.z, ph > 0 ? 2.2 : 0.1, 0.1, ph < 0 ? 2.6 : 0.1, 1.1);
  }
  // patrol cruisers in traffic idle their bars dark
  for (const c of G.Traffic.cars) if (c.police) PO.strobe(c.model, false, 0);
  // remove units that drove off
  PO.units = PO.units.filter(u => {
    const d = M.dist(u.x, u.z, player.x, player.z);
    if ((u.mode === 'leave' && (d > 160 || u.life > 14)) || d > 420 || !isFinite(d)) { scene.remove(u.model.root); return false; }
    return true;
  });
  // escape: break line of pursuit long enough
  if (PO.stars > 0) {
    PO.searching = nearest > 95;
    if (PO.searching) { PO.escapeT += dt; if (PO.escapeT > 6 + PO.stars * 2.5) escaped(); }
    else PO.escapeT = Math.max(0, PO.escapeT - dt * 2);
    // busted: boxed in and stopped next to a cruiser
    if (nearest < 7.5 && player.speed < 1.6) { PO.bustT += dt; if (PO.bustT > 2.6) busted(player); }
    else PO.bustT = Math.max(0, PO.bustT - dt * 1.5);
  } else { PO.searching = false; PO.bustT = 0; }
  // siren + red/blue light spill on the nearest unit
  const sv = nearU ? M.clamp(1 - nearest / 160, 0, 1) : 0;
  G.Audio.siren(sv, PO.time);
  if (light) {
    if (nearU && nearest < 60) {
      const ph = Math.sin(PO.time * 7.5 * Math.PI) > 0;
      light.position.set(nearU.x, 2.2, nearU.z); light.color.setHex(ph ? 0xff2a2a : 0x2a5bff);
      light.intensity = (0.6 + night * 3) * (1 - nearest / 60) * 2;
      if (nearest < 22 && night > 0.4) G.FX.flash.set(ph ? 0.03 : 0, 0, ph ? 0 : 0.04);
    } else light.intensity = 0;
  }
};
PO.circles = () => {
  const out = [];
  for (const u of PO.units) {
    const fx = Math.sin(u.heading), fz = Math.cos(u.heading);
    // only the player's own aggression counts, not a cruiser bumping a stopped cab
    const hit = (imp) => { u.speed *= 0.5; if (imp > 5 && G.player.speed > 7) PO.offense('ramCop', G.player); };
    for (const c of unitCircles(u)) if (c !== undefined) out.push([c[0], c[1], c[2], u.speed * fx, u.speed * fz, hit]);
  }
  return out;
};
function escaped() {
  const stars = PO.stars;
  PO.heat = 0; PO.stars = 0; PO.escapeT = 0;
  for (const u of PO.units) u.mode = 'leave';
  const S = G.Save.data; S.stats.escapes = (S.stats.escapes || 0) + 1; G.Save.write();
  G.UI.bigText('Lost them', `${stars}★ pursuit escaped`, 'good');
  G.Audio.chime('done');
  G.emit('escaped', stars);
}
function busted(player) {
  const stars = PO.stars, S = G.Save.data, fine = Math.min(S.cash, 150 * stars);
  S.cash -= fine; S.streak = 0; S.stats.busted = (S.stats.busted || 0) + 1; G.Save.write();
  PO.reset(); PO.cleared = PO.time + 8;
  G.UI.bigText('Busted', `${G.UI.money(-fine)} fine · streak reset`, 'bad');
  G.Audio.chime('fail');
  G.emit('busted', { stars, fine });
  G.UI.refreshMoney();
}
})();
