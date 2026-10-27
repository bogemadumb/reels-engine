#!/usr/bin/env node
'use strict';
// desktop-cinema renderer (runs on a remote render machine via remote-render.sh / cinema/remote.sh).
//   node cinema/render-cinema.js <clip> [--frames 1,5.5] [--workers 2] [--out DIR] [--cover-only] [--no-audio]
//        [--bitrate 3000] [--preset medium] [--quality 92] [--from S --to S]
// needs cinema/build/<clip>/{timing.json,voice.js,voice.wav} (cinema/prepare.js) and cinema/clips/<clip>.js
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, spawnSync, execFileSync } = require('child_process');
const { synthesize, writeWav } = require('../lib/audio');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const a = { clip: null, frames: null, workers: 2, out: path.join(ROOT, 'out', 'cinema'), coverOnly: false, audio: true, bitrate: 3000, preset: 'medium', quality: 92, from: null, to: null, fps: 30 };
for (let i = 0; i < argv.length; i++) {
  const k = argv[i];
  if (k === '--frames') a.frames = argv[++i].split(',').map(Number);
  else if (k === '--workers') a.workers = +argv[++i];
  else if (k === '--out') a.out = path.resolve(argv[++i]);
  else if (k === '--cover-only') a.coverOnly = true;
  else if (k === '--no-audio') a.audio = false;
  else if (k === '--bitrate') a.bitrate = +argv[++i];
  else if (k === '--preset') a.preset = argv[++i];
  else if (k === '--quality') a.quality = +argv[++i];
  else if (k === '--from') a.from = +argv[++i];
  else if (k === '--to') a.to = +argv[++i];
  else if (!a.clip) a.clip = k;
}
if (!a.clip) { console.error('usage: node cinema/render-cinema.js <clip> [flags]'); process.exit(2); }
const BUILD = path.join(ROOT, 'cinema', 'build', a.clip);
const timing = JSON.parse(fs.readFileSync(path.join(BUILD, 'timing.json'), 'utf8'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.css': 'text/css', '.svg': 'image/svg+xml', '.mp4': 'video/mp4' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'max-age=3600' });
  fs.createReadStream(p).pipe(res);
});

function runFfmpeg(args, stdin) {
  const p = spawn('ffmpeg', args, { stdio: [stdin ? 'pipe' : 'ignore', 'ignore', 'pipe'] });
  let err = ''; p.stderr.on('data', d => { err += d; });
  const done = new Promise((res, rej) => p.on('close', c => (c === 0 ? res() : rej(new Error('ffmpeg failed: ' + err.slice(-1500))))));
  return { p, done };
}
const writeChunk = (s, b) => new Promise((res, rej) => { if (s.write(b)) res(); else s.once('drain', res); s.once('error', rej); });

(async () => {
  const T0 = Date.now();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  let pw; try { pw = require('playwright'); } catch (e) { pw = require('playwright-core'); }
  const { chromium } = pw;
  const launch = { args: ['--font-render-hinting=none', '--disable-lcd-text', '--force-color-profile=srgb', '--hide-scrollbars', '--disable-dev-shm-usage'] };
  if (process.env.CINEMA_CHROME) launch.channel = 'chrome'; else launch.args.push('--disable-gpu');
  const browser = await chromium.launch(launch);
  fs.mkdirSync(a.out, { recursive: true });

  async function openPage() {
    const ctx = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e));
    page.on('console', m => { if (m.type() === 'error') console.error('[page]', m.text()); });
    await page.goto(`http://127.0.0.1:${port}/cinema/index.html?clip=${a.clip}${a.frames ? '&lenient=1' : ''}`);
    await page.evaluate(() => window.ready);
    if (errors.length) throw errors[0];
    const cdp = await ctx.newCDPSession(page);
    const shot = async (t, fmt, q, cover) => {
      await page.evaluate(([tt, cv]) => { window.setCover(!!cv); return window.setT(tt); }, [t, cover]);
      if (errors.length) throw errors[0];
      const { data } = await cdp.send('Page.captureScreenshot', { format: fmt || 'jpeg', quality: q || a.quality, optimizeForSpeed: true });
      return Buffer.from(data, 'base64');
    };
    const cover = async () => {
      const t = await page.evaluate(() => (window.S.cover && window.S.cover.t) || 2);
      await page.evaluate(() => window.S.coverShow && window.S.coverShow(true));
      const buf = await shot(t, 'jpeg', 94, true);
      await page.evaluate(() => window.S.coverShow && window.S.coverShow(false));
      return buf;
    };
    return { page, shot, cover };
  }

  const main = await openPage();
  const duration = timing.duration;
  const nFrames = Math.round(duration * a.fps);
  const events = await main.page.evaluate(() => window.getEvents());
  console.log(`[cinema] ${a.clip}: ${duration.toFixed(2)}s, ${nFrames} frames, ${events.length} sfx`);

  if (a.frames) {
    const dir = path.join(a.out, a.clip + '-frames'); fs.mkdirSync(dir, { recursive: true });
    for (const t of a.frames) { const f = path.join(dir, `t${t.toFixed(2)}.png`); fs.writeFileSync(f, await main.shot(t, 'png')); console.log(f); }
    await browser.close(); server.close(); return;
  }
  const coverFile = path.join(a.out, a.clip + '.jpg');
  if (a.coverOnly) { fs.writeFileSync(coverFile, await main.cover()); console.log(coverFile); await browser.close(); server.close(); return; }

  const tmp = path.join(a.out, '.tmp-' + a.clip); fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
  const f0 = a.from != null ? Math.round(a.from * a.fps) : 0, f1 = a.to != null ? Math.min(nFrames, Math.round(a.to * a.fps)) : nFrames;
  const total = f1 - f0;
  const W = Math.min(a.workers, Math.max(1, Math.floor(total / 60)));
  const pages = [main]; for (let i = 1; i < W; i++) pages.push(await openPage());
  const per = Math.ceil(total / W);
  const enc = ['-c:v', 'libx264', '-preset', a.preset, '-b:v', a.bitrate + 'k', '-maxrate', Math.round(a.bitrate * 1.35) + 'k', '-bufsize', a.bitrate * 2 + 'k',
    '-vf', 'scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-profile:v', 'high', '-g', String(a.fps * 2), '-r', String(a.fps)];
  let done = 0; const tR = Date.now();
  const segs = await Promise.all(pages.map(async (pg, wi) => {
    const s0 = f0 + wi * per, s1 = Math.min(f1, s0 + per);
    const seg = path.join(tmp, `seg${wi}.mp4`);
    const ff = runFfmpeg(['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(a.fps), '-c:v', 'mjpeg', '-i', '-', ...enc, seg], true);
    for (let fr = s0; fr < s1; fr++) {
      await writeChunk(ff.p.stdin, await pg.shot(fr / a.fps));
      if (++done % 60 === 0) console.log(`[cinema] ${done}/${total} frames, ${(done / ((Date.now() - tR) / 1000)).toFixed(2)} fps`);
    }
    ff.p.stdin.end(); await ff.done; return seg;
  }));
  fs.writeFileSync(coverFile, await main.cover());
  // auto sfx collected by the clip itself (S.sfx) + generic ones
  const auto = await main.page.evaluate(() => window.getAutoEvents ? window.getAutoEvents() : []);
  await browser.close(); server.close();

  const list = path.join(tmp, 'list.txt'); fs.writeFileSync(list, segs.map(s => `file '${s}'`).join('\n'));
  const outFile = path.join(a.out, a.clip + '.mp4');
  if (!a.audio) {
    await runFfmpeg(['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c:v', 'copy', '-movflags', '+faststart', outFile]).done;
  } else {
    const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'cinema', 'music.json'), 'utf8'));
    const wav = synthesize({ duration, events: events.concat(auto), sampleRate: 44100, bpm: m.bpm, root: m.root, seed: m.seed, mode: m.mode, cutoff: m.cutoff, music: true, style: m.style, mute: m.mute || [], timerTick: false, musicGain: m.musicGain != null ? m.musicGain : 1, sfxGain: m.sfxGain != null ? m.sfxGain : 0.55 });
    const mus = path.join(tmp, 'music.wav'); writeWav(mus, wav);
    const mix = path.join(tmp, 'mix.wav');
    const voice = path.join(BUILD, 'voice.wav');
    const mixFc = `[0:a]aresample=44100,volume=${m.vol != null ? m.vol : 0.5}[mu];[1:a]aresample=44100,asplit=2[vs][vm];[mu][vs]sidechaincompress=threshold=0.03:ratio=6:attack=15:release=500:makeup=1[md];[md][vm]amix=inputs=2:normalize=0:duration=longest[o];[o]atrim=0:${duration.toFixed(3)},apad=whole_dur=${duration.toFixed(3)}[a]`;
    await runFfmpeg(['-y', '-loglevel', 'error', '-i', mus, '-i', voice, '-filter_complex', mixFc, '-map', '[a]', '-ar', '44100', '-ac', '2', mix]).done;
    // two-pass loudnorm to -14 LUFS, TP -1.5
    const meas = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', mix, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], { encoding: 'utf8' });
    const js = JSON.parse(meas.stderr.slice(meas.stderr.lastIndexOf('{'), meas.stderr.lastIndexOf('}') + 1));
    const ln = `loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${js.input_i}:measured_TP=${js.input_tp}:measured_LRA=${js.input_lra}:measured_thresh=${js.input_thresh}:offset=${js.target_offset}:linear=true`;
    const norm = path.join(tmp, 'norm.wav');
    await runFfmpeg(['-y', '-loglevel', 'error', '-i', mix, '-af', ln, '-ar', '44100', norm]).done;
    await runFfmpeg(['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-i', norm, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-t', duration.toFixed(3), '-movflags', '+faststart', outFile]).done;
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  const pj = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size,bit_rate:stream=codec_name,width,height,r_frame_rate', '-of', 'json', outFile]).toString());
  // QA: frozen stretches (> 0.5 s with almost no pixel change) and loudness
  const fz = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', outFile, '-vf', 'freezedetect=n=-52dB:d=0.5', '-an', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const freezes = []; let cur = null;
  for (const l of fz.split('\n')) { let m = l.match(/freeze_start: ([\d.]+)/); if (m) cur = { start: +m[1] }; m = l.match(/freeze_duration: ([\d.]+)/); if (m && cur) { cur.dur = +m[1]; freezes.push(cur); cur = null; } }
  const lu = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', outFile, '-af', 'ebur128=peak=true', '-vn', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const sum = lu.slice(lu.lastIndexOf('Summary:'));
  const lufs = (sum.match(/I:\s+(-?[\d.]+) LUFS/) || [])[1], tp = (sum.match(/Peak:\s+(-?[\d.]+) dBFS/) || [])[1];
  console.log(JSON.stringify({ qa: { freezes, lufs: +lufs, truePeakDb: +tp } }));
  console.log(JSON.stringify({ out: outFile, cover: coverFile, duration: +(+pj.format.duration).toFixed(2), size: +pj.format.size, bitrate: +pj.format.bit_rate, streams: pj.streams.map(s => `${s.codec_name}${s.width ? ' ' + s.width + 'x' + s.height + ' ' + s.r_frame_rate : ''}`), renderSeconds: +((Date.now() - T0) / 1000).toFixed(0), workers: W }));
})().catch(e => { console.error(e && e.stack || e); process.exit(1); });
