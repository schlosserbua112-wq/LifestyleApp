// Landingpage für große Bildschirme. Bummel ist fürs iPhone gebaut, darum zeigt der Computer
// statt der App eine kleine schwebende Stadt zum Anschauen, dazu einen QR-Code fürs Handy.
// Wird von index.html statt js/app.js geladen, wenn kein Touch-Gerät erkannt wird.
const THREE = window.THREE;
const APP_URL = 'https://lifestyle.seashard.de';
const ACC = ['#3f7a4a', '#c0553a', '#3d6fa8', '#d1458a'];
const STILL = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

document.title = 'Bummel – fürs iPhone gebaut';
const css = document.createElement('link');
css.rel = 'stylesheet'; css.href = new URL('landing.css', import.meta.url).href;
document.head.appendChild(css);

const ICON_SHARE = '<svg viewBox="0 0 24 24"><path d="M12 3v12M8 7l4-4 4 4M6 11H5v10h14V11h-1"/></svg>';
const ICON_PLUS = '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></svg>';

const root = document.createElement('main');
root.className = 'ld';
root.innerHTML = `
  <div class="ld-sun"></div>
  <div class="ld-stage" id="ld-stage"><div class="ld-cards" id="ld-cards"></div></div>
  <section class="ld-copy">
    <svg class="ld-mark" viewBox="200 40 500 195" role="img" aria-label="Bummel">
      <text x="450" y="175" text-anchor="middle" font-family="ui-serif, 'New York', 'Iowan Old Style', Georgia, serif" font-size="150" fill="#23302a" letter-spacing="2">Bummel</text>
      <path d="M300 212 C400 196 500 224 600 206" fill="none" stroke="#d8bb88" stroke-width="7" stroke-linecap="round"/>
    </svg>
    <div class="ld-k">Nur zu Fuß · fürs iPhone gebaut</div>
    <h1>Zu viel Bildschirm für einen <em>Bummel</em>.</h1>
    <p class="ld-lead">Bummel passt in die Hosentasche. Aufgaben, Einkauf, Finanzen und Projekte liegen an einem Weg durch eine kleine Stadt, und du schlenderst mit dem Daumen hindurch. Am Schreibtisch kommt man da nicht weit, also: Handy raus, wir gehen ein Stück.</p>
    <div class="ld-qr">
      <img src="${new URL('qr.svg', import.meta.url).href}" alt="QR-Code zu ${APP_URL.replace('https://', '')}" width="132" height="132">
      <div>
        <b>Mit der iPhone-Kamera scannen</b>
        <ol>
          <li>In Safari öffnen</li>
          <li>Teilen ${ICON_SHARE} antippen</li>
          <li>„Zum Home-Bildschirm“ ${ICON_PLUS}</li>
        </ol>
      </div>
    </div>
    <div class="ld-foot">
      <span>${APP_URL.replace('https://', '')}</span>
      <a href="./?app">Trotzdem hier öffnen</a>
    </div>
  </section>
  <div class="ld-hint" id="ld-hint">Ziehen zum Drehen</div>
  <div class="ld-bubble" id="ld-bubble">Am iPhone wischt du hier hindurch.</div>`;
document.body.appendChild(root);

const start = () => { if (THREE) city(); else document.getElementById('ld-stage').remove(); };
if (css.sheet) start(); else { css.onload = start; css.onerror = start; }

function city() {
  const stage = document.getElementById('ld-stage');
  const cardsHost = document.getElementById('ld-cards');
  let W = stage.clientWidth, H = stage.clientHeight;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.setSize(W, H);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 400);
  scene.add(new THREE.HemisphereLight(0xfffaf0, 0x8a7f6a, 0.75));
  const sun = new THREE.DirectionalLight(0xfff0d8, 0.7);
  sun.position.set(-14, 26, 10); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 70 });
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.03;
  scene.add(sun);

  const isle = new THREE.Group(); scene.add(isle);
  const rnd = ((s) => () => ((s = Math.imul(s ^ (s >>> 15), 1 | s) + 0x6d2b79f5 | 0) >>> 0) / 4294967296)(20261117);
  const lam = (color, extra) => new THREE.MeshLambertMaterial(Object.assign({ color }, extra));
  const add = (geo, mat, x = 0, y = 0, z = 0, shadow = true) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
    m.castShadow = shadow; m.receiveShadow = true; isle.add(m); return m;
  };

  // ---------- Insel ----------
  const R = 10;
  add(new THREE.CylinderGeometry(R, R, 0.5, 72), lam(0x8aac6c), 0, -0.25, 0, false);
  add(new THREE.CylinderGeometry(R, R - 0.35, 1.3, 72), lam(0xc7a77c), 0, -1.15, 0, false);
  const rock = new THREE.ConeGeometry(R - 0.35, 8, 14, 3);
  const pos = rock.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < 3.9) { pos.setX(i, pos.getX(i) * (0.85 + rnd() * 0.3)); pos.setZ(i, pos.getZ(i) * (0.85 + rnd() * 0.3)); pos.setY(i, y + (rnd() - 0.5) * 0.8); }
  }
  rock.computeVertexNormals(); rock.rotateX(Math.PI);
  add(rock, lam(0x9b8061, { flatShading: true }), 0, -5.8, 0, false);

  // ---------- Weg (geschlossene Schleife) ----------
  const pathR = (a) => 5.7 + 1.5 * Math.sin(2 * a + 0.6) + 0.55 * Math.sin(5 * a);
  const PN = 360, pts = [];
  for (let i = 0; i < PN; i++) { const a = (i / PN) * Math.PI * 2, r = pathR(a); pts.push(new THREE.Vector3(Math.cos(a) * r, 0.02, Math.sin(a) * r)); }
  const ribbon = (half, y, color) => {
    const v = [], idx = [];
    for (let i = 0; i < PN; i++) {
      const p = pts[i], q = pts[(i + 1) % PN], o = pts[(i + PN - 1) % PN];
      const dx = q.x - o.x, dz = q.z - o.z, l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
      v.push(p.x + nx * half, y, p.z + nz * half, p.x - nx * half, y, p.z - nz * half);
      const a = i * 2, b = ((i + 1) % PN) * 2;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = add(g, lam(color, { side: THREE.DoubleSide }), 0, 0, 0, false); m.castShadow = false;
  };
  ribbon(0.78, 0.015, 0xd9c08f);
  ribbon(0.62, 0.03, 0xecd8ae);
  const distToPath = (x, z) => { let d = 1e9; for (let i = 0; i < PN; i += 2) d = Math.min(d, Math.hypot(pts[i].x - x, pts[i].z - z)); return d; };

  // Teich und Platz in der Mitte
  add(new THREE.CylinderGeometry(1.5, 1.5, 0.06, 40), lam(0x8fb8c9), -0.6, 0.02, 0.4, false);
  add(new THREE.CylinderGeometry(1.75, 1.75, 0.04, 40), lam(0xd9c9a6), -0.6, 0.0, 0.4, false);

  // ---------- Häuser ----------
  const winTex = (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#7d8c97'; g.fillRect(12, 14, 14, 20); g.fillRect(38, 14, 14, 20);
    g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(0, 60, 64, 4);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  })();
  const BASE = [0xf0e2c8, 0xe9c9a8, 0xd9b3a0, 0xc8d3dc, 0xe8d7b9, 0xd7c2c9, 0xcfd8b8, 0xf2e9da];
  const ROOF = [0xa65f4a, 0x8c5241, 0x6f7680, 0xb0704f];
  const homes = [];
  let tries = 0;
  while (homes.length < 62 && tries++ < 4000) {
    const a = rnd() * Math.PI * 2, r = 1.5 + Math.sqrt(rnd()) * 8;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const w = 0.9 + rnd() * 0.9, d = 0.9 + rnd() * 0.8, s = Math.max(w, d) * 0.72;
    if (r + s > R - 0.45) continue;
    if (distToPath(x, z) < 0.95 + s) continue;
    if (Math.hypot(x + 0.6, z - 0.4) < 2.1 + s) continue;
    if (homes.some((h) => Math.hypot(h.x - x, h.z - z) < h.s + s + 0.2)) continue;
    homes.push({ x, z, w, d, s, a });
  }
  homes.forEach((h, i) => {
    const quarter = Math.floor((((h.a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 2));
    const tall = rnd() < 0.15;
    const ht = tall ? 2.3 + rnd() * 1.6 : 1.0 + rnd() * 1.1;
    const base = new THREE.Color(BASE[i % BASE.length]).lerp(new THREE.Color(ACC[quarter]), tall ? 0.12 : 0.07);
    const map = winTex.clone(); map.needsUpdate = true; map.repeat.set(Math.max(1, Math.round(h.w / 0.75)), Math.max(1, Math.round(ht / 0.8)));
    const side = lam(base, { map }), top = lam(base.clone().multiplyScalar(0.92));
    const box = add(new THREE.BoxGeometry(h.w, ht, h.d), [side, side, top, top, side, side], h.x, ht / 2, h.z);
    const rot = -Math.atan2(h.z, h.x) + (rnd() - 0.5) * 0.3;
    box.rotation.y = rot;
    if (tall) {
      const cap = add(new THREE.BoxGeometry(h.w * 0.4, 0.35, h.d * 0.4), lam(0xb7b2a8), h.x, ht + 0.17, h.z);
      cap.rotation.y = rot;
    } else {
      const roof = new THREE.ConeGeometry(Math.SQRT1_2, 0.8, 4); roof.rotateY(Math.PI / 4);
      const m = add(roof, lam(ROOF[i % ROOF.length], { flatShading: true }), h.x, ht + 0.4, h.z);
      m.scale.set(h.w * 1.08, 1, h.d * 1.08); m.rotation.y = rot;
    }
  });

  // ---------- Bäume ----------
  const trunkM = lam(0x7a5c43), leafM = [lam(0x6f9a55, { flatShading: true }), lam(0x5f8a4a, { flatShading: true }), lam(0x86a965, { flatShading: true })];
  let trees = 0; tries = 0;
  while (trees < 46 && tries++ < 3000) {
    const a = rnd() * Math.PI * 2, r = 1.2 + Math.sqrt(rnd()) * 8.4;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (r > R - 0.5 || distToPath(x, z) < 1.0 || Math.hypot(x + 0.6, z - 0.4) < 1.95) continue;
    if (homes.some((h) => Math.hypot(h.x - x, h.z - z) < h.s + 0.45)) continue;
    const k = 0.7 + rnd() * 0.6;
    add(new THREE.CylinderGeometry(0.06 * k, 0.08 * k, 0.5 * k, 6), trunkM, x, 0.25 * k, z);
    add(new THREE.IcosahedronGeometry(0.42 * k, 0), leafM[trees % 3], x, 0.75 * k, z);
    trees++;
  }

  // ---------- Laternen am Weg ----------
  const poleM = lam(0x2d3430), glow = new THREE.MeshBasicMaterial({ color: 0xffe2a6 });
  for (let i = 0; i < PN; i += 30) {
    const p = pts[i], q = pts[(i + 1) % PN], dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz);
    const x = p.x - (dz / l) * 0.95, z = p.z + (dx / l) * 0.95;
    add(new THREE.CylinderGeometry(0.035, 0.045, 1.25, 6), poleM, x, 0.62, z);
    add(new THREE.SphereGeometry(0.1, 10, 8), glow, x, 1.3, z, false);
  }

  // ---------- Spaziergänger ----------
  const walkers = [0xc0553a, 0x3d6fa8, 0x3f7a4a, 0xd1a400].map((c, i) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.42, 10), lam(c)); body.position.y = 0.36; body.castShadow = true;
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.18, 8), lam(0x2d3430)); legs.position.y = 0.09; legs.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), lam(0xe0b48f)); head.position.y = 0.67; head.castShadow = true;
    g.add(body, legs, head); isle.add(g);
    return { g, t: i / 4 + rnd() * 0.08, v: (0.006 + rnd() * 0.004) * (i % 2 ? -1 : 1), off: (i % 2 ? 0.28 : -0.28) };
  });

  // ---------- Wolken ----------
  const cloudM = lam(0xffffff, { transparent: true, opacity: 0.94 });
  const clouds = [[-2, 7, -16], [10, 10.5, -24], [22, 5.5, -14], [4, 12.5, -30], [28, 9, -26]].map(([x, y, z], i) => {
    const g = new THREE.Group();
    for (let k = 0; k < 4; k++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.9 + rnd() * 0.7, 14, 10), cloudM); m.position.set(k * 1.05 - 1.5, (rnd() - 0.4) * 0.4, (rnd() - 0.5) * 0.6); m.scale.y = 0.7; g.add(m); }
    g.position.set(x, y, z); scene.add(g); return { g, x, y, z, s: 0.25 + i * 0.07 };
  });

  // ---------- Karten über den vier Vierteln (augenzwinkernd) ----------
  const CARDS = [
    { k: 'Aufgaben', html: '<div class="t"><i></i><span>Handy aus der Tasche holen</span></div><div class="s">heute · jetzt gleich</div>' },
    { k: 'Einkauf', html: '<div class="t"><span>🍋</span><span>Kleinerer Bildschirm</span></div><div class="s">1 Stück · passt in jede Tasche</div>' },
    { k: 'Finanzen', html: '<div class="big">0,00 €</div><div class="s">kostet dich der Spaziergang</div>' },
    { k: 'Projekte', html: '<div class="t"><span>💡</span><span>Mal wieder rausgehen</span></div><div class="s">Gedankenblitz · 1 Idee</div>' },
  ].map((c, i) => {
    const el = document.createElement('div');
    el.className = 'ld-card'; el.style.setProperty('--c', ACC[i]);
    el.innerHTML = `<div class="k">${c.k}</div>${c.html}`;
    cardsHost.appendChild(el);
    const a = i * (Math.PI / 2) + Math.PI / 4;
    const anchor = new THREE.Object3D(); anchor.position.set(Math.cos(a) * 7.4, 5.4 + (i % 2) * 0.9, Math.sin(a) * 7.4); isle.add(anchor);
    return { el, anchor, ph: i * 1.7 };
  });

  // ---------- Kamera, Drehen mit der Maus ----------
  let spin = 0.6, vel = 0, drag = null, mx = 0, my = 0, tmx = 0, tmy = 0, lastMove = 0;
  const hint = document.getElementById('ld-hint'), bubble = document.getElementById('ld-bubble');
  const cv = renderer.domElement;
  cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, s: spin }; vel = 0; cv.setPointerCapture(e.pointerId); hint.style.opacity = 0; });
  cv.addEventListener('pointermove', (e) => {
    const r = stage.getBoundingClientRect();
    tmx = (e.clientX - r.left) / r.width - 0.5; tmy = (e.clientY - r.top) / r.height - 0.5;
    bubble.style.transform = `translate(${e.clientX + 16}px, ${e.clientY + window.scrollY - 40}px)`;
    bubble.style.opacity = 0; lastMove = performance.now();
    if (!drag) return;
    const ns = drag.s + (e.clientX - drag.x) * 0.006; vel = ns - spin; spin = ns;
  });
  const up = () => { drag = null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('pointerleave', () => { lastMove = 0; bubble.style.opacity = 0; });

  const wide = () => W > 1080;
  function layout() {
    W = stage.clientWidth; H = stage.clientHeight;
    renderer.setSize(W, H); camera.aspect = W / H;
    if (wide()) camera.setViewOffset(W, H, -W * 0.2, 0, W, H); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }
  if (window.ResizeObserver) new ResizeObserver(layout).observe(stage); else addEventListener('resize', layout);
  layout();

  const v = new THREE.Vector3(), camDir = new THREE.Vector3();
  let t0 = performance.now(), time = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - t0) / 1000); t0 = now;
    if (!STILL) time += dt;
    if (!drag) { spin += vel; vel *= 0.94; if (!STILL) spin += dt * 0.05; }
    mx += (tmx - mx) * 0.05; my += (tmy - my) * 0.05;
    isle.rotation.y = spin;
    isle.position.y = Math.sin(time * 0.6) * 0.18;

    const dist = wide() ? 50 : 40, el = 0.42 + my * 0.08;
    camera.position.set(Math.sin(mx * 0.25) * dist * Math.cos(el), Math.sin(el) * dist + 1, Math.cos(mx * 0.25) * dist * Math.cos(el));
    camera.lookAt(0, -0.6, 0);
    camera.getWorldDirection(camDir);

    walkers.forEach((w) => {
      w.t = (w.t + w.v * dt * 6 + 1) % 1;
      const f = w.t * PN, i = Math.floor(f) % PN, p = pts[i], q = pts[(i + 1) % PN];
      const dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz) || 1;
      w.g.position.set(p.x + (q.x - p.x) * (f - Math.floor(f)) - (dz / l) * w.off, Math.abs(Math.sin(time * 9 + w.off * 10)) * 0.05, p.z + (q.z - p.z) * (f - Math.floor(f)) + (dx / l) * w.off);
      w.g.rotation.y = Math.atan2(dx * Math.sign(w.v), dz * Math.sign(w.v));
    });
    clouds.forEach((c) => { c.x += c.s * dt; if (c.x > 38) c.x = -8; c.g.position.set(c.x, c.y + Math.sin(time * 0.4 + c.z) * 0.3, c.z); });

    // Karten: Position aus der 3D-Szene, hinten an der Insel ausgeblendet
    isle.updateMatrixWorld();
    CARDS.forEach((c) => {
      c.anchor.getWorldPosition(v);
      const facing = (v.x * -camDir.x + v.z * -camDir.z) / Math.hypot(v.x, v.z);
      const o = Math.max(0, Math.min(1, (facing + 0.35) / 0.5));
      const depth = v.distanceTo(camera.position);
      v.y += Math.sin(time * 1.2 + c.ph) * 0.15;
      v.project(camera);
      const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H, s = Math.min(1.15, 54 / depth);
      c.el.style.opacity = o.toFixed(3);
      c.el.style.zIndex = Math.round(1000 - depth * 10);
      c.el.style.transform = `translate(${(x - 88).toFixed(1)}px, ${(y - 40).toFixed(1)}px) scale(${s.toFixed(3)})`;
    });

    if (lastMove && !drag && now - lastMove > 1400) bubble.style.opacity = 1;
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
