// Records real pages/games on a remote machine -> media/<name>/NNNN.jpg @30fps + meta.json
// usage: node cinema/rec.js [name ...]   env: REC_MODE=cdp|shot  REC_KEEP=1  REC_BASE=<url prefix override>
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { spawnSync } = require('child_process');
let pw; try { pw = require('playwright-core'); } catch (e) { pw = require('playwright'); }
const MEDIA = path.join(__dirname, 'media');
const FPS = 30;
const MODE = process.env.REC_MODE || 'cdp';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const jobs = require('./rec-jobs.js');
const only = process.argv.slice(2);

function helpers(p, cdp, clock) {
  const h = { p, cdp, sleep, log: (...a) => console.log('   ', ...a) };
  h.t = () => (Date.now() - clock.t0) / 1000;
  h.at = async sec => { const d = sec * 1000 - (Date.now() - clock.t0); if (d > 0) await sleep(d); else if (process.env.REC_DEBUG && d < -80) console.log('    late', sec, (-d / 1000).toFixed(2)); };
  const ease = k => k * k * (3 - 2 * k);
  const along = (pts, k) => {
    const n = pts.length - 1, x = Math.min(0.999999, k) * n, i = Math.floor(x), f = x - i;
    return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f];
  };
  // input is pipelined (not awaited per event): the remote renderer acks slowly, awaiting would stretch every gesture
  const pend = [];
  const fire = pr => { pend.push(pr.catch(() => { })); if (pend.length > 400) pend.splice(0, 200); return pr; };
  h.flush = () => Promise.all(pend.splice(0));
  const mev = (type, q, o) => fire(cdp.send('Input.dispatchMouseEvent', Object.assign({ type, x: q[0], y: q[1], button: 'none', buttons: 0 }, o)));
  h.mm = (q, down) => mev('mouseMoved', q, down ? { button: 'left', buttons: 1 } : {});
  h.md = q => mev('mousePressed', q, { button: 'left', buttons: 1, clickCount: 1 });
  h.mu = q => mev('mouseReleased', q, { button: 'left', buttons: 0, clickCount: 1 });
  const tev = (type, q) => fire(cdp.send('Input.dispatchTouchEvent', { type, touchPoints: q ? [{ x: q[0], y: q[1] }] : [] }));
  h.ts = q => tev('touchStart', q); h.tm = q => tev('touchMove', q); h.te = () => tev('touchEnd', null);
  h.travel = async (pts, ms, move, o = {}) => {
    const t0 = Date.now();
    for (;;) {
      const k = Math.min(1, (Date.now() - t0) / ms), e = o.linear ? k : ease(k), q = k >= 1 ? pts[pts.length - 1] : along(pts, e);
      move(q); if (k >= 1) break; await sleep(11);
    }
  };
  h.drag = async (pts, ms, o = {}) => {
    h.md(pts[0]); if (o.hold) await sleep(o.hold);
    await h.travel(pts, ms, q => h.mm(q, true), o);
    if (o.hold2) await sleep(o.hold2);
    h.mu(pts[pts.length - 1]);
  };
  h.tap = async (x, y, hold = 40) => { h.md([x, y]); await sleep(hold); h.mu([x, y]); };
  h.ttap = async (x, y, hold = 60) => { h.ts([x, y]); await sleep(hold); h.te(); };
  h.pageEvents = async () => { const ev = await p.evaluate(() => window.__recEv || []); return ev.map(e => ({ type: e[0], t: +((e[1] - clock.t0) / 1000).toFixed(2), x: Math.round(e[2]), y: Math.round(e[3]), pt: e[4] })); };
  h.wheel = async (dy, n, ms) => { for (let i = 0; i < n; i++) { fire(cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 640, y: 400, deltaX: 0, deltaY: dy })); await sleep(ms); } };
  return h;
}

function ffprobeSize(f) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f], { encoding: 'utf8' });
  const [w, hh] = r.stdout.trim().split(',').map(Number); return [w, hh];
}

function resample(frames, tStart, tEnd, dir, name) {
  const raw = path.join(dir, 'raw'); fs.mkdirSync(raw, { recursive: true });
  frames.forEach((f, i) => fs.writeFileSync(`${raw}/${String(i).padStart(5, '0')}.jpg`, f.d));
  let list = '';
  for (let i = 0; i < frames.length; i++) {
    const a = Math.max(frames[i].t, tStart), b = i < frames.length - 1 ? frames[i + 1].t : tEnd;
    const d = Math.max(0.001, b - a);
    list += `file 'raw/${String(i).padStart(5, '0')}.jpg'\nduration ${d.toFixed(4)}\n`;
  }
  list += `file 'raw/${String(frames.length - 1).padStart(5, '0')}.jpg'\n`;
  fs.writeFileSync(dir + '/list.txt', list);
  const n = Math.round((tEnd - tStart) * FPS);
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', dir + '/list.txt', '-vf', `fps=${FPS}`, '-frames:v', String(n), '-q:v', '2', dir + '/%04d.jpg'], { stdio: 'inherit' });
  if (r.status) throw new Error('ffmpeg failed');
  // hold analysis: for each output frame, which source (by content hash) is shown
  const hs = frames.map(f => crypto.createHash('md5').update(f.d).digest('hex'));
  const srcAt = k => { const t = tStart + k / FPS; let j = 0; while (j + 1 < frames.length && frames[j + 1].t <= t) j++; return hs[j]; };
  const holds = []; let runStart = 0;
  for (let k = 1; k <= n; k++) if (k === n || srcAt(k) !== srcAt(runStart)) { if ((k - runStart) / FPS > 0.3) holds.push([+(runStart / FPS).toFixed(2), +((k - runStart) / FPS).toFixed(2)]); runStart = k; }
  let maxGap = 0, gaps = 0; const ts = frames.map(f => Math.max(f.t, tStart));
  for (let i = 1; i < ts.length; i++) { const g = ts[i] - ts[i - 1]; if (g > maxGap) maxGap = g; if (g > 0.15) gaps++; }
  fs.rmSync(raw, { recursive: true, force: true }); fs.rmSync(dir + '/list.txt');
  return { n, rawFrames: frames.length, rawFps: +(frames.length / (tEnd - tStart)).toFixed(1), maxRawGap: +maxGap.toFixed(2), gapsOver150ms: gaps, holdsOver300ms: holds };
}

async function waitCalm(maxLoad, maxSec) {
  const t0 = Date.now();
  for (;;) {
    const l = parseFloat(fs.readFileSync('/proc/loadavg', 'utf8'));
    if (l < maxLoad || (Date.now() - t0) / 1000 > maxSec) { if (l >= maxLoad) console.log('   load still', l, 'after wait'); return l; }
    await sleep(5000);
  }
}

async function attempt(b, name, j, dir, k) {
  const ctx = await b.newContext({ viewport: { width: j.vp[0], height: j.vp[1] }, deviceScaleFactor: j.dsf, hasTouch: !!j.mobile, isMobile: !!j.mobile, locale: 'ru-RU' });
  if (j.init) await ctx.addInitScript(j.init);
  await ctx.addInitScript(() => { window.__recEv = []; for (const t of ['pointerdown', 'pointerup']) addEventListener(t, e => window.__recEv.push([t, Date.now(), e.clientX, e.clientY, e.pointerType]), true); });
  const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p);
  const errs = []; p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text().slice(0, 160)); });
  const frames = [];
  const W = Math.round(j.vp[0] * j.dsf), H = Math.round(j.vp[1] * j.dsf);
  if (MODE === 'cdp') cdp.on('Page.screencastFrame', async f => {
    const arr = Date.now() / 1000, mt = f.metadata.timestamp;
    frames.push({ t: Math.abs(mt - arr) < 0.5 ? mt : arr, d: Buffer.from(f.data, 'base64') });
    try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch (e) { }
  });
  await p.goto(j.url, { waitUntil: j.loadInRun ? 'commit' : 'load', timeout: 60000 }).catch(e => console.error(name, 'goto', e.message));
  if (j.ready) await j.ready(p, sleep);
  await sleep(j.settle == null ? 300 : j.settle);
  if (!j.noIdle && !j.loadInRun) await p.evaluate(() => new Promise(res => { let ok = 0, last = performance.now(), n = 0; (function f(t) { const d = t - last; last = t; n++; ok = d < 45 ? ok + 1 : 0; if (ok >= 12 || n > 400) res(); else requestAnimationFrame(f); })(performance.now()); }));
  await p.evaluate('window.__recEv.length=0');
  const clock = { t0: 0 }, h = helpers(p, cdp, clock);
  let stop = false, shotLoop;
  clock.t0 = Date.now();
  if (MODE === 'cdp') await cdp.send('Page.startScreencast', { format: 'jpeg', quality: j.q || 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  else shotLoop = (async () => { while (!stop) { const ts = Date.now(); const buf = await p.screenshot({ type: 'jpeg', quality: j.q || 90 }).catch(() => null); if (buf) frames.push({ t: (ts + Date.now()) / 2000, d: buf }); } })();
  if (MODE === 'cdp') { const w0 = Date.now(); while (!frames.length && Date.now() - w0 < 4000) await sleep(10); if (frames.length) clock.t0 = frames[0].t * 1000; }
  const tStart0 = clock.t0 / 1000;
  const extra = (await j.run(h)) || {};
  await h.flush();
  const shift = h.clip ? h.clip.start : 0;
  const over = Math.max(0, h.t() - shift - j.dur);
  await h.at(shift + j.dur);
  stop = true; if (MODE === 'cdp') await cdp.send('Page.stopScreencast'); else await shotLoop;
  const tStart = tStart0 + shift, tEnd = tStart + j.dur;
  while (frames.length > 1 && frames[1].t <= tStart) frames.shift();
  await ctx.close();
  if (!frames.length) throw new Error('no frames');
  const tmp = dir + '.tmp' + k; fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
  const st = resample(frames, tStart, tEnd, tmp, name);
  const [w, hh] = ffprobeSize(path.join(tmp, '0001.jpg'));
  const meta = Object.assign({ n: st.n, fps: FPS, w, h: hh, dur: j.dur }, extra);
  fs.writeFileSync(path.join(tmp, 'meta.json'), JSON.stringify(meta, null, 1));
  const ok = over < 0.35 && (!j.anim || (st.maxRawGap <= 0.3 && st.holdsOver300ms.length === 0)) && (!j.accept || j.accept(extra, st));
  console.log('   ', ok ? 'OK' : 'BAD', 'overrun', over.toFixed(2), JSON.stringify(st), `${w}x${hh}`, errs.length ? 'errors: ' + errs.slice(0, 5).join(' | ') : '');
  return { ok, tmp, score: over + st.maxRawGap + st.holdsOver300ms.length };
}

(async () => {
  fs.mkdirSync(MEDIA, { recursive: true });
  const launch = { headless: true, args: ['--force-color-profile=srgb', '--autoplay-policy=no-user-gesture-required'] };
  if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  launch.timeout = 400000;
  let b; const ensure = async () => { if (b && b.isConnected()) return; b = null; for (let k = 0; k < 4 && !b; k++) { try { b = await pw.chromium.launch(launch); } catch (e) { console.error('launch failed, retry', e.message.split('\n')[0]); await sleep(10000); } } if (!b) process.exit(2); };
  await ensure();
  const TRIES = +(process.env.REC_TRIES || 4), MAXLOAD = +(process.env.REC_MAXLOAD || 4.5);
  for (const [name, j] of Object.entries(jobs)) {
    if (only.length && !only.includes(name)) continue;
    await ensure();
    const dir = path.join(MEDIA, name);
    console.log('==', name, MODE);
    try {
      if (j.custom) { fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true }); await j.custom(b, dir, { sleep }); continue; }
      let best = null;
      for (let k = 1; k <= TRIES; k++) {
        await waitCalm(MAXLOAD, 900);
        console.log('   try', k, 'load', fs.readFileSync('/proc/loadavg', 'utf8').split(' ')[0]);
        let r; try { await ensure(); r = await attempt(b, name, j, dir, k); } catch (e) { console.error('   attempt failed:', e.message); continue; }
        if (!best || r.score < best.score) { if (best) fs.rmSync(best.tmp, { recursive: true, force: true }); best = r; } else fs.rmSync(r.tmp, { recursive: true, force: true });
        if (r.ok) break;
      }
      if (!best) throw new Error('all attempts failed');
      fs.rmSync(dir, { recursive: true, force: true }); fs.renameSync(best.tmp, dir);
      console.log('   saved', best.ok ? '(ok)' : '(BEST OF BAD - needs rerun)');
    } catch (e) { console.error('FAILED', name, e.stack || e.message); }
  }
  await b.close().catch(() => { });
})();
