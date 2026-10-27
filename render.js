#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { pathToFileURL } = require('url');
const { synthesize, writeWav } = require('./lib/audio');
const { resolveVoiceover } = require('./lib/voiceover');
const narration = require('./lib/narration');

const ROOT = __dirname;
const USAGE = `usage: node render.js <script.json> [--out DIR] [--workers N] [--crf 18] [--preset medium]
                 [--quality 92] [--frames 0.5,3,10] [--safe] [--no-audio] [--fps 30] [--cover-only]
                 [--maxrate 2200] [--voice ru-RU-SvetlanaNeural] [--voice-only] [--no-layout-check]`;

function parseArgs(argv) {
  const a = { _: [], out: path.join(ROOT, 'out'), workers: 2, crf: 22, maxrate: 2200, preset: 'medium', quality: 92, frames: null, safe: false, audio: true, fps: null, coverOnly: false, voice: null, voiceOnly: false, layoutCheck: true };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => argv[++i];
    if (k === '--out') a.out = path.resolve(next());
    else if (k === '--workers') a.workers = Math.max(1, parseInt(next(), 10));
    else if (k === '--crf') a.crf = parseInt(next(), 10);
    else if (k === '--preset') a.preset = next();
    else if (k === '--maxrate') a.maxrate = parseInt(next(), 10);
    else if (k === '--voice') a.voice = next();
    else if (k === '--voice-only') a.voiceOnly = true;
    else if (k === '--no-layout-check') a.layoutCheck = false;
    else if (k === '--quality') a.quality = parseInt(next(), 10);
    else if (k === '--frames') a.frames = next().split(',').map(Number);
    else if (k === '--fps') a.fps = parseInt(next(), 10);
    else if (k === '--safe') a.safe = true;
    else if (k === '--no-audio') a.audio = false;
    else if (k === '--cover-only') a.coverOnly = true;
    else if (k === '-h' || k === '--help') { console.log(USAGE); process.exit(0); }
    else a._.push(k);
  }
  if (!a._[0]) { console.error(USAGE); process.exit(2); }
  return a;
}

function resolveMedia(node, dir) {
  if (Array.isArray(node)) return node.forEach(n => resolveMedia(n, dir));
  if (!node || typeof node !== 'object') return;
  for (const k of Object.keys(node)) {
    const v = node[k];
    if ((k === 'image' || k === 'src') && typeof v === 'string' && !/^(https?|data|file):/.test(v)) {
      const p = path.resolve(dir, v);
      if (!fs.existsSync(p)) throw new Error('media not found: ' + p);
      node[k] = pathToFileURL(p).href;
    } else resolveMedia(v, dir);
  }
}

function runFfmpeg(args, stdin) {
  const p = spawn('ffmpeg', args, { stdio: [stdin ? 'pipe' : 'ignore', 'ignore', 'pipe'] });
  let err = '';
  p.stderr.on('data', d => { err += d; });
  const done = new Promise((res, rej) => p.on('close', code => (code === 0 ? res() : rej(new Error('ffmpeg failed: ' + err.slice(-2000))))));
  return { p, done };
}

const writeChunk = (stream, buf) => new Promise((res, rej) => {
  if (stream.write(buf)) res(); else stream.once('drain', res);
  stream.once('error', rej);
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const T0 = Date.now();
  const scriptPath = path.resolve(args._[0]);
  const scriptDir = path.dirname(scriptPath);
  const script = JSON.parse(fs.readFileSync(scriptPath, 'utf8'));
  const channels = JSON.parse(fs.readFileSync(path.join(ROOT, fs.existsSync(path.join(ROOT, 'channels.json')) ? 'channels.json' : 'channels.example.json'), 'utf8'));
  const theme = channels[script.channel];
  if (!theme) throw new Error(`unknown channel "${script.channel}" (channels.json: ${Object.keys(channels).join(', ')})`);
  const name = script.name || path.basename(scriptPath, '.json');
  if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new Error('script.name must be Latin [A-Za-z0-9._-]: ' + name);
  const fps = args.fps || script.fps || 30;
  script.fps = fps;
  resolveMedia(script.scenes, scriptDir);
  fs.mkdirSync(args.out, { recursive: true });
  if (args.voice && script.voiceover) script.voiceover.voice = args.voice;
  const nar = await narration.prepare(script, { scriptDir, cacheDir: path.join(ROOT, 'voice-cache') });
  if (nar) {
    const total = script.scenes.reduce((a, sc) => a + Number(sc.duration || 3), 0);
    console.log(`[reels] narration ${nar.opt.voice}: ${nar.clips.length} phrases, total ${total.toFixed(2)}s`);
    if (args.voiceOnly) { console.log(JSON.stringify(script.scenes.map(sc => sc.duration))); return; }
  }
  const { chromium } = require('playwright');
  const tmpDir = path.join(args.out, '.tmp-' + name);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  const browser = await chromium.launch({
    args: ['--font-render-hinting=none', '--disable-lcd-text', '--force-color-profile=srgb', '--hide-scrollbars', '--disable-gpu']
  });
  const engineUrl = pathToFileURL(path.join(ROOT, 'engine', 'index.html')).href;
  async function openPage() {
    const context = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e));
    page.on('console', m => { if (m.type() === 'error') console.error('[page]', m.text()); });
    await page.goto(engineUrl);
    const info = await page.evaluate(([s, th, o]) => window.initReel(s, th, o), [script, theme, { safe: args.safe }]);
    if (errors.length) throw errors[0];
    if (args.layoutCheck && info.issues && info.issues.length) throw new Error('layout check failed:\n  ' + info.issues.join('\n  '));
    const cdp = await context.newCDPSession(page);
    const shot = async (t, ro, format, quality) => {
      await page.evaluate(([tt, r]) => window.renderFrame(tt, r), [t, ro || null]);
      if (errors.length) throw errors[0];
      const { data } = await cdp.send('Page.captureScreenshot', { format: format || 'jpeg', quality: quality || args.quality, optimizeForSpeed: true });
      return Buffer.from(data, 'base64');
    };
    return { page, info, shot };
  }

  const main = await openPage();
  const { duration, events, captions } = main.info;
  const nFrames = Math.round(duration * fps);
  console.log(`[reels] ${name}: ${script.scenes.length} scenes, ${duration.toFixed(2)}s, ${nFrames} frames @${fps}`);

  if (args.frames) {
    const dir = path.join(args.out, name + '-frames');
    fs.mkdirSync(dir, { recursive: true });
    for (const t of args.frames) {
      const buf = await main.shot(t, null, 'png');
      const f = path.join(dir, `t${t.toFixed(2)}.png`);
      fs.writeFileSync(f, buf);
      console.log(f);
    }
    await browser.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return;
  }

  const coverT = script.cover && script.cover.t != null ? script.cover.t : Math.min(duration - 0.1, 2.0);
  const coverFile = path.join(args.out, name + '.jpg');
  if (args.coverOnly) {
    fs.writeFileSync(coverFile, await main.shot(coverT, { cover: true }, 'jpeg', 92));
    await browser.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.log(coverFile);
    return;
  }

  let audioFile = null, vo = null, musicVol = 1;
  if (args.audio && script.audio !== false) {
    if (nar) {
      const track = await narration.buildTrack(nar, { duration, outFile: path.join(tmpDir, 'narration.wav') });
      const c = nar.cfg;
      vo = { file: track, offset: 0, gain: 1, musicGain: c.musicGain != null ? c.musicGain : 0.8, duck: c.duck !== false };
    } else vo = await resolveVoiceover(script, { scriptDir, tmpDir, captions });
    const m = Object.assign({}, theme.music || {}, script.music || {});
    musicVol = m.vol != null ? m.vol : 1;
    const wav = synthesize({
      duration, events, sampleRate: 44100,
      bpm: m.bpm, root: m.root, seed: m.seed, mode: m.mode, cutoff: m.cutoff,
      music: m.enabled !== false, style: m.style, mute: theme.mute, timerTick: !!theme.timerTick,
      musicGain: (m.gain != null ? m.gain : 1) * (vo ? vo.musicGain : 1),
      sfxGain: script.sfx === false ? 0 : (m.sfxGain != null ? m.sfxGain : 1)
    });
    audioFile = path.join(tmpDir, 'music.wav');
    writeWav(audioFile, wav);
    console.log(`[reels] audio: ${events.length} sfx events, music ${m.enabled === false ? 'off' : (m.bpm || 104) + ' bpm'}${vo ? ', voiceover ' + vo.file : ''}`);
  }

  const W = Math.min(args.workers, Math.max(1, Math.floor(nFrames / 60)));
  const pages = [main];
  for (let i = 1; i < W; i++) pages.push(await openPage());
  const per = Math.ceil(nFrames / W);
  const encArgs = ['-c:v', 'libx264', '-preset', args.preset, '-crf', String(args.crf),
    ...(args.maxrate ? ['-maxrate', args.maxrate + 'k', '-bufsize', args.maxrate * 2 + 'k'] : []),
    '-vf', 'scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-profile:v', 'high', '-g', String(fps * 2), '-r', String(fps)];
  let doneFrames = 0;
  const tRender = Date.now();
  const segs = await Promise.all(pages.map(async (pg, wi) => {
    const a = wi * per, b = Math.min(nFrames, a + per);
    const seg = path.join(tmpDir, `seg${wi}.mp4`);
    const ff = runFfmpeg(['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', ...encArgs, seg], true);
    for (let f = a; f < b; f++) {
      const buf = await pg.shot(f / fps);
      await writeChunk(ff.p.stdin, buf);
      doneFrames++;
      if (doneFrames % 90 === 0) {
        const s = (Date.now() - tRender) / 1000;
        console.log(`[reels] ${doneFrames}/${nFrames} frames, ${(doneFrames / s).toFixed(1)} fps`);
      }
    }
    ff.p.stdin.end();
    await ff.done;
    return seg;
  }));

  fs.writeFileSync(coverFile, await main.shot(coverT, { cover: true }, 'jpeg', 92));
  await browser.close();

  const list = path.join(tmpDir, 'list.txt');
  fs.writeFileSync(list, segs.map(s => `file '${s.replace(/'/g, "'\\''")}'`).join('\n'));
  const outFile = path.join(args.out, name + '.mp4');
  const mux = ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list];
  if (audioFile) {
    mux.push('-i', audioFile);
    if (vo) {
      const fc = vo.duck
        ? `[1:a]aresample=44100,volume=${musicVol}[m];[2:a]aresample=44100,volume=${vo.gain},asplit=2[vs][vm];[m][vs]sidechaincompress=threshold=0.04:ratio=4:attack=15:release=450:makeup=1[md];[md][vm]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[a]`
        : `[2:a]aresample=44100,adelay=${Math.round(vo.offset * 1000)}:all=1,volume=${vo.gain}[v];[1:a][v]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[a]`;
      mux.push('-i', vo.file, '-filter_complex', fc, '-map', '0:v', '-map', '[a]');
    } else mux.push('-map', '0:v', '-map', '1:a');
    mux.push('-c:a', 'aac', '-b:a', '128k', '-ar', '44100');
  } else mux.push('-map', '0:v');
  mux.push('-c:v', 'copy', '-t', duration.toFixed(3), '-movflags', '+faststart', outFile);
  await runFfmpeg(mux).done;
  fs.rmSync(tmpDir, { recursive: true, force: true });

  const probe = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height,r_frame_rate', '-of', 'json', outFile]).toString();
  const pj = JSON.parse(probe);
  const secs = (Date.now() - T0) / 1000;
  console.log(JSON.stringify({ out: outFile, cover: coverFile, duration: +(+pj.format.duration).toFixed(2), streams: pj.streams.map(s => `${s.codec_type}:${s.codec_name}${s.width ? ' ' + s.width + 'x' + s.height + ' ' + s.r_frame_rate : ''}`), renderSeconds: +secs.toFixed(1), workers: W }));
}

main().catch(e => { console.error(e && e.stack || e); process.exit(1); });
