/**
 * Tests for the backtest engine:
 *
 *   node test/backtest.test.js
 *
 * The important one is the look-ahead check. A backtest that peeks at future
 * prices produces beautiful numbers that mean nothing, and the bug is silent —
 * so the ranking is asserted to be byte-identical whether or not the future
 * exists in the data.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const store = new Map();
const sandbox = {
  window: {},
  location: { protocol: 'https:' },
  localStorage: {
    get length() { return store.size; },
    key: (i) => [...store.keys()][i],
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
  fetch: async () => { throw new Error('no network in test'); },
  console,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const file of ['history.js', 'backtest.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox);
}
const BT = sandbox.window.MITPBacktest;
const { compound, maxDrawdown, mean, stdev } = BT._internals;

let failures = 0;
function check(name, cond, detail = '') {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}
function near(name, actual, expected, tol = 1e-9) {
  check(name, Math.abs(actual - expected) <= tol, `got ${actual}, expected ${expected}`);
}

const DAY = 86400;
const N = 800;
const dates = Array.from({ length: N }, (_, i) => 1600000000 + i * DAY);

/** Pure exponential series: return over h sessions is exactly g^h - 1. */
function trend(dailyGrowth, start = 100) {
  return Array.from({ length: N }, (_, i) => start * Math.pow(dailyGrowth, i));
}

const G_LEAD = 1.0012;
const panel = {
  dates,
  closes: {
    LEAD: trend(G_LEAD),
    SECOND: trend(1.0006),
    THIRD: trend(1.0001),
    FLAT: trend(1.0),
    DOWN: trend(0.9994),
  },
  benchmark: trend(1.0003),
  dropped: [],
};

// ── no look-ahead ──────────────────────────────────────────────────
// Give every non-leader a spectacular future *after* the ranking date. If the
// ranking peeked, DOWN would stop ranking last.
const withFuture = JSON.parse(JSON.stringify(panel));
const cut = 400;
for (const ticker of Object.keys(withFuture.closes)) {
  if (ticker === 'LEAD') continue;
  for (let i = cut + 1; i < N; i++) withFuture.closes[ticker][i] *= 10;
}
const rankPlain = BT.rankAt(panel, cut);
const rankWithFuture = BT.rankAt(withFuture, cut);
check(
  'ranking ignores everything after the rebalance date',
  JSON.stringify(rankPlain) === JSON.stringify(rankWithFuture),
  `${JSON.stringify(rankPlain)} vs ${JSON.stringify(rankWithFuture)}`
);

const truncated = {
  dates: dates.slice(0, cut + 1),
  closes: Object.fromEntries(Object.entries(panel.closes).map(([k, v]) => [k, v.slice(0, cut + 1)])),
  benchmark: panel.benchmark.slice(0, cut + 1),
  dropped: [],
};
check(
  'ranking on a truncated panel matches the full one',
  JSON.stringify(BT.rankAt(truncated, cut)) === JSON.stringify(rankPlain)
);
check('the strongest trend ranks first', Object.entries(rankPlain).sort((a, b) => b[1] - a[1])[0][0] === 'LEAD');

// ── known-answer run ───────────────────────────────────────────────
const opts = { topN: 1, holdSessions: 21, warmupSessions: 252, costPct: 0.1 };
const report = BT.run(panel, opts);

const expectedPeriods = (() => {
  let count = 0;
  for (let t = opts.warmupSessions; t + opts.holdSessions < N; t += opts.holdSessions) count++;
  return count;
})();
check('every complete holding period is used', report.sampleSize === expectedPeriods, `${report.sampleSize} vs ${expectedPeriods}`);
check('top-1 always buys the leader', report.periods.every((p) => p.picks.length === 1 && p.picks[0].ticker === 'LEAD'));

const perPeriodRaw = Math.pow(G_LEAD, opts.holdSessions) - 1;
near('period return equals the leader return minus cost', report.periods[0].strategy, perPeriodRaw - opts.costPct / 100, 1e-12);
near('total return compounds the periods', report.totals.strategy, compound(new Array(expectedPeriods).fill(perPeriodRaw - opts.costPct / 100)), 1e-12);

const benchPeriod = Math.pow(1.0003, opts.holdSessions) - 1;
near('benchmark return is measured over the same periods', report.periods[0].benchmark, benchPeriod, 1e-12);
near('universe return averages every ticker', report.periods[0].universe,
  mean([G_LEAD, 1.0006, 1.0001, 1.0, 0.9994].map((g) => Math.pow(g, opts.holdSessions) - 1)), 1e-12);
check('a real edge is reported as positive', report.excess.vsBenchmark > 0);
check('a consistent edge wins every period', report.excess.winRateVsBenchmark === 1);
check('drawdown is zero when every period is positive', report.maxDrawdown.strategy === 0);

// ── cost handling ──────────────────────────────────────────────────
const free = BT.run(panel, { ...opts, costPct: 0 });
near('cost is charged once per rebalance', free.periods[0].strategy - report.periods[0].strategy, opts.costPct / 100, 1e-12);

// ── no-edge universe ───────────────────────────────────────────────
const clone = trend(1.0004);
const flatPanel = {
  dates,
  closes: { A: clone.slice(), B: clone.slice(), C: clone.slice(), D: clone.slice() },
  benchmark: clone.slice(),
  dropped: [],
};
const flatReport = BT.run(flatPanel, { ...opts, topN: 2, costPct: 0 });
near('identical tickers give the strategy no edge', flatReport.excess.vsUniverse, 0, 1e-12);
near('identical tickers give no edge vs the benchmark', flatReport.excess.vsBenchmark, 0, 1e-12);
check('t-stat is zero when there is no edge', flatReport.excess.tStatVsUniverse === 0, String(flatReport.excess.tStatVsUniverse));
check('a degenerate (zero-variance) edge reports a capped t, not 1e14',
  Math.abs(report.excess.tStatVsBenchmark) <= 99, String(report.excess.tStatVsBenchmark));
check('the verdict refuses to claim an edge', /немає/.test(BT.verdict({ ...flatReport, benchmarkTicker: 'SPY' })), BT.verdict({ ...flatReport, benchmarkTicker: 'SPY' }));

// ── alignment ──────────────────────────────────────────────────────
const aligned = BT.alignSeries(
  {
    SPY: { dates: dates.slice(0, 10), closes: trend(1.0003).slice(0, 10) },
    FULL: { dates: dates.slice(0, 10), closes: trend(1.001).slice(0, 10) },
    // misses two sessions in the middle
    GAPPY: { dates: [0, 1, 2, 5, 6, 7, 8, 9].map((i) => dates[i]), closes: [10, 11, 12, 15, 16, 17, 18, 19] },
    // starts later than the window
    LATE: { dates: dates.slice(4, 10), closes: [1, 2, 3, 4, 5, 6] },
  },
  'SPY'
);
check('the axis follows the benchmark calendar', aligned.dates.length === 10);
check('a late listing is dropped, not silently truncating everyone', aligned.dropped.includes('LATE') && !aligned.closes.LATE);
check('gaps are forward-filled with the last known close',
  JSON.stringify(aligned.closes.GAPPY) === JSON.stringify([10, 11, 12, 12, 12, 15, 16, 17, 18, 19]),
  JSON.stringify(aligned.closes.GAPPY));
check('the benchmark itself is carried through', aligned.benchmark.length === 10);

// ── guards ─────────────────────────────────────────────────────────
let threw = '';
try { BT.run({ dates: dates.slice(0, 100), closes: { A: trend(1.001).slice(0, 100), B: trend(1.0).slice(0, 100) }, benchmark: trend(1.0).slice(0, 100), dropped: [] }, opts); }
catch (e) { threw = e.message; }
check('a too-short window is refused, not quietly reported', /not enough history/.test(threw), threw);

// ── helper math ────────────────────────────────────────────────────
near('compound multiplies', compound([0.1, 0.1]), 0.21, 1e-12);
near('drawdown measures peak-to-trough', maxDrawdown([0.5, -0.5]), -0.5, 1e-12);
near('stdev of a constant series is zero', stdev([3, 3, 3]), 0, 1e-12);

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
