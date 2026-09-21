---
name: day-picks
description: Finds stocks moving today, for a position opened and closed inside the session — gap-and-go setups, high-beta names on a live catalyst, and the day's largest liquid movers, each verified to a dated price and market cap. Use this when the user asks what is moving today, what to day trade, what gapped, what is running right now, or asks for picks with an explicitly intraday or same-day horizon. It is deliberately separate from swing-picks (a dated catalyst over days to weeks) and top-picks (fundamentals over a month or more), because the intraday horizon has data limits the other two do not, and this skill states them rather than working around them.
---

# Day Picks

Today's movers, for a position that does not survive the close.

`market-today` sets the tape → **`day-picks`** finds what is moving in it →
`swing-picks` is the sibling for multi-day holds → `trading-desk` and the user's
app are *not* downstream of this skill, for reasons in Limits.

Research scaffold, not financial advice — see Guardrails.

## Limits — read before running, not after

This is stated first because it is the most important thing in the file and
because two full runs (2026-09-11 and 2026-09-21) measured it independently and
got the identical result.

**Every intraday data feed is blocked by the network proxy.** TradingView,
Benzinga, CNBC, CNN, MarketChameleon, StockAnalysis and TradingEconomics all
return an egress block. That is two measurements ten days apart with identical
behaviour, so treat it as settled.

**Do not spend searches attempting them.** Go straight to news-based sourcing,
which is the only channel that has ever produced a name here.

**What is therefore unobtainable, on every run:**

- Relative volume — the primary gap-and-go filter
- VWAP, the opening range, the bid-ask spread
- Premarket volume, level 2, short-interest intraday

**What you can get**: a dated price, the day's high and low, market cap, the
percentage move, and the catalyst. That is enough to verify a name and to
measure its gap structure. **It is not a trading setup**, and the report must
say so rather than letting a well-verified price imply a tradeable edge.

**The two downstream handoffs both fail at this horizon:**

- The user's app ranks by relative strength computed from **a year of daily
  bars** — a multi-week measure that cannot see an intraday setup.
- `trading-desk` runs four analysts, a debate and a risk review to produce a
  3–6 month thesis. Pointing it at a day trade is a category error; it would
  rule after the close.

So this skill's output is terminal: names and structure for the user to act on
directly, with the gaps named.

## Phase 0 — Timing, and it is not optional

1. `date -u`, convert to ET, locate the session (open 09:30, close 16:00 ET).
2. **Run mid-session where possible.** Measured: a run at 22 minutes after the
   open produced one loose and one unpinnable name; the same method three hours
   in produced two names cross-checking inside 0.02%. Before ~11:00 ET the
   opening range has not resolved and the day's moves are provisional.
3. **After 15:00 ET, say so and reframe.** An hour before the close is not a
   day-trade entry; deliver the names as tomorrow's gap watchlist instead.
4. If the market is closed, **stop and say so.** Offer `swing-picks` instead.
   Do not produce an intraday list against a closed tape.

Exclusions: names already in `trading-desk/decision-log.md`, listed with
`python3 trading-desk/tools/deskdb.py timeline`.

## Phase 1 — Source the movers, by the day of the week

The catalyst angle is **day-of-week dependent**, which is not obvious and cost
a run to notice:

| Day | What produces the day's biggest movers |
|---|---|
| **Monday** | Weekend news — deals, partnerships, index changes, regulatory rulings |
| **Tue–Thu** | Earnings reactions, both the beat and the guide |
| **Friday** | Earnings, plus index rebalancing and option expiry on the third Friday |
| **Any day** | An FDA decision, a court ruling, a major macro release at 08:30 ET |

Search for named moves with numbers attached — "stocks making the biggest moves
today", the day's gainers and losers, specific sector moves. Aim for 8–15 raw
names.

**Sector and style are set by what is actually moving**, not chosen in advance.
On a day when chips and crypto are bid, that is the tape; note it as the
search's bias rather than presenting the list as diversified.

## Phase 2 — Verify, and measure the gap

Every name needs, all of them fetched and none remembered:

1. **A price dated today**, with the session high and low.
2. **Market cap and share count**, and the cross-check:
   `cap ÷ shares` against the quoted price. Inside ~1% passes.
3. **Liquidity** — mega-cap and large-cap names only, in practice. A thin name
   cannot be exited intraday and does not belong on this list regardless of the
   move.

Then the one structural measurement that *is* available here:

**The gap-fill test.** Derive the prior close from the price and the percentage
move. Then ask where the session low sits relative to it:

- **Low above the prior close** → the gap never filled. Buyers defended it all
  session. This is the strongest intraday structure obtainable from this data.
- **Low below the prior close** → the gap was sold through. Anyone who bought
  the open on a tight stop was taken out before the move they were right about.

Report the **intraday range as a percentage of price**. Mega-cap liquidity with
a 6–11% range is what this horizon is looking for; a 1% range on a large cap is
not a day trade however good the story.

**A percentage move with no price level is not a candidate.** It cannot be
entered, sized or stopped. This single rule rejected seven of nine candidates on
one run — that is the rule working, not the market being thin.

**Discard, do not reconcile.** A market cap that implies a price above the day's
high is wrong. Say which figure was discarded and why, so the next run does not
resurface it.

## Phase 3 — Rank and hand over

Rank by **strength of evidence**, not by size of move.

For each survivor: the price and range, the gap-fill result, the catalyst with
its source and date, and **the single thing most likely to break it**.

Then the honest handoff, which is different from every other skill here:

> These names are verified as *price and structure*. They are not a trading
> setup — relative volume, VWAP and the opening range could not be sourced.
> Do not paste them into the app: its relative strength comes from daily bars
> and cannot score an intraday move. Do not send them to `/trading-desk`: that
> produces a multi-month thesis.

Where a name is better held for days than hours, **say so and point at
`swing-picks`**. Both prior day-horizon runs concluded exactly that about their
own output, and saying it plainly is more useful than pretending otherwise.

## Phase 4 — Output

In chat: a ranked table (ticker · company · price and as-of · move · gap-fill ·
range as % · catalyst), then the two or three with the best structure.

Write the full run to `trading-desk/reports/day-picks-<YYYY-MM-DD>.md` and
append one line to `trading-desk/decision-log.md` with the marker `*day-picks*`.
The log row is what lets a later run check what these names actually did.

## Guardrails

**Disclose a conflict the moment it appears.** If a catalyst involves Anthropic,
say so plainly, report the terms as sourced, and decline to judge whether the
market's reaction is correct. Name whose interest a judgement serves — including
your own.

**The report outlives the setup.** A name that has already traversed 7% today
will have moved again by the time this is read. Say that rather than implying
the levels are live.

**Do not pad.** Two verified names beat six with four unverified.

Every report carries:

> Research scaffold, not financial or investment advice. LLM-generated analysis
> varies between runs and can be wrong. Verify independently before trading.
