// desktop-cinema runtime: a deterministic 3D "desktop" scene (CSS 3D), every frame is a pure function of t.
// A clip file (cinema/clips/<id>.js) fills S.* (items, camera, cursor, agent, plates, focus) and S.start() begins.
(function () {
const { clamp, lerp, ease, spring, rnd, noise1, voice, blink } = C;
const f = n => Number(n).toFixed(2);
const $h = h => { const d = document.createElement('div'); d.innerHTML = h.trim(); return d.firstChild; };
const COL = { INK: '#14151C', COB: '#2D4BFF', CY: '#19D8FF', PK: '#FF4F9A', CO: '#FF5A45', PAPER: '#EEF1F6' };
const world = document.getElementById('world'), stage = document.getElementById('stage');
const hdrEl = document.getElementById('hdr'), platesEl = document.getElementById('plates'), agentEl = document.getElementById('agent');
const capsEl = document.getElementById('caps'), curEl = document.getElementById('cur'), coverEl = document.getElementById('cover'), hudEl = document.getElementById('hud');

// ---------- keyframe tracks (spring or timed ease between keys, continuous at every key)
const lerpObj = (a, b, g, props) => { const o = {}; for (const p of props) o[p] = lerp(a[p], b[p], g); return o; };
function trackAt(keys, t, props, fd = 1.35, zd = 0.82) {
  let from = keys[0], to = keys[0], tS = -Infinity, ff = fd, zz = zd, dd = 0;
  const gOf = (tt) => tS === -Infinity ? 1 : (dd ? ease.io3(clamp((tt - tS) / dd)) : spring(tt, tS, ff, zz));
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (k.t > t) break;
    from = lerpObj(from, to, gOf(k.t), props);
    to = k; tS = k.t; ff = k.f || fd; zz = k.zeta || zd; dd = k.d || 0;
  }
  return lerpObj(from, to, gOf(t), props);
}

const S = window.S = {
  items: {}, camKeys: [], focusKeys: [], cursor: [], plates: [], shakes: [], events: [], seqs: {}, curves: {},
  agent: { pose: [], gaze: [], expr: [], fx: [] }, hdr: { left: '', right: '' }, cover: null,
  dofMax: 4.6, drift: true, accent: COL.CO, COL
};
const seqMeta = {};
const T = window.TIMING;
S.T = T;
S.scene = id => T.scenes.find(s => s.id === id);
// word anchor: start time of the first word of scene `id` whose screen/spoken text starts with `q` (n-th match)
S.W = (id, q, n = 0, end = false) => {
  const sc = S.scene(id); if (!sc) throw new Error('no scene ' + id);
  const nz = x => x.toLowerCase().replace(/^[«"“(]+/, ''); const ql = nz(q); let k = 0;
  for (const w of sc.words) if (nz(w.s).startsWith(ql) || nz(w.sp).startsWith(ql)) { if (k++ === n) return end ? w.t1 : w.t0; }
  throw new Error(`word "${q}" not found in ${id}: ` + sc.words.map(w => w.s).join(' '));
};
S.t0 = id => S.scene(id).t0; S.t1 = id => S.scene(id).t1;
S.sfx = (t, type) => S.events.push({ t, type });

// ---------- items
const ITEM_PROPS = ['x', 'y', 'z', 'ry', 'rx', 'rz', 's', 'op'];
S.add = function (id, html, w, h, o = {}) {
  const el = $h(`<div class="it" id="it_${id}" style="width:${w}px;height:${h}px;visibility:hidden">${html}</div>`);
  world.appendChild(el);
  const base = { t: 0, x: 0, y: 0, z: 0, ry: 0, rx: 0, rz: 0, s: 1, op: 1 };
  Object.assign(base, o.at || {});
  const spawn = o.spawn || 0;
  let keys = [base];
  if (o.from) {
    const fr = Object.assign({}, base, o.from, { t: spawn - 0.01 });
    keys = [fr, Object.assign({}, base, { t: spawn, f: o.f || 2.2, zeta: o.zz || 0.62, d: o.d || 0 })];
  }
  for (const k of (o.path || [])) keys.push(Object.assign({}, keys[keys.length - 1], k, { _p: 1 }));
  // fill gaps: each key inherits from previous so partial keys are fine
  for (let i = 1; i < keys.length; i++) for (const p of ITEM_PROPS) if (keys[i][p] === undefined) keys[i][p] = keys[i - 1][p];
  const it = S.items[id] = { id, el, w, h, keys, spawn, kill: o.kill == null ? 1e9 : o.kill, float: o.float == null ? 10 : o.float, pop: o.from ? 'none' : (o.pop || 'z'),
    ph: rnd(spawn * 9 + base.x * .013 + id.length) * 6, upd: o.upd, deco: !!o.deco, nodof: !!o.nodof, mkc: 0, imgs: [], blurFn: o.blur, lastVis: null, exitD: o.exitD || 0.3, order: o.order };
  return it;
};
S.pose = (id, t) => { const it = S.items[id]; return trackAt(it.keys, t, ITEM_PROPS, 1.5, 0.75); };
S.mk = (id, lx, ly) => { const it = S.items[id]; const mid = `mk_${id}_${it.mkc++}`; it.el.appendChild($h(`<i class="mk" id="${mid}" style="left:${lx}px;top:${ly}px"></i>`)); return mid; };
S.item = id => S.items[id];

// background: pastel plane with blobs
S.bgInit = function (shapes) {
  world.appendChild($h(`<div class="it" style="left:-3000px;top:-3000px;width:6000px;height:6000px;transform:translate3d(0,0,-700px);background-image:radial-gradient(circle,#B8C0D2 3px,transparent 3.5px);background-size:64px 64px"></div>`));
  (shapes || [[-900, -800, 700, '#D4DCFF'], [800, -300, 600, '#FFD9D1'], [-700, 700, 640, '#C6F1E6'], [900, 1000, 520, '#D4DCFF'], [0, -1500, 500, '#FFD9D1']]).forEach(([x, y, r, c]) =>
    world.appendChild($h(`<div class="it" style="left:${x - r}px;top:${y - r}px;width:${2 * r}px;height:${2 * r}px;border-radius:50%;background:${c};transform:translate3d(0,0,-690px)"></div>`)));
};

// ---------- camera
S.cam = (t, cx, cy, s, ry, rx, o = {}) => S.camKeys.push(Object.assign({ t, cx, cy, s, ry: ry || 0, rx: rx || 0, rz: 0 }, o));
// look at an item (optionally at a local offset from its centre) at time t
S.look = (t, id, s, ry, rx, o = {}) => {
  const p = S.pose(id, o.at != null ? o.at : t + 0.8);
  S.cam(t, p.x + (o.dx || 0), p.y + (o.dy || 0) + (o.band === false ? 0 : 110 / s), s, ry, rx, o);
};
function camAt(t) {
  const keys = S.camKeys;
  const c = trackAt(keys, t, ['cx', 'cy', 's', 'ry', 'rx', 'rz']);
  if (S.drift) { c.cx += Math.sin(t * 0.7) * 14; c.cy += Math.cos(t * 0.6) * 10; c.ry += Math.sin(t * 0.5) * 1.2 + noise1(t * 0.9, 2) * 0.6; c.rx += Math.cos(t * 0.43) * 0.6; c.s *= 1 + Math.sin(t * 0.4) * 0.01 + t * 0.0012; }
  return c;
}
S.shake = (t, amp, dur) => S.shakes.push({ t, amp, dur: dur || 0.45 });
function shakeAt(t) {
  let x = 0, y = 0;
  for (const k of S.shakes) { const u = (t - k.t) / k.dur; if (u > 0 && u < 1) { const a = k.amp * (1 - u) * (1 - u); x += Math.sin(t * 95) * a; y += Math.cos(t * 83 + 1) * a; } }
  return [x, y];
}

// ---------- focus (depth of field): items outside the focus set blur
S.focus = (t, ids, o = {}) => S.focusKeys.push(Object.assign({ t, ids }, o));
const focusTracks = {};
function focusW(it, t) {
  if (it.nodof || !S.focusKeys.length) return 1;
  let tr = focusTracks[it.id];
  if (!tr) {
    tr = focusTracks[it.id] = S.focusKeys.map((k, i) => ({ t: i === 0 ? 0 : k.t, w: (k.ids === '*' || k.ids.includes(it.id)) ? 1 : 0, f: 2.0, zeta: 0.9 }));
  }
  return trackAt(tr, t, ['w'], 2.0, 0.9).w;
}

// ---------- agent (LED cube)
S.ag = {
  pose: (t, x, y, s, rot, o = {}) => S.agent.pose.push(Object.assign({ t, x, y, s, rot: rot || 0 }, o)),
  gaze: (t, x, y, o = {}) => S.agent.gaze.push(Object.assign({ t, x, y }, o)),
  expr: (t0, t1, e, o = {}) => S.agent.expr.push(Object.assign({ t0, t1, e }, o)),
  fx: (t, type, o = {}) => S.agent.fx.push(Object.assign({ t, type }, o))
};
const GN = 22, PITCH = 20, GX = (520 - GN * PITCH) / 2 + PITCH / 2;
const smooth = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };
function sdRound(px, py, cx, cy, hw, hh, r) { const dx = Math.abs(px - cx) - hw + r, dy = Math.abs(py - cy) - hh + r; return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r; }
const RUB = ['11110', '10001', '10001', '11110', '11111', '10000', '10000'];
const CHECK = [[3.2, 8.2], [6.2, 11.4], [10.6, 5.2], [10.6, 5.2]];
function distSeg(px, py, a, b) { const vx = b[0] - a[0], vy = b[1] - a[1], L2 = vx * vx + vy * vy || 1; const u = clamp(((px - a[0]) * vx + (py - a[1]) * vy) / L2); return Math.hypot(px - (a[0] + u * vx), py - (a[1] + u * vy)); }
const win = (t, a, b, ramp = 0.1) => (t < a - ramp || t > b + ramp) ? 0 : Math.min(smooth(a - ramp, a + ramp * 0.01 + ramp, t), 1 - smooth(b - ramp, b + ramp, t));
const eWin = (t, a, b, r = 0.09) => clamp(Math.min((t - a) / r + 0.0, (b - t) / r + 0.0, 1));

function exprAt(t) {
  const E = { arcs: 0, wide: 0, brow: 0, winkR: 0, ruble: 0, check: 0, smirk: 0, wave: 0, flat: 0, bigSmile: 0, laugh: 0, blinkF: 0, dim: 0 };
  for (const ev of S.agent.expr) {
    if (t < ev.t0 - 0.02 || t > ev.t1 + 0.02) continue;
    const w = eWin(t, ev.t0, ev.t1, ev.r || 0.09);
    const k = ev.e;
    if (k === 'blink') { const u = (t - ev.t0) / Math.max(0.05, ev.t1 - ev.t0); E.blinkF = Math.max(E.blinkF, u > 0 && u < 1 ? Math.sin(Math.PI * u) : 0); continue; }
    if (k in E) E[k] = Math.max(E[k], w);
    if (k === 'laugh') { E.wave = Math.max(E.wave, w); }
  }
  return E;
}
const BLINKS = []; for (let x = 0.9, i = 0; x < 80; i++) { BLINKS.push(x); x += 2.2 + rnd(i * 7.3) * 2.4; }
function faceDots(t, E, gz) {
  const v = voice(t);
  const bl = Math.max(blink(t, BLINKS), E.blinkF);
  let on = '', glow = '', off = '';
  const eyeS = 1 + 0.5 * E.wide;
  const eyeH = Math.max(0.5, 3.0 * (1 - bl) * eyeS), eyeW = 1.85 * (1 + 0.28 * E.wide);
  const ex = [6.2 + gz[0] * 1.2, 15.8 + gz[0] * 1.2], eyb = 8 + gz[1] * 0.9;
  const ey = [eyb - E.brow * 1.9, eyb + E.brow * 0.5];
  const mx = 10.5 + gz[0] * 0.6, my = 15.6;
  const smileBase = E.flat ? 0 : 1;
  const mouthDy = (dx) => {
    let d = 0;
    d -= E.smirk * 2.3 * smooth(-1, 4.5, dx) - E.smirk * 0.4;
    d += E.wave * 1.25 * Math.sin(dx * 1.05 + t * 6.5);
    return d;
  };
  const sm_ = (E.bigSmile ? 1.8 : smileBase * (1 - 0.65 * E.smirk));
  const lit = (x, y) => {
    let b = 0, c = 0;
    // check mark replaces the eyes
    const ck = E.check;
    for (let k = 0; k < 2; k++) {
      const dx = x - ex[k];
      const dot = smooth(0.9, -0.3, sdRound(x, y, ex[k], ey[k], eyeW, eyeH, 1.4));
      const arcY = ey[k] + 1.6 - 2.6 * Math.max(0, 1 - (dx * dx) / (2.8 * 2.8));
      const arc = Math.abs(dx) < 3.0 ? smooth(0.9, -0.3, Math.abs(y - arcY) - 0.75) : 0;
      let e = lerp(dot, arc, E.arcs);
      if (k === 1) e *= (1 - E.winkR);
      if (E.ruble > 0.02) {
        const ci = Math.round(x - (ex[k] - 2)), cj = Math.round(y - (ey[k] - 3));
        const rb = (ci >= 0 && ci < 5 && cj >= 0 && cj < 7 && RUB[cj][ci] === '1') ? 1 : 0;
        e = lerp(e, rb, E.ruble);
      }
      e *= (1 - ck);
      b = Math.max(b, e);
    }
    if (ck > 0.02) {
      let d = 9; for (let s = 0; s < 2; s++) d = Math.min(d, distSeg(x, y, CHECK[s], CHECK[s + 1]));
      b = Math.max(b, smooth(1.0, -0.2, d - 0.7) * ck);
    }
    // cheeks
    const chk = Math.max(smooth(1.9, 0.6, Math.hypot(x - 1.7, y - 12.8)), smooth(1.9, 0.6, Math.hypot(x - 19.3, y - 12.8))) * 0.5;
    if (chk > b) { b = chk; c = 1; }
    // mouth
    const open = v.open;
    if (open < 0.09) {
      const dx = x - mx; const sy = my + 0.6 - sm_ * 2.4 * Math.min(1, dx * dx / 26) + mouthDy(dx);
      const d = Math.abs(y - sy) - 0.72; if (Math.abs(dx) < 5.6) { const q = smooth(0.9, -0.3, d); if (q > b) { b = q; c = 0; } }
    } else {
      const cols = Math.round(4 + 2 * v.wide + 1.5 * (1 - v.round));
      const dx = x - mx;
      if (Math.abs(dx) <= cols + 0.5) {
        const j = Math.round(dx);
        const prof = 0.62 + 0.38 * Math.sin(t * 17 + j * 1.9) * Math.cos(t * 5.5 + j * 0.7);
        const hh = Math.max(0.6, open * 6.6 * prof * (1 - Math.pow(Math.abs(j) / (cols + 1), 2) * 0.75) * (0.75 + 0.45 * v.round));
        const cy0 = my + mouthDy(j) * 0.8;
        const d = Math.max(Math.abs(y - cy0) - hh, Math.abs(dx - j) - 0.46); const q = smooth(0.9, -0.3, d);
        if (q > b) { b = q; c = (Math.abs(j) >= cols - 1) ? 0.7 : 0.0; }
      }
    }
    return [b, c];
  };
  for (let gy = 0; gy < GN; gy++) for (let gx = 0; gx < GN; gx++) {
    const [b, c] = lit(gx, gy); const cx = GX + gx * PITCH, cy = GX + gy * PITCH;
    if (b < 0.04) { off += `<circle cx="${cx}" cy="${cy}" r="3.4" fill="#2A2D3C"/>`; continue; }
    const col = c > 0.55 ? COL.PK : COL.CY; const r = 3.4 + b * 6.4;
    on += `<circle cx="${cx}" cy="${cy}" r="${f(r)}" fill="${col}" opacity="${f(0.45 + 0.55 * b)}"/>`;
    if (b > 0.5) on += `<circle cx="${cx}" cy="${cy}" r="${f(r * 0.45)}" fill="#fff" opacity="${f(b * 0.9)}"/>`;
    glow += `<circle cx="${cx}" cy="${cy}" r="${f(r * 1.8)}" fill="${col}" opacity="${f(b * 0.6)}"/>`;
  }
  return `<g>${off}</g><g filter="url(#gb)">${glow}</g><g>${on}</g>`;
}
function agentSvg(t, E, gz) {
  const v = voice(t), ring = 0.25 + v.env * 0.75;
  return `<svg width="520" height="520" viewBox="0 0 520 520" style="overflow:visible"><defs><filter id="gb" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9"/></filter><linearGradient id="gl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2A2C3A"/><stop offset=".5" stop-color="#14151E"/><stop offset="1" stop-color="#0A0B10"/></linearGradient></defs>
   <rect x="14" y="30" width="520" height="500" rx="120" fill="rgba(20,22,60,.28)" transform="translate(0 20)" style="filter:blur(26px)"/>
   <rect x="0" y="0" width="520" height="520" rx="120" fill="url(#gl)"/>
   <rect x="4" y="4" width="512" height="512" rx="116" fill="none" stroke="${COL.CY}" stroke-width="${f(3 + ring * 7)}" opacity="${f(0.25 + ring * 0.65)}"/>
   <path d="M 60 40 Q 260 -4 460 40" stroke="#fff" stroke-width="6" fill="none" opacity=".16" stroke-linecap="round"/>
   ${faceDots(t, E, gz)}
  </svg>`;
}
function agentFx(t) {
  let dy = 0, dx = 0, rot = 0, sx = 1, sy = 1, tiltX = 0;
  for (const e of S.agent.fx) {
    const u = t - e.t; if (u < 0) continue;
    const d = e.d || 0.7;
    if (u > d) continue;
    const p = u / d, env = Math.sin(Math.PI * p);
    switch (e.type) {
      case 'bow': tiltX += 26 * env; dy += 20 * env; break;
      case 'shrug': dy -= 34 * env * (1 + 0.3 * Math.sin(p * 14)); break;
      case 'lift': dy -= 44 * Math.pow(env, 0.7); sx *= 1 + 0.03 * env; sy *= 1 + 0.03 * env; break;
      case 'shake': dx += Math.sin(u * 60) * 9 * (1 - p); rot += Math.sin(u * 52) * 2.2 * (1 - p); break;
      case 'wobble': dx += Math.sin(u * 14) * 22 * env; rot += Math.sin(u * 14) * 4 * env; break;
      case 'aside': dx += (e.dx || 90) * env; break;
      case 'upright': dy -= 22 * env; sy *= 1 + 0.05 * env; break;
      case 'pulse': sx *= 1 + 0.07 * env; sy *= 1 + 0.07 * env; break;
    }
  }
  return { dx, dy, rot, sx, sy, tiltX };
}
function renderAgent(t) {
  const ap = trackAt(S.agent.pose, t, ['x', 'y', 's', 'rot'], 2.0, 0.55);
  const ap0 = S.agent.pose[0];
  const appear = spring(t, S.agent.appear == null ? 0.05 : S.agent.appear, 2.6, 0.45);
  const g = S.agent.gaze.length ? trackAt(S.agent.gaze, t, ['x', 'y'], 4, 0.8) : { x: 0, y: 0 };
  const gz = [g.x + 0.12 * Math.sin(t * 2.3), g.y + 0.1 * Math.cos(t * 1.7)];
  const E = exprAt(t); const v = voice(t);
  const fx = agentFx(t);
  const bob = Math.sin(t * 2.2) * 9, tilt = Math.sin(t * 1.7) * 1.8 + noise1(t, 5) * 1.2;
  const sx = (1 + v.env * 0.025) * fx.sx, sy = (1 - v.env * 0.02) * fx.sy;
  agentEl.style.transform = `translate(${f(ap.x + fx.dx)}px,${f(ap.y + bob + fx.dy)}px) rotate(${f(tilt + ap.rot + fx.rot)}deg) scale(${f(ap.s * sx * appear)},${f(ap.s * sy * appear)}) translate(-260px,-260px)`;
  agentEl.style.perspective = '900px';
  agentEl.innerHTML = `<div style="width:520px;height:520px;transform:rotateX(${f(fx.tiltX)}deg);transform-origin:50% 60%">${agentSvg(t, E, gz)}</div>`;
}

// ---------- cursor
const CUR_ARROW = `<path d="M 22 22 L 22 112 L 44 92 L 62 128 L 82 119 L 64 84 L 94 82 Z" fill="${COL.CO}" stroke="#fff" stroke-width="9" stroke-linejoin="round"/>`;
const CUR_NO = `<g transform="translate(36 36)"><circle cx="22" cy="22" r="34" fill="${COL.CO}" stroke="#fff" stroke-width="9"/><path d="M -2 -2 L 46 46" stroke="#fff" stroke-width="10" stroke-linecap="round" transform="translate(0 0)"/></g>`;
const CUR_HAND = `<path d="M 36 20 q 0 -10 10 -10 q 10 0 10 10 v 28 l 14 -3 q 12 -2 14 8 l 4 36 q 2 18 -16 22 h -34 q -14 -8 -22 -26 l -14 -30 q -4 -12 8 -12 q 8 0 14 12 z" fill="${COL.CO}" stroke="#fff" stroke-width="9" stroke-linejoin="round"/>`;
curEl.innerHTML = `<svg id="cursvg" width="140" height="140" viewBox="0 0 140 140" style="position:absolute;left:-22px;top:-22px;overflow:visible"><g id="cg" opacity=".28" transform="translate(6 8)"></g><g id="cgm"></g><circle id="rip" cx="22" cy="22" r="10" fill="none" stroke="${COL.CO}" stroke-width="8" opacity="0"/><circle id="rip2" cx="22" cy="22" r="10" fill="none" stroke="${COL.INK}" stroke-width="5" opacity="0"/></svg>`;
const cgEl = curEl.querySelector('#cg'), cgmEl = curEl.querySelector('#cgm');
let curKind = null;
const mpos = id => { const r = document.getElementById(id).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
function curPoint(to) { if (typeof to === 'string') return mpos(to); if (Array.isArray(to) && typeof to[0] === 'string') { const it = S.items[to[0]]; if (!it._mk) it._mk = {}; const key = to[1] + ',' + to[2]; if (!it._mk[key]) it._mk[key] = S.mk(to[0], to[1], to[2]); return mpos(it._mk[key]); } return to; }
function renderCursor(t) {
  const ks = S.cursor;
  if (!ks.length || t < ks[0].t) { curEl.style.display = 'none'; return; }
  let i = 0; while (i < ks.length - 1 && t >= ks[i + 1].t) i++;
  const a = ks[i], b = ks[Math.min(i + 1, ks.length - 1)];
  let hidden = false;
  for (let j = 0; j <= i; j++) hidden = ks[j].to === 'hide' ? true : (ks[j].to ? false : hidden);
  const pa = (a.to === 'hide') ? null : curPoint(a.to), pb = b === a || b.to === 'hide' ? pa : curPoint(b.to);
  let x, y;
  const A = pa || (i > 0 ? curPoint(ks[i - 1].to) : [540, 960]);
  if (!pb || b === a || t >= ks[ks.length - 1].t) { x = A[0]; y = A[1]; }
  else {
    const dur = b.t - a.t, uu = clamp((t - a.t) / Math.min(dur, b.mv || 1.0)), u = b.lin ? uu : ease.io3(uu);
    const mx = (A[0] + pb[0]) / 2, my = (A[1] + pb[1]) / 2, dx = pb[0] - A[0], dy = pb[1] - A[1], L = Math.hypot(dx, dy) || 1, bend = b.straight ? 0 : Math.min(120, L * 0.18);
    const cx = mx - dy / L * bend, cy = my + dx / L * bend;
    x = (1 - u) * (1 - u) * A[0] + 2 * (1 - u) * u * cx + u * u * pb[0]; y = (1 - u) * (1 - u) * A[1] + 2 * (1 - u) * u * cy + u * u * pb[1];
  }
  const jit = (a.lin || b.lin) ? 0.6 : 3.2; x += noise1(t * 1.7, 9) * jit; y += noise1(t * 1.5, 11) * jit;
  let s = 1, rip = 0;
  for (const k of ks) if (k.click) { const dt = t - k.t; if (dt > -0.08 && dt < 0.12) s = dt < 0 ? 0.82 + 0.18 * (-dt / 0.08) : 0.82 + 0.18 * (dt / 0.12); if (dt > 0 && dt < 0.5) rip = dt / 0.5; }
  const fadeIn = ease.out3(clamp((t - ks[0].t) / 0.25));
  let vis = hidden ? 0 : 1;
  for (let j = 0; j <= i; j++) if (ks[j].to === 'hide') vis = clamp(1 - (t - ks[j].t) / 0.25);
  if (vis <= 0.01) { curEl.style.display = 'none'; return; }
  const kind = (ks.slice(0, i + 1).reverse().find(k => k.kind) || { kind: 'arrow' }).kind;
  if (kind !== curKind) { curKind = kind; const g = kind === 'no' ? CUR_NO : kind === 'hand' ? CUR_HAND : CUR_ARROW; cgEl.innerHTML = g; cgmEl.innerHTML = g; }
  curEl.style.display = 'block'; curEl.style.opacity = vis;
  curEl.style.transform = `translate(${f(x)}px,${f(y)}px) scale(${f(s * (0.6 + 0.4 * fadeIn))})`;
  const r1 = curEl.querySelector('#rip'), r2 = curEl.querySelector('#rip2');
  r1.setAttribute('r', f(10 + rip * 70)); r1.setAttribute('opacity', f(rip > 0 && rip < 1 ? (1 - rip) * 0.9 : 0));
  r2.setAttribute('r', f(10 + rip * 110)); r2.setAttribute('opacity', f(rip > 0 && rip < 1 ? (1 - rip) * 0.5 : 0));
}

// ---------- plates (<= 4 words), header, captions
S.plate = (t0, t1, text, o = {}) => S.plates.push(Object.assign({ t0, t1, text, kind: 'acc', slot: 0 }, o));
const PLATE_BG = { acc: COL.CO, sec: COL.COB, bad: COL.INK, ink: COL.INK, white: '#fff' };
const PLATE_FG = { acc: COL.INK, sec: '#fff', bad: '#fff', ink: '#fff', white: COL.INK };
let plateEls = [];
function renderPlates(t) {
  const act = S.plates.filter(p => t >= p.t0 - 0.01 && t <= p.t1 + 0.3);
  if (plateEls.length !== S.plates.length) { platesEl.innerHTML = ''; plateEls = S.plates.map(p => { const w = p.text.split(/\s+/).length; if (w > 4) throw new Error('plate > 4 words: ' + p.text); const e = $h(`<div class="pl" style="background:${PLATE_BG[p.kind] || p.kind};color:${p.fg || PLATE_FG[p.kind] || COL.INK}">${p.html || p.text}</div>`); e.style.display = 'none'; platesEl.appendChild(e); return e; }); S.plates.forEach((p, i) => { plateEls[i]._w = null; }); }
  S.plates.forEach((p, i) => {
    const e = plateEls[i];
    if (t < p.t0 - 0.01 || t > p.t1 + 0.3) { e.style.display = 'none'; return; }
    e.style.display = 'flex';
    if (!e._w) { e._w = e.getBoundingClientRect().width || 400; }
    const inK = spring(t, p.t0, 3.0, 0.5), outK = t > p.t1 ? clamp((t - p.t1) / 0.25) : 0;
    const w = e._w, sc = Math.min(1, 940 / w);
    const cx = p.x != null ? p.x : 540, cy = p.y != null ? p.y : 446 + p.slot * 112;
    const k = (0.55 + 0.45 * inK) * (1 - 0.2 * outK) * sc;
    const rot = (p.rot || 0) + (1 - inK) * -5;
    e.style.opacity = f(clamp(inK * 1.5) * (1 - outK));
    e.style.transform = `translate(${f(cx - w / 2)}px,${f(cy - 48 + (1 - inK) * 40 - outK * 18)}px) rotate(${f(rot)}deg) scale(${f(k)})`;
    e.style.transformOrigin = '50% 50%';
  });
}
function renderHeader(t) {
  if (!hdrEl._init) {
    hdrEl._init = 1;
    const N = S.hdr.day || 1;
    let dots = ''; for (let i = 0; i < 30; i++) dots += `<i style="display:block;width:22px;height:22px;border-radius:50%;box-sizing:border-box;${i < N ? 'background:' + COL.CO : 'border:4px solid #A9B1C6'};${i === N - 1 ? 'box-shadow:0 0 0 8px rgba(255,90,69,.25)' : ''}"></i>`;
    hdrEl.innerHTML = `<div class="hp" id="hl" style="left:72px;top:236px;background:${COL.CO};color:${COL.INK};font:700 30px 'JBMono'">[${S.hdr.left}]</div><div class="hp" id="hr" style="top:236px;background:#fff;color:${COL.INK};font:700 30px 'JBMono'">${S.hdr.right}</div><div id="hd" style="position:absolute;left:72px;top:330px;width:936px;display:flex;justify-content:space-between;align-items:center">${dots}</div>`;
    hdrEl._rw = hdrEl.querySelector('#hr').getBoundingClientRect().width;
    hdrEl.querySelector('#hr').style.left = (1008 - hdrEl._rw) + 'px';
  }
  const h0 = S.hdrT0 != null ? S.hdrT0 : 0.25;
  const a = spring(t, h0, 2.6, 0.6), b = spring(t, h0 + 0.15, 2.6, 0.6), c = spring(t, h0 + 0.3, 2.6, 0.6);
  hdrEl.querySelector('#hl').style.opacity = f(clamp(a * 2)); hdrEl.querySelector('#hr').style.opacity = f(clamp(b * 2));
  hdrEl.querySelector('#hl').style.transform = `translateY(${f((1 - a) * -90)}px)`;
  hdrEl.querySelector('#hr').style.transform = `translateY(${f((1 - b) * -90)}px)`;
  hdrEl.querySelector('#hd').style.opacity = f(c); hdrEl.querySelector('#hd').style.transform = `translateY(${f((1 - c) * -30)}px)`;
}
let capIdx = -2, capEl = null;
const capFit = {};
function renderCaps(t) {
  let cur = null, sc = null;
  for (const s of T.scenes) if (t >= s.t0 - 0.05 && t < s.t1 + 0.05) { sc = s; break; }
  if (sc) for (let k = 0; k < sc.chunks.length; k++) { const c = sc.chunks[k]; if (t >= c.t0 - 0.02 && t < c.t1) { cur = { sc, k, c }; break; } }
  if (!cur || t > cur.sc.speech1 + 0.5 && t > cur.c.t0 + 0.2 && cur.k === cur.sc.chunks.length - 1 && t > cur.sc.speech1 + 0.45) { capsEl.innerHTML = ''; capIdx = -2; capEl = null; return; }
  const key = cur.sc.id + ':' + cur.k;
  if (key !== capIdx) {
    capIdx = key;
    const words = cur.sc.words.slice(cur.c.a, cur.c.b + 1);
    capsEl.innerHTML = `<div class="cap">${words.map((w, i) => `<span class="w" data-i="${i}">${w.s.replace(/ —$/, '&nbsp;—')}</span>`).join('')}</div>`;
    capEl = capsEl.firstChild; capEl._w = capEl.getBoundingClientRect().width; capEl._words = words;
  }
  const w = capEl._w, sc2 = Math.min(1, 980 / w);
  const pop = spring(t, cur.c.t0, 3.2, 0.55);
  const k = (0.9 + 0.1 * pop) * sc2;
  capEl.style.transform = `translate(${f(540 - w / 2)}px,${f(1440 - 116 + (1 - pop) * 14)}px) scale(${f(k)})`;
  capEl.style.transformOrigin = '50% 50%';
  capEl.style.opacity = f(clamp(pop * 2));
  const spans = capEl.children;
  let act = -1; capEl._words.forEach((wd, i) => { if (t >= wd.t0 - 0.02) act = i; });
  for (let i = 0; i < spans.length; i++) { spans[i].style.color = i === act ? '#FF5A45' : (i < act ? '#fff' : 'rgba(255,255,255,.62)'); }
}

// ---------- media sequences
S.seq = (name, dir) => { S.seqs[name] = dir || `/cinema/media/${name}`; };
const seqUrl = (name, mt, loop) => {
  const m = seqMeta[name]; if (!m) return '';
  let idx = Math.floor(mt * m.fps) + 1;
  if (loop) idx = ((idx - 1) % m.n + m.n) % m.n + 1;
  idx = Math.min(m.n, Math.max(1, idx));
  return `${S.seqs[name]}/${String(idx).padStart(4, '0')}.jpg`;
};
function updateMedia(it, t, pending) {
  if (!it.imgsInit) { it.imgs = [...it.el.querySelectorAll('img[data-seq]')]; it.imgsInit = true; }
  for (const im of it.imgs) {
    const name = im.dataset.seq, t0 = +(im.dataset.t0 || 0), rate = +(im.dataset.rate || 1), off = +(im.dataset.off || 0), loop = im.dataset.loop === '1';
    let mt;
    if (im.dataset.curve) mt = S.curves[im.dataset.curve](t); else mt = (t - t0) * rate + off;
    if (mt < 0) mt = 0;
    const u = seqUrl(name, mt, loop);
    if (u && im._u !== u) { im._u = u; im.src = u; pending.push(im); }
  }
}

// ---------- main frame
let prevCam = null;
S.hooks = [];
function frame(t) {
  const c = camAt(t);
  const [shx, shy] = shakeAt(t);
  world.style.transform = `translate3d(${f(540 + shx)}px,${f(960 + shy)}px,0) rotateX(${f(c.rx)}deg) rotateY(${f(c.ry)}deg) rotateZ(${f(c.rz)}deg) scale3d(${f(c.s)},${f(c.s)},${f(c.s)}) translate3d(${f(-c.cx)}px,${f(-c.cy)}px,0)`;
  const pending = [];
  for (const id in S.items) {
    const it = S.items[id];
    const vis = t >= it.spawn - 0.005 && t < it.kill + it.exitD;
    if (!vis) { if (it.lastVis !== false) { it.el.style.visibility = 'hidden'; it.lastVis = false; } continue; }
    it.lastVis = true; it.el.style.visibility = 'visible';
    const p = trackAt(it.keys, t, ITEM_PROPS, 1.5, 0.75);
    let sp = 1;
    if (it.pop === 'z') sp = spring(t, it.spawn, 2.6, 0.5);
    const fl = Math.sin(t * 1.1 + it.ph) * it.float;
    const popZ = it.pop === 'z' ? (1 - sp) * -500 : 0, sc = it.pop === 'z' ? 0.5 + 0.5 * sp : 1;
    let kill = 1, kz = 0;
    if (t > it.kill) { const u = clamp((t - it.kill) / it.exitD); kill = 1 - ease.in3(u) * 0.35; kz = -ease.in3(u) * 300; p.op *= 1 - u; }
    it.el.style.opacity = f(p.op * (it.pop === 'z' ? clamp(sp * 3) : 1));
    it.el.style.transform = `translate3d(${f(p.x)}px,${f(p.y + fl)}px,${f(p.z + popZ + kz)}px) rotateY(${f(p.ry + (it.pop === 'z' ? (1 - sp) * 30 : 0))}deg) rotateX(${f(p.rx + (it.float ? Math.sin(t * 0.8 + it.ph) * 1.2 : 0))}deg) rotateZ(${f(p.rz)}deg) scale(${f(Math.max(0.01, sc * p.s * kill))}) translate(-50%,-50%)`;
    const w = focusW(it, t); const blur = Math.max((1 - w) * S.dofMax, it.blurFn ? it.blurFn(t) : 0);
    const fs = blur > 0.3 ? `blur(${f(blur)}px)` : 'none';
    if (it._f !== fs) { it.el.style.filter = fs; it._f = fs; }
    updateMedia(it, t, pending);
    if (it.upd) it.upd(t, it.el, it, p);
  }
  for (const h of S.hooks) h(t);
  renderHeader(t); renderPlates(t); renderCaps(t); renderAgent(t); renderCursor(t);
  return pending;
}
S.decodeAll = async pend => { await Promise.all(pend.map(im => im.decode().catch(() => {}))); };
S.frame = frame;
window.setT = async function (t) {
  const pend = frame(t);
  await S.decodeAll(pend);
  frame(t); // second pass: cursor markers need laid-out item rects
  await C.raf2();
};
window.setCover = function (on) {
  const hide = on ? 'none' : '';
  for (const id of ['hdr', 'plates', 'caps']) document.getElementById(id).style.display = hide;
};

S.preloadList = [];
S.preload = urls => S.preloadList.push(...urls);
S.meta = n => seqMeta[n];
async function fetchMetas() {
  for (const name of Object.keys(S.seqs)) {
    if (seqMeta[name] !== undefined) continue;
    try { seqMeta[name] = await (await fetch(S.seqs[name] + '/meta.json')).json(); }
    catch (e) { if (!new URLSearchParams(location.search).has('lenient')) throw new Error('seq meta missing: ' + name); console.warn('seq missing (lenient): ' + name); seqMeta[name] = null; }
  }
}
S.start = async function () {
  await fetchMetas();                // seqs registered at the top level of the clip file (their meta is available in build)
  if (S.build) S.build();
  await fetchMetas();                // seqs registered inside build
  await C.pre(S.preloadList);
  await document.fonts.ready;
  await window.setT(0);
  S.events.sort((a, b) => a.t - b.t);
};
window.getEvents = () => S.events;
window.getAutoEvents = () => {
  const ev = [];
  for (const p of S.plates) ev.push({ t: p.t0, type: p.kind === 'bad' ? 'fail' : 'pop' });
  for (const k of S.cursor) if (k.click) ev.push({ t: k.t, type: 'key' });
  for (let i = 1; i < S.camKeys.length; i++) { const a = S.camKeys[i - 1], b = S.camKeys[i]; if (Math.hypot(a.cx - b.cx, a.cy - b.cy) * b.s > 450) ev.push({ t: b.t, type: 'whoosh' }); }
  return ev;
};
})();
