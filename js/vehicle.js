/* CROSSTOWN — vehicles: specs, procedural car models, driving physics, skid marks */
'use strict';
(function () {
const G = window.G, M = G.M, GB = G.GB, W = G.World;

/* ---------- Vehicle catalogue ---------- */
G.VEHICLES = {
  sedan: { name: 'Corsa Cab', cls: 'Sedan', price: 0, accel: 8.6, top: 41, brake: 21, grip: 1.0, steer: 0.6, fare: 1.0, comfort: 1.0, color: '#f2b705', desc: 'Dependable city taxi. Forgiving and easy to place at the curb.' },
  suv: { name: 'Ridgeback', cls: 'SUV', price: 1500, accel: 8.9, top: 43, brake: 22, grip: 0.97, steer: 0.55, fare: 1.12, comfort: 1.25, color: '#2d3e50', desc: 'Roomy and smooth. Passengers forgive more bumps, and fares pay 12% more.' },
  sport: { name: 'Vanta GT', cls: 'Sports', price: 4000, accel: 12.5, top: 55, brake: 27, grip: 1.15, steer: 0.64, fare: 1.05, comfort: 0.85, color: '#c0392b', desc: 'Quick and sharp. Beats rush deadlines, but riders feel every jolt.' },
  lux: { name: 'Regent L', cls: 'Luxury', price: 8000, accel: 10.5, top: 52, brake: 25, grip: 1.06, steer: 0.57, fare: 1.35, comfort: 1.4, color: '#1b1d22', desc: 'Executive saloon. Unlocks VIP calls and pays 35% more on every fare.' },
  super: { name: 'Spectre X', cls: 'Supercar', price: 18000, accel: 16.5, top: 68, brake: 32, grip: 1.25, steer: 0.68, fare: 1.2, comfort: 0.95, color: '#e8e8ea', desc: 'Mid-engine hypercar. Fastest thing in Vale Harbor.' },
};
G.VEHICLE_ORDER = ['sedan', 'suv', 'sport', 'lux', 'super'];
G.UPGRADES = {
  engine: { name: 'Engine', costs: [300, 750, 1600], desc: '+9% acceleration, +5% top speed per level' },
  brakes: { name: 'Brakes', costs: [200, 500, 1100], desc: '+14% braking per level' },
  handling: { name: 'Handling', costs: [250, 650, 1400], desc: '+7% grip and sharper steering per level' },
  suspension: { name: 'Suspension', costs: [200, 500, 1000], desc: 'Smoother ride: less passenger discomfort from bumps' },
};
G.PAINTS = ['#f2b705', '#e8e8ea', '#1b1d22', '#c0392b', '#2d3e50', '#1f7a5c', '#3b5bdb', '#8e44ad', '#d35400', '#7f8c8d'];
G.repairCost = (type, dmg) => Math.round(dmg * (2 + G.VEHICLES[type].price / 2000));
G.specFor = (type, up) => {
  const b = G.VEHICLES[type]; up = up || {};
  const e = up.engine || 0, br = up.brakes || 0, h = up.handling || 0, s = up.suspension || 0;
  return { accel: b.accel * (1 + 0.09 * e), top: b.top * (1 + 0.05 * e), brake: b.brake * (1 + 0.14 * br), grip: b.grip * (1 + 0.07 * h), steer: b.steer * (1 + 0.04 * h), fare: b.fare, comfort: b.comfort * (1 + 0.12 * s) };
};

/* ---------- Body proportions per class ---------- */
const DIMS = {
  sedan: { L: 4.7, W: 1.86, c: 0.24, belt: 0.98, roof: 1.47, R: 0.34, wb: 2.78, track: 1.6, cabR: -1.25, roofR: -0.85, roofF: 0.55, cabF: 1.15, nose: 0.28, trunk: 0.12 },
  suv: { L: 4.85, W: 1.98, c: 0.34, belt: 1.18, roof: 1.82, R: 0.4, wb: 2.86, track: 1.66, cabR: -1.95, roofR: -1.85, roofF: 0.55, cabF: 1.2, nose: 0.22, trunk: 0.05 },
  sport: { L: 4.5, W: 1.92, c: 0.2, belt: 0.84, roof: 1.27, R: 0.34, wb: 2.62, track: 1.64, cabR: -1.35, roofR: -0.6, roofF: 0.25, cabF: 0.95, nose: 0.3, trunk: 0.08 },
  lux: { L: 5.15, W: 1.96, c: 0.25, belt: 1.02, roof: 1.5, R: 0.36, wb: 3.08, track: 1.66, cabR: -1.45, roofR: -1.0, roofF: 0.6, cabF: 1.25, nose: 0.24, trunk: 0.12 },
  super: { L: 4.62, W: 2.02, c: 0.16, belt: 0.74, roof: 1.13, R: 0.35, wb: 2.72, track: 1.72, cabR: -0.9, roofR: -0.45, roofF: 0.35, cabF: 1.25, nose: 0.36, trunk: 0.02 },
};
G.DIMS = DIMS;

const shared = {};
function sharedMats() {
  if (shared.glass) return shared;
  shared.glass = new THREE.MeshStandardMaterial({ color: 0x1a2430, roughness: 0.05, metalness: 0.4, transparent: true, opacity: 0.55, envMapIntensity: 1.5 });
  shared.tire = new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.92 });
  shared.rim = new THREE.MeshStandardMaterial({ color: 0xc4c8cc, roughness: 0.25, metalness: 0.9 });
  shared.dark = new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.6, metalness: 0.2 });
  shared.chrome = new THREE.MeshStandardMaterial({ color: 0xdadde0, roughness: 0.15, metalness: 1 });
  shared.interior = new THREE.MeshStandardMaterial({ color: 0x2a2624, roughness: 0.85 });
  shared.trafficHead = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4dc, emissiveIntensity: 0.4 });
  shared.trafficTail = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a10, emissiveIntensity: 0.5 });
  return shared;
}
G.carShared = sharedMats;

function profileShapes(d) {
  const { L, c, belt, R, wb, cabR, roofR, roofF, cabF, roof, nose, trunk } = d;
  const s = new THREE.Shape();
  const wf = wb / 2, wr = -wb / 2, ar = R + 0.07;
  s.moveTo(-L / 2 + 0.08, c);
  s.lineTo(-L / 2, c + 0.15);
  s.lineTo(-L / 2, belt - 0.12 - trunk);
  s.quadraticCurveTo(-L / 2, belt - trunk, -L / 2 + 0.22, belt);
  s.lineTo(cabR, belt + 0.02);
  s.lineTo(cabF, belt + 0.02);
  s.quadraticCurveTo(L / 2 - 0.5, belt - 0.02, L / 2 - 0.12, belt - nose);
  s.quadraticCurveTo(L / 2 + 0.02, belt - nose - 0.05, L / 2, c + 0.2);
  s.lineTo(L / 2 - 0.1, c);
  s.lineTo(wf + ar, c); s.lineTo(wf + ar, R);
  s.absarc(wf, R, ar, 0, Math.PI, false);
  s.lineTo(wf - ar, c);
  s.lineTo(wr + ar, c); s.lineTo(wr + ar, R);
  s.absarc(wr, R, ar, 0, Math.PI, false);
  s.lineTo(wr - ar, c);
  s.lineTo(-L / 2 + 0.08, c);
  const cab = new THREE.Shape();
  cab.moveTo(cabR, belt);
  cab.quadraticCurveTo(cabR + (roofR - cabR) * 0.35, roof - 0.02, roofR, roof);
  cab.lineTo(roofF, roof);
  cab.quadraticCurveTo(roofF + (cabF - roofF) * 0.25, roof - 0.01, cabF, belt);
  cab.lineTo(cabR, belt);
  return { body: s, cab };
}
function extrude(shape, width, bevel) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 3, curveSegments: 10 });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2);
  return g;
}

/* Build a car model. Returns {root, body, wheels:[], refs} */
G.buildCar = (type, color, opts) => {
  opts = opts || {};
  const S = sharedMats();
  const d = DIMS[type] || DIMS.sedan;
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const sh = profileShapes(d);
  if (opts.simple) {
    // merged low-draw-call version for traffic
    const paint = new GB(), glass = new GB(), dark = new GB(), head = new GB(), tail = new GB();
    paint.setColor(color);
    paint.addGeo(extrude(sh.body, d.W, 0.08), G.mat(0, 0, 0));
    paint.box(0, d.roof - 0.03, (d.roofR + d.roofF) / 2, d.W - 0.34, 0.06, d.roofF - d.roofR + 0.1, {});
    glass.addGeo(extrude(sh.cab, d.W - 0.24, 0.05), G.mat(0, 0, 0));
    dark.setColor('#141518');
    for (const z of [-d.wb / 2, d.wb / 2]) for (const x of [-d.track / 2, d.track / 2]) dark.addGeo(new THREE.CylinderGeometry(d.R, d.R, 0.24, 12), G.mat(x, d.R, z, 0, 0, Math.PI / 2));
    dark.box(0, d.c + 0.05, d.L / 2 - 0.02, d.W - 0.1, 0.22, 0.12, {}); dark.box(0, d.c + 0.05, -d.L / 2 + 0.02, d.W - 0.1, 0.22, 0.12, {});
    dark.box(0, d.belt - d.nose - 0.28, d.L / 2 - 0.02, d.W * 0.4, 0.16, 0.08, {});
    for (const sx of [-1, 1]) { head.box(sx * (d.W / 2 - 0.32), d.belt - d.nose - 0.12, d.L / 2 - 0.08, 0.42, 0.12, 0.1, {}); tail.box(sx * (d.W / 2 - 0.3), d.belt - 0.2 - d.trunk, -d.L / 2 + 0.02, 0.44, 0.13, 0.08, {}); }
    const pm = opts.paintMat || new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.32 });
    const meshes = [new THREE.Mesh(paint.build(), pm), new THREE.Mesh(glass.build(), S.glass), new THREE.Mesh(dark.build(), S.dark), new THREE.Mesh(head.build(), S.trafficHead), new THREE.Mesh(tail.build(), S.trafficTail)];
    meshes[0].castShadow = true;
    meshes.forEach(m => body.add(m));
    return { root, body, dims: d, simple: true };
  }
  // ---- detailed player model ----
  const paintMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color), metalness: 0.6, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.3 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d6, emissiveIntensity: 0.3, roughness: 0.1 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x5a0000, emissive: 0xff1a10, emissiveIntensity: 0.5, roughness: 0.2 });
  const revMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0xffffff, emissiveIntensity: 0 });
  const add = (geo, mat, x, y, z, rx, ry, rz, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); m.rotation.set(rx || 0, ry || 0, rz || 0); m.castShadow = true; (parent || body).add(m); return m; };
  const shell = add(extrude(sh.body, d.W, 0.09), paintMat);
  shell.receiveShadow = true;
  add(extrude(sh.cab, d.W - 0.26, 0.05), S.glass).castShadow = false;
  add(new THREE.BoxGeometry(d.W - 0.36, 0.07, d.roofF - d.roofR + 0.12), paintMat, 0, d.roof - 0.03, (d.roofR + d.roofF) / 2);
  // pillars
  const pil = new THREE.BoxGeometry(0.07, d.roof - d.belt, 0.1);
  for (const sx of [-1, 1]) {
    add(pil, paintMat, sx * (d.W / 2 - 0.16), (d.roof + d.belt) / 2, (d.roofR + d.roofF) / 2 - 0.15);
    // mirrors
    add(new THREE.BoxGeometry(0.22, 0.12, 0.1), paintMat, sx * (d.W / 2 + 0.06), d.belt + 0.1, d.cabF - 0.25);
    // side skirt + door handles
    add(new THREE.BoxGeometry(0.06, 0.1, d.wb - 2 * d.R - 0.2), S.dark, sx * (d.W / 2 - 0.02), d.c + 0.08, 0);
    add(new THREE.BoxGeometry(0.04, 0.03, 0.16), S.chrome, sx * (d.W / 2 + 0.01), d.belt - 0.12, 0.25);
    add(new THREE.BoxGeometry(0.04, 0.03, 0.16), S.chrome, sx * (d.W / 2 + 0.01), d.belt - 0.12, -0.75);
    // lights
    add(new THREE.BoxGeometry(0.44, 0.13, 0.12), headMat, sx * (d.W / 2 - 0.33), d.belt - d.nose - 0.12, d.L / 2 - 0.08);
    add(new THREE.BoxGeometry(0.48, 0.13, 0.08), tailMat, sx * (d.W / 2 - 0.3), d.belt - 0.2 - d.trunk, -d.L / 2 + 0.02);
    add(new THREE.BoxGeometry(0.12, 0.08, 0.06), revMat, sx * (d.W / 2 - 0.62), d.belt - 0.2 - d.trunk, -d.L / 2 + 0.02);
  }
  // door seams (dark lines on both sides)
  for (const sx of [-1, 1]) for (const z of [d.cabF - 0.15, -0.25, d.cabR + 0.25]) add(new THREE.BoxGeometry(0.02, d.belt - d.c - 0.25, 0.015), S.dark, sx * (d.W / 2 + 0.005), (d.belt + d.c) / 2 + 0.05, z);
  // grille, bumpers, plate
  add(new THREE.BoxGeometry(d.W * 0.42, 0.16, 0.08), S.dark, 0, d.belt - d.nose - 0.3, d.L / 2 - 0.01);
  add(new THREE.BoxGeometry(d.W - 0.12, 0.22, 0.14), S.dark, 0, d.c + 0.07, d.L / 2 - 0.03);
  add(new THREE.BoxGeometry(d.W - 0.12, 0.22, 0.14), S.dark, 0, d.c + 0.07, -d.L / 2 + 0.03);
  add(new THREE.BoxGeometry(0.5, 0.12, 0.02), new THREE.MeshStandardMaterial({ color: 0xf2f2ea }), 0, d.c + 0.32, -d.L / 2 - 0.01);
  if (type === 'super' || type === 'sport') add(new THREE.BoxGeometry(d.W - 0.3, 0.05, 0.3), S.dark, 0, d.belt + 0.1, -d.L / 2 + 0.25);
  // taxi roof sign + checker stripe
  let taxiSign = null;
  if (opts.taxi) {
    const tm = new THREE.MeshStandardMaterial({ map: G.Tex.taxiSign(), emissiveMap: G.Tex.taxiSign(), emissive: 0xffffff, emissiveIntensity: 0.4 });
    taxiSign = add(new THREE.BoxGeometry(0.9, 0.22, 0.3), [S.dark, S.dark, S.dark, S.dark, tm, tm], 0, d.roof + 0.11, (d.roofR + d.roofF) / 2);
    taxiSign.userData.mat = tm;
    const ck = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.5 });
    for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.012, 0.07, d.L * 0.62), ck, sx * (d.W / 2 + 0.012), d.belt - 0.06, -0.1);
  }
  // interior
  const interior = new THREE.Group(); body.add(interior);
  add(new THREE.BoxGeometry(d.W - 0.3, 0.32, 0.5), S.interior, 0, d.belt - 0.02, d.cabF - 0.35, -0.2, 0, 0, interior);
  const seatF = new THREE.BoxGeometry(0.52, 0.65, 0.18), cush = new THREE.BoxGeometry(0.52, 0.14, 0.5);
  for (const sx of [-1, 1]) { add(seatF, S.interior, sx * 0.4, d.c + 0.65, d.cabF - 1.45, -0.15, 0, 0, interior); add(cush, S.interior, sx * 0.4, d.c + 0.28, d.cabF - 1.2, 0, 0, 0, interior); }
  add(new THREE.BoxGeometry(d.W - 0.4, 0.65, 0.2), S.interior, 0, d.c + 0.65, d.cabR + 0.3, -0.2, 0, 0, interior);
  add(new THREE.BoxGeometry(d.W - 0.4, 0.14, 0.55), S.interior, 0, d.c + 0.28, d.cabR + 0.62, 0, 0, 0, interior);
  const wheelPivot = new THREE.Group(); wheelPivot.position.set(0.4, d.belt + 0.08, d.cabF - 0.62); wheelPivot.rotation.x = -0.45; interior.add(wheelPivot);
  const steering = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.025, 8, 24), S.dark); wheelPivot.add(steering);
  steering.add(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.03, 0.02), S.dark));
  const needle = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.06, 0.004), new THREE.MeshBasicMaterial({ color: 0xff5a2a }));
  const gauge = new THREE.Mesh(new THREE.CircleGeometry(0.075, 24), new THREE.MeshBasicMaterial({ color: 0x0c1016 }));
  gauge.position.set(0.4, d.belt + 0.19, d.cabF - 0.38); gauge.rotation.x = -0.35; gauge.rotation.y = Math.PI; interior.add(gauge);
  const needlePivot = new THREE.Group(); needlePivot.position.set(0, 0, -0.002); gauge.add(needlePivot); needle.position.y = 0.03; needlePivot.add(needle);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.13), new THREE.MeshBasicMaterial({ color: 0x1f8fb0 }));
  screen.position.set(0, d.belt + 0.17, d.cabF - 0.42); screen.rotation.x = -0.35; screen.rotation.y = Math.PI; interior.add(screen);
  // passenger door (rear right = -x side), hinged at its front edge
  const doorLen = Math.min(1.0, (-0.25) - d.cabR - 0.1);
  const doorPivot = new THREE.Group(); doorPivot.position.set(-d.W / 2 - 0.035, 0, -0.27); body.add(doorPivot);
  const dp = add(new THREE.BoxGeometry(0.05, d.belt - d.c - 0.12, doorLen), paintMat, 0, (d.belt + d.c) / 2 + 0.04, -doorLen / 2, 0, 0, 0, doorPivot);
  dp.receiveShadow = true;
  add(new THREE.BoxGeometry(0.03, (d.roof - d.belt) * 0.75, doorLen * 0.8), S.glass, 0.04, d.belt + (d.roof - d.belt) * 0.38, -doorLen * 0.5, 0, 0, 0, doorPivot);
  add(new THREE.BoxGeometry(0.03, 0.03, 0.16), S.chrome, -0.03, d.belt - 0.12, -doorLen * 0.75, 0, 0, 0, doorPivot);
  if (opts.taxi) add(new THREE.BoxGeometry(0.012, 0.07, doorLen * 0.98), new THREE.MeshStandardMaterial({ color: 0x141414 }), -0.03, d.belt - 0.06, -doorLen / 2, 0, 0, 0, doorPivot);
  // wheels (attached to root so they don't roll with the body)
  const wheels = [];
  const tireGeo = new THREE.CylinderGeometry(d.R, d.R, 0.26, 24); tireGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(d.R * 0.66, d.R * 0.66, 0.27, 20); rimGeo.rotateZ(Math.PI / 2);
  const spokeGeo = new THREE.BoxGeometry(0.03, d.R * 1.2, 0.07);
  for (const [z, front] of [[d.wb / 2, true], [-d.wb / 2, false]]) for (const sx of [1, -1]) {
    const pivot = new THREE.Group(); pivot.position.set(sx * d.track / 2, d.R, z); root.add(pivot);
    const spin = new THREE.Group(); pivot.add(spin);
    const t = new THREE.Mesh(tireGeo, S.tire); t.castShadow = true; spin.add(t);
    spin.add(new THREE.Mesh(rimGeo, S.rim));
    for (let k = 0; k < 5; k++) { const sp = new THREE.Mesh(spokeGeo, S.rim); sp.position.x = sx * 0.14; sp.rotation.x = k / 5 * Math.PI; spin.add(sp); }
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(d.R * 0.5, d.R * 0.5, 0.05, 16), S.dark); disc.rotation.z = Math.PI / 2; disc.position.x = -sx * 0.05; pivot.add(disc);
    wheels.push({ pivot, spin, front, side: sx });
  }
  // headlight spot (player only; enabled at night)
  let spot = null;
  if (opts.lights) {
    spot = new THREE.SpotLight(0xfff1d8, 0, 70, 0.5, 0.55, 1.2);
    spot.position.set(0, d.belt - 0.2, d.L / 2 - 0.2); body.add(spot);
    const tgt = new THREE.Object3D(); tgt.position.set(0, -1.2, d.L / 2 + 16); body.add(tgt); spot.target = tgt;
  }
  // seats: rear-right passenger, front-left driver (left is +x)
  const seat = { x: -0.4, y: d.c + 0.32, z: d.cabR + 0.62 };
  const doorOut = { x: -d.W / 2 - 0.85, z: -0.27 - doorLen * 0.55 };
  // soft volumetric headlight beams + contact shadow
  const beams = new THREE.Mesh(G.FX.beamGeometry(d, 18), G.FX.beamMaterial()); beams.visible = false; body.add(beams);
  root.add(G.FX.blob(d.W + 1, d.L + 1.2));
  return { root, body, wheels, dims: d, paintMat, headMat, tailMat, revMat, doorPivot, steering, needlePivot, interior, spot, seat, doorOut, taxiSign, shell, beams };
};

/* Push shell vertices inward around a local contact point (x, y, z) */
G.dentShell = (model, lx, ly, lz, nx, nz, depth) => {
  const g = model.shell.geometry, pos = g.attributes.position, R = 0.75;
  // the shell geometry is rotated -90° about Y at build time: local car (x, z) maps to geometry (x, z) directly after that bake
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
    const dd = Math.hypot(x - lx, (y - ly) * 1.4, z - lz);
    if (dd > R) continue;
    const f = Math.pow(1 - dd / R, 2) * depth;
    pos.setXYZ(k, x - nx * f, y - f * 0.25, z - nz * f);
  }
  pos.needsUpdate = true;
};

/* ---------- Skid marks ring buffer ---------- */
class Skids {
  constructor(scene, max) {
    this.max = max || 500; this.n = 0;
    this.pos = new Float32Array(this.max * 4 * 3);
    const idx = []; for (let k = 0; k < this.max; k++) { const b = k * 4; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setIndex(idx);
    this.geo = g;
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    this.mesh.frustumCulled = false; scene.add(this.mesh);
    this.last = {};
  }
  add(id, x, z, dx, dz, on) {
    const l = this.last[id];
    if (!on) { this.last[id] = null; return; }
    if (l && Math.hypot(x - l[0], z - l[1]) < 0.4) return;
    if (l) {
      const k = this.n % this.max, b = k * 12, w = 0.12;
      const px = -dz * w, pz = dx * w, y = 0.03;
      const p = this.pos;
      p[b] = l[0] + px; p[b + 1] = y; p[b + 2] = l[1] + pz;
      p[b + 3] = l[0] - px; p[b + 4] = y; p[b + 5] = l[1] - pz;
      p[b + 6] = x + px; p[b + 7] = y; p[b + 8] = z + pz;
      p[b + 9] = x - px; p[b + 10] = y; p[b + 11] = z - pz;
      this.n++; this.geo.attributes.position.needsUpdate = true;
    }
    this.last[id] = [x, z];
  }
}
G.Skids = Skids;

/* ---------- Player car with physics ---------- */
const GEARS = [0.17, 0.33, 0.5, 0.67, 0.84, 1.02];
class Car {
  constructor(scene, type, color, upgrades) {
    this.scene = scene;
    this.x = 0; this.z = 0; this.heading = 0; this.vx = 0; this.vz = 0; this.yawRate = 0; this.steer = 0;
    this.vF = 0; this.vR = 0; this.aLong = 0; this.aLat = 0; this.pitch = 0; this.roll = 0; this.pitchV = 0; this.rollV = 0;
    this.rpm = 800; this.gear = 1; this.throttle = 0; this.braking = 0; this.hb = false; this.locked = false;
    this.stuckT = 0; this.impact = 0; this.damage = 0; this.lastHit = null;
    this.setType(type, color, upgrades);
  }
  setType(type, color, upgrades) {
    if (this.model) this.scene.remove(this.model.root);
    this.type = type; this.color = color;
    this.spec = G.specFor(type, upgrades);
    this.model = G.buildCar(type, color, { taxi: true, lights: true });
    this.dims = this.model.dims;
    this.scene.add(this.model.root);
    this.damage = (G.Save.data && G.Save.data.damage && G.Save.data.damage[type]) || 0;
    // re-create some dents for a car that was already damaged
    for (let k = 0; k < Math.floor(this.damage / 18); k++) { const a = Math.random() * Math.PI * 2, nx = Math.sin(a), nz = Math.cos(a); G.dentShell(this.model, -nx * this.dims.W / 2, 0.6, -nz * this.dims.L / 2, -nx, -nz, 0.08); }
    this.applyWear();
    if (this.driver) this.model.body.add(this.driver.root);
    this.sync(0);
  }
  setColor(c) { this.color = c; this.model.paintMat.color.set(c); }
  applyWear() {
    const k = this.damage / 100, m = this.model.paintMat;
    m.clearcoat = 1 - k * 0.75; m.roughness = 0.3 + k * 0.4; m.metalness = 0.6 - k * 0.25;
  }
  // amount in damage points (0..100); hit = {lx, lz, nx, nz} in car-local space
  addDamage(amount, hit) {
    if (amount <= 0) return;
    this.damage = Math.min(100, this.damage + amount);
    if (hit) G.dentShell(this.model, hit.lx, 0.55, hit.lz, hit.nx, hit.nz, Math.min(0.16, amount * 0.012));
    this.applyWear();
    const S = G.Save.data; S.damage[this.type] = Math.round(this.damage * 10) / 10;
  }
  repair() { this.damage = 0; G.Save.data.damage[this.type] = 0; this.setType(this.type, this.color, G.Save.data.upgrades[this.type]); this.placeDriver(); }
  addDriver(h) {
    this.driver = h; this.model.body.add(h.root);
    G.People.pose(h, 'sit', 0);
  }
  placeDriver() {
    if (!this.driver) return; const d = this.dims;
    this.driver.root.position.set(0.4, d.c + 0.32 - 0.92 + 0.0, d.cabF - 1.25);
  }
  teleport(x, z, heading) { this.x = x; this.z = z; this.heading = heading; this.vx = this.vz = this.yawRate = 0; this.steer = 0; this.sync(0); }
  get speed() { return Math.hypot(this.vx, this.vz); }
  circles() {
    const d = this.dims, fx = Math.sin(this.heading), fz = Math.cos(this.heading), r = d.W / 2;
    const o = d.L / 2 - r;
    return [[this.x + fx * o, this.z + fz * o, r, o], [this.x, this.z, r, 0], [this.x - fx * o, this.z - fz * o, r, -o]];
  }
  update(dt, inp, env) {
    const h = dt, d = this.dims, wear = this.damage / 100;
    const sp = wear > 0 ? Object.assign({}, this.spec, { accel: this.spec.accel * (1 - wear * 0.32), top: this.spec.top * (wear >= 1 ? 0.22 : 1 - wear * 0.18) }) : this.spec;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading), rx = -fz, rz = fx;
    let vF = this.vx * fx + this.vz * fz, vR = this.vx * rx + this.vz * rz;
    let gas = inp.gas, brake = inp.brake, steerIn = inp.steer, hb = inp.hb;
    if (this.locked) { gas = 0; brake = 1; hb = true; steerIn = 0; }
    // steering, softened at speed
    const sk = 1 / (1 + Math.abs(vF) / 16);
    const target = steerIn * sp.steer * (0.3 + 0.7 * sk);
    this.steer = M.damp(this.steer, target, Math.abs(target) > Math.abs(this.steer) ? 7 : 10, h);
    // longitudinal
    let aF = 0; const reversing = vF < -0.5 || (brake > 0 && vF < 0.6 && gas === 0);
    this.reverse = reversing && brake > 0;
    if (gas > 0) {
      if (vF < -0.5) aF += sp.brake * gas;
      else { const g = GEARS[M.clamp(this.gear - 1, 0, 5)]; const torque = 1.15 - 0.3 * (this.rpm / 7000); aF += sp.accel * gas * Math.max(0, 1 - Math.pow(Math.max(vF, 0) / sp.top, 2)) * torque * (1.05 - g * 0.12); } // gear can still be -1 right after bouncing backwards
    }
    let braking = 0;
    if (brake > 0) {
      if (vF > 0.6) { aF -= sp.brake * brake; braking = brake; }
      else if (gas === 0) aF -= 5.5 * brake * Math.max(0, 1 - Math.pow(Math.min(vF, 0) / 11, 2));
    }
    if (hb && Math.abs(vF) > 0.3) { aF -= Math.sign(vF) * 7; braking = 1; }
    aF -= vF * 0.055 + Math.sign(vF) * 0.22;
    this.braking = braking;
    const before = vF;
    vF += aF * h;
    if ((braking > 0 || (gas === 0 && brake === 0)) && Math.sign(before) !== Math.sign(vF) && Math.abs(before) < 1.5) vF = 0;
    if (gas === 0 && brake === 0 && Math.abs(vF) < 0.15) vF = 0;
    // lateral grip
    const surf = env.grip || 1;
    const grip = sp.grip * surf * (hb ? 0.28 : 1);
    const slipBefore = Math.abs(vR);
    vR *= Math.exp(-grip * 7.5 * h);
    this.slip = slipBefore;
    // yaw
    let yawT = vF * Math.tan(this.steer) / d.wb;
    const aMax = 10.5 * grip + (hb ? 4 : 0);
    if (Math.abs(vF) > 1) yawT = M.clamp(yawT, -aMax / Math.abs(vF), aMax / Math.abs(vF));
    if (hb) yawT *= 1.4;
    this.yawRate = M.damp(this.yawRate, yawT, hb ? 4 : 9 * Math.min(1.2, grip + 0.1), h);
    this.heading = M.wrapAngle(this.heading + this.yawRate * h);
    this.vx = fx * vF + rx * vR; this.vz = fz * vF + rz * vR;
    this.x += this.vx * h; this.z += this.vz * h;
    this.aLong = (vF - before) / h; this.aLat = vF * this.yawRate;
    this.vF = vF; this.vR = vR;
    // collisions
    this.impact = 0;
    for (const c of this.circles()) {
      const hit = W.collideCircle(c[0], c[1], c[2]);
      if (!hit) continue;
      this.x += hit.nx * hit.depth; this.z += hit.nz * hit.depth;
      const vn = this.vx * hit.nx + this.vz * hit.nz;
      if (vn < 0) {
        this.vx -= 1.25 * vn * hit.nx; this.vz -= 1.25 * vn * hit.nz;
        this.vx *= 0.92; this.vz *= 0.92;
        if (-vn > this.impact) this.lastHit = this.localHit(hit.nx, hit.nz, c, -vn);
        this.impact = Math.max(this.impact, -vn);
        // torque from off-center hit
        const cross = (Math.sin(this.heading) * hit.nz - Math.cos(this.heading) * hit.nx) * c[3];
        this.yawRate += cross * -vn * 0.06;
      }
    }
    // gears / rpm
    const av = Math.abs(vF);
    if (this.reverse || vF < -0.5) { this.gear = -1; this.rpm = 900 + av / 11 * 4500; }
    else {
      let g = 1; while (g < 6 && av > GEARS[g - 1] * sp.top) g++;
      this.gear = g;
      const lo = g === 1 ? 0 : GEARS[g - 2] * sp.top, hi = GEARS[g - 1] * sp.top;
      const t = M.clamp((av - lo) / (hi - lo), 0, 1);
      this.rpm = M.damp(this.rpm, (g === 1 ? 900 : 2600) + t * (6600 - (g === 1 ? 900 : 2600)) + gas * (av < 1 ? 1600 : 300), 12, h);
    }
    this.throttle = gas;
    // stuck detection
    if ((gas > 0.5 || brake > 0.5) && av < 0.8) this.stuckT += h; else this.stuckT = Math.max(0, this.stuckT - h * 2);
  }
  // contact point + inward normal in car-local space, plus world position for sparks
  localHit(nx, nz, c, v) {
    const cs = Math.cos(this.heading), sn = Math.sin(this.heading);
    const lnx = nx * cs - nz * sn, lnz = nx * sn + nz * cs; // world normal (obstacle -> car) in local frame
    const lx = -lnx * c[2], lz = c[3] - lnz * c[2];
    return { lx, lz, nx: -lnx, nz: -lnz, wx: c[0] - nx * c[2], wz: c[1] - nz * c[2], wnx: nx, wnz: nz, v };
  }
  // push out of dynamic circles (traffic); returns impact speed
  collideWith(others) {
    let imp = 0;
    for (const o of others) {
      for (const c of this.circles()) {
        const dx = c[0] - o[0], dz = c[1] - o[1], dd = Math.hypot(dx, dz), rr = c[2] + o[2];
        if (!(dd < rr) || dd === 0) continue; // also skips NaN
        const nx = dx / dd, nz = dz / dd, depth = rr - dd;
        this.x += nx * depth; this.z += nz * depth;
        const vn = (this.vx - (o[3] || 0)) * nx + (this.vz - (o[4] || 0)) * nz;
        if (vn < 0) { this.vx -= 1.3 * vn * nx; this.vz -= 1.3 * vn * nz; this.vx *= 0.9; this.vz *= 0.9; if (-vn > imp) this.lastHit = this.localHit(nx, nz, c, -vn); imp = Math.max(imp, -vn); if (o[5]) o[5](-vn); }
      }
    }
    if (imp > this.impact) this.impact = imp;
    return imp;
  }
  sync(dt, nightK) {
    const m = this.model, d = this.dims;
    m.root.position.set(this.x, 0, this.z); m.root.rotation.y = this.heading;
    if (dt > 0) {
      // spring-damper body motion
      const susp = 1 / (this.spec.comfort || 1);
      const tp = M.clamp(-this.aLong * 0.006, -0.05, 0.05) * susp, tr = M.clamp(-this.aLat * 0.0075, -0.07, 0.07) * susp;
      this.pitchV += ((tp - this.pitch) * 90 - this.pitchV * 11) * dt; this.pitch += this.pitchV * dt;
      this.rollV += ((tr - this.roll) * 80 - this.rollV * 10) * dt; this.roll += this.rollV * dt;
      m.body.rotation.set(this.pitch, 0, this.roll);
      m.body.position.y = Math.abs(this.roll) * 0.4 + (this.speed > 2 ? Math.sin(performance.now() * 0.02) * 0.0035 : 0);
      for (const w of m.wheels) { w.spin.rotation.x += this.vF / d.R * dt; if (w.front) w.pivot.rotation.y = this.steer; }
      m.steering.rotation.z = -this.steer * 2.6;
      m.needlePivot.rotation.z = -1.1 + M.clamp(this.speed / 60, 0, 1) * 2.4;
    }
    const n = nightK || 0;
    m.headMat.emissiveIntensity = 0.3 + n * 3.2;
    m.tailMat.emissiveIntensity = this.braking > 0 ? 3.2 : 0.4 + n * 0.9;
    m.revMat.emissiveIntensity = this.gear === -1 ? 2 : 0;
    if (m.spot) m.spot.intensity = n * 2.4 * (this.damage > 85 ? 0.5 : 1);
    if (m.beams) m.beams.visible = n > 0.15;
    if (m.taxiSign) m.taxiSign.userData.mat.emissiveIntensity = this.passengerAboard ? 0.08 : 0.4 + n * 1.2;
  }
}
G.Car = Car;
})();
