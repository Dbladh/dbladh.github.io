#!/usr/bin/env python3
"""Make the little song that plays "from a house" (audio/song.mp3) from audio/raw/soft_melody.mp3: mono, 24 kHz, evened out in loudness, with a short fade in and a
long fade out. It is heard muffled and far away in the landscape, so the small file loses nothing.
Run from the project root:  python3 audio/tools/make_song.py     (needs ffmpeg)"""
import subprocess
dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', 'audio/raw/soft_melody.mp3'], capture_output=True, text=True, check=True).stdout)
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', 'audio/raw/soft_melody.mp3', '-ac', '1', '-ar', '24000',
                '-af', f'loudnorm=I=-22:TP=-3,afade=t=in:d=1.5,afade=t=out:st={dur - 5:.2f}:d=5', '-codec:a', 'libmp3lame', '-qscale:a', '6', 'audio/song.mp3'], check=True)
import os; print(f'song: {dur:.1f}s, {os.path.getsize("audio/song.mp3") // 1024} KB')
