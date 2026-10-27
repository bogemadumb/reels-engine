'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const edge = require('./tts/edge');
const silero = require('./tts/silero');

// Scene field "voice": string | [string | {text, say}]. "text" goes to captions, "say" (optional) is what TTS reads.
// Every item becomes a part: scene._voiceParts = [{start, dur, text}] (seconds from scene start), scene.duration is fitted.
const stripMarks = s => String(s).replace(/\*/g, '');
const items = v => (Array.isArray(v) ? v : [v]).map(x => (typeof x === 'string' ? { text: x } : x));

async function prepare(script, { scriptDir, cacheDir }) {
  const cfg = script.voiceover;
  if (!cfg || (cfg.provider !== 'edge' && cfg.provider !== 'silero')) return null;
  const isSilero = cfg.provider === 'silero';
  const opt = isSilero
    ? { voice: cfg.voice || 'aidar', model: cfg.model || 'v5_ru', rate: cfg.tempo != null ? cfg.tempo : 1.0, cacheDir: cfg.cacheDir ? path.resolve(scriptDir, cfg.cacheDir) : cacheDir }
    : { voice: cfg.voice || 'ru-RU-DmitryNeural', rate: cfg.rate || '+0%', pitch: cfg.pitch || '+0Hz', volume: cfg.volume || '+0%', cacheDir: cfg.cacheDir ? path.resolve(scriptDir, cfg.cacheDir) : cacheDir };
  const lead = cfg.lead != null ? cfg.lead : 0.25, pad = cfg.pad != null ? cfg.pad : 0.4, gap = cfg.gap != null ? cfg.gap : 0.2;
  const flat = [];
  script.scenes.forEach((sc, i) => {
    if (sc.voice != null && sc.voice !== '') items(sc.voice).forEach(it => flat.push({ i, it, say: stripMarks(it.say || it.text) }));
  });
  const res = new Map();
  if (isSilero) {
    const uniq = Array.from(new Set(flat.map(f => f.say)));
    const out = await silero.speakMany(uniq, opt);
    uniq.forEach((t, k) => res.set(t, out[k]));
  } else {
    for (const f of flat) {
      if (res.has(f.say)) continue;
      try { res.set(f.say, await edge.speak(f.say, opt)); } catch (e) { throw new Error(`TTS failed: "${f.say}"`); }
    }
  }
  const clips = [];
  let t0 = 0;
  for (let i = 0; i < script.scenes.length; i++) {
    const sc = script.scenes[i];
    if (sc.voice != null && sc.voice !== '') {
      let t = sc.voiceAt != null ? sc.voiceAt : lead;
      const parts = [];
      for (const it of items(sc.voice)) {
        const r = res.get(stripMarks(it.say || it.text));
        parts.push({ start: +t.toFixed(3), dur: +r.duration.toFixed(3), text: it.text, file: r.file });
        t += r.duration + (it.gap != null ? it.gap : gap);
      }
      const need = t - gap + pad;
      sc.duration = +Math.max(need, sc.minDuration || 0).toFixed(3);
      sc._voiceParts = parts.map(p => ({ start: p.start, dur: p.dur, text: p.text }));
      parts.forEach(p => clips.push({ file: p.file, at: t0 + p.start }));
    }
    t0 += Number(sc.duration || 3);
  }
  return { clips, cfg, opt };
}

function ffmpeg(args) {
  return new Promise((res, rej) => {
    const p = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', d => { err += d; });
    p.on('close', c => (c === 0 ? res() : rej(new Error('ffmpeg failed: ' + err.slice(-1500)))));
  });
}

async function buildTrack(nar, { duration, outFile }) {
  const { clips, cfg } = nar;
  const inputs = [];
  clips.forEach(c => inputs.push('-i', c.file));
  const chains = clips.map((c, i) => `[${i}:a]aresample=44100,aformat=channel_layouts=mono,adelay=${Math.round(c.at * 1000)}:all=1[a${i}]`);
  const mix = `${clips.map((_, i) => `[a${i}]`).join('')}amix=inputs=${clips.length}:normalize=0:duration=longest,apad=whole_dur=${duration.toFixed(3)},atrim=0:${duration.toFixed(3)},loudnorm=I=-16:TP=-1.5:LRA=9,volume=${cfg.gain != null ? cfg.gain : 1}[out]`;
  await ffmpeg(['-y', '-loglevel', 'error', ...inputs, '-filter_complex', chains.concat(mix).join(';'), '-map', '[out]', '-ar', '44100', '-ac', '1', outFile]);
  return outFile;
}

module.exports = { prepare, buildTrack };
