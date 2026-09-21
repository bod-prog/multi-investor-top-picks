---
name: swing-picks
description: Finds stocks to hold for several days to a few weeks — names with a dated catalyst landing inside that window and a technical structure that gives a defined entry and stop. Use this when the user wants picks to hold for a few days, a week or two, until earnings, until an FDA date or an index rebalance, or asks for swing trades or a 10-day horizon. It sits between day-picks (opened and closed inside one session) and top-picks (fundamentals over a month or more): unlike the first, the data this horizon needs is actually obtainable; unlike the second, the thesis is a scheduled event rather than a valuation gap.
---

# Swing Picks

Names to hold for roughly **2 to 15 sessions** — long enough that the setup is
verifiable, short enough that a dated event decides it.

`market-today` sets the tape → `day-picks` covers intraday → **`swing-picks`**
covers days to weeks → `top-picks` covers a month or more → `trading-desk`
analyses one name → `portfolio-review` judges the book.

**This is the horizon the tooling actually serves best**, and that is not an
accident: daily bars are the native resolution of both the price data reachable
here and the user's own screener, so a thesis measured in days inherits neither
the intraday data gaps nor the forecasting burden of a multi-month call.

Research scaffold, not financial advice — see Guardrails.

## Phase 0 — Frame

- **Window**: default 2–15 sessions. If the user names a date or an event, the
  window is defined by that instead.
- **Style**, in the app's vocabulary: usually `momentum`, `breakout` or
  `meanrev`. A `buffett` or `lynch` screen belongs in `top-picks` — those theses
  need quarters, not days.
- **Floor**: ~$2B market cap unless the user says otherwise.
- **Exclusions**: `python3 trading-desk/tools/deskdb.py timeline` for everything
  the desk has touched; `deskdb.py ticker <T>` before spending a slot on a name
  that may already be rated.

Establish the tape first. If `market-today` has not run in this conversation,
run it or fetch the index levels and the dominant driver — a swing position is
held *through* whatever the market does next, so the frame is not optional here
the way it nearly is for an intraday scalp.

## Phase 1 — The catalyst must have a date

This is the rule that separates this skill from the other two. **A swing
candidate needs a scheduled event inside the window.** Without one, the position
has no reason to resolve and it is a `top-picks` idea held impatiently.

Qualifying, in rough order of reliability:

| Catalyst | Why it works here |
|---|---|
| **Earnings date** | Known to the day; the single most common swing catalyst |
| **FDA / PDUFA date** | Known to the day, binary, and frequently slips — check for a delay |
| **Index rebalance or inclusion** | Purely mechanical passive flow, known in advance |
| **Investor day, capital markets day** | Guidance and targets, date published |
| **Lock-up expiry, convertible settlement** | Mechanical supply, date in the filings |
| **Scheduled regulatory or court decision** | Date known, outcome not |
| **A board meeting with a known decision** | e.g. a dividend the board re-decides annually |

Weaker, and usable only alongside one of the above: an analyst day, a
conference presentation, a product launch without a firm date.

**Source at least three independent angles**, as ever — a catalyst calendar, a
technical screen (names at breakout or at support), and a contrarian sweep
(post-event drift, an overdone reaction). Expect them to disagree. Aim for 10–20
raw names.

## Phase 2 — Verify

Everything fetched, nothing remembered.

1. **The company is what you think** — ticker, exchange, current name.
2. **Price and market cap, dated.** A price up to ~3 sessions old is acceptable
   at this horizon; beyond that, say how stale and treat it as provisional.
   *(Contrast: a day trade needs minutes, a month-horizon thesis tolerates a
   week.)*
3. **The cross-check**: `market cap ÷ shares outstanding` against the quoted
   price. Inside ~1% passes. **This rule has caught more bad data than any
   other in this project** — four wrong capitalisations in two runs on a single
   day. Run it on every name, without exception.
4. **The catalyst date, confirmed and current.** Dates slip. A PDUFA moved from
   September to December is a different trade, and finding that out is the
   point of confirming rather than assuming.
5. **Liquidity** and the cap floor.
6. **Sector cap** — no more than a third of the list from one sector.

**Discard, do not reconcile.** A figure that cannot be right is discarded with
the reason recorded, so the next run does not resurface it.

## Phase 3 — Structure: the part day-picks cannot do

At this horizon the technical levels **are** obtainable, and they are what turn
a catalyst into a position. For each survivor get, and say plainly when one
could not be sourced:

- **52-week range**, and where the price sits inside it
- **50-day and 200-day moving averages**, and the price relative to each
- **Named support and resistance** with actual levels
- **RSI** where available

Then state the three things a swing position needs:

- **Entry** — the level, and whether it is "here" or "on a pullback to X"
- **Stop** — a level *below a defined structure*, not a round number or a
  percentage. Corroboration from two independent angles (a 52-week low and a
  volume shelf a few cents apart) is much stronger than one sourced number.
- **Risk against the catalyst** — the distance to the stop, stated as a
  percentage, next to what the event could deliver

**If no stop can be placed, say so and do not manufacture one.** Prior runs
omitted a stop deliberately three times: once because the price itself could not
be established, once because the stock sat below its own 52-week low so nothing
was beneath it, once because the price was only knowable as a wide band. Each
time the omission was the honest answer and was recorded as such.

## Phase 4 — Rank, explain, hand over

Rank by **strength of evidence**, not expected return.

For each: the catalyst and its date, the verified price and cross-check, the
entry/stop/risk, and **the single thing most likely to break it**.

Consider setting a **date rather than a price** as the trigger for a second
tranche where the catalyst warrants it — a new CEO taking office, a board
meeting, an FDA decision. That construction was used once here and proved
sounder than a price trigger for an event-driven position.

The handoff, which unlike `day-picks` actually works:

> These are candidates. Paste them into the app for real relative-strength and
> fundamental scoring — daily bars are the right resolution for this horizon, so
> the score means what it says. Then run `/trading-desk` on any name whose
> thesis extends beyond the catalyst; for a pure event trade the desk's 3–6
> month frame is longer than the position.

Say what the ranking is not: a qualitative pre-screen, not the app's computed
RS and not its fundamental score.

## Phase 5 — Output

In chat: a ranked table (ticker · company · sector · price and as-of · catalyst
with date · entry/stop), the paste-ready ticker line, and which one or two
deserve a desk run.

Write the full run to `trading-desk/reports/swing-picks-<YYYY-MM-DD>.md`,
including rejected names and why. Append one line to
`trading-desk/decision-log.md` with the marker `*swing-picks*`.

**Then the feedback loop this horizon uniquely permits.** A swing call resolves
inside days, so a later run can actually check it. On each run, look back at the
previous `*swing-picks*` row and ask what the named catalyst delivered and
whether the stop held. Record the answer. A month-horizon skill cannot do this
and an intraday skill has nothing to look back at; here it is the cheapest
source of improvement available.

## Guardrails

**No date, no candidate.** A name with a good story and no scheduled event does
not belong on this list. Send it to `top-picks`.

**Confirm the date, never assume it.** Slipped catalysts are common and finding
one is a result, not a failure.

**Date every claim.** "Near its 52-week high" needs an as-of date.

**Report the search's own bias.** If three of four angles returned the same
sector or the same catalyst type, that is information about the market — say it.

**Do not pad.** Three real candidates beat eight with five unverified.

**Third-party judgements carry their interest**, and analyst actions carry a
date: a named broker with a target set before the quarter it was meant to
anticipate is stale, however well attributed.

Every report carries:

> Research scaffold, not financial or investment advice. LLM-generated analysis
> varies between runs and can be wrong. Verify independently before trading.
