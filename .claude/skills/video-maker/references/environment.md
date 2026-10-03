# Video in a Claude Code web session — what works here

Measured in a cloud session (Linux x64, no GPU, egress proxy). Re-check with
`npx hyperframes doctor` if something looks different.

## Set up by `.claude/hooks/session-start.sh`

- `ffmpeg` / `ffprobe` (apt). Without them nothing encodes.
- `HYPERFRAMES_BROWSER_PATH` and `REMOTION_BROWSER_EXECUTABLE` point at the
  pre-installed Playwright headless shell. Both tools otherwise try to download
  their own Chrome, which the network blocks.
- `HYPERFRAMES_NO_TELEMETRY=1`, `DO_NOT_TRACK=1`, `HYPERFRAMES_SKIP_SKILLS=1`
  (the last stops `init` from rewriting the vendored skills).
- `hyperframes` CLI and `playwright` (pinned to the pre-installed Chromium
  revision) installed globally, with `NODE_PATH` pointing at them so this
  skill's `scripts/render.mjs` finds Playwright.

If the env vars are missing (hook did not run), source them by hand:
`source <(CLAUDE_CODE_REMOTE=true CLAUDE_ENV_FILE=/dev/stdout .claude/hooks/session-start.sh)`

## Network rules that change how you build

| Host | Status | Consequence |
|---|---|---|
| registry.npmjs.org | open | npm packages, `@fontsource/*` fonts, `npx hyperframes add` |
| cdn.jsdelivr.net, unpkg.com | **blocked** | every HyperFrames template and block loads GSAP / three from jsDelivr |
| fonts.googleapis.com, fonts.gstatic.com | open | Google Fonts `<link>` works, including Cyrillic |
| huggingface.co, GitHub release assets | blocked | no local Whisper, Kokoro TTS or MusicGen models |

**Before every HyperFrames lint/check/render**, run:

```
node .claude/skills/video-maker/scripts/localize-cdn.mjs <project-dir>
```

It swaps jsDelivr/unpkg URLs for copies under `<project>/vendor/` fetched from
npm (whole packages, so ES-module siblings resolve). Re-run it after every
`npx hyperframes add`. Skipping it gives either a hard
`sub_timeline_script_failure` or — worse — a render that "succeeds" with
black frames. `npx hyperframes check` lists any remaining failed requests.

## Rendering speed (software GPU)

- 2D HTML/CSS/GSAP, 1080×1920: about real time (6 s video ≈ 10 s render).
- Remotion, 1080×1920 React text + springs: 3 s video ≈ 19 s including bundling.
- **three.js / WebGL blocks (`3d-motion` tag: canopy-part-title,
  glass-shard-title, wireframe-portal-title, cuboid-carousel …): do not use.**
  A 12 s block did not finish in 10 minutes. Pick 2D blocks; filter the
  catalog by eye for `3d-motion` / `post-processing` tags.

## What is not available — say so, don't fake it

- Voice-over / TTS, music generation, transcription (Whisper): no models
  reachable and no API keys. Use the user's own audio file; get its length with
  `ffprobe`; time captions by hand or from an `.srt` the user provides.
- Paid generators (HeyGen, ElevenLabs, Seedance, Kling…): need keys this
  session does not have.
- Royalty-free SFX that ship inside the skills do work: see
  `.claude/skills/media-use/audio/assets/sfx/`.

## Which engine

| Need | Use |
|---|---|
| Short motion graphic, kinetic type, stat, chart, title (≤ 30 s) | `/motion-graphics` (HyperFrames) |
| Multi-scene reel, montage, remix of user clips | `/general-video` (HyperFrames) |
| Beat-synced cut to the user's music track | `/music-to-video` |
| Image/slide sequence | `/slideshow` |
| React codebase, data-driven or templated videos | `/remotion-best-practices` (add `--browser-executable="$REMOTION_BROWSER_EXECUTABLE"` to every `npx remotion render`/`still`) |
| Recut / trim / speed / loudness-fix existing footage (e.g. AI clips) | `/video-edit` (plain ffmpeg) |
| Quick self-contained vertical short with no dependencies | this skill's own `templates/` + `scripts/render.mjs` |
| Predict where viewers drop off | `/audience-sim` |

Always look at the result: extract a contact sheet
(`ffmpeg -i out.mp4 -vf "fps=1,scale=216:-1,tile=6x1" -frames:v 1 sheet.png`)
and Read it before telling the user it is done.

## Where the vendored skills come from

Copied unchanged except for this file and the hook; each folder keeps its
upstream `LICENSE`.

| Skills | Source | License |
|---|---|---|
| hyperframes, hyperframes-{animation,audio,cli,core,creative,keyframes,registry,studio}, media-use, general-video, motion-graphics, music-to-video, slideshow, motion-doctrine, seam-craft, cut-the-curve | github.com/heygen-com/hyperframes | Apache-2.0 (bundled SFX: Pixabay license) |
| remotion-best-practices (router + all Remotion sub-skills) | github.com/remotion-dev/remotion, packages/codex-plugin | MIT for the skill text; Remotion itself needs a paid company license above 3 people |
| video-edit | github.com/calesthio/OpenMontage | AGPL-3.0 |

Left out on purpose: skills that need API keys (HeyGen, ElevenLabs, Seedance,
Kling, Gemini…), local models (Whisper captions, Kokoro TTS, MusicGen) or
sites the sandbox cannot reach (website/product/PR-to-video), and 3D/WebGL.
Refresh the HyperFrames ones with `npx hyperframes skills update` only after
checking the diff — the local `environment.md` rules are not upstream.
