import sys, json, os, time
import numpy as np
import torch, soundfile as sf

torch.set_num_threads(4)
job = json.load(open(sys.argv[1], encoding='utf-8'))
cache = os.path.expanduser('~/.cache/silero')
models = {}


def load(ver):
    if ver not in models:
        imp = torch.package.PackageImporter(os.path.join(cache, ver + '.pt'))
        m = imp.load_pickle('tts_models', 'model')
        m.to(torch.device('cpu'))
        models[ver] = m
    return models[ver]


def trim(a, sr, thr_db=-42, head=0.03, tail=0.07):
    idx = np.where(np.abs(a) > 10 ** (thr_db / 20))[0]
    if len(idx) == 0:
        return a
    return a[max(0, idx[0] - int(head * sr)): min(len(a), idx[-1] + int(tail * sr))]


out = []
for it in job['items']:
    t0 = time.time()
    m = load(it.get('model', 'v5_ru'))
    kw = dict(speaker=it['speaker'], sample_rate=48000, put_accent=it.get('put_accent', True), put_yo=it.get('put_yo', True))
    a = m.apply_tts(text=it['text'], **kw).numpy()
    a = trim(a, 48000)
    sf.write(it['out'], a, 48000)
    out.append({'out': it['out'], 'sec': round(time.time() - t0, 2), 'dur': round(len(a) / 48000, 3)})
print('SILERO_RESULT ' + json.dumps(out))
