'use strict';
const fs = require('fs');
const path = require('path');

// script.voiceover:
//   { "file": "vo.wav", "offset": 0, "gain": 1, "musicGain": 0.35 }       -> ready-made recording
//   { "provider": "<name>", ...providerOptions }                         -> lib/tts/<name>.js
// A provider module exports:
//   async synthesize({ text, segments, outFile, options }) -> { file, offset? }
//   segments: [{ start, end, text }] — caption chunks with absolute times, for timed TTS.
async function resolveVoiceover(script, { scriptDir, tmpDir, captions }) {
  const vo = script.voiceover;
  if (!vo) return null;
  if (vo.file) {
    const file = path.resolve(scriptDir, vo.file);
    if (!fs.existsSync(file)) throw new Error('voiceover.file not found: ' + file);
    return { file, offset: vo.offset || 0, gain: vo.gain != null ? vo.gain : 1, musicGain: vo.musicGain != null ? vo.musicGain : 0.35 };
  }
  if (vo.provider) {
    if (!/^[a-z0-9_-]+$/i.test(vo.provider)) throw new Error('bad provider name');
    const mod = path.join(__dirname, 'tts', vo.provider + '.js');
    if (!fs.existsSync(mod)) throw new Error(`TTS provider "${vo.provider}" not installed: create ${mod}`);
    const segments = captions.map(c => ({ start: c.t0, end: c.t1, text: c.text }));
    const text = vo.text || segments.map(s => s.text).join(' ');
    const outFile = path.join(tmpDir, 'voiceover.wav');
    const res = await require(mod).synthesize({ text, segments, outFile, options: vo });
    return { file: res.file || outFile, offset: res.offset || vo.offset || 0, gain: vo.gain != null ? vo.gain : 1, musicGain: vo.musicGain != null ? vo.musicGain : 0.35 };
  }
  return null;
}

module.exports = { resolveVoiceover };
