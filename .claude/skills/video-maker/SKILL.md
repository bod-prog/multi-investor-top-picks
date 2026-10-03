---
name: video-maker
description: Build a finished MP4 (vertical Short/Reel/TikTok or horizontal) from code, with no video editor — scenes are written as HTML/CSS, animated by a deterministic timeline, rendered frame by frame in headless Chromium and encoded with ffmpeg. Use when the user asks to make, animate or render a video, a reel, a short, an intro, a promo clip, an animated explainer, or "a video without editing".
---

# Video maker

Turns a script or idea into an MP4 using only what a cloud session already has: Chromium (Playwright), Node and ffmpeg. No API keys, no editor, nothing to install.

**Read `references/environment.md` first.** It says which video engine fits the request (HyperFrames `/motion-graphics`, `/general-video`, `/music-to-video`, `/slideshow`; `/remotion-best-practices`; `/video-edit` for recutting footage; or this skill's own lightweight renderer), what the session hook sets up, and the network rules that silently break renders here (jsDelivr is blocked — run `scripts/localize-cdn.mjs` on every HyperFrames project; no 3D/WebGL blocks; no TTS, music generation or transcription).

Reply to the user in the language they wrote in. On-screen text goes in the language of the video's audience.

## Files

- `templates/motion.js` — the timeline engine. Every frame is a pure function of time `t`, so any frame can be rendered exactly.
- `templates/short.html` — a working 9:16 example (hook → card with counter → steps → CTA). Start every new video from a copy of it.
- `scripts/render.mjs` — renders a page to MP4 or to a single PNG still.
- `references/motion.md` — durations, curves and short-form structure rules. Read it before writing the timeline.

## Workflow

1. **Brief.** Get (or decide) the platform and aspect (9:16 1080×1920 for Shorts/Reels/TikTok, 16:9 1920×1080 for YouTube), length, audience, the one message, and the call to action. If the user gave only a topic, write a scene-by-scene script yourself and show it in a few lines before building.
2. **Project folder.** Create `videos/<slug>/` in the working directory, copy `templates/motion.js` and `templates/short.html` (renamed `index.html`) into it. Put any images, logos or an audio track in the same folder and reference them with relative paths.
3. **Build the scenes.** One `<section class="scene">` per beat. Use CSS variables for colors and type, system fonts that exist offline (`Noto Sans`, `DejaVu Sans`; Noto covers Cyrillic). Then write the timeline:
   - `tl.show(sel, { start, end, from })` — enter, hold, exit the same way.
   - `tl.to(sel, { start, dur, from, to, ease })` — any single move.
   - `tl.stagger(sel, { start, each, dur, from, to })` — list items one by one.
   - `tl.text(sel, { start, dur, from, to, format })` — counting numbers.
   - `tl.call(t => …)` — anything custom (canvas, SVG path length, captions), computed from `t` only.
   - Never use CSS transitions/animations, `Date.now()` or `Math.random()` at draw time: the renderer seeks frame by frame and they would not line up.
4. **Check stills.** `node <skill>/scripts/render.mjs videos/<slug>/index.html videos/<slug>/out.mp4 --still <t>` for the hook (t≈0.5), the middle of every scene and the end. Look at each PNG (Read tool) and fix overlaps, cut-off text and contrast before going further.
5. **Draft.** Render with `--scale 0.5` (about 6 frames/s; a 15 s short takes ~1 min). Optionally run the `audience-sim` skill on the draft to find where viewers would drop off, then fix those moments.
6. **Final.** Render full size; add `--audio track.mp3` to mux a soundtrack or voice-over (it is trimmed to the video). Report the path, length and size, and send the file to the user (SendUserFile) so they can watch it.

## Captions / voice-over

There is no text-to-speech in the session. If the user has a voice-over file, put it in the folder and time the scenes to it (get the length with `ffprobe`). Burned-in captions are just timed text elements: one `tl.show()` per phrase, positioned in the lower-middle third, above the platform UI.

## Quality bar

Follow `references/motion.md`. In particular: the hook is on screen in the first second, something changes every 2–4 s, nothing scales from 0, exits are faster than entrances, and no key text in the top 200 px or bottom 380 px of a vertical video.

## Editing generated clips (Grok, Veo, Kling, Sora…)

When the footage comes from an AI video generator, the job is editing, not rendering:

1. **Shot list first.** Write numbered shots of 1–4 s each in the final cut, with an English prompt per shot and one shared character description so the character stays consistent. Ask for clips without text or music; generators pad the start and end, so request a longer clip than the shot needs (e.g. 6 s for a 2–3 s shot) and keep only the best part.
2. **Look before cutting.** For each clip, make a contact sheet (`python3 .claude/skills/audience-sim/scripts/prepare_video.py clip.mp4 /tmp/x --every 0.5`) or a few stills, and pick `in`/`out` where the action is.
3. **Edit list.** Write `edit.json` (format in the docstring of `scripts/assemble.py`): shots with `in`/`out`, optional `speed`, `push` (slow zoom), `sfx` (clip's own sound volume), `caption` + `style`; `overlays` for timed text such as a "wait for it" promise; `music` with volume and fade.
4. **Assemble.** `python3 <skill>/scripts/assemble.py edit.json out.mp4 --draft` for a quick check, then without `--draft`. Captions are rendered by Chromium (`scripts/captions.mjs`), so Cyrillic and emoji work. A `out.timeline.json` lists where every shot landed.
5. **Test and iterate.** Run `audience-sim` on the cut; map drop-offs to shots through the timeline, then re-trim, reorder, or ask the generator for a replacement shot. Compare versions with the same panel.
