#!/usr/bin/env python3
"""Fixed schedule for the ad reel (no voice-over). Writes timings.json (sound.py) and timings.js (index.html).

Each scene: start/end and `cues` — times when its items appear, shared by pictures and sound effects.
"""
import json
from pathlib import Path

SCENES = [
    ('hook', 0.0, 2.6, [0.0, 0.9]),
    ('pain', 2.6, 6.2, [2.9, 3.5, 4.1, 4.7]),
    ('turn', 6.2, 8.0, [6.3]),
    ('reveal', 8.0, 11.6, [8.1, 8.9, 9.7]),
    ('gets', 11.6, 16.4, [12.2, 13.0, 13.8, 14.6]),
    ('dm', 16.4, 19.4, [16.6, 17.5]),
    ('cta', 19.4, 22.4, [19.5, 20.4]),
]
timings = {'duration': 22.8, 'scenes': {s: {'id': s, 'start': a, 'end': b, 'cues': c} for s, a, b, c in SCENES}}
Path('timings.json').write_text(json.dumps(timings, ensure_ascii=False, indent=2))
Path('timings.js').write_text('window.T = ' + json.dumps(timings, ensure_ascii=False) + ';\n')
