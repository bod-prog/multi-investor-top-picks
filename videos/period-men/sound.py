#!/usr/bin/env python3
"""Synthesize the soundtrack for the periods short (stdlib only, no samples).

Music: 100 BPM soft beat (kick, hat, bass, pad) in C major.
SFX are placed on the same timestamps as the timeline in index.html.
Usage: python3 sound.py  ->  sound.wav (24 s, 44.1 kHz stereo)
"""
import math
import random
import struct
import wave

SR = 44100
D = 24.0
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
BEAT = 0.6
MUSIC_END = 23.0
K, Hh = kick(), hat()
chords = [('C2', 'E3', 'G3', 'C4'), ('G2', 'D3', 'G3', 'B3'), ('A2', 'E3', 'A3', 'C4'), ('F2', 'F3', 'A3', 'C4')]
b = 0
while b * BEAT < MUSIC_END:
    t = b * BEAT
    bar = (b // 4) % 4
    drums_on = t >= 1.2  # hook breathes for a moment, then the beat comes in on the subtitle
    if drums_on:
        add(t, K, 0.42)
        add(t + BEAT / 2, Hh, 0.18, pan=0.3)
        if b % 2 == 1:
            add(t + BEAT * 0.75, Hh, 0.1, pan=-0.3)
    root = note(chords[bar][0])
    add(t, tone(root, BEAT * 0.95, a=0.01, d=0.25, harm=(1.0, 0.35)), 0.22 if drums_on else 0.12)
    if b % 4 == 0:
        for j, nn in enumerate(chords[bar][1:]):
            add(t, tone(note(nn), BEAT * 4, a=0.25, d=1.6, harm=(1.0, 0.2), detune=0.004), 0.045, pan=(j - 1) * 0.4)
    b += 1

# --- sfx (timestamps match index.html) -----------------------------------
for t in (3.0, 7.4, 11.6, 15.8, 21.0):  # scene cuts
    add(t - 0.2, whoosh(), 0.4)

add(0.6, tone(note('E5'), 0.6, d=0.25, harm=(1.0, 0.3)), 0.12)  # strike-through on "примхи"

# Counter 0 -> 28 (3.3–4.7 s): soft ticks that slow down with the ease-out.
for i in range(14):
    k = i / 14
    t = 3.3 + 1.4 * (1 - (1 - k) ** 2.2)
    add(t, tone(700 + 500 * k, 0.04, a=0.001, d=0.012), 0.1)
add(4.7, tone(note('G4'), 0.8, d=0.35, harm=(1.0, 0.4)), 0.16)

add(8.4, tone(note('C4'), 0.8, d=0.4, harm=(1.0, 0.5)), 0.14)  # pain card
for i in range(4):                                             # PMS chips
    add(12.6 + i * 0.35, tone(note(('E5', 'G5', 'A5', 'C6')[i]), 0.3, d=0.1), 0.1, pan=(i - 1.5) * 0.3)
for i in range(4):                                             # help list
    add(16.7 + i * 0.6, tone(note(('C5', 'E5', 'G5', 'C6')[i]), 0.35, d=0.13), 0.12)
for i, nn in enumerate(('C5', 'E5', 'G5')):                    # CTA chime
    add(21.0 + i * 0.09, tone(note(nn), 1.8, d=0.8, harm=(1.0, 0.25)), 0.12)

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
