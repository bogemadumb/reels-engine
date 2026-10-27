# transcribes build/<ep>/scenes/*.wav with faster-whisper and prints expected vs heard (remote machine, whisper-venv)
import sys, json, os, glob, re, subprocess
import numpy as np
from faster_whisper import WhisperModel
ep = sys.argv[1]; model = sys.argv[2] if len(sys.argv) > 2 else 'medium'
base = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'build', ep)
tm = json.load(open(os.path.join(base, 'timing.json')))
def load(p):
    raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', p, '-ac', '1', '-ar', '16000', '-f', 's16le', '-'], capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768
m = WhisperModel(model, device='cpu', compute_type='int8', cpu_threads=3)
for sc in tm['scenes']:
    segs, _ = m.transcribe(load(os.path.join(base, 'scenes', sc['id'] + '.wav')), language='ru', beam_size=5, vad_filter=False, word_timestamps=False)
    heard = ' '.join(s.text.strip() for s in segs)
    want = ' '.join(w['sp'] for w in sc['words'])
    print('[%s]\n  want : %s\n  heard: %s' % (sc['id'], want, heard), flush=True)
