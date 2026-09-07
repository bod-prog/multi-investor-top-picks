# Backtest audit

For auditing a backtest's *methodology* — the question "is this number real?"
rather than "what should I hold?".

A backtest result is a claim about a counterfactual, and the ways it goes wrong
are systematic rather than random: almost every error flatters the strategy.
So audit in the direction of the bias — assume the number is too good and look
for the reason, rather than checking whether the arithmetic is right.

## This project's engine

`backtest.js` implements a walk-forward test of the RS ranking: at each
rebalance the ranking sees only closes up to that date, buys the top N equal
weight, holds `holdSessions`, repeats. Defaults: `topN: 5`,
`holdSessions: 21`, `warmupSessions: 252`, `costPct: 0.1`.

What it already gets right, and should not be "fixed":

- **No look-ahead in the ranking.** The loop starts at `t = warmupSessions` and
  each pick uses only prior closes, through the same `statsFromCloses` /
  `rsScores` the live app ranks with. Warm-up bars are genuinely outside the
  evaluation window — a distinct thing from merely having a year of data
  loaded.
- **Fundamentals deliberately excluded.** Finnhub serves only *current*
  fundamentals, so scoring a past date with them would be look-ahead. The file
  says so and leaves them out. That is the correct call, and it means the test
  measures the price signal only.
- **Survivorship bias declared.** The ticker list is today's list, so bankrupt
  and delisted names are absent and the result is overstated. Already in the
  caveats.
- **Costs and fill price declared.** 0.1% round-trip per rebalance, buying at
  the rebalance day's close, both stated as approximations.

## Two gaps not currently in the caveats

### 1. Dividends are missing from returns

`history.js:117` reads `result.indicators?.quote?.[0]?.close`. On Yahoo's chart
API that series is split-adjusted but **not** dividend-adjusted; the
dividend-adjusted series is `indicators.adjclose[0].adjclose`.

Consequence: every return in both the RS ranking and the backtest is a price
return, not a total return. That is not a uniform haircut — it scales with each
name's yield, so across a mixed list it systematically ranks dividend payers
below non-payers by roughly the yield over the measurement window. On the
12-month RS component, a 4%-yielding name is docked about 4 points of return
against a zero-yield name that performed identically on a total-return basis.

Verify before changing anything: fetch one known dividend payer and compare
`quote[0].close` against `adjclose[0].adjclose` on the same date. If they
differ on a historical bar, the effect is confirmed for this data path.

Two defensible responses — pick one deliberately rather than drifting:

- Switch to `adjclose` so RS measures total return. More correct for ranking;
  changes historical scores, so any stored comparisons reset.
- Keep price returns and state it in the caveats, on the grounds that a
  day-trading tool cares about price action. Defensible, but then the bias
  against dividend payers should be named where the user can see it.

### 2. Forward-fill silently holds halted and delisted names flat

`backtest.js:66` forward-fills occasional missing days with the last known
close, which is right for a stray missing bar and wrong for a name that stops
trading. A halted or delisted position keeps its last price forever and
contributes 0% instead of its actual outcome, which for a delisting is usually
catastrophic. This is the same failure the upstream Vibe-Trading project fixed
under "a halted position was marked back to what you paid for it".

In this codebase the exposure is bounded — the ticker list is today's
survivors, so a true delisting mostly cannot appear — but that bound *is* the
survivorship bias, so the two caveats compound rather than cancel: the test
cannot see the failures, and would mismark them as flat if it could.

Worth adding: a cap on consecutive forward-filled days, above which the ticker
is dropped from the window (as short-history tickers already are) rather than
carried flat.

## General checklist

Beyond this engine, when auditing any backtest — including one a user pastes
from elsewhere:

**Look-ahead.** Does every decision use only data published before the decision
time? Fundamentals, index membership, analyst ratings, and restated financials
are the usual carriers, because their vendors serve current values by default.

**Survivorship.** Where did the universe come from? A list assembled today
cannot contain what died.

**Warm-up.** Are the bars an indicator needs excluded from the evaluation
window, or merely present in the data?

**Costs.** Spread, commission, slippage, tax. Charged on what — the whole book
each rebalance, or only the changed positions? Charging the full round trip on
overlapping holdings overstates cost, which errs safe; the reverse does not.

**Fill realism.** Buying at the close of the decision day assumes a fill nobody
gets. On thin names, assume worse.

**Sample size.** Count the independent periods, not the days. A year of daily
bars with monthly rebalancing is twelve observations. Report the t-statistic
and treat anything under ~2 as indistinguishable from luck.

**Parameter selection.** Were `topN`, `holdSessions`, and the RS weights chosen
before seeing results or tuned against them? Tuned parameters need
out-of-sample evidence before the number means anything.

**Corporate actions.** Splits, dividends, spin-offs, ticker changes.

## Reporting an audit

Separate what was verified in the code from what is inferred about the data
source. State the *direction* of each bias — a strategy overstated by
survivorship and understated by missing dividends is not "roughly right"; the
two do not cancel, they widen the error bar in both directions.

End with what would have to be true for the result to be believable, not with a
verdict on the strategy.
