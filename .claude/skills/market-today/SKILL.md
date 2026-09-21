---
name: market-today
description: Reads today's market and writes the frame the other skills work inside — index levels and breadth, the one macro driver actually moving the tape, sector rotation, and what all of it means for an intraday versus a multi-day position. Use this whenever the user asks what the market is doing, how it opened, what moved today, what the Fed or CPI or oil did, whether it is risk-on or risk-off, what is leading or lagging, or simply "what's happening"; and run it before day-picks or swing-picks whenever the tape has not already been established in this conversation. It produces a frame, not tickers — day-picks and swing-picks produce the names, trading-desk analyses one, portfolio-review judges the book.
---

# Market Today

The first step in the chain, and the only one that produces no tickers.

`market-today` establishes the tape → `day-picks` finds today's movers inside it
→ `swing-picks` finds dated catalysts → `trading-desk` analyses one name →
`portfolio-review` judges the resulting book.

It exists because every shortlist this project has produced was written against
an implicit market frame, and when that frame was wrong the names inherited the
error silently. Making the frame explicit and dated is the whole job.

Research scaffold, not financial advice — see Guardrails.

## Phase 0 — Locate yourself in the session

Before any claim about "today", establish when today is:

1. Run `date -u` and convert to ET. US cash equities open **09:30 ET** and
   close **16:00 ET**.
2. Say which regime you are in and write it at the top of the report:
   **pre-open** · **first hour** · **mid-session** · **final hour** ·
   **after the close** · **weekend or holiday**.
3. A weekend or holiday run describes the *last* session and says so in those
   words. Never describe a stale session as "today".

This matters more than it looks. A move reported at 09:45 is an opening
reaction; the same move at 15:30 is a day's verdict, and they mean opposite
things about conviction.

## Phase 1 — The tape, dated

Fetch and write down, each with its as-of time:

- **S&P 500, Nasdaq, Dow, Russell 2000** — level and change
- **Breadth** where obtainable: advancers versus decliners, new highs versus
  new lows, or equal-weight against cap-weight
- **10-year and 2-year Treasury yields**, and the dollar index
- **Oil** (Brent or WTI) and **gold**, which are the two macro prices that most
  often explain an equity move that otherwise looks unmotivated

**Breadth is the part most reports skip and the part that carries the
information.** An index up 0.6% on narrow leadership and an index up 0.6% with
the Russell leading are different tapes. Say which one this is, or say breadth
could not be sourced — never imply it from the index level.

## Phase 2 — The one thing moving it

Most days have a single dominant driver. Name it, date it, and quantify it.

Check, in this order:
1. **Scheduled macro** — CPI, PCE, payrolls, FOMC, GDP. Was something released
   today, and at what time? Get the **actual against the expected**, not just
   the actual.
2. **The Fed's current position** — the standing target range, the date of the
   last decision, the date of the next one, and what the market prices for it.
3. **A commodity or currency move** large enough to reprice sectors.
4. **A single company large enough to move its index.**

If there is genuinely no dominant driver, say so. "Quiet drift on no catalyst"
is a real and useful answer, and inventing a narrative for it is the failure
mode this phase exists to prevent.

### The lesson that produced this section

On 2026-09-07 this project recorded inflation at **4.2%** and built a whole
rotation frame on it. The verified figure was **3.4% headline, 2.4% core**. The
wrong number was carried through four runs and shaped a shortlist.

**Macro numbers get the same verification discipline as prices**: fetched, dated,
and cross-checked against a second source where possible. A macro figure that
was not fetched does not get stated.

### Data is not the reaction function

On 2026-09-11 the analysis was right that August inflation was an energy shock —
core *easing* to 2.4%, gasoline more than a third of the monthly rise — and the
Fed hiked anyway on 2026-09-16, citing persistent inflation.

**Reading the data correctly and predicting the policy response are different
tasks, and this skill only does the first.** Describe what was released and what
the market did with it. Where a decision is pending, report the **priced
probability** and its source, never a forecast of the outcome.

## Phase 3 — Rotation

What is actually being bought and sold, with numbers:

- Sector performance today, and over the last five sessions where obtainable
- **ETF flows** if sourceable — a flow reversal (outflows turning to inflows) is
  a stronger signal than a day's price move, because it is slower to reverse
- Which factor is working: value against growth, small against large, quality
  against junk, defensive against cyclical

Then state the regime in one line: **risk-on**, **risk-off**, **rotation
without direction**, or **no clear regime**.

Prefer a move you can attribute to a driver from Phase 2 over one you cannot.
An unexplained sector move is worth flagging as unexplained — it is often the
first sign the stated narrative is wrong.

## Phase 4 — The frame

Two short paragraphs, and this is the deliverable the other skills consume.

**For an intraday position**: is there enough range and volume today to trade,
or is this a quiet tape? Which sectors are in motion? Is there a scheduled event
later today that will reprice everything — an afternoon Fed decision, an
auction, a major close-of-session earnings release?

**For a multi-day position**: what is the dominant risk over the next one to ten
sessions? Name the scheduled events inside that window with their dates. Is the
current move likely to persist or to mean-revert, and say plainly which parts of
that are observation and which are judgement.

End with **what would change this read** — one or two specific, checkable
conditions. A frame that cannot be falsified is a mood, not an analysis.

## Output

In chat: the regime line, the three or four numbers that matter, the dominant
driver, and the frame. Short — this is the input to other work, not the work.

Write the full version to `trading-desk/reports/market-<YYYY-MM-DD>.md`. If a
second run happens the same day, suffix it (`-open`, `-close`) rather than
overwriting; `deskdb.py` links suffixed reports correctly.

Append one line to `trading-desk/decision-log.md` with the marker
`*market*`:

```
| 2026-09-21 | *market* | Risk-on, narrow | — | S&P +0.59%... |
```

That row is what lets a later run check whether the frame held.

## Guardrails

**Date every claim.** "Oil is rallying" is meaningless without a level and a
time. Markets move while the report is being written.

**Describe, do not predict.** This skill says what happened and what is priced.
It does not forecast the next move, and where it offers judgement it labels it
as judgement.

**Report what could not be sourced.** Breadth and flows are frequently
unobtainable through the tooling available here. An honest "breadth could not
be sourced" is worth more than an impression presented as a measurement.

**Third-party judgements carry their interest.** When citing a rating agency, a
broker or a company statement, name whose interest it serves and what it costs
them to be wrong. A target board disparaging a hostile bidder and a rating
agency publishing a downgrade are not equivalent evidence.

Every report carries:

> Research scaffold, not financial or investment advice. LLM-generated analysis
> varies between runs and can be wrong. Verify independently before trading.
