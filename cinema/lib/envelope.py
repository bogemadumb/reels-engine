# voice.wav -> window.VOICE (mouth envelope at 60 fps): open / round / wide / fric / env
# usage: envelope.py in.wav out.js
import numpy as np, subprocess, json, sys
inp, outp = sys.argv[1], sys.argv[2]
SR = 16000
raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', inp, '-ac', '1', '-ar', str(SR), '-f', 's16le', '-'], capture_output=True).stdout
x = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768
FPS = 60; hop = SR // FPS; win = 1024
n = len(x) // hop
w = np.hanning(win)
freqs = np.fft.rfftfreq(win, 1 / SR)
bands = {'low': (80, 500), 'mid': (500, 1500), 'hi': (1500, 4000), 'fr': (4000, 7500)}
rows = []
for i in range(n):
    c = i * hop + hop // 2
    seg = x[max(0, c - win // 2):c + win // 2]
    if len(seg) < win: seg = np.pad(seg, (0, win - len(seg)))
    s = np.abs(np.fft.rfft(seg * w)) ** 2
    e = {k: s[(freqs >= a) & (freqs < b)].sum() for k, (a, b) in bands.items()}
    rows.append((float(np.sqrt((seg ** 2).mean())), e))
rms = np.array([r[0] for r in rows])
ref = np.percentile(rms, 95)
env = np.clip(rms / ref, 0, 1.2)
tot = np.array([sum(r[1].values()) + 1e-12 for r in rows])
low = np.array([r[1]['low'] for r in rows]) / tot
hi = np.array([r[1]['hi'] for r in rows]) / tot
fr = np.array([r[1]['fr'] for r in rows]) / tot
def sm(a, k):
    ker = np.ones(k) / k
    return np.convolve(np.pad(a, (k // 2, k // 2), mode='edge'), ker, mode='valid')[:len(a)]
voiced = env > 0.06
envs = sm(env, 3)
opn = np.clip(envs ** 0.7 * 1.15, 0, 1)
rnd = sm(np.where(voiced, np.clip((low - 0.45) * 3, 0, 1), 0), 5)
wid = sm(np.where(voiced, np.clip((hi - 0.12) * 4, 0, 1), 0), 5)
fric = sm(np.where(voiced, np.clip((fr - 0.25) * 4, 0, 1), 0), 3)
opn = opn * (1 - 0.6 * fric)
r3 = lambda a: [round(float(v), 3) for v in a]
out = {'fps': FPS, 'n': n, 'env': r3(envs), 'open': r3(opn), 'round': r3(rnd), 'wide': r3(wid), 'fric': r3(fric)}
open(outp, 'w').write('window.VOICE=' + json.dumps(out) + ';')
