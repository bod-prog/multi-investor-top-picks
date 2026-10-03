# Motion rules for short videos

These are the defaults `templates/motion.js` is built around. Break them only with a reason you can say in one line.

## Timing

| What | Duration | Curve |
|---|---|---|
| Text or card entering | 0.4–0.6 s | `out` |
| Exit (same path it came in) | 0.25–0.35 s | `out` |
| Element travelling across the frame | 0.6–1.0 s | `inOut` |
| Panel / sheet sliding in | 0.5–0.7 s | `drawer` |
| Glow, color, background change | 0.6–1.0 s | `soft` |
| Number counting up | 1.0–1.6 s | `out` |
| Progress bar, marquee | whole span | `linear` |
| Playful pop (logo, emoji, success) | 0.5–0.7 s | `spring` |

- Exits are faster than entrances. The viewer already knows what is leaving.
- Never ease-in on something entering: it starts slow exactly when the eye arrives.
- Stagger lists at 0.06–0.2 s per item. More than that reads as lag.

## What to animate

- Animate `opacity`, `x`/`y`, `scale`, `blur` and `clip`. Avoid animating layout (width, font-size): it jitters frame to frame.
- Nothing appears from `scale: 0`. Start at 0.92–0.97 with opacity 0.
- One focal motion at a time. If two things move, one of them should be small or slow.
- A blur of 6–10 px on the way in makes headline text feel like it is focusing, not sliding.

## Short-form structure (9:16)

- **0–1 s:** the hook is already on screen. No logo intro, no fade from black.
- **Every 2–4 s:** something changes (new line, cut, zoom, number). Static frames longer than ~4 s lose scrollers.
- **Text:** at most 6–8 words on screen at once, 90 px+ for headlines, keep the top 200 px and bottom 380 px clear of key text (platform UI covers them).
- **Contrast:** dark text on light or light on dark with ≥ 4.5:1 contrast; the accent color only for the one word that matters.
- **End:** one call to action, then stop. A visible progress bar helps completion.

## Before rendering

1. Render stills at the key beats (`--still 0.5`, the middle of each scene, the last second) and look at them.
2. Render a half-size draft (`--scale 0.5`) and watch it once end to end.
3. Only then render full size.
