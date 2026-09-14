/**
 * Tests for the Jewel Coloring rules:
 *
 *   node test/jewel.test.js
 *
 * No dependencies, no network, no browser — quantize.js, level.js and shop.js
 * are deliberately free of the DOM so the parts a player can lose progress or
 * coins to can be checked here.
 */
const Q = require('../games/jewel/js/quantize.js');
const L = require('../games/jewel/js/level.js');
const S = require('../games/jewel/js/shop.js');

let failures = 0;
function check(name, cond, detail = '') {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

/** An image of horizontal colour bands, optionally with a transparent margin. */
function bands(width, height, stops, alphaRows = null) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const band = stops.find((s) => y < s.until) || stops[stops.length - 1];
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = band.color[0];
      data[i + 1] = band.color[1];
      data[i + 2] = band.color[2];
      data[i + 3] = alphaRows && alphaRows(x, y) ? 0 : 255;
    }
  }
  return { width, height, data };
}

// ── quantiser ──────────────────────────────────────────────────────
const image = bands(60, 60, [
  { until: 30, color: [220, 40, 60] },    // half the picture
  { until: 45, color: [40, 180, 90] },
  { until: 60, color: [40, 90, 220] },
]);

const level = Q.buildLevel(image, 12, 12, 8, 42);
check('the grid has one cell per square', level.cells.length === 144, `${level.cells.length}`);
check('flat colours collapse to exactly as many swatches as there are colours',
  level.palette.length === 3, `${level.palette.length}`);
check('the palette starts with the colour there is most of',
  level.palette[0][0] > 200 && level.palette[0][1] < 80, JSON.stringify(level.palette[0]));
check('a recovered colour is the colour that went in',
  Math.abs(level.palette[0][0] - 220) <= 2 && Math.abs(level.palette[0][2] - 60) <= 2,
  JSON.stringify(level.palette[0]));

const again = Q.buildLevel(image, 12, 12, 8, 42);
check('the same picture and seed always build the same level',
  JSON.stringify(again.cells) === JSON.stringify(level.cells));
const otherSeed = Q.buildLevel(image, 12, 12, 8, 7);
check('a different seed still lands on the same three colours',
  otherSeed.palette.length === 3, `${otherSeed.palette.length}`);

// A level can never ask for more colours than the picture has. (12 cells across
// a 60px image puts every band edge on a cell edge, so there is nothing to blend
// and any extra swatch would be invented.)
const overAsk = Q.buildLevel(image, 12, 12, 28, 1);
check('asking for 28 colours out of a 3-colour picture does not invent 25 more',
  overAsk.palette.length === 3, `${overAsk.palette.length}`);

// A thin stripe of a fourth colour is one tap of work spread over a whole
// palette slot — it belongs with its nearest neighbour, not in the palette.
const speck = bands(60, 60, [
  { until: 29, color: [220, 40, 60] },
  { until: 30, color: [214, 52, 66] },
  { until: 45, color: [40, 180, 90] },
  { until: 60, color: [40, 90, 220] },
]);
check('a sliver of a near-identical colour does not earn its own swatch',
  Q.buildLevel(speck, 12, 12, 8, 5).palette.length === 3,
  `${Q.buildLevel(speck, 12, 12, 8, 5).palette.length}`);

const holed = Q.buildLevel(bands(40, 40, [{ until: 40, color: [200, 30, 60] }], (x, y) => y < 10), 8, 8, 4, 3);
check('transparent areas become holes, not black cells',
  holed.cells.slice(0, 8).every((c) => c === Q.EMPTY) && holed.cells.slice(16).every((c) => c !== Q.EMPTY),
  holed.cells.slice(0, 16).join(''));

// ── level rules ────────────────────────────────────────────────────
const def = {
  cols: 4, rows: 2,
  palette: [[255, 0, 0], [0, 0, 255]],
  cells: [0, 0, 1, -1, 0, 1, 1, -1],
};

let progress = L.createProgress(def);
check('holes are not part of the work', progress.paintable === 6, `${progress.paintable}`);
check('each colour knows its own total', progress.totals[0] === 3 && progress.totals[1] === 3,
  progress.totals.join('/'));

check('the right colour on the right cell lands', L.paint(progress, def, 0, 0).ok);
check('the same cell cannot be painted twice', L.paint(progress, def, 0, 0).reason === 'already');
const wrong = L.paint(progress, def, 1, 1);
check('a wrong colour is refused and counted', !wrong.ok && wrong.reason === 'wrong' && progress.mistakes === 1);
check('a wrong colour still says which one was wanted', wrong.wanted === 0, `${wrong.wanted}`);
check('a hole cannot be painted', L.paint(progress, def, 3, 0).reason === 'empty');
check('progress counts only correct cells', Math.abs(L.ratio(progress) - 1 / 6) < 1e-9, `${L.ratio(progress)}`);

check('the next colour skips a finished one', L.nextColor(progress, 0) === 1, `${L.nextColor(progress, 0)}`);
check('remaining cells of a colour are listed', L.remainingCells(progress, def, 0).join(',') === '1,4');
check('a bomb can be told how many cells to take',
  L.remainingCells(progress, def, 1, 2).length === 2);

// Finish it off and watch for the completion flag.
[1, 4].forEach((cell) => L.paint(progress, def, cell, 0));
const last = [2, 5, 6].map((cell) => L.paint(progress, def, cell, 1));
check('the level reports complete exactly once, on the final cell',
  last[2].complete && !last[0].complete && progress.complete);
check('a finished level is 100%', L.ratio(progress) === 1);

// Coin drip: every hundredth correct cell pays, and nothing else does.
const bigDef = { cols: 20, rows: 20, palette: [[1, 2, 3]], cells: new Array(400).fill(0) };
const bigProgress = L.createProgress(bigDef);
let dripped = 0;
for (let i = 0; i < 400; i++) dripped += L.paint(bigProgress, bigDef, i, 0).coins || 0;
check('a 400-cell level drips coins four times while playing',
  dripped === 4 * L.DRIP_COINS, `${dripped}`);

// ── payout ─────────────────────────────────────────────────────────
const easy = L.difficulty('easy');
const expert = L.difficulty('expert');
const clean = L.createProgress(bigDef);
clean.correct = clean.paintable;
const sloppy = L.createProgress(bigDef);
sloppy.correct = sloppy.paintable;
sloppy.mistakes = 500;

check('a harder difficulty pays more for the same picture',
  L.reward(bigDef, clean, expert) > L.reward(bigDef, clean, easy),
  `${L.reward(bigDef, clean, expert)} vs ${L.reward(bigDef, clean, easy)}`);
check('mistakes cost coins', L.reward(bigDef, sloppy, easy) < L.reward(bigDef, clean, easy),
  `${L.reward(bigDef, sloppy, easy)} vs ${L.reward(bigDef, clean, easy)}`);
check('even a hopeless run keeps more than half the payout',
  L.reward(bigDef, sloppy, easy) >= Math.round(L.reward(bigDef, clean, easy) * 0.55) - 1);
check('replaying a solved picture pays a quarter, so it is not a coin farm',
  L.reward(bigDef, clean, easy, { replay: true }) < L.reward(bigDef, clean, easy) * 0.3);

// ── saves ──────────────────────────────────────────────────────────
const saved = L.saveProgress(progress);
const restored = L.loadProgress(def, saved);
check('a save restores the exact cells that were filled',
  JSON.stringify(restored.filled) === JSON.stringify(progress.filled));
check('a save restores the per-colour counters', restored.done.join('/') === progress.done.join('/'));
check('a save restores mistakes and completion', restored.mistakes === 1 && restored.complete);

const flags = [true, false, true, true, false, false, true, false, true];
check('flag packing survives a round trip',
  L.unpackFlags(L.packFlags(flags), flags.length).join(',') === flags.join(','));
check('a 64×64 save fits in well under a kilobyte',
  L.packFlags(new Array(4096).fill(true)).length < 700, `${L.packFlags(new Array(4096).fill(true)).length} chars`);
check('cells survive a round trip through text',
  L.cellsFromString(L.cellsToString(def.cells)).join(',') === def.cells.join(','));

// A tampered or stale save must not be able to fill a hole.
const forged = L.loadProgress(def, { filled: L.packFlags(new Array(8).fill(true)), mistakes: 0 });
check('a save cannot fill cells that are outside the picture',
  !forged.filled[3] && !forged.filled[7] && forged.correct === 6, `${forged.correct}`);

// ── wallet and shop ────────────────────────────────────────────────
const wallet = S.createWallet();
check('a new player can afford the cheapest pack', wallet.coins >= S.item('hint5').price);
check('a first run starts with the starter pouch, not an empty one',
  S.normalize(null).items.hint === wallet.items.hint && S.normalize(undefined).coins === wallet.coins,
  JSON.stringify(S.normalize(null).items));
check('a saved wallet with an empty pouch stays empty',
  S.normalize({ coins: 5, items: { hint: 0, bomb: 0 } }).items.hint === 0);

const broke = S.normalize({ coins: 10, items: { hint: 0, bomb: 0 }, owned: [] });
const denied = S.buy(broke, 'style.star');
check('a purchase without the coins is refused, not overdrawn',
  !denied.ok && denied.reason === 'poor' && broke.coins === 10);
check('the refusal says how much is missing', denied.short === S.item('style.star').price - 10);

S.earn(broke, 1000);
const bought = S.buy(broke, 'style.star');
check('buying a style charges once and hands it over',
  bought.ok && broke.coins === 1010 - S.item('style.star').price && S.owns(broke, 'style.star'));
check('a bought style is worn straight away', broke.style === 'star');
check('the same style cannot be bought twice', S.buy(broke, 'style.star').reason === 'owned');

const beforePack = broke.coins;
S.buy(broke, 'hint5');
check('a consumable adds to the pouch and can be bought again',
  broke.items.hint === 5 && broke.coins === beforePack - S.item('hint5').price &&
  S.buy(broke, 'hint5').ok && broke.items.hint === 10);

const pouch = S.normalize({ coins: 0, items: { hint: 1, bomb: 0 } });
check('a power-up spends the pouch before the wallet',
  S.spend(pouch, 'hint').paid === 'item' && pouch.items.hint === 0);
check('with an empty pouch and no coins the power-up is refused',
  !S.spend(pouch, 'hint').ok && pouch.coins === 0);
pouch.coins = 100;
const paid = S.spend(pouch, 'hint');
check('with coins it falls back to paying cash',
  paid.paid === 'coins' && pouch.coins === 100 - S.HINT_COINS);

const repaired = S.normalize({ coins: -50, items: { hint: 'x' }, owned: ['style.heart'] });
check('a broken save never yields negative coins or NaN items',
  repaired.coins >= 0 && repaired.items.hint === 0 && repaired.items.bomb === 0);
check('normalising keeps what was already bought and restores the defaults',
  S.owns(repaired, 'style.heart') && S.owns(repaired, 'style.round'));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
