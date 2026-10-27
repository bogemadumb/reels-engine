'use strict';
(function () {
  const W = 1080, H = 1920;
  const SCENE_W = 936, SCENE_H = 820;
  const MIN_LABEL_PX = 44;
  const ISSUES = [];

  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, p) => a + (b - a) * p;
  const prog = (t, s, d) => (d <= 0 ? (t >= s ? 1 : 0) : clamp((t - s) / d));
  const ease = {
    outCubic: p => 1 - Math.pow(1 - p, 3),
    inCubic: p => p * p * p,
    inOutCubic: p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
    outExpo: p => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p)),
    outQuint: p => 1 - Math.pow(1 - p, 5),
    outBack: p => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); }
  };

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const hashRand = n => mulberry32((n * 2654435761) >>> 0)();

  function el(tag, cls, parent, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function parseMarked(text) {
    const out = [];
    let acc = false;
    String(text).split('\n').forEach((line, li) => {
      if (li > 0) out.push({ br: true });
      for (let w of line.split(/\s+/).filter(Boolean)) {
        let closes = false;
        if (w.startsWith('*')) { acc = true; w = w.slice(1); }
        const m = w.match(/^(.*)\*([.,!?:;…»)]+)$/);
        if (m) { w = m[1] + m[2]; closes = true; } else if (w.endsWith('*')) { w = w.slice(0, -1); closes = true; }
        if (w) out.push({ word: w, accent: acc });
        if (closes) acc = false;
      }
    });
    return glue(out);
  }
  function glue(toks) {
    const out = [];
    toks.forEach((t, i) => {
      const prev = out[out.length - 1];
      const isLast = !toks[i + 1] || toks[i + 1].br;
      if (prev && !prev.br && !t.br && (/^[—–-]$/.test(t.word) || (isLast && t.word.length <= 2 && prev.accent === t.accent))) {
        prev.word += '\u00a0' + t.word;
        return;
      }
      if (prev && !prev.br && !t.br && prev.glueNext && prev.accent === t.accent) {
        prev.word += '\u00a0' + t.word; prev.glueNext = false;
        return;
      }
      const c = Object.assign({}, t);
      if (!c.br && c.word.length <= 2 && /^[А-ЯЁа-яёA-Za-z]+$/.test(c.word) && !isLast) c.glueNext = true;
      out.push(c);
    });
    return out;
  }
  function richHTML(text) {
    return parseMarked(text).map(t => (t.br ? '<br>' : t.accent ? `<span class="accent">${esc(t.word)}</span>` : esc(t.word))).join(' ').replace(/ <br> /g, '<br>');
  }
  const stripMarks = s => String(s).replace(/\*/g, '');

  function fitFont(node, maxW, maxH, start, min) {
    let size = start;
    node.style.fontSize = size + 'px';
    const tooBig = () => node.scrollHeight > maxH || node.scrollWidth > maxW + 1 ||
      Array.from(node.querySelectorAll('.w')).some(w => w.offsetWidth > maxW);
    while (tooBig() && size > min) { size -= 3; node.style.fontSize = size + 'px'; }
    return size;
  }

  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(',');
  }

  function svgIcon(name, cls) {
    const body = (window.ICONS || {})[name] || window.ICONS.bolt;
    return `<svg class="${cls || ''}" viewBox="0 0 24 24">${body}</svg>`;
  }

  const SCENES = {};

  SCENES.headline = function (s, root, ctx) {
    const box = el('div', 'hl' + (s.align === 'center' ? ' center' : ''), root);
    const kick = s.kicker ? el('div', 'kicker', box, esc(s.kicker)) : null;
    const textEl = el('div', 'hl-text', box);
    const toks = parseMarked(s.text || '');
    const words = [];
    toks.forEach(t => {
      if (t.br) { el('br', null, textEl); return; }
      const w = el('span', 'w' + (t.accent ? (s.marker ? ' marker' : ' accent') : ''), textEl, esc(t.word));
      words.push(w);
      textEl.appendChild(document.createTextNode(' '));
    });
    const sub = s.sub ? el('div', 'hl-sub', box, richHTML(s.sub)) : null;
    const reserved = (kick ? 120 : 0) + (sub ? sub.offsetHeight + 40 : 0);
    fitFont(textEl, SCENE_W, SCENE_H - reserved - 20, s.size || 128, 48);

    const t0 = s.startAt != null ? s.startAt : (ctx.index === 0 ? 0.04 : 0.28);
    const kickDur = kick ? 0.18 : 0;
    const n = Math.max(1, words.length);
    const stagger = s.stagger != null ? s.stagger : clamp((ctx.dur * 0.42) / n, 0.07, 0.17);
    const times = words.map((_, i) => t0 + kickDur + i * stagger);
    times.forEach(t => ctx.event(t, 'pop'));
    const subT = times.length ? times[times.length - 1] + 0.3 : t0;
    if (kick) ctx.event(t0, 'pop');

    return {
      update(lt) {
        if (kick) {
          const p = prog(lt, t0, 0.3);
          kick.style.opacity = clamp(p * 3);
          kick.style.transform = `scale(${lerp(0.6, 1, ease.outBack(p))})`;
        }
        words.forEach((w, i) => {
          const p = prog(lt, times[i], 0.34);
          const sc = 1 + 0.75 * (1 - ease.outBack(p));
          w.style.opacity = clamp(p * 4);
          w.style.transform = `translateY(${(1 - ease.outCubic(p)) * 26}px) scale(${sc})`;
        });
        if (sub) {
          const p = prog(lt, subT, 0.4);
          sub.style.opacity = ease.outCubic(p);
          sub.style.transform = `translateY(${(1 - ease.outCubic(p)) * 30}px)`;
        }
        textEl.style.transform = `scale(${1 + 0.03 * ease.inOutCubic(prog(lt, 0, ctx.dur))})`;
      }
    };
  };

  SCENES.counter = function (s, root, ctx) {
    const box = el('div', 'ctr', root);
    const label = s.label ? el('div', 'ctr-label', box, richHTML(s.label)) : null;
    const prefix = s.prefix ? el('div', 'ctr-prefix', box, richHTML(s.prefix)) : null;
    const numEl = el('div', 'ctr-num', box);
    const numSpan = el('span', null, numEl, '0');
    if (s.unit) el('span', 'unit', numEl, esc(s.unit));
    const sub = s.sub ? el('div', 'ctr-sub', box, richHTML(s.sub)) : null;
    const stamp = s.stamp ? el('div', 'stamp', root, esc(s.stamp)) : null;

    const from = Number(s.from || 0), to = Number(s.to || 0);
    const fmt = v => Math.round(v).toLocaleString('ru-RU').replace(/ /g, ' ');
    numSpan.textContent = fmt(Math.max(Math.abs(from), Math.abs(to), s.roll ? 888 : 0));
    const maxNumW = SCENE_W;
    let size = s.size || 300;
    numEl.style.fontSize = size + 'px';
    while (numEl.scrollWidth > maxNumW && size > 80) { size -= 8; numEl.style.fontSize = size + 'px'; }

    const tStart = s.startAt != null ? s.startAt : 0.5;
    const countDur = s.countDur != null ? s.countDur : 1.4;
    const tLand = tStart + countDur;
    const roll = s.roll || from === to;
    for (let t = tStart; t < tLand; t += roll ? 0.067 : 0.08) ctx.event(t, 'key');
    ctx.event(tLand, 'hit');
    if (label) ctx.event(0.15, 'pop');
    const stampT = tLand + 0.45;
    if (stamp) {
      ctx.event(stampT, 'hit');
      stamp.style.right = (s.stampRight != null ? s.stampRight : 10) + 'px';
      stamp.style.top = (s.stampTop != null ? s.stampTop : 120) + 'px';
    }

    return {
      update(lt) {
        const pin = (el2, t) => {
          if (!el2) return;
          const p = prog(lt, t, 0.4);
          el2.style.opacity = ease.outCubic(p);
          el2.style.transform = `translateY(${(1 - ease.outCubic(p)) * 40}px)`;
        };
        pin(label, 0.1); pin(prefix, 0.25); pin(sub, tLand + 0.2);
        if (sub && s.blink && lt > tLand + 0.8) sub.style.opacity = Math.floor(lt * 2.4) % 2 === 0 ? 1 : 0.15;
        let v;
        if (lt < tStart) v = from;
        else if (lt >= tLand) v = to;
        else if (roll) {
          const q = Math.floor(lt * 15);
          const mag = Math.max(1, Math.abs(s.rollMax || 999));
          v = Math.floor(hashRand(q + 17) * mag);
        } else v = lerp(from, to, ease.outExpo(prog(lt, tStart, countDur)));
        numSpan.textContent = fmt(v);
        const pn = prog(lt, 0, 0.4);
        const land = prog(lt, tLand, 0.35);
        const punch = lt >= tLand ? 1 + 0.22 * (1 - ease.outCubic(land)) : 1;
        numEl.style.opacity = ease.outCubic(pn);
        numEl.style.transform = `scale(${lerp(0.7, 1, ease.outBack(pn)) * punch})`;
        if (lt >= tLand && lt < tLand + 0.25) {
          const k = Math.floor(lt * 60);
          root.style.translate = `${(hashRand(k) - 0.5) * 18}px ${(hashRand(k + 99) - 0.5) * 18}px`;
        } else root.style.translate = '0 0';
        if (stamp) {
          const p = prog(lt, stampT, 0.22);
          stamp.style.opacity = p > 0 ? 1 : 0;
          stamp.style.transform = `rotate(-8deg) scale(${lerp(2.4, 1, ease.outCubic(p))})`;
        }
      }
    };
  };

  SCENES.terminal = function (s, root, ctx) {
    const wrap = el('div', 'term-wrap', root);
    if (s.kicker) el('div', 's-kick', wrap, esc(s.kicker));
    if (s.title) el('div', 's-title', wrap, richHTML(s.title));
    const win = el('div', 'win', wrap);
    const bar = el('div', 'win-bar', win, '<b style="background:#FF5F57"></b><b style="background:#FEBC2E"></b><b style="background:#28C840"></b>');
    el('span', null, bar, esc(s.windowTitle || 'zsh'));
    const body = el('div', 'term-body', win);
    body.style.height = (s.height || 560) + 'px';
    const inner = el('div', 'term-in', body);
    const cps = s.cps || 26;
    let c = s.startAt != null ? s.startAt : 0.45;
    const lines = [];
    (s.lines || []).forEach(l => {
      if (l.pause) { c += l.pause; return; }
      if (l.cmd != null) {
        const d = el('div', 'tl', inner);
        el('span', 'pr', d, esc(s.prompt || '$ '));
        const txt = el('span', null, d);
        const dur = l.cmd.length / cps;
        lines.push({ d, txt, cmd: l.cmd, t0: c, t1: c + dur });
        for (let k = 0; k < l.cmd.length; k += 2) ctx.event(c + k / cps, 'key');
        c += dur + 0.25;
      } else {
        const d = el('div', 'tl' + (l.tone ? ' ' + l.tone : ''), inner, esc(l.out || ''));
        lines.push({ d, t0: c, t1: c });
        if (l.tone === 'err') ctx.event(c, 'fail');
        else if (l.tone === 'ok') ctx.event(c, 'tick');
        c += l.gap != null ? l.gap : 0.3;
      }
    });
    const cursor = el('span', 'cursor');
    return {
      update(lt) {
        let last = null;
        lines.forEach(L => {
          const vis = lt >= L.t0;
          L.d.style.display = vis ? '' : 'none';
          if (!vis) return;
          if (L.cmd != null) {
            const n = clamp(Math.floor((lt - L.t0) * cps), 0, L.cmd.length);
            L.txt.textContent = L.cmd.slice(0, n);
          }
          last = L;
        });
        if (last) {
          const typing = last.cmd != null && lt < last.t1;
          cursor.style.opacity = typing || Math.floor(lt * 2.4) % 2 === 0 ? 1 : 0;
          (last.txt || last.d).appendChild(cursor);
        }
        const over = inner.scrollHeight - (body.clientHeight - 68);
        inner.style.transform = `translateY(${-Math.max(0, over)}px)`;
      }
    };
  };

  SCENES.chat = function (s, root, ctx) {
    let top = 0;
    if (s.title) {
      const t = el('div', 's-title chat-title', root, richHTML(s.title));
      top = t.offsetHeight + 30;
    }
    const chat = el('div', 'chat', root);
    chat.style.top = top + 'px';
    const head = el('div', 'chat-head', chat);
    el('div', 'ava', head, esc(s.aiAvatar || 'ИИ'));
    el('div', null, head, `<div class="chat-name">${esc(s.aiName || 'ИИ')}</div><div class="chat-status">${esc(s.status || 'в сети')}</div>`);
    const area = el('div', 'chat-area', chat);
    const list = el('div', 'chat-list', area);
    const msgs = s.messages || [];
    let c = s.startAt != null ? s.startAt : 0.35;
    const rows = msgs.map(m => {
      const who = m.from === 'human' ? 'human' : 'ai';
      const row = el('div', 'row ' + who, list);
      let typing = null;
      if (who === 'ai' && m.typing !== false) typing = el('div', 'typing', row, '<i></i><i></i><i></i>');
      const bub = el('div', 'bub', row, richHTML(m.text));
      const tType = c;
      const tShow = m.at != null ? m.at : (typing ? c + (m.typingDur || 0.6) : c);
      c = tShow + Math.max(0.6, stripMarks(m.text).length * 0.034) + 0.15;
      return { row, typing, bub, tType: typing ? Math.min(tType, tShow - 0.3) : tShow, tShow };
    });
    const total = c;
    const limit = ctx.dur - 0.5;
    if (total > limit && s.autoFit !== false) {
      const k = limit / total;
      rows.forEach(r => { r.tType *= k; r.tShow *= k; });
    }
    rows.forEach(r => ctx.event(r.tShow, 'blip'));
    return {
      update(lt) {
        rows.forEach(r => {
          const vis = lt >= r.tType;
          r.row.style.display = vis ? '' : 'none';
          if (!vis) return;
          const shown = lt >= r.tShow;
          if (r.typing) {
            r.typing.style.display = shown ? 'none' : '';
            if (!shown) Array.from(r.typing.children).forEach((d, i) => {
              d.style.transform = `translateY(${Math.sin(lt * 10 - i * 0.9) * -6}px)`;
              d.style.opacity = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(lt * 10 - i * 0.9));
            });
          }
          r.bub.style.display = shown ? '' : 'none';
          if (shown) {
            const p = prog(lt, r.tShow, 0.32);
            r.bub.style.transform = `scale(${lerp(0.5, 1, ease.outBack(p))})`;
            r.bub.style.opacity = clamp(p * 3);
          }
        });
        const over = list.scrollHeight - area.clientHeight;
        list.style.transform = `translateY(${-Math.max(0, over)}px)`;
      }
    };
  };

  SCENES.browser = function (s, root, ctx) {
    const wrap = el('div', 'brw-wrap', root);
    if (s.kicker) el('div', 's-kick', wrap, esc(s.kicker));
    if (s.title) el('div', 's-title', wrap, richHTML(s.title));
    const win = el('div', 'win', wrap);
    const bar = el('div', 'win-bar', win, '<b style="background:#FF5F57"></b><b style="background:#FEBC2E"></b><b style="background:#28C840"></b>');
    el('div', 'url', bar, svgIcon('lock', 'lk').replace('<svg', '<svg style="width:22px;height:22px;margin-right:12px;fill:none;stroke:currentColor;stroke-width:2.2"') + esc(s.url || ''));
    const body = el('div', 'brw-body', win);
    const img = el('img', null, body);
    img.src = s.image;
    ctx.images.push(img);
    const badge = s.badge ? el('div', 'badge', root, esc(s.badge)) : null;
    const tBadge = s.badgeAt != null ? s.badgeAt : 0.9;
    if (badge) ctx.event(tBadge, 'pop');
    let laidOut = false;
    return {
      layout() {
        const ratio = img.naturalHeight / Math.max(1, img.naturalWidth);
        body.style.height = Math.min(s.imageHeight || 9999, Math.round(SCENE_W * ratio), 700) + 'px';
        if (badge) {
          const wr = win.getBoundingClientRect(), rr = root.getBoundingClientRect();
          badge.style.right = '-6px';
          badge.style.top = (wr.bottom - rr.top - 70) + 'px';
        }
        laidOut = true;
      },
      update(lt) {
        if (!laidOut) this.layout();
        const p = prog(lt, 0, ctx.dur);
        img.style.transform = `scale(${1 + 0.07 * ease.inOutCubic(p)})`;
        if (badge) {
          const q = prog(lt, tBadge, 0.32);
          badge.style.opacity = clamp(q * 3);
          badge.style.transform = `rotate(-5deg) scale(${lerp(0.4, 1, ease.outBack(q))})`;
        }
      }
    };
  };

  SCENES.checklist = function (s, root, ctx) {
    const wrap = el('div', 'chk-wrap', root);
    if (s.kicker) el('div', 's-kick', wrap, esc(s.kicker));
    const title = s.title ? el('div', 's-title', wrap, richHTML(s.title)) : null;
    const items = s.items || [];
    const t0 = s.startAt != null ? s.startAt : 0.45;
    const stagger = s.stagger != null ? s.stagger : clamp((ctx.dur - t0 - 1.0) / Math.max(1, items.length), 0.35, 0.8);
    const rows = items.map((it, i) => {
      const state = it.state || 'done';
      const row = el('div', 'chk-row', wrap);
      const col = state === 'fail' ? 'var(--danger)' : state === 'todo' ? 'rgba(255,255,255,.35)' : 'var(--accent)';
      const mark = state === 'fail'
        ? '<path class="mk" d="M17 17 L35 35" pathLength="1"/><path class="mk" d="M35 17 L17 35" pathLength="1"/>'
        : state === 'todo' ? '' : '<path class="mk" d="M14 27 L22.5 35 L38 17" pathLength="1"/>';
      const svg = `<svg viewBox="0 0 52 52"><rect class="bx" x="3" y="3" width="46" height="46" rx="13" fill="${state === 'done' ? 'var(--accent)' : 'none'}" stroke="${col}" stroke-width="4"/>` +
        `<g fill="none" stroke="${state === 'done' ? 'var(--accent-ink)' : col}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round">${mark}</g></svg>`;
      row.insertAdjacentHTML('beforeend', svg);
      const tx = el('div', 'chk-text', row);
      const main = el('span', 'chk-main', tx, richHTML(it.text));
      const strike = state === 'fail' && it.strike !== false ? el('div', 'strike', tx) : null;
      if (it.note) el('div', 'chk-note', tx, richHTML(it.note));
      const vpc = s._voiceParts;
      const at = it.at != null ? it.at : (it.part != null && vpc && vpc[it.part]) ? Math.max(0.05, vpc[it.part].start - 0.05 + (it.dt || 0)) : t0 + i * stagger;
      ctx.event(at + 0.2, state === 'fail' ? 'fail' : 'tick');
      const lr = main.getClientRects();
      const strikeW = lr.length ? lr[0].width : main.offsetWidth;
      return { row, at, state, rect: row.querySelector('.bx'), marks: Array.from(row.querySelectorAll('.mk')), tx, strike, strikeW };
    });
    return {
      update(lt) {
        if (title) {
          const p = prog(lt, 0.05, 0.4);
          title.style.opacity = ease.outCubic(p);
          title.style.transform = `translateY(${(1 - ease.outCubic(p)) * 30}px)`;
        }
        rows.forEach(r => {
          const p = prog(lt, r.at, 0.35);
          r.row.style.opacity = ease.outCubic(p);
          r.row.style.transform = `translateX(${(1 - ease.outCubic(p)) * -60}px)`;
          const m = ease.outCubic(prog(lt, r.at + 0.15, 0.28));
          r.marks.forEach((pth, k) => {
            const mk = r.marks.length > 1 ? ease.outCubic(prog(lt, r.at + 0.15 + k * 0.1, 0.2)) : m;
            pth.style.strokeDasharray = '1 1';
            pth.style.strokeDashoffset = String(1 - mk);
          });
          if (r.state === 'done') r.rect.style.fillOpacity = String(ease.outCubic(prog(lt, r.at + 0.1, 0.2)));
          if (r.strike) {
            const q = ease.inOutCubic(prog(lt, r.at + 0.4, 0.35));
            r.strike.style.width = (q * r.strikeW) + 'px';
            r.tx.style.color = q > 0 ? `rgba(255,255,255,${1 - 0.4 * q})` : '';
          }
        });
      }
    };
  };

  SCENES.chart = function (s, root, ctx) {
    const wrap = el('div', 'chart-wrap', root);
    if (s.kicker) el('div', 's-kick', wrap, esc(s.kicker));
    const title = s.title ? el('div', 's-title', wrap, richHTML(s.title)) : null;
    const bars = s.bars || [];
    const max = s.max || Math.max(1, ...bars.map(b => Math.abs(b.value)));
    const t0 = s.startAt != null ? s.startAt : 0.45;
    const stagger = s.stagger != null ? s.stagger : 0.28;
    const unit = s.unit || '';
    const dec = s.decimals || 0;
    const fmt = v => v.toLocaleString('ru-RU', { minimumFractionDigits: dec, maximumFractionDigits: dec }).replace(/ /g, ' ');
    const rows = bars.map((b, i) => {
      const row = el('div', 'bar-row' + (b.accent ? ' hot' : ''), wrap);
      const top = el('div', 'bar-top', row);
      el('div', 'bar-label', top, richHTML(b.label));
      const val = el('div', 'bar-val', top);
      const fill = el('div', 'bar-fill', el('div', 'bar-track', row));
      const at = t0 + i * stagger;
      ctx.event(at, 'pop');
      return { row, val, fill, at, v: b.value, display: b.display };
    });
    return {
      update(lt) {
        if (title) {
          const p = prog(lt, 0.05, 0.4);
          title.style.opacity = ease.outCubic(p);
          title.style.transform = `translateY(${(1 - ease.outCubic(p)) * 30}px)`;
        }
        rows.forEach(r => {
          const p = prog(lt, r.at, 0.3);
          r.row.style.opacity = ease.outCubic(p);
          const g = ease.outExpo(prog(lt, r.at + 0.1, 1.0));
          r.fill.style.width = (Math.max(0, r.v) / max * 100 * g) + '%';
          r.val.textContent = r.display && g >= 1 ? r.display : fmt(r.v * g) + unit;
        });
      }
    };
  };

  SCENES.flow = function (s, root, ctx) {
    const wrap = el('div', 'flow', root);
    const nodes = s.nodes || [];
    const byId = {};
    const t0 = s.startAt != null ? s.startAt : 0.35;
    const stagger = s.stagger != null ? s.stagger : 0.9;
    nodes.forEach((n, i) => {
      const vp = s._voiceParts;
      n._at = n.part != null && vp && vp[n.part] ? Math.max(0.1, vp[n.part].start - 0.15) : n.at != null ? n.at : t0 + i * stagger;
      n._x = n.x * SCENE_W; n._y = n.y * SCENE_H;
      byId[n.id] = n;
    });
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'edges');
    svg.setAttribute('viewBox', `0 0 ${SCENE_W} ${SCENE_H}`);
    svg.setAttribute('width', SCENE_W); svg.setAttribute('height', SCENE_H);
    wrap.appendChild(svg);
    const mk = (tag, attrs, parent) => {
      const e = document.createElementNS(svgNS, tag);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      (parent || svg).appendChild(e);
      return e;
    };
    const defs = mk('defs', {});
    const flt = mk('filter', { id: 'glow', x: '-200%', y: '-200%', width: '500%', height: '500%' }, defs);
    mk('feGaussianBlur', { stdDeviation: '5' }, flt);
    const edges = (s.edges || []).map(e => {
      const a = byId[e.from], b = byId[e.to];
      if (!a || !b) throw new Error('flow edge with unknown node: ' + e.from + ' -> ' + e.to);
      const at = e.at != null ? e.at : Math.max(a._at, b._at) + 0.3;
      const dx = b._x - a._x, dy = b._y - a._y;
      const len = Math.hypot(dx, dy) || 1;
      const bend = (e.curve || 0) * len;
      const cx = (a._x + b._x) / 2 - dy / len * bend, cy = (a._y + b._y) / 2 + dx / len * bend;
      const d = `M${a._x} ${a._y} Q${cx} ${cy} ${b._x} ${b._y}`;
      const base = mk('path', { d, fill: 'none', stroke: 'rgba(var(--accent-rgb),.28)', 'stroke-width': 5, pathLength: 1, 'stroke-linecap': 'round' });
      const dash = mk('path', { d, fill: 'none', stroke: 'var(--accent)', 'stroke-width': 3, 'stroke-dasharray': '10 22', 'stroke-linecap': 'round', opacity: 0 });
      const pt = u => {
        const v = 1 - u;
        return [v * v * a._x + 2 * v * u * cx + u * u * b._x, v * v * a._y + 2 * v * u * cy + u * u * b._y];
      };
      const pulses = [];
      const dirs = e.bidir === false ? [1] : [1, -1];
      dirs.forEach(dir => {
        const g = mk('g', { opacity: 0 });
        mk('circle', { r: 14, fill: 'var(--accent)', filter: 'url(#glow)', opacity: 0.8 }, g);
        mk('circle', { r: 7, fill: '#fff' }, g);
        pulses.push({ g, dir, phase: hashRand(pulses.length + edges_count++) });
      });
      ctx.event(at, 'swish');
      return { base, dash, pulses, pt, at, speed: e.speed || 0.55 };
    });
    const cards = nodes.map(n => {
      const card = el('div', 'node', wrap);
      card.innerHTML = `<div class="ring"></div><div class="ic">${svgIcon(n.icon || 'bolt')}</div><div class="nl">${richHTML(n.label)}</div>` + (n.sub ? `<div class="ns">${richHTML(n.sub)}</div>` : '');
      if (n.width) card.style.width = n.width + 'px';
      ctx.event(n._at, 'pop');
      return { n, card, ring: card.querySelector('.ring') };
    });
    cards.forEach(c => {
      c.w = c.card.offsetWidth; c.h = c.card.offsetHeight;
      c.card.style.left = (c.n._x - c.w / 2) + 'px';
      c.card.style.top = (c.n._y - c.h / 2) + 'px';
    });
    {
      const minPx = s.minFont != null ? s.minFont : MIN_LABEL_PX;
      cards.forEach(c => {
        const id = `flow node "${c.n.id}"`;
        const x0 = c.n._x - c.w / 2, y0 = c.n._y - c.h / 2;
        if (x0 < 0 || y0 < 0 || x0 + c.w > SCENE_W || y0 + c.h > SCENE_H) ISSUES.push(`${id}: bbox [${Math.round(x0)},${Math.round(y0)}..${Math.round(x0 + c.w)},${Math.round(y0 + c.h)}] outside scene ${SCENE_W}x${SCENE_H}`);
        ['nl', 'ns'].forEach(k => {
          const e = c.card.querySelector('.' + k);
          if (!e) return;
          const fs = parseFloat(getComputedStyle(e).fontSize);
          if (fs < minPx) ISSUES.push(`${id}: .${k} font ${fs}px < ${minPx}px`);
          if (e.scrollWidth > e.clientWidth + 1) ISSUES.push(`${id}: .${k} text overflows horizontally (${e.scrollWidth} > ${e.clientWidth})`);
        });
      });
      for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
        const A = cards[i], B = cards[j];
        if (Math.abs(A.n._x - B.n._x) < (A.w + B.w) / 2 && Math.abs(A.n._y - B.n._y) < (A.h + B.h) / 2) ISSUES.push(`flow nodes "${A.n.id}" and "${B.n.id}" overlap`);
      }
    }
    const order = nodes.slice().sort((x, y) => x._at - y._at);
    const lastAt = order.length ? order[order.length - 1]._at : 0;
    const focus = s.focus || order.map(n => ({ at: n._at, id: n.id })).concat([{ at: lastAt + (s.focusHold || 1.6), id: null }]);
    return {
      update(lt) {
        let fid = null;
        focus.forEach(f => { if (lt >= f.at) fid = f.id; });
        cards.forEach(c => {
          const p = prog(lt, c.n._at, 0.42);
          c.card.style.opacity = clamp(p * 2.5);
          c.card.style.transform = `scale(${lerp(0.5, 1, ease.outBack(p))})`;
          c.card.classList.toggle('focus', fid === c.n.id);
          const r = prog(lt, c.n._at + 0.1, 0.8);
          c.ring.style.opacity = r > 0 && r < 1 ? 0.8 * (1 - r) : 0;
          c.ring.style.transform = `scale(${1 + 0.35 * ease.outCubic(r)})`;
        });
        edges.forEach(e => {
          const p = ease.inOutCubic(prog(lt, e.at, 0.55));
          e.base.style.strokeDasharray = '1 1';
          e.base.style.strokeDashoffset = String(1 - p);
          const live = prog(lt, e.at + 0.5, 0.4);
          e.dash.setAttribute('opacity', (0.55 * live).toFixed(3));
          e.dash.style.strokeDashoffset = String(-lt * 60);
          e.pulses.forEach(pl => {
            if (live <= 0) { pl.g.setAttribute('opacity', 0); return; }
            const u0 = ((lt - e.at) * e.speed + pl.phase) % 1;
            const u = pl.dir > 0 ? u0 : 1 - u0;
            const [x, y] = e.pt(u);
            pl.g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
            pl.g.setAttribute('opacity', (live * Math.sin(Math.PI * u0)).toFixed(3));
          });
        });
        wrap.style.transform = `scale(${lerp(0.97, 1.0, ease.outCubic(prog(lt, 0, ctx.dur)))})`;
      }
    };
  };
  let edges_count = 0;

  SCENES.phone = function (s, root, ctx) {
    const wrap = el('div', 'ph-wrap', root);
    const top = el('div', 'ph-top', wrap);
    const title = el('div', 'ph-title', top);
    const idx = el('div', 'ph-idx', top);
    const st = el('div', 'ph-stage', wrap);
    el('div', 'ph-glow', st);
    const phone = el('div', 'phone', st);
    const screen = el('div', 'ph-screen', phone);
    el('div', 'ph-status', screen, '<span>9:41</span><i class="ph-island"></i><span class="ph-bat"></span>');
    const strip = el('div', 'ph-strip', screen);
    const screens = s.screens || [];
    screens.forEach(sc => {
      const img = el('img', null, strip);
      img.src = sc.image;
      ctx.images.push(img);
    });
    const lead = s.startAt != null ? s.startAt : 0.2;
    const per = (ctx.dur - lead) / Math.max(1, screens.length);
    const sw = 360;
    const switches = [];
    const vp = s._voiceParts && s._voiceParts.length === screens.length ? s._voiceParts : null;
    for (let k = 1; k < screens.length; k++) {
      const ts = vp ? vp[k].start - 0.05 : lead + k * per;
      switches.push(ts - 0.2); ctx.event(ts - 0.25, 'swish');
    }
    let fitSize = 44;
    screens.forEach(sc => { title.textContent = stripMarks(sc.title || ''); while (title.scrollWidth > SCENE_W - 140 && fitSize > 26) { fitSize -= 2; title.style.fontSize = fitSize + 'px'; } });
    return {
      update(lt) {
        let pos = 0;
        switches.forEach(t => { pos += ease.inOutCubic(prog(lt, t, 0.45)); });
        strip.style.transform = `translateX(${-pos * sw}px)`;
        const cur = clamp(Math.round(pos), 0, screens.length - 1);
        const frac = Math.abs(pos - Math.round(pos));
        const sc = screens[cur] || {};
        title.innerHTML = richHTML(sc.title || s.title || '');
        idx.textContent = `${cur + 1}/${screens.length}`;
        top.style.opacity = String(clamp(1 - frac * 3.2) * ease.outCubic(prog(lt, 0.05, 0.35)));
        const pin = ease.outCubic(prog(lt, 0, 0.7));
        const ry = Math.sin(lt * 0.9) * 7, rx = 4 + Math.sin(lt * 0.6) * 2;
        phone.style.transform = `translateY(${(1 - pin) * 260}px) rotateY(${ry}deg) rotateX(${rx}deg)`;
      }
    };
  };

  SCENES.hook = function (s, root, ctx) {
    const box = el('div', 'hk', root);
    const num = el('div', 'hk-num', box);
    if (s.label !== false) el('span', 'lab', num, esc(s.label || 'ДЕНЬ'));
    el('span', null, num, esc(String(s.day != null ? s.day : '')));
    if (s.total) el('span', 'tot', num, '/' + esc(String(s.total)));
    let nsz = s.numSize || 420;
    num.style.fontSize = nsz + 'px';
    while (num.getBoundingClientRect().width > SCENE_W && nsz > 250) { nsz -= 4; num.style.fontSize = nsz + 'px'; }
    const title = el('div', 'hk-title', box);
    String(s.title || '').split('\n').forEach(line => el('span', 'ln', title, richHTML(line)));
    let tsz = s.titleSize || 150;
    title.style.fontSize = tsz + 'px';
    const tooWide = () => Array.from(title.querySelectorAll('.ln')).some(l => l.getBoundingClientRect().width > SCENE_W + 1);
    while (tooWide() && tsz > 70) { tsz -= 2; title.style.fontSize = tsz + 'px'; }
    const lines = title.querySelectorAll('.ln').length;
    const sub = s.sub ? el('div', 'hk-sub', box, richHTML(s.sub)) : null;
    if (sub) sub.style.top = (352 + Math.round(tsz * 0.98 * lines) + 22) + 'px';
    const rule = el('div', 'hk-rule', box);
    const subBottom = sub ? 352 + Math.round(tsz * 0.98 * lines) + 22 + 48 : 352 + Math.round(tsz * 0.98 * lines);
    rule.style.top = Math.max(658, subBottom + 30) + 'px';
    const tag = s.tag ? el('div', 'tag', box, esc(s.tag)) : null;
    if (tag) { tag.style.right = '0px'; tag.style.top = (352 + Math.round(tsz * 0.98) + 20) + 'px'; }
    const tagAt = s.tagAt != null ? s.tagAt : 0.35;
    if (tag) ctx.event(tagAt, 'fail');
    return {
      update(lt) {
        const pulse = 1 + 0.018 * Math.sin(lt * 5.2);
        num.style.transformOrigin = 'left center';
        num.style.transform = `scale(${pulse})`;
        if (tag) tag.style.opacity = lt >= tagAt ? 1 : 0;
        const r = s.ruleGrow ? ease.outCubic(prog(lt, 0.1, 0.7)) : 1;
        rule.style.transform = `scaleX(${r})`;
      }
    };
  };

  SCENES.quote = function (s, root, ctx) {
    const box = el('div', 'qt', root);
    el('div', 'qt-rule', box);
    const card = el('div', 'qt-card', box);
    el('div', 'qt-bar', card, `<span>${esc(s.bar || 'документ')}</span><span class="r">${esc(s.barRight || '')}</span>`);
    const body = el('div', 'qt-body', card);
    el('div', 'qt-mark', body, '«');
    const text = el('div', 'qt-text', body);
    const toks = parseMarked(s.text || '').filter(t => !t.br);
    const words = toks.map(t => { const w = el('span', 'w' + (t.accent ? ' accent' : ''), text, esc(t.word)); text.appendChild(document.createTextNode(' ')); return w; });
    let qs = s.size || 58;
    text.style.fontSize = qs + 'px';
    while (body.scrollHeight > SCENE_H - 220 && qs > 36) { qs -= 2; text.style.fontSize = qs + 'px'; }
    const src = s.source ? el('div', 'qt-src', body, richHTML(s.source)) : null;
    const t0 = s.startAt != null ? s.startAt : 0.35;
    const per = s.wordDur != null ? s.wordDur : Math.min(0.2, Math.max(0.07, (ctx.dur * 0.55) / Math.max(1, words.length)));
    words.forEach((w, i) => { if (i % 3 === 0) ctx.event(t0 + i * per, 'key'); });
    const srcAt = t0 + words.length * per + 0.2;
    return {
      update(lt) {
        words.forEach((w, i) => { const p = prog(lt, t0 + i * per, 0.12); w.style.opacity = p; });
        if (src) src.style.opacity = ease.outCubic(prog(lt, srcAt, 0.3));
      }
    };
  };

  SCENES.stampcard = function (s, root, ctx) {
    const box = el('div', 'sc', root);
    if (s.kicker) el('div', 'sc-k', box, richHTML(s.kicker));
    const t = el('div', 'sc-t', box, richHTML(s.title || ''));
    let sz = s.size || 120;
    t.style.fontSize = sz + 'px';
    while (t.scrollWidth > SCENE_W && sz > 50) { sz -= 2; t.style.fontSize = sz + 'px'; }
    const sub = s.sub ? el('div', 'sc-s', box, richHTML(s.sub)) : null;
    const stamp = el('div', 'sc-stamp', root, esc(s.stamp || ''));
    const at = s.stampAt != null ? s.stampAt : 1.0;
    ctx.event(at, 'fail');
    return {
      update(lt) {
        const p = prog(lt, at, 0.2);
        stamp.style.opacity = p > 0 ? 1 : 0;
        stamp.style.transform = `rotate(-6deg) scale(${lerp(2.2, 1, ease.outCubic(p))})`;
        const q = prog(lt, 0.1, 0.5);
        t.style.opacity = ease.outCubic(q);
        if (sub) sub.style.opacity = ease.outCubic(prog(lt, 0.4, 0.4));
      }
    };
  };

  SCENES.timeline = function (s, root, ctx) {
    const box = el('div', 'tl2', root);
    const days = s.days || 30;
    const x0 = 6, xEnd = s.endX || 640;
    const px = d => x0 + (xEnd - x0) * d / days;
    const y = s.barY || 300;
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', SCENE_W); svg.setAttribute('height', SCENE_H);
    svg.setAttribute('viewBox', `0 0 ${SCENE_W} ${SCENE_H}`);
    box.appendChild(svg);
    const mk = (tag, attrs, parent) => { const e = document.createElementNS(svgNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); (parent || svg).appendChild(e); return e; };
    const defs = mk('defs', {});
    const pat = mk('pattern', { id: 'hatch', width: 14, height: 14, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    mk('rect', { width: 5, height: 14, fill: 'var(--danger)' }, pat);
    if (s.title) el('div', 'tl2-t', box, esc(s.title));
    const base = mk('rect', { x: x0, y: y - 18, width: xEnd - x0, height: 36, fill: '#1d1d1a', stroke: 'rgba(242,239,230,.18)', 'stroke-width': 2 });
    const hatch = s.hatch ? mk('rect', { x: px(s.hatch.from), y: y - 18, width: px(s.hatch.to) - px(s.hatch.from), height: 36, fill: 'url(#hatch)', opacity: 0.85 }) : null;
    const ticks = [];
    for (let d = 0; d <= days; d += 1) {
      const major = d % 7 === 0 || d === days;
      ticks.push(mk('rect', { x: px(d) - 1.5, y: y + 26, width: 3, height: major ? 22 : 11, fill: 'rgba(242,239,230,.45)' }));
    }
    const fillBar = mk('rect', { x: x0, y: y - 18, width: 0, height: 36, fill: 'var(--accent)' });
    const over = s.overflow ? mk('g', { opacity: 0 }) : null;
    if (over) {
      mk('line', { x1: xEnd, y1: y, x2: SCENE_W - 30, y2: y, stroke: 'var(--danger)', 'stroke-width': 8, 'stroke-dasharray': '18 14' }, over);
      mk('path', { d: `M${SCENE_W - 56} ${y - 28} L${SCENE_W - 8} ${y} L${SCENE_W - 56} ${y + 28} Z`, fill: 'var(--danger)' }, over);
    }
    const labs = [];
    const addLab = (txt, x, yy, cls, at, anchor) => {
      const l = el('div', 'tl2-lab ' + (cls || ''), box, richHTML(txt));
      l.style.left = x + 'px'; l.style.top = yy + 'px';
      if (anchor === 'right') l.style.transform = 'translateX(-100%)';
      labs.push({ l, at, anchor });
      ctx.event(at, 'tick');
      return l;
    };
    (s.marks || []).forEach((m, i) => {
      const at = m.at != null ? m.at : 0.6 + i * 0.8;
      const mx = px(m.day);
      const line = mk('rect', { x: mx - 2, y: y - 60, width: 4, height: 120, fill: m.tone === 'danger' ? 'var(--danger)' : 'var(--accent)', opacity: 0 });
      const yy = m.up === false ? y + 70 : y - 150;
      const lab = addLab(m.label, Math.min(mx, m.right ? mx : SCENE_W - 330), yy, m.tone === 'danger' ? 'd' : 'a', at, m.right ? 'right' : null);
      labs[labs.length - 1].line = line;
    });
    if (s.overflow) {
      const at = s.overflow.at != null ? s.overflow.at : 2.2;
      addLab(s.overflow.label, SCENE_W, y - 90, 'd', at, 'right');
      labs[labs.length - 1].over = over;
    }
    if (s.hatch && s.hatch.label) { const at = s.hatch.at != null ? s.hatch.at : 1.2; addLab(s.hatch.label, px(s.hatch.from), y + 150, 'm', at); labs[labs.length - 1].hatchRef = true; }
    const fillTo = s.fillTo != null ? s.fillTo : days;
    const fillAt = s.fillAt != null ? s.fillAt : 0.3;
    return {
      update(lt) {
        const g = ease.inOutCubic(prog(lt, fillAt, s.fillDur || 1.2));
        fillBar.setAttribute('width', Math.max(0, (px(fillTo) - x0) * g).toFixed(1));
        if (hatch) hatch.setAttribute('opacity', (0.85 * clamp((lt - (s.hatch.at != null ? s.hatch.at : 1.2)) * 3)).toFixed(3));
        labs.forEach(L => {
          const p = ease.outCubic(prog(lt, L.at, 0.35));
          L.l.style.opacity = p;
          if (L.line) L.line.setAttribute('opacity', p.toFixed(3));
          if (L.over) L.over.setAttribute('opacity', p.toFixed(3));
        });
      }
    };
  };

  function splitPhrases(str) {
    const parts = [];
    String(str).split('|').forEach(seg => {
      const words = seg.trim().split(/\s+/).filter(Boolean);
      let cur = [];
      let len = 0;
      words.forEach(w => {
        const wl = stripMarks(w).length;
        if (cur.length && len + wl + 1 > 30) { parts.push(cur.join(' ')); cur = []; len = 0; }
        cur.push(w); len += wl + 1;
        if (/[.!?…]$/.test(w) && len > 14) { parts.push(cur.join(' ')); cur = []; len = 0; }
      });
      if (cur.length) parts.push(cur.join(' '));
    });
    return parts;
  }

  function splitBalanced(str) {
    const words = String(str).trim().split(/\s+/).filter(Boolean);
    const wl = w => stripMarks(w).length;
    const total = words.reduce((a, w) => a + wl(w), 0) + Math.max(0, words.length - 1);
    const n = Math.max(1, Math.ceil(total / 30));
    if (n === 1) return [words.join(' ')];
    const target = total / n;
    const parts = [];
    let cur = [], len = 0;
    words.forEach(w => {
      const nl = cur.length ? len + 1 + wl(w) : wl(w);
      if (cur.length && parts.length < n - 1 && (nl > 30 || Math.abs(nl - target) > Math.abs(len - target))) { parts.push(cur.join(' ')); cur = []; len = 0; }
      len = cur.length ? len + 1 + wl(w) : wl(w);
      cur.push(w);
    });
    if (cur.length) parts.push(cur.join(' '));
    return parts;
  }

  function spreadPhrases(parts, from, to, list) {
    const weights = parts.map(p => stripMarks(p).length + 8);
    const tot = weights.reduce((a, b) => a + b, 0) || 1;
    let c = from;
    parts.forEach((p, i) => { const d = ((to - from) * weights[i]) / tot; list.push({ text: p, t0: c, t1: c + d }); c += d; });
  }

  const PAUSE_W = { ',': 5, ';': 6, ':': 6, '.': 8, '!': 8, '?': 8, '…': 8, '—': 3 };
  const wchars = t => stripMarks(t.word).replace(/ /g, ' ').length;

  // text -> chunks of 2-4 words with weights (letters + pause after punctuation)
  function chunkWords(text) {
    const toks = parseMarked(text).filter(t => !t.br);
    const clauses = [];
    let cur = [];
    toks.forEach(t => {
      cur.push(t);
      const m = t.word.match(/([,;:.!?…])["»)]*$/);
      if (m) { clauses.push({ toks: cur, end: m[1] }); cur = []; }
    });
    if (cur.length) clauses.push({ toks: cur, end: '' });
    for (let i = 0; i < clauses.length - 1; i++) {
      const c = clauses[i];
      if (c.toks.length === 1 && !/[.!?…]/.test(c.end) && c.toks.length + clauses[i + 1].toks.length <= 4) {
        clauses[i + 1].toks = c.toks.concat(clauses[i + 1].toks);
        clauses.splice(i, 1); i--;
      }
    }
    const out = [];
    clauses.forEach(c => {
      const n = c.toks.length;
      const k = Math.max(1, Math.ceil(n / 4));
      let pos = 0;
      for (let j = 0; j < k; j++) {
        const size = Math.floor(n / k) + (j < n % k ? 1 : 0);
        const toksj = c.toks.slice(pos, pos + size);
        pos += size;
        const last = j === k - 1;
        const w = toksj.reduce((a, t) => a + wchars(t) + 1, 0) + (last ? (PAUSE_W[c.end] || 0) : 0);
        out.push({ toks: toksj, weight: w });
      }
    });
    return out;
  }

  function buildCaptions(scenes, root, theme, script) {
    const chunks = [];
    const label = script.captionLabel || null;
    scenes.forEach(sc => {
      let cap = sc.def.caption;
      const vp = sc.def._voiceParts;
      if (vp && vp.length && (cap == null || cap === 'auto')) cap = 'auto';
      if (!cap) return;
      const start = sc.start, end = sc.start + sc.dur;
      let list = [];
      if (cap === 'auto') {
        vp.forEach(p => list.push({ text: p.text, t0: start + p.start, t1: start + p.start + p.dur + 0.08 }));
      } else if (Array.isArray(cap)) {
        cap.forEach((c, i) => {
          const t0 = start + (c.t != null ? c.t : (i * sc.dur) / cap.length);
          const nx = cap[i + 1];
          const t1 = c.end != null ? start + c.end : nx ? start + (nx.t != null ? nx.t : ((i + 1) * sc.dur) / cap.length) : end - 0.05;
          list.push({ text: c.text, t0, t1 });
        });
      } else if (vp && vp.length) {
        const last = vp[vp.length - 1];
        list.push({ text: String(cap).replace(/\|/g, ' '), t0: start + vp[0].start, t1: start + last.start + last.dur + 0.08 });
      } else {
        const lead = sc.def.captionLead != null ? sc.def.captionLead : 0.15;
        list.push({ text: String(cap).replace(/\|/g, ' '), t0: start + lead, t1: start + sc.dur - 0.1 });
      }
      list.forEach(it => {
        const cs = chunkWords(it.text);
        const tot = cs.reduce((a, c) => a + c.weight, 0) || 1;
        let c0 = it.t0;
        cs.forEach((c, ci) => {
          const d = ((it.t1 - it.t0) * c.weight) / tot;
          const t0 = c0, t1 = ci === cs.length - 1 ? it.t1 : c0 + d;
          c0 += d;
          const lens = c.toks.map(t => wchars(t) + 2);
          const lt = lens.reduce((a, b) => a + b, 0) || 1;
          const speakEnd = t0 + (t1 - t0) * (ci === cs.length - 1 ? 0.92 : 0.96);
          let w0 = t0;
          const words = c.toks.map((t, i) => { const w = { word: t.word, accent: t.accent, t: w0 }; w0 += ((speakEnd - t0) * lens[i]) / lt; return w; });
          chunks.push({ t0, t1, words, first: false });
        });
      });
    });
    chunks.sort((x, y) => x.t0 - y.t0);
    if (label && chunks.length) chunks[0].first = true;
    for (let i = 0; i < chunks.length - 1; i++) {
      const gap = chunks[i + 1].t0 - chunks[i].t1;
      if (gap > 0 && gap < 0.45) chunks[i].t1 = chunks[i + 1].t0;
    }
    const box = el('div', null, root);
    box.id = 'captions';
    let current = null, capEl = null, spans = [];
    return {
      update(t, hidden) {
        const ch = hidden ? null : chunks.find(c => t >= c.t0 && t < c.t1) || null;
        if (ch !== current) {
          box.innerHTML = '';
          spans = [];
          capEl = null;
          if (ch) {
            capEl = el('div', 'cap', box);
            if (ch.first && label) el('span', 'ag', capEl, esc(label));
            ch.words.forEach((w, i) => {
              spans.push(el('span', 'cw', capEl, esc(w.word)));
              if (i < ch.words.length - 1) capEl.appendChild(document.createTextNode(' '));
            });
            let fs = 62; capEl.style.fontSize = fs + 'px';
            while (capEl.scrollWidth > 850 && fs > 40) { fs -= 2; capEl.style.fontSize = fs + 'px'; }
          }
          current = ch;
        }
        if (!ch) return;
        const p = prog(t, ch.t0, 0.1);
        capEl.style.opacity = ease.outCubic(p);
        capEl.style.transform = `translateY(${(1 - ease.outCubic(p)) * 10}px)`;
        let active = -1;
        ch.words.forEach((w, i) => { if (t >= w.t) active = i; });
        spans.forEach((sp, i) => { sp.className = 'cw' + (i === active ? ' on' : i > active ? ' pre' : ''); });
      },
      chunks
    };
  }

  const R = { scenes: [], duration: 0, events: [] };

  function makeGrain(seed) {
    const tiles = [];
    const rnd = mulberry32(seed);
    for (let k = 0; k < 4; k++) {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d');
      const im = g.createImageData(256, 256);
      for (let i = 0; i < im.data.length; i += 4) {
        const v = Math.floor(rnd() * 255);
        im.data[i] = im.data[i + 1] = im.data[i + 2] = v;
        im.data[i + 3] = 255;
      }
      g.putImageData(im, 0, 0);
      tiles.push(c.toDataURL('image/png'));
    }
    return tiles;
  }

  window.initReel = async function (script, theme, opts) {
    opts = opts || {};
    const rs = document.documentElement.style;
    rs.setProperty('--accent', theme.accent);
    rs.setProperty('--accent-rgb', hexToRgb(theme.accent));
    rs.setProperty('--accent-ink', theme.accentInk || '#0B0B0A');
    rs.setProperty('--bg', theme.bg);
    rs.setProperty('--panel', theme.panel || '#151513');
    rs.setProperty('--fg', theme.fg || '#F2EFE6');
    rs.setProperty('--muted', theme.muted || '#9A9890');
    rs.setProperty('--danger', theme.danger || '#FF5A4E');
    rs.setProperty('--hair', theme.hair || 'rgba(154,152,144,.38)');
    rs.setProperty('--cap-font', `'${theme.capFont || 'JetBrains Mono'}'`);
    rs.setProperty('--cap-weight', String(theme.capWeight || 700));

    await Promise.all([
      '800 100px Manrope', '700 100px Manrope', '600 50px Manrope', '500 50px Manrope',
      '500 40px "JetBrains Mono"', '600 40px "JetBrains Mono"', '700 40px "JetBrains Mono"', '800 40px "JetBrains Mono"'
    ].map(f => document.fonts.load(f, 'АаЯяЁё Aa 0123 ₽')));
    await document.fonts.ready;

    const stage = document.getElementById('stage');
    const bg = el('div', 'bg-layer', stage); bg.id = 'bg-grid';
    if (theme.bgStyle === 'dots') bg.className = 'bg-layer dots';
    const grain = el('div', 'bg-layer', stage); grain.id = 'grain';
    const grainTiles = script.grain === false || theme.grain === 0 ? [] : makeGrain(script.seed || 7);
    if (!grainTiles.length) grain.style.display = 'none';
    else grain.style.opacity = typeof script.grain === 'number' ? script.grain : (theme.grain != null ? theme.grain : 0.07);
    if (theme.vtext) el('div', null, stage, esc(theme.vtext)).id = 'vtext';

    const header = el('div', null, stage); header.id = 'header';
    const hd = script.header || {};
    el('span', 'hl-left', header, esc(hd.left || ''));
    el('span', 'hl-right', header, esc(hd.right || ''));
    if (hd.show === false) header.style.display = 'none';
    const ticks = el('div', null, stage); ticks.id = 'ticks';
    const sc0 = hd.scale || null;
    const tickState = { cur: null, blink: [] };
    if (sc0) {
      const total = sc0.total || 30, filled = sc0.filled || 1;
      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('width', 960); svg.setAttribute('height', 44); svg.setAttribute('viewBox', '-12 0 960 44');
      ticks.appendChild(svg);
      const mkr = (attrs) => { const r = document.createElementNS(svgNS, 'rect'); for (const k in attrs) r.setAttribute(k, attrs[k]); svg.appendChild(r); return r; };
      const step = 936 / (total - 1 || 1) * (total === 30 ? 0.9996 : 1);
      if (theme.headerStyle === 'dots') {
        const dstep = 936 / (total - 1);
        for (let i = 0; i < total; i++) {
          const cx = 8 + i * (920 / (total - 1));
          const c = document.createElementNS(svgNS, 'circle');
          c.setAttribute('cx', cx); c.setAttribute('cy', 22); c.setAttribute('r', 9);
          if (i < filled - 1) { c.setAttribute('fill', 'var(--accent)'); }
          else if (i === filled - 1) { c.setAttribute('fill', 'var(--accent)'); tickState.cur = c; }
          else { c.setAttribute('fill', 'none'); c.setAttribute('stroke', 'rgba(154,152,144,.6)'); c.setAttribute('stroke-width', 3); }
          svg.appendChild(c);
        }
      } else {
        for (let i = 0; i < total; i++) {
          const x = i === 0 ? -3 : 32 + (i - 1) * 32.0;
          if (i < filled - 1) mkr({ x: x - 0, y: 14, width: 5, height: 16, fill: 'var(--accent)' });
          else if (i === filled - 1) tickState.cur = mkr({ x: i === 0 ? -3 : x - 4, y: 0, width: 13, height: 44, fill: 'var(--accent)' });
          else mkr({ x, y: 14, width: 5, height: 16, fill: '#9A9890', opacity: 0.6 });
        }
      }
    }

    const images = [];
    let t = 0;
    (script.scenes || []).forEach((def, i) => {
      const fn = SCENES[def.type];
      if (!fn) throw new Error('Unknown scene type: ' + def.type);
      const dur = Number(def.duration || 3);
      const layer = el('div', 'scene', stage);
      layer.style.display = 'block';
      const start = t;
      const ctx = {
        index: i, dur, images,
        event: (lt, type) => R.events.push({ t: +(start + lt).toFixed(4), type })
      };
      const api = fn(def, layer, ctx);
      layer.style.display = 'none';
      R.scenes.push({ def, layer, api, start, dur, index: i });
      if (i > 0 && def.transition !== 'cut') R.events.push({ t: Math.max(0, start - 0.12), type: 'whoosh' });
      t += dur;
    });
    R.duration = t;
    await Promise.all(images.map(img => (img.complete && img.naturalWidth ? Promise.resolve() : img.decode().catch(() => { throw new Error('Image failed: ' + img.src); }))));
    R.scenes.forEach(sc => {
      if (sc.api.layout) { sc.layer.style.display = 'block'; sc.api.layout(); sc.layer.style.display = 'none'; }
    });

    R.captions = script.captions === false ? null : buildCaptions(R.scenes, stage, theme, script);

    if (opts.safe) {
      const a = el('div', 'safe-zone', stage); a.style.top = '0'; a.style.height = '220px';
      const b = el('div', 'safe-zone', stage); b.style.bottom = '0'; b.style.height = '380px';
    }

    R.update = function (time, ro) {
      ro = ro || {};
      const fps = script.fps || 30;
      const frame = Math.round(time * fps);
      if (grainTiles.length) {
        grain.style.backgroundImage = `url(${grainTiles[frame % grainTiles.length]})`;
        grain.style.backgroundPosition = `${Math.floor(hashRand(frame) * 256)}px ${Math.floor(hashRand(frame + 1e5) * 256)}px`;
      }
      if (tickState.cur && theme.headerStyle === 'dots') tickState.cur.setAttribute('opacity', (Math.floor(time * 2) % 2 === 0 ? 1 : 0.25).toString());
      const last = R.scenes.length - 1;
      R.scenes.forEach((sc, i) => {
        const lt = time - sc.start;
        const vis = lt >= 0 && (lt < sc.dur || (i === last && lt <= sc.dur + 1));
        sc.layer.style.display = vis ? 'block' : 'none';
        if (!vis) return;
        const cut = sc.def.transition === 'cut';
        const ein = i === 0 || cut ? 1 : ease.outCubic(prog(lt, 0, 0.38));
        const nextCut = R.scenes[i + 1] && R.scenes[i + 1].def.transition === 'cut';
        const eo = i === last || nextCut ? 0 : ease.inCubic(prog(lt, sc.dur - 0.24, 0.24));
        sc.layer.style.opacity = String(ein * (1 - eo));
        sc.layer.style.transform = `translateY(${(1 - ein) * 90 - eo * 80}px) scale(${1 - 0.05 * eo})`;
        sc.api.update(Math.min(lt, sc.dur));
      });
      if (R.captions) R.captions.update(time, !!ro.cover);
    };

    return { issues: ISSUES, duration: R.duration, events: R.events.sort((a, b) => a.t - b.t), captions: R.captions ? R.captions.chunks.map(c => ({ t0: c.t0, t1: c.t1, text: c.words.map(w => w.word).join(' ') })) : [] };
  };

  window.renderFrame = function (t, ro) { R.update(t, ro); return true; };
})();
