#!/usr/bin/env python3
"""Make the looping background music for the dirt-bike game (audio/ride.mp3) from audio/raw/dirt_bike_music.mp3. That recording is already a clean loop, so it is only
trimmed of the MP3 encoder's padding at both ends (a few milliseconds, which would otherwise leave a click or a gap at the seam) and evened out in loudness; the game
turns it down far further. (If you ever swap in a recording that fades in and out, set CROSSFADE to e.g. 2.0: the end is then cross-faded into the start.)
Run from the project root:  python3 audio/tools/make_ride_music.py     (needs ffmpeg)"""
import subprocess, os
SRC, OUT, CROSSFADE = 'audio/raw/dirt_bike_music.mp3', 'audio/ride.mp3', 0
dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', SRC], capture_output=True, text=True, check=True).stdout)
a, b = (0.03, dur - 0.05) if not CROSSFADE else (0.5, dur - 1.2)
if not CROSSFADE:
    fc = f'[0:a]atrim={a}:{b},asetpts=PTS-STARTPTS,loudnorm=I=-17:TP=-1.5[o]'
else:
    X = CROSSFADE
    fc = (f'[0:a]atrim={a}:{b},asetpts=PTS-STARTPTS,asplit=2[x][y];[x]atrim={X}:{b - a},asetpts=PTS-STARTPTS[main];[y]atrim=0:{X},asetpts=PTS-STARTPTS[head];'
          f'[main][head]acrossfade=d={X}:c1=qsin:c2=qsin,loudnorm=I=-17:TP=-1.5[o]')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', SRC, '-filter_complex', fc, '-map', '[o]', '-ar', '32000', '-codec:a', 'libmp3lame', '-qscale:a', '5', OUT], check=True)
print(f'ride music: {dur:.1f}s -> {os.path.getsize(OUT) // 1024} KB')
