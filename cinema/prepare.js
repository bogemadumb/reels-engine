#!/usr/bin/env node
'use strict';
// Voice stage of a desktop-cinema clip (runs needs ELEVENLABS_API_KEY or a macOS Keychain entry, plus an optional proxy).
//   node cinema/prepare.js <ep> [--stop-warp]
// episodes/<ep>.json -> ElevenLabs eleven_v3 per scene (cached) -> build/<ep>/{voice.wav, timing.json, scenes/*.wav}
// episodes/<ep>.seeds.json {sceneId: seed} regenerates a single scene (different cache key).
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const el = require('../lib/tts/elevenlabs');
const { build, chunk } = require('./lib/script-text');
function writeWav(file, mono, sr) {
  const n = mono.length, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(mono[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(file, b);
}

const ROOT = __dirname;
const ep = process.argv[2];
if (!ep) { console.error('usage: node cinema/prepare.js <ep>'); process.exit(2); }
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'episodes', ep + '.json'), 'utf8'));
const seedsFile = path.join(ROOT, 'episodes', ep + '.seeds.json');
const seeds = fs.existsSync(seedsFile) ? JSON.parse(fs.readFileSync(seedsFile, 'utf8')) : {};
const OUT = path.join(ROOT, 'build', ep);
fs.mkdirSync(path.join(OUT, 'scenes'), { recursive: true });

const SR = 44100;
const LEAD = 0.12;          // silence before the first word
const GAP = { h: 0.10, def: 0.22 };
const TAIL = 0.5;           // hold after the last word

function decodePcm(file) {
  const b = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  return new Float32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4));
}

const scenes = [];
let credits = 0;
for (const sc of cfg.scenes) {
  const b = build(sc.voice);
  const opt = { voice: cfg.voice || 'narrator', model: cfg.model || 'eleven_v3' };
  if (cfg.stability != null) opt.stability = cfg.stability;
  if (seeds[sc.id] != null) opt.seed = seeds[sc.id];
  const r = el.speakTs(b.text, opt);
  credits += r.chars;
  const al = r.alignment;
  if (!al || al.characters.join('') !== b.text) {
    console.warn(`[${ep}/${sc.id}] alignment text differs from sent text; chars ${al ? al.characters.length : 0} vs ${b.text.length}`);
  }
  const st = al.character_start_times_seconds, en = al.character_end_times_seconds;
  const words = [];
  for (const t of b.tokens) {
    const a = st[t.c0], z = en[Math.min(en.length - 1, t.c1 - 1)];
    if (t.tag) continue;
    words.push({ s: t.screen, sp: t.spoken, t0: a, t1: z });
  }
  // merge dash tokens into the previous screen word
  const merged = [];
  for (const w of words) {
    if (w.s === '—' && merged.length) { merged[merged.length - 1].s += ' —'; merged[merged.length - 1].t1 = Math.max(merged[merged.length - 1].t1, w.t1); continue; }
    merged.push(w);
  }
  const speechStart = merged[0].t0, speechEnd = merged[merged.length - 1].t1;
  const cutFrom = Math.max(0, speechStart - 0.06), cutLen = speechEnd - cutFrom + 0.16;
  const wavFile = path.join(OUT, 'scenes', sc.id + '.wav');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', cutFrom.toFixed(3), '-t', cutLen.toFixed(3), '-i', r.file, '-ar', String(SR), '-ac', '1',
    '-af', 'afade=t=in:d=0.01,afade=t=out:st=' + (cutLen - 0.05).toFixed(3) + ':d=0.05', wavFile]);
  scenes.push({ id: sc.id, text: b.text, words: merged, cutFrom, speechStart, speechEnd, cutLen, wav: wavFile, mp3: r.file, cached: r.cached });
  console.log(`[${ep}/${sc.id}] ${r.cached ? 'cache' : 'NEW  '} ${r.chars} chars, speech ${(speechEnd - speechStart).toFixed(2)}s (${r.duration.toFixed(2)} file)`);
}

// assemble the timeline
let t = LEAD;
const total0 = scenes.length;
const pcm = [];
const placed = [];
scenes.forEach((s, i) => {
  const shift = t - s.cutFrom;           // alignment time -> clip time
  const tStart = t, tEnd = t + s.cutLen;
  placed.push({ s, shift, tStart, tEnd });
  t = tEnd + (s.id === 'h' ? GAP.h : GAP.def) - 0.06 * 0; // next scene
});
const duration = placed[placed.length - 1].tEnd + TAIL;
const buf = new Float32Array(Math.ceil(duration * SR));
for (const p of placed) {
  const x = decodePcm(p.s.wav), off = Math.round(p.tStart * SR);
  for (let i = 0; i < x.length && off + i < buf.length; i++) buf[off + i] += x[i];
}
writeWav(path.join(OUT, 'voice.wav'), buf, SR);

const timing = { id: ep, duration: +duration.toFixed(3), voiceFile: 'voice.wav', scenes: [] };
for (const p of placed) {
  const words = p.s.words.map(w => ({ s: w.s, sp: w.sp, t0: +(w.t0 + p.shift).toFixed(3), t1: +(w.t1 + p.shift).toFixed(3) }));
  timing.scenes.push({ id: p.s.id, t0: +p.tStart.toFixed(3), t1: +p.tEnd.toFixed(3), words });
}
// mouth envelope (numpy, ~1 s) -> also used to snap word starts to the real onset of sound
const env = spawnSync('python3', [path.join(ROOT, 'lib', 'envelope.py'), path.join(OUT, 'voice.wav'), path.join(OUT, 'voice.js')], { encoding: 'utf8' });
if (env.status !== 0) console.warn('envelope.py failed (run it on the render machine): ' + (env.stderr || '').slice(-300));
else {
  const V = JSON.parse(fs.readFileSync(path.join(OUT, 'voice.js'), 'utf8').replace('window.VOICE=', '').replace(/;$/, ''));
  let moved = 0;
  for (const sc of timing.scenes) {
    let prev = sc.t0;
    for (const w of sc.words) {
      let i = Math.floor(w.t0 * V.fps); const iEnd = Math.floor(w.t1 * V.fps);
      while (i < iEnd - 3 && V.env[i] < 0.16) i++;
      const nt = Math.max(w.t0, i / V.fps, prev);
      if (nt - w.t0 > 0.04) { w.t0 = +nt.toFixed(3); moved++; }
      prev = w.t0;
    }
    sc.speech0 = sc.words[0].t0; sc.speech1 = sc.words[sc.words.length - 1].t1;
  }
  console.log(`[${ep}] word starts snapped to sound onset: ${moved}`);
}
for (const sc of timing.scenes) {
  const ch = chunk(sc.words.map(w => ({ screen: w.s })));
  sc.chunks = ch.map(([a, b]) => ({ a, b, t0: sc.words[a].t0, text: sc.words.slice(a, b + 1).map(w => w.s).join(' ') }));
  sc.chunks.forEach((c, k) => { c.t1 = k + 1 < sc.chunks.length ? sc.chunks[k + 1].t0 : sc.t1; });
  sc.speech0 = sc.words[0].t0; sc.speech1 = sc.words[sc.words.length - 1].t1;
}
fs.writeFileSync(path.join(OUT, 'timing.json'), JSON.stringify(timing, null, 1));
console.log(`[${ep}] duration ${duration.toFixed(2)}s, new credits ${credits}`);
if (process.argv.includes('--stop-warp')) spawnSync('bash', [path.join(process.env.HOME, 'Documents/Система/warp-elevenlabs/stop.sh')]);
