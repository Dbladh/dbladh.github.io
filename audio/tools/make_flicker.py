#!/usr/bin/env python3
"""Cut audio/raw/light_flicker.mp3 (about 18 s of mains hum, then three bursts of buzzing flicker near 18 s, a click at 27.8 s and another at 29.2 s)
into the sounds for the billboard lamps: fl_burst (the cluster of flickers), fl_tick1 and fl_tick2 (single crackles) and fl_hum (a seamless loop of the hum).
It also prints when the crackles happen inside each clip, which js/audio.js uses so the lamps flash in step with what is heard.
Run from the project root:  python3 audio/tools/make_flicker.py     (needs ffmpeg, numpy)"""
import subprocess, os, numpy as np, wave
SR = 32000
def load(hp=0):
    af = ['-af', f'highpass=f={hp}'] if hp else []
    p = subprocess.run(['ffmpeg', '-v', 'error', '-i', 'audio/raw/light_flicker.mp3', '-ac', '1', '-ar', str(SR), *af, '-f', 'f32le', '-'], capture_output=True, check=True)
    return np.frombuffer(p.stdout, dtype=np.float32).astype(np.float64)
x, h = load(), load(300)

def write(name, s, q=4):
    wav = f'/tmp/_{name}.wav'
    with wave.open(wav, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(s, -1, 1) * 32767).astype('<i2').tobytes())
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-codec:a', 'libmp3lame', '-qscale:a', str(q), f'audio/{name}.mp3'], check=True)
    print(f'{name}: {len(s) / SR:.2f}s, {os.path.getsize(f"audio/{name}.mp3") // 1024} KB')

def events(t0, t1):
    """Crackles inside [t0, t1] as (start, length, strength 0..1) relative to t0, from the loudness of the high frequencies (5 ms steps)."""
    seg = h[int(t0 * SR):int(t1 * SR)]; n = int(0.005 * SR)
    env = np.array([np.sqrt(np.mean(seg[i:i + n] ** 2)) for i in range(0, len(seg) - n, n)])
    th = max(np.median(env) * 6, 0.004); out = []; i = 0
    while i < len(env):
        if env[i] > th:
            j = i
            while j < len(env) and env[j] > th * 0.5: j += 1
            out.append((round(i * 0.005, 3), round(max(0.04, (j - i) * 0.005), 3), float(env[i:j].max()))); i = j + 4
        else: i += 1
    top = max(e[2] for e in out) if out else 1
    return [(a, b, round(c / top, 2)) for a, b, c in out]

def clip(name, t0, t1, fin=0.01, fout=0.04, peak=0.85):
    s = x[int(t0 * SR):int(t1 * SR)].copy()
    s = s - np.mean(s); m = np.abs(s).max(); s = s * (peak / m)
    a, b = int(fin * SR), int(fout * SR); s[:a] *= np.linspace(0, 1, a); s[-b:] *= np.linspace(1, 0, b)
    write(name, s); print('  events', events(t0, t1))

clip('fl_burst', 17.85, 19.00)
clip('fl_tick1', 27.78, 28.02)
clip('fl_tick2', 29.12, 29.44)
# the hum: a steady stretch, made to loop, normalised (it is a quiet background under the crackles)
hum = x[int(3 * SR):int(13 * SR)].copy(); n = int(1.0 * SR); L = len(hum) - n; t = np.linspace(0, np.pi / 2, n)
loop = hum[:L].copy(); loop[:n] = hum[:n] * np.sin(t) + hum[L:L + n] * np.cos(t)
loop = loop - loop.mean(); loop *= 10 ** (-24 / 20) / (np.sqrt(np.mean(loop ** 2)) + 1e-9)
write('fl_hum', loop, q=6)
