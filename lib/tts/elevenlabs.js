'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync, execFileSync } = require('child_process');

// ElevenLabs TTS. The API can refuse some regions, so every request goes through an HTTP proxy
// (ELEVENLABS_PROXY, default 127.0.0.1:18080; an optional start script is ELEVENLABS_WARP_START).
// Voice aliases live in voices.json (see voices.example.json); a raw voice id also works.
// The key is read from the macOS Keychain (service "elevenlabs-api-key") and handed to curl on stdin:
// it never appears in argv, env or logs. Results are cached by (voice, model, settings, text):
// a repeated phrase costs no credits.
const PROXY = process.env.ELEVENLABS_PROXY || 'http://127.0.0.1:18080';
const WARP_START = process.env.ELEVENLABS_WARP_START || path.join(os.homedir(), 'bin', 'warp-elevenlabs-start');
const API = 'https://api.elevenlabs.io';

const VOICES_FILE = process.env.ELEVENLABS_VOICES_FILE || path.join(__dirname, '..', '..', 'voices.json');
const VOICES = fs.existsSync(VOICES_FILE) ? JSON.parse(fs.readFileSync(VOICES_FILE, 'utf8')) : {};

function getKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim();
  return execFileSync('security', ['find-generic-password', '-s', 'elevenlabs-api-key', '-w']).toString().trim();
}

function proxyUp() {
  const m = PROXY.match(/:(\d+)\/?$/);
  return spawnSync('nc', ['-z', '127.0.0.1', m ? m[1] : '18080']).status === 0;
}

function ensureProxy() {
  if (proxyUp()) return;
  if (!fs.existsSync(WARP_START)) throw new Error('elevenlabs: proxy down and ' + WARP_START + ' not found');
  const r = spawnSync('bash', [WARP_START], { encoding: 'utf8' });
  if (r.status !== 0 || !proxyUp()) throw new Error('elevenlabs: WARP proxy failed to start: ' + (r.stderr || r.stdout));
}

// curl through the proxy; headers (with the key) go over stdin config
function curl(method, apiPath, { body, outFile, extraHeaders = [] } = {}) {
  ensureProxy();
  const cfg = [`header = "xi-api-key: ${getKey()}"`, 'header = "Content-Type: application/json"']
    .concat(extraHeaders.map(h => `header = "${h}"`)).join('\n') + '\n';
  const args = ['-sS', '-m', '180', '-x', PROXY, '-K', '-', '-X', method, '-w', '\n%{http_code}'];
  let tmp = null;
  if (body) {
    tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'el-')), 'body.json');
    fs.writeFileSync(tmp, JSON.stringify(body), { mode: 0o600 });
    args.push('--data-binary', '@' + tmp);
  }
  if (outFile) args.push('-o', outFile);
  args.push(API + apiPath);
  const r = spawnSync('curl', args, { input: cfg, maxBuffer: 1 << 28 });
  if (tmp) fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
  if (r.status !== 0) throw new Error('elevenlabs: curl failed: ' + String(r.stderr).slice(0, 300));
  const out = r.stdout.toString('latin1');
  const code = parseInt(out.slice(out.lastIndexOf('\n') + 1), 10);
  return { code, text: outFile ? '' : r.stdout.toString('utf8').replace(/\n\d+$/, '') };
}

function subscription() {
  const r = curl('GET', '/v1/user/subscription');
  if (r.code !== 200) throw new Error('elevenlabs subscription ' + r.code + ': ' + r.text.slice(0, 200));
  const d = JSON.parse(r.text);
  return { tier: d.tier, used: d.character_count, limit: d.character_limit, left: d.character_limit - d.character_count, resetUnix: d.next_character_count_reset_unix };
}

function duration(file) {
  return parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString());
}

function settingsFor(model, o) {
  if (/^eleven_v3/.test(model)) return { stability: o.stability != null ? o.stability : 0.5 };
  const s = {
    stability: o.stability != null ? o.stability : 0.4,
    similarity_boost: o.similarity != null ? o.similarity : 0.8,
    style: o.style != null ? o.style : 0.35,
    use_speaker_boost: o.speakerBoost !== false
  };
  if (o.speed != null) s.speed = o.speed;
  return s;
}

const keyOf = (text, voiceId, model, vs, lang) => crypto.createHash('sha1').update([voiceId, model, JSON.stringify(vs), lang || '', text].join('\n')).digest('hex').slice(0, 16);

// one phrase -> {file, duration, cached}. file is an mp3 in cacheDir (or outFile when given).
function speak(text, o = {}) {
  const model = o.model || 'eleven_multilingual_v2';
  const voiceId = VOICES[o.voice] || o.voice;
  if (!voiceId) throw new Error('elevenlabs: voice is required');
  const cacheDir = o.cacheDir || path.join(__dirname, '..', '..', 'voice-cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  const vs = settingsFor(model, o);
  const lang = /^eleven_v3|multilingual|flash_v2_5|turbo_v2_5/.test(model) ? 'ru' : '';
  const name = `el-${o.voice && VOICES[o.voice] ? o.voice : voiceId.slice(0, 6)}-${model.replace('eleven_', '')}-${keyOf(text, voiceId, model, vs, lang)}.mp3`;
  const file = path.join(cacheDir, name);
  if (fs.existsSync(file) && fs.statSync(file).size > 1500) {
    if (o.outFile) fs.copyFileSync(file, o.outFile);
    return { file: o.outFile || file, duration: duration(file), cached: true, chars: 0 };
  }
  const body = { text, model_id: model, voice_settings: vs };
  if (lang && !/^eleven_v3/.test(model)) body.language_code = lang;
  if (o.seed != null) body.seed = o.seed;
  const tmp = file + '.part';
  let r = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    r = curl('POST', `/v1/text-to-speech/${voiceId}?output_format=${o.format || 'mp3_44100_128'}`, { body, outFile: tmp });
    if (r.code === 200) break;
    const msg = fs.existsSync(tmp) ? fs.readFileSync(tmp, 'utf8').slice(0, 300) : '';
    fs.rmSync(tmp, { force: true });
    if (r.code === 429 || r.code >= 500) { spawnSync('sleep', [String(3 * attempt)]); continue; }
    throw new Error(`elevenlabs TTS ${r.code}: ${msg}`);
  }
  if (r.code !== 200) throw new Error('elevenlabs TTS failed after retries: ' + r.code);
  fs.renameSync(tmp, file);
  if (o.outFile) fs.copyFileSync(file, o.outFile);
  return { file: o.outFile || file, duration: duration(file), cached: false, chars: text.length };
}

// texts -> [{file, duration}] (same shape as lib/tts/silero.speakMany)
async function speakMany(texts, opt) {
  return texts.map(t => speak(t, opt));
}

// provider interface of lib/voiceover.js (whole script as one text)
async function synthesize({ text, outFile, options }) {
  const r = speak(text, Object.assign({}, options, { outFile }));
  return { file: r.file };
}

// same as speak(), but through /with-timestamps: also returns the character alignment
// (cached next to the mp3 as .json). Falls back to {alignment:null} when the model gives none.
function speakTs(text, o = {}) {
  const model = o.model || 'eleven_v3';
  const voiceId = VOICES[o.voice] || o.voice;
  if (!voiceId) throw new Error('elevenlabs: voice is required');
  const cacheDir = o.cacheDir || path.join(__dirname, '..', '..', 'voice-cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  const vs = settingsFor(model, o);
  const lang = /^eleven_v3|multilingual|flash_v2_5|turbo_v2_5/.test(model) ? 'ru' : '';
  const stem = `elts-${o.voice && VOICES[o.voice] ? o.voice : voiceId.slice(0, 6)}-${model.replace('eleven_', '')}-${keyOf(text, voiceId, model, vs, (lang || '') + (o.seed != null ? '#' + o.seed : ''))}`;
  const file = path.join(cacheDir, stem + '.mp3'), meta = path.join(cacheDir, stem + '.json');
  if (fs.existsSync(file) && fs.existsSync(meta) && fs.statSync(file).size > 1500) {
    return { file, duration: duration(file), cached: true, chars: 0, alignment: JSON.parse(fs.readFileSync(meta, 'utf8')).alignment };
  }
  const body = { text, model_id: model, voice_settings: vs };
  if (lang && !/^eleven_v3/.test(model)) body.language_code = lang;
  if (o.seed != null) body.seed = o.seed;
  const tmp = file + '.part';
  let r = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    r = curl('POST', `/v1/text-to-speech/${voiceId}/with-timestamps?output_format=${o.format || 'mp3_44100_128'}`, { body, outFile: tmp });
    if (r.code === 200) break;
    const msg = fs.existsSync(tmp) ? fs.readFileSync(tmp, 'utf8').slice(0, 300) : '';
    fs.rmSync(tmp, { force: true });
    if (r.code === 429 || r.code >= 500) { spawnSync('sleep', [String(3 * attempt)]); continue; }
    throw new Error(`elevenlabs TTS ${r.code}: ${msg}`);
  }
  if (r.code !== 200) throw new Error('elevenlabs TTS failed after retries: ' + r.code);
  const j = JSON.parse(fs.readFileSync(tmp, 'utf8'));
  fs.rmSync(tmp, { force: true });
  fs.writeFileSync(file, Buffer.from(j.audio_base64, 'base64'));
  const alignment = j.alignment || j.normalized_alignment || null;
  fs.writeFileSync(meta, JSON.stringify({ text, alignment, normalized: j.normalized_alignment || null }));
  return { file, duration: duration(file), cached: false, chars: text.length, alignment };
}

module.exports = { speak, speakTs, speakMany, synthesize, subscription, ensureProxy, curl, VOICES };
