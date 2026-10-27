'use strict';
// Scene text markup: "{screen|spoken}" gives different text on screen and in the voice,
// "[tag]" is an eleven_v3 emotion tag (voice only). Everything else is shared.
function tokenize(marked) {
  const out = [];
  let i = 0, cur = '', depth = 0;
  for (const ch of marked) {
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (/\s/.test(ch) && depth === 0) { if (cur) out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out.map(raw => {
    if (/^\[[a-z ]+\]$/i.test(raw)) return { raw, tag: true, screen: null, spoken: raw };
    const m = raw.match(/^(.*?)\{([^|}]*)\|([^}]*)\}(.*)$/);
    if (m) return { raw, tag: false, screen: m[1] + m[2] + m[4], spoken: m[1] + m[3] + m[4] };
    return { raw, tag: false, screen: raw, spoken: raw };
  });
}

// -> { text (sent to TTS), tokens: [{screen, spoken, tag, c0, c1}] } with char offsets in text
function build(marked) {
  const toks = tokenize(marked);
  let text = '';
  for (const t of toks) {
    if (text) text += ' ';
    t.c0 = text.length; text += t.spoken; t.c1 = text.length;
  }
  return { text, tokens: toks };
}

const WEAK = /^(и|а|но|в|во|на|с|со|из|до|по|за|от|к|ко|о|об|у|не|ни|бы|ли|же|я|мне|нам|им|ещё|что|как|то|для|без|при|про|над|под|между)$/i;
const strip = w => w.replace(/[«»"“”.,:;?!…—()-]+/g, '');
// screen words [{screen}] -> caption chunks [[first,last]] of 2-4 words by dynamic programming:
// break after punctuation, never end on a preposition/particle, balanced sizes
function chunk(words) {
  const n = words.length, INF = 1e9;
  const best = new Array(n + 1).fill(INF), prev = new Array(n + 1).fill(-1);
  best[0] = 0;
  const cost = (a, b) => { // chunk words[a..b-1]
    const size = b - a; let c = size === 3 ? 0 : size === 4 ? 0.4 : size === 2 ? 0.5 : 6;
    const last = words[b - 1].screen, nextW = b < n ? strip(words[b].screen) : '';
    const brk = /[.,:;?!»…]$|—$/.test(last);
    if (b < n) c += brk ? 0 : 1.2;
    if (WEAK.test(strip(last)) && b < n) c += 3;
    if (/\d/.test(last) && !brk && b < n) c += 2;
    if (b < n && /^(бы|ли|же)$/i.test(nextW)) c += 3;
    for (let k = a; k < b - 1; k++) if (/[.?!]["»]?$/.test(words[k].screen)) c += 1.4;
    const chars = words.slice(a, b).map(w => w.screen).join(' ').length;
    if (chars > 26) c += (chars - 26) * 0.5;
    return c;
  };
  for (let b = 1; b <= n; b++) for (let sz = 1; sz <= 4; sz++) {
    const a = b - sz; if (a < 0 || best[a] >= INF) continue;
    const c = best[a] + cost(a, b); if (c < best[b]) { best[b] = c; prev[b] = a; }
  }
  const out = []; for (let b = n; b > 0; b = prev[b]) out.unshift([prev[b], b - 1]);
  return out;
}

module.exports = { tokenize, build, chunk };
