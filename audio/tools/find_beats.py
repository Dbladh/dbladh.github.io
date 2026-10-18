#!/usr/bin/env python3
"""Find the beats of the house song (audio/raw/soft_melody.mp3) so the billboards can light up in time with it (see SONG_BEATS in js/audio.js).
Onset strength from a log-magnitude spectral flux, a first estimate of the beat period from its autocorrelation, then a dynamic-programming beat tracker (Ellis, 2007)
that lets the tempo drift a little. Prints the beat times (seconds) and which of the three positions in a bar is the strongest (the downbeat; the song is in 3/4).
Run from the project root:  python3 audio/tools/find_beats.py     (needs ffmpeg, numpy)"""
import subprocess, numpy as np
p = subprocess.run(['ffmpeg', '-v', 'error', '-i', 'audio/raw/soft_melody.mp3', '-ac', '1', '-ar', '22050', '-f', 'f32le', '-'], capture_output=True, check=True)
x = np.frombuffer(p.stdout, dtype=np.float32).astype(np.float64); sr = 22050
hop = 256; n = (len(x) - 1024) // hop; win = np.hanning(1024); prev = None; flux = []
for i in range(n):
    f = np.abs(np.fft.rfft(x[i * hop:i * hop + 1024] * win)); m = np.log1p(f * 20)
    flux.append(0 if prev is None else np.maximum(m - prev, 0).sum()); prev = m
flux = np.array(flux); flux = np.maximum(flux - np.convolve(flux, np.ones(43) / 43, 'same'), 0); flux /= flux.max()
fr = sr / hop
ac = np.correlate(flux, flux, 'full')[len(flux) - 1:]; lo, hi = int(fr * 60 / 200), int(fr * 60 / 50)
T = max(range(lo, hi), key=lambda k: ac[k])
cum = flux.copy(); back = np.zeros(len(flux), int) - 1
for i in range(len(flux)):
    a, b = int(i - 2 * T), int(i - T / 2)
    if b <= 0: continue
    idx = np.arange(max(0, a), b)
    if len(idx) == 0: continue
    v = cum[idx] - 120.0 * (np.log((i - idx) / T)) ** 2; j = np.argmax(v); cum[i] = flux[i] + v[j]; back[i] = idx[j]
end = int(np.argmax(cum[-int(2 * T):])) + len(cum) - int(2 * T); beats = [end]
while back[beats[-1]] >= 0: beats.append(back[beats[-1]])
beats = np.array(beats[::-1]) * hop / sr
st = np.array([flux[min(len(flux) - 1, int(b * fr))] for b in beats])
print('beat period (s):', round(T / fr, 3), ' beats:', len(beats), ' strongest position in the bar:', int(np.argmax([st[k::3].sum() for k in range(3)])))
print(','.join(f'{b:.2f}' for b in beats))
