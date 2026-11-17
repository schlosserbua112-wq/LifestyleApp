// Belohnung beim Abhaken einer Aufgabe („Glocke“): grüner Haken über der Karte, Titel wird durchgestrichen,
// zwei warme, volle Glockentöne (G, dann D) und leichte Vibration. Die Karte rastet kurz ein und schwebt dann nach oben weg.
// Alles synthetisch mit Web Audio, keine Tondateien.

// ---------- Ton ----------
let ac = null, out = null, verb = null;
function ensureAudio() {
  // „ambient“: mischt sich mit Musik und hält sich an den Stummschalter, wie iOS-Systemtöne
  try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch { /* egal */ }
  if (!ac) {
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
    ac = new C();
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3; comp.connect(ac.destination);
    out = ac.createGain(); out.gain.value = 0.85; out.connect(comp);
    const len = Math.floor(ac.sampleRate * 2.2), ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    const conv = ac.createConvolver(); conv.buffer = ir; const vg = ac.createGain(); vg.gain.value = 0.32; conv.connect(vg).connect(comp); verb = conv;
    const s = ac.createBufferSource(); s.buffer = ac.createBuffer(1, 1, 22050); s.connect(ac.destination); s.start(0);
  }
  if (ac.state !== 'running') ac.resume().catch(() => {});
  return ac;
}
// iOS gibt Ton nur bei touchend/click frei, darum bei jeder Berührung entsperren
export function initRewardAudio() {
  const unlock = () => ensureAudio();
  addEventListener('touchend', unlock, { passive: true });
  addEventListener('click', unlock);
}
function tone(type, f0, f1, t, a, peak, dec, dest, glide) {
  const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + (glide || a + dec));
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  o.connect(g).connect(dest || out); o.start(t); o.stop(t + a + dec + 0.05);
}
let noiseBuf = null;
function noise(t, dur, f0, q, peak, dest) {
  if (!noiseBuf) { noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const s = ac.createBufferSource(); s.buffer = noiseBuf; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q; f.frequency.value = f0;
  const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.0008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(dest || out); s.start(t); s.stop(t + dur + 0.05);
}
// Ein Glockenton: mehrere leicht verstimmte Stimmen (Chor), zwei tiefe Oktaven darunter, Terz und Quinte leise mit
function bell(f, t, vol, len) {
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200; lp.Q.value = 0.5; lp.connect(out);
  const parts = [[0.25, 0.22, 0.5], [0.5, 0.7, 0.8], [0.498, 0.35, 0.75], [1, 1, 0.65], [1.005, 0.55, 0.6], [0.995, 0.45, 0.6], [1.26, 0.16, 0.4], [1.5, 0.2, 0.45], [2, 0.34, 0.34], [2.008, 0.18, 0.3], [2.76, 0.12, 0.18], [4.07, 0.05, 0.09]];
  for (const [r, a, d] of parts) { tone('sine', f * r, null, t, 0.003, vol * a * 0.8, d * len, lp); tone('sine', f * r, null, t, 0.003, vol * a * 0.18, d * len * 1.3, verb); }
  tone('triangle', f * 0.5, f * 0.5, t, 0.004, vol * 0.22, 0.35 * len, lp);
  tone('sine', f * 0.5, f * 0.25, t, 0.002, vol * 0.5, 0.12, lp);
  noise(t, 0.014, f * 3, 1.6, vol * 0.3, lp); tone('triangle', f * 2, f * 1.6, t, 0.001, vol * 0.12, 0.03, lp);
}
function playBells() {
  if (!ensureAudio()) return;
  const t = ac.currentTime + 0.02;
  bell(392, t, 0.42, 0.85);
  bell(587.33, t + 0.12, 0.46, 1);
}

// ---------- Vibration ----------
// iPhone (Safari ab iOS 18): ein verstecktes Umschalt-Feld antippen löst eine kurze Vibration aus
let hapL = null;
function haptic(ms) {
  try { if (navigator.vibrate && navigator.vibrate(ms)) return; } catch { /* egal */ }
  try {
    if (!hapL) {
      hapL = document.createElement('label'); hapL.setAttribute('aria-hidden', 'true');
      hapL.style.cssText = 'position:fixed;left:-200px;top:0;opacity:0;pointer-events:none';
      hapL.innerHTML = '<input type="checkbox" switch tabindex="-1">'; document.body.appendChild(hapL);
    }
    hapL.click();
  } catch { /* egal */ }
}

// ---------- Funkeln ----------
function sparkles(rect) {
  const layer = document.createElement('div'); layer.className = 'rw-spark'; document.body.appendChild(layer);
  for (let i = 0; i < 16; i++) {
    const s = document.createElement('i');
    const x = rect.left + 8 + Math.random() * (rect.width - 16), y = rect.top + Math.random() * rect.height;
    const r = 2 + Math.random() * 3.5, gold = Math.random() < 0.35;
    s.style.cssText = `left:${x}px;top:${y}px;width:${r * 2}px;height:${r * 2}px;background:${gold ? '#e9c979' : '#fff'}`;
    layer.appendChild(s);
    s.animate([{ transform: 'translateY(0) scale(.4)', opacity: 0 }, { transform: `translate(${(Math.random() - 0.5) * 20}px,-20px) scale(1)`, opacity: 1, offset: 0.25 },
      { transform: `translate(${(Math.random() - 0.5) * 34}px,${-60 - Math.random() * 70}px) scale(.3)`, opacity: 0 }],
    { duration: 800 + Math.random() * 600, delay: Math.random() * 300, easing: 'cubic-bezier(.2,.6,.3,1)', fill: 'both' });
  }
  setTimeout(() => layer.remove(), 1800);
}

// ---------- Ablauf ----------
// el: die Karte auf dem Weg. Muss direkt aus dem Antippen heraus aufgerufen werden (Ton und Vibration brauchen die Geste).
// Gibt zurück, wann die Karte in der Liste verschwinden darf (ms).
export function celebrate(el) {
  playBells();
  haptic(12);
  if (!el || !el.isConnected || el.style.visibility === 'hidden') return 0;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Kopie über der Karte; die echte Karte wird ausgeblendet, damit der Weg sie normal weiterführen kann
  const wrap = document.createElement('div'); wrap.className = 'rw-wrap';
  wrap.style.cssText = `transform:${el.style.transform};opacity:${el.style.opacity || 1};z-index:${(+el.style.zIndex || 0) + 1};width:${el.offsetWidth}px;height:${el.offsetHeight}px`;
  const card = el.cloneNode(true); card.classList.remove('lift', 'fresh', 'done', 'fly');
  card.style.cssText = 'position:absolute;left:0;top:0;transform:none;opacity:1;visibility:visible;width:100%';
  wrap.appendChild(card); el.parentNode.appendChild(wrap);

  card.classList.add('ok');
  const ck = card.querySelector('.ck');
  if (ck) ck.animate([{ transform: 'scale(.6)' }, { transform: 'scale(1.25)', offset: 0.55 }, { transform: 'scale(1)' }], { duration: 340, easing: 'ease-out' });

  // großer Haken über der ganzen Karte
  const w = el.offsetWidth, h = el.offsetHeight, cy = h / 2, c = w / 2, s = Math.min(h * 1.25, w * 0.5);
  const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'rw-check'); svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  const d = `M${c - 0.42 * s} ${cy - 0.02 * s} L${c - 0.12 * s} ${cy + 0.3 * s} L${c + 0.48 * s} ${cy - 0.42 * s}`;
  svg.innerHTML = `<path d="${d}" stroke="rgba(63,122,74,.18)" stroke-width="15"/><path d="${d}" stroke="#3f7a4a" stroke-width="6.5"/>`;
  card.appendChild(svg);
  for (const p of svg.querySelectorAll('path')) {
    const L = p.getTotalLength(); p.style.strokeDasharray = L;
    p.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: 360, delay: 30, easing: 'cubic-bezier(.6,0,.3,1)', fill: 'both' });
  }
  const ti = card.querySelector('.t');
  if (ti) requestAnimationFrame(() => ti.classList.add('rw-x'));
  card.animate([{ boxShadow: '0 8px 22px rgba(40,50,40,.16)' }, { boxShadow: '0 0 0 3px rgba(63,122,74,.55),0 0 34px rgba(63,122,74,.35),0 10px 26px rgba(40,50,40,.18)', offset: 0.4 },
    { boxShadow: '0 0 0 2px rgba(63,122,74,.3),0 0 22px rgba(63,122,74,.2),0 10px 26px rgba(40,50,40,.16)' }], { duration: 600, fill: 'forwards' });

  setTimeout(() => haptic(10), 130); // zweiter Ton
  setTimeout(() => { // Einrasten
    haptic(8);
    if (!reduce) card.animate([{ transform: 'scale(1)' }, { transform: 'scale(.99)', offset: 0.35 }, { transform: 'scale(1.005)', offset: 0.7 }, { transform: 'scale(1)' }], { duration: 90, easing: 'ease-out' });
  }, 270);
  setTimeout(() => {
    if (!reduce) sparkles(card.getBoundingClientRect());
    card.animate(reduce ? [{ opacity: 1 }, { opacity: 0 }] : [{ transform: 'translateY(0) scale(1)', opacity: 1 }, { transform: 'translateY(-14px) scale(1.02)', opacity: 1, offset: 0.25 }, { transform: 'translateY(-90px) scale(.96)', opacity: 0 }],
      { duration: 780, easing: 'cubic-bezier(.45,0,.25,1)', fill: 'forwards' }).finished.then(() => wrap.remove(), () => wrap.remove());
  }, 470);
  return 600;
}
