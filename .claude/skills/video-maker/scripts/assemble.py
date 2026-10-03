#!/usr/bin/env python3
"""Cut generated clips into a finished vertical video from an edit list (no editor needed).

Usage: python3 assemble.py <edit.json> <out.mp4> [--draft]

edit.json:
{
  "width": 1080, "height": 1920, "fps": 30,
  "clips_dir": "clips",                       # relative to edit.json
  "shots": [
    {"file": "01.mp4", "in": 0.8, "out": 3.3,   # seconds inside the source clip
     "speed": 1.0,                              # >1 faster, <1 slow motion
     "push": 0.06,                              # optional slow zoom-in amount (0.06 = 6 %)
     "sfx": 0.35,                               # volume of the clip's own sound (0 = mute)
     "caption": "Step 1: the door", "style": "step",   # optional, shown for the whole shot
     "caption_delay": 0.2}
  ],
  "overlays": [{"text": "wait for the inside 👀", "start": 2.4, "end": 5.0, "style": "note"}],
  "music": {"file": "music.mp3", "start": 0, "volume": 0.55, "fade_out": 1.5},
  "end_fade": 0.4,
  "loudness": -14
}
Caption styles: hook (top third), step (lower third), note (lower third, small), end (centre).
--draft renders at half size and faster preset, for quick checks.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))


def run(cmd):
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        sys.exit(f"command failed: {' '.join(cmd[:6])} …\n{res.stderr[-1500:]}")
    return res


def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type",
                          "-of", "json", path], capture_output=True, text=True)
    if out.returncode != 0:
        sys.exit(f"cannot read {path}: {out.stderr.strip()}")
    d = json.loads(out.stdout)
    return float(d["format"]["duration"]), any(s["codec_type"] == "audio" for s in d["streams"])


def render_shot(i, shot, src, W, H, fps, tmp, preset):
    dur_src, has_audio = probe(src)
    t_in = float(shot.get("in", 0))
    t_out = min(float(shot.get("out", dur_src)), dur_src)
    if t_out <= t_in:
        sys.exit(f"shot {i + 1} ({shot['file']}): out ({t_out}) must be after in ({t_in}); clip is {dur_src:.2f}s")
    speed = float(shot.get("speed", 1.0))
    dur = (t_out - t_in) / speed
    frames = max(1, round(dur * fps))

    vf = [f"setpts=(PTS-STARTPTS)/{speed}",
          f"scale={W}:{H}:force_original_aspect_ratio=increase:flags=lanczos", f"crop={W}:{H}", f"fps={fps}"]
    push = float(shot.get("push", 0))
    if push > 0:
        vf.append(f"zoompan=z='1+{push}*on/{frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s={W}x{H}:fps={fps}")
    vf.append("format=yuv420p")

    out = os.path.join(tmp, f"shot_{i + 1:02d}.mp4")
    cmd = ["ffmpeg", "-v", "error", "-y", "-ss", f"{t_in:.3f}", "-to", f"{t_out:.3f}", "-i", src]
    sfx = float(shot.get("sfx", 0))
    if has_audio and sfx > 0:
        tempo = []
        s = speed
        while s > 2.0:
            tempo.append("atempo=2.0"); s /= 2.0
        while s < 0.5:
            tempo.append("atempo=0.5"); s /= 0.5
        tempo.append(f"atempo={s:.4f}")
        af = ",".join(["asetpts=PTS-STARTPTS"] + tempo + [f"volume={sfx}", "aresample=48000", "aformat=channel_layouts=stereo"])
        cmd += ["-vf", ",".join(vf), "-af", af]
    else:
        cmd += ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-map", "0:v", "-map", "1:a", "-vf", ",".join(vf)]
    cmd += ["-t", f"{dur:.3f}", "-c:v", "libx264", "-preset", preset, "-crf", "18", "-r", str(fps),
            "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", out]
    run(cmd)
    real, _ = probe(out)
    return out, real


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("edit")
    ap.add_argument("out")
    ap.add_argument("--draft", action="store_true")
    args = ap.parse_args()

    base = os.path.dirname(os.path.abspath(args.edit))
    e = json.load(open(args.edit, encoding="utf-8"))
    W, H, fps = int(e.get("width", 1080)), int(e.get("height", 1920)), int(e.get("fps", 30))
    if args.draft:
        W, H = W // 2 // 2 * 2, H // 2 // 2 * 2
    preset = "veryfast" if args.draft else "medium"
    clips_dir = os.path.join(base, e.get("clips_dir", "."))
    tmp = tempfile.mkdtemp(prefix="assemble_")

    try:
        # 1. Cut and normalise every shot.
        segs, timeline, t = [], [], 0.0
        for i, shot in enumerate(e["shots"]):
            src = os.path.join(clips_dir, shot["file"])
            if not os.path.exists(src):
                sys.exit(f"missing clip: {src}")
            seg, dur = render_shot(i, shot, src, W, H, fps, tmp, preset)
            segs.append(seg)
            timeline.append({"shot": i + 1, "file": shot["file"], "start": round(t, 2), "end": round(t + dur, 2),
                             "caption": shot.get("caption", "")})
            t += dur
        total = t

        # 2. Join.
        lst = os.path.join(tmp, "list.txt")
        with open(lst, "w") as f:
            f.writelines(f"file '{s}'\n" for s in segs)
        body = os.path.join(tmp, "body.mp4")
        run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", body])

        # 3. Captions → transparent PNGs.
        caps = []
        for i, (shot, tl) in enumerate(zip(e["shots"], timeline)):
            if shot.get("caption"):
                a = tl["start"] + float(shot.get("caption_delay", 0.15))
                b = tl["start"] + float(shot["caption_for"]) if shot.get("caption_for") else tl["end"]
                caps.append({"id": f"s{i + 1:02d}", "text": shot["caption"], "style": shot.get("style", "step"), "a": a, "b": b})
        for j, o in enumerate(e.get("overlays", [])):
            caps.append({"id": f"o{j + 1:02d}", "text": o["text"], "style": o.get("style", "note"),
                         "a": float(o["start"]), "b": float(o.get("end", total))})
        if caps:
            spec = os.path.join(tmp, "captions.json")
            json.dump({"width": W if not args.draft else W * 2, "items": caps}, open(spec, "w"), ensure_ascii=False)
            run(["node", os.path.join(HERE, "captions.mjs"), spec, os.path.join(tmp, "caps")])

        # 4. Overlay captions, add music, normalise loudness.
        inputs = ["-i", body]
        fc, last = [], "0:v"
        for k, c in enumerate(caps):
            inputs += ["-loop", "1", "-t", f"{total:.3f}", "-i", os.path.join(tmp, "caps", f"{c['id']}.png")]
            idx = k + 1
            scale = ",scale=iw/2:ih/2" if args.draft else ""
            fade = 0.15
            fc.append(f"[{idx}:v]format=rgba{scale},fade=in:st={c['a']:.3f}:d={fade}:alpha=1,"
                      f"fade=out:st={max(c['a'], c['b'] - fade):.3f}:d={fade}:alpha=1[c{idx}]")
            y = {"hook": "H*0.11", "end": "(H-h)/2", "note": "H*0.775", "step": "H*0.66"}.get(c["style"], "H*0.66")
            fc.append(f"[{last}][c{idx}]overlay=x=(W-w)/2:y={y}:enable='between(t,{c['a']:.3f},{c['b']:.3f})'[v{idx}]")
            last = f"v{idx}"
        end_fade = float(e.get("end_fade", 0))
        if end_fade > 0:
            fc.append(f"[{last}]fade=out:st={total - end_fade:.3f}:d={end_fade}[vout]")
        else:
            fc.append(f"[{last}]null[vout]")

        music = e.get("music")
        if music:
            inputs += ["-ss", str(music.get("start", 0)), "-i", os.path.join(base, music["file"])]
            m = len(caps) + 1
            fo = float(music.get("fade_out", 1.5))
            fc.append(f"[{m}:a]atrim=0:{total:.3f},asetpts=PTS-STARTPTS,volume={music.get('volume', 0.6)},"
                      f"afade=t=in:d=0.3,afade=t=out:st={max(0, total - fo):.3f}:d={fo}[mus]")
            fc.append("[0:a][mus]amix=inputs=2:duration=first:normalize=0[mix]")
            amap = "[mix]"
        else:
            amap = "[0:a]"
        fc.append(f"{amap}loudnorm=I={e.get('loudness', -14)}:TP=-1.5:LRA=11,aresample=48000[aout]")

        run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(fc),
             "-map", "[vout]", "-map", "[aout]", "-t", f"{total:.3f}",
             "-c:v", "libx264", "-preset", preset, "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
             "-c:a", "aac", "-b:a", "192k", args.out])

        tl_path = os.path.splitext(args.out)[0] + ".timeline.json"
        json.dump({"duration": round(total, 2), "shots": timeline}, open(tl_path, "w"), ensure_ascii=False, indent=1)
        print(json.dumps({"out": args.out, "duration": round(total, 2), "size": f"{W}x{H}", "shots": len(segs),
                          "captions": len(caps), "timeline": tl_path}, ensure_ascii=False, indent=1))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
