# Vendored game libraries

Everything here was downloaded straight from GitHub with `curl` and committed
as-is — no npm, no build step, no CDN at runtime. Each entry pins the exact ref
it came from, so a re-download can be checked against the hash below.

| File | Source (GitHub) | Ref | SHA-256 | License |
| --- | --- | --- | --- | --- |
| `phaser/phaser.min.js` | `phaserjs/phaser` → `dist/phaser.min.js` | `v3.90.0` | `e92ddef111ba42e9…8eba7a7` | MIT (`phaser/LICENSE.md`) |
| `three/three.module.min.js` | `mrdoob/three.js` → `build/three.module.min.js` | `r180` | `e2b5ee6bccd38fd6…e3b40eb6` | MIT (`three/LICENSE`) |
| `three/three.core.min.js` | `mrdoob/three.js` → `build/three.core.min.js` | `r180` | `61ba0df005b05991…7a8957de` | MIT (`three/LICENSE`) |
| `howler/howler.min.js` | `goldfire/howler.js` → `dist/howler.min.js` | `v2.2.4` | `736c339444c88baa…745ffd41` | MIT (`howler/LICENSE.md`) |
| `jsfxr/sfxr.js` | `chr15m/jsfxr` → `sfxr.js` | `master` (v1.4.0) | `6095a6358e654bc3…b92551c5` | Public domain (`jsfxr/UNLICENSE`) |
| `jsfxr/riffwave.js` | `chr15m/jsfxr` → `riffwave.js` | `master` (v1.4.0) | `ab3cea2bd157746d…be4daaec` | Public domain (`jsfxr/UNLICENSE`) |
| `fonts/PressStart2P-Regular.ttf` | `google/fonts` → `ofl/pressstart2p/` | `main` | `034c77f1f05ec894…728e017d` | SIL OFL 1.1 (`fonts/OFL.txt`) |

## What each one is for

- **Phaser 3** — the 2D engine: scenes, arcade/matter physics, tweens, sprites,
  tilemaps, input, sound. The default choice for anything 2D here.
- **three.js** — the 3D engine, shipped as an ES module: load it with
  `import * as THREE from '.../three.module.min.js'` inside `<script type="module">`.
  The r180 build is split in two: `three.module.min.js` imports
  `three.core.min.js` from the same folder, so keep the pair together.
- **howler.js** — audio for real files (music, long samples): one API over Web
  Audio with an HTML5 fallback, sprite support, fades.
- **jsfxr** — 8-bit sound effects generated in the browser from a preset name
  (`pickupCoin`, `laserShoot`, `explosion`, `powerUp`, `hitHurt`, `jump`,
  `blipSelect`, `click`, `tone`, `random`). Needs `riffwave.js` loaded first.
  This is why the repo carries no `.wav` files.
- **Press Start 2P** — the arcade face used for in-game text.

## Re-downloading

```bash
curl -sSfL https://raw.githubusercontent.com/phaserjs/phaser/v3.90.0/dist/phaser.min.js \
  -o games/vendor/phaser/phaser.min.js
sha256sum games/vendor/phaser/phaser.min.js   # must match the table above
```

Bumping a version means changing the ref, re-running `sha256sum`, updating this
table, and opening `games/` to confirm every self-check still passes.
