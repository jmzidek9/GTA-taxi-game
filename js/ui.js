/* CROSSTOWN — UI: HUD, minimap, speedometer, menus, garage, settings, input (keyboard, touch, gamepad) */
'use strict';
(function () {
const G = window.G, M = G.M, W = G.World;
const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
const UI = G.UI = {};
const money = n => (n < 0 ? '−$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
UI.money = money;
const fmtTime = s => { const neg = s < 0; s = Math.abs(Math.ceil(s)); return (neg ? '+' : '') + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const setText = (el, t) => { if (el && el._t !== t) { el.textContent = t; el._t = t; } };

/* ---------- Input ---------- */
const keys = {};
const input = UI.input = { gas: 0, brake: 0, steer: 0, hb: false };
const touch = { steer: 0, gas: 0, brake: 0, hb: false };
UI.clearInput = () => { for (const k in keys) keys[k] = false; touch.steer = touch.gas = touch.brake = 0; touch.hb = false; $$('.tbtn.on').forEach(b => b.classList.remove('on')); };
const binds = { gas: ['KeyW', 'ArrowUp'], brake: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], hb: ['Space'] };
const down = list => list.some(k => keys[k]);
let kbSteer = 0, padPrev = {};
UI.pollInput = (dt) => {
  const kl = down(binds.left) ? 1 : 0, kr = down(binds.right) ? 1 : 0;
  const ks = kl - kr;
  kbSteer = ks === 0 ? M.damp(kbSteer, 0, 12, dt) : M.damp(kbSteer, ks, 6, dt);
  let gas = down(binds.gas) ? 1 : 0, brake = down(binds.brake) ? 1 : 0, steer = kbSteer, hb = down(binds.hb);
  gas = Math.max(gas, touch.gas); brake = Math.max(brake, touch.brake); hb = hb || touch.hb;
  if (Math.abs(touch.steer) > 0.02) steer = touch.steer;
  // gamepad
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = pads && Array.from(pads).find(p => p && p.connected);
  if (gp) {
    const ax = gp.axes[0] || 0; if (Math.abs(ax) > 0.12) steer = -ax;
    const rt = gp.buttons[7] ? gp.buttons[7].value : 0, lt = gp.buttons[6] ? gp.buttons[6].value : 0;
    gas = Math.max(gas, rt); brake = Math.max(brake, lt);
    if (gp.buttons[1] && gp.buttons[1].pressed) hb = true;
    const edge = (i, fn) => { const p = gp.buttons[i] && gp.buttons[i].pressed; if (p && !padPrev[i]) fn(); padPrev[i] = p; };
    edge(0, () => UI.onAction('interact')); edge(3, () => UI.onAction('camera')); edge(9, () => UI.onAction('pause')); edge(2, () => UI.onAction('fares'));
  }
  input.gas = gas; input.brake = brake; input.steer = M.clamp(steer, -1, 1); input.hb = hb;
  return input;
};
UI.onAction = () => {};
window.addEventListener('keydown', e => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
  keys[e.code] = true;
  G.Audio.init();
  const map = { KeyC: 'camera', KeyE: 'interact', Escape: 'pause', KeyP: 'pause', KeyF: 'fares', KeyR: 'recover', KeyH: 'horn', Enter: 'enter', Digit1: 'o1', Digit2: 'o2', Digit3: 'o3', KeyM: 'mute' };
  if (map[e.code] && !e.repeat) UI.onAction(map[e.code]);
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) >= 0) e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => UI.clearInput());

UI.isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
function bindTouch() {
  const pad = $('#steerPad'), knob = $('#steerKnob');
  let sid = null, sx = 0;
  const range = () => Math.max(60, pad.clientWidth * 0.38);
  pad.addEventListener('pointerdown', e => { sid = e.pointerId; sx = e.clientX; pad.setPointerCapture(sid); G.Audio.init(); e.preventDefault(); });
  pad.addEventListener('pointermove', e => { if (e.pointerId !== sid) return; const d = M.clamp((e.clientX - sx) / range(), -1, 1); touch.steer = -d; knob.style.transform = `translateX(${d * range() * 0.8}px)`; });
  const end = e => { if (e.pointerId !== sid) return; sid = null; touch.steer = 0; knob.style.transform = ''; };
  pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
  const hold = (sel, on, off) => {
    const el = $(sel);
    el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); el.classList.add('on'); on(); G.Audio.init(); e.preventDefault(); });
    const up = () => { el.classList.remove('on'); off(); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
  };
  hold('#tGas', () => touch.gas = 1, () => touch.gas = 0);
  hold('#tBrake', () => touch.brake = 1, () => touch.brake = 0);
  hold('#tHb', () => touch.hb = true, () => touch.hb = false);
  document.body.classList.toggle('touch', UI.isTouch);
}

/* ---------- HUD ---------- */
let mapImg = null, mm = null, spd = null;
UI.init = () => {
  mapImg = W.mapCanvas(1.0);
  mm = $('#minimap'); spd = $('#speedo');
  bindTouch();
  $$('[data-act]').forEach(b => b.addEventListener('click', e => { G.Audio.init(); G.Audio.chime('ui'); UI.onAction(b.dataset.act, b); e.stopPropagation(); }));
  $('#hudPrompt').addEventListener('click', () => UI.onAction('interact'));
  buildSettings();
  UI.refreshMoney();
};
UI.refreshMoney = () => {
  const S = G.Save.data, lv = G.level(S.xp), a = G.levelXp(lv), b = G.levelXp(lv + 1);
  setText($('#cash'), money(S.cash));
  setText($('#lvl'), 'Level ' + lv);
  setText($('#streak'), S.streak > 1 ? `Streak ×${S.streak}` : '');
  $('#xpbar').style.width = (M.clamp((S.xp - a) / (b - a), 0, 1) * 100).toFixed(1) + '%';
};
let objKey = '';
UI.objective = (title, sub, dist) => {
  const k = title + '|' + sub;
  if (k !== objKey) { objKey = k; setText($('#objTitle'), title); setText($('#objSub'), sub || ''); }
  setText($('#objDist'), dist === null || dist === undefined ? '' : dist > 999 ? (dist / 1000).toFixed(1) + ' km' : dist + ' m');
};
let promptKey = null;
UI.prompt = (t, actionable) => {
  const el = $('#hudPrompt');
  if (t === promptKey) return; promptKey = t;
  if (!t) { el.hidden = true; return; }
  el.hidden = false; el.textContent = UI.isTouch ? t.replace(/^E · /, '') : t; el.classList.toggle('act', !!actionable);
};
let sayT = 0;
UI.say = (name, line) => { const el = $('#say'); $('#sayName').textContent = name; $('#sayLine').textContent = '“' + line + '”'; el.hidden = false; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); sayT = 4.5; };
UI.toast = (t, kind) => {
  const el = document.createElement('div'); el.className = 'toast' + (kind ? ' ' + kind : ''); el.textContent = t; $('#toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), 2600); setTimeout(() => el.remove(), 3200);
};
UI.update = (dt, car, cam, mode) => {
  if (sayT > 0) { sayT -= dt; if (sayT <= 0) $('#say').hidden = true; }
  const MS = G.Mission, c = MS.cur, S = G.Save.data;
  // mission card
  const card = $('#mission');
  if (MS.isActive()) {
    card.classList.add('live');
    const cat = c.cat;
    const chip = $('#objChip'); setText(chip, cat.label); chip.style.setProperty('--chip', cat.color);
    const showTimer = MS.state === 'delivering';
    const tm = $('#objTimer'); tm.hidden = !showTimer;
    if (showTimer) { setText(tm, fmtTime(c.timeLeft)); tm.classList.toggle('warn', c.timeLeft < 15 && c.timeLeft >= 0); tm.classList.toggle('over', c.timeLeft < 0); }
    const pay = $('#objPay');
    setText(pay, MS.state === 'toPickup' ? `${money(c.offer.base)} fare` : MS.state === 'delivering' ? `Mood ${Math.round(c.sat)}%` : '');
    $('#mood').hidden = MS.state !== 'delivering';
    $('#moodBar').style.width = (c.sat || 0) + '%';
    $('#moodBar').style.background = c.sat > 70 ? 'var(--good)' : c.sat > 40 ? 'var(--amber)' : 'var(--bad)';
  } else {
    card.classList.remove('live'); $('#objTimer').hidden = true; $('#mood').hidden = true;
    setText($('#objChip'), 'Off duty'); $('#objChip').style.setProperty('--chip', '#7b8794');
    UI.objective(UI.isTouch ? 'Tap FARES for a job' : 'Press F for a fare', 'Cruise the city or take a job', null);
    setText($('#objPay'), '');
  }
  // clock + weather
  const hr = W.state.hour, hh = Math.floor(hr), mi = Math.floor((hr - hh) * 60);
  setText($('#clock'), `${String(hh).padStart(2, '0')}:${String(mi).padStart(2, '0')} · ${W.WEATHER_LABEL[W.state.weather]}`);
  // district under car
  const lot = W.lots.reduce((b, L) => { const d = Math.max(Math.abs(car.x - L.cx) - (L.x1 - L.x0) / 2, Math.abs(car.z - L.cz) - (L.z1 - L.z0) / 2); return d < b[0] ? [d, L] : b; }, [1e9, null])[1];
  setText($('#district'), lot ? W.DISTRICT_NAMES[lot.district] : '');
  drawSpeedo(car); drawMinimap(car);
  updateArrow(car, cam);
  if (car.stuckT > 3.5 && !UI.stuckShown) { UI.stuckShown = true; UI.toast(UI.isTouch ? 'Stuck? Pause → Reset car' : 'Stuck? Press R to reset onto the road'); }
  if (car.stuckT === 0) UI.stuckShown = false;
};
function drawSpeedo(car) {
  const ctx = spd.getContext('2d'), w = spd.width, h = spd.height, cx = w / 2, cy = h * 0.56, R = w * 0.42;
  const units = G.Save.data.settings.units, mul = units === 'mph' ? 2.237 : 3.6, max = units === 'mph' ? 160 : 260;
  const v = car.speed * mul;
  ctx.clearRect(0, 0, w, h);
  const a0 = Math.PI * 0.78, a1 = Math.PI * 2.22;
  ctx.lineCap = 'round';
  ctx.lineWidth = w * 0.035; ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.arc(cx, cy, R, a0, a1); ctx.stroke();
  const t = M.clamp(v / max, 0, 1);
  const g = ctx.createLinearGradient(0, h, w, 0); g.addColorStop(0, '#ffc61a'); g.addColorStop(1, '#ff6a3c');
  ctx.strokeStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, a0, a0 + (a1 - a0) * t); ctx.stroke();
  // ticks
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = `600 ${w * 0.065}px "IBM Plex Sans Condensed", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let k = 0; k <= 8; k++) { const a = a0 + (a1 - a0) * k / 8, c = Math.cos(a), s = Math.sin(a); ctx.beginPath(); ctx.moveTo(cx + c * R * 0.8, cy + s * R * 0.8); ctx.lineTo(cx + c * R * 0.88, cy + s * R * 0.88); ctx.stroke(); if (k % 2 === 0) ctx.fillText(Math.round(max * k / 8), cx + c * R * 0.66, cy + s * R * 0.66); }
  // rpm strip
  const rt = M.clamp(car.rpm / 7000, 0, 1);
  ctx.lineWidth = w * 0.018; ctx.strokeStyle = rt > 0.85 ? '#ff5a4a' : 'rgba(64,224,255,0.8)'; ctx.beginPath(); ctx.arc(cx, cy, R * 1.1, a0, a0 + (a1 - a0) * rt); ctx.stroke();
  ctx.fillStyle = '#eef1f4'; ctx.font = `800 ${w * 0.26}px "Big Shoulders Display", sans-serif`; ctx.fillText(Math.round(v), cx, cy - h * 0.02);
  ctx.fillStyle = 'rgba(238,241,244,0.6)'; ctx.font = `600 ${w * 0.07}px "IBM Plex Sans Condensed", sans-serif`; ctx.fillText(units.toUpperCase(), cx, cy + h * 0.15);
  ctx.fillStyle = '#ffc61a'; ctx.font = `800 ${w * 0.12}px "Big Shoulders Display", sans-serif`; ctx.fillText(car.gear === -1 ? 'R' : car.speed < 0.3 && car.throttle === 0 ? 'N' : String(car.gear), cx, cy + h * 0.32);
}
function drawMinimap(car) {
  const ctx = mm.getContext('2d'), w = mm.width, h = mm.height, cx = w / 2, cy = h / 2;
  const zoom = (w / 220) * M.clamp(1.25 - car.speed / 80, 0.65, 1.25);
  ctx.save(); ctx.clearRect(0, 0, w, h);
  ctx.beginPath(); ctx.arc(cx, cy, w / 2 - 2, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#0d1218'; ctx.fillRect(0, 0, w, h);
  ctx.translate(cx, cy); ctx.rotate(Math.PI + car.heading); // car forward points up
  ctx.scale(zoom, zoom);
  ctx.drawImage(mapImg.canvas, -(car.x + mapImg.offset), -(car.z + mapImg.offset));
  const MS = G.Mission;
  if (MS.routePts && MS.target) {
    ctx.strokeStyle = MS.target.kind === 'pickup' ? '#40e0ff' : '#ffb321'; ctx.lineWidth = 6 / zoom + 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath(); MS.routePts.forEach((p, i) => { const x = p[0] - car.x, z = p[1] - car.z; i ? ctx.lineTo(x, z) : ctx.moveTo(x, z); }); ctx.stroke();
  }
  // traffic dots
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  for (const t of G.Traffic.cars) if (t.model.root.visible) { ctx.fillRect(t.x - car.x - 1.5, t.z - car.z - 1.5, 3, 3); }
  ctx.restore();
  // target marker (clamped to edge)
  if (MS.target) {
    const dx = MS.target.x - car.x, dz = MS.target.z - car.z;
    const cs = Math.cos(Math.PI + car.heading), sn = Math.sin(Math.PI + car.heading);
    let sx = dx * zoom, sz = dz * zoom;
    let rx = sx * cs - sz * sn, ry = sx * sn + sz * cs;
    const d = Math.hypot(rx, ry), lim = w / 2 - 12;
    if (d > lim) { rx *= lim / d; ry *= lim / d; }
    ctx.fillStyle = MS.target.kind === 'pickup' ? '#40e0ff' : '#ffb321';
    ctx.strokeStyle = '#0b0f14'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx + rx, cy + ry, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  // player arrow
  ctx.fillStyle = '#ffc61a'; ctx.strokeStyle = '#0b0f14'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx, cy - 9); ctx.lineTo(cx + 7, cy + 7); ctx.lineTo(cx, cy + 3); ctx.lineTo(cx - 7, cy + 7); ctx.closePath(); ctx.fill(); ctx.stroke();
  // north marker
  const na = Math.PI + car.heading; // world -z on screen
  const nx = cx + Math.sin(na) * (w / 2 - 12), ny = cy - Math.cos(na) * (w / 2 - 12);
  ctx.fillStyle = 'rgba(238,241,244,0.85)'; ctx.font = `700 ${w * 0.075}px "IBM Plex Sans Condensed", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('N', nx, ny);
}
const _v3 = new THREE.Vector3();
function updateArrow(car, cam) {
  const el = $('#offArrow'), MS = G.Mission;
  if (!MS.target || !cam) { el.hidden = true; return; }
  _v3.set(MS.target.x, 2, MS.target.z).project(cam);
  const behind = _v3.z > 1;
  let x = _v3.x, y = _v3.y;
  if (behind) { x = -x; y = -y; }
  const on = !behind && Math.abs(x) < 0.85 && Math.abs(y) < 0.85;
  const d = Math.round(M.dist(car.x, car.z, MS.target.x, MS.target.z));
  el.hidden = false;
  el.classList.toggle('pickup', MS.target.kind === 'pickup');
  const W2 = window.innerWidth / 2, H2 = window.innerHeight / 2;
  if (on) { el.classList.add('on'); el.style.transform = `translate(${W2 + x * W2}px, ${H2 - y * H2}px)`; }
  else {
    el.classList.remove('on');
    const a = Math.atan2(-y, x), m = Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
    const px = W2 + Math.cos(a) / m * (W2 - 48), py = H2 + Math.sin(a) / m * (H2 - 70);
    el.style.transform = `translate(${px}px, ${py}px)`;
    $('#offPoint').style.transform = `rotate(${a}rad)`;
  }
  setText($('#offDist'), d + ' m');
}

/* ---------- Panels ---------- */
UI.show = (id) => { $$('.sheet').forEach(s => s.hidden = s.id !== id); document.body.dataset.sheet = id || ''; };
UI.showDispatch = (offers) => {
  const list = $('#offers'); list.innerHTML = '';
  offers.forEach((o, i) => {
    const cat = G.Mission.CATS[o.cat];
    const el = document.createElement('button'); el.className = 'offer'; el.style.setProperty('--chip', cat.color);
    el.innerHTML = `<div class="offer-top"><span class="chip">${cat.label}</span><span class="offer-key">${i + 1}</span></div>
      <div class="offer-route"><span class="dot pu"></span><b>${o.pickup.name}</b><small>${o.pickup.dname} · ${Math.round(o.toPick)} m away</small><span class="dot de"></span><b>${o.dest.name}</b><small>${o.dest.dname}</small></div>
      <div class="offer-meta"><span><em>${(o.len / 1000).toFixed(2)}</em> km</span><span><em>${fmtTime(o.limit)}</em> limit</span><span class="pay"><em>${money(o.base)}</em> up to ${money(o.max)}</span></div>
      ${cat.strict ? '<div class="offer-warn">Hard deadline: the ride ends if time runs out</div>' : ''}`;
    el.addEventListener('click', () => { G.Audio.init(); UI.onAction('accept', i); });
    list.appendChild(el);
  });
  UI.show('dispatch');
};
UI.showComplete = (c, r) => {
  const o = c.offer;
  $('#rcTrip').textContent = 'Trip ' + String(r.trip).padStart(4, '0');
  $('#rcRoute').textContent = `${o.pickup.name} → ${o.dest.name}`;
  const stars = '★★★★★'.slice(0, r.stars) + '☆☆☆☆☆'.slice(0, 5 - r.stars);
  const rows = [
    ['Base fare', `${G.Mission.CATS[o.cat].label} · ${(o.len / 1000).toFixed(2)} km`, r.base],
    [r.timeAdj >= 0 ? 'On-time bonus' : 'Late penalty', r.timeLeft >= 0 ? `${Math.ceil(r.timeLeft)} s to spare` : `${Math.ceil(-r.timeLeft)} s late`, r.timeAdj],
    ['Smooth driving', `${r.hits} bump${r.hits === 1 ? '' : 's'} · quality ${r.quality}%`, r.qualityBonus],
    ['Tip', `${stars}  mood ${r.sat}%`, r.tip],
  ];
  if (r.streakBonus > 0) rows.push(['Streak bonus', `${r.streak - 1} fares in a row`, r.streakBonus]);
  $('#rcRows').innerHTML = rows.map(([a, b, v]) => `<div class="rc-row"><div><b>${a}</b><small>${b}</small></div><span class="${v < 0 ? 'neg' : ''}">${v >= 0 ? '+' : ''}${money(v).replace('−', '-')}</span></div>`).join('');
  $('#rcTotal').textContent = money(r.total);
  $('#rcBal').textContent = `Balance ${money(r.balance)} · +${r.xp} XP` + (r.levelUp ? ` · Level ${r.levelUp}!` : '');
  UI.refreshMoney();
  setTimeout(() => UI.show('complete'), 700);
};
UI.showFail = (c, reason) => {
  $('#failReason').textContent = reason;
  $('#failRoute').textContent = `${c.offer.pickup.name} → ${c.offer.dest.name}`;
  UI.refreshMoney();
  setTimeout(() => UI.show('fail'), 500);
};

/* ---------- Garage ---------- */
UI.garageSel = 'sedan';
UI.renderGarage = () => {
  const S = G.Save.data, sel = UI.garageSel, V = G.VEHICLES[sel], owned = S.owned.indexOf(sel) >= 0;
  setText($('#gCash'), money(S.cash));
  const list = $('#gList'); list.innerHTML = '';
  const maxS = { accel: 18, top: 72, brake: 34, grip: 1.4 };
  G.VEHICLE_ORDER.forEach(k => {
    const v = G.VEHICLES[k], own = S.owned.indexOf(k) >= 0;
    const b = document.createElement('button'); b.className = 'gcar' + (k === sel ? ' sel' : '') + (k === S.current ? ' cur' : '');
    b.innerHTML = `<span class="gcls">${v.cls}</span><b>${v.name}</b><span class="gprice">${own ? (k === S.current ? 'Driving' : 'Owned') : money(v.price)}</span>`;
    b.addEventListener('click', () => { UI.garageSel = k; G.Audio.chime('ui'); UI.onAction('garagePreview', k); UI.renderGarage(); });
    list.appendChild(b);
  });
  const sp = G.specFor(sel, S.upgrades[sel]);
  setText($('#gName'), V.name); setText($('#gDesc'), V.desc);
  $('#gStats').innerHTML = [['Acceleration', sp.accel / maxS.accel], ['Top speed', sp.top / maxS.top], ['Braking', sp.brake / maxS.brake], ['Grip', sp.grip / maxS.grip], ['Comfort', sp.comfort / 1.8], ['Fare bonus', (sp.fare - 0.8) / 0.7]]
    .map(([n, f]) => `<div class="gstat"><span>${n}</span><i><b style="width:${(M.clamp(f, 0.04, 1) * 100).toFixed(0)}%"></b></i></div>`).join('') + `<div class="gtop">${Math.round(sp.top * 2.237)} mph top · ${(sp.top / sp.accel * 0.55).toFixed(1)} s to 60</div>`;
  const act = $('#gAction');
  if (!owned) { act.textContent = `Buy for ${money(V.price)}`; act.disabled = S.cash < V.price; act.dataset.mode = 'buy'; }
  else if (S.current !== sel) { act.textContent = 'Drive this car'; act.disabled = false; act.dataset.mode = 'use'; }
  else { act.textContent = 'Currently driving'; act.disabled = true; act.dataset.mode = ''; }
  // upgrades
  const up = S.upgrades[sel] || {};
  const ug = $('#gUp'); ug.innerHTML = '';
  for (const key in G.UPGRADES) {
    const U = G.UPGRADES[key], lv = up[key] || 0;
    const b = document.createElement('button'); b.className = 'gup';
    const cost = lv < 3 ? U.costs[lv] : 0;
    b.disabled = !owned || lv >= 3 || S.cash < cost;
    b.innerHTML = `<b>${U.name}</b><span class="pips">${[0, 1, 2].map(i => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</span><small>${lv >= 3 ? 'Maxed' : owned ? money(cost) : 'Buy car first'}</small>`;
    b.title = U.desc;
    b.addEventListener('click', () => UI.onAction('upgrade', key));
    ug.appendChild(b);
  }
  const pc = $('#gPaint'); pc.innerHTML = '';
  G.PAINTS.forEach(col => {
    const b = document.createElement('button'); b.className = 'swatch' + (((S.paint[sel] || V.color) === col) ? ' on' : ''); b.style.background = col; b.disabled = !owned; b.setAttribute('aria-label', 'Paint ' + col);
    b.addEventListener('click', () => UI.onAction('paint', col)); pc.appendChild(b);
  });
};

/* ---------- Settings ---------- */
function buildSettings() {
  const S = G.Save.data.settings;
  const bind = (id, key, parse, after) => {
    const el = $('#' + id); if (!el) return;
    if (el.type === 'checkbox') el.checked = !!S[key]; else el.value = S[key];
    el.addEventListener('input', () => { S[key] = el.type === 'checkbox' ? el.checked : parse ? parse(el.value) : el.value; G.Save.write(); after && after(S[key]); UI.onAction('settings', key); });
  };
  bind('sQuality', 'quality'); bind('sVolume', 'volume', parseFloat, v => G.Audio.setVolume(v)); bind('sSens', 'sens', parseFloat);
  bind('sUnits', 'units'); bind('sFov', 'fov', parseFloat); bind('sShake', 'shake'); bind('sTime', 'timeMode'); bind('sWeather', 'weatherMode'); bind('sFps', 'showFps', null, v => { $('#fps').hidden = !v; });
  $('#fps').hidden = !S.showFps;
}
UI.syncSettings = () => { const S = G.Save.data.settings; [['sQuality', 'quality'], ['sVolume', 'volume'], ['sSens', 'sens'], ['sUnits', 'units'], ['sFov', 'fov'], ['sTime', 'timeMode'], ['sWeather', 'weatherMode']].forEach(([id, k]) => { const el = $('#' + id); if (el) el.value = S[k]; }); $('#sShake').checked = S.shake; $('#sFps').checked = S.showFps; };
})();
