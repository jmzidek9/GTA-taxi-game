/* CROSSTOWN — main: renderer, game loop, cameras, app states, wiring */
'use strict';
(function () {
const G = window.G, M = G.M, W = G.World, UI = G.UI, MS = G.Mission;
const $ = s => document.querySelector(s);
const App = G.App = { mode: 'menu', camMode: 'chase', paused: false, time: 0 };

const QUALITY = {
  low: { pr: 1, shadow: 0, traffic: 10, peds: 10, rain: 1200, aa: false },
  medium: { pr: 1.5, shadow: 1024, traffic: 18, peds: 18, rain: 2200, aa: true },
  high: { pr: 2, shadow: 2048, traffic: 26, peds: 30, rain: 3500, aa: true },
};
function qualityKey() { const q = G.Save.data.settings.quality; return q === 'auto' ? (UI.isTouch ? 'medium' : 'high') : q; }

let renderer, scene, camera, car, skids, rain, clock = 0, fpsAcc = 0, fpsN = 0;
const camState = { pos: new THREE.Vector3(0, 30, 60), look: new THREE.Vector3(), yawOff: 0, dragT: 0, shake: 0, orbit: 0 };

function fail(msg) {
  const el = $('#bootError'); el.hidden = false; el.querySelector('p').textContent = msg;
  const ld = $('#loading'); if (ld) ld.hidden = true;
}
window.addEventListener('error', e => { if (!App.ready) fail('Something went wrong while starting: ' + (e.message || 'unknown error')); });

function boot() {
  if (!window.THREE) return fail('The 3D engine could not load. Check your connection and reload the page.');
  G.Save.load();
  const q = QUALITY[qualityKey()];
  try {
    renderer = G.renderer = new THREE.WebGLRenderer({ antialias: q.aa, powerPreference: 'high-performance' });
  } catch (e) { return fail('WebGL is not available on this device or browser.'); }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pr));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  G.maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  $('#stage').appendChild(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(G.Save.data.settings.fov, window.innerWidth / window.innerHeight, 0.1, 2600);
  W.build(scene, renderer);
  applyShadow(q);
  // player car
  const S = G.Save.data;
  car = G.player = new G.Car(scene, S.current, S.paint[S.current] || G.VEHICLES[S.current].color, S.upgrades[S.current]);
  const driver = G.People.makeHuman(M.rng(7), { top: '#2f2f33', hair: '#1d1612', skin: '#c98e66' });
  car.addDriver(driver); car.placeDriver();
  spawnPlayer();
  skids = new G.Skids(scene, 600);
  G.Traffic.init(scene, q.traffic, { x: car.x, z: car.z });
  G.Traffic.buildParked(scene);
  G.People.Peds.init(scene, q.peds, { x: car.x, z: car.z });
  MS.init(scene);
  buildRain(q.rain);
  UI.init();
  UI.onAction = onAction;
  bindCameraDrag();
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', () => { if (document.hidden && App.mode === 'play') setPaused(true); });
  App.ready = true;
  $('#loading').hidden = true;
  showMenu();
  requestAnimationFrame(loop);
}
function applyShadow(q) {
  W.sun.castShadow = q.shadow > 0;
  if (q.shadow > 0) { W.sun.shadow.mapSize.set(q.shadow, q.shadow); if (W.sun.shadow.map) { W.sun.shadow.map.dispose(); W.sun.shadow.map = null; } }
}
function spawnPlayer() {
  const a = W.node(3, 3), b = W.node(3, 4);
  const fx = 0, fz = 1;
  car.teleport(a.x - G.CFG.LANE, a.z + 22, Math.atan2(fx, fz));
}
function recover() {
  const e = W.nearestEdge(car.x, car.z), A = W.nodes[e.a], B = W.nodes[e.b];
  const L = Math.hypot(B.x - A.x, B.z - A.z), ux = (B.x - A.x) / L, uz = (B.z - A.z) / L;
  const s = M.clamp(e.t * L, 12, L - 12);
  const px = A.x + ux * s, pz = A.z + uz * s;
  let fx = ux, fz = uz;
  if (fx * Math.sin(car.heading) + fz * Math.cos(car.heading) < 0) { fx = -fx; fz = -fz; }
  // right-hand lane of the chosen direction
  car.teleport(px - fz * G.CFG.LANE, pz + fx * G.CFG.LANE, Math.atan2(fx, fz));
  UI.toast('Car reset to the road');
}
function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
}
function buildRain(n) {
  if (rain) { scene.remove(rain); rain.geometry.dispose(); }
  const g = new THREE.BufferGeometry(), pos = new Float32Array(n * 6);
  for (let k = 0; k < n; k++) { const x = (Math.random() - 0.5) * 80, y = Math.random() * 40, z = (Math.random() - 0.5) * 80; pos.set([x, y, z, x, y - 0.7, z], k * 6); }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xaab8c8, transparent: true, opacity: 0, depthWrite: false }));
  rain.frustumCulled = false; rain.userData.n = n; scene.add(rain);
}
function updateRain(dt) {
  const r = W.state.wx.rain; rain.visible = r > 0.03; rain.material.opacity = r * 0.42;
  if (!rain.visible) return;
  const p = rain.geometry.attributes.position.array, n = rain.userData.n, cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
  const fall = 26 * dt, wind = 3 * dt;
  for (let k = 0; k < n; k++) {
    const i = k * 6;
    let x = p[i] + wind, y = p[i + 1] - fall, z = p[i + 2];
    if (y < cy - 12 || y < 0) { y = cy + 15 + Math.random() * 10; x = cx + (Math.random() - 0.5) * 80; z = cz + (Math.random() - 0.5) * 80; }
    if (x - cx > 40) x -= 80; if (x - cx < -40) x += 80; if (z - cz > 40) z -= 80; if (z - cz < -40) z += 80;
    p[i] = x; p[i + 1] = y; p[i + 2] = z; p[i + 3] = x - 0.12; p[i + 4] = y - 0.8; p[i + 5] = z;
  }
  rain.geometry.attributes.position.needsUpdate = true;
}

/* ---------- Cameras ---------- */
function bindCameraDrag() {
  const el = renderer.domElement; let dragging = false, lx = 0;
  el.addEventListener('pointerdown', e => { if (e.pointerType === 'touch') return; dragging = true; lx = e.clientX; });
  window.addEventListener('pointermove', e => { if (!dragging) return; camState.yawOff = M.clamp(camState.yawOff - (e.clientX - lx) * 0.006 * G.Save.data.settings.sens, -Math.PI, Math.PI); lx = e.clientX; camState.dragT = 1.4; });
  window.addEventListener('pointerup', () => { dragging = false; });
}
const _v = new THREE.Vector3(), _t = new THREE.Vector3();
function updateCamera(dt) {
  const S = G.Save.data.settings, d = car.dims;
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  if (App.mode === 'menu') {
    camState.orbit += dt * 0.05;
    const r = 210, a = camState.orbit;
    camera.position.set(Math.cos(a) * r - 20, 95 + Math.sin(a * 0.7) * 20, Math.sin(a) * r);
    camera.lookAt(-10, 20, 0); camera.fov = 55; camera.near = 0.5; camera.updateProjectionMatrix();
    return;
  }
  if (App.mode === 'garage') {
    camState.orbit += dt * 0.25;
    const a = camState.orbit + car.heading;
    camera.position.set(car.x + Math.sin(a) * 7.2, 2.4, car.z + Math.cos(a) * 7.2);
    camera.lookAt(car.x, 0.8, car.z); camera.fov = 45; camera.near = 0.1; camera.updateProjectionMatrix();
    if (car.driver) car.driver.root.visible = true;
    return;
  }
  if (App.camMode === 'cockpit') {
    if (car.driver) car.driver.root.visible = false;
    car.model.body.updateMatrixWorld(true);
    const eyeY = car.model.seat.y + 0.8;
    _v.set(0.4, eyeY, d.cabF - 1.28); car.model.body.localToWorld(_v);
    _t.set(0.4 + Math.sin(camState.yawOff) * 10, eyeY - 0.6, d.cabF - 1.28 + Math.cos(camState.yawOff) * 10); car.model.body.localToWorld(_t);
    camera.position.copy(_v); camera.lookAt(_t);
    camera.near = 0.05; camera.fov = S.fov + 4;
  } else {
    if (car.driver) car.driver.root.visible = true;
    if (camState.dragT > 0) camState.dragT -= dt; else camState.yawOff = M.damp(camState.yawOff, 0, 3, dt);
    const sp = car.speed;
    const dist = 6.6 + Math.min(sp, 40) * 0.05 + d.L * 0.25, height = 2.25 + d.roof * 0.45 + Math.min(sp, 40) * 0.012;
    // camera trails the velocity direction a little for a weighty feel
    const lagH = car.heading - car.yawRate * 0.18 + camState.yawOff;
    const want = _v.set(car.x - Math.sin(lagH) * dist, height, car.z - Math.cos(lagH) * dist);
    // pull in if a building is behind the car
    let t = 1;
    for (let k = 0; k < 6; k++) { const px = M.lerp(car.x, want.x, t), pz = M.lerp(car.z, want.z, t); if (W.insideSolid(px, pz, 4.5)) t -= 0.15; else break; }
    want.x = M.lerp(car.x, want.x, t); want.z = M.lerp(car.z, want.z, t);
    camState.pos.x = M.damp(camState.pos.x, want.x, 7, dt); camState.pos.z = M.damp(camState.pos.z, want.z, 7, dt); camState.pos.y = M.damp(camState.pos.y, want.y, 5, dt);
    if (camState.pos.distanceTo(want) > 40) camState.pos.copy(want);
    camState.look.set(car.x + fx * 4, 1.1 + d.belt * 0.3, car.z + fz * 4);
    camera.position.copy(camState.pos);
    camera.near = 0.1; camera.fov = M.damp(camera.fov, S.fov + Math.min(sp, 50) * 0.22, 3, dt);
    camera.lookAt(camState.look);
  }
  if (camState.shake > 0 && S.shake) { camera.position.x += (Math.random() - 0.5) * camState.shake; camera.position.y += (Math.random() - 0.5) * camState.shake; camState.shake = Math.max(0, camState.shake - dt * 1.5); }
  camera.updateProjectionMatrix();
}

/* ---------- App flow ---------- */
function showMenu() {
  App.mode = 'menu'; setPaused(false, true);
  const S = G.Save.data;
  $('#menuContinue').hidden = !G.Save.hasProgress();
  $('#menuStart').textContent = G.Save.hasProgress() ? 'New career' : 'Start driving';
  $('#menuStart').classList.toggle('primary', !G.Save.hasProgress());
  $('#menuStats').textContent = G.Save.hasProgress() ? `${S.stats.fares} fares · ${UI.money(S.stats.earned)} earned · best streak ${S.stats.bestStreak}` : 'Vale Harbor needs a driver.';
  document.body.dataset.mode = 'menu';
  UI.show('mainMenu');
}
function startPlay(fresh) {
  G.Audio.init();
  if (fresh) {
    G.Save.reset(); G.Save.data.started = true; G.Save.write();
    applyVehicle(); MS.abandon(car); spawnPlayer();
  }
  App.mode = 'play'; document.body.dataset.mode = 'play';
  UI.show(null); UI.refreshMoney();
  if (!MS.isActive()) setTimeout(() => { if (App.mode === 'play' && !MS.isActive() && !App.paused) openDispatch(); }, fresh ? 900 : 300);
}
function setPaused(p, silent) {
  App.paused = p; UI.clearInput();
  if (p) { UI.show('pause'); $('#pauseRestart').disabled = !MS.isActive(); $('#pauseAbandon').disabled = !MS.isActive(); }
  else if (!silent) UI.show(null);
}
function openDispatch() {
  if (MS.isActive()) { UI.toast('Finish the current fare first'); return; }
  App.paused = true; UI.clearInput();
  UI.showDispatch(MS.makeOffers(car));
}
function closeSheetToPlay() { App.paused = false; UI.show(null); UI.clearInput(); }
function applyVehicle() {
  const S = G.Save.data;
  car.setType(S.current, S.paint[S.current] || G.VEHICLES[S.current].color, S.upgrades[S.current]);
  car.placeDriver();
}
function openGarage(from) {
  App.garageFrom = from; App.mode = 'garage'; App.paused = true; document.body.dataset.mode = 'garage';
  UI.garageSel = G.Save.data.current; UI.renderGarage(); UI.show('garage');
  car.vx = car.vz = 0;
}
function closeGarage() {
  applyVehicle();
  if (App.garageFrom === 'menu') showMenu(); else { App.mode = 'play'; document.body.dataset.mode = 'play'; setPaused(true); }
}
function onAction(a, arg) {
  const inMenu = App.mode !== 'play';
  switch (a) {
    case 'start': startPlay(!G.Save.hasProgress()); break;
    case 'newCareer': if (G.Save.hasProgress()) UI.show('confirmNew'); else startPlay(true); break;
    case 'confirmNew': startPlay(true); break;
    case 'cancelConfirmNew': UI.show('mainMenu'); break;
    case 'continue': startPlay(false); break;
    case 'garageMenu': openGarage('menu'); break;
    case 'garagePause': openGarage('pause'); break;
    case 'garageBack': closeGarage(); break;
    case 'garagePreview': { const S = G.Save.data; car.setType(arg, S.paint[arg] || G.VEHICLES[arg].color, S.upgrades[arg]); car.placeDriver(); break; }
    case 'garageAction': {
      const S = G.Save.data, k = UI.garageSel, V = G.VEHICLES[k], btn = $('#gAction');
      if (btn.dataset.mode === 'buy' && S.cash >= V.price) { S.cash -= V.price; S.owned.push(k); S.current = k; S.started = true; G.Audio.chime('buy'); UI.toast(`${V.name} is yours`); }
      else if (btn.dataset.mode === 'use') { S.current = k; UI.toast(`Now driving the ${V.name}`); }
      G.Save.write(); UI.renderGarage(); UI.refreshMoney(); break;
    }
    case 'upgrade': {
      const S = G.Save.data, k = UI.garageSel, up = S.upgrades[k] = S.upgrades[k] || {}, lv = up[arg] || 0, cost = G.UPGRADES[arg].costs[lv];
      if (S.owned.indexOf(k) >= 0 && lv < 3 && S.cash >= cost) { S.cash -= cost; up[arg] = lv + 1; G.Save.write(); G.Audio.chime('buy'); car.spec = G.specFor(k, up); UI.toast(`${G.UPGRADES[arg].name} upgraded to level ${lv + 1}`); }
      UI.renderGarage(); UI.refreshMoney(); break;
    }
    case 'paint': { const S = G.Save.data, k = UI.garageSel; if (S.owned.indexOf(k) < 0) break; S.paint[k] = arg; G.Save.write(); car.setColor(arg); UI.renderGarage(); break; }
    case 'settingsMenu': App.settingsFrom = App.mode === 'menu' ? 'mainMenu' : 'pause'; UI.syncSettings(); UI.show('settings'); break;
    case 'settingsBack': UI.show(App.settingsFrom || 'pause'); break;
    case 'controlsMenu': App.controlsFrom = App.mode === 'menu' ? 'mainMenu' : 'pause'; UI.show('controls'); break;
    case 'controlsBack': UI.show(App.controlsFrom || 'pause'); break;
    case 'settings': if (arg === 'quality') { const q = QUALITY[qualityKey()]; renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pr)); applyShadow(q); G.Traffic.init(scene, q.traffic, { x: car.x, z: car.z }); G.People.Peds.init(scene, q.peds, { x: car.x, z: car.z }); buildRain(q.rain); } if (arg === 'fov') camera.fov = G.Save.data.settings.fov; break;
    case 'resetProgress': UI.show('confirmReset'); break;
    case 'confirmReset': G.Save.reset(); MS.abandon(car); applyVehicle(); UI.refreshMoney(); UI.toast('Progress reset'); showMenu(); break;
    case 'cancelConfirm': UI.show(App.mode === 'menu' ? (App.settingsFrom === 'mainMenu' ? 'settings' : 'mainMenu') : 'settings'); break;
    case 'menu': MS.abandon(car); G.Save.write(); showMenu(); break;
    case 'pause': if (App.mode !== 'play') break; if (document.body.dataset.sheet === 'dispatch' || document.body.dataset.sheet === 'complete' || document.body.dataset.sheet === 'fail') { closeSheetToPlay(); break; } setPaused(!App.paused); break;
    case 'resume': setPaused(false); break;
    case 'restart': if (MS.isActive()) { MS.lastOffer = MS.cur.offer; MS.retry(car); } setPaused(false); break;
    case 'abandon': if (MS.isActive()) { MS.abandon(car); UI.toast('Fare abandoned · streak reset'); } setPaused(false); break;
    case 'recover': if (App.mode === 'play') { if (MS.state === 'boarding' || MS.state === 'alighting') break; recover(); if (App.paused) setPaused(false); } break;
    case 'camera': if (App.mode === 'play') { App.camMode = App.camMode === 'chase' ? 'cockpit' : 'chase'; camState.yawOff = 0; UI.toast(App.camMode === 'chase' ? 'Chase camera' : 'Cockpit camera'); } break;
    case 'fares': if (App.mode === 'play') { if (document.body.dataset.sheet === 'dispatch') closeSheetToPlay(); else if (!App.paused || ['complete', 'fail'].indexOf(document.body.dataset.sheet) >= 0) openDispatch(); } break;
    case 'refreshOffers': UI.showDispatch(MS.makeOffers(car)); break;
    case 'accept': { const o = MS.offers[arg]; if (o) { MS.accept(o, car); closeSheetToPlay(); } break; }
    case 'o1': case 'o2': case 'o3': if (document.body.dataset.sheet === 'dispatch') onAction('accept', +a[1] - 1); break;
    case 'enter': if (document.body.dataset.sheet === 'complete') openDispatch(); else if (document.body.dataset.sheet === 'mainMenu') onAction(G.Save.hasProgress() ? 'continue' : 'start'); break;
    case 'nextFare': openDispatch(); break;
    case 'roam': closeSheetToPlay(); break;
    case 'retry': MS.retry(car); closeSheetToPlay(); break;
    case 'interact': if (App.mode === 'play' && !App.paused) MS.interact(); break;
    case 'horn': if (App.mode === 'play') G.Audio.horn(); break;
    case 'mute': { const s = G.Save.data.settings; s.volume = s.volume > 0 ? 0 : 0.7; G.Audio.setVolume(s.volume); G.Save.write(); UI.toast(s.volume ? 'Sound on' : 'Sound off'); break; }
  }
  if (inMenu) return;
}

/* ---------- Loop ---------- */
let last = performance.now(), envGrip = 1;
function loop(now) {
  requestAnimationFrame(loop);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!App.ready) return;
  const playing = App.mode === 'play' && !App.paused;
  const simDt = App.mode === 'menu' ? dt : playing ? dt : 0;
  App.time += simDt;
  const inp = playing ? UI.pollInput(dt) : { gas: 0, brake: 0, steer: 0, hb: false };
  // physics substeps
  envGrip = 1 - W.state.wx.wet * 0.16;
  if (playing) {
    const steps = 3, h = dt / steps;
    for (let k = 0; k < steps; k++) car.update(h, inp, { grip: envGrip });
    const imp = car.collideWith(G.Traffic.circles());
    if (car.impact > 2) { G.Audio.crash(car.impact); camState.shake = Math.min(0.5, car.impact * 0.04); }
    // skid marks from rear wheels
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading), rx = -fz, rz = fx, d = car.dims;
    const skid = car.speed > 4 && (car.slip > 3 || (car.braking > 0.9 && car.speed > 12));
    for (const sx of [-1, 1]) skids.add(sx, car.x - fx * d.wb / 2 + rx * sx * d.track / 2, car.z - fz * d.wb / 2 + rz * sx * d.track / 2, fx, fz, skid);
  }
  car.sync(simDt, W.state.night);
  const focus = { x: car.x, z: car.z };
  W.update(App.mode === 'garage' ? dt : simDt || (App.paused ? 0 : dt), focus, renderer);
  if (simDt > 0) {
    G.Traffic.update(simDt, focus, car, W.state.night);
    G.People.Peds.update(simDt, focus);
  }
  if (playing) MS.update(dt, car);
  updateCamera(dt);
  updateRain(simDt);
  G.Audio.update({ active: App.mode === 'play' && !App.paused, rpm: car.rpm, throttle: inp.gas, speed: car.speed, slip: car.slip || 0, rain: W.state.wx.rain });
  if (App.mode === 'play') UI.update(dt, car, camera);
  renderer.render(scene, camera);
  // fps
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) { if (G.Save.data.settings.showFps) $('#fps').textContent = Math.round(fpsN / fpsAcc) + ' fps · ' + renderer.info.render.calls + ' draws'; fpsAcc = 0; fpsN = 0; }
}

/* Debug hooks for automated tests */
G.debug = {
  App, get car() { return car; }, get camera() { return camera; },
  drivePlace(kind) { const o = MS.cur.offer; const p = kind === 'dest' ? o.dest : o.pickup; car.teleport(p.sx, p.sz, car.heading); },
  action: (a, arg) => onAction(a, arg),
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
