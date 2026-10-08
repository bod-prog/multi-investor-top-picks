#!/usr/bin/env python3
"""Voice-over for the FOP taxes reel: synthesize each line with Piper, then lay the scenes out around them.

Writes voice/*.wav, timings.json (read by sound.py) and timings.js (read by index.html).
Each scene also gets `cues`: absolute times (from fractions of its line) when its items appear,
so pictures and sound effects land on the same words.
Usage: python3 voice.py <piper-binary> <voice.onnx>
"""
import json
import subprocess
import sys
import wave
from pathlib import Path

PIPER, MODEL = sys.argv[1], sys.argv[2]
LENGTH_SCALE = '0.85'

# (scene id, spoken text, minimum scene length s, cue fractions of the line). Numbers spelled out for TTS.
LINES = [
    ('hook', 'Податки ФОП у двадцять шостому році: що, скільки і коли платити.', 3.0, [0.55]),
    ('parts', 'ФОП платить три речі: єдиний податок, військовий збір і є-ес-ве.', 3.5, [0.42, 0.66, 0.9]),
    ('single', 'Єдиний податок: перша група — до трьохсот тридцяти трьох гривень, друга — до тисячі семисот тридцяти, третя — п\'ять відсотків.',
     4.0, [0.14, 0.44, 0.78]),
    ('military', 'Військовий збір: вісімсот шістдесят п\'ять гривень, а для третьої групи — один відсоток.', 3.5, [0.2, 0.66]),
    ('esv', 'Є-ес-ве — тисяча дев\'ятсот дві гривні на місяць. Навіть якщо доходу не було.', 3.5, [0.08, 0.62]),
    ('total', 'Разом друга група — майже чотири з половиною тисячі на місяць.', 3.5, [0.3]),
    ('limits', 'І стеж за лімітом: для другої групи — сім мільйонів двісті тисяч на рік.', 3.5, [0.18, 0.5, 0.82]),
    ('deadlines', 'Дедлайни: є-ес-ве за квартал — до дев\'ятнадцятого жовтня, декларація третьої групи — до дев\'ятого листопада.',
     4.5, [0.1, 0.3, 0.62, 0.84]),
    ('cta', 'Збережи, щоб не загубити.', 3.0, [0.1]),
]
LEAD = {'hook': 0.15}
DEFAULT_LEAD, TAIL = 0.3, 0.45

out = Path('voice')
out.mkdir(exist_ok=True)
t = 0.0
scenes = []
for sid, text, min_len, cues in LINES:
    wav = out / f'{sid}.wav'
    subprocess.run([PIPER, '-m', MODEL, '-f', str(wav), '--length-scale', LENGTH_SCALE],
                   input=text.encode(), check=True, capture_output=True)
    with wave.open(str(wav)) as w:
        dur = w.getnframes() / w.getframerate()
    lead = LEAD.get(sid, DEFAULT_LEAD)
    length = max(min_len, lead + dur + TAIL)
    v0 = t + lead
    scenes.append({'id': sid, 'start': round(t, 2), 'end': round(t + length, 2), 'voice': round(v0, 2),
                   'voiceEnd': round(v0 + dur, 2), 'cues': [round(v0 + dur * k, 2) for k in cues], 'file': str(wav)})
    print(f'{sid:9s} {t:6.2f}–{t + length:6.2f}  voice {dur:4.2f}s')
    t += length

timings = {'duration': round(t + 0.8, 2), 'scenes': {s['id']: s for s in scenes}}
Path('timings.json').write_text(json.dumps(timings, ensure_ascii=False, indent=2))
Path('timings.js').write_text('window.T = ' + json.dumps(timings, ensure_ascii=False) + ';\n')
print('duration', timings['duration'])
