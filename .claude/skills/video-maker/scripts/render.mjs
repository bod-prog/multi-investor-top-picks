#!/usr/bin/env node
// Render an HTML animation to MP4, frame by frame, with headless Chromium + ffmpeg.
//
// The page must expose:
//   window.VIDEO = { width, height, fps, duration }   // duration in seconds
//   window.seek(t)                                     // draw the exact state at time t (seconds)
// seek() must be deterministic (no Date.now(), no CSS transitions running on their own).
//
// Usage:
//   node render.mjs <scene.html> <out.mp4> [--audio track.mp3] [--from 0] [--to 5] [--scale 0.5] [--still 2.5]
//   --still T   writes a single PNG of time T next to out (fast preview, no ffmpeg encode)
//   --scale S   render at S × size (draft quality, e.g. 0.5)

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

function loadPlaywright() {
  const candidates = [
    'playwright',
    '/opt/node-tools/node_modules/playwright',
    path.join(process.env.NODE_PATH || '', 'playwright'),
  ];
  for (const c of candidates) {
    try { return require(c); } catch { /* try next */ }
  }
  console.error('playwright not found. Install it with: npm i -D playwright  (Chromium is preinstalled in cloud sessions)');
  process.exit(1);
}

function parseArgs(argv) {
  const pos = [];
  const opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) opt[a.slice(2)] = argv[++i];
    else pos.push(a);
  }
  return { pos, opt };
}

const { pos, opt } = parseArgs(process.argv.slice(2));
if (pos.length < 2) {
  console.error('usage: node render.mjs <scene.html> <out.mp4> [--audio f] [--from s] [--to s] [--scale k] [--still t]');
  process.exit(2);
}
const [htmlPath, outPath] = pos;
if (!existsSync(htmlPath)) { console.error(`no such file: ${htmlPath}`); process.exit(2); }

const { chromium } = loadPlaywright();
// Cloud sessions ship a pinned Chromium that Playwright usually finds; fall back to its explicit path.
let browser;
try {
  browser = await chromium.launch();
} catch (err) {
  if (!existsSync('/opt/pw-browsers/chromium')) throw err;
  browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
}

const page = await browser.newPage();
await page.goto(pathToFileURL(path.resolve(htmlPath)).href);
await page.waitForFunction(() => window.VIDEO && typeof window.seek === 'function', null, { timeout: 15000 });
await page.evaluate(() => document.fonts && document.fonts.ready);
const video = await page.evaluate(() => window.VIDEO);
const scale = Number(opt.scale || 1);
const W = Math.round(video.width * scale / 2) * 2;
const H = Math.round(video.height * scale / 2) * 2;
await page.setViewportSize({ width: video.width, height: video.height });

async function frameAt(t) {
  await page.evaluate((tt) => window.seek(tt), t);
  return page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: video.width, height: video.height } });
}

if (opt.still !== undefined) {
  const t = Number(opt.still);
  const out = outPath.replace(/\.[^.]+$/, '') + `-${t.toFixed(2)}s.png`;
  const buf = await frameAt(t);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(out, buf);
  console.log(out);
  await browser.close();
  process.exit(0);
}

const fps = video.fps || 30;
const from = Number(opt.from || 0);
const to = Math.min(Number(opt.to ?? video.duration), video.duration);
const total = Math.round((to - from) * fps);

const ffArgs = ['-y', '-hide_banner', '-loglevel', 'error',
  '-f', 'image2pipe', '-framerate', String(fps), '-i', '-'];
if (opt.audio) ffArgs.push('-ss', String(from), '-i', opt.audio);
ffArgs.push('-vf', `scale=${W}:${H}:flags=lanczos,format=yuv420p`,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-movflags', '+faststart');
if (opt.audio) ffArgs.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
ffArgs.push(outPath);

const ff = spawn('ffmpeg', ffArgs, { stdio: ['pipe', 'inherit', 'inherit'] });
const ffDone = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}`)))));

const started = Date.now();
for (let i = 0; i < total; i++) {
  const buf = await frameAt(from + i / fps);
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  if (i % fps === 0) process.stdout.write(`\rframe ${i}/${total}`);
}
ff.stdin.end();
await ffDone;
await browser.close();
console.log(`\rrendered ${total} frames (${W}x${H}@${fps}) in ${((Date.now() - started) / 1000).toFixed(1)}s -> ${outPath}`);
