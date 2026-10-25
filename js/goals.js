/* CROSSTOWN — daily goals (same three for everyone on a given day) and first-shift coaching */
'use strict';
(function () {
const G = window.G, M = G.M;
const GO = G.Goals = {};

const TEMPLATES = [
  { id: 'fares', make: r => { const n = 3 + Math.floor(r() * 3); return { text: `Complete ${n} fares`, target: n, reward: 120 + n * 40 }; } },
  { id: 'earn', make: r => { const n = 300 + Math.floor(r() * 5) * 100; return { text: `Earn $${n} in fares`, target: n, reward: Math.round(n * 0.35) }; } },
  { id: 'stars5', make: () => ({ text: 'Get a 5-star ride', target: 1, reward: 180 }) },
  { id: 'smooth', make: () => ({ text: 'Finish a fare without a single bump', target: 1, reward: 160 }) },
  { id: 'tourist', make: () => ({ text: 'Complete a Sightseer fare', target: 1, reward: 120 }) },
  { id: 'rush', minLv: 2, make: () => ({ text: 'Beat the clock on a Rush fare', target: 1, reward: 220 }) },
  { id: 'chase', minLv: 2, make: () => ({ text: 'Tail the car on a Follow That Car fare', target: 1, reward: 260 }) },
  { id: 'escape', make: () => ({ text: 'Escape a police pursuit', target: 1, reward: 250 }) },
  { id: 'night', make: () => ({ text: 'Complete a fare after dark', target: 1, reward: 140 }) },
  { id: 'streak', make: r => { const n = 3 + Math.floor(r() * 2); return { text: `Reach a ${n}-fare streak`, target: n, reward: 200 + n * 30 }; } },
  { id: 'clean', make: () => ({ text: 'Finish a fare with no fines owed', target: 1, reward: 110 }) },
];
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
GO.ensure = () => {
  const S = G.Save.data, key = today();
  if (S.daily && S.daily.date === key && Array.isArray(S.daily.goals)) return S.daily;
  let seed = 0; for (const ch of key) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const r = M.rng(seed), lv = G.level(S.xp);
  const pool = TEMPLATES.filter(t => !t.minLv || lv >= t.minLv);
  const goals = [];
  while (goals.length < 3 && pool.length) {
    const t = pool.splice(Math.floor(r() * pool.length), 1)[0];
    goals.push(Object.assign({ id: t.id, prog: 0, done: false }, t.make(r)));
  }
  S.daily = { date: key, goals };
  G.Save.write();
  return S.daily;
};
function bump(id, amount, absolute) {
  const D = GO.ensure(); let changed = false;
  for (const g of D.goals) {
    if (g.id !== id || g.done) continue;
    g.prog = absolute ? Math.max(g.prog, amount) : g.prog + amount; changed = true;
    if (g.prog >= g.target) {
      g.prog = g.target; g.done = true;
      const S = G.Save.data; S.cash += g.reward; S.xp += Math.round(g.reward * 0.4); S.stats.goals = (S.stats.goals || 0) + 1;
      setTimeout(() => { G.UI.bigText('Daily goal', `${g.text} · +${G.UI.money(g.reward)}`, 'good'); G.Audio.chime('buy'); G.UI.refreshMoney(); }, 2200);
    }
  }
  if (changed) { G.Save.write(); G.UI.renderGoals(); }
}
G.on('fareDone', r => {
  bump('fares', 1); bump('earn', r.total);
  if (r.stars >= 5) bump('stars5', 1);
  if (r.hits === 0) bump('smooth', 1);
  if (r.cat === 'tourist') bump('tourist', 1);
  if (r.cat === 'rush') bump('rush', 1);
  if (r.cat === 'chase' && r.followOk) bump('chase', 1);
  if (G.World.state.night > 0.6) bump('night', 1);
  if (r.fines === 0) bump('clean', 1);
  bump('streak', G.Save.data.streak, true);
  GO.tutorialEvent('fareDone');
});
G.on('escaped', () => bump('escape', 1));

/* ---------- First-shift coaching ---------- */
const STEPS = [
  { key: 'dispatch', text: t => t ? 'Tap <b>FARES</b> to see who needs a ride' : 'Press <b>F</b> to open dispatch and see who needs a ride' },
  { key: 'pick', text: t => t ? 'Tap a fare to accept it' : 'Pick a fare with <b>1</b>, <b>2</b> or <b>3</b>' },
  { key: 'drive', text: t => t ? 'Hold <b>Gas</b>, drag the pad to steer. Follow the cyan GPS line' : '<b>W</b> to drive, <b>A D</b> to steer. Follow the cyan GPS line to your passenger' },
  { key: 'stop', text: t => t ? 'Stop inside the glowing ring and tap the yellow prompt' : 'Stop inside the glowing ring. They\'ll climb in, or press <b>E</b>' },
  { key: 'deliver', text: () => 'Get them to the orange beacon before the meter runs out. Smooth driving means bigger tips' },
  { key: 'done', text: () => 'First fare done! Watch for red lights and people crossing — the police are watching' },
];
let step = -1, hold = 0;
GO.tutorialActive = () => !G.Save.data.tutorial.done;
GO.tutorialEvent = (ev) => { if (ev === 'fareDone' && GO.tutorialActive()) { step = 5; hold = 7; show(); } };
function show() {
  const el = document.getElementById('coach'); if (!el) return;
  if (step < 0) { el.hidden = true; return; }
  el.hidden = false; el.innerHTML = `<span class="coach-n">${Math.min(step + 1, 5)}/5</span><span>${STEPS[step].text(G.UI.isTouch)}</span>`;
}
GO.update = (dt) => {
  if (!GO.tutorialActive()) { if (step !== -1) { step = -1; show(); } return; }
  const MS = G.Mission, sheet = document.body.dataset.sheet, prev = step;
  if (step === 5) { hold -= dt; if (hold <= 0) { G.Save.data.tutorial.done = true; G.Save.write(); step = -1; show(); } return; }
  if (!MS.isActive()) step = sheet === 'dispatch' ? 1 : 0;
  else if (MS.state === 'toPickup') { const o = MS.cur.offer; step = M.dist(G.player.x, G.player.z, o.pickup.sx, o.pickup.sz) < 45 ? 3 : 2; }
  else if (MS.state === 'boarding') step = 3;
  else step = 4;
  if (sheet && sheet !== 'dispatch') { document.getElementById('coach').hidden = true; return; }
  if (step !== prev || document.getElementById('coach').hidden) show();
};
GO.skipTutorial = () => { G.Save.data.tutorial.done = true; G.Save.write(); step = -1; show(); };
})();
