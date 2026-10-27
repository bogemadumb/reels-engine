// shared helpers: easing, springs, voice access, deterministic random
window.C = (() => {
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = {
    out3: t => 1 - Math.pow(1 - t, 3), out5: t => 1 - Math.pow(1 - t, 5), in3: t => t * t * t,
    io3: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    io5: t => t < .5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2,
    back: t => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    exp: t => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)
  };
  // analytic damped spring, step 0->1 starting at t0. freq in Hz, damp ratio z
  const spring = (t, t0, f = 3, z = 0.35) => {
    const x = t - t0; if (x <= 0) return 0;
    const w = 2 * Math.PI * f, wd = w * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w * x) * (Math.cos(wd * x) + (z * w / wd) * Math.sin(wd * x));
  };
  // spring from a to b
  const sp = (t, t0, a, b, f, z) => a + (b - a) * spring(t, t0, f, z);
  const rnd = s => { const x = Math.sin(s * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const noise1 = (x, s = 0) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(rnd(i + s * 17.3), rnd(i + 1 + s * 17.3), u) * 2 - 1; };
  const V = window.VOICE;
  const vget = (key, t) => {
    if (!V) return 0; const x = t * V.fps, i = Math.floor(x), f = x - i; const arr = V[key];
    const a = arr[clamp(i, 0, V.n - 1)], b = arr[clamp(i + 1, 0, V.n - 1)]; return a + (b - a) * f;
  };
  const voice = t => ({ env: vget('env', t), open: vget('open', t), round: vget('round', t), wide: vget('wide', t), fric: vget('fric', t) });
  // blink: [start,dur] list, returns 0 open .. 1 closed
  const BLINKS = [0.9, 2.35, 3.9, 5.05, 6.1];
  const blink = (t, extra = []) => {
    let b = 0; for (const s of BLINKS.concat(extra)) { const x = (t - s) / 0.16; if (x > 0 && x < 1) b = Math.max(b, x < .45 ? x / .45 : 1 - (x - .45) / .55); } return b;
  };
  const ready = fn => { window.ready = Promise.all([document.fonts.ready, fn ? fn() : Promise.resolve()]); };
  return { clamp, lerp, ease, spring, sp, rnd, noise1, voice, blink, ready, T: 6.6 };
})();
// image helpers
window.C.pre = async urls => { await Promise.all(urls.map(async u => { const i = new Image(); i.src = u; try { await i.decode(); } catch (e) {} })); };
window.C.raf2 = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
// sequence frame url: dir with files 0001.jpg.. ; n frames @30fps; t seconds (clamped)
window.C.seqUrl = (dir, n, t, fps = 30) => `${dir}/${String(Math.min(n, Math.max(1, Math.floor(t * fps) + 1))).padStart(4, '0')}.jpg`;
