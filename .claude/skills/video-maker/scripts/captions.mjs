#!/usr/bin/env node
// Render caption cards to transparent PNGs with headless Chromium (full Unicode + color emoji).
// Usage: node captions.mjs <captions.json> <outdir>
// captions.json: { "width": 1080, "items": [{ "id": "c01", "text": "Step 1: the door", "style": "step" }] }
// Styles: hook (big, top third), step (pill, lower third), note (small pill), end (big, centre).

import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
let playwright;
for (const c of ['playwright', '/opt/node-tools/node_modules/playwright']) {
  try { playwright = require(c); break; } catch { /* next */ }
}
if (!playwright) { console.error('playwright not found'); process.exit(1); }

const [specPath, outDir] = process.argv.slice(2);
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
mkdirSync(outDir, { recursive: true });
const W = spec.width || 1080;

const STYLES = {
  hook: 'font-size:78px;line-height:1.08;font-weight:900;color:#fff;-webkit-text-stroke:3px #111;paint-order:stroke fill;text-shadow:0 6px 18px rgba(0,0,0,.55);max-width:1010px;',
  end: 'font-size:74px;line-height:1.08;font-weight:900;color:#fff;-webkit-text-stroke:3px #111;paint-order:stroke fill;text-shadow:0 6px 18px rgba(0,0,0,.55);max-width:1000px;',
  step: 'font-size:58px;line-height:1.15;font-weight:800;color:#111;background:#ffd23f;padding:18px 34px;border-radius:999px;box-shadow:0 8px 24px rgba(0,0,0,.35);max-width:920px;',
  note: 'font-size:46px;line-height:1.2;font-weight:700;color:#fff;background:rgba(0,0,0,.62);padding:14px 28px;border-radius:999px;max-width:900px;',
};

let browser;
try { browser = await playwright.chromium.launch(); }
catch (e) {
  if (!existsSync('/opt/pw-browsers/chromium')) throw e;
  browser = await playwright.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
}
const page = await browser.newPage({ viewport: { width: W, height: 600 } });
for (const item of spec.items) {
  const style = STYLES[item.style] || STYLES.step;
  const esc = String(item.text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;background:transparent}
    #c{display:inline-block;text-align:center;font-family:"DejaVu Sans","Liberation Sans","Noto Color Emoji",sans-serif;${style}}
  </style></head><body><div style="width:${W}px;display:flex;justify-content:center;padding:24px 0"><div id="c">${esc}</div></div></body></html>`);
  await page.evaluate(() => document.fonts && document.fonts.ready);
  const box = await page.locator('#c').boundingBox();
  const pad = 24;
  const out = path.join(outDir, `${item.id}.png`);
  await page.screenshot({
    path: out, omitBackground: true,
    clip: { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: Math.min(W, box.width + pad * 2), height: box.height + pad * 2 },
  });
  console.log(out);
}
await browser.close();
