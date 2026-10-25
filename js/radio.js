/* CROSSTOWN — radio: three procedurally sequenced stations played through the cab speakers */
'use strict';
(function () {
const G = window.G, M = G.M;
const R = G.Radio = { on: false };
const hz = n => 440 * Math.pow(2, (n - 69) / 12);

const STATIONS = [
  { id: 'off', name: 'Radio off' },
  { id: 'lofi', name: 'VHR 88.1', genre: 'Harbor Lo-Fi', bpm: 76, swing: 0.18,
    chords: [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]], bass: [41, 40, 38, 36] },
  { id: 'synth', name: 'NEON 101.7', genre: 'Night Drive Synthwave', bpm: 104, swing: 0,
    chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], bass: [33, 29, 36, 31] },
  { id: 'jazz', name: 'KJZZ 94.3', genre: 'Late Night Jazz', bpm: 132, swing: 0.33,
    chords: [[48, 51, 55, 58], [53, 57, 60, 63], [46, 50, 53, 57], [43, 47, 50, 53]], bass: [36, 41, 34, 31] },
];
R.STATIONS = STATIONS;

let ctx, out, filt, crackle, timer = null, nextT = 0, step = 0, bar = 0;
function init() {
  if (ctx || !G.Audio.ok) return !!ctx;
  ctx = G.Audio.ctx;
  out = ctx.createGain(); out.gain.value = 0;
  filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 5200; filt.Q.value = 0.5; // small cab speakers
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 70;
  out.connect(hp).connect(filt).connect(G.Audio.master);
  crackle = ctx.createGain(); crackle.gain.value = 0;
  const cs = ctx.createBufferSource(); cs.buffer = G.Audio.noiseBuf; cs.loop = true;
  const cf = ctx.createBiquadFilter(); cf.type = 'highpass'; cf.frequency.value = 3000;
  cs.connect(cf).connect(crackle).connect(out); cs.start();
  return true;
}
/* ---------- voices ---------- */
function env(g, t, a, peak, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
function tone(t, f, dur, type, vol, cutoff, a) {
  const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
  o.type = type; o.frequency.value = f; lp.type = 'lowpass'; lp.frequency.value = cutoff || 2400;
  env(g, t, a || 0.01, vol, dur);
  o.connect(lp).connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
}
function kick(t, v) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.22);
  env(g, t, 0.004, v, 0.32); o.connect(g).connect(out); o.start(t); o.stop(t + 0.4);
}
function noise(t, dur, v, type, freq, q) {
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = G.Audio.noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q || 0.7;
  env(g, t, 0.002, v, dur); s.connect(f).connect(g).connect(out); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
}
const snare = (t, v) => { noise(t, 0.18, v, 'bandpass', 1900, 0.8); tone(t, 190, 0.08, 'triangle', v * 0.6, 900); };
const hat = (t, v, open) => noise(t, open ? 0.22 : 0.045, v, 'highpass', 7200);

/* ---------- patterns: one 16th-note step at a time ---------- */
function play(st, t, i, b, sixteenth) {
  const ch = st.chords[b % 4], root = st.bass[b % 4];
  if (st.id === 'lofi') {
    if (i === 0 || i === 7 || (i === 10 && Math.random() < 0.6)) kick(t, 0.55);
    if (i === 4 || i === 12) snare(t, 0.16);
    if (i % 2 === 0) hat(t, i % 4 === 2 ? 0.05 : 0.03);
    if (i === 0) ch.forEach((n, k) => tone(t + k * 0.012, hz(n), sixteenth * 14, 'triangle', 0.035, 1500, 0.05));
    if (i === 0 || i === 10) tone(t, hz(root), sixteenth * 5, 'sine', 0.22, 600);
    if (Math.random() < 0.16 && i % 2 === 0) tone(t, hz(ch[Math.floor(Math.random() * ch.length)] + 12), sixteenth * 2.5, 'sine', 0.05, 3000);
  } else if (st.id === 'synth') {
    if (i % 4 === 0) kick(t, 0.6);
    if (i === 4 || i === 12) { snare(t, 0.22); noise(t, 0.6, 0.04, 'bandpass', 2500, 0.3); }
    if (i % 2 === 1) hat(t, 0.035);
    if (i % 2 === 0) tone(t, hz(root + (i % 4 === 2 ? 12 : 0)), sixteenth * 1.6, 'sawtooth', 0.11, 700);
    const arp = ch[i % ch.length] + 12 + (i >= 8 ? 12 : 0);
    tone(t, hz(arp), sixteenth * 0.9, 'square', 0.03, 2600);
    if (i === 0) ch.forEach(n => tone(t, hz(n), sixteenth * 15, 'sawtooth', 0.018, 1100, 0.3));
  } else if (st.id === 'jazz') {
    // ride cymbal "ding, ding-da-ding", brushed snare, walking bass, comped chords
    if (i % 4 === 0 || i % 8 === 7) noise(t, 0.35, 0.03, 'highpass', 5200);
    if (i === 4 || i === 12) noise(t, 0.12, 0.05, 'bandpass', 3000, 0.5);
    if (i % 4 === 0) { const pick = ch[Math.floor(Math.random() * ch.length)] - 12; tone(t, hz(i === 0 ? root : pick), sixteenth * 3.6, 'triangle', 0.2, 900); }
    if ((i === 2 || i === 11) && Math.random() < 0.7) ch.forEach(n => tone(t, hz(n + 12), sixteenth * 1.8, 'sine', 0.03, 2200));
    if (Math.random() < 0.08) tone(t, hz(ch[Math.floor(Math.random() * ch.length)] + 24), sixteenth * 1.2, 'sine', 0.04, 4000);
  }
}
function schedule() {
  const st = STATIONS[R.station]; if (!st || st.id === 'off') return;
  const sixteenth = 60 / st.bpm / 4;
  while (nextT < ctx.currentTime + 0.15) {
    const sw = step % 2 === 1 ? st.swing * sixteenth : 0;
    play(st, nextT + sw, step, bar, sixteenth);
    step++; if (step >= 16) { step = 0; bar++; }
    nextT += sixteenth;
  }
}
R.set = (k, announce) => {
  R.station = (k + STATIONS.length) % STATIONS.length;
  G.Save.data.settings.station = R.station; G.Save.write();
  if (!init()) return;
  if (timer) { clearInterval(timer); timer = null; }
  const st = STATIONS[R.station];
  crackle.gain.value = st.id === 'lofi' ? 0.012 : 0;
  if (st.id !== 'off') { nextT = ctx.currentTime + 0.12; step = 0; bar = 0; timer = setInterval(schedule, 30); }
  if (announce) G.UI.radio(st);
};
R.next = () => R.set((R.station || 0) + 1, true);
R.start = () => { if (R.started) return; if (!init()) return; R.started = true; R.set(G.Save.data.settings.station || 0, false); };
// duck under menus, follow the radio volume setting
R.update = (active, menu) => {
  if (!ctx) return;
  const v = G.Save.data.settings.radioVol;
  out.gain.setTargetAtTime(active ? v * 0.55 : menu ? v * 0.3 : v * 0.12, ctx.currentTime, 0.25);
};
})();
