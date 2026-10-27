'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');

let lastCall = 0;
const VENV_PY = path.join(require('os').homedir(), 'edgevenv', 'bin', 'python');
const PY = process.env.REELS_TTS_PYTHON || (fs.existsSync(VENV_PY) ? VENV_PY : 'python3');

function run(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(PY, ['-m', 'edge_tts', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', d => { err += d; });
    p.on('error', reject);
    p.on('close', code => (code === 0 ? resolve() : reject(new Error('edge_tts failed: ' + err.slice(-400)))));
  });
}

function duration(file) {
  return parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString());
}

// text -> cached mp3 in cacheDir; returns { file, duration }
async function speak(text, { voice = 'ru-RU-DmitryNeural', rate = '+0%', pitch = '+0Hz', volume = '+0%', cacheDir }) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const key = crypto.createHash('sha1').update([voice, rate, pitch, volume, text].join('\n')).digest('hex').slice(0, 16);
  const file = path.join(cacheDir, `${voice.replace(/^ru-RU-/, '').replace(/Neural$/, '').toLowerCase()}-${key}.mp3`);
  if (!fs.existsSync(file) || fs.statSync(file).size < 500) {
    let last;
    for (let i = 0; i < 6; i++) {
      const wait = lastCall + 6000 - Date.now();
      if (wait > 0) await new Promise(r => setTimeout(r, wait));
      lastCall = Date.now();
      try {
        await run(['--voice', voice, `--rate=${rate}`, `--pitch=${pitch}`, `--volume=${volume}`, '--text', text, '--write-media', file]);
        if (fs.existsSync(file) && fs.statSync(file).size > 500) { last = null; break; }
      } catch (e) { last = e; }
      await new Promise(r => setTimeout(r, 15000));
    }
    if (last) throw last;
  }
  return { file, duration: duration(file) };
}

module.exports = { speak, duration };
