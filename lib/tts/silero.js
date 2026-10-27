'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

// Silero TTS v4/v5 ru. Heavy part runs on a remote host over ssh (SILERO_HOST, ~/silero-tts/venv); if ~/silero-tts/venv exists locally it runs locally.
// Stress marks: put "+" before the stressed vowel in the "say" text. Latin letters and digits are rejected
// (Silero skips them silently): write words as they are pronounced.
const HOST = process.env.SILERO_HOST;
const LOCAL_PY = path.join(os.homedir(), 'silero-tts', 'venv', 'bin', 'python');
const LOCAL = fs.existsSync(LOCAL_PY);
const SYNTH = path.join(__dirname, 'silero_synth.py');

const sh = (cmd, args, opts) => execFileSync(cmd, args, Object.assign({ stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26 }, opts)).toString();

function duration(file) {
  return parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString());
}

function check(text) {
  const bad = text.match(/[A-Za-z0-9]+/g);
  if (bad) throw new Error(`silero: Latin letters/digits in say-text (${bad.slice(0, 4).join(', ')}) in: "${text}"`);
}

function keyOf(text, o) {
  return crypto.createHash('sha1').update([o.model, o.voice, o.rate, text].join('\n')).digest('hex').slice(0, 16);
}

// texts -> [{file, duration}], cached in cacheDir
async function speakMany(texts, { voice = 'aidar', model = 'v5_ru', rate = 1.0, cacheDir }) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const o = { voice, model, rate };
  const files = texts.map(t => path.join(cacheDir, `silero-${model}-${voice}-${keyOf(t, o)}.wav`));
  const todo = [];
  texts.forEach((t, i) => { if (!fs.existsSync(files[i]) || fs.statSync(files[i]).size < 2000) { check(t); todo.push(i); } });
  if (todo.length) {
    if (!LOCAL && (!HOST || !process.env.SILERO_USER)) throw new Error('silero: set SILERO_HOST and SILERO_USER (remote) or install ~/silero-tts/venv (local)');
    const id = 'job' + Date.now();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silero-'));
    const remoteDir = LOCAL ? path.join(os.homedir(), 'silero-tts', id) : `silero-tts/${id}`;
    const absRemote = LOCAL ? remoteDir : `/home/${process.env.SILERO_USER}/silero-tts/${id}`;
    const items = todo.map((i, k) => ({ model, speaker: voice, text: texts[i], out: `${absRemote}/${String(k).padStart(3, '0')}.wav` }));
    fs.writeFileSync(path.join(tmp, 'job.json'), JSON.stringify({ items }));
    if (LOCAL) {
      fs.mkdirSync(remoteDir, { recursive: true });
      fs.copyFileSync(path.join(tmp, 'job.json'), path.join(remoteDir, 'job.json'));
      sh(LOCAL_PY, [SYNTH, path.join(remoteDir, 'job.json')]);
    } else {
      sh('ssh', [HOST, `mkdir -p ${remoteDir}`]);
      sh('scp', ['-q', path.join(tmp, 'job.json'), SYNTH, `${HOST}:${remoteDir}/`]);
      const out = sh('ssh', [HOST, `cd ~/silero-tts && ./venv/bin/python ${absRemote}/silero_synth.py ${absRemote}/job.json 2>&1 | tail -3`]);
      if (!/SILERO_RESULT/.test(out)) throw new Error('silero synth failed: ' + out.slice(-800));
      sh('scp', ['-q', '-r', `${HOST}:${remoteDir}/.`, tmp + '/']);
    }
    todo.forEach((i, k) => {
      const raw = LOCAL ? path.join(remoteDir, `${String(k).padStart(3, '0')}.wav`) : path.join(tmp, `${String(k).padStart(3, '0')}.wav`);
      const tempo = Math.abs(rate - 1) > 0.005 ? ['-af', `atempo=${rate}`] : [];
      sh('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, ...tempo, '-ar', '48000', '-ac', '1', files[i]]);
    });
    if (!LOCAL) { try { sh('ssh', [HOST, `rm -rf ${remoteDir}`]); } catch (e) {} }
    else fs.rmSync(remoteDir, { recursive: true, force: true });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return files.map(f => ({ file: f, duration: duration(f) }));
}

module.exports = { speakMany };
