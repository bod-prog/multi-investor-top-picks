#!/usr/bin/env python3
"""Voice-over for the USD-rate short: synthesize each line with Piper, then lay the scenes out around them.

Writes voice/*.wav, timings.json (read by sound.py) and timings.js (read by index.html),
so pictures, voice and sound effects always share one schedule.
Usage: python3 voice.py <piper-binary> <voice.onnx>
"""
import json
import subprocess
import sys
import wave
from pathlib import Path

PIPER, MODEL = sys.argv[1], sys.argv[2]
LENGTH_SCALE = '0.9'  # a little faster than the model default; shorts run brisk

# (scene id, text spoken, minimum scene length in seconds). Numbers are spelled out for the TTS.
LINES = [
    ('hook', 'У тринадцятому році долар коштував вісім гривень.', 3.0),
    ('chart', 'А потім почав рости. І сьогодні — сорок чотири вісімдесят три.', 5.4),
    ('compare', 'Тисяча гривень тоді — це сто двадцять п\'ять доларів. Сьогодні — лише двадцять два.', 4.2),
    ('forecast', 'У жовтні аналітики чекають сорок чотири — сорок п\'ять гривень. Без обвалу, але вгору.', 3.8),
    ('tips', 'Що робити? Не тримай усе в одній валюті. Гривні — в облігації чи на депозит. І не купуй валюту на паніці.', 4.6),
    ('cta', 'Підпишись — курс без паніки щотижня.', 3.0),
]
LEAD = {'hook': 0.15}  # voice starts this long after its scene; default below
DEFAULT_LEAD, TAIL = 0.35, 0.5

out = Path('voice')
out.mkdir(exist_ok=True)
t = 0.0
scenes = []
for sid, text, min_len in LINES:
    wav = out / f'{sid}.wav'
    subprocess.run([PIPER, '-m', MODEL, '-f', str(wav), '--length-scale', LENGTH_SCALE],
                   input=text.encode(), check=True, capture_output=True)
    with wave.open(str(wav)) as w:
        dur = w.getnframes() / w.getframerate()
    lead = LEAD.get(sid, DEFAULT_LEAD)
    length = max(min_len, lead + dur + TAIL)
    scenes.append({'id': sid, 'start': round(t, 2), 'end': round(t + length, 2),
                   'voice': round(t + lead, 2), 'voiceEnd': round(t + lead + dur, 2), 'file': str(wav)})
    print(f'{sid:9s} {t:6.2f}–{t + length:6.2f}  voice {dur:4.2f}s')
    t += length

timings = {'duration': round(t + 0.6, 2), 'scenes': {s['id']: s for s in scenes}}
Path('timings.json').write_text(json.dumps(timings, ensure_ascii=False, indent=2))
Path('timings.js').write_text('window.T = ' + json.dumps(timings, ensure_ascii=False) + ';\n')
print('duration', timings['duration'])
