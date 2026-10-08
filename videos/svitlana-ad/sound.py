#!/usr/bin/env python3
"""Soundtrack for the ad reel: tense A-minor beat under the pain points, a drop on "Стоп.",
then a bright C-major beat for the solution. Run with --no-voice (this reel has no voice-over).
All times come from timings.json (written by voice.py), the same schedule index.html uses.
Usage: python3 voice.py ... && python3 sound.py [--no-voice]  ->  sound.wav (44.1 kHz stereo)
--no-voice keeps the voice timings for the scenes but leaves the voice out (music at full level).
"""
import json
import math
import random
import struct
import sys
import wave

SR = 44100
TIM = json.load(open('timings.json'))
SC = TIM['scenes']
D = TIM['duration']
N = int(SR * D)
L = [0.0] * N
R = [0.0] * N
rng = random.Random(7)  # fixed seed: same file every run


def add(start, samples, gain=1.0, pan=0.0):
    i0 = int(start * SR)
    gl, gr = gain * (1 - max(0, pan)), gain * (1 + min(0, pan))
    for k, s in enumerate(samples):
        i = i0 + k
        if 0 <= i < N:
            L[i] += s * gl
            R[i] += s * gr


def env(n, a, d):
    """Attack/exponential-decay envelope, a and d in seconds."""
    na = max(1, int(a * SR))
    return [(k / na) if k < na else math.exp(-(k - na) / (d * SR)) for k in range(n)]


def kick():
    n = int(0.35 * SR)
    out, ph = [], 0.0
    for k in range(n):
        t = k / SR
        f = 45 + 110 * math.exp(-t * 30)
        ph += 2 * math.pi * f / SR
        out.append(math.sin(ph) * math.exp(-t * 9))
    return out


def hat():
    n = int(0.06 * SR)
    prev, out = 0.0, []
    for k in range(n):
        w = rng.uniform(-1, 1)
        out.append((w - prev) * math.exp(-k / (0.012 * SR)))  # high-passed noise
        prev = w
    return out


def tone(freq, dur, a=0.005, d=0.3, harm=(1.0,), detune=0.0):
    n = int(dur * SR)
    e = env(n, a, d)
    out = []
    for k in range(n):
        t = k / SR
        s = 0.0
        for h, amp in enumerate(harm, 1):
            s += amp * math.sin(2 * math.pi * freq * h * t)
            if detune:
                s += amp * 0.6 * math.sin(2 * math.pi * freq * (1 + detune) * h * t)
        out.append(s * e[k])
    return out


def whoosh(dur=0.45, rising=True):
    n = int(dur * SR)
    out, lp = [], 0.0
    for k in range(n):
        x = k / n
        c = 0.02 + 0.25 * (x if rising else 1 - x)  # lowpass opens while the sweep moves
        lp += c * (rng.uniform(-1, 1) - lp)
        out.append(lp * math.sin(math.pi * x) ** 2)
    return out


def note(name):
    names = {'C': -9, 'D': -7, 'E': -5, 'F': -4, 'G': -2, 'A': 0, 'B': 2}  # scientific pitch, A2 = 110 Hz
    return 110.0 * 2 ** (names[name[0]] / 12) * 2 ** (int(name[1]) - 2)


# --- music -------------------------------------------------------------
BEAT = 60 / 124
MUSIC_END = D - 1.0
K, Hh = kick(), hat()
TENSE = [('A2', 'A3', 'C4', 'E4'), ('F2', 'F3', 'A3', 'C4'), ('D2', 'D3', 'F3', 'A3'), ('E2', 'E3', 'G3', 'B3')]
BRIGHT = [('C2', 'E3', 'G3', 'C4'), ('G2', 'D3', 'G3', 'B3'), ('A2', 'E3', 'A3', 'C4'), ('F2', 'F3', 'A3', 'C4')]
drop0, drop1 = SC['turn']['start'], SC['reveal']['start']  # silence for "Стоп."
b = 0
while b * BEAT < MUSIC_END:
    t = b * BEAT
    if drop0 - 0.05 <= t < drop1 - 0.05:
        b += 1
        continue
    bright = t >= drop1 - 0.05
    chords = BRIGHT if bright else TENSE
    bar = (b // 4) % 4
    add(t, K, 0.5 if bright else 0.42)
    if bright or b % 2 == 1:
        add(t + BEAT / 2, Hh, 0.18, pan=0.3)
    if bright and b % 2 == 1:
        add(t + BEAT * 0.75, Hh, 0.1, pan=-0.3)
    add(t, tone(note(chords[bar][0]), BEAT * 0.95, a=0.01, d=0.25, harm=(1.0, 0.35)), 0.22)
    if b % 4 == 0:
        for j, nn in enumerate(chords[bar][1:]):
            add(t, tone(note(nn), BEAT * 4, a=0.2, d=1.6, harm=(1.0, 0.2), detune=0.004), 0.05, pan=(j - 1) * 0.4)
    b += 1

# --- sfx (times from timings.json) ---------------------------------------
add(0.0, kick(), 0.7)                                                     # hook impact on frame 1
add(0.0, tone(55, 0.8, a=0.002, d=0.35, harm=(1.0, 0.5)), 0.35)
for c in SC['pain']['cues']:                                              # each pain chip: low thud + buzz
    add(c + 0.1, kick(), 0.5)
    add(c + 0.1, tone(98, 0.25, a=0.002, d=0.08, harm=(1.0, 0.6, 0.4, 0.3)), 0.12)
add(drop0 - 0.25, whoosh(0.3, rising=True), 0.5)                          # "Стоп.": rush, then hit into silence
add(drop0, kick(), 0.8)
add(drop0, tone(note('A2'), 1.2, a=0.002, d=0.5, harm=(1.0, 0.5, 0.25)), 0.3)
add(drop1 - 0.3, whoosh(0.35), 0.5)                                       # into the bright part
for i, c in enumerate(SC['reveal']['cues']):
    add(c, tone(note(('E5', 'G5', 'C6')[i]), 0.5, d=0.2, harm=(1.0, 0.3)), 0.14)
add(SC['gets']['start'] - 0.2, whoosh(), 0.4)
for i, c in enumerate(SC['gets']['cues']):
    add(c, tone(note(('C5', 'E5', 'G5', 'C6')[i]), 0.32, d=0.12, harm=(1.0, 0.3)), 0.13)
add(SC['dm']['start'] - 0.2, whoosh(), 0.4)
c = SC['dm']['cues'][1]                                                   # "message" ding on the keyword
add(c, tone(note('E6'), 0.3, d=0.12), 0.16)
add(c + 0.12, tone(note('A6'), 0.6, d=0.25), 0.16)
add(SC['cta']['start'] - 0.2, whoosh(), 0.4)
for i, nn in enumerate(('C5', 'E5', 'G5')):                               # end-card chime
    add(SC['cta']['start'] + i * 0.09, tone(note(nn), 1.8, d=0.8, harm=(1.0, 0.25)), 0.11)

# --- duck music + sfx under the voice, then lay the voice on top ----------
VOICE = '--no-voice' not in sys.argv
if VOICE:
    DUCK, RAMP = 0.38, 0.15
    gain = [1.0] * N
    for sc in SC.values():
        a0, a1 = sc['voice'] - RAMP, sc['voiceEnd'] + RAMP
        for i in range(max(0, int(a0 * SR)), min(N, int(a1 * SR))):
            t = i / SR
            k = min(1.0, (t - a0) / RAMP, (a1 - t) / RAMP)
            gain[i] = min(gain[i], 1 - (1 - DUCK) * max(0.0, k))
    bus_peak = max(max(abs(x) for x in L), max(abs(x) for x in R))
    for i in range(N):
        g = gain[i] * 0.55 / bus_peak  # music bus sits well below the voice
        L[i] *= g
        R[i] *= g

    for sc in SC.values():
        with wave.open(sc['file']) as w:
            vsr = w.getframerate()
            raw = w.readframes(w.getnframes())
        v = struct.unpack('<%dh' % (len(raw) // 2), raw)
        vpeak = max(abs(x) for x in v) or 1
        i0 = int(sc['voice'] * SR)
        for i in range(int(len(v) * SR / vsr)):
            p = i * vsr / SR  # linear resample 16 kHz -> 44.1 kHz
            j = int(p)
            if j + 1 >= len(v) or i0 + i >= N:
                break
            x = (v[j] + (v[j + 1] - v[j]) * (p - j)) / vpeak * 0.9
            L[i0 + i] += x
            R[i0 + i] += x

# --- master: fade out, normalize, soft clip -------------------------------
fade = int(1.6 * SR)
for i in range(N - fade, N):
    g = (N - i) / fade
    L[i] *= g
    R[i] *= g
peak = max(max(abs(x) for x in L), max(abs(x) for x in R))
g = 0.89 / peak
with wave.open('sound.wav', 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(b''.join(
        struct.pack('<hh', int(math.tanh(L[i] * g) * 32767), int(math.tanh(R[i] * g) * 32767)) for i in range(N)))
print('sound.wav', D, 's')
