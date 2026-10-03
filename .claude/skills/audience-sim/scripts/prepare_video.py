#!/usr/bin/env python3
"""Turn a video into what simulated viewers can "watch": timestamped contact sheets plus a beat-by-beat timeline.

Outputs in <workdir>:
  sheets/sheet_XX.jpg   grids of frames with the timestamp burned into each frame
  timeline.json         meta, cuts, silences, loudness per second, transcript, and beats

Usage:
  python3 prepare_video.py <video> <workdir> [--transcript file.srt|.vtt|.txt] [--every SECONDS]
Only ffmpeg/ffprobe and the Python standard library are needed.
"""
import argparse
import json
import math
import os
import re
import subprocess
import sys

FONTS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "C:/Windows/Fonts/arial.ttf",
]


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def probe(video):
    out = run(["ffprobe", "-v", "error", "-show_entries",
               "format=duration:stream=codec_type,width,height,r_frame_rate",
               "-of", "json", video])
    if out.returncode != 0:
        sys.exit(f"ffprobe failed: {out.stderr.strip()}")
    data = json.loads(out.stdout)
    duration = float(data["format"]["duration"])
    v = next((s for s in data["streams"] if s["codec_type"] == "video"), None)
    if not v:
        sys.exit("no video stream")
    num, den = (v.get("r_frame_rate") or "30/1").split("/")
    return {
        "duration": round(duration, 2),
        "width": v["width"],
        "height": v["height"],
        "fps": round(float(num) / float(den or 1), 2),
        "has_audio": any(s["codec_type"] == "audio" for s in data["streams"]),
        "orientation": "vertical" if v["height"] > v["width"] else "horizontal",
    }


def auto_step(duration):
    # Dense enough that a viewer "sees" every beat, sparse enough to keep token cost sane.
    if duration <= 20:
        return 0.5
    if duration <= 60:
        return 1.0
    if duration <= 180:
        return 2.0
    if duration <= 600:
        return 5.0
    if duration <= 1800:
        return 10.0
    return 20.0


def contact_sheets(video, meta, workdir, step):
    os.makedirs(os.path.join(workdir, "sheets"), exist_ok=True)
    cols, rows = (4, 3) if meta["orientation"] == "vertical" else (3, 4)
    per_sheet = cols * rows
    tile_w = 300 if meta["orientation"] == "vertical" else 420
    font = next((f for f in FONTS if os.path.exists(f)), None)
    span = per_sheet * step
    sheets = []
    n = math.ceil(meta["duration"] / span)
    for i in range(n):
        start = i * span
        length = min(span, meta["duration"] - start)
        out = os.path.join(workdir, "sheets", f"sheet_{i + 1:02d}.jpg")
        label = ""
        if font:
            # -copyts keeps the real timestamp so every tile shows its own time.
            label = (f",drawtext=fontfile='{font}':text='%{{pts\\:hms}}':x=12:y=12:fontsize=h/18:"
                     "fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=8")
        vf = f"fps=1/{step}{label},scale={tile_w}:-2,tile={cols}x{rows}:padding=6:margin=6:color=white"
        cmd = ["ffmpeg", "-v", "error", "-y", "-copyts", "-ss", f"{start:.3f}", "-i", video,
               "-t", f"{length:.3f}", "-vf", vf, "-frames:v", "1", "-q:v", "4", out]
        res = run(cmd)
        if res.returncode != 0:
            sys.exit(f"ffmpeg failed on sheet {i + 1}: {res.stderr.strip()[-400:]}")
        sheets.append({"file": os.path.relpath(out, workdir), "start": round(start, 2),
                       "end": round(start + length, 2), "frame_every_s": step})
    return sheets


def scene_cuts(video, threshold=0.3):
    res = run(["ffmpeg", "-v", "info", "-i", video, "-vf", f"select='gt(scene,{threshold})',showinfo",
               "-an", "-f", "null", "-"])
    return [round(float(m), 2) for m in re.findall(r"pts_time:([\d.]+)", res.stderr)]


def audio_analysis(video, duration):
    sil = run(["ffmpeg", "-v", "info", "-i", video, "-af", "silencedetect=n=-38dB:d=0.4", "-vn", "-f", "null", "-"])
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", sil.stderr)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", sil.stderr)]
    silences = []
    for i, s in enumerate(starts):
        e = ends[i] if i < len(ends) else duration
        silences.append([round(s, 2), round(e, 2)])

    loud = run(["ffmpeg", "-v", "info", "-nostats", "-i", video, "-af", "ebur128", "-vn", "-f", "null", "-"])
    per_sec = {}
    for t, m in re.findall(r"t:\s*([\d.]+)\s+TARGET.*?M:\s*(-?[\d.]+)", loud.stderr):
        per_sec.setdefault(int(float(t)), []).append(float(m))
    loudness = [round(sum(v) / len(v), 1) if (v := per_sec.get(s)) else None for s in range(int(math.ceil(duration)))]
    return silences, loudness


def parse_time(s):
    s = s.strip().replace(",", ".")
    parts = [float(p) for p in s.split(":")]
    while len(parts) < 3:
        parts.insert(0, 0.0)
    h, m, sec = parts
    return h * 3600 + m * 60 + sec


def load_transcript(path, duration):
    text = open(path, encoding="utf-8-sig").read()
    cues = re.findall(r"(\d[\d:.,]+)\s*-->\s*(\d[\d:.,]+)[^\n]*\n(.*?)(?:\n\s*\n|\Z)", text, flags=re.S)
    if cues:
        out = []
        for a, b, body in cues:
            line = " ".join(l.strip() for l in body.splitlines() if l.strip() and not l.strip().isdigit())
            out.append({"start": round(parse_time(a), 2), "end": round(parse_time(b), 2), "text": re.sub(r"<[^>]+>", "", line)})
        return out
    # Plain text: spread sentences evenly across the video. Rough, but better than nothing.
    sentences = [s.strip() for s in re.split(r"(?<=[.!?…])\s+|\n+", text) if s.strip()]
    if not sentences:
        return []
    total_chars = sum(len(s) for s in sentences)
    t, out = 0.0, []
    for s in sentences:
        d = duration * len(s) / total_chars
        out.append({"start": round(t, 2), "end": round(t + d, 2), "text": s, "estimated": True})
        t += d
    return out


def try_whisper(video):
    try:
        from faster_whisper import WhisperModel  # optional
    except ImportError:
        return None
    model = WhisperModel("small", compute_type="int8")
    segs, _ = model.transcribe(video, vad_filter=True)
    return [{"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip()} for s in segs]


def beats(meta, cuts, silences, loudness, transcript):
    d = meta["duration"]
    # Short videos are judged second by second; long ones in chunks.
    size = 1.0 if d <= 20 else 2.0 if d <= 60 else 5.0 if d <= 180 else 15.0 if d <= 900 else 30.0
    out = []
    t = 0.0
    while t < d - 1e-6:
        e = min(d, t + size)
        words = " ".join(c["text"] for c in transcript if c["start"] < e and c["end"] > t)
        sil = sum(max(0.0, min(e, b) - max(t, a)) for a, b in silences)
        secs = [x for x in loudness[int(t):int(math.ceil(e))] if x is not None]
        out.append({
            "start": round(t, 2), "end": round(e, 2),
            "cuts": sum(1 for c in cuts if t <= c < e),
            "silence_share": round(sil / (e - t), 2) if e > t else 0,
            "loudness_lufs": round(sum(secs) / len(secs), 1) if secs else None,
            "speech": words,
        })
        t = e
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("workdir")
    ap.add_argument("--transcript")
    ap.add_argument("--every", type=float, help="seconds between frames on the contact sheets")
    args = ap.parse_args()

    os.makedirs(args.workdir, exist_ok=True)
    meta = probe(args.video)
    step = args.every or auto_step(meta["duration"])
    sheets = contact_sheets(args.video, meta, args.workdir, step)
    cuts = scene_cuts(args.video)
    silences, loudness = audio_analysis(args.video, meta["duration"]) if meta["has_audio"] else ([], [])

    transcript, source = [], "none"
    if args.transcript:
        transcript, source = load_transcript(args.transcript, meta["duration"]), "file"
    elif meta["has_audio"]:
        w = try_whisper(args.video)
        if w is not None:
            transcript, source = w, "whisper"

    timeline = {
        "video": os.path.abspath(args.video),
        "meta": meta,
        "sheets": sheets,
        "scene_cuts": cuts,
        "cuts_per_10s": round(len(cuts) / max(meta["duration"], 1) * 10, 2),
        "silences": silences,
        "loudness_per_s": loudness,
        "transcript_source": source,
        "transcript": transcript,
        "beats": beats(meta, cuts, silences, loudness, transcript),
    }
    with open(os.path.join(args.workdir, "timeline.json"), "w", encoding="utf-8") as f:
        json.dump(timeline, f, ensure_ascii=False, indent=1)

    print(json.dumps({
        "duration": meta["duration"], "orientation": meta["orientation"], "has_audio": meta["has_audio"],
        "sheets": len(sheets), "frame_every_s": step, "scene_cuts": len(cuts),
        "transcript": source, "beats": len(timeline["beats"]),
        "timeline": os.path.join(args.workdir, "timeline.json"),
    }, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
