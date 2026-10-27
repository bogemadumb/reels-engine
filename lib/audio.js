'use strict';
const fs = require('fs');

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const TAU = Math.PI * 2;

const PROGRESSIONS = {
  minor: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]],
  dark: [[0, 3, 7], [-4, 0, 3], [-7, -3, 0], [-5, -2, 2]],
  major: [[0, 4, 7], [-5, -1, 2], [-3, 0, 4], [-7, -3, 0]]
};

function synthesize(o) {
  const sr = o.sampleRate || 44100;
  const duration = o.duration;
  const n = Math.ceil(duration * sr);
  const L = new Float32Array(n), R = new Float32Array(n);
  const rnd = mulberry32(o.seed || 1);
  const noise = () => rnd() * 2 - 1;
  const bpm = o.bpm || 104;
  const beat = 60 / bpm, bar = beat * 4;
  const root = o.root || 57;
  const chords = PROGRESSIONS[o.mode || 'minor'] || PROGRESSIONS.minor;
  const mg = o.music === false ? 0 : (o.musicGain != null ? o.musicGain : 1);
  const sg = o.sfxGain != null ? o.sfxGain : 1;
  const cutoff = o.cutoff || 1400;

  const add = (buf, i, v) => { if (i >= 0 && i < n) buf[i] += v; };
  const addSt = (i, v, pan) => { add(L, i, v * (1 - Math.max(0, pan))); add(R, i, v * (1 + Math.min(0, pan))); };

  if (mg > 0 && o.style === 'ambient') {
    const chordLen = 8;
    const pad = new Float32Array(n);
    let lp1 = 0, lp2 = 0, lq1 = 0, lq2 = 0;
    const a = 1 - Math.exp(-TAU * (o.cutoff || 900) / sr);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const bi = Math.floor(t / chordLen);
      const tb = t - bi * chordLen;
      const ch = chords[bi % chords.length];
      const env = Math.min(1, tb / 2.2) * Math.min(1, (chordLen - tb) / 2.2);
      let v = 0;
      for (let c = 0; c < 3; c++) {
        const f = mtof(root + ch[c]);
        for (const det of [-0.09, 0.09]) {
          const ph = TAU * f * Math.pow(2, det / 12) * t;
          v += Math.sin(ph) + Math.sin(2 * ph) / 3 + Math.sin(3 * ph) / 7;
        }
      }
      const drone = Math.sin(TAU * mtof(root - 24) * t) * 1.4;
      const lfo = 0.8 + 0.2 * Math.sin(TAU * t / 11.0);
      lp1 += a * (v - lp1); lp2 += a * (lp1 - lp2);
      pad[i] = (lp2 * env * 0.03 + drone * 0.018) * lfo;
    }
    for (let i = 0; i < n; i++) { const v = pad[i] * mg; L[i] += v * 0.95; R[i] += v * 1.05; }
  } else if (mg > 0) {
    const duck = new Float32Array(n).fill(1);
    const kicks = [];
    for (let t = 0; t < duration; t += beat) kicks.push(t);
    for (const tk of kicks) {
      const i0 = Math.floor(tk * sr), len = Math.floor(0.3 * sr);
      for (let k = 0; k < len && i0 + k < n; k++) duck[i0 + k] = Math.min(duck[i0 + k], 1 - 0.55 * Math.exp(-k / sr / 0.1));
    }

    const pad = new Float32Array(n);
    let lp1 = 0, lp2 = 0;
    const a = 1 - Math.exp(-TAU * cutoff / sr);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const bi = Math.floor(t / bar);
      const tb = t - bi * bar;
      const ch = chords[bi % chords.length];
      const env = Math.min(1, tb / 0.35) * Math.min(1, (bar - tb) / 0.25);
      let v = 0;
      for (let c = 0; c < 3; c++) {
        const f = mtof(root + ch[c]);
        for (const det of [-0.11, 0.11]) {
          const ph = TAU * f * Math.pow(2, det / 12) * t;
          v += Math.sin(ph) + Math.sin(2 * ph) / 2 + Math.sin(3 * ph) / 3 + Math.sin(4 * ph) / 4 + Math.sin(5 * ph) / 5;
        }
      }
      lp1 += a * (v - lp1); lp2 += a * (lp1 - lp2);
      pad[i] = lp2 * env * 0.022;
    }
    for (let i = 0; i < n; i++) { const v = pad[i] * duck[i] * mg; L[i] += v; R[i] += v; }

    for (let t = 0, k = 0; t < duration; t += beat / 2, k++) {
      const bi = Math.floor(t / bar);
      const ch = chords[bi % chords.length];
      const f = mtof(root - 12 + ch[0] + (k % 8 === 7 ? 12 : 0));
      const i0 = Math.floor(t * sr), len = Math.floor(0.26 * sr);
      for (let j = 0; j < len; j++) {
        const tt = j / sr;
        const env = Math.min(1, tt / 0.004) * Math.exp(-tt / 0.13);
        const ph = TAU * f * tt;
        const v = (Math.sin(ph) + 0.45 * Math.sin(2 * ph) + 0.18 * Math.sin(3 * ph)) * env * 0.16 * mg;
        const di = i0 + j < n ? duck[i0 + j] : 1;
        addSt(i0 + j, v * di, 0);
      }
    }

    const ARP = [0, 1, 2, 1, 2, 0, 2, 1, 0, 2, 1, 2, 0, 1, 2, 3];
    for (let t = bar, k = 0; t < duration; t += beat / 4, k++) {
      const bi = Math.floor(t / bar);
      const ch = chords[bi % chords.length];
      const idx = ARP[k % ARP.length];
      const note = root + 12 + (idx === 3 ? ch[0] + 12 : ch[idx]);
      const f = mtof(note);
      const i0 = Math.floor(t * sr), len = Math.floor(0.16 * sr);
      const pan = k % 2 ? 0.35 : -0.35;
      const vel = k % 4 === 0 ? 1 : 0.65;
      for (let j = 0; j < len; j++) {
        const tt = j / sr;
        const env = Math.min(1, tt / 0.003) * Math.exp(-tt / 0.07);
        const ph = (f * tt) % 1;
        const tri = 4 * Math.abs(ph - 0.5) - 1;
        const di = i0 + j < n ? duck[i0 + j] : 1;
        addSt(i0 + j, tri * env * 0.05 * vel * mg * di, pan);
      }
    }

    for (const tk of kicks) {
      const i0 = Math.floor(tk * sr), len = Math.floor(0.4 * sr);
      let ph = 0;
      for (let j = 0; j < len; j++) {
        const tt = j / sr;
        const f = 48 + 110 * Math.exp(-tt / 0.035);
        ph += TAU * f / sr;
        const v = Math.sin(ph) * Math.exp(-tt / 0.2) * 0.42 + (j < 120 ? noise() * 0.05 * (1 - j / 120) : 0);
        addSt(i0 + j, v * mg, 0);
      }
    }

    for (let t = beat / 2; t < duration; t += beat) {
      const i0 = Math.floor(t * sr), len = Math.floor(0.06 * sr);
      let prev = 0;
      for (let j = 0; j < len; j++) {
        const x = noise();
        const hp = x - prev; prev = x;
        addSt(i0 + j, hp * Math.exp(-j / sr / 0.022) * 0.045 * mg, 0.25);
      }
    }
    for (let t = bar + beat; t < duration; t += beat * 2) {
      const i0 = Math.floor(t * sr), len = Math.floor(0.22 * sr);
      let lp = 0;
      for (let j = 0; j < len; j++) {
        const tt = j / sr;
        const x = noise();
        lp += 0.35 * (x - lp);
        const v = ((x - lp) * 0.9 * Math.exp(-tt / 0.07) + Math.sin(TAU * 185 * tt) * 0.5 * Math.exp(-tt / 0.04)) * 0.13;
        addSt(i0 + j, v * mg, -0.1);
      }
    }
  }

  const sfx = {
    pop(i0) {
      const len = Math.floor(0.07 * sr); let ph = 0;
      for (let j = 0; j < len; j++) {
        const tt = j / sr; const f = 950 - 4200 * tt; ph += TAU * f / sr;
        addSt(i0 + j, Math.sin(ph) * Math.exp(-tt / 0.025) * 0.13 * sg, 0);
      }
    },
    blip(i0) {
      const len = Math.floor(0.12 * sr);
      for (let j = 0; j < len; j++) {
        const tt = j / sr; const f = tt < 0.05 ? 1180 : 1580;
        addSt(i0 + j, Math.sin(TAU * f * tt) * Math.exp(-((tt < 0.05 ? tt : tt - 0.05)) / 0.03) * 0.09 * sg, 0);
      }
    },
    tick(i0) {
      const len = Math.floor(0.09 * sr);
      for (let j = 0; j < len; j++) {
        const tt = j / sr;
        addSt(i0 + j, (Math.sin(TAU * 1760 * tt) + 0.5 * Math.sin(TAU * 2640 * tt)) * Math.exp(-tt / 0.03) * 0.08 * sg, 0);
      }
    },
    fail(i0) {
      const len = Math.floor(0.3 * sr);
      for (let j = 0; j < len; j++) {
        const tt = j / sr; const ph = (140 * tt - 30 * tt * tt) % 1;
        addSt(i0 + j, (ph < 0.5 ? 1 : -1) * Math.exp(-tt / 0.11) * 0.06 * sg, 0);
      }
    },
    key(i0) {
      const len = Math.floor(0.012 * sr); let prev = 0;
      for (let j = 0; j < len; j++) {
        const x = noise(); const hp = x - prev; prev = x;
        addSt(i0 + j, hp * (1 - j / len) * 0.06 * sg, 0.15);
      }
    },
    hit(i0) {
      const len = Math.floor(0.6 * sr); let ph = 0, lp = 0;
      for (let j = 0; j < len; j++) {
        const tt = j / sr; const f = 40 + 90 * Math.exp(-tt / 0.05); ph += TAU * f / sr;
        lp += 0.2 * (noise() - lp);
        addSt(i0 + j, (Math.sin(ph) * 0.5 * Math.exp(-tt / 0.25) + lp * 0.5 * Math.exp(-tt / 0.08)) * sg, 0);
      }
    },
    whoosh(i0, soft) {
      const d = soft ? 0.32 : 0.42;
      const len = Math.floor(d * sr); let l1 = 0, r1 = 0;
      for (let j = 0; j < len; j++) {
        const u = j / len;
        const fc = 250 + 5200 * Math.pow(u, 1.6);
        const a = 1 - Math.exp(-TAU * fc / sr);
        l1 += a * (noise() - l1); r1 += a * (noise() - r1);
        const env = Math.pow(Math.sin(Math.PI * u), 2) * (soft ? 0.12 : 0.2) * sg;
        add(L, i0 + j, l1 * env); add(R, i0 + j, r1 * env);
      }
    },
    swish(i0) { sfx.whoosh(i0, true); }
  };
  const muted = new Set(o.mute || []);
  for (const e of o.events || []) {
    const fn = sfx[e.type];
    if (fn && !muted.has(e.type)) fn(Math.floor(e.t * sr));
  }
  if (o.timerTick && sg > 0) {
    for (let t = 1; t < duration - 0.5; t += 1) {
      const i0 = Math.floor(t * sr), len = Math.floor(0.03 * sr);
      for (let j = 0; j < len; j++) {
        const tt = j / sr;
        addSt(i0 + j, Math.sin(TAU * 1200 * tt) * Math.exp(-tt / 0.008) * 0.035 * sg, 0);
      }
    }
  }

  const fin = Math.floor(0.03 * sr), fout = Math.floor(Math.min(1.2, duration / 4) * sr);
  let peak = 1e-9;
  for (let i = 0; i < n; i++) {
    let g = 1;
    if (i < fin) g = i / fin;
    if (i > n - fout) g = Math.max(0, (n - i) / fout);
    L[i] = Math.tanh(L[i] * 1.15) * g;
    R[i] = Math.tanh(R[i] * 1.15) * g;
    peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const norm = (o.style === 'ambient' ? 0.5 : 0.89) / peak;
  for (let i = 0; i < n; i++) { L[i] *= norm; R[i] *= norm; }
  return { sampleRate: sr, L, R };
}

function writeWav(file, { sampleRate, L, R }) {
  const n = L.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(sampleRate, 24); buf.writeUInt32LE(sampleRate * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767))), 44 + i * 4);
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767))), 46 + i * 4);
  }
  fs.writeFileSync(file, buf);
}

module.exports = { synthesize, writeWav };
