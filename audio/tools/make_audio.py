#!/usr/bin/env python3
"""Cut the raw downloads in audio/raw/ into the game's sound files in audio/ (loops are made seamless with an equal-power crossfade).
Run from the project root:  python3 audio/tools/make_audio.py     (needs ffmpeg, numpy)"""
import subprocess, os, numpy as np, wave

RAW, OUT = 'audio/raw', 'audio'

def load(name, sr):
    p = subprocess.run(['ffmpeg', '-v', 'error', '-i', f'{RAW}/{name}.mp3', '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-'], capture_output=True, check=True)
    return np.frombuffer(p.stdout, dtype=np.float32).astype(np.float64)

def seg(x, sr, t0, t1): return x[int(t0 * sr):int(t1 * sr)].copy()

def xfade_join(a, b, n):                       # a then b, overlapped by n samples (equal power)
    t = np.linspace(0, np.pi / 2, n)
    mid = a[-n:] * np.cos(t) + b[:n] * np.sin(t)
    return np.concatenate([a[:-n], mid, b[n:]])

def loopify(s, n):                             # make s loop seamlessly: the tail continues into the head
    L = len(s) - n; t = np.linspace(0, np.pi / 2, n)
    out = s[:L].copy(); out[:n] = s[:n] * np.sin(t) + s[L:L + n] * np.cos(t); return out

def fade(s, sr, fin=0.0, fout=0.0):
    s = s.copy(); a, b = int(fin * sr), int(fout * sr)
    if a: s[:a] *= np.linspace(0, 1, a) ** 1.5
    if b: s[-b:] *= np.linspace(1, 0, b) ** 1.5
    return s

def norm(s, rms_db=-20.0, peak=0.95):
    r = np.sqrt(np.mean(s ** 2)) + 1e-9; g = 10 ** (rms_db / 20) / r; s = s * g
    m = np.abs(s).max(); return s * (peak / m) if m > peak else s

def write(name, s, sr, q=3):
    wav = f'/tmp/_{name}.wav'
    with wave.open(wav, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((np.clip(s, -1, 1) * 32767).astype('<i2').tobytes())
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-codec:a', 'libmp3lame', '-qscale:a', str(q), f'{OUT}/{name}.mp3'], check=True)
    print(f'{name}: {len(s) / sr:.2f}s, {os.path.getsize(f"{OUT}/{name}.mp3") // 1024} KB')

# idle: the steady stretch of the clip (it starts up before and winds down after)
sr = 24000; x = load('bike_idle', sr)
write('engine_idle', norm(loopify(seg(x, sr, 2.0, 8.4), int(0.35 * sr))), sr)

# high revs: the two sustained bursts of the clip, joined and looped
sr = 24000; x = load('bike_highrev', sr)
a, b = seg(x, sr, 3.72, 4.62), seg(x, sr, 5.08, 5.88)
write('engine_high', norm(loopify(xfade_join(a, b, int(0.12 * sr)), int(0.12 * sr))), sr)

# the throttle blip (used when the rider lets go to jump)
sr = 44100; x = load('bike_midrev', sr)
write('rev_blip', norm(fade(seg(x, sr, 0.42, 2.45), sr, 0.03, 0.35), -18), sr)

# crash and the rider's bounce (one thump of the clip)
sr = 44100; x = load('bike_crash', sr)
write('crash', norm(fade(seg(x, sr, 0.03, 1.7), sr, 0.0, 0.4), -16), sr)
x = load('biker_bounce', sr)
write('bounce', norm(fade(seg(x, sr, 0.36, 1.0), sr, 0.005, 0.25), -16), sr)
