---
name: portfolio-review
description: Reviews a whole portfolio or basket of holdings as one book rather than a list of tickers — concentration and hidden overlap, correlation clusters, position sizing against conviction, stress scenarios, and concrete trim/add/hold actions with sizes. Use this whenever the user shows holdings, positions, a watchlist, a basket, or pastes portfolio JSON; asks what to do with their portfolio, what to trim, what to add, whether they are over-concentrated, how diversified they are, or how much risk they are running; asks to rebalance or to size a position; or asks to sanity-check a backtest's results. Reach for it as soon as more than one ticker is on the table at once — the per-ticker workflow is trading-desk, and this is the layer above it that catches what looking at tickers one at a time structurally cannot.
---

# Portfolio Review

Five positions analysed one at a time are five analyses. They are not a
portfolio review, because the thing most likely to hurt this book — that four
of the five are the same bet wearing different tickers — is invisible from
inside any one of them.

That is the whole reason this skill exists separately from `trading-desk`.
`trading-desk` answers "is this a good position?" This answers "is this a good
*book*?", and those questions have different, sometimes opposite, answers: a
position that survives its own analysis can still be the one to cut, because of
what sits beside it.

Research scaffold, not financial advice — see Guardrails.

## Phase 0 — Ingest and ground

Accept holdings in whatever form they arrive: pasted text, a CSV, a table, or
this project's own storage format from `localStorage`:

```json
[{ "ticker": "NVDA", "shares": 10, "avgPrice": 118.4, "addedAt": 1757000000000 }]
```

That is the shape under the `mitp_portfolio_v1` key (`mitp_watchlist_v1` holds
a bare ticker array). The user can copy it straight out of DevTools, which is
faster than retyping positions and removes transcription errors.

Then ground it, exactly as `trading-desk` does:

1. Resolve every ticker to a real instrument — name, exchange, sector. Ticker
   letters are not identity.
2. Fetch current prices for each holding. Compute value, cost, P&L, and weight
   from **fetched** prices.
3. Record provenance per position: live price, stale price, or none. A position
   you could not price is not silently dropped — it is carried through the
   review labelled unpriced, because a missing 20% weight distorts every
   concentration number that follows.

**No unfetched number gets stated.** Weights are the load-bearing output here;
a weight computed from a guessed price makes every conclusion downstream wrong
in a way the user cannot see.

If the portfolio is large (>15 positions), fetch prices for all of them but
concentrate the written analysis on the top 10 by weight plus anything flagged
by Phase 1 — the tail rarely changes the decision.

## Phase 1 — Risk x-ray

This is the phase that justifies the skill. Work through each lens and say
plainly when a lens shows nothing.

**Single-name concentration.** Weights by position. Flag anything above 25% of
the book, and anything where one name carries more than the bottom half
combined.

**Sector and theme overlap.** Group holdings by what actually drives them, not
by GICS label. Five semiconductor names are one bet on one cycle regardless of
how different the companies are. So are "a bank, a broker, and an insurer" in a
rate move. Name the shared driver explicitly — that sentence is usually the
most valuable output of the whole review.

**Correlation clusters.** Which holdings move together? Where you can source
correlation data, use it; where you cannot, say so and reason from the shared
driver instead, labelled as inference rather than measurement.

**Factor tilts.** Is the whole book long duration, long momentum, long
small-cap, long a single macro variable (rates, oil, the dollar)? A portfolio
of high-multiple growth names is one interest-rate position.

**Cash and unpriced.** Cash weight is a position. So is anything unpriced.

## Phase 2 — Position level

For each significant holding, in one tight paragraph: what is the thesis, is it
still intact, and — the question the per-ticker view cannot ask — does it earn
its weight *given what else is in the book*?

Check `trading-desk/decision-log.md` first. If a holding was rated there, say
what the rating was, at what price, and whether the position's current size
matches that conviction. A Hold-rated name at 30% weight is a sizing error even
when the analysis was right.

Where a holding's thesis genuinely needs re-examination and the log is stale or
empty, run `trading-desk` on it rather than improvising a verdict here. Do not
run it on every holding by default — that is expensive and usually the sizing
question, not the thesis question, is what is live.

## Phase 3 — Stress

Three scenarios, each stated as a euro/dollar and percentage hit to the book:

1. **The concentration scenario.** The dominant cluster from Phase 1 falls 20%.
   This is the scenario the user is actually exposed to and rarely the one they
   have imagined.
2. **The single-name shock.** The largest holding falls 35% — a routine
   earnings-miss move for a high-multiple name, not a tail event.
3. **The correlated drawdown.** Everything correlated falls together, because
   in a real drawdown correlations converge toward one. Diversification that
   only exists in calm markets is not diversification.

Anchor these in the book's own realized volatility where it can be sourced; a
name that already fell 37% this year makes a 35% shock a base case, not a tail.

## Phase 4 — Actions

Concrete and sized. "Consider rebalancing" is not an action; "trim NVDA from
31% to 20%, roughly 14 shares at current price" is.

Order actions by what reduces the most risk per unit of disruption, and be
explicit about cost: every trim and add pays spread, commission, and tax.
A rebalance that improves the risk profile by a little and costs a lot is not
an improvement — say so when that is the case.

State the trigger for each action: now, or on a defined condition (a level, a
catalyst, a threshold). An action with no trigger does not get taken.

Where the honest answer is that the book is fine, say that and stop. Manufacturing
a rebalance to look useful is the failure mode of this genre.

## Phase 5 — Report

Write to `trading-desk/reports/portfolio-<YYYY-MM-DD>.md`:

```markdown
# Portfolio review — <YYYY-MM-DD>
## Snapshot
<table: ticker, shares, avg cost, price, value, weight, P&L, price provenance>
Total value · total cost · total P&L · cash · unpriced
## Risk x-ray
### Concentration · ### Overlap and shared drivers · ### Correlation
### Factor tilts
## Position level
## Stress scenarios
## Actions
<table: action, size, trigger, rationale, est. cost>
## What could not be verified
---
> Research scaffold, not financial or investment advice. Verify independently.
```

Append a line to `trading-desk/decision-log.md` recording the review and its
headline action, so the next run can check whether it was taken and what it
would have saved or cost.

In chat: the single biggest risk in the book, the top two or three actions, and
the report path. Not the whole report.

## What this deliberately does not do

It does not place trades, connect to brokers, or hold credentials. The upstream
project this workflow borrows its portfolio thinking from (Vibe-Trading) ships
broker connectors and mandate-gated execution; that half is deliberately absent
here. Analysis and execution failing together is how a bad review becomes a
bad fill, and a skill that can only reason cannot cause that.

If the user asks to execute, say plainly that this workflow ends at the
recommendation and their broker begins at the next step.

## Guardrails

Weights, correlations, and stress numbers look authoritative in a way prose
does not. That makes unsourced ones worse than useless. Every figure traces to
a fetched price or a stated inference — and where a number is inferred rather
than measured (correlation reasoned from shared drivers, volatility from a
remembered move), label it as inference in the report itself, not just in your
own head.

The user's own app already computes threshold-based hints — concentration ≥30%,
losers ≤−12%, winners ≥20%. Do not simply restate those; they can read them on
screen. The value added here is the part thresholds cannot see: overlap,
correlation, factor tilt, sizing against conviction, and second-order effects
of a proposed change.

Every report carries:

> Research scaffold, not financial or investment advice. LLM-generated analysis
> varies between runs and can be wrong. Verify independently before trading.

For auditing a backtest's methodology rather than reviewing live holdings, read
`references/backtest-audit.md`.
