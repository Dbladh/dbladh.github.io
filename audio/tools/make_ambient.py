#!/usr/bin/env python3
"""Cut the long scene recordings in audio/raw/ (time_day, time_night, windmill) into short seamless loops in audio/ for the landscape:
the steadiest stretch is chosen (so no single bird or creak stands out on every repeat) and its end is crossfaded into its start.
Run from the project root:  python3 audio/tools/make_ambient.py     (needs ffmpeg, numpy)"""
import subprocess, os, numpy as np, wave, sys
sys.path.insert(0, os.path.dirname(__file__))

RAW, OUT, SR = 'audio/raw', 'audio', 32000
JOBS = [('time_day.mp3', 'amb_day', 28, 3, -26.0), ('time_night.ogg', 'amb_night', 30, 3, -26.0), ('windmill.mp3', 'amb_windmill', 24, 3, -24.0)]

def load(path):
    p = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True)
    return np.frombuffer(p.stdout, dtype=np.float32).astype(np.float64)

def steadiest(x, length, step=1.0):
    """The start (s) of the window whose loudness varies least from second to second."""
    n = int(SR * step); frames = np.array([np.sqrt(np.mean(x[i:i + n] ** 2)) + 1e-9 for i in range(0, len(x) - n, n)])
    w = int(length / step); best, bi = 1e9, 0
    for i in range(0, len(frames) - w):
        seg = frames[i:i + w]; v = np.std(np.log(seg)) + 0.3 * abs(np.log(seg[:3].mean() / seg[-3:].mean()))
        if v < best: best, bi = v, i
    return bi * step

def loopify(s, n):                       # the tail continues into the head (equal power)
    L = len(s) - n; t = np.linspace(0, np.pi / 2, n)
    out = s[:L].copy(); out[:n] = s[:n] * np.sin(t) + s[L:L + n] * np.cos(t); return out

def write(name, s, q=5):
    wav = f'/tmp/_{name}.wav'
    with wave.open(wav, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(s, -1, 1) * 32767).astype('<i2').tobytes())
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-codec:a', 'libmp3lame', '-qscale:a', str(q), f'{OUT}/{name}.mp3'], check=True)
    print(f'{name}: {len(s) / SR:.1f}s, {os.path.getsize(f"{OUT}/{name}.mp3") // 1024} KB')

for src, name, length, xf, db in JOBS:
    x = load(f'{RAW}/{src}'); t0 = steadiest(x, length + xf)
    s = loopify(x[int(t0 * SR):int((t0 + length + xf) * SR)], int(xf * SR))
    s = s - s.mean(); r = np.sqrt(np.mean(s ** 2)) + 1e-9; s = s * 10 ** (db / 20) / r
    m = np.abs(s).max(); s = s * (0.95 / m) if m > 0.95 else s
    print(f'{name}: from {t0:.0f}s of {src}', end='  '); write(name, s)
