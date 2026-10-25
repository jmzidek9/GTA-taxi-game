/* CROSSTOWN — fx: HDR post-processing (bloom + film grade), wet-road light reflections, particles, headlight beams, contact shadows */
'use strict';
(function () {
const G = window.G, M = G.M;
const FX = G.FX = { post: false, lights: [], nLights: 0 };

/* ---------- Film grade: ACES, contrast/saturation, split tone, vignette, aberration, speed blur, grain ---------- */
const GRADE = {
  uniforms: {
    tDiffuse: { value: null }, exposure: { value: 1 }, uTime: { value: 0 }, uVig: { value: 0.32 }, uGrain: { value: 0.035 },
    uAb: { value: 0.0015 }, uSpeed: { value: 0 }, uSat: { value: 1.08 }, uCon: { value: 1.06 },
    uTint: { value: new THREE.Vector3(1, 1, 1) }, uLift: { value: new THREE.Vector3(0, 0, 0) }, uFlash: { value: new THREE.Vector3(0, 0, 0) }, uHurt: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
uniform sampler2D tDiffuse; uniform float exposure, uTime, uVig, uGrain, uAb, uSpeed, uSat, uCon, uHurt; uniform vec3 uTint, uLift, uFlash;
varying vec2 vUv;
vec3 RRTAndODTFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 aces(vec3 c){
  const mat3 I = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 O = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  c *= exposure / 0.6; c = I * c; c = RRTAndODTFit(c); c = O * c; return clamp(c, 0.0, 1.0);
}
vec3 toSRGB(vec3 c){ return mix(pow(c, vec3(0.41666)) * 1.055 - 0.055, c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308)))); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime * 3.1) * 43758.5453); }
void main(){
  vec2 c = vec2(0.5, 0.55), d = vUv - c; float r = length(d);
  vec3 col;
  float ab = uAb * (1.0 + uSpeed * 2.0) * r * 2.0;
  col.r = texture2D(tDiffuse, vUv + d * ab).r;
  col.g = texture2D(tDiffuse, vUv).g;
  col.b = texture2D(tDiffuse, vUv - d * ab).b;
  if (uSpeed > 0.01) {
    vec3 acc = col; float k = uSpeed * r * r * 0.09;
    for (int i = 1; i < 6; i++) acc += texture2D(tDiffuse, vUv - d * k * float(i)).rgb;
    col = mix(col, acc / 6.0, smoothstep(0.12, 0.45, r));
  }
  col = col * uTint + uFlash;
  col = aces(col);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSat);
  col = (col - 0.5) * uCon + 0.5;
  col += uLift * (1.0 - smoothstep(0.0, 0.45, l));
  col = clamp(col, 0.0, 1.0);
  float v = smoothstep(0.85, 0.2, r * (1.0 + uVig));
  col *= mix(1.0, v, 0.85);
  col = mix(col, vec3(0.75, 0.05, 0.03), uHurt * smoothstep(0.25, 0.75, r));
  col = toSRGB(col);
  col += (hash(vUv * 1024.0) - 0.5) * uGrain;
  gl_FragColor = vec4(col, 1.0);
}`,
};

let renderer, scene, camera, composer, bloom, grade, rt;
FX.init = (r, sc, cam) => { renderer = r; scene = sc; camera = cam; buildReflections(); buildParticles(); };
FX.supported = () => !!(window.THREE && THREE.EffectComposer && THREE.UnrealBloomPass && renderer && renderer.capabilities.isWebGL2);
FX.configure = (q) => {
  const want = q.post && G.Save.data.settings.post !== false && FX.supported();
  if (composer) { composer.renderTarget1.dispose(); composer.renderTarget2.dispose(); composer = null; }
  FX.post = !!want;
  if (FX.post) {
    const w = window.innerWidth, h = window.innerHeight, pr = renderer.getPixelRatio();
    rt = new THREE.WebGLRenderTarget(Math.floor(w * pr), Math.floor(h * pr), { type: THREE.HalfFloatType, samples: q.msaa || 0 });
    composer = new THREE.EffectComposer(renderer, rt);
    composer.setPixelRatio(pr); composer.setSize(w, h);
    composer.addPass(new THREE.RenderPass(scene, camera));
    bloom = new THREE.UnrealBloomPass(new THREE.Vector2(w, h), 0.5, 0.55, 1.6);
    if (q.bloom === false) bloom.enabled = false;
    composer.addPass(bloom);
    grade = new THREE.ShaderPass(GRADE);
    composer.addPass(grade);
    renderer.toneMapping = THREE.NoToneMapping; // tone mapping happens in the grade pass so bloom sees HDR values
  } else {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
  }
  document.body.classList.toggle('post', FX.post);
};
FX.resize = (w, h) => { if (composer) composer.setSize(w, h); };
FX.flash = new THREE.Vector3(); FX.hurt = 0; FX.speed = 0;
// called once per frame before render with world state
FX.update = (dt, st) => {
  const night = st.night, wx = st.wx;
  if (FX.post) {
    const u = grade.uniforms;
    u.exposure.value = renderer.toneMappingExposure;
    u.uTime.value = (u.uTime.value + dt) % 100;
    u.uSpeed.value = M.damp(u.uSpeed.value, FX.speed, 4, dt);
    // warm at golden hour, cool teal shadows at night, flat grey in rain
    const golden = M.clamp(1 - Math.abs(st.hour - 18.4) / 1.6, 0, 1) + M.clamp(1 - Math.abs(st.hour - 6.6) / 1.2, 0, 1) * 0.7;
    u.uTint.value.set(1 + golden * 0.08 - night * 0.04, 1 + golden * 0.01, 1 - golden * 0.08 + night * 0.06);
    u.uLift.value.set(0.0, 0.012 * night + 0.006, 0.03 * night + 0.008);
    u.uSat.value = 1.1 - wx.wet * 0.12 - wx.haze * 0.1 + golden * 0.06;
    u.uCon.value = 1.07 + night * 0.04;
    u.uVig.value = 0.3 + night * 0.2;
    u.uFlash.value.copy(FX.flash);
    FX.hurt = Math.max(0, FX.hurt - dt * 1.6); u.uHurt.value = Math.min(0.55, FX.hurt);
    bloom.threshold = M.lerp(2.1, 0.8, night);
    bloom.strength = M.lerp(0.28, 0.85, night) + wx.haze * 0.15;
    bloom.radius = 0.5 + wx.haze * 0.3;
  }
  FX.flash.multiplyScalar(Math.exp(-dt * 6));
  updateReflections(st);
  updateParticles(dt, st);
};
FX.render = () => { if (FX.post) composer.render(); else renderer.render(scene, camera); };

/* ---------- Wet-road light reflections: streaks stretched from each light toward the camera ---------- */
const MAXR = 900;
let refl, reflGeo, reflMat, statics = [];
function buildReflections() {
  const base = new THREE.InstancedBufferGeometry();
  base.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3));
  base.setIndex([0, 1, 2, 0, 2, 3]);
  base.setAttribute('iPos', new THREE.InstancedBufferAttribute(new Float32Array(MAXR * 3), 3));
  base.setAttribute('iCol', new THREE.InstancedBufferAttribute(new Float32Array(MAXR * 3), 3));
  base.setAttribute('iSize', new THREE.InstancedBufferAttribute(new Float32Array(MAXR), 1));
  base.instanceCount = 0;
  reflGeo = base;
  reflMat = new THREE.ShaderMaterial({
    uniforms: { camPos: { value: new THREE.Vector3() }, strength: { value: 0 } },
    vertexShader: `uniform vec3 camPos; attribute vec3 iPos; attribute vec3 iCol; attribute float iSize; varying vec2 vC; varying vec3 vCol;
      void main(){
        vec2 g = iPos.xz; vec2 d = camPos.xz - g; float dist = length(d); d = dist > 0.001 ? d / dist : vec2(0.0, 1.0);
        vec2 side = vec2(-d.y, d.x);
        float len = min(dist * 0.85, iPos.y * 2.4 + 5.0);
        vec2 p = g + d * (position.y * len - iSize * 0.4) + side * position.x * iSize * (0.6 + position.y * 0.5);
        vC = position.xy; vCol = iCol;
        gl_Position = projectionMatrix * viewMatrix * vec4(p.x, 0.05, p.y, 1.0);
      }`,
    fragmentShader: `uniform float strength; varying vec2 vC; varying vec3 vCol;
      void main(){ float a = 1.0 - abs(vC.x); a *= a; float t = vC.y; float f = smoothstep(0.0, 0.15, t) * pow(1.0 - t, 1.8);
        gl_FragColor = vec4(vCol * a * f * strength, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  refl = new THREE.Mesh(reflGeo, reflMat); refl.frustumCulled = false; refl.renderOrder = 3; scene.add(refl);
}
FX.addStaticLights = (list, r, g, b, size) => { for (const p of list) statics.push([p[0], p[1], p[2], r, g, b, size]); };
// dynamic lights are pushed every frame by cars, police, etc.
FX.light = (x, y, z, r, g, b, size) => {
  if (FX.nLights >= 300) return;
  const L = FX.lights[FX.nLights] || (FX.lights[FX.nLights] = new Float32Array(7));
  L[0] = x; L[1] = y; L[2] = z; L[3] = r; L[4] = g; L[5] = b; L[6] = size; FX.nLights++;
};
function updateReflections(st) {
  const k = st.wx.wet * (0.25 + st.night * 0.75);
  refl.visible = k > 0.03;
  if (!refl.visible) { FX.nLights = 0; return; }
  reflMat.uniforms.camPos.value.copy(camera.position);
  reflMat.uniforms.strength.value = k * 2.6;
  const P = reflGeo.attributes.iPos.array, C = reflGeo.attributes.iCol.array, S = reflGeo.attributes.iSize.array;
  const cx = camera.position.x, cz = camera.position.z;
  let n = 0;
  const push = (L, gain) => { if (n >= MAXR) return; P[n * 3] = L[0]; P[n * 3 + 1] = L[1]; P[n * 3 + 2] = L[2]; C[n * 3] = L[3] * gain; C[n * 3 + 1] = L[4] * gain; C[n * 3 + 2] = L[5] * gain; S[n] = L[6]; n++; };
  const night = st.night;
  for (const L of statics) { const dx = L[0] - cx, dz = L[2] - cz; if (dx * dx + dz * dz < 170 * 170) push(L, night); }
  for (let q = 0; q < FX.nLights; q++) { const L = FX.lights[q]; const dx = L[0] - cx, dz = L[2] - cz; if (dx * dx + dz * dz < 140 * 140) push(L, 1); }
  FX.nLights = 0;
  reflGeo.instanceCount = n;
  reflGeo.attributes.iPos.needsUpdate = reflGeo.attributes.iCol.needsUpdate = reflGeo.attributes.iSize.needsUpdate = true;
}

/* ---------- Particles: two pools (soft smoke, additive glow for sparks/splashes) ---------- */
const PV = `attribute vec4 aColor; attribute float aSize; uniform float uScale; varying vec4 vC;
  void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; vC = aColor; }`;
const PF = `uniform vec3 uLight; varying vec4 vC; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard; float a = pow(1.0 - d, 1.6); gl_FragColor = vec4(vC.rgb * uLight, vC.a * a); }`;
function makePool(n, additive) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
  g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(n), 1));
  const mat = new THREE.ShaderMaterial({ uniforms: { uScale: { value: 400 }, uLight: { value: new THREE.Vector3(1, 1, 1) } }, vertexShader: PV, fragmentShader: PF, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = 6; scene.add(pts);
  const P = { n, g, mat, pts, live: 0, head: 0, d: [] };
  for (let k = 0; k < n; k++) P.d.push({ life: 0, max: 1, x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, s0: 1, s1: 1, r: 1, gr: 1, b: 1, a: 1, drag: 1, grav: 0 });
  return P;
}
let smoke, glow;
function buildParticles() { smoke = makePool(700, false); glow = makePool(700, true); }
function emit(P, o) {
  const p = P.d[P.head]; P.head = (P.head + 1) % P.n;
  p.life = p.max = o.life; p.x = o.x; p.y = o.y; p.z = o.z; p.vx = o.vx || 0; p.vy = o.vy || 0; p.vz = o.vz || 0;
  p.s0 = o.s0; p.s1 = o.s1 === undefined ? o.s0 : o.s1; p.r = o.r; p.gr = o.g; p.b = o.b; p.a = o.a; p.drag = o.drag || 0; p.grav = o.grav || 0;
}
FX.smoke = (x, y, z, vx, vz, amt, dark) => {
  const c = dark ? 0.16 + Math.random() * 0.08 : 0.72 + Math.random() * 0.15;
  emit(smoke, { life: 1.6 + Math.random() * 1.2, x: x + (Math.random() - 0.5) * 0.4, y, z: z + (Math.random() - 0.5) * 0.4, vx: vx * 0.25 + (Math.random() - 0.5) * 1.2, vy: 0.7 + Math.random() * 0.8, vz: vz * 0.25 + (Math.random() - 0.5) * 1.2, s0: 0.7, s1: 3.6 + Math.random() * 1.5, r: c, g: c, b: c * 1.02, a: 0.28 * amt, drag: 1.4, grav: -0.25 });
};
FX.sparks = (x, y, z, nx, nz, amt) => {
  const n = Math.min(40, 6 + amt * 3 | 0);
  for (let k = 0; k < n; k++) {
    const sp = 3 + Math.random() * 7;
    emit(glow, { life: 0.25 + Math.random() * 0.45, x, y, z, vx: nx * sp + (Math.random() - 0.5) * 5, vy: 1.5 + Math.random() * 4, vz: nz * sp + (Math.random() - 0.5) * 5, s0: 0.12, s1: 0.04, r: 3.2, g: 1.6, b: 0.5, a: 1, drag: 0.6, grav: 14 });
  }
};
FX.splash = (x, z) => emit(glow, { life: 0.22, x, y: 0.06, z, vy: 1.4, s0: 0.12, s1: 0.02, r: 0.5, g: 0.55, b: 0.6, a: 0.7, grav: 9 });
FX.spray = (x, z, vx, vz) => emit(smoke, { life: 0.6 + Math.random() * 0.4, x: x + (Math.random() - 0.5) * 0.5, y: 0.25, z: z + (Math.random() - 0.5) * 0.5, vx: vx * 0.3 + (Math.random() - 0.5), vy: 0.6 + Math.random() * 0.6, vz: vz * 0.3 + (Math.random() - 0.5), s0: 0.5, s1: 2.2, r: 0.82, g: 0.85, b: 0.9, a: 0.16, drag: 2, grav: 0.5 });
FX.dust = (x, y, z) => emit(smoke, { life: 1.1, x, y, z, vx: (Math.random() - 0.5) * 2, vy: 0.4 + Math.random() * 0.5, vz: (Math.random() - 0.5) * 2, s0: 0.4, s1: 1.8, r: 0.6, g: 0.56, b: 0.5, a: 0.3, drag: 1.5 });
let splashAcc = 0;
function stepPool(P, dt) {
  const pos = P.g.attributes.position.array, col = P.g.attributes.aColor.array, sz = P.g.attributes.aSize.array;
  for (let k = 0; k < P.n; k++) {
    const p = P.d[k];
    if (p.life <= 0) { if (sz[k] !== 0) { sz[k] = 0; pos[k * 3 + 1] = -999; } continue; }
    p.life -= dt;
    const t = 1 - Math.max(0, p.life) / p.max, dr = Math.exp(-p.drag * dt);
    p.vx *= dr; p.vz *= dr; p.vy = p.vy * dr - p.grav * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.y < 0.02 && p.grav > 0) { p.y = 0.02; p.vy *= -0.3; p.vx *= 0.5; p.vz *= 0.5; }
    pos[k * 3] = p.x; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = p.z;
    col[k * 4] = p.r; col[k * 4 + 1] = p.gr; col[k * 4 + 2] = p.b; col[k * 4 + 3] = p.a * (1 - t) * Math.min(1, t * 8 + 0.2);
    sz[k] = M.lerp(p.s0, p.s1, t);
  }
  P.g.attributes.position.needsUpdate = P.g.attributes.aColor.needsUpdate = P.g.attributes.aSize.needsUpdate = true;
}
function updateParticles(dt, st) {
  const sc = renderer.domElement.height * 0.5;
  smoke.mat.uniforms.uScale.value = glow.mat.uniforms.uScale.value = sc;
  const li = M.lerp(1, 0.22, st.night) * (1 - st.wx.dark * 0.3);
  smoke.mat.uniforms.uLight.value.setScalar(li);
  if (dt <= 0) return;
  // rain splashes around the camera
  const rain = st.wx.rain;
  if (rain > 0.1) {
    splashAcc += dt * rain * 260;
    const cx = camera.position.x, cz = camera.position.z, fx = -Math.sin(camera.rotation.y), fz = -Math.cos(camera.rotation.y);
    while (splashAcc > 1) { splashAcc--; const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 26; const x = cx + fx * 12 + Math.cos(a) * r, z = cz + fz * 12 + Math.sin(a) * r; if (!G.World.insideSolid(x, z, 0)) FX.splash(x, z); }
  }
  stepPool(smoke, dt); stepPool(glow, dt);
}

/* ---------- Headlight beams (soft volumetric cones) ---------- */
let beamMat = null;
FX.beamMaterial = () => beamMat || (beamMat = new THREE.ShaderMaterial({
  uniforms: { strength: { value: 0 } },
  // vD fades beams that pass right over the lens (e.g. a car tailgating the camera)
  vertexShader: 'varying float vT; varying float vE; varying float vD; void main(){ vT = 1.0 - uv.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vec3 n = normalize(normalMatrix * normal); vE = abs(dot(n, normalize(-mv.xyz))); vD = -mv.z; gl_Position = projectionMatrix * mv; }',
  fragmentShader: 'uniform float strength; varying float vT; varying float vE; varying float vD; void main(){ float a = pow(1.0 - vT, 1.7) * smoothstep(0.0, 0.08, vT) * pow(vE, 1.5) * smoothstep(1.5, 7.0, vD) * strength; gl_FragColor = vec4(vec3(1.0, 0.93, 0.78) * a, 1.0); }',
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
}));
FX.beamGeometry = (d, len) => {
  const parts = [];
  for (const sx of [-1, 1]) {
    const g = new THREE.CylinderGeometry(0.1, 2.6, len, 14, 1, true);
    g.translate(0, -len / 2, 0); g.rotateX(-Math.PI / 2); g.rotateX(0.09);
    g.translate(sx * (d.W / 2 - 0.33), d.belt - d.nose - 0.12, d.L / 2 - 0.02);
    parts.push(g);
  }
  const gb = new G.GB(); parts.forEach(g => gb.addGeo(g, new THREE.Matrix4()));
  const out = gb.build(); out.deleteAttribute('color');
  return out;
};

/* ---------- Contact shadows ---------- */
let blobMat = null;
FX.blob = (w, l, o) => {
  if (!blobMat) blobMat = new THREE.MeshBasicMaterial({ map: G.Tex.radial('rgba(255,255,255,1)'), color: 0x000000, transparent: true, opacity: 0.62, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), blobMat);
  m.rotation.x = -Math.PI / 2; m.position.y = (o && o.y) || 0.035; m.renderOrder = 1; m.castShadow = false;
  return m;
};
})();
