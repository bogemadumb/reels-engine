// job descriptions for cinema/rec.js ; each: {url, vp, dsf, mobile, dur, ready(p), run(h) -> extra meta}
const BASE = process.env.REC_BASE || 'http://127.0.0.1:8080/games/';
const MOB = { vp: [360, 780], dsf: +(process.env.MOB_DSF || 1), mobile: true };
const DESK = { vp: [1280, 800], dsf: 1.5 };
const FX_RUN_LV = +(process.env.FX_RUN_LV || 10), FX_PLAY_LV = +(process.env.FX_PLAY_LV || 6);
const jobs = {};
const J = o => Object.assign({}, o);
const center = (p, sel) => p.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, sel);

// ---------- g1: merge ----------
jobs.g1 = J(Object.assign({
  anim: true,
  url: BASE + 'game1-merge/?lang=ru&debug', dur: 12,
  ready: async p => { await p.waitForFunction('window.__dbg&&document.getElementById("bspawn")', null, { timeout: 25000 }); },
  async run(h) {
    const p = h.p, sp = await center(p, '#bspawn');
    const st = () => p.evaluate(() => { const pr = __dbg.pairFor(-1, false); const items = __dbg.cells.map((c, i) => c ? i : -1).filter(i => i >= 0);
      return { ch: __dbg.S.charges, pr, items, pts: pr ? [__dbg.cellCenter(pr[0]), __dbg.cellCenter(pr[1])] : null, ic: items.map(i => { const c = __dbg.cellCenter(i); return [c.x, c.y]; }) }; });
    const cp = c => Array.isArray(c) ? c : [c.x, c.y];
    let step = 0, tapIdx = 0, merges = 0;
    await h.at(0.4);
    while (h.t() < 11.0) {
      const s = await st(); step++;
      if (s.pr && (step % 3 !== 1 || s.ch === 0)) {
        const a = cp(s.pts[0]), b = cp(s.pts[1]);
        await h.drag([a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 18], b], 420, { hold: 70, hold2: 60 }); merges++;
        await h.sleep(520);
      } else if (s.ch > 0) { await h.tap(sp[0], sp[1], 50); await h.sleep(380); }
      else if (s.ic.length) { const q = s.ic[tapIdx++ % s.ic.length]; await h.tap(q[0], q[1], 50); await h.sleep(450); }
      else await h.sleep(200);
      if (step % 3 === 0 && s.ic.length) { const q = s.ic[(tapIdx++ * 2) % s.ic.length]; await h.tap(q[0], q[1], 50); await h.sleep(250); }
    }
    return { merges };
  }
}, MOB));

// ---------- g2: blocks ----------
jobs.g2 = J(Object.assign({
  anim: true,
  url: BASE + 'game2-blocks/?lang=ru&debug', dur: 12,
  ready: async p => {
    await p.waitForFunction('window.__dbg&&document.querySelector("#card .btn")', null, { timeout: 25000 });
    const b = await center(p, '#card .btn'); await p.mouse.click(b[0], b[1]);
    await p.waitForFunction('document.getElementById("modal").classList.contains("hidden")', null, { timeout: 8000 });
    await p.evaluate(() => {
      __dbg.setBoard(['........', '..#.#...', '.#.#....', '#####...', '..#.....', '........', '##..####', '##..####']);
      __dbg.setPieces([__dbg.shapeIndex('##|##'), __dbg.shapeIndex('###'), __dbg.shapeIndex('#|#')]);
    });
    await new Promise(r => setTimeout(r, 900));
  },
  async run(h) {
    const p = h.p; let moves = 0;
    await h.at(0.5);
    while (h.t() < 11.0) {
      const plan = await p.evaluate(() => {
        const G = __dbg.G, I = __dbg.info(), SZ = 8, SH = __dbg.SHAPES; let best = null;
        const fill = (b, r, c) => { let n = 0, m = 0; for (let k = 0; k < SZ; k++) { if (b[r * SZ + k]) n++; if (b[k * SZ + c]) m++; } return n + m; };
        G.pieces.forEach((pc, slot) => {
          if (pc.p) return; const sh = SH[pc.s];
          for (let r = 0; r <= SZ - sh.h; r++) for (let c = 0; c <= SZ - sh.w; c++) {
            let ok = true; for (const [dr, dc] of sh.cells) if (G.board[(r + dr) * SZ + c + dc]) { ok = false; break; } if (!ok) continue;
            const b = G.board.slice(); for (const [dr, dc] of sh.cells) b[(r + dr) * SZ + c + dc] = 1;
            let lines = 0; for (let k = 0; k < SZ; k++) { let f = true, g = true; for (let q = 0; q < SZ; q++) { if (!b[k * SZ + q]) f = false; if (!b[q * SZ + k]) g = false; } if (f) lines++; if (g) lines++; }
            let sc = lines * 100 + sh.cells.reduce((a, [dr, dc]) => a + fill(b, r + dr, c + dc), 0) * 2 + sh.n * 0.5;
            if (!best || sc > best.sc) best = { sc, slot, r, c, lines, w: sh.w, h: sh.h };
          }
        });
        if (!best) return null;
        const s = __dbg.slotCenter(best.slot);
        return { from: [s.x, s.y], to: [I.BX + best.c * I.CELL + best.w * I.CELL / 2, I.BY + best.r * I.CELL + best.h * I.CELL / 2], lines: best.lines };
      });
      if (!plan) break;
      const mid = [(plan.from[0] + plan.to[0]) / 2, Math.min(plan.from[1], plan.to[1]) - 20];
      await h.drag([plan.from, mid, plan.to], 560, { hold: 80, hold2: 90 }); moves++;
      await h.sleep(plan.lines ? 1400 : 650);
    }
    return { moves };
  }
}, MOB));

// ---------- g4: shawarma x3 languages ----------
function shawarma(lang) {
  return Object.assign({
    anim: true, url: BASE + 'game4-shawarma/?lang=' + lang + '&debug', dur: 5,
    ready: async p => { await p.waitForFunction('window.__dbg&&window.__dbg.scene&&document.querySelectorAll("#list .row").length>0', null, { timeout: 25000 }); },
    async run(h) {
      const pt = await h.p.evaluate('[__dbg.sx(200),__dbg.sy(205)]');
      const sched = [0.3, 0.55, 0.8, 1.05, 1.3, 1.55, 1.8, 2.05, 2.3, 2.55, 2.8];
      const off = [[0, 0], [-34, 8], [30, -6], [-12, 14], [38, 4], [-30, -8], [12, 10], [-40, 2], [28, 12], [-8, -10], [34, 6], [-22, 12]];
      for (let i = 0; i < 11; i++) { await h.at(sched[i]); await h.tap(pt[0] + off[i][0], pt[1] + off[i][1], 30); }
      await h.at(3.2);
      const bb = await center(h.p, '#list .row .buy');
      await h.tap(bb[0], bb[1], 60);
      await h.at(3.9); await h.tap(pt[0] + off[11][0], pt[1] + off[11][1], 30);
      await h.at(4.2); await h.tap(pt[0] - 20, pt[1] + 4, 30);
    }
  }, MOB);
}
jobs.g4ru = shawarma('ru');
jobs.g4en = shawarma('en');
jobs.g4tr = shawarma('tr');

// ---------- flux ----------
const fluxReady = async p => { await p.waitForFunction('window.__dbg&&window.__dbg.LY!==undefined', null, { timeout: 25000 }); };
function watchHit(h, ev) {
  let on = true;
  (async () => { while (on) { const s = await h.p.evaluate('__dbg.st').catch(() => null); if (s === 'won' && ev.hit == null) ev.hit = +h.t().toFixed(2); await h.sleep(25); } })();
  return () => { on = false; };
}
jobs.fxrun = J(Object.assign({
  anim: true, accept: x => x.events && x.events.hit != null && x.events.hit < 6.4,
  url: BASE + 'game5-flux/?lang=ru&debug', dur: 7, ready: async p => {
    await fluxReady(p); await p.evaluate(n => { __dbg.startCamp(n); __dbg.step(0.6); __dbg.solve(); }, FX_RUN_LV);
    await new Promise(r => setTimeout(r, 900));
  },
  async run(h) {
    const ev = {}, stop = watchHit(h, ev);
    await h.at(0.5); await h.p.evaluate('__dbg.launch()'); ev.launch = +h.t().toFixed(2);
    await h.at(6.9); stop();
    return { level: FX_RUN_LV, events: ev };
  }
}, MOB));

jobs.fxplay = J(Object.assign({
  anim: true, accept: x => x.events && x.events.hit != null && x.events.hit < 13.6 && x.events.launch != null,
  url: BASE + 'game5-flux/?lang=ru&debug', dur: 14, ready: async p => {
    await fluxReady(p); await p.evaluate(n => { for (let i = 1; i < n; i++) __dbg.S.st[i] = 3; __dbg.openMap(); }, FX_PLAY_LV); await new Promise(r => setTimeout(r, 1200));
  },
  async run(h) {
    const p = h.p, ev = {}, stop = watchHit(h, ev), n = FX_PLAY_LV;
    await h.at(0.8);
    const findBtn = () => p.evaluate(id => { const b = __dbg.btn(id); return b && b.y > 70 && b.y < 700 ? [b.x + b.w / 2, b.y + b.h / 2] : null; }, 'lv' + n);
    let lb = await findBtn();
    for (let k = 0; k < 8 && !lb; k++) {
      await h.ts([180, 560]); await h.travel([[180, 560], [180, 300]], 500, h.tm); await h.te(); await h.sleep(700);
      lb = await findBtn();
    }
    if (!lb) throw new Error('level button not on map');
    await h.ttap(lb[0], lb[1], 70);
    const base = h.t() + 0.9;
    await h.at(base);
    const info = await p.evaluate(() => ({ inv: __dbg.L.inv.slice(), slots: __dbg.LY.slots.map(s => [s.x, s.y]), tgt: __dbg.L.sol.map(s => __dbg.toScr(s.x, s.y)) }));
    for (let i = 0; i < info.inv.length; i++) {
      const S = info.slots[i], T = info.tgt[i];
      await h.at(base + 0.3 + i * 2.3);
      await h.ts(S);
      await p.waitForFunction('__dbg.drag()', null, { timeout: 3000 }).catch(() => { });
      const off = await p.evaluate('__dbg.drag()?__dbg.drag().off:0');
      const M = [(S[0] + T[0]) / 2 + (i % 2 ? -60 : 60), (S[1] + T[1]) / 2];
      const Tf = [T[0], T[1] + off];
      await h.travel([[S[0], S[1]], [M[0], M[1] + off]], 600, h.tm);
      await h.sleep(260);
      await h.travel([[M[0], M[1] + off], Tf], 750, h.tm);
      await h.sleep(260); await h.te();
    }
    await h.sleep(500);
    const lc = await p.evaluate(() => { const b = __dbg.btn('launch'); return [b.x + b.w / 2, b.y + b.h / 2]; });
    await h.tap(lc[0], lc[1], 60);
    await h.at(13.9); stop();
    const pe = await h.pageEvents(), dn = pe.filter(e => e.type === 'pointerdown'), up = pe.filter(e => e.type === 'pointerup');
    ev.open = dn[0] && dn[0].t;
    info.inv.forEach((_, i) => { const sfx = i ? i + 1 : ''; ev['grab' + sfx] = dn[1 + i] && dn[1 + i].t; ev['drop' + sfx] = up[1 + i] && up[1 + i].t; });
    ev.launch = dn[1 + info.inv.length] && dn[1 + info.inv.length].t;
    const drags = info.slots.slice(0, info.inv.length).map((S, i) => ({ type: info.inv[i], from: S.map(Math.round), to: info.tgt[i].map(Math.round) }));
    return { level: n, events: ev, drag: { from: drags[0].from, to: drags[0].to }, drags };
  }
}, MOB));

jobs.fxmenu = J(Object.assign({
  anim: true,
  url: BASE + 'game5-flux/?lang=ru', dur: 4, settle: 800,
  ready: async p => { await p.waitForFunction('document.fonts&&document.fonts.status==="loaded"', null, { timeout: 10000 }).catch(() => {}); },
  async run(h) { }
}, MOB));

// ---------- flux-levels: 48 stills ----------
jobs['flux-levels'] = {
  async custom(b, dir) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 700 }, deviceScaleFactor: 2, locale: 'ru-RU' });
    const p = await ctx.newPage();
    await p.goto(BASE + 'game5-flux/?debug&lang=ru', { waitUntil: 'load' });
    await p.waitForFunction('window.__dbg', null, { timeout: 25000 }); await p.waitForTimeout(500);
    for (let lv = 1; lv <= 48; lv++) {
      await p.evaluate(n => __dbg.startCamp(n), lv); await p.waitForTimeout(250);
      await p.evaluate('__dbg.step(0.5); __dbg.solve()'); await p.waitForTimeout(450);
      await p.screenshot({ path: `${dir}/lv${String(lv).padStart(2, '0')}.jpg`, type: 'jpeg', quality: 88, clip: { x: 0, y: 50, width: 390, height: 560 } });
    }
    await ctx.close();
  }
};

// ---------- lava: public product page, seller/profile blurred ----------
const lavaBlur = () => {
  const re = /[\w.+-]+@[\w-]+\.[\w.]+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\bID[:\s#]*\d{4,}/i;
  const blur = e => { e.style.setProperty('filter', 'blur(10px)', 'important'); };
  const apply = () => {
    if (!document.body) return;
    document.querySelectorAll('[class*="accountName"],[class*="avatar" i],[class*="Avatar"],[class*="seller" i],[class*="author" i]').forEach(e => {
      let p = e;
      for (let i = 0; i < 4 && p.parentElement; i++) { const r = p.parentElement.getBoundingClientRect(); if (r.height > 60 || r.width > 320) break; p = p.parentElement; }
      blur(p);
    });
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) { const tg = n.parentElement && n.parentElement.tagName; if (tg && !/^(SCRIPT|STYLE|NOSCRIPT)$/.test(tg) && re.test(n.nodeValue)) blur(n.parentElement); }
    document.querySelectorAll('img').forEach(i => { const r = i.getBoundingClientRect(); if (r.width > 0 && r.width < 90 && r.height < 90 && !/logo|\.svg/i.test(i.src)) blur(i); });
  };
  new MutationObserver(apply).observe(document, { childList: true, subtree: true, characterData: true });
  document.addEventListener('DOMContentLoaded', apply); setInterval(apply, 250);
};
jobs.lava = Object.assign({
  url: process.env.REC_LAVA_URL || 'https://example.com/product', dur: 9, loadInRun: true, init: lavaBlur,
  ready: async p => { await p.waitForFunction('document.body&&/Загрузка|990/.test(document.body.innerText)', null, { timeout: 30000 }).catch(() => { }); },
  accept: (x, st) => x.priceAt != null && st.holdsOver300ms.every(h => h[0] < 2.4 || h[0] > 5.3),
  async run(h) {
    const p = h.p;
    const got = await p.waitForFunction('/990/.test(document.body.innerText)', null, { timeout: 60000 }).then(() => true).catch(() => false);
    const priceAt = got ? +h.t().toFixed(2) : null;
    h.clip = { start: Math.max(0, (priceAt || 0) - 1.2) };
    await h.at(h.clip.start + 2.6);
    const n = 50; for (let i = 0; i < n; i++) { const k = i / (n - 1), d = 1 + 5 * Math.sin(Math.PI * k); await h.wheel(d, 1, 0); await h.sleep(42); }
    await h.sleep(300);
    const price = await p.evaluate(() => { const e = [...document.querySelectorAll('h3')].find(x => /990/.test(x.innerText) && x.getBoundingClientRect().width > 0); if (!e) return null; const r = e.getBoundingClientRect(); return { text: e.innerText, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), scrollY: Math.round(scrollY) }; });
    return { priceAt: +(priceAt - h.clip.start).toFixed(2), price };
  }
}, DESK, { dsf: 1 });

// ---------- ygpay: Yandex Games docs, payout paragraphs ----------
jobs.ygpay = Object.assign({
  url: 'https://yandex.ru/dev/games/doc/ru/payments', dur: 9,
  ready: async p => { await p.waitForFunction('/20\\s+рабочих\\s+дней/.test(document.body.innerText)', null, { timeout: 40000 }); },
  async run(h) {
    const p = h.p;
    const targets = [
      ['li', 'Минимальная сумма в зависимости от валюты договора'],
      ['li', '3000 рублей;'],
      ['p', 'Если порог в текущем месяце:'],
      ['li', 'Достигнут — вы получите вознаграждение в течение 20 рабочих дней следующего месяца.']
    ];
    const geo = () => p.evaluate(tg => {
      const css = el => { const parts = []; while (el && el.nodeType === 1 && el !== document.body) { let s = el.tagName.toLowerCase(); if (el.id) { parts.unshift(s + '#' + el.id); break; } const sib = [...el.parentElement.children].filter(c => c.tagName === el.tagName); if (sib.length > 1) s += ':nth-of-type(' + (sib.indexOf(el) + 1) + ')'; parts.unshift(s); el = el.parentElement; } return parts.join(' > '); };
      return tg.map(([tag, txt]) => { const e = [...document.querySelectorAll(tag)].find(x => x.innerText.trim().replace(/\s+/g, ' ').startsWith(txt) && (txt.length > 30 || x.innerText.trim().replace(/\s+/g, ' ') === txt)); if (!e) return null; const r = e.getBoundingClientRect(); return { text: e.innerText.trim().replace(/\s+/g, ' '), selector: css(e), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.y + scrollY), bottom: Math.round(r.y + r.height + scrollY) }; });
    }, targets);
    const g0 = await geo();
    if (g0.some(x => !x)) throw new Error('paragraph not found: ' + JSON.stringify(g0.map(x => !!x)));
    const vh = 800, y1 = Math.min(...g0.map(x => x.top)), y2 = Math.max(...g0.map(x => x.bottom));
    const dest = Math.round((y1 + y2) / 2 - vh / 2);
    await h.at(0.5);
    const n = 150, total = dest;
    let sent = 0;
    for (let i = 1; i <= n; i++) { const k = i / n, e = k * k * (3 - 2 * k), want = Math.round(total * e), d = want - sent; sent = want; if (d) await h.wheel(d, 1, 0); await h.sleep(26); }
    let prev = -1, stableSince = null;
    for (let i = 0; i < 60; i++) { const y = await p.evaluate('scrollY'); if (y === prev) { if (stableSince == null) stableSince = h.t() - 0.1; if (h.t() - stableSince >= 0.3) break; } else { stableSince = null; prev = y; } await h.sleep(100); }
    const g = await geo();
    const tt = +(stableSince == null ? h.t() : stableSince).toFixed(2);
    return { scrollY: await p.evaluate('Math.round(scrollY)'), marks: g.map(x => ({ text: x.text, selector: x.selector, x: x.x, y: x.y, w: x.w, h: x.h, t: tt })) };
  }
}, DESK);

module.exports = jobs;
