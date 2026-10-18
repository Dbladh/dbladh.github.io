#!/usr/bin/env python3
"""Make the looping background music for the dirt-bike game (audio/ride.mp3) from audio/raw/dirt_bike_music.mp3: the recording's quiet fade-in and fade-out are trimmed
off, and its last 2 s are cross-faded into its first 2 s so the loop has no seam; evened out in loudness (the game turns it down far further).
Run from the project root:  python3 audio/tools/make_ride_music.py     (needs ffmpeg)"""
import subprocess, os
SRC, OUT, X = 'audio/raw/dirt_bike_music.mp3', 'audio/ride.mp3', 2.0
dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', SRC], capture_output=True, text=True, check=True).stdout)
a, b = 0.5, dur - 1.2                                    # the part worth keeping
fc = (f'[0:a]atrim={a}:{b},asetpts=PTS-STARTPTS,asplit=2[x][y];'
      f'[x]atrim={X}:{b - a},asetpts=PTS-STARTPTS[main];[y]atrim=0:{X},asetpts=PTS-STARTPTS[head];'
      f'[main][head]acrossfade=d={X}:c1=qsin:c2=qsin,loudnorm=I=-17:TP=-1.5[o]')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', SRC, '-filter_complex', fc, '-map', '[o]', '-ar', '32000', '-codec:a', 'libmp3lame', '-qscale:a', '5', OUT], check=True)
print(f'ride music: {dur:.1f}s -> {os.path.getsize(OUT) // 1024} KB')
