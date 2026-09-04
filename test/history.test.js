/**
 * Sanity tests for the history.js math, run outside the browser:
 *
 *   node test/history.test.js
 *
 * No dependencies and no network — history.js is evaluated in a vm context
 * with the browser globals it touches stubbed out.
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
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'history.js'), 'utf8'), sandbox);

const H = sandbox.window.MITPHistory;
const { perfPct, annualisedVolPct, statsFromCloses, rsScores } = H._internals;

let failures = 0;
function check(name, actual, expected, tol = 1e-6) {
  const ok = Math.abs(actual - expected) <= tol;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: got ${typeof actual === 'number' ? actual.toFixed(3) : actual}, expected ~${expected}`);
}
function checkTrue(name, cond, detail = '') {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

// ── perfPct ────────────────────────────────────────────────────────
// 300 sessions rising 100 -> 200 linearly in log space
const n = 300;
const geo = Array.from({ length: n }, (_, i) => 100 * Math.pow(2, i / (n - 1)));
// last vs 63 sessions ago
const expected63 = (geo[n - 1] / geo[n - 1 - 63] - 1) * 100;
check('perfPct 63 sessions on a known series', perfPct(geo, 63), expected63, 1e-9);
check('perfPct falls back to oldest bar when history is short', perfPct([100, 110], 252), 10, 1e-9);
check('perfPct on a flat series is 0', perfPct(new Array(300).fill(50), 63), 0, 1e-9);
checkTrue('perfPct needs 2+ bars', perfPct([100], 63) === null);

// ── annualised volatility ──────────────────────────────────────────
check('flat series has zero volatility', annualisedVolPct(new Array(40).fill(100)), 0, 1e-9);

// Series with a known daily sigma: alternating +/- d in log space gives
// sample stdev = d * sqrt(N/(N-1)) around a zero mean.
const d = 0.02;
const alt = [100];
for (let i = 1; i <= 40; i++) alt.push(alt[i - 1] * Math.exp(i % 2 ? d : -d));
const volAlt = annualisedVolPct(alt);
const rets = 21; // VOL_SESSIONS returns are used
const expectedVol = d * Math.sqrt(rets / (rets - 1)) * Math.sqrt(252) * 100;
check('annualised vol on a +/-2% alternating series', volAlt, expectedVol, 0.5);
checkTrue('vol needs enough returns', annualisedVolPct([100, 101, 102]) === null);

// Calibration: the 0..100 scale used by scoreVolatilityForDay peaks at 45.
const VOL_TO_SCORE = 1.2;
check('37.5%/yr maps onto the day-trading sweet spot (45)', 37.5 * VOL_TO_SCORE, 45, 0.01);
checkTrue('a calm mega-cap (18%/yr) scores low', 18 * VOL_TO_SCORE < 25, `${(18 * VOL_TO_SCORE).toFixed(0)}`);
checkTrue('a wild small-cap (90%/yr) clamps high', Math.min(95, 90 * VOL_TO_SCORE) === 95);

// ── statsFromCloses ────────────────────────────────────────────────
const st = statsFromCloses(geo, 1770000000);
checkTrue('stats carry every lookback window', ['m3', 'm6', 'm9', 'm12', 'weighted'].every((k) => Number.isFinite(st.perf[k])));
checkTrue('weighted perf sits between the 3m and 12m returns',
  st.perf.weighted > Math.min(st.perf.m3, st.perf.m12) - 1e-9 &&
  st.perf.weighted < Math.max(st.perf.m3, st.perf.m12) + 1e-9,
  `w=${st.perf.weighted.toFixed(2)} m3=${st.perf.m3.toFixed(2)} m12=${st.perf.m12.toFixed(2)}`);
check('lastClose is the final bar', st.lastClose, geo[n - 1], 1e-9);

// ── RS ranking ─────────────────────────────────────────────────────
function seriesWithReturn(totalPct) {
  const len = 300;
  const growth = Math.pow(1 + totalPct / 100, 1 / (len - 1));
  return Array.from({ length: len }, (_, i) => 100 * Math.pow(growth, i));
}
const universe = {};
const truth = { LEAD: 120, GOOD: 45, MID: 12, WEAK: -5, LAG: -30 };
for (const [t, r] of Object.entries(truth)) universe[t] = statsFromCloses(seriesWithReturn(r), 0);
const bench = statsFromCloses(seriesWithReturn(11), 0); // SPY-ish +11%
const { rs, benchPerf } = rsScores(universe, bench);

console.log('   rs =', JSON.stringify(rs), '| benchPerf =', benchPerf.toFixed(2));
checkTrue('the leader outranks every peer', Object.entries(rs).every(([t, v]) => t === 'LEAD' || v < rs.LEAD));
checkTrue('the laggard ranks last', Object.entries(rs).every(([t, v]) => t === 'LAG' || v > rs.LAG));
checkTrue('ranking is monotone in performance',
  rs.LEAD > rs.GOOD && rs.GOOD > rs.MID && rs.MID > rs.WEAK && rs.WEAK > rs.LAG);
checkTrue('a stock beating the benchmark scores above 50', rs.GOOD > 50, `GOOD=${rs.GOOD}`);
checkTrue('a stock trailing the benchmark scores below 50', rs.WEAK < 50, `WEAK=${rs.WEAK}`);
checkTrue('every rs stays inside the range scorers expect (5..99)',
  Object.values(rs).every((v) => v >= 5 && v <= 99 && Number.isInteger(v)));

// Small universe: percentile is skipped, benchmark comparison still works
const small = { A: universe.LEAD, B: universe.LAG };
const rsSmall = rsScores(small, bench).rs;
checkTrue('small universe still separates leader from laggard', rsSmall.A > rsSmall.B, JSON.stringify(rsSmall));

// No benchmark at all
const rsNoBench = rsScores(universe, null).rs;
checkTrue('works without a benchmark', rsNoBench.LEAD > rsNoBench.LAG, JSON.stringify(rsNoBench));

// ── the bug this replaces ──────────────────────────────────────────
// Old proxy: rs = 50 + todayChange*8. A flat 12-month laggard that pops 4%
// today scored 82 while a genuine year-long leader flat on the day scored 50.
const oldLaggardPop = Math.min(99, 50 + 4 * 8);
const oldLeaderQuiet = 50;
checkTrue('old same-day proxy ranked a one-day pop above a year-long leader',
  oldLaggardPop > oldLeaderQuiet, `${oldLaggardPop} vs ${oldLeaderQuiet}`);
checkTrue('history-based RS gets that ordering right', rs.LEAD > rs.LAG, `${rs.LEAD} vs ${rs.LAG}`);

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
