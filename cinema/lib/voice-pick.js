#!/usr/bin/env node
'use strict';
// node cinema/lib/voice-pick.js <ep> <scene> "<regex that must be heard>" seed1 seed2 ...
// Generates the scene with each seed (cached), recognises it with mlx whisper turbo (Mac, ~3 s per scene) and prints transcript + PASS/FAIL.
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const el = require('../../lib/tts/elevenlabs');
const { build } = require('./script-text');
const [ep, sid, pat, ...seeds] = process.argv.slice(2);
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'episodes', ep + '.json'), 'utf8'));
const sc = cfg.scenes.find(s => s.id === sid);
const re = new RegExp(pat, 'i');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-'));
for (const seed of seeds.length ? seeds : [undefined]) {
  const b = build(sc.voice);
  const r = el.speakTs(b.text, { voice: 'narrator', model: 'eleven_v3', seed: seed == null ? undefined : +seed });
  const wav = path.join(tmp, `${sid}-${seed}.wav`);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', r.file, '-ar', '16000', '-ac', '1', wav]);
  execFileSync('mlx_whisper', [wav, '--model', 'mlx-community/whisper-large-v3-turbo', '--language', 'ru', '--output-format', 'txt', '--output-dir', tmp], { stdio: 'ignore' });
  const txt = fs.readFileSync(path.join(tmp, `${sid}-${seed}.txt`), 'utf8').replace(/\s+/g, ' ').trim();
  console.log(`${re.test(txt) ? 'PASS' : 'FAIL'} seed=${seed} ${r.cached ? '' : '(new, ' + r.chars + ' ch) '}| ${txt}`);
}
fs.rmSync(tmp, { recursive: true, force: true });
