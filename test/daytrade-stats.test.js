/**
 * Tests for the day-trading journal statistics:
 *
 *   node test/daytrade-stats.test.js
 *
 * No dependencies, no network, no browser.
 */
const S = require('../daytrade/stats.js');

let failures = 0;
function check(name, cond, detail = '') {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}
function near(name, actual, expected, tol = 1e-9) {
  check(name, Math.abs(actual - expected) <= tol, `got ${actual}, expected ${expected}`);
}

const trade = (over = {}) => ({
  date: '2026-09-04', ticker: 'AAPL', side: 'long',
  entry: 100, stop: 98, exit: 104, qty: 50, fees: 0, setup: 'breakout', rulesFollowed: true,
  ...over,
});

// ── R-multiple ─────────────────────────────────────────────────────
near('a long that makes twice its risk is +2R', S.rMultiple(trade()), 2);
near('a long stopped out is exactly -1R', S.rMultiple(trade({ exit: 98 })), -1);
near('a short is scored in its own direction',
  S.rMultiple(trade({ side: 'short', entry: 100, stop: 102, exit: 96 })), 2);
near('a short stopped out is -1R', S.rMultiple(trade({ side: 'short', entry: 100, stop: 102, exit: 102 })), -1);
near('money P&L follows the direction', S.pnlMoney(trade({ side: 'short', exit: 96 })), 200);

// Fees eat into R: risking $2/share on 50 shares is $100 of risk; $200 of
// profit minus $20 of commission is 1.8R, not 2R.
near('commissions are charged against R, not ignored', S.rMultiple(trade({ fees: 20 })), 1.8);
near('a "breakeven" trade is a loss once fees are paid', S.rMultiple(trade({ exit: 100, fees: 10 })), -0.1);

check('a trade without a real stop cannot be scored', S.rMultiple(trade({ stop: 100 })) === null);
check('an open trade is not closed', !S.isClosed(trade({ exit: '' })));
check('a trade with an exit is closed', S.isClosed(trade()));

// ── summarise ──────────────────────────────────────────────────────
const book = [
  trade({ exit: 104 }),                        // +2R
  trade({ exit: 98 }),                         // -1R
  trade({ exit: 102 }),                        // +1R
  trade({ exit: 98 }),                         // -1R
  trade({ exit: '' }),                         // open — ignored
  trade({ stop: 100, exit: 105 }),             // no risk defined — unscorable
];
const sum = S.summarise(book);

// count is the number of trades the statistics are computed over: the open one
// and the one with no definable risk are both excluded from it.
check('open trades stay out of the statistics', sum.count === 4 && sum.openCount === 1, `count=${sum.count} open=${sum.openCount}`);
check('trades without a stop are counted, not silently dropped', sum.unscorable === 1);
near('win rate counts only scored trades', sum.winRate, 2 / 4, 1e-12);
near('expectancy is the average R', sum.expectancy, (2 - 1 + 1 - 1) / 4, 1e-12);
near('total R adds up', sum.totalR, 1, 1e-12);
near('profit factor is gross win over gross loss', sum.profitFactor, 3 / 2, 1e-12);
near('best trade', sum.best, 2, 1e-12);
near('worst trade', sum.worst, -1, 1e-12);

// ── the curve and the drawdown ─────────────────────────────────────
check('equity curve accumulates R', JSON.stringify(S.equityCurve([1, -1, 2])) === '[1,0,2]');
near('drawdown measures peak to trough', S.maxDrawdownR([2, -1, -1, 3]), -2, 1e-12);
near('a curve that only rises has no drawdown', S.maxDrawdownR([1, 1, 1]), 0, 1e-12);
check('the longest losing streak is found', S.longestLossStreak([1, -1, -1, -1, 1, -1]) === 3);

// ── honesty of the verdict ─────────────────────────────────────────
const winners = Array.from({ length: 20 }, () => trade({ exit: 104 }));
const smallSample = S.verdict(S.summarise(winners));
check('a small sample refuses to claim an edge, however good it looks',
  /замало/.test(smallSample.headline) && smallSample.tone === 'neutral', smallSample.headline);

// 60 trades, alternating +2R / -1R: a real, consistent edge
const consistent = Array.from({ length: 60 }, (_, i) => trade({ exit: i % 2 ? 98 : 104 }));
const cSum = S.summarise(consistent);
const cVerdict = S.verdict(cSum);
near('expectancy of the +2/-1 book', cSum.expectancy, 0.5, 1e-12);
check('a large, consistent edge is reported as one', cVerdict.tone === 'good', cVerdict.headline);
check('the verdict projects over 100 trades rather than promising', /100 угод/.test(cVerdict.detail));
check('the verdict still refuses to guarantee the future', /не гарантує/.test(cVerdict.detail));

// 60 noisy trades averaging ~0: no edge either way
const noisy = Array.from({ length: 60 }, (_, i) => trade({ exit: i % 2 ? 98 : 102 }));
const nVerdict = S.verdict(S.summarise(noisy));
check('a coin-flip book is called out as unproven', /не доведена/.test(nVerdict.headline), nVerdict.headline);

// A consistent loser must be told plainly. Note the bar: a book winning 1 in 3
// at +1.5R still comes out "unproven" at 60 trades (t≈-1.1), which is the point
// of the t-test — this one loses hard enough (1 win in 4, +1R) to clear it.
const losing = Array.from({ length: 60 }, (_, i) => trade({ exit: i % 4 === 0 ? 102 : 98 }));
const lVerdict = S.verdict(S.summarise(losing));
check('a consistent loser is told plainly, not softened',
  lVerdict.tone === 'critical' && /мінус/.test(lVerdict.headline), lVerdict.headline);

check('no verdict is issued for an empty book', S.verdict(S.summarise([])).tone === 'neutral');

// ── grouping ───────────────────────────────────────────────────────
const mixed = [
  trade({ setup: 'breakout', exit: 104 }),
  trade({ setup: 'breakout', exit: 104 }),
  trade({ setup: 'revenge', exit: 98 }),
  trade({ setup: 'revenge', exit: 98 }),
];
const bySetup = S.groupBy(mixed, (t) => t.setup);
check('groups are ranked by expectancy', bySetup[0].key === 'breakout' && bySetup[1].key === 'revenge',
  bySetup.map((g) => g.key).join(','));
near('each group is scored on its own trades', bySetup[1].expectancy, -1, 1e-12);

const byRules = S.groupBy(
  [trade({ rulesFollowed: true, exit: 104 }), trade({ rulesFollowed: false, exit: 98 })],
  (t) => (t.rulesFollowed ? 'За правилами' : 'Правила порушені')
);
check('rule compliance can be scored separately', byRules.length === 2, JSON.stringify(byRules.map((g) => [g.key, g.expectancy])));

// ── position sizing ────────────────────────────────────────────────
const size = S.positionSize({ account: 10000, riskPct: 1, entry: 50, stop: 49, target: 53 });
check('shares keep the loss at the chosen risk', size.shares === 100, `${size.shares} shares`);
near('the risked money matches the budget', size.riskMoney, 100, 1e-9);
near('reward-to-risk is computed from the target', size.rr, 3, 1e-9);
near('target money follows R:R', size.targetMoney, 300, 1e-9);
check('direction is inferred from where the stop sits', size.side === 'long');
check('a short is recognised', S.positionSize({ account: 10000, riskPct: 1, entry: 50, stop: 51 }).side === 'short');

// Rounding must never round the risk *up*
const odd = S.positionSize({ account: 10000, riskPct: 1, entry: 50, stop: 49.3 });
check('share count rounds down so the risk is never exceeded',
  odd.shares === 142 && odd.riskMoney <= 100 + 1e-9, `${odd.shares} shares, $${odd.riskMoney.toFixed(2)}`);

check('a position bigger than the account is flagged as margin',
  S.positionSize({ account: 1000, riskPct: 5, entry: 20, stop: 19.9 }).needsMargin === true);
check('a missing stop yields no size at all', S.positionSize({ account: 10000, riskPct: 1, entry: 50, stop: 50 }) === null);
check('a zero account yields no size', S.positionSize({ account: 0, riskPct: 1, entry: 50, stop: 49 }) === null);

// ── daily limits ───────────────────────────────────────────────────
const day = '2026-09-04';
const limits = { maxTrades: 3, maxLossR: 2 };

const calm = S.dayStatus([trade({ exit: 104 })], day, limits);
check('a good day does not trigger a stop', !calm.shouldStop, JSON.stringify(calm));

const bleeding = S.dayStatus([trade({ exit: 98 }), trade({ exit: 98 })], day, limits);
check('hitting the daily loss limit says stop', bleeding.lossLimitHit && bleeding.shouldStop, JSON.stringify(bleeding.r));
check('the reason names the loss limit', /ліміт збитку/i.test(bleeding.reason), bleeding.reason);

const busy = S.dayStatus([trade(), trade(), trade()], day, limits);
check('hitting the trade count limit says stop', busy.tradeLimitHit && busy.shouldStop);
check('the reason names the trade limit', /Ліміт угод/.test(busy.reason), busy.reason);

const otherDay = S.dayStatus([trade({ date: '2026-09-03', exit: 98 }), trade({ date: '2026-09-03', exit: 98 })], day, limits);
check('yesterday’s losses do not count against today', !otherDay.shouldStop && otherDay.trades === 0);

const openCounts = S.dayStatus([trade({ exit: '' }), trade({ exit: '' }), trade({ exit: '' })], day, limits);
check('open trades still count toward the trade limit', openCounts.tradeLimitHit, `${openCounts.trades} trades`);

check('no limits configured means no nagging', !S.dayStatus([trade(), trade()], day, {}).shouldStop);

// ── formatting ─────────────────────────────────────────────────────
check('R is formatted with an explicit sign, never colour alone', S.fmtR(1.5) === '+1.50R' && S.fmtR(-1) === '−1.00R',
  `${S.fmtR(1.5)} / ${S.fmtR(-1)}`);

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
