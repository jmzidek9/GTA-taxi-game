/* CROSSTOWN — fares: offers, pickup/boarding/delivery/drop-off state machine, GPS route, payouts */
'use strict';
(function () {
const G = window.G, M = G.M, W = G.World, P = G.People;
const MS = G.Mission = { state: 'idle', offers: [], cur: null, routePts: null, target: null };

const CATS = {
  standard: { label: 'Standard', color: '#ffc61a', mul: 1, speed: 13, strict: false, xp: 0 },
  airport: { label: 'Airport Transfer', color: '#ff7ac8', mul: 1.35, speed: 13.5, strict: false, xp: 10 },
  vip: { label: 'VIP', color: '#e8cf8a', mul: 2.0, speed: 12, strict: false, xp: 35, comfort: 2 },
  rush: { label: 'Rush', color: '#ff5a3c', mul: 1.55, speed: 16.5, strict: true, xp: 20 },
  long: { label: 'Long Haul', color: '#59b6ff', mul: 1.2, speed: 14, strict: false, xp: 15 },
  night: { label: 'Night Ride', color: '#9b8cff', mul: 1.2, speed: 13, strict: false, xp: 10 },
  storm: { label: 'Storm Run', color: '#4ad3c4', mul: 1.3, speed: 11.5, strict: false, xp: 15 },
  fog: { label: 'Fog Run', color: '#b8c4cc', mul: 1.25, speed: 11.5, strict: false, xp: 15 },
  tourist: { label: 'Sightseer', color: '#7ee081', mul: 1.15, speed: 10.5, strict: false, xp: 10 },
  chase: { label: 'Follow That Car', color: '#ff8a3d', mul: 1.9, speed: 12.5, strict: false, xp: 30, chase: true },
};
// passenger personalities change what costs and earns mood
const PERS = {
  easy: { label: 'Easygoing', hint: 'Forgiving rider', harsh: 0.8, tip: 1 },
  chatty: { label: 'Chatty', hint: 'Talks the whole way', harsh: 1, tip: 1.1 },
  nervous: { label: 'Nervous', hint: 'Hates rough driving', harsh: 2.1, tip: 1.6, fastAt: 24 },
  impatient: { label: 'Impatient', hint: 'Wants speed, hates waiting', harsh: 0.9, tip: 1.3, noFast: true },
  party: { label: 'Party crowd', hint: 'Loves drifts and chases', harsh: 0.4, tip: 1.4, noFast: true },
  tourist: { label: 'Tourist', hint: 'Enjoys the scenic route', harsh: 1, tip: 1.25 },
};
MS.PERS = PERS;
MS.CATS = CATS;
const LINES = {
  hello: ['Hi! {dest}, please.', 'Evening. Take me to {dest}?', '{dest}. And step on it, if you can.', 'Thanks for stopping. {dest}, please.'],
  airport: ['{dest}. My flight boards soon!', 'Airport, please. I really can\'t miss this one.'],
  vip: ['{dest}. Smoothly, if you would.', 'I trust you know the way to {dest}. Gently.'],
  rush: ['{dest}! I\'m late. Please hurry!', 'Interview at {dest} in minutes. Go, go!'],
  hit: ['Whoa! Easy!', 'Hey, watch it!', 'My coffee!', 'Was that necessary?', 'Ouch.'],
  fast: ['Maybe a little slower?', 'This isn\'t a race track.'],
  late: ['We\'re running late...', 'Come on, come on...'],
  thanks: ['Thanks, keep the change.', 'Perfect, thank you!', 'Nice driving. Have a good one.', 'Right on time. Cheers!'],
  grumpy: ['Finally.', 'That was... a ride.', 'I\'ll walk next time.'],
  fail: ['Forget it, I\'ll walk from here.', 'Let me out. I\'ll find another cab.'],
  chatty: ['So my sister just opened a bakery on Market Row...', 'You ever think about how many fares you\'ve driven?', 'I almost got a dog last week. Almost.', 'The ferry was late again. Classic Vale Harbor.', 'Is it me or are the lights slower downtown?', 'My podcast says the harbor used to be twice as big.'],
  tourist: ['Wow, look at that skyline!', 'Is that the lighthouse? I have to get a photo.', 'Everyone here drives so fast.', 'What\'s the best food in town? Honestly.'],
  nervous: ['Please, gently...', 'Are we going too fast?', 'I\'m holding on to the handle, just so you know.'],
  impatient: ['Can we go any faster?', 'Why are we stopped?', 'Come on, the light was yellow!'],
  party: ['WOOO! Do that again!', 'Turn it up!', 'This is the best cab in the city!'],
  drift: ['Whoa, sideways!', 'Again! Again!'],
  cops: ['Are those sirens for US?!', 'Oh no no no, the police!', 'Lose them!'],
  copsParty: ['Floor it! They\'ll never catch us!', 'This is the best night ever!'],
  ped: ['You hit someone!!', 'Oh my god, stop the car!', 'Did you just... that person!'],
  followStart: ['See that {car}? Follow it. Don\'t lose it!', 'Quick! Follow that {car} — and stay back a little.'],
  followClose: ['Not so close, they\'ll see us!', 'Back off a bit!'],
  followLost: ['We lost them. Ugh. Just take me to {dest}.'],
  followDone: ['They pulled in. Perfect. Now take me to {dest}.', 'Got what I needed. {dest}, please.'],
};
const say = (key, vars) => { let s = M.pick(Math.random, LINES[key]); if (vars) for (const k in vars) s = s.replace('{' + k + '}', vars[k]); return s; };

/* ---------- markers & route ribbon ---------- */
let scene, beacon, ring, routeMesh, arrowTex, pin;
MS.init = (sc) => {
  scene = sc;
  const beamTex = G.Tex.beam();
  beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 70, 24, 1, true), new THREE.MeshBasicMaterial({ map: beamTex, color: 0x40e0ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  beacon.geometry.translate(0, 35, 0); beacon.visible = false; beacon.renderOrder = 5; scene.add(beacon);
  ring = new THREE.Mesh(new THREE.RingGeometry(3.4, 4.2, 48), new THREE.MeshBasicMaterial({ color: 0x40e0ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.visible = false; ring.renderOrder = 5; scene.add(ring);
  pin = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), new THREE.MeshBasicMaterial({ color: 0x40e0ff, fog: false }));
  pin.scale.y = 1.6; pin.visible = false; scene.add(pin);
  arrowTex = G.Tex.arrows();
  routeMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ map: arrowTex, color: 0x40e0ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
  routeMesh.frustumCulled = false; routeMesh.renderOrder = 4; scene.add(routeMesh);
};
function setMarker(x, z, color) {
  if (x === null) { beacon.visible = ring.visible = false; MS.target = null; return; }
  beacon.position.set(x, 0, z); ring.position.set(x, 0.07, z);
  beacon.material.color.set(color); ring.material.color.set(color); routeMesh.material.color.set(color); pin.material.color.set(color);
  beacon.visible = ring.visible = true;
}
function buildRibbon(pts) {
  if (!pts || pts.length < 2) { routeMesh.visible = false; return; }
  // resample
  const P = [], V = [], UV = [], I = [];
  let acc = 0;
  const samples = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 0.01) continue;
    const n = Math.max(1, Math.ceil(L / 3));
    for (let q = 0; q < n; q++) { const t = q / n; samples.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  samples.push(pts[pts.length - 1]);
  if (samples.length > 700) samples.length = 700;
  for (let k = 0; k < samples.length; k++) {
    const p = samples[k], q = samples[Math.min(k + 1, samples.length - 1)], o = samples[Math.max(k - 1, 0)];
    let dx = q[0] - o[0], dz = q[1] - o[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    if (k > 0) acc += Math.hypot(p[0] - samples[k - 1][0], p[1] - samples[k - 1][1]);
    const w = 1.05;
    P.push(p[0] - dz * w, 0.07, p[1] + dx * w, p[0] + dz * w, 0.07, p[1] - dx * w);
    UV.push(0, acc / 2.6, 1, acc / 2.6);
    if (k > 0) { const b = (k - 1) * 2; I.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setIndex(I);
  routeMesh.geometry.dispose(); routeMesh.geometry = g; routeMesh.visible = true;
}

/* ---------- offers ---------- */
let offerSeq = 1;
MS.makeOffers = (car) => {
  const S = G.Save.data, lv = G.level(S.xp), night = W.state.night > 0.6, wx = W.state.weather;
  const near = W.places.filter(p => { const d = M.dist(p.sx, p.sz, car.x, car.z); return d > 40 && d < 360; });
  const out = [];
  const usedPick = {};
  for (let tries = 0; tries < 60 && out.length < 3; tries++) {
    const pu = M.pick(Math.random, near.length ? near : W.places);
    if (usedPick[pu.id]) continue;
    const dests = W.places.filter(p => p !== pu && M.dist(p.sx, p.sz, pu.sx, pu.sz) > 230 && M.dist(p.sx, p.sz, pu.sx, pu.sz) < 760);
    if (!dests.length) continue;
    const de = M.pick(Math.random, dests);
    const r = W.routeBetween(pu.sx, pu.sz, de.sx, de.sz);
    if (!r || r.len < 200) continue;
    const toPick = W.routeBetween(car.x, car.z, pu.sx, pu.sz);
    // category: weighted pool, and the three offers try to differ from each other
    const opts = ['standard', 'tourist'];
    if (de.district === 'airport' || pu.district === 'airport') opts.push('airport', 'airport', 'airport');
    if ((de.district === 'upscale' || pu.district === 'upscale') && (lv >= 3 || S.current === 'lux')) opts.push('vip', 'vip');
    if (S.current === 'lux') opts.push('vip');
    if (r.len > 560) opts.push('long', 'long');
    if (night) opts.push('night', 'night');
    if (wx === 'rain') opts.push('storm', 'storm');
    if (wx === 'fog') opts.push('fog', 'fog');
    if (lv >= 2) opts.push('rush', 'chase');
    if (lv >= 4) opts.push('chase');
    if (S.stats.fares === 0 && out.length === 0) opts.length = 1; // the very first fare is a plain one
    const fresh = opts.filter(k => !out.some(o => o.cat === k));
    let ck = M.pick(Math.random, fresh.length && tries < 50 ? fresh : opts);
    if (out.length === 0 && fresh.length > 1 && ck === 'standard' && S.stats.fares > 0) ck = M.pick(Math.random, fresh.filter(k => k !== 'standard'));
    const cat = CATS[ck];
    const veh = G.specFor(S.current, S.upgrades[S.current]);
    const limit = Math.ceil((r.len / cat.speed + 9) / 5) * 5;
    const base = Math.round((6 + r.len * 0.072) * cat.mul * veh.fare);
    usedPick[pu.id] = 1;
    // personality
    let pers = M.pick(Math.random, ['easy', 'chatty', 'chatty', 'nervous', 'impatient']);
    if (ck === 'tourist') pers = 'tourist';
    else if (ck === 'rush' || ck === 'airport') pers = Math.random() < 0.6 ? 'impatient' : pers === 'impatient' ? 'nervous' : pers;
    else if (ck === 'vip') pers = Math.random() < 0.5 ? 'nervous' : 'easy';
    else if ((night && Math.random() < 0.22) || ck === 'chase') pers = Math.random() < 0.7 ? 'party' : pers;
    if (S.stats.fares === 0) pers = 'easy';
    out.push({ id: offerSeq++, cat: ck, pers, pickup: pu, dest: de, len: r.len, toPick: toPick.len, limit, base, max: Math.round(base * 2.1 * PERS[pers].tip), seed: Math.floor(Math.random() * 1e9) });
  }
  MS.offers = out;
  return out;
};

/* ---------- active fare ---------- */
function toWorld(car, lx, lz) { const c = Math.cos(car.heading), s = Math.sin(car.heading); return [car.x + lx * c + lz * s, car.z - lx * s + lz * c]; }
function clearPassenger() {
  if (!MS.cur) return;
  for (const h of [MS.cur.h, MS.cur.walkAway && MS.cur.walkAway.h]) if (h && h.root.parent) h.root.parent.remove(h.root);
}
MS.accept = (offer, car) => {
  clearPassenger();
  const cat = CATS[offer.cat];
  const h = P.makeHuman(M.rng(offer.seed), { suit: offer.cat === 'vip', bag: offer.cat === 'airport' });
  h.root.position.set(offer.pickup.x, 0.18, offer.pickup.z); h.root.rotation.y = offer.pickup.face;
  scene.add(h.root);
  MS.cur = { offer, cat, pers: PERS[offer.pers || 'easy'], persKey: offer.pers || 'easy', h, name: h.name, timeLeft: offer.limit, sat: 100, hits: 0, bigHits: 0, phase: 0, t: 0, stopT: 0, lineCD: 0, talkCD: 8, overtime: false, failed: false, pedHits: 0, slowT: 0, copLine: false };
  MS.state = 'toPickup';
  car.passengerAboard = false;
  setMarker(offer.pickup.sx, offer.pickup.sz, '#40e0ff');
  pin.visible = true;
  MS.routeT = 0;
  G.Audio.chime('accept');
  G.UI.toast(`Fare accepted · ${offer.pickup.name}`);
};
MS.abandon = (car) => {
  if (!MS.cur) return;
  if (MS.cur.target) { G.Traffic.releaseChase(MS.cur.target); MS.cur.target = null; }
  const wasAboard = MS.state === 'delivering' || MS.state === 'boarding';
  if (car) { car.locked = false; car.model.doorPivot.rotation.y = 0; car.passengerAboard = false; }
  clearPassenger();
  if (wasAboard || MS.state === 'toPickup') { G.Save.data.streak = 0; G.Save.write(); }
  MS.cur = null; MS.state = 'idle'; setMarker(null); pin.visible = false; routeMesh.visible = false; MS.routePts = null;
};
MS.retry = (car) => { const o = MS.lastOffer; if (!o) return; MS.abandon(car); const fresh = Object.assign({}, o, { id: offerSeq++ }); MS.accept(fresh, car); };
MS.interact = () => { if (MS.cur) MS.cur.interact = true; };
MS.isActive = () => !!MS.cur && ['toPickup', 'boarding', 'following', 'delivering', 'alighting', 'failExit'].indexOf(MS.state) >= 0;
MS.aboard = () => !!MS.cur && (MS.state === 'following' || MS.state === 'delivering');
// shared ride-mood rules for everything that happens with a passenger in the back
function rideMood(c, car, dt, spd, near) {
  const P0 = c.pers, comfort = (car.spec.comfort || 1) / (c.cat.comfort || 1);
  if (car.impact > 1.5) {
    c.sat -= Math.min(30, car.impact * 2.6) / comfort * (P0.harsh > 1.5 ? 1.4 : 1); c.hits++; if (car.impact > 6) c.bigHits++;
    if (c.lineCD <= 0) { G.UI.say(c.name, say('hit')); c.lineCD = 4; }
  }
  const drifting = car.slip > 4.5 && spd > 6;
  if (c.persKey === 'party' && drifting) { c.sat += dt * 9; if (c.lineCD <= 0) { G.UI.say(c.name, say('drift')); c.lineCD = 6; } }
  else if (Math.abs(car.aLat) > 9 || drifting) c.sat -= dt * 7 * P0.harsh / comfort;
  const fastAt = P0.fastAt || 33;
  if (!P0.noFast && spd > fastAt && c.cat !== CATS.rush) { c.sat -= dt * 2.5 * P0.harsh / comfort; if (c.lineCD <= 0) { G.UI.say(c.name, say(c.persKey === 'nervous' ? 'nervous' : 'fast')); c.lineCD = 8; } }
  if (c.persKey === 'impatient') {
    if (spd < 2.5 && !near) { c.slowT += dt; if (c.slowT > 3) { c.sat -= dt * 3.5; if (c.lineCD <= 0) { G.UI.say(c.name, say('impatient')); c.lineCD = 7; } } }
    else { c.slowT = 0; if (spd > 22) c.sat += dt * 0.8; }
  }
  if (c.persKey === 'tourist' && spd < 18) c.sat += dt * 0.4;
  // small talk
  c.talkCD -= dt;
  if (c.talkCD <= 0 && c.lineCD <= 0) {
    const key = c.persKey === 'chatty' ? 'chatty' : c.persKey === 'tourist' ? 'tourist' : c.persKey === 'party' ? 'party' : null;
    c.talkCD = 14 + Math.random() * 8;
    if (key) { G.UI.say(c.name, say(key)); c.lineCD = 5; }
  }
  // police pursuit
  if (G.Police.stars > 0) {
    if (c.persKey === 'party') c.sat += dt * 1.5; else c.sat -= dt * (c.persKey === 'nervous' ? 6 : 2.2);
    if (!c.copLine) { c.copLine = true; G.UI.say(c.name, say(c.persKey === 'party' ? 'copsParty' : 'cops')); c.lineCD = 5; }
  } else c.copLine = false;
  c.sat = M.clamp(c.sat, 0, 100);
}
G.on('pedHit', () => { const c = MS.cur; if (!c || !MS.aboard()) return; c.sat = Math.max(0, c.sat - 45); c.pedHits++; G.UI.say(c.name, say('ped')); c.lineCD = 5; });
G.on('busted', () => {
  if (!MS.isActive()) return;
  const car = G.player, c = MS.cur;
  MS.abandon(car); G.UI.toast(`${c.name.split(' ')[0]} slipped out while you were busted`, 'bad');
});

const WALK = 1.7;
function walkTo(h, tx, tz, dt, speed) {
  const p = h.root.position, dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
  const sp = speed || WALK;
  if (d < 0.08) return true;
  const st = Math.min(d, sp * dt);
  p.x += dx / d * st; p.z += dz / d * st;
  const want = Math.atan2(dx, dz);
  h.root.rotation.y += M.wrapAngle(want - h.root.rotation.y) * Math.min(1, dt * 10);
  p.y = M.damp(p.y, W.insideSolid(p.x, p.z, 0.2) ? 0.18 : 0, 14, dt);
  P.pose(h, 'walk', dt, sp / 1.4);
  return false;
}

MS.update = (dt, car) => {
  const c = MS.cur;
  if (routeMesh.visible) arrowTex.offset.y -= dt * 1.2;
  ring.scale.setScalar(1 + Math.sin(performance.now() * 0.004) * 0.06);
  if (!c) { G.UI.prompt(null); return; }
  c.lineCD -= dt;
  const o = c.offer, h = c.h, spd = car.speed;
  // route refresh
  MS.routeT -= dt;
  if (MS.target && MS.routeT <= 0) {
    MS.routeT = 0.7;
    const r = W.routeBetween(car.x, car.z, MS.target.x, MS.target.z);
    MS.routePts = r.pts; MS.routeLen = r.len; buildRibbon(r.pts);
  }
  if (MS.state === 'toPickup') {
    MS.target = { x: o.pickup.sx, z: o.pickup.sz, kind: 'pickup' };
    const d = M.dist(car.x, car.z, o.pickup.sx, o.pickup.sz);
    const pd = M.dist(car.x, car.z, h.root.position.x, h.root.position.z);
    P.pose(h, pd < 45 ? 'wave' : 'idle', dt);
    if (pd < 45) { const want = Math.atan2(car.x - h.root.position.x, car.z - h.root.position.z); h.root.rotation.y += M.wrapAngle(want - h.root.rotation.y) * Math.min(1, dt * 4); }
    pin.position.set(h.root.position.x, 2.35 + Math.sin(performance.now() * 0.004) * 0.12, h.root.position.z); pin.rotation.y += dt * 2;
    G.UI.objective(`Pick up ${c.name}`, `${o.pickup.name} · ${o.pickup.dname}`, Math.round(d));
    if (d < 11) {
      if (spd > 2.6) { G.UI.prompt('Slow down and stop by the beacon'); c.stopT = 0; }
      else {
        c.stopT += dt;
        G.UI.prompt(`E · Let ${c.name.split(' ')[0]} board`, true);
        if (c.interact || c.stopT > 1.4) startBoarding(car);
      }
    } else G.UI.prompt(null);
    c.interact = false;
  } else if (MS.state === 'boarding') {
    updateBoarding(dt, car);
  } else if (MS.state === 'following') {
    let tc = c.target;
    if (!tc) {
      // no suitable car in range yet: keep looking for a few seconds
      c.searchT += dt; c.searchCD = (c.searchCD || 0) - dt;
      if (c.searchCD <= 0) { c.searchCD = 0.5; tc = acquireTarget(car); }
      if (!tc) {
        G.UI.objective('Look for the car', `${c.name.split(' ')[0]} is watching for it…`, null);
        if (c.searchT > 10) { G.UI.toast('The car never showed. Straight to the destination'); endFollow(car, false, true); }
        return;
      }
    }
    const tname = c.targetName || 'car';
    if (!tc.chase || !tc.model.root.visible) { endFollow(car, false); return; }
    MS.target = { x: tc.x, z: tc.z, kind: 'follow' };
    setMarker(tc.x, tc.z, CATS.chase.color);
    const d = M.dist(car.x, car.z, tc.x, tc.z);
    c.t += dt;
    if (d < 75) c.followT += dt;
    c.lostT = d > 110 ? c.lostT + dt : Math.max(0, c.lostT - dt);
    if (d < 9 && c.lineCD <= 0) { G.UI.say(c.name, say('followClose')); c.lineCD = 6; }
    if (d < 9) c.sat -= dt * 2;
    rideMood(c, car, dt, spd, false);
    const left = Math.max(0, c.followNeed - c.followT);
    G.UI.objective(`Follow the ${tname}`, d < 75 ? `Tailing · ${Math.ceil(left)} s to go` : d > 110 ? 'Losing them — catch up!' : 'Get closer (75 m)', Math.round(d));
    G.UI.follow(c.followT / c.followNeed, c.lostT / 6);
    if (c.lostT > 6) endFollow(car, false);
    else if (c.followT >= c.followNeed) endFollow(car, true);
    G.UI.prompt(null);
    c.interact = false;
  } else if (MS.state === 'delivering' || MS.state === 'failExit') {
    MS.target = { x: o.dest.sx, z: o.dest.sz, kind: 'dest' };
    const d = M.dist(car.x, car.z, o.dest.sx, o.dest.sz);
    if (MS.state === 'delivering') {
      c.timeLeft -= dt;
      c.t += dt;
      rideMood(c, car, dt, spd, d < 25);
      if (c.timeLeft < 0) {
        if (!c.overtime) { c.overtime = true; G.UI.say(c.name, say('late')); G.Audio.chime('gps'); }
        if (c.cat.strict || c.timeLeft < -o.limit * 0.5) { failRide(car, c.cat.strict ? 'Out of time. Rush fares have a hard deadline.' : 'Far too late. The passenger gave up on the ride.'); }
      }
      G.UI.objective(`Drive ${c.name.split(' ')[0]} to ${o.dest.name}`, o.dest.dname, Math.round(d));
    } else G.UI.objective(`Pull over to let ${c.name.split(' ')[0]} out`, 'Fare cancelled', null);
    const nearDest = MS.state === 'delivering' ? d < 11 : true;
    if (nearDest) {
      if (spd > 2.6) G.UI.prompt(MS.state === 'delivering' ? 'Slow down and stop at the curb' : 'Stop the car');
      else { c.stopT += dt; G.UI.prompt(MS.state === 'delivering' ? `E · Drop off ${c.name.split(' ')[0]}` : 'Passenger is getting out', true); if (c.interact || c.stopT > 1.0) startAlighting(car); }
    } else { G.UI.prompt(null); c.stopT = 0; }
    c.interact = false;
  } else if (MS.state === 'alighting') {
    updateAlighting(dt, car);
  }
  if (c.walkAway) {
    const wa = c.walkAway; wa.t += dt;
    if (walkTo(wa.h, wa.x, wa.z, dt, 1.4) || wa.t > 7) { if (wa.h.root.parent) wa.h.root.parent.remove(wa.h.root); c.walkAway = null; }
  }
};

function startBoarding(car) {
  const c = MS.cur;
  MS.state = 'boarding'; c.phase = 0; c.pt = 0;
  car.locked = true; pin.visible = false; G.UI.prompt(null);
  setMarker(null); routeMesh.visible = false;
  // waypoints in car-local space
  const m = car.model, d = car.dims, h = c.h;
  const lp = (() => { const dx = h.root.position.x - car.x, dz = h.root.position.z - car.z, cs = Math.cos(car.heading), sn = Math.sin(car.heading); return [dx * cs - dz * sn, dx * sn + dz * cs]; })();
  c.way = [];
  if (lp[0] > -0.6) { // passenger is on the driver side or in front: walk around the back
    c.way.push([Math.max(lp[0], d.W / 2 + 0.9), -d.L / 2 - 1.0]);
    c.way.push([-d.W / 2 - 0.9, -d.L / 2 - 1.0]);
  }
  c.way.push([m.doorOut.x, m.doorOut.z]);
  G.UI.say(c.name, 'Hi!');
}
function updateBoarding(dt, car) {
  const c = MS.cur, h = c.h, m = car.model, d = car.dims;
  c.pt += dt;
  if (c.phase === 0) { // walk to the door
    const wp = c.way[0], w = toWorld(car, wp[0], wp[1]);
    if (walkTo(h, w[0], w[1], dt) || c.pt > 12) { c.way.shift(); if (!c.way.length || c.pt > 12) { c.phase = 1; c.pt = 0; G.Audio.door(true); } }
  } else if (c.phase === 1) { // open door + turn toward the car
    const k = M.smooth(Math.min(1, c.pt / 0.5));
    m.doorPivot.rotation.y = 1.15 * k;
    const want = car.heading + Math.PI / 2;
    h.root.rotation.y += M.wrapAngle(want - h.root.rotation.y) * Math.min(1, dt * 8);
    P.pose(h, 'idle', dt);
    if (c.pt > 0.55) { c.phase = 2; c.pt = 0; const w = toWorld(car, m.doorOut.x, m.doorOut.z); c.from = [w[0], h.root.position.y, w[1]]; }
  } else if (c.phase === 2) { // duck and slide into the seat
    const k = Math.min(1, c.pt / 1.15), e = M.smooth(k);
    const seat = toWorld(car, m.seat.x, m.seat.z);
    const sy = m.seat.y - 0.92;
    h.root.position.set(M.lerp(c.from[0], seat[0], e), M.lerp(c.from[1], sy, e), M.lerp(c.from[2], seat[1], e));
    h.root.rotation.y = car.heading + Math.PI / 2 * (1 - e);
    P.pose(h, 'enter', dt, k);
    if (k >= 1) {
      scene.remove(h.root); m.body.add(h.root);
      h.root.position.set(m.seat.x, m.seat.y - 0.92, m.seat.z); h.root.rotation.set(0, 0, 0);
      P.pose(h, 'sit', 0);
      c.phase = 3; c.pt = 0;
    }
  } else if (c.phase === 3) { // close door
    const k = M.smooth(Math.min(1, c.pt / 0.4));
    m.doorPivot.rotation.y = 1.15 * (1 - k);
    if (k >= 1) {
      G.Audio.door(false);
      car.locked = false; car.passengerAboard = true;
      c.stopT = 0; c.t = 0;
      G.Audio.chime('board');
      if (c.cat.chase) { startFollow(car); return; }
      MS.state = 'delivering';
      setMarker(c.offer.dest.sx, c.offer.dest.sz, '#ffb321'); MS.routeT = 0;
      const key = c.offer.cat === 'airport' ? 'airport' : c.offer.cat === 'vip' ? 'vip' : c.offer.cat === 'rush' ? 'rush' : 'hello';
      G.UI.say(c.name, say(key, { dest: c.offer.dest.name }));
      G.UI.toast(`Meter running · ${Math.round(c.offer.limit)} s to ${c.offer.dest.name}`);
    }
  }
}
const CAR_NAMES = { sedan: 'sedan', suv: 'SUV', sport: 'sports car', lux: 'limo', super: 'supercar' };
const COLOR_NAMES = { '#e8e8ea': 'silver', '#1b1d22': 'black', '#8a8f96': 'grey', '#c0392b': 'red', '#2d3e50': 'navy', '#3b5bdb': 'blue', '#1f7a5c': 'green', '#d8cfc0': 'beige', '#6d2b3a': 'maroon', '#f0f0f0': 'white', '#4a4f55': 'charcoal', '#b5651d': 'bronze' };
function startFollow(car) {
  const c = MS.cur;
  c.target = null; c.followT = 0; c.followNeed = 35 + Math.round(Math.random() * 15); c.lostT = 0; c.searchT = 0;
  MS.state = 'following'; MS.routeT = 0; MS.target = null;
  acquireTarget(car);
  return true;
}
function acquireTarget(car) {
  const c = MS.cur, tc = G.Traffic.pickChaseTarget(car);
  if (!tc) return null;
  c.target = tc;
  c.targetName = (COLOR_NAMES[tc.color] ? COLOR_NAMES[tc.color] + ' ' : '') + (CAR_NAMES[tc.type] || 'car');
  G.UI.say(c.name, say('followStart', { car: c.targetName }));
  G.UI.toast(`Tail the ${c.targetName} for ${c.followNeed} s`);
  return tc;
}
function endFollow(car, ok, quiet) {
  const c = MS.cur;
  G.Traffic.releaseChase(c.target); c.target = null;
  c.followOk = ok; c.followBonus = ok ? Math.round(c.offer.base * 0.55) : 0;
  if (!ok && !quiet) c.sat -= 15;
  G.UI.follow(null);
  if (!quiet) G.UI.say(c.name, say(ok ? 'followDone' : 'followLost', { dest: c.offer.dest.name }));
  if (ok) G.Audio.chime('done'); else G.Audio.chime('gps');
  MS.state = 'delivering';
  setMarker(c.offer.dest.sx, c.offer.dest.sz, '#ffb321'); MS.routeT = 0;
  G.UI.toast(`Meter running · ${Math.round(c.timeLeft)} s to ${c.offer.dest.name}`);
}
function failRide(car, reason) {
  const c = MS.cur; if (c.failed) return;
  c.failed = true; c.failReason = reason; MS.state = 'failExit'; c.stopT = 0;
  setMarker(null); routeMesh.visible = false; MS.target = null;
  G.UI.say(c.name, say('fail')); G.Audio.chime('fail');
}
function startAlighting(car) {
  const c = MS.cur;
  MS.wasFailed = c.failed;
  MS.state = 'alighting'; c.phase = 0; c.pt = 0; car.locked = true; G.UI.prompt(null);
  setMarker(null); routeMesh.visible = false; MS.target = null;
  if (!c.failed) c.result = computeResult(c, car);
  G.Audio.door(true);
}
function updateAlighting(dt, car) {
  const c = MS.cur, h = c.h, m = car.model;
  c.pt += dt;
  if (c.phase === 0) { const k = M.smooth(Math.min(1, c.pt / 0.5)); m.doorPivot.rotation.y = 1.15 * k; if (c.pt > 0.55) {
    // move from seat back into world space
    const seat = toWorld(car, m.seat.x, m.seat.z);
    m.body.remove(h.root); scene.add(h.root);
    h.root.position.set(seat[0], m.seat.y - 0.92, seat[1]); h.root.rotation.set(0, car.heading, 0);
    c.phase = 1; c.pt = 0; } }
  else if (c.phase === 1) {
    const k = Math.min(1, c.pt / 1.1), e = M.smooth(k);
    const seat = toWorld(car, m.seat.x, m.seat.z), out = toWorld(car, m.doorOut.x, m.doorOut.z);
    h.root.position.set(M.lerp(seat[0], out[0], e), M.lerp(m.seat.y - 0.92, 0, e), M.lerp(seat[1], out[1], e));
    h.root.rotation.y = car.heading + Math.PI / 2 * e;
    P.pose(h, 'enter', dt, 1 - k);
    if (k >= 1) { c.phase = 2; c.pt = 0; car.passengerAboard = false; }
  } else if (c.phase === 2) {
    const k = M.smooth(Math.min(1, c.pt / 0.4));
    m.doorPivot.rotation.y = 1.15 * (1 - k);
    // passenger steps away toward the sidewalk
    const dst = c.failed ? toWorld(car, m.doorOut.x - 3, m.doorOut.z) : [c.offer.dest.x, c.offer.dest.z];
    walkTo(h, dst[0], dst[1], dt, 1.3);
    if (k >= 1) {
      G.Audio.door(false); car.locked = false;
      const wa = c.failed ? toWorld(car, m.doorOut.x - 6, m.doorOut.z - 4) : c.offer.dest.inward;
      MS.lastOffer = c.offer;
      const done = { h, x: wa[0], z: wa[1], t: 0 };
      if (c.failed) { finishFail(c); } else finishSuccess(c, car);
      MS.cur = { walkAway: done, offer: c.offer, lineCD: 0 };
      MS.state = c.failed ? 'failed' : 'complete';
    }
  }
}
function computeResult(c, car) {
  const o = c.offer, base = o.base;
  const frac = M.clamp(c.timeLeft / o.limit, 0, 1);
  const timeAdj = c.timeLeft >= 0 ? Math.round(base * 0.5 * frac) : -Math.round(base * Math.min(0.7, -c.timeLeft / o.limit * 1.4));
  const quality = M.clamp(100 - c.hits * 7 - c.bigHits * 10, 0, 100);
  const qualityBonus = quality >= 50 ? Math.round(base * 0.25 * quality / 100) : 0;
  const sat = Math.round(c.sat);
  const condition = Math.round(100 - (car.damage || 0));
  const tip = Math.round(base * 0.35 * Math.pow(sat / 100, 2) * (c.pers ? c.pers.tip : 1) * (1 - (100 - condition) / 100 * 0.6));
  const streak = G.Save.data.streak;
  const streakBonus = Math.round(base * Math.min(0.25, 0.05 * streak));
  const followBonus = c.followBonus || 0;
  const fines = Math.round(G.Save.data.fines || 0);
  const total = Math.max(0, base + timeAdj + qualityBonus + tip + streakBonus + followBonus - fines);
  const stars = M.clamp(Math.round(sat / 20), 1, 5);
  const xp = Math.round(total * 0.5 + 15 + (c.cat.xp || 0));
  return { base, timeAdj, timeLeft: c.timeLeft, quality, qualityBonus, sat, tip, streak: streak + 1, streakBonus, followBonus, followOk: c.followOk, fines, condition, pers: c.pers, total, stars, xp, hits: c.hits, pedHits: c.pedHits, rideTime: c.t, cat: c.offer.cat };
}
function finishSuccess(c, car) {
  const S = G.Save.data, r = c.result;
  const lvBefore = G.level(S.xp);
  S.fines = 0;
  S.cash += r.total; S.xp += r.xp; S.streak++; S.stats.fares++; S.stats.earned += r.total; S.stats.bestStreak = Math.max(S.stats.bestStreak, S.streak);
  r.trip = S.trip++; r.balance = S.cash; r.levelUp = G.level(S.xp) > lvBefore ? G.level(S.xp) : 0;
  S.started = true; G.Save.write();
  G.UI.say(c.name, say(r.sat > 55 ? 'thanks' : 'grumpy'));
  G.Audio.chime('done');
  G.UI.showComplete(c, r);
  G.emit('fareDone', r);
}
function finishFail(c) {
  const S = G.Save.data; S.streak = 0; S.stats.failed++; S.started = true; G.Save.write();
  G.emit('fareFailed', c.offer.cat);
  G.UI.showFail(c, c.failReason || 'Fare cancelled.');
}
MS.toWorld = toWorld;
})();
