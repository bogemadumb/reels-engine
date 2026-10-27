// shared building blocks for desktop-cinema clips: windows, phones, cards, mock UIs (all drawn by the engine, no real accounts on screen)
(function () {
const { clamp, lerp, ease, spring, rnd } = C;
const COL = S.COL, INK = COL.INK, COB = COL.COB, CY = COL.CY, PK = COL.PK, CO = COL.CO;
const P = window.P = {};
const f = n => Number(n).toFixed(2);

P.tb = url => `<div class="tb"><div class="dot" style="background:#FF5F57"></div><div class="dot"></div><div class="dot"></div><div class="url">${url || ''}</div></div>`;
P.winHTML = ({ w, h, url, body, bar = true, bg = '#fff' }) => `<div class="win" style="width:${w}px;height:${h}px;display:flex;flex-direction:column;background:${bg}">${bar ? P.tb(url) : ''}<div class="cnt" style="flex:1;position:relative;background:${bg}">${body || ''}</div></div>`;
P.win = (id, o, pose) => S.add(id, P.winHTML(o), o.w, o.h, pose || {});
P.seqImg = (name, o = {}) => `<img class="seq" data-seq="${name}" data-t0="${o.t0 || 0}" data-rate="${o.rate || 1}" data-off="${o.off || 0}" data-loop="${o.loop ? 1 : 0}"${o.curve ? ` data-curve="${o.curve}"` : ''} style="${o.style || ''}">`;
P.phoneHTML = ({ w = 400, h = 820, seq, t0 = 0, rate = 1, loop = 0, off = 0, curve, img, inner }) => `<div class="phone" style="width:${w}px;height:${h}px"><div class="scr" style="width:${w - 40}px;height:${h - 40}px"><div class="isl"></div>${inner || (seq ? P.seqImg(seq, { t0, rate, loop, off, curve }) : `<img src="${img}">`)}</div></div>`;
P.phone = (id, o, pose) => S.add(id, P.phoneHTML(o), o.w || 400, o.h || 820, pose || {});
P.card = (id, html, w, h, pose, extraStyle) => S.add(id, `<div class="card" style="width:${w}px;height:${h}px;position:relative;${extraStyle || ''}">${html}</div>`, w, h, pose || {});
P.redact = (w, h, r) => `<span style="display:inline-block;vertical-align:middle;width:${w}px;height:${h}px;border-radius:${r == null ? h / 2 : r}px;background:linear-gradient(90deg,#C5CCE0,#DDE2F0);filter:blur(5px)"></span>`;
P.blurText = (txt, px) => `<span style="filter:blur(${px || 7}px)">${txt}</span>`;
P.btn = (text, o = {}) => `<div style="display:flex;align-items:center;justify-content:center;width:${o.w || 'auto'}px;height:${o.h || 84}px;padding:0 ${o.pad == null ? 40 : o.pad}px;border-radius:${o.r || 22}px;background:${o.bg || '#D9DDE8'};color:${o.fg || '#8A90A4'};font:800 ${o.fs || 30}px 'Manrope';white-space:nowrap;${o.shadow ? 'box-shadow:0 10px 24px rgba(20,22,60,.2);' : ''}">${text}</div>`;

// ---- small inline icons
const ICON = {
  lock: (c = INK) => `<svg viewBox="0 0 64 64" width="100%" height="100%"><rect x="12" y="28" width="40" height="30" rx="8" fill="${c}"/><path d="M20 28v-8a12 12 0 0 1 24 0v8" fill="none" stroke="${c}" stroke-width="7" stroke-linecap="round"/><circle cx="32" cy="43" r="4.5" fill="#fff"/></svg>`,
  check: (c = '#12B886') => `<svg viewBox="0 0 64 64" width="100%" height="100%"><circle cx="32" cy="32" r="30" fill="${c}"/><path d="M18 33l9 9 19-20" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  cross: (c = CO) => `<svg viewBox="0 0 64 64" width="100%" height="100%"><circle cx="32" cy="32" r="30" fill="${c}"/><path d="M21 21l22 22M43 21L21 43" stroke="#fff" stroke-width="8" stroke-linecap="round"/></svg>`,
  dots: (c = '#9AA1B8') => `<svg viewBox="0 0 64 64" width="100%" height="100%"><circle cx="32" cy="32" r="30" fill="${c}"/><circle cx="19" cy="32" r="4.5" fill="#fff"/><circle cx="32" cy="32" r="4.5" fill="#fff"/><circle cx="45" cy="32" r="4.5" fill="#fff"/></svg>`,
  heart: (c = '#E5232F') => `<svg viewBox="0 0 64 64" width="100%" height="100%"><path d="M32 56C10 40 6 28 6 20a14 14 0 0 1 26-7 14 14 0 0 1 26 7c0 8-4 20-26 36z" fill="${c}"/></svg>`,
  warn: (c = CO) => `<svg viewBox="0 0 64 64" width="100%" height="100%"><path d="M32 6L60 56H4z" fill="${c}" stroke="${c}" stroke-width="6" stroke-linejoin="round"/><rect x="29" y="22" width="6" height="18" rx="3" fill="#fff"/><circle cx="32" cy="48" r="3.6" fill="#fff"/></svg>`,
  flag: (c = COB) => `<svg viewBox="0 0 64 64" width="100%" height="100%"><rect x="12" y="6" width="6" height="54" rx="3" fill="${INK}"/><path d="M18 8h34l-9 12 9 12H18z" fill="${c}"/></svg>`,
  arrow: (c = INK) => `<svg viewBox="0 0 120 64" width="100%" height="100%"><path d="M6 32h96M76 10l26 22-26 22" fill="none" stroke="${c}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  hour: (c = '#9AA1B8') => `<svg viewBox="0 0 64 64" width="100%" height="100%"><path d="M16 6h32M16 58h32M20 6c0 16 24 18 24 26S20 42 20 58M44 6c0 16-24 18-24 26s24 10 24 26" fill="none" stroke="${c}" stroke-width="6" stroke-linecap="round"/></svg>`,
  tee: (c = '#fff', o = 0) => `<svg viewBox="0 0 120 110" width="100%" height="100%"><path d="M38 6l-32 18 12 22 14-7v57h64V39l14 7 12-22L82 6c-4 10-12 15-22 15S42 16 38 6z" fill="${c}" stroke="#C9CEDD" stroke-width="3" stroke-linejoin="round"/></svg>`
};
P.icon = (n, c) => ICON[n](c);
P.iconBox = (n, c, s = 56) => `<span style="display:inline-block;width:${s}px;height:${s}px;vertical-align:middle">${ICON[n](c)}</span>`;

// ---- stamp item (red, drops with bounce)
P.stamp = (id, text, o = {}) => {
  const w = o.w || 560, h = o.h || 150, c = o.color || CO;
  const html = `<div style="width:${w}px;height:${h}px;border:12px solid ${c};border-radius:26px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;color:${c};font:900 ${o.fs || 72}px 'Unbounded';letter-spacing:2px;background:rgba(255,255,255,.55);transform:rotate(${o.tilt || 0}deg)">${text}</div>`;
  return S.add(id, html, w, h, Object.assign({ from: { y: (o.at ? o.at.y : 0) - 420, z: 380, s: 1.7, op: 0, rz: (o.at ? o.at.rz || 0 : 0) + 18 }, f: 2.8, zz: 0.38, float: 0 }, o.item || {}, { at: o.at, spawn: o.spawn }));
};

// ---- counter card: big number + unit
P.big = (id, text, o = {}) => {
  const w = o.w || 520, h = o.h || 330;
  const html = `<div class="card" style="width:${w}px;height:${h}px;display:flex;align-items:center;justify-content:center;position:relative;flex-direction:column">
    ${o.top ? `<div style="position:absolute;left:36px;top:30px;width:${w - 72}px;font:800 26px 'Manrope';color:#8A90A4;display:flex;align-items:center;gap:14px"><span style="width:44px;height:44px;border-radius:50%;background:${COB};color:#fff;display:inline-flex;align-items:center;justify-content:center;font:900 26px 'Unbounded'">₽</span>${o.top}</div>` : ''}
    <div class="bignum" style="font:900 ${o.fs || 200}px/1 'Unbounded';color:${o.color || INK};margin-top:${o.top ? 30 : 0}px">${text}</div>
    ${o.sub ? `<div style="position:absolute;left:0;right:0;bottom:30px;text-align:center;font:700 26px 'Manrope';color:#8A90A4">${o.sub}</div>` : ''}
  </div>`;
  return S.add(id, html, w, h, o.item || {});
};

// ---- journal card typed by the engine (not the real file)
P.journal = (id, title, rows, o = {}) => {
  const w = o.w || 880, rh = o.rh || 92, h = 130 + rows.length * rh + 40;
  const html = `<div class="win" style="width:${w}px;height:${h}px;background:#14151C;position:relative">
   <div style="height:72px;display:flex;align-items:center;padding:0 28px;gap:12px;background:#1E2029"><div class="dot" style="background:#FF5F57"></div><div class="dot" style="background:#3A3D4B"></div><div class="dot" style="background:#3A3D4B"></div><span class="mono" style="margin-left:18px;color:#8F94AB;font:700 24px 'JBMono'">${title}</span></div>
   <div style="padding:26px 34px">${rows.map((r, i) => `<div class="jr" data-i="${i}" style="position:relative;height:${rh}px;display:flex;align-items:center;font:600 ${o.fs || 34}px 'JBMono';color:#C9CDE0;padding:0 18px;border-radius:16px;margin-bottom:0"><i class="jh" style="position:absolute;left:0;top:8px;bottom:8px;width:0;border-radius:14px;background:${o.hi || COB};opacity:.95"></i><span style="position:relative;z-index:1" class="jt">${r}</span></div>`).join('')}</div>
  </div>`;
  return { html, w, h };
};
// highlight scheduling for journal rows: hl = [{i, t0, t1}]
P.journalUpd = hl => (t, el) => {
  const rows = el.querySelectorAll('.jr');
  rows.forEach((r, i) => {
    let u = 0;
    for (const k of hl) if (k.i === i) { const a = spring(t, k.t0, 3.4, 0.8), b = t > k.t1 ? clamp((t - k.t1) / 0.25) : 0; u = Math.max(u, a * (1 - b)); }
    const bar = r.querySelector('.jh'), tx = r.querySelector('.jt');
    bar.style.width = f(u * r.clientWidth) + 'px'; tx.style.color = u > 0.5 ? '#fff' : '#C9CDE0';
  });
};

// ---- moderator-style chat window (drawn). heart: red heart at the end of the last answer
P.chatHTML = ({ w = 760, h = 700, heart = false, reply = true, fs = 26, hl = null }) => {
  const mod = `Спасибо, что прислали материал. Мы ожидаем материал с <span class="hqc" style="background:linear-gradient(${CO},${CO}) no-repeat;background-size:0% 42%;background-position:0 92%">более высоким <span class="hqa" style="background:linear-gradient(${CO},${CO}) no-repeat;background-size:0% 42%;background-position:0 92%">качеством</span></span> и <span class="hqb" style="background:linear-gradient(${CO},${CO}) no-repeat;background-size:0% 42%;background-position:0 92%">визуальным стилем</span>, чтобы его смотрели до конца. Пожалуйста, не расстраивайтесь из-за этого замечания${heart ? ' <span style="display:inline-block;width:' + (fs + 4) + 'px;height:' + (fs + 4) + 'px;vertical-align:-4px">' + ICON.heart() + '</span>' : ''}`;
  return `<div class="win" style="width:${w}px;height:${h}px;background:#F4F6FB;display:flex;flex-direction:column">
   <div style="height:84px;background:#fff;display:flex;align-items:center;padding:0 26px;gap:16px;border-bottom:2px solid #E6E8EE;flex:none"><div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#C5CCE0,#DDE2F0);filter:blur(4px)"></div><div><div style="font:800 26px 'Manrope';color:${INK}">GamePush · модерация</div><div style="font:600 18px 'Manrope';color:#8A90A4">чат по заявке ${P.redact(120, 18, 9)}</div></div></div>
   <div style="flex:1;padding:24px 26px;display:flex;flex-direction:column;gap:18px;overflow:hidden">
     <div style="align-self:flex-end;background:${COB};color:#fff;border-radius:26px 26px 6px 26px;padding:16px 22px;font:700 ${fs - 4}px/1.35 'Manrope';max-width:62%">Заявка на дистрибуцию игры ${P.redact(130, fs - 6, 8)}</div>
     <div style="align-self:flex-start;background:#fff;border-radius:26px 26px 26px 6px;padding:20px 26px;font:700 ${fs}px/1.4 'Manrope';color:${INK};max-width:90%;box-shadow:0 4px 12px rgba(20,22,60,.08)" class="modmsg">${mod}</div>
   </div></div>`;
};

// ---- Yandex-console-like window (drawn, ids blurred)
P.consoleHTML = ({ w = 900, h = 720, banner = false, tip = false, contract = false }) => {
  const rh = contract ? 76 : 92;
  const games = [['Merge-кликер', 'game1'], ['Block Blitz', 'game2'], ['Сортировка шаров', 'game3'], ['Shawarma Tycoon', 'game4']];
  return `<div class="win" style="width:${w}px;height:${h}px;background:#F6F7FB;display:flex;flex-direction:column;position:relative">
    ${P.tb('games.yandex.ru/console')}
    ${banner ? `<div class="bn" style="height:76px;flex:none;background:#FFE9E6;color:#B3261E;display:flex;align-items:center;padding:0 28px;font:800 24px 'Manrope';gap:14px"><span style="width:38px;height:38px;display:inline-block">${ICON.warn()}</span>Возможны сбои после пожара в ДЦ</div>` : ''}
    <div style="padding:22px 28px;flex:1;display:flex;flex-direction:column;gap:14px">
      <div style="font:900 34px 'Unbounded';color:${INK}">Мои игры</div>
      ${games.map(g => `<div style="height:${rh}px;border-radius:22px;background:#fff;display:flex;align-items:center;padding:0 22px;gap:20px;box-shadow:0 3px 8px rgba(20,22,60,.07)"><img src="/cinema/media/icons/${g[1]}.png" style="width:${rh - 32}px;height:${rh - 32}px;border-radius:16px"><div style="font:800 26px 'Manrope';color:${INK};flex:1">${g[0]}</div><div style="font:600 18px 'JBMono'">${P.redact(120, 22, 11)}</div><div style="font:800 20px 'Manrope';color:#8A90A4;background:#EEF0F6;border-radius:14px;padding:8px 16px">Черновик</div></div>`).join('')}
      ${contract ? `<div style="height:74px;border-radius:22px;background:#fff;display:flex;align-items:center;padding:0 26px;gap:16px;box-shadow:0 3px 8px rgba(20,22,60,.07);font:700 24px 'Manrope';color:#6B7083"><span style="width:44px;height:44px;display:inline-block;flex:none">${ICON.hour()}</span><span>Договор по ЕЛС: подписание <span class=\"ss\" style=\"position:relative;color:${INK};font-weight:800;padding:4px 10px;display:inline-block\">со стороны Яндекса<i class=\"sdf\" style=\"position:absolute;left:-4px;top:-2px;right:-4px;bottom:-2px;border:4px dashed ${CO};border-radius:14px;opacity:0\"></i></span></span></div>` : ''}
      <div style="margin-top:auto;display:flex;justify-content:flex-end;align-items:center;gap:16px;position:relative" class="cbtn"><div style="position:absolute;right:0;bottom:104px;background:${INK};color:#fff;border-radius:18px;padding:16px 22px;font:700 22px/1.3 'Manrope';width:460px;opacity:${tip ? 1 : 0};transform:translateY(${tip ? 0 : 10}px)" class="tip">Отправить на модерацию можно после заключения договора по ЕЛС или РСЯ</div>${P.btn('Отправить на модерацию', { bg: '#D9DEE9', fg: '#8E94A8', h: 78, fs: 26 })}</div>
    </div></div>`;
};

// ---- tee/print tile (print image on a mock tee card)
P.printTile = (file, size = 200, extra = '') => `<img src="/cinema/media/prints/${file}" style="width:${size}px;height:${size}px;object-fit:cover;border-radius:${size * 0.12}px;background:#fff;box-shadow:0 2px 4px rgba(20,22,40,.12),0 14px 28px rgba(20,22,60,.2);${extra}">`;
P.iconTile = (game, size = 190, ring) => `<div style="position:relative;width:${size}px;height:${size}px"><img src="/cinema/media/icons/${game}.png" style="width:100%;height:100%;border-radius:${size * 0.24}px;border:7px solid #fff;box-sizing:border-box;box-shadow:0 2px 4px rgba(20,22,40,.12),0 20px 40px rgba(20,22,60,.25)">${ring ? `<div class="ring" style="position:absolute;left:-14px;top:-14px;right:-14px;bottom:-14px;border:10px solid ${CO};border-radius:${size * 0.3}px;opacity:0"></div>` : ''}</div>`;

// ---- timeline bar 10.10 -> 09.11 (31 days). o.fill(t) -> {upTo:0..31, flag:0..1 position (can exceed 1), hatch: from..to days}
P.timelineHTML = (w, h, o = {}) => {
  const days = 31, pad = 46, bw = w - pad * 2 - 62, bh = 62, by = h / 2 - 10;
  let ticks = '';
  for (let i = 0; i <= days; i++) { const x = pad + bw * i / days; ticks += `<rect x="${x - 1.5}" y="${by + bh + 8}" width="3" height="${i % 5 === 0 ? 20 : 10}" fill="#B5BBCD"/>`; }
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="overflow:visible"><defs><pattern id="hatch${o.id || ''}" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="16" height="16" fill="#FFE1DC"/><rect width="8" height="16" fill="#FF9C8E"/></pattern></defs>
   <rect x="${pad}" y="${by}" width="${bw}" height="${bh}" rx="${bh / 2}" fill="#E6E9F2"/>
   <rect class="tfill" x="${pad}" y="${by}" width="0" height="${bh}" rx="${bh / 2}" fill="${o.fillColor || '#8F96AE'}"/>
   <rect class="thatch" x="${pad}" y="${by}" width="0" height="${bh}" fill="url(#hatch${o.id || ''})"/>
   ${ticks}
   <text x="${pad}" y="${by + bh + 78}" font-size="30" font-weight="800" fill="${INK}" style="font-family:'Manrope'">10.10</text>
   <text x="${pad + bw}" y="${by + bh + 78}" font-size="30" font-weight="800" fill="${INK}" text-anchor="end" style="font-family:'Manrope'">09.11</text>
   <g class="tflag" transform="translate(${pad + bw},${by - 12})"><g transform="translate(-4 -86) scale(1.5)"><g transform="translate(0 0)"><rect x="0" y="0" width="5" height="56" rx="2.5" fill="${INK}"/><path d="M5 2h40l-10 14 10 14H5z" fill="${o.flagColor || COB}"/></g></g><text class="tfl" x="-10" y="-60" font-size="34" font-weight="900" fill="${INK}" text-anchor="end" style="font-family:'Manrope'"></text></g>
  </svg>`;
};
P.timelineUpd = (w, h0, fn) => {
  const days = 31, pad = 46, bw = w - pad * 2 - 62, by = h0 / 2 - 10;
  return (t, el) => {
    const s = fn(t);
    const fl = el.querySelector('.tfill'); fl.setAttribute('width', f(bw * clamp(s.fill || 0, 0, days) / days));
    const h = el.querySelector('.thatch');
    if (s.hatch) { const x0 = pad + bw * s.hatch[0] / days, x1 = pad + bw * s.hatch[1] / days; h.setAttribute('x', f(x0)); h.setAttribute('width', f(Math.max(0, x1 - x0))); } else h.setAttribute('width', 0);
    const fg = el.querySelector('.tflag'); const fy = s.flagY || 0;
    fg.setAttribute('transform', `translate(${f(pad + bw * s.flag)},${f(by - 12 + fy)})`);
    fg.style.display = s.flagHide ? 'none' : '';
    fg.querySelector('.tfl').textContent = s.label || '';
  };
};
// scatter blurred game-icon tiles over a region, avoiding given points ([x,y,r])
P.decor = (n, x0, y0, x1, y1, avoid, o = {}) => {
  const games = ['game1', 'game2', 'game3', 'game4', 'game5'];
  let k = 0, placed = 0;
  while (placed < n && k < n * 40) {
    const r1 = rnd(k * 3.1 + (o.seed || 0)), r2 = rnd(k * 5.7 + 1 + (o.seed || 0)), r3 = rnd(k * 7.3 + 2);
    k++;
    const x = x0 + r1 * (x1 - x0), y = y0 + r2 * (y1 - y0);
    if ((avoid || []).some(([ax, ay, ar]) => Math.hypot(x - ax, y - ay) < ar)) continue;
    const sz = 120 + Math.floor(r3 * 80), g = games[placed % games.length];
    S.add('dec' + (o.prefix || '') + placed, P.iconTile(g, sz), sz, sz, { at: { x, y, z: -160 + r3 * 110, ry: r1 * 20 - 10, rz: r2 * 16 - 8 }, spawn: 0.2 + placed * 0.05, deco: true });
    placed++;
  }
};
P.platCard = (id, title, status, pose, o = {}) => S.add(id, `<div class="card" style="width:440px;height:290px;border-radius:36px;padding:34px;box-sizing:border-box;position:relative;overflow:hidden"><div style="position:absolute;left:0;top:0;right:0;height:16px;background:${o.band || COB}"></div><div style="font:900 38px 'Unbounded';color:${INK};margin-top:14px">${title}</div><div style="margin-top:26px;display:inline-block;font:800 26px 'Manrope';color:${INK};background:${o.chip || '#EEF1F8'};border-radius:18px;padding:12px 22px">${status}</div><div style="position:absolute;left:34px;bottom:34px;right:34px;height:14px;border-radius:7px;background:#EEF1F8"></div><div style="position:absolute;left:34px;bottom:34px;width:${o.prog || 60}px;height:14px;border-radius:7px;background:${o.band || COB}"></div></div>`, 440, 290, pose);

// moderator chat with the answer split in three lines (for the "advice at the end" reveal)
P.modChat = ({ w = 560, h = 560, fs = 24, heart = false, mask = true }) => {
  const hl = `background:linear-gradient(${CO},${CO}) no-repeat;background-size:0% 42%;background-position:0 92%`;
  return `<div class="win" style="width:${w}px;height:${h}px;background:#F4F6FB;display:flex;flex-direction:column">
   <div style="height:${Math.round(fs * 3.1)}px;background:#fff;display:flex;align-items:center;padding:0 ${fs}px;gap:${fs * 0.6}px;border-bottom:2px solid #E6E8EE;flex:none"><div style="width:${fs * 1.8}px;height:${fs * 1.8}px;border-radius:50%;background:linear-gradient(135deg,#C5CCE0,#DDE2F0);filter:blur(3px)"></div><div><div style="font:800 ${fs}px 'Manrope';color:${INK}">GamePush · модерация</div><div style="font:600 ${fs * 0.7}px 'Manrope';color:#8A90A4">заявка ${P.redact(fs * 4, fs * 0.7, 6)}</div></div></div>
   <div style="flex:1;padding:${fs}px;display:flex;flex-direction:column;gap:${fs * 0.7}px;overflow:hidden">
     <div style="align-self:flex-end;background:${COB};color:#fff;border-radius:${fs}px ${fs}px 6px ${fs}px;padding:${fs * 0.6}px ${fs * 0.9}px;font:700 ${fs * 0.85}px/1.3 'Manrope'">Заявка: игра ${P.redact(fs * 4, fs * 0.8, 8)}</div>
     <div style="align-self:flex-start;background:#fff;border-radius:${fs}px ${fs}px ${fs}px 6px;padding:${fs * 0.8}px ${fs}px;font:700 ${fs}px/1.4 'Manrope';color:${INK};max-width:96%;box-shadow:0 4px 12px rgba(20,22,60,.08)">
       <div class="ln1">Спасибо, что прислали материал.</div>
       <div class="ln2" style="margin-top:${fs * 0.4}px">Мы ожидаем материал с <span class="hqa" style="${hl}">качеством</span> и <span class="hqb" style="${hl}">визуальным стилем</span>, чтобы его смотрели до конца.</div>
       <div class="ln3" style="margin-top:${fs * 0.4}px;position:relative"><span class="ln3t" style="display:inline-block;${mask ? 'filter:blur(7px)' : ''}">Пожалуйста, <span class="hqn" style="${hl}">не расстраивайтесь</span> из-за этого замечания<span class="hrt" style="display:${heart ? 'inline-block' : 'none'};width:${fs + 4}px;height:${fs + 4}px;vertical-align:-4px;margin-left:8px">${ICON.heart()}</span></span>${mask ? `<span class="lnm" style="position:absolute;left:0;top:0;right:0;bottom:0;border-radius:12px;background:rgba(255,255,255,.55);display:flex;align-items:center;justify-content:center;font:900 ${fs * 0.8}px 'Unbounded';color:${INK}">СОВЕТ — В КОНЦЕ</span>` : ''}</div>
     </div></div></div>`;
};

})();
