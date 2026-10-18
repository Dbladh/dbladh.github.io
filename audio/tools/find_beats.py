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
# The tempo changes through the song (about 85 a minute at the start, 94 around a minute and a quarter in, a slowing at the end): find the beat period around every moment
# (autocorrelation of the onset strength over an 8 s window, smoothed), then let the beat tracker follow that moving period.
W = int(8 * fr); Tt = np.zeros(len(flux)); lo, hi = int(fr * 0.55), int(fr * 0.85)
for i in range(len(flux)):
    a, b = max(0, i - W // 2), min(len(flux), i + W // 2); seg = flux[a:b]
    ac = np.correlate(seg, seg, 'full')[len(seg) - 1:]; ac /= ac[0] + 1e-9
    Tt[i] = max(range(lo, min(hi, len(ac) - 1)), key=lambda k: ac[k] * (1 - 0.35 * abs(k / fr - 0.68)))
Tt = np.convolve(np.pad(Tt, 40, mode='edge'), np.ones(81) / 81, 'valid')
cum = flux.copy(); back = np.zeros(len(flux), int) - 1
for i in range(len(flux)):
    T = Tt[i]; a, b = int(i - 1.6 * T), int(i - T / 1.6)
    if b <= 0: continue
    idx = np.arange(max(0, a), b)
    if len(idx) == 0: continue
    v = cum[idx] - 55.0 * (np.log((i - idx) / T)) ** 2; j = np.argmax(v); cum[i] = flux[i] + v[j]; back[i] = idx[j]
end = int(np.argmax(cum[-int(2 * Tt[-1]):])) + len(cum) - int(2 * Tt[-1]); beats = [end]
while back[beats[-1]] >= 0: beats.append(back[beats[-1]])
beats = np.array(beats[::-1]) * hop / sr
st = np.array([flux[min(len(flux) - 1, int(b * fr))] for b in beats])
d = np.diff(beats)
print('beats:', len(beats), ' beat period at 0, 30, 60, 75, 90, 110 s:', [round(float(d[np.argmin(np.abs(beats[:-1] - t))]), 3) for t in (0, 30, 60, 75, 90, 110)],
      ' strongest position in the bar:', int(np.argmax([st[k::3].sum() for k in range(3)])))
print(','.join(f'{b:.2f}' for b in beats))
